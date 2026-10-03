import Phaser from 'phaser';
import deckUrl from './assets/odyssey-deck.png';
import { createGuestRenderer } from '../../vendor/star-office/guestRenderer.js';
import type { Visitor } from '../../vendor/star-office/guestRenderer.js';
import { pathPosition, orientationDegrees } from '../../vendor/ai-town/geometry.ts';
import type { Path, Point } from '../../vendor/ai-town/types.ts';
import { crewSheet } from './crewArt.ts';
import { crewStatus, motionPath, STATUS_COLORS, STATUS_LABELS } from './model.ts';
import type { Appearance, CrewStatus } from './model.ts';
import { crewPost, crewStation, laneRoute, STAR_OFFICE_SIZE } from './starOfficeMap.ts';
import { shell } from '../shell/store.ts';
import { PROFILES } from '../hermes/labels.ts';

/** Phaser scene lifecycle and guest renderer adapted from Star Office UI. */
export async function mountScene(host: HTMLElement, appearances: Record<string, Appearance>, select: (profile: string) => void) {
  let ready!: () => void, fail!: (error: Error) => void;
  const loaded = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  let zoom = 1, panX = 0, panY = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const actors = new Map<string, { point: Point; destination: Point; path: Path; status: CrewStatus; idleAt: number }>();
  const hovered = new Set<string>();
  let visitors: Visitor[] = [];
  let renderer: ReturnType<typeof createGuestRenderer>;
  let scene: Phaser.Scene;
  function fit() {
    if (!scene?.sys.isActive()) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const available = Math.max(100, h - 85);
    const scale = Math.min(w / STAR_OFFICE_SIZE.width, available / STAR_OFFICE_SIZE.height) * 0.98 * zoom;
    const deckCenterY = 85 + Math.max(0, available - STAR_OFFICE_SIZE.height * scale) * 0.15 + STAR_OFFICE_SIZE.height * scale / 2;
    scene.cameras.main.setZoom(scale).centerOn(STAR_OFFICE_SIZE.width / 2 - panX / scale, STAR_OFFICE_SIZE.height / 2 + (h / 2 - deckCenterY - panY) / scale);
  }
  class OdysseyScene extends Phaser.Scene {
    preload() {
      this.load.image('odyssey-deck', deckUrl);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => fail(new Error('Background Star Office tidak dapat dimuat.')));
    }
    create() {
      if (!this.textures.exists('odyssey-deck')) { fail(new Error('Background Star Office tidak dapat dibaca.')); return; }
      scene = this;
      this.add.image(0, 0, 'odyssey-deck').setOrigin(0).setDisplaySize(STAR_OFFICE_SIZE.width, STAR_OFFICE_SIZE.height).setDepth(0);
      for (const profile of PROFILES) {
        const key = `crew-${profile}`, texture = this.textures.addCanvas(key, crewSheet(appearances[profile]))!;
        for (let row = 0; row < 4; row++) {
          for (let frame = 0; frame < 4; frame++) texture.add(row * 4 + frame, 0, frame * 16, row * 24, 16, 24);
          this.anims.create({ key: `${key}-${row}`, frames: [0, 1, 2, 3].map(n => ({ key, frame: row * 4 + n })), frameRate: 8, repeat: -1 });
        }
      }
      const state = shell.getState();
      visitors = PROFILES.map((profile, i) => {
        const status = crewStatus(profile, state.agents, state.approvals), point = crewPost(i);
        actors.set(profile, { point, destination: point, path: [], status, idleAt: performance.now() + 15000 + i * 800 });
        return { agentId: profile, name: profile, avatar: `crew-${profile}`, state: status === 'idle' || status === 'offline' ? 'idle' : 'writing', area: status === 'idle' || status === 'offline' ? 'breakroom' : status === 'error' ? 'error' : 'writing' };
      });
      renderer = createGuestRenderer(this, () => visitors, (_area, _index, agent) => actors.get(agent.agentId)!.point);
      renderer.render();
      for (const profile of PROFILES) {
        const view = renderer.sprites[profile];
        view.sprite.setInteractive({ useHandCursor: true }).on('pointerup', () => select(profile));
        view.sprite.on('pointerover', () => hovered.add(profile)).on('pointerout', () => hovered.delete(profile));
        view.nameText.setFontSize(12).setStroke('#06101c', 3);
      }
      // Foreground compositing: copy the original artwork through calibrated masks.
      // This is a UI layer, not a separate modified image asset.
      const frontMask = this.make.graphics({ x: 0, y: 0 });
      frontMask.fillStyle(0xffffff).fillPoints([{ x: 573, y: 382 }, { x: 666, y: 382 }, { x: 705, y: 531 }, { x: 676, y: 577 }, { x: 565, y: 568 }, { x: 535, y: 475 }], true);
      const foreground = this.add.image(0, 0, 'odyssey-deck').setOrigin(0).setDisplaySize(1280, 720).setDepth(2000);
      foreground.setMask(frontMask.createGeometryMask());
      this.events.once('shutdown', () => { foreground.clearMask(true); frontMask.destroy(); });
      this.input.mouse?.disableContextMenu();
      this.input.on('wheel', (_p: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => { zoom = Phaser.Math.Clamp(zoom - dy * 0.001, 0.65, 2.5); fit(); });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown && (pointer.rightButtonDown() || pointer.middleButtonDown())) { panX += pointer.x - pointer.prevPosition.x; panY += pointer.y - pointer.prevPosition.y; fit(); }
      });
      this.scale.on('resize', fit); fit(); ready();
    }
    update() {
      if (!renderer) return;
      const now = performance.now(), state = shell.getState();
      if (PROFILES.some(profile => actors.get(profile)!.status !== crewStatus(profile, state.agents, state.approvals))) {
        visitors = visitors.map(visitor => {
          const status = crewStatus(visitor.agentId, state.agents, state.approvals);
          return { ...visitor, state: status === 'idle' || status === 'offline' ? 'idle' : 'writing', area: status === 'idle' || status === 'offline' ? 'breakroom' : status === 'error' ? 'error' : 'writing' };
        });
        renderer.render();
      }
      for (const [index, profile] of PROFILES.entries()) {
        const actor = actors.get(profile)!, view = renderer.sprites[profile];
        const status = crewStatus(profile, state.agents, state.approvals);
        const active = ['working', 'thinking', 'waiting', 'error'].includes(status);
        let target = active ? crewStation(profile) : crewPost(index);
        if (!active && status !== 'offline' && !reduced.matches && now > actor.idleAt) {
          target = crewPost((index + 1) % PROFILES.length); actor.idleAt = now + 18000;
        } else if (!active && actor.path.length && status === actor.status) target = actor.destination;
        actor.status = status;
        if (actor.destination.x !== target.x || actor.destination.y !== target.y) {
          actor.destination = target;
          actor.path = motionPath(laneRoute(actor.point, target), now);
          if (reduced.matches) { actor.point = target; actor.path = []; }
        }
        let moving = false, direction = 1;
        if (actor.path.length > 1) {
          const location = pathPosition(actor.path, now); actor.point = location.position;
          moving = location.velocity > 0;
          direction = Math.floor((orientationDegrees(location.facing) + 45) / 90) % 4;
          if (now >= actor.path.at(-1)![4]) actor.path = [];
        }
        view.sprite.setPosition(actor.point.x, actor.point.y).setDepth(actor.point.y).setAlpha(status === 'offline' ? 0.5 : 1);
        if (moving && !reduced.matches) view.sprite.anims.play(`crew-${profile}-${direction}`, true);
        else { view.sprite.anims.stop(); view.sprite.setFrame(direction * 4); }
        view.nameText.setPosition(actor.point.x, actor.point.y - 71).setText(`${profile}\n${STATUS_LABELS[status]}`).setAlign('center').setColor(`#${STATUS_COLORS[status].toString(16).padStart(6, '0')}`).setVisible(active || state.selected === profile || hovered.has(profile));
        view.sprite.setTint(state.selected === profile ? 0xffffff : 0xe5efff);
      }
    }
  }
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: host.clientWidth || 900, height: host.clientHeight || 600, transparent: true, pixelArt: false, antialias: true, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } }, scene: OdysseyScene, audio: { noAudio: true } });
  try { await loaded; } catch (error) { game.destroy(true); throw error; }
  return {
    zoomBy(amount: number) { zoom = Phaser.Math.Clamp(zoom + amount, 0.65, 2.5); fit(); },
    reset() { zoom = 1; panX = panY = 0; fit(); },
    destroy() { game.destroy(true); },
  };
}
