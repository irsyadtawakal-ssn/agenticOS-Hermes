// Adapted from AI Town's Character.tsx. See vendor/ai-town/NOTICE.md and LICENSE.
import { AnimatedSprite, BaseTexture, Container, Graphics, SCALE_MODES, Spritesheet, Text } from 'pixi.js';
import type { ISpritesheetData } from 'pixi.js';
import type { Appearance, CrewStatus } from './model.ts';
import { STATUS_COLORS } from './model.ts';
import { crewSheet } from './crewArt.ts';
export { crewSheet } from './crewArt.ts';
let sheetSequence = 0;

export async function createCrew(profile: string, appearance: Appearance, onClick: () => void) {
  const prefix = `${profile}-${++sheetSequence}`;
  const directions = ['right', 'down', 'left', 'up'];
  const data: ISpritesheetData = { frames: {}, animations: {}, meta: { scale: '1' } };
  directions.forEach((direction, row) => {
    data.animations![direction] = [];
    for (let frame = 0; frame < 4; frame++) {
      const id = `${prefix}-${direction}-${frame}`;
      data.frames[id] = { frame: { x: frame * 16, y: row * 24, w: 16, h: 24 } };
      data.animations![direction].push(id);
    }
  });
  const sheet = new Spritesheet(BaseTexture.from(crewSheet(appearance), { scaleMode: SCALE_MODES.NEAREST }), data);
  await sheet.parse();
  const root = new Container(); root.eventMode = 'static'; root.cursor = 'pointer'; root.on('pointertap', onClick);
  const ring = new Graphics(); root.addChild(ring);
  const sprite = new AnimatedSprite(sheet.animations.down); sprite.anchor.set(0.5, 0.85); sprite.scale.set(2); sprite.animationSpeed = 0.12; root.addChild(sprite);
  const label = new Text(profile.toUpperCase(), { fontFamily: 'monospace', fontSize: 10, fill: 0xdce7f6, letterSpacing: 1 });
  label.anchor.set(0.5, 0); label.y = 11; root.addChild(label);
  const bubble = new Text('', { fontFamily: 'monospace', fontSize: 12, fill: 0xffffff }); bubble.anchor.set(0.5); bubble.y = -53; root.addChild(bubble);
  let direction = 'down';
  return { root, sheet, update(orientation: number, moving: boolean, selected: boolean, status: CrewStatus) {
    const next = directions[Math.floor(orientation / 90) % 4];
    if (next !== direction) { direction = next; sprite.textures = sheet.animations[next]; }
    if (moving) sprite.play(); else sprite.gotoAndStop(0);
    ring.clear().lineStyle(selected ? 2 : 1, selected ? 0xe5fbff : STATUS_COLORS[status], selected ? 1 : 0.6).beginFill(STATUS_COLORS[status], 0.12).drawEllipse(0, 3, 20, 8).endFill();
    bubble.text = status === 'waiting' ? '!' : status === 'thinking' ? '···' : status === 'working' ? '⌨' : '';
    bubble.style.fill = STATUS_COLORS[status];
    root.alpha = status === 'offline' ? 0.55 : 1;
  }, destroy() { root.destroy({ children: true }); sheet.destroy(true); } };
}
