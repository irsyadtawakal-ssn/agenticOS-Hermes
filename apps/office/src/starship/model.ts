import type { AgentState, Approval } from '../shell/api.ts';
import { PROFILES } from '../hermes/labels.ts';
import { compressPath, normalize, vector } from '../../vendor/ai-town/geometry.ts';
import type { Path, Point } from '../../vendor/ai-town/types.ts';

export const TILE = 24;
export const WORLD = { width: 1200, height: 768 };
export const ROOMS = [
  { id: 'bridge', name: 'COMMAND BRIDGE', subtitle: 'Navigation & orchestration', x: 432, y: 96, w: 336, h: 192, color: 0x54dbed },
  { id: 'research', name: 'SCIENCE LAB', subtitle: 'Research & discovery', x: 120, y: 312, w: 288, h: 192, color: 0x9c8bff },
  { id: 'comms', name: 'COMMUNICATIONS', subtitle: 'Content & coordination', x: 792, y: 312, w: 288, h: 192, color: 0xffbb72 },
  { id: 'engineering', name: 'ENGINEERING', subtitle: 'Code & systems', x: 432, y: 456, w: 336, h: 192, color: 0x69e6af },
  { id: 'lounge', name: 'CREW QUARTERS', subtitle: 'Standby & recharge', x: 120, y: 552, w: 288, h: 144, color: 0x74a1d9 },
  { id: 'cargo', name: 'MISSION BAY', subtitle: 'Tasks & deployment', x: 792, y: 552, w: 288, h: 144, color: 0xef87b7 },
] as const;
const CORRIDORS = [{ x: 408, y: 288, w: 384, h: 168 }, { x: 408, y: 456, w: 24, h: 240 }, { x: 768, y: 456, w: 24, h: 240 }];
export type CrewStatus = 'idle' | 'working' | 'thinking' | 'waiting' | 'error' | 'offline';
export const STATUS_LABELS: Record<CrewStatus, string> = { idle: 'Standby', working: 'Working', thinking: 'Thinking', waiting: 'Needs approval', error: 'Attention', offline: 'Offline' };
export const STATUS_COLORS: Record<CrewStatus, number> = { idle: 0x94a6c2, working: 0x69e6af, thinking: 0x9c8bff, waiting: 0xffbb72, error: 0xff7185, offline: 0x54627a };
export const UNIFORMS = ['#5ed9eb', '#9c8bff', '#ffb96a', '#6de5ad', '#f28bbd', '#e6edf7'];
export const SKINS = ['#f2d1b3', '#d6a076', '#9a684b', '#614333'];
export const HAIRS = ['#252338', '#805637', '#dac18a', '#a3d8eb'];
export interface Appearance { uniform: string; skin: string; hair: string; hairstyle: 'short' | 'long' | 'bald'; headset: boolean }
export function defaultAppearance(index: number): Appearance {
  return { uniform: UNIFORMS[index % UNIFORMS.length], skin: SKINS[index % SKINS.length], hair: HAIRS[index % HAIRS.length], hairstyle: index % 3 === 0 ? 'long' : 'short', headset: index % 2 === 0 };
}
export function normalizeAppearance(value: unknown, index: number): Appearance {
  const base = defaultAppearance(index);
  if (!value || typeof value !== 'object') return base;
  const data = value as Record<string, unknown>;
  return { uniform: UNIFORMS.includes(String(data.uniform)) ? String(data.uniform) : base.uniform,
    skin: SKINS.includes(String(data.skin)) ? String(data.skin) : base.skin,
    hair: HAIRS.includes(String(data.hair)) ? String(data.hair) : base.hair,
    hairstyle: ['short', 'long', 'bald'].includes(String(data.hairstyle)) ? data.hairstyle as Appearance['hairstyle'] : base.hairstyle,
    headset: typeof data.headset === 'boolean' ? data.headset : base.headset };
}
export function crewStatus(profile: string, agents: AgentState[], approvals: Approval[]): CrewStatus {
  if (approvals.some(a => a.profile === profile && a.status === 'pending')) return 'waiting';
  const state = agents.find(a => a.profile === profile)?.state;
  if (!state || state === 'offline') return 'offline';
  if (state === 'thinking') return 'thinking';
  if (['error', 'breaker', 'breaker_tripped'].includes(state)) return 'error';
  if (['waiting', 'blocked', 'awaiting_approval'].includes(state)) return 'waiting';
  if (['idle', 'done', 'success'].includes(state)) return 'idle';
  return 'working';
}
export function stationFor(profile: string): typeof ROOMS[number]['id'] {
  if (profile === 'chief' || profile === 'hermes-default') return 'bridge';
  if (profile === 'researcher' || profile === 'clara') return 'research';
  if (profile === 'dev' || profile === 'crib') return 'engineering';
  if (profile === 'content' || profile === 'maya') return 'comms';
  return 'cargo';
}
export function workPosition(profile: string): Point {
  const station = stationFor(profile);
  const room = ROOMS.find(r => r.id === station)!;
  const peers = PROFILES.filter(p => stationFor(p) === station);
  const index = Math.max(0, peers.indexOf(profile));
  const spacing = Math.min(96, (room.w - 120) / Math.max(1, peers.length - 1));
  return { x: room.x + 60 + index * spacing, y: room.y + Math.min(120, room.h - 48) };
}
export function standbyPosition(index: number): Point {
  // Ten separate posts in the central promenade; never occupy consoles/walls.
  return { x: 456 + (index % 5) * 72, y: 348 + Math.floor(index / 5) * 72 };
}
export function walkable(x: number, y: number): boolean {
  if (!CORRIDORS.some(r => contains(r, x, y))) {
    const room = ROOMS.find(r => contains(r, x, y));
    if (!room) return false;
    const edge = x < room.x + TILE || x >= room.x + room.w - TILE || y < room.y + TILE || y >= room.y + room.h - TILE;
    if (edge && !contains(roomDoor(room), x, y)) return false;
  }
  return !FURNITURE.some(r => contains(r, x, y));
}
export interface Footprint { x: number; y: number; w: number; h: number }
function contains(r: Footprint, x: number, y: number) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
export function roomDoor(room: typeof ROOMS[number]): Footprint {
  if (room.id === 'bridge') return { x: room.x + room.w / 2 - 24, y: room.y + room.h - 24, w: 48, h: 24 };
  if (room.id === 'engineering') return { x: room.x + room.w / 2 - 24, y: room.y, w: 48, h: 24 };
  return { x: room.x < 432 ? room.x + room.w - 24 : room.x, y: room.y + room.h / 2 - 24, w: 24, h: 48 };
}
export function consoleFootprint(profile: string): Footprint {
  const p = workPosition(profile);
  return { x: p.x - 24, y: p.y - 60, w: 48, h: 36 };
}
export const FURNITURE: Footprint[] = [
  ...PROFILES.map(consoleFootprint),
  { x: 696, y: 528, w: 48, h: 72 },
  { x: 168, y: 600, w: 144, h: 36 },
];
/** Grid route keeps crew inside decks and connecting corridors. */
export function route(start: Point, end: Point): Point[] {
  const cell = (p: Point) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  const a = cell(start), b = cell(end), key = (p: Point) => `${p.x},${p.y}`;
  const queue = [a], previous = new Map<string, Point | null>([[key(a), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (key(p) === key(b)) break;
    for (const n of [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }]) {
      if (previous.has(key(n)) || !walkable(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2)) continue;
      previous.set(key(n), p); queue.push(n);
    }
  }
  if (!previous.has(key(b))) return [start];
  const points: Point[] = [];
  for (let p: Point | null = b; p; p = previous.get(key(p)) ?? null) points.unshift({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });
  return [start, ...points.slice(1), end];
}
/** Uses AI Town's packed paths and interpolation, driven by local visual motion. */
export function motionPath(points: Point[], now: number): Path {
  let time = now;
  return compressPath(points.map((p, i) => {
    if (i) time += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) / 0.055;
    return { position: p, facing: normalize(vector(p, points[i + 1] ?? points[i - 1] ?? { x: p.x + 1, y: p.y })) ?? { dx: 1, dy: 0 }, t: time };
  }).filter((p, i, all) => i === 0 || p.t > all[i - 1].t));
}
