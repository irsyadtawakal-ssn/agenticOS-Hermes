import * as THREE from 'three';

export type ThoughtIcon = 'coffee' | 'code' | 'search' | 'idea' | 'approval' | 'chat' | 'rest';

const EMOJI_MAP: Record<ThoughtIcon, string> = {
  coffee: '☕',
  code: '💻',
  search: '🔍',
  idea: '💡',
  approval: '⚠️',
  chat: '💬',
  rest: '🎵',
};

/**
 * Creates a canvas-based billboard thought bubble sprite
 */
function createBubbleTexture(icon: ThoughtIcon): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Clear transparent
  ctx.clearRect(0, 0, 128, 128);

  // Outer bubble shadow / glow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  // Draw cloud-like thought bubble
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 52, 42, 0, Math.PI * 2);
  ctx.fill();

  // Little thought dots trailing downward
  ctx.beginPath();
  ctx.arc(42, 100, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(32, 116, 5, 0, Math.PI * 2);
  ctx.fill();

  // Draw emoji in center
  ctx.shadowColor = 'transparent';
  ctx.font = '48px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(EMOJI_MAP[icon] ?? '💡', 64, 52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ThoughtBubble {
  public sprite: THREE.Sprite;
  private texture: THREE.CanvasTexture;
  private age: number = 0;
  private maxAge: number = 4.5; // seconds
  private initialY: number;

  constructor(icon: ThoughtIcon, initialY: number = 2.8) {
    this.initialY = initialY;
    this.texture = createBubbleTexture(icon);

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(0.85, 0.85, 1);
    this.sprite.position.y = initialY;
  }

  public update(dt: number): boolean {
    this.age += dt;

    // Fade in
    if (this.age < 0.3) {
      this.sprite.material.opacity = this.age / 0.3;
    } else if (this.age > this.maxAge - 0.5) {
      // Fade out
      this.sprite.material.opacity = Math.max(0, (this.maxAge - this.age) / 0.5);
    } else {
      this.sprite.material.opacity = 1.0;
    }

    // Gentle upward float
    this.sprite.position.y = this.initialY + (this.age / this.maxAge) * 0.25;

    return this.age < this.maxAge;
  }

  public destroy(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
