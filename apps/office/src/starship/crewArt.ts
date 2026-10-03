import type { Appearance } from './model.ts';

export function crewSheet(appearance: Appearance): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 96;
  const c = canvas.getContext('2d')!;
  const directions = ['right', 'down', 'left', 'up'];
  directions.forEach((direction, row) => {
    for (let frame = 0; frame < 4; frame++) {
      c.save(); c.translate(frame * 16, row * 24);
      const step = frame % 2;
      c.fillStyle = '#101827'; c.fillRect(4, 19, 3, 4 - step); c.fillRect(9, 19, 3, 3 + step);
      c.fillStyle = appearance.uniform; c.fillRect(3, 10, 10, 9); c.fillRect(1, 11 + step, 2, 6); c.fillRect(13, 12 - step, 2, 6);
      c.fillStyle = '#dceaf5'; c.fillRect(4, 12, 2, 2); c.fillStyle = '#243147'; c.fillRect(3, 17, 10, 2);
      c.fillStyle = appearance.skin; c.fillRect(4, 3, 8, 8); c.fillRect(1, 17 + step, 2, 2); c.fillRect(13, 17 - step, 2, 2);
      if (appearance.hairstyle !== 'bald') {
        c.fillStyle = appearance.hair; c.fillRect(3, 1, 10, 4); c.fillRect(direction === 'left' ? 10 : 3, 4, 3, 3);
        if (appearance.hairstyle === 'long') { c.fillRect(3, 4, 2, 8); c.fillRect(11, 4, 2, 8); }
        if (direction === 'up') c.fillRect(4, 4, 8, 6);
      }
      if (direction !== 'up') {
        c.fillStyle = '#172132'; c.fillRect(direction === 'left' ? 4 : 7, 6, 1, 2); c.fillRect(direction === 'right' ? 10 : 9, 6, 1, 2);
      }
      if (appearance.headset) { c.fillStyle = '#546a84'; c.fillRect(2, 4, 2, 5); c.fillStyle = '#66f0e0'; c.fillRect(2, 7, 2, 2); }
      c.restore();
    }
  });
  return canvas;
}
