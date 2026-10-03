import { stationFor } from './model.ts';
import { PROFILES } from '../hermes/labels.ts';
import type { Point } from '../../vendor/ai-town/types.ts';

// Hand-calibrated to the original 1672x941 artwork, displayed at 1280x720.
// Fixed walking lanes use the open room entrances; furniture is not a free-walk area.
export const STAR_OFFICE_SIZE = { width: 1280, height: 720 };
export const LANES: Record<string, Point> = {
  center: { x: 640, y: 300 }, left: { x: 455, y: 285 }, right: { x: 835, y: 285 },
  bridge: { x: 640, y: 215 }, lab: { x: 360, y: 235 }, comms: { x: 975, y: 235 },
  loungeDoor: { x: 410, y: 360 }, lounge: { x: 345, y: 410 },
  engineDoor: { x: 570, y: 350 }, engineLeft: { x: 515, y: 395 }, engineering: { x: 515, y: 470 },
  engineRightDoor: { x: 710, y: 350 }, engineRight: { x: 770, y: 405 }, engineerRightStation: { x: 770, y: 485 },
  cargoDoor: { x: 870, y: 355 }, cargo: { x: 965, y: 435 },
};
export const LANE_LINKS = [
  ['center', 'left'], ['center', 'right'], ['center', 'bridge'], ['left', 'lab'],
  ['left', 'loungeDoor'], ['loungeDoor', 'lounge'], ['center', 'engineDoor'],
  ['engineDoor', 'engineLeft'], ['engineLeft', 'engineering'],
  ['center', 'engineRightDoor'], ['engineRightDoor', 'engineRight'], ['engineRight', 'engineerRightStation'],
  ['right', 'comms'], ['right', 'cargoDoor'], ['cargoDoor', 'cargo'],
] as const;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function crewPost(index: number): Point {
  return { x: 555 + (index % 5) * 42, y: 293 + Math.floor(index / 5) * 45 };
}
export function crewStation(profile: string): Point {
  const room = stationFor(profile), peers = PROFILES.filter(p => stationFor(p) === room), index = peers.indexOf(profile);
  if (room === 'bridge') return { x: 578 + index * 123, y: 185 };
  if (room === 'research') return { x: 345 - index * 42, y: 224 };
  if (room === 'comms') return { x: 1018 + index * 63, y: 220 + index * 26 };
  if (room === 'engineering') return index === 0 ? LANES.engineering : LANES.engineerRightStation;
  return { x: 985 + index * 75, y: 510 };
}
export function laneRoute(start: Point, end: Point): Point[] {
  const nearest = (p: Point) => Object.keys(LANES).reduce((a, b) => distance(LANES[a], p) < distance(LANES[b], p) ? a : b);
  const first = nearest(start), last = nearest(end);
  const costs = new Map([[first, 0]]), previous = new Map<string, string>(), open = [first];
  while (open.length) {
    open.sort((a, b) => costs.get(a)! - costs.get(b)!);
    const id = open.shift()!;
    if (id === last) break;
    for (const pair of LANE_LINKS) {
      const next = pair[0] === id ? pair[1] : pair[1] === id ? pair[0] : null;
      if (!next) continue;
      const cost = costs.get(id)! + distance(LANES[id], LANES[next]);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost); previous.set(next, id); if (!open.includes(next)) open.push(next);
    }
  }
  if (!costs.has(last)) return [start];
  const nodes: Point[] = [];
  for (let id: string | undefined = last; id; id = previous.get(id)) nodes.unshift(LANES[id]);
  // Crew in the same open promenade can move directly between nearby standby posts.
  const points = first === last && first === 'center' ? [start, end] : [start, ...nodes, end];
  return points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > 0.01);
}
