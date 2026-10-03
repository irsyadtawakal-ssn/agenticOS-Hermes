import * as THREE from 'three';
import { CameraController } from './CameraController.ts';
import { WallManager } from './WallManager.ts';
import type { WallDisplayMode } from './WallManager.ts';
import { RoomBuilder } from './RoomBuilder.ts';
import { SimsAgent } from './SimsAgent.ts';
import { PROFILES } from '../hermes/labels.ts';
import { IDLE_ANCHORS, isWalkable } from './NavigationMesh.ts';
import { simsAudio } from './SimsAudio.ts';
import { Environment } from './Environment.ts';
import type { TimeMode } from './Environment.ts';
import { Exterior } from './Exterior.ts';
import { AnchorRegistry } from './AnchorRegistry.ts';

import { ScreenManager } from './ScreenStates.ts';
import { DecorManager } from './DecorManager.ts';
import { simsAmbience } from './SimsAmbience.ts';
import type { ThoughtIcon } from './ThoughtBubble.ts';

export interface SimsSceneCallbacks {
  onSelectAgent: (profile: string) => void;
  onOpenChat: (profile: string) => void;
  onOpenKanban: () => void;
  onToast: (msg: string) => void;
  onBuildModeChange?: (active: boolean) => void;
}

export class SimsScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private cameraCtrl: CameraController;
  private wallManager: WallManager;
  private roomBuilder: RoomBuilder;
  private environment: Environment;
  private exterior: Exterior;
  private screenManager: ScreenManager;
  private decorManager: DecorManager;
  private agents: Map<string, SimsAgent> = new Map();
  private anchors = new AnchorRegistry();
  private selectedProfile: string = 'chief';
  private callbacks: SimsSceneCallbacks;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Animation Loop
  private animFrameId: number = 0;
  private lastTime: number = 0;
  private speedMultiplier: number = 1.0;
  private isDestroyed: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  private onKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, callbacks: SimsSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Scene & Background
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x93cff8); // Sky; driven by Environment

    // 2. Camera Controller
    const aspect = container.clientWidth / (container.clientHeight || 1);
    this.cameraCtrl = new CameraController(container, aspect);

    // 3. Wall Manager
    this.wallManager = new WallManager();

    // 4. Renderer with Shadows and Tone Mapping
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    // 5. Day/night lighting, then Room & Furniture, then the outdoor lot
    this.environment = new Environment(this.scene, this.renderer);
    this.roomBuilder = new RoomBuilder(this.scene, this.wallManager, this.environment);
    this.roomBuilder.build();

    // 5b. Monitor Screen State Manager (#10)
    this.screenManager = new ScreenManager();
    for (const [profile, mats] of this.roomBuilder.deskScreens.entries()) {
      for (const m of mats) {
        this.screenManager.registerScreen(profile, m);
      }
    }

    // 5c. Movable Decor Manager & Build/Buy Mode (#12)
    this.decorManager = new DecorManager(this.scene, this.environment);
    this.decorManager.setOnLayoutChange(() => {
      this.callbacks.onBuildModeChange?.(this.decorManager.isBuildMode());
    });
    this.decorManager.spawnAll();

    this.exterior = new Exterior(this.scene, this.environment);

    // 6. Spawn Agents
    for (const profile of PROFILES) {
      const agent = new SimsAgent(profile, this.scene, this.anchors);
      this.agents.set(profile, agent);
    }

    // Set initial Plumbob focus on Chief
    this.selectAgent('chief');

    // Debug / screenshot helpers: ?simsTime=morning|noon|evening|night|live, ?simsOverview=1
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('simsTime') as TimeMode | null;
      if (t && ['live', 'morning', 'noon', 'evening', 'night'].includes(t)) this.environment.setMode(t);
      if (params.get('simsOverview')) {
        this.cameraCtrl.resetView();
        this.cameraCtrl.zoomOut();
        this.cameraCtrl.zoomOut();
      }
      if (params.get('simsBuild')) {
        this.setBuildMode(true);
      }
      const focus = params.get('simsFocus');
      if (focus) {
        const [fx, fz] = focus.split(',').map(Number);
        if (!isNaN(fx) && !isNaN(fz)) {
          this.cameraCtrl.focusOn(fx, fz);
        }
      }
    } catch {
      // ignore (non-browser)
    }

    // 7. Event Bindings
    this.bindPointerEvents();
    this.setupResizeObserver();

    // 8. Start Render Loop
    this.lastTime = performance.now();
    this.renderLoop = this.renderLoop.bind(this);
    this.animFrameId = requestAnimationFrame(this.renderLoop);
  }

  public getWallMode(): WallDisplayMode {
    return this.wallManager.getMode();
  }

  public cycleWallMode(): WallDisplayMode {
    const next = this.wallManager.cycleMode();
    simsAudio.playClick();
    return next;
  }

  public getTimeLabel(): string {
    return this.environment.getLabel();
  }

  public getTimeMode(): TimeMode {
    return this.environment.getMode();
  }

  public cycleTimeMode(): TimeMode {
    simsAudio.playClick();
    return this.environment.cycleMode();
  }

  public rotateLeft(): void {
    this.cameraCtrl.rotateLeft();
  }

  public rotateRight(): void {
    this.cameraCtrl.rotateRight();
  }

  public zoomIn(): void {
    this.cameraCtrl.zoomIn();
    simsAudio.playClick();
  }

  public zoomOut(): void {
    this.cameraCtrl.zoomOut();
    simsAudio.playClick();
  }

  public resetView(): void {
    this.cameraCtrl.resetView();
    simsAudio.playClick();
  }

  public selectAgent(profile: string, smoothFocus: boolean = true): void {
    this.selectedProfile = profile;
    if (profile === 'all') {
      for (const agent of this.agents.values()) {
        agent.plumbob.setVisible(true);
      }
      if (smoothFocus) {
        this.cameraCtrl.focusOn(0, 0);
      }
      this.callbacks.onSelectAgent(profile);
      return;
    }
    for (const [p, agent] of this.agents.entries()) {
      // Plumbob is highlighted above selected agent
      agent.plumbob.setVisible(p === profile);
    }
    if (smoothFocus) {
      const targetAgent = this.agents.get(profile);
      if (targetAgent) {
        this.cameraCtrl.focusOn(targetAgent.currentPos.x, targetAgent.currentPos.z);
      }
    }
    this.callbacks.onSelectAgent(profile);
  }

  public broadcastThought(icon: ThoughtIcon = 'chat', targets?: string[]): void {
    const list = targets && targets.length > 0 ? targets : Array.from(this.agents.keys());
    for (const p of list) {
      const agent = this.agents.get(p);
      if (agent) {
        agent.showThought(icon);
      }
    }
  }

  public updateLiveStates(
    agentsList: Array<{ profile: string; state: string }>,
    approvalsList: Array<{ profile: string; status: string }>
  ): void {
    const agentsMap = Object.fromEntries(agentsList.map((a) => [a.profile, a.state]));
    const pendingApprovalSet = new Set(
      approvalsList.filter((a) => a.status === 'pending').map((a) => a.profile)
    );

    for (const [profile, agent] of this.agents.entries()) {
      const status = agentsMap[profile] ?? 'idle';
      const hasApproval = pendingApprovalSet.has(profile);
      agent.updateLiveStatus(status, hasApproval);
      this.screenManager.setAgentState(profile, status, hasApproval);
    }
  }

  public getDecorManager(): DecorManager {
    return this.decorManager;
  }

  public isBuildMode(): boolean {
    return this.decorManager.isBuildMode();
  }

  public setBuildMode(enabled: boolean): void {
    this.decorManager.setBuildMode(enabled);
    this.callbacks.onBuildModeChange?.(enabled);
  }

  public isMusicEnabled(): boolean {
    return simsAmbience.isMusicEnabled();
  }

  public toggleMusic(): boolean {
    return simsAmbience.toggleMusic();
  }

  public getSpeed(): number {
    return this.speedMultiplier;
  }

  public setSpeed(speed: number): void {
    this.speedMultiplier = Math.max(0, Math.min(speed, 3));
    simsAudio.playBubbleClick();
  }

  private bindPointerEvents(): void {
    const updateRaycasterFromEvent = (e: MouseEvent) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.cameraCtrl.camera);
    };

    const onPointerMove = (e: MouseEvent) => {
      if (this.decorManager.isBuildMode()) {
        updateRaycasterFromEvent(e);
        this.decorManager.handlePointerMove(this.raycaster);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!this.decorManager.isBuildMode()) return;

      if (e.key === 'r' || e.key === 'R') {
        this.decorManager.rotateCurrent();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.decorManager.deleteCurrent();
      } else if (e.key === 'Escape') {
        this.decorManager.selectItem(null);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      // Only handle left-click for object interaction
      if (e.button !== 0) return;

      updateRaycasterFromEvent(e);

      // In Build/Buy mode, prioritize placing/moving/selecting furniture
      if (this.decorManager.isBuildMode()) {
        const handled = this.decorManager.handlePointerDown(this.raycaster);
        if (handled) return;
      }

      // 1. Check Raycast on Agents
      const agentClickables: THREE.Object3D[] = [];
      const meshToProfile = new Map<THREE.Object3D, string>();
      for (const [profile, agent] of this.agents.entries()) {
        agentClickables.push(agent.clickMesh);
        meshToProfile.set(agent.clickMesh, profile);
      }

      const agentHits = this.raycaster.intersectObjects(agentClickables, false);
      if (agentHits.length > 0) {
        const hitProfile = meshToProfile.get(agentHits[0].object);
        if (hitProfile) {
          simsAudio.playSelectSim();
          this.selectAgent(hitProfile, true);
          this.callbacks.onToast(`Sims: ${hitProfile} dipilih`);
          return;
        }
      }

      // 2. Check Raycast on Interactive Furniture
      const furnitureMeshes = this.roomBuilder.interactiveObjects.map((io) => io.mesh);
      const furnitureHits = this.raycaster.intersectObjects(furnitureMeshes, true);

      if (furnitureHits.length > 0) {
        const topHit = furnitureHits[0];
        // Match interactive object
        const io = this.roomBuilder.interactiveObjects.find((item) => {
          let cur: THREE.Object3D | null = topHit.object;
          while (cur) {
            if (cur === item.mesh) return true;
            cur = cur.parent;
          }
          return false;
        });

        if (io) {
          if (io.type === 'desk' && io.id) {
            simsAudio.playClick();
            this.selectAgent(io.id, true);
            this.callbacks.onOpenChat(io.id);
            return;
          } else if (io.type === 'coffee') {
            const activeAgent = this.agents.get(this.selectedProfile);
            if (activeAgent) {
              const coffeeSpot = IDLE_ANCHORS.find((a) => a.activity === 'coffee' && activeAgent.canUse(a));
              if (coffeeSpot && activeAgent.goToAnchor(coffeeSpot)) {
                this.callbacks.onToast(`${this.selectedProfile} sedang pergi ke mesin kopi…`);
              } else {
                this.callbacks.onToast('Mesin kopi lagi dipakai, coba sebentar lagi ☕');
              }
            }
            return;
          } else if (io.type === 'meeting') {
            simsAudio.playClick();
            this.callbacks.onOpenKanban();
            return;
          } else if (io.type === 'floor') {
            // Floor click: Send selected agent to location ("Go Here")
            const pt = topHit.point;
            if (isWalkable(pt.x, pt.z)) {
              const activeAgent = this.agents.get(this.selectedProfile);
              if (activeAgent) {
                simsAudio.playClick();
                activeAgent.walkTo({ x: pt.x, z: pt.z });
                this.callbacks.onToast(`Pergi ke lokasi (${pt.x.toFixed(1)}, ${pt.z.toFixed(1)})`);
              }
            }
          }
        }
      }
    };

    this.container.addEventListener('click', onPointerDown);
    this.container.addEventListener('mousemove', onPointerMove);
    this.onKeyDownHandler = onKeyDown;
    window.addEventListener('keydown', this.onKeyDownHandler);
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDestroyed) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.renderer.setSize(w, h);
        this.cameraCtrl.handleResize(w / h);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private renderLoop(timestamp: number): void {
    if (this.isDestroyed) return;

    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    const aspect = this.container.clientWidth / (this.container.clientHeight || 1);

    // Update Camera
    this.cameraCtrl.update(dt, aspect);

    // Simulation delta time scaled by speedMultiplier
    const simDt = dt * this.speedMultiplier;

    // Update Wall Cutaway Mode based on Camera Azimuth
    this.wallManager.update(this.cameraCtrl.getAngleIndex(), dt);

    // World: sun/sky/lamps and street traffic
    this.environment.update(simDt);
    this.exterior.update(simDt);

    // Update Screens Animation (#10)
    this.screenManager.update(simDt);

    // Update Agents
    const nowSec = timestamp / 1000;
    let workingCount = 0;
    for (const agent of this.agents.values()) {
      agent.update(nowSec, simDt);
      if (['working', 'thinking', 'executing'].includes(agent.liveStatus)) {
        workingCount++;
      }
    }

    // Update Ambience Audio (#11)
    const nightFactor = this.environment.getNightFactor();
    simsAmbience.update(dt, workingCount, nightFactor);

    // Render Scene
    this.renderer.render(this.scene, this.cameraCtrl.camera);

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  }

  public destroy(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();

    for (const agent of this.agents.values()) {
      agent.destroy();
    }
    this.agents.clear();

    this.screenManager.dispose();
    this.decorManager.destroy();

    if (this.onKeyDownHandler) {
      window.removeEventListener('keydown', this.onKeyDownHandler);
      this.onKeyDownHandler = null;
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
