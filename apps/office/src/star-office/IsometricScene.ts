import Phaser from 'phaser';
import guest1 from '../starship/assets/star-office/guest_anim_1.webp';
import guest2 from '../starship/assets/star-office/guest_anim_2.webp';
import guest3 from '../starship/assets/star-office/guest_anim_3.webp';
import guest4 from '../starship/assets/star-office/guest_anim_4.webp';
import guest5 from '../starship/assets/star-office/guest_anim_5.webp';
import guest6 from '../starship/assets/star-office/guest_anim_6.webp';
import { floorToScreen } from '../starship/isometric.ts';
import { crewStatus, consoleFootprint, motionPath, ROOMS, route, roomDoor, standbyPosition, workPosition, STATUS_LABELS, STATUS_COLORS } from '../starship/model.ts';
import type { CrewStatus, Footprint } from '../starship/model.ts';
import { PROFILES } from '../hermes/labels.ts';
import { shell } from '../shell/store.ts';
import { pathPosition } from '../../vendor/ai-town/geometry.ts';
import type { Path, Point } from '../../vendor/ai-town/types.ts';
import { walkingTarget } from './isoMotion.ts';

export const NATIVE_SKINS = [guest1, guest2, guest3, guest4, guest5, guest6];
type Actor = { profile: string; point: Point; destination: Point; path: Path; status: CrewStatus;
  sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; shadow: Phaser.GameObjects.Ellipse;
  idleAt: number; wander: number; manual: Point | null; manualUntil: number; lastClick: number; moving: boolean };

