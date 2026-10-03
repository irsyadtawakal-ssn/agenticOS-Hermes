import * as THREE from 'three';

export type ScreenState = 'idle' | 'working' | 'approval' | 'error' | 'offline';

function createCanvas(width = 256, height = 160): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

/** Draws code lines on a dark IDE background */
function createCodeCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(256, 160);
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 256, 160);

  // Window header bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(8, 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(18, 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(28, 8, 3, 0, Math.PI * 2);
  ctx.fill();

  // Sidebar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 16, 24, 144);

  // Line numbers & syntax tokens
  const tokenColors = ['#38bdf8', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#94a3b8'];
  let seed = 42;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let line = 0; line < 12; line++) {
    const y = 28 + line * 10;
    // Line number
    ctx.fillStyle = '#334155';
    ctx.font = '7px monospace';
    ctx.fillText(String(line + 1).padStart(2, ' '), 6, y);

    // Code tokens
    let x = 30 + (line % 3 === 1 ? 16 : line % 4 === 2 ? 8 : 0);
    const tokenCount = 2 + Math.floor(rng() * 4);
    for (let t = 0; t < tokenCount; t++) {
      const len = 10 + Math.floor(rng() * 32);
      ctx.fillStyle = tokenColors[Math.floor(rng() * tokenColors.length)];
      ctx.fillRect(x, y - 5, len, 4);
      x += len + 4;
      if (x > 240) break;
    }
  }

  // Active terminal cursor
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(90, 138, 5, 6);

  return canvas;
}

/** Draws an amber alert screen for approval */
function createApprovalCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(256, 160);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(0, 0, 256, 160);

  // Border warning stripes
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 152);

  // Big warning sign
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚠ APPROVAL REQUIRED', 128, 60);

  ctx.fillStyle = '#fbbf24';
  ctx.font = '11px sans-serif';
  ctx.fillText('Action blocked on human input', 128, 85);

  // Button outline
  ctx.fillStyle = '#78350f';
  ctx.fillRect(68, 105, 120, 26);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(68, 105, 120, 26);
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('REVIEW IN DOCK', 128, 122);

  return canvas;
}

/** Draws an error crash / exception screen */
function createErrorCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(256, 160);
  ctx.fillStyle = '#450a0a';
  ctx.fillRect(0, 0, 256, 160);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 20);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('TASK FAILED - RUNTIME EXCEPTION', 10, 14);

  ctx.fillStyle = '#f87171';
  ctx.font = '8px monospace';
  ctx.fillText('Traceback (most recent call last):', 12, 38);
  ctx.fillText('  File "agent_executor.py", line 142', 12, 52);
  ctx.fillText('  Error: Command timeout after 60s', 12, 66);
  ctx.fillText('  Process exited with status 1', 12, 80);

  // Blinking red alert
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(12, 100, 232, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('HALTED - RETRYING...', 70, 112);

  return canvas;
}

/** Draws a dim screensaver / desktop when idle */
function createIdleCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(256, 160);
  // Deep dark blue desktop
  ctx.fillStyle = '#070c18';
  ctx.fillRect(0, 0, 256, 160);

  // Subtle grid
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 160);
    ctx.stroke();
  }
  for (let y = 0; y < 160; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // AGENTIC OS Logo
  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AGENTIC OS', 128, 75);

  ctx.fillStyle = '#475569';
  ctx.font = '9px sans-serif';
  ctx.fillText('SYSTEM READY · STANDBY', 128, 95);

  // Taskbar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 142, 256, 18);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(10, 151, 4, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/** Black powered-down screen */
function createOfflineCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(256, 160);
  ctx.fillStyle = '#020408';
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#1e293b';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NO SIGNAL', 128, 80);
  return canvas;
}

export class ScreenManager {
  private textures: Record<ScreenState, THREE.CanvasTexture | null> = {
    idle: null,
    working: null,
    approval: null,
    error: null,
    offline: null,
  };

  /** Registered monitor screen materials per agent profile */
  private profileScreens = new Map<string, THREE.MeshStandardMaterial[]>();
  private profileStates = new Map<string, ScreenState>();
  private pulseTime = 0;

  constructor() {
    this.initTextures();
  }

  private initTextures(): void {
    // Only initialize canvases if document is available
    if (typeof document === 'undefined') return;

    const mk = (canvas: HTMLCanvasElement) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    try {
      this.textures.working = mk(createCodeCanvas());
      this.textures.approval = mk(createApprovalCanvas());
      this.textures.error = mk(createErrorCanvas());
      this.textures.idle = mk(createIdleCanvas());
      this.textures.offline = mk(createOfflineCanvas());
    } catch {
      // In headless/test environments without full canvas, fail gracefully
    }
  }

  public registerScreen(profile: string, material: THREE.MeshStandardMaterial): void {
    let list = this.profileScreens.get(profile);
    if (!list) {
      list = [];
      this.profileScreens.set(profile, list);
    }
    list.push(material);

    // Apply initial idle state
    this.applyMaterialState(material, this.profileStates.get(profile) ?? 'idle');
  }

  public setAgentState(profile: string, rawState: string, hasApproval: boolean): void {
    let state: ScreenState = 'idle';
    if (hasApproval) {
      state = 'approval';
    } else if (rawState === 'error' || rawState === 'failed') {
      state = 'error';
    } else if (['working', 'thinking', 'executing'].includes(rawState)) {
      state = 'working';
    } else if (rawState === 'offline') {
      state = 'offline';
    } else {
      state = 'idle';
    }

    const prev = this.profileStates.get(profile);
    if (prev === state) return;

    this.profileStates.set(profile, state);
    const mats = this.profileScreens.get(profile);
    if (mats) {
      for (const mat of mats) {
        this.applyMaterialState(mat, state);
      }
    }
  }

  private applyMaterialState(mat: THREE.MeshStandardMaterial, state: ScreenState): void {
    const tex = this.textures[state];
    if (tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }

    switch (state) {
      case 'working':
        mat.emissive.setHex(0x0284c7);
        mat.emissiveIntensity = 0.85;
        break;
      case 'approval':
        mat.emissive.setHex(0xf59e0b);
        mat.emissiveIntensity = 1.0;
        break;
      case 'error':
        mat.emissive.setHex(0xef4444);
        mat.emissiveIntensity = 0.95;
        break;
      case 'offline':
        mat.emissive.setHex(0x020408);
        mat.emissiveIntensity = 0.05;
        break;
      case 'idle':
      default:
        mat.emissive.setHex(0x0369a1);
        mat.emissiveIntensity = 0.35;
        break;
    }
  }

  /** Update animations: code scrolling and approval pulsing */
  public update(dt: number): void {
    this.pulseTime += dt;

    // 1. Scroll working code screens slightly
    const codeTex = this.textures.working;
    if (codeTex) {
      codeTex.offset.y = (codeTex.offset.y + dt * 0.04) % 1.0;
    }

    // 2. Pulse approval screens
    const pulseFactor = 0.7 + 0.3 * Math.sin(this.pulseTime * 5);
    for (const [profile, state] of this.profileStates.entries()) {
      if (state === 'approval') {
        const mats = this.profileScreens.get(profile);
        if (mats) {
          for (const m of mats) {
            m.emissiveIntensity = pulseFactor * 1.2;
          }
        }
      }
    }
  }

  public dispose(): void {
    for (const key of Object.keys(this.textures) as ScreenState[]) {
      this.textures[key]?.dispose();
      this.textures[key] = null;
    }
    this.profileScreens.clear();
    this.profileStates.clear();
  }
}
