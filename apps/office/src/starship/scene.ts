import { Application, Container } from 'pixi.js';
import { orientationDegrees, pathPosition } from '../../vendor/ai-town/geometry.ts';
import type { Path, Point } from '../../vendor/ai-town/types.ts';
import { createCrew } from './Character.ts';
import { crewStatus, motionPath, route, standbyPosition, workPosition } from './model.ts';
import { PROFILES } from '../hermes/labels.ts';
import type { Appearance } from './model.ts';
import { shell } from '../shell/store.ts';
import { drawIsometricDeck } from './Deck.ts';
import { floorToScreen, ISO } from './isometric.ts';

export async function mountScene(host: HTMLElement, appearances: Record<string, Appearance>, select: (profile: string) => void) {
  const app = new Application({ width: host.clientWidth || 900, height: host.clientHeight || 600, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
  host.appendChild(app.view as HTMLCanvasElement);
  const world = new Container(); app.stage.addChild(world); const depth = drawIsometricDeck(world);
  const actors: Array<{ profile: string; view: Awaited<ReturnType<typeof createCrew>>; point: Point; destination: Point; path: Path; orientation: number; idleAt: number }> = [];
  try {
    for (const [index, profile] of PROFILES.entries()) {
      const view = await createCrew(profile, appearances[profile], () => select(profile));
      const point = standbyPosition(index); const screen = floorToScreen(point); view.root.position.set(screen.x, screen.y); view.root.zIndex = point.x + point.y; depth.addChild(view.root);
      actors.push({ profile, view, point, destination: point, path: [], orientation: 90, idleAt: performance.now() + 6000 + index * 900 });
    }
  } catch (error) {
    actors.forEach(a => a.view.destroy()); app.destroy(true, { children: true }); throw error;
  }
  let zoom = 1, panX = 0, panY = 0;
  const bounds = world.getLocalBounds();
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    app.renderer.resize(w, h);
    const availableHeight = Math.max(100, h - 100);
    const scale = Math.min(w / bounds.width, availableHeight / bounds.height) * 0.92 * zoom;
    world.scale.set(scale); world.position.set((w - bounds.width * scale) / 2 - bounds.x * scale + panX, Math.min(80, h / 4) + (availableHeight - bounds.height * scale) / 2 - bounds.y * scale + panY);
  }
  const observer = new ResizeObserver(fit); observer.observe(host); fit();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let drag: { x: number; y: number } | null = null;
  const canvas = app.view as HTMLCanvasElement;
  const pointerDown = (e: PointerEvent) => { if (e.button === 1 || e.button === 2) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); e.preventDefault(); } };
  const pointerMove = (e: PointerEvent) => { if (drag) { panX += e.clientX - drag.x; panY += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; fit(); } };
  const pointerUp = () => { drag = null; };
  const context = (e: Event) => e.preventDefault();
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(0.65, Math.min(2.5, zoom - e.deltaY * 0.001)); fit(); };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('contextmenu', context); canvas.addEventListener('wheel', wheel, { passive: false });
  app.ticker.add(() => {
    const now = performance.now(), state = shell.getState();
    for (const [index, actor] of actors.entries()) {
      const status = crewStatus(actor.profile, state.agents, state.approvals);
      const active = ['working', 'thinking', 'waiting', 'error'].includes(status);
      let target = active ? workPosition(actor.profile) : standbyPosition(index);
      if (!active && status !== 'offline' && !media.matches && now > actor.idleAt) {
        target = standbyPosition((index + Math.floor(now / 16000)) % PROFILES.length);
        actor.idleAt = now + 16000;
      } else if (!active && actor.path.length && actor.destination.x !== target.x) target = actor.destination;
      if (actor.destination.x !== target.x || actor.destination.y !== target.y) {
        actor.destination = target; actor.path = motionPath(route(actor.point, target), now);
        if (media.matches) { actor.point = target; actor.path = []; }
      }
      let moving = false;
      if (actor.path.length > 1) {
        const location = pathPosition(actor.path, now); actor.point = location.position; moving = location.velocity > 0 && !media.matches;
        actor.orientation = orientationDegrees({ dx: (location.facing.dx - location.facing.dy) * ISO.x, dy: (location.facing.dx + location.facing.dy) * ISO.y });
        if (now >= actor.path[actor.path.length - 1][4]) actor.path = [];
      }
      const screen = floorToScreen(actor.point); actor.view.root.position.set(screen.x, screen.y); actor.view.root.zIndex = actor.point.x + actor.point.y;
      actor.view.update(actor.orientation, moving, state.selected === actor.profile, status);
    }
  });
  return { zoomBy(amount: number) { zoom = Math.max(0.65, Math.min(2.5, zoom + amount)); fit(); }, reset() { zoom = 1; panX = panY = 0; fit(); }, destroy() {
    observer.disconnect(); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('contextmenu', context); canvas.removeEventListener('wheel', wheel);
    actors.forEach(a => a.view.destroy()); app.destroy(true, { children: true });
  } };
}
