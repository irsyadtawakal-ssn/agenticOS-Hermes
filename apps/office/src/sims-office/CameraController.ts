import * as THREE from 'three';
import { simsAudio } from './SimsAudio.ts';

export class CameraController {
  public camera: THREE.OrthographicCamera;
  public target: THREE.Vector3;
  private currentTarget: THREE.Vector3;

  // Isometric angle in radians around Y
  private currentAzimuth: number;
  private targetAzimuth: number;
  private elevation: number = Math.PI / 5.5; // ~32.7 degrees isometric tilt
  private distance: number = 38;

  // Zoom / Frustum size (Default closer zoom to admire character details)
  public frustumSize: number = 12;
  private targetFrustumSize: number = 12;
  private minFrustumSize: number = 6;
  private maxFrustumSize: number = 24;

  // Discrete 4 angles: 0 = 45°, 1 = 135°, 2 = 225°, 3 = 315°
  private angleIndex: number = 0;

  // Mouse interaction state
  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };
  private container: HTMLElement;

  constructor(container: HTMLElement, aspect: number) {
    this.container = container;
    this.target = new THREE.Vector3(0, 0, 0);
    this.currentTarget = new THREE.Vector3(0, 0, 0);

    // Initial angle: 45 degrees (looking from South-East)
    this.angleIndex = 0;
    this.currentAzimuth = Math.PI / 4;
    this.targetAzimuth = Math.PI / 4;

    const halfW = (this.frustumSize * aspect) / 2;
    const halfH = this.frustumSize / 2;

    this.camera = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      -50,
      100
    );

    this.updateCameraPosition();
    this.bindEvents();
  }

  public getAngleIndex(): number {
    return this.angleIndex;
  }

  public rotateLeft(): void {
    this.angleIndex = (this.angleIndex + 1) % 4;
    this.targetAzimuth += Math.PI / 2;
    simsAudio.playRotate();
  }

  public rotateRight(): void {
    this.angleIndex = (this.angleIndex + 3) % 4;
    this.targetAzimuth -= Math.PI / 2;
    simsAudio.playRotate();
  }

  public zoomIn(): void {
    this.targetFrustumSize = Math.max(this.minFrustumSize, this.targetFrustumSize - 3);
  }

  public zoomOut(): void {
    this.targetFrustumSize = Math.min(this.maxFrustumSize, this.targetFrustumSize + 3);
  }

  public focusOn(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.targetFrustumSize = 12; // Zoom in slightly for focus
  }

  public resetView(): void {
    this.target.set(0, 0, 0);
    this.targetFrustumSize = 18;
  }

  public handleResize(aspect: number): void {
    const halfW = (this.frustumSize * aspect) / 2;
    const halfH = this.frustumSize / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number, aspect: number): void {
    const lerpSpeed = Math.min(1.0, dt * 6);

    // Smooth azimuth rotation
    this.currentAzimuth += (this.targetAzimuth - this.currentAzimuth) * lerpSpeed;

    // Smooth target pan
    this.currentTarget.lerp(this.target, lerpSpeed);

    // Smooth zoom
    if (Math.abs(this.targetFrustumSize - this.frustumSize) > 0.01) {
      this.frustumSize += (this.targetFrustumSize - this.frustumSize) * lerpSpeed;
      this.handleResize(aspect);
    }

    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    const cosElev = Math.cos(this.elevation);
    const sinElev = Math.sin(this.elevation);

    const x = this.currentTarget.x + this.distance * cosElev * Math.sin(this.currentAzimuth);
    const y = this.currentTarget.y + this.distance * sinElev;
    const z = this.currentTarget.z + this.distance * cosElev * Math.cos(this.currentAzimuth);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.currentTarget);
  }

  private bindEvents(): void {
    const onMouseDown = (e: MouseEvent) => {
      // Right-click or middle-click drags to pan
      if (e.button === 1 || e.button === 2) {
        this.isDragging = true;
        this.previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      // Pan camera in ground plane relative to camera azimuth
      const factor = (this.frustumSize / this.container.clientHeight) * 1.2;
      const cosA = Math.cos(this.currentAzimuth);
      const sinA = Math.sin(this.currentAzimuth);

      // Move along camera right and up/forward vectors
      const panX = (-deltaX * cosA + deltaY * sinA) * factor;
      const panZ = (deltaX * sinA + deltaY * cosA) * factor;

      this.target.x += panX;
      this.target.z += panZ;

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) {
        this.isDragging = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        this.zoomOut();
      } else {
        this.zoomIn();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting input if typing in chat
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'q' || e.key === 'Q') {
        this.rotateLeft();
      } else if (e.key === 'e' || e.key === 'E') {
        this.rotateRight();
      } else if (e.key === '+' || e.key === '=') {
        this.zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        this.zoomOut();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    this.container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    this.container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    this.container.addEventListener('contextmenu', onContextMenu);
  }
}