export async function mountIsometric(host: HTMLElement, skins: Record<string, number>,
  onSelect: (profile: string) => void, onChat: (profile: string) => void, onMotion: (profile: string, moving: boolean) => void) {
  let ready!: () => void, fail!: (error: Error) => void;
  const loaded = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  const actors = new Map<string, Actor>();
  let scene: Phaser.Scene, focus = 'chief', zoom = 1, panX = 0, panY = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bounds = { left: 200, right: 1440, top: 260, bottom: 875 };
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  let destinationRing: Phaser.GameObjects.Ellipse;
  function fit() {
    if (!scene?.sys.isActive()) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const scale = Math.min((w - 30) / (bounds.right - bounds.left), (h - 55) / (bounds.bottom - bounds.top)) * zoom;
    scene.cameras.main.setZoom(scale).centerOn(center.x - panX / scale, center.y - panY / scale);
  }
  class IsoDeck extends Phaser.Scene {
    preload() {
      NATIVE_SKINS.forEach((url, i) => this.load.spritesheet('native-' + i, url, { frameWidth: 32, frameHeight: 32 }));
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => fail(new Error('Aset karakter gagal dimuat.')));
    }
    create() {
      scene = this;
      const poly = (g: Phaser.GameObjects.Graphics, p: Point[], color: number, alpha = 1) => g.fillStyle(color, alpha).fillPoints(p, true);
      const floor = (g: Phaser.GameObjects.Graphics, r: Footprint, color: number, height = 0, alpha = 1) => {
        poly(g, [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }].map(p => floorToScreen(p, height)), color, alpha);
      };
      const box = (r: Footprint, height: number, top: number, left: number, right: number) => {
        const g = this.add.graphics().setDepth(r.x + r.w + r.y + r.h);
        const b = { x: r.x + r.w, y: r.y }, c = { x: r.x + r.w, y: r.y + r.h }, d = { x: r.x, y: r.y + r.h };
        floor(g, { x: r.x + 4, y: r.y + 4, w: r.w, h: r.h }, 0x000000, 0, 0.2);
        poly(g, [floorToScreen(d), floorToScreen(c), floorToScreen(c, height), floorToScreen(d, height)], left);
        poly(g, [floorToScreen(b), floorToScreen(c), floorToScreen(c, height), floorToScreen(b, height)], right);
        floor(g, r, top, height);
        return g;
      };
      // A floating cutaway deck: raised hull, diamond tiles and open front walls.
      const hull = this.add.graphics().setDepth(-10);
      const outline = [{ x: 420, y: 84 }, { x: 780, y: 84 }, { x: 804, y: 300 }, { x: 1092, y: 300 }, { x: 1092, y: 708 }, { x: 780, y: 708 }, { x: 780, y: 660 }, { x: 420, y: 660 }, { x: 420, y: 708 }, { x: 108, y: 708 }, { x: 108, y: 300 }, { x: 396, y: 300 }];
      poly(hull, outline.map(p => floorToScreen(p, -22)), 0x20334d);
      poly(hull, outline.map(p => floorToScreen(p)), 0x52697c);
      for (const r of [{ x: 408, y: 288, w: 384, h: 168 }, { x: 408, y: 456, w: 24, h: 240 }, { x: 768, y: 456, w: 24, h: 240 }]) floor(hull, r, 0x788896);
      for (const room of ROOMS) {
        floor(hull, room, 0x364a60);
        for (let x = room.x + 24; x < room.x + room.w - 24; x += 24)
          for (let y = room.y + 24; y < room.y + room.h - 24; y += 24)
            floor(hull, { x: x + 1, y: y + 1, w: 22, h: 22 }, ((x + y) / 24) % 2 ? 0x5b7084 : 0x637b90);
        const door = roomDoor(room);
        const sides = [{ x: room.x, y: room.y, w: room.w, h: 24 }, { x: room.x, y: room.y + room.h - 24, w: room.w, h: 24 },
          { x: room.x, y: room.y + 24, w: 24, h: room.h - 48 }, { x: room.x + room.w - 24, y: room.y + 24, w: 24, h: room.h - 48 }];
        sides.forEach((side, index) => {
          const horizontal = side.w > side.h, length = horizontal ? side.w : side.h;
          for (let offset = 0; offset < length; offset += 24) {
            const r = horizontal ? { ...side, x: side.x + offset, w: Math.min(24, length - offset) }
              : { ...side, y: side.y + offset, h: Math.min(24, length - offset) };
            if (r.x < door.x + door.w && r.x + r.w > door.x && r.y < door.y + door.h && r.y + r.h > door.y) continue;
            box(r, index === 0 || index === 2 ? 65 : 12, room.color, 0x324860, 0x25364e);
          }
        });
        floor(hull, door, room.color);
        const p = floorToScreen({ x: room.x + room.w / 2, y: room.y + 42 });
        this.add.text(p.x, p.y, room.name, { fontFamily: 'monospace', fontSize: '11px', color: '#dbf7ff', stroke: '#172c40', strokeThickness: 3 }).setOrigin(0.5).setDepth(2500);
      }
      for (const profile of PROFILES) {
        const r = consoleFootprint(profile);
        const desk = box(r, 26, 0xbf936a, 0x83613f, 0x614c3b);
        floor(desk, { x: r.x + 4, y: r.y + 22, w: 26, h: 7 }, 0x29384c, 27);
        box({ x: r.x + 4, y: r.y + 3, w: r.w - 8, h: 8 }, 48, 0x152b45, 0x58cbd5, 0x29475e);
        const plant = floorToScreen({ x: r.x + r.w - 7, y: r.y + 26 }, 31);
        this.add.ellipse(plant.x, plant.y + 2, 8, 7, 0xe0b395).setDepth(r.x + r.w + r.y + r.h + 1);
        this.add.ellipse(plant.x, plant.y - 6, 11, 15, 0x79bc91).setStrokeStyle(1, 0xadd5a2).setDepth(r.x + r.w + r.y + r.h + 2);
        const chair = workPosition(profile);
        box({ x: chair.x - 9, y: chair.y - 8, w: 18, h: 16 }, 12, 0x607088, 0x3b4960, 0x2b384d);
      }
      // Furniture footprints below are shared with the collision grid.
      box({ x: 168, y: 600, w: 144, h: 36 }, 23, 0x9f92af, 0x655c7d, 0x534767);
      box({ x: 168, y: 600, w: 144, h: 8 }, 39, 0xc4b9cf, 0x8d7ea7, 0x716489);
      box({ x: 696, y: 528, w: 48, h: 72 }, 55, 0x56ddbd, 0x224957, 0x183840);
      for (let n = 0; n < 3; n++) {
        const p = floorToScreen({ x: 720, y: 564 }, 18 + n * 15);
        this.add.ellipse(p.x, p.y, 40, 13, 0x74ffe0, 0.3).setStrokeStyle(2, 0x7affd6).setDepth(1360);
      }
      // Transparent raised rail across the command window.
      const window = this.add.graphics().setDepth(1000);
      poly(window, [{ x: 468, y: 120 }, { x: 744, y: 120 }, { x: 744, y: 120 }, { x: 468, y: 120 }].map((p, i) => floorToScreen(p, i < 2 ? 72 : 28)), 0x83dfff, 0.25);
      for (let i = 0; i < 6; i++) this.anims.create({ key: 'native-walk-' + i, frames: this.anims.generateFrameNumbers('native-' + i, { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
      const now = performance.now(), state = shell.getState();
      PROFILES.forEach((profile, index) => {
        const point = standbyPosition(index), p = floorToScreen(point), skin = skins[profile] ?? index % 6;
        const shadow = this.add.ellipse(p.x, p.y, 32, 12, 0x08121e, 0.3);
        const sprite = this.add.sprite(p.x, p.y, 'native-' + skin, 0).setOrigin(0.5, 1).setScale(1.9).setInteractive({ useHandCursor: true });
        const label = this.add.text(p.x, p.y - 67, profile, { fontFamily: 'monospace', fontSize: '12px', color: '#f0f6ff', stroke: '#08121f', strokeThickness: 4 }).setOrigin(0.5).setDepth(3000);
        const actor: Actor = { profile, point, destination: point, path: [], status: crewStatus(profile, state.agents, state.approvals), sprite, shadow, label, idleAt: now + 1800 + index * 600, wander: index, manual: null, manualUntil: 0, lastClick: -1000, moving: false };
        actors.set(profile, actor);
        sprite.on('pointerdown', () => {
          const t = performance.now(); focus = profile; onSelect(profile);
          onMotion(profile, actor.moving);
          if (t - actor.lastClick < 350) onChat(profile);
          actor.lastClick = t;
        });
      });
      destinationRing = this.add.ellipse(0, 0, 28, 14).setStrokeStyle(2, 0x83eddf).setVisible(false).setDepth(3000);
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
        if (!pointer.leftButtonDown() || objects.length) return;
        const actor = actors.get(focus)!;
        const target = walkingTarget({ x: pointer.worldX, y: pointer.worldY }, actor.point);
        if (!target) { shell.showToast('Pilih lantai terbuka; jalur ini terhalang dinding atau furnitur.'); return; }
        actor.manual = target; actor.manualUntil = performance.now() + 30000;
        const p = floorToScreen(target); destinationRing.setPosition(p.x, p.y).setVisible(true);
      });
      this.input.mouse?.disableContextMenu();
      this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown[], _x: number, dy: number) => { zoom = Phaser.Math.Clamp(zoom - dy * 0.001, 0.6, 2.5); fit(); });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown && (p.rightButtonDown() || p.middleButtonDown())) { panX += p.x - p.prevPosition.x; panY += p.y - p.prevPosition.y; fit(); } });
      this.scale.on('resize', fit); fit(); ready();
    }
    update() {
      const now = performance.now(), state = shell.getState();
      for (const [index, profile] of PROFILES.entries()) {
        const actor = actors.get(profile); if (!actor) continue;
        const status = crewStatus(profile, state.agents, state.approvals);
        if (status !== actor.status) { actor.manual = null; actor.status = status; }
        const active = ['working', 'thinking', 'waiting', 'error'].includes(status);
        let target = actor.destination;
        if (actor.manual && now < actor.manualUntil) target = actor.manual;
        else if (active) target = workPosition(profile);
        else if (status === 'offline') target = standbyPosition(index);
        else if (now > actor.idleAt && !actor.path.length && !reduced.matches) {
          actor.wander = (actor.wander + 3) % PROFILES.length;
          target = standbyPosition(actor.wander); actor.idleAt = now + 7000 + index * 270;
        }
        if (target.x !== actor.destination.x || target.y !== actor.destination.y) {
          actor.destination = target; actor.path = motionPath(route(actor.point, target), now);
          if (reduced.matches) { actor.point = target; actor.path = []; }
        }
        let moving = false;
        if (actor.path.length > 1) {
          const location = pathPosition(actor.path, now); actor.point = location.position; moving = location.velocity > 0;
          if (location.facing.dx !== location.facing.dy) actor.sprite.setFlipX(location.facing.dx < location.facing.dy);
          if (now >= actor.path.at(-1)![4]) actor.path = [];
        }
        if (moving !== actor.moving) { actor.moving = moving; if (focus === profile) onMotion(profile, moving); }
        const p = floorToScreen(actor.point), skin = skins[profile] ?? index % 6;
        actor.sprite.setPosition(p.x, p.y).setDepth(actor.point.x + actor.point.y).setAlpha(status === 'offline' ? 0.4 : 1);
        if (moving && !reduced.matches) actor.sprite.play('native-walk-' + skin, true);
        else { actor.sprite.stop(); actor.sprite.setFrame(0); }
        actor.shadow.setPosition(p.x, p.y - 1).setDepth(actor.point.x + actor.point.y - 1);
        actor.label.setPosition(p.x, p.y - 68).setText(profile + (focus === profile ? '\n' + STATUS_LABELS[status] : '')).setColor('#' + STATUS_COLORS[status].toString(16).padStart(6, '0'));
        actor.label.setVisible(focus === profile || active);
        actor.sprite.setTint(focus === profile ? 0xffffff : 0xe9f3ff);
        if (actor.manual && Math.hypot(actor.point.x - actor.manual.x, actor.point.y - actor.manual.y) < 2 && focus === profile) destinationRing.setVisible(false);
      }
    }
  }
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: host.clientWidth || 1000, height: host.clientHeight || 650,
    transparent: true, pixelArt: true, scale: { mode: Phaser.Scale.RESIZE }, scene: IsoDeck, audio: { noAudio: true } });
  try { await loaded; } catch (error) { game.destroy(true); throw error; }
  return { select(profile: string) { if (actors.has(profile)) { focus = profile; onMotion(profile, actors.get(profile)!.moving); } },
    skin(profile: string, index: number) { skins[profile] = index; actors.get(profile)?.sprite.setTexture('native-' + index, 0); },
    zoomBy(amount: number) { zoom = Phaser.Math.Clamp(zoom + amount, 0.6, 2.5); fit(); },
    reset() { zoom = 1; panX = panY = 0; fit(); }, destroy() { game.destroy(true); } };
}
