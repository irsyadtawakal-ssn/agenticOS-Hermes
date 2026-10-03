/**
 * Navigation Mesh & Office Floorplan Grid for The Sims 2 3D Office.
 * Defines 4 office zones, workstation anchors, idle interaction spots,
 * and grid-based pathfinding.
 *
 * This module is the single source of truth for furniture placement that
 * characters interact with: RoomBuilder builds desks/chairs from DESK_LAYOUT
 * and MEETING_CHAIRS so seats, anchors and obstacles always line up.
 */

import { PROFILES } from '../hermes/labels.ts';

export interface Vector2D {
  x: number;
  z: number;
}

export type AnchorActivity = 'work' | 'coffee' | 'couch' | 'cooler' | 'meeting' | 'whiteboard' | 'idle';

export interface AnchorPoint extends Vector2D {
  rotationY: number; // in radians; 0 = facing +Z, PI = facing -Z
  activity: AnchorActivity;
  zone: string;
  /** Character sits down on arrival (chair / couch). */
  seated?: boolean;
  /** Walkable stand spot next to the anchor; pathfinding targets this, then slides onto the anchor. */
  approach?: Vector2D;
}

export const OFFICE_BOUNDS = {
  minX: -11,
  maxX: 11,
  minZ: -10,
  maxZ: 10,
};

/** Distance from desk centre to chair/seat centre. */
export const SEAT_OFFSET = 0.85;
/** Desk top footprint. */
export const DESK_SIZE = { w: 1.8, d: 0.9 };

export interface DeskSlot {
  /** desk centre */
  x: number;
  z: number;
  /** +1: seat on the +Z side (monitors toward -Z), -1: seat on the -Z side */
  seatSide: 1 | -1;
  zone: string;
}

/**
 * Open-plan desks: two back-to-back rows facing a shared aisle.
 * Row A desks at z=3.0 (seats at +Z, facing -Z), row B desks at z=7.2 (seats at -Z, facing +Z).
 */
export const DESK_LAYOUT: DeskSlot[] = (() => {
  const xs = [-7.8, -5.6, -3.4, -1.2];
  const rowA = xs.map((x): DeskSlot => ({ x, z: 3.0, seatSide: 1, zone: x < -5 ? 'workstation_dev' : 'workstation_open' }));
  const rowB = xs.map((x): DeskSlot => ({ x, z: 7.2, seatSide: -1, zone: x < -5 ? 'workstation_dev' : 'workstation_open' }));
  return [...rowA, ...rowB];
})();

export function deskSeat(desk: DeskSlot): AnchorPoint {
  const z = desk.z + desk.seatSide * SEAT_OFFSET;
  return {
    x: desk.x,
    z,
    rotationY: desk.seatSide === 1 ? Math.PI : 0,
    activity: 'work',
    zone: desk.zone,
    seated: true,
    approach: { x: desk.x, z: z + desk.seatSide * 0.45 },
  };
}

/** Meeting room chairs (chair position + facing). */
export const MEETING_CHAIRS: Array<{ x: number; z: number; rot: number }> = [
  { x: 6.35, z: 4.0, rot: Math.PI / 2 },
  { x: 6.35, z: 6.0, rot: Math.PI / 2 },
  { x: 9.65, z: 4.0, rot: -Math.PI / 2 },
  { x: 9.65, z: 6.0, rot: -Math.PI / 2 },
  { x: 8.0, z: 2.55, rot: 0 },
  { x: 8.0, z: 7.45, rot: Math.PI },
];

export function meetingSeat(i: number, activity: AnchorActivity = 'meeting'): AnchorPoint {
  const c = MEETING_CHAIRS[i];
  // step back from the table along the facing direction
  const ax = c.x - Math.sin(c.rot) * 0.5;
  const az = c.z - Math.cos(c.rot) * 0.5;
  return { x: c.x, z: c.z, rotationY: c.rot, activity, zone: 'meeting_room', seated: true, approach: { x: ax, z: az } };
}

/** Chief's executive chair (north of the desk, facing the door). */
export const CHIEF_DESK = { x: -6.5, z: -6.8, w: 2.4, d: 1.2 };
export const CHIEF_SEAT: AnchorPoint = {
  x: -6.5,
  z: -7.95,
  rotationY: 0,
  activity: 'work',
  zone: 'chief_office',
  seated: true,
  approach: { x: -6.5, z: -8.5 },
};

/** Workstation anchors for each agent: chief office, then desks in roster order, overflow in meeting room. */
export const WORKSTATION_ANCHORS: Record<string, AnchorPoint> = (() => {
  const out: Record<string, AnchorPoint> = {};
  const seats = DESK_LAYOUT.map(deskSeat);
  let overflow = 0;
  for (const profile of PROFILES) {
    if (profile === 'chief') {
      out[profile] = CHIEF_SEAT;
      continue;
    }
    const seat = seats.shift();
    out[profile] = seat ?? meetingSeat(overflow++ % MEETING_CHAIRS.length, 'work');
  }
  return out;
})();

/** Which desk (index into DESK_LAYOUT) each profile owns. */
export function deskOwner(index: number): string | undefined {
  const seat = deskSeat(DESK_LAYOUT[index]);
  return Object.keys(WORKSTATION_ANCHORS).find((p) => {
    const a = WORKSTATION_ANCHORS[p];
    return a.x === seat.x && a.z === seat.z;
  });
}

/** Reception lobby (x -3..2.5, z -10..-4): sofa against the north wall facing a coffee table. */
export const LOBBY = {
  sofa: { x: -0.5, z: -9.2 },
  table: { x: -0.5, z: -7.4 },
};

/** Idle anchors for autonomous "Free Will" roaming */
export const IDLE_ANCHORS: AnchorPoint[] = [
  // Pantry / Breakroom
  { x: 9.2, z: -7.5, rotationY: Math.PI / 2, activity: 'coffee', zone: 'pantry' },
  { x: 9.2, z: -8.4, rotationY: Math.PI / 2, activity: 'coffee', zone: 'pantry' },
  { x: 6.5, z: -8.0, rotationY: Math.PI, activity: 'cooler', zone: 'pantry' },
  { x: 7.3, z: -8.6, rotationY: -Math.PI / 2, activity: 'cooler', zone: 'pantry' },
  { x: 7.7, z: -3.0, rotationY: Math.PI, activity: 'couch', zone: 'pantry', seated: true, approach: { x: 7.7, z: -2.1 } },
  { x: 8.7, z: -3.0, rotationY: Math.PI, activity: 'couch', zone: 'pantry', seated: true, approach: { x: 8.7, z: -2.1 } },
  // Lobby sofa
  { x: -1.0, z: -9.15, rotationY: 0, activity: 'couch', zone: 'lobby', seated: true, approach: { x: -1.0, z: -8.2 } },
  { x: 0.0, z: -9.15, rotationY: 0, activity: 'couch', zone: 'lobby', seated: true, approach: { x: 0.0, z: -8.2 } },
  // Meeting Room
  meetingSeat(4, 'meeting'),
  meetingSeat(5, 'meeting'),
  { x: 8.0, z: 9.0, rotationY: 0, activity: 'whiteboard', zone: 'meeting_room' },
  // Promenade / Corridor
  { x: 0.0, z: -1.0, rotationY: 0, activity: 'idle', zone: 'corridor' },
  { x: 1.5, z: -0.5, rotationY: Math.PI / 2, activity: 'idle', zone: 'corridor' },
  { x: -2.5, z: 1.0, rotationY: -Math.PI / 4, activity: 'idle', zone: 'corridor' },
];

/** Bounding boxes of solid obstacles (walls, desks, server racks) */
export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function box(cx: number, cz: number, w: number, d: number): ObstacleBox {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

import { DEFAULT_DECOR, decorBox } from './DecorLayout.ts';

export const STATIC_OBSTACLES: ObstacleBox[] = [
  // Outer perimeter boundary
  { minX: -12, maxX: -11, minZ: -11, maxZ: 11 },
  { minX: 11, maxX: 12, minZ: -11, maxZ: 11 },
  { minX: -11, maxX: 11, minZ: -11, maxZ: -10 },
  { minX: -11, maxX: 11, minZ: 10, maxZ: 11 },

  // Interior dividing walls with door openings (match RoomBuilder.buildWalls)
  box(-7.75, -2, 6.5, 0.25), // Chief office south wall, opening x -4.5..2.5
  box(2.5, -6.75, 0.25, 6.5), // West wing / pantry, opening z -3.5..3.5
  box(2.5, 6.75, 0.25, 6.5), // West wing / meeting room
  box(8.5, 0.5, 5, 0.25), // Pantry / meeting room, opening x 2.5..6

  // Chief office
  box(CHIEF_DESK.x, CHIEF_DESK.z, CHIEF_DESK.w, CHIEF_DESK.d),
  box(-6.5, -9.7, 2.2, 0.4), // bookshelf

  // Workstation desks
  ...DESK_LAYOUT.map((d) => box(d.x, d.z, DESK_SIZE.w, DESK_SIZE.d)),
  // Server Rack in Dev zone
  box(-10.2, 4.5, 0.9, 0.9),

  // Pantry counter + fridge, couch
  { minX: 9.7, maxX: 10.9, minZ: -9.25, maxZ: -4.55 },
  box(8.2, -3.0, 1.8, 0.8),

  // Meeting table
  box(8.0, 5.0, 2.4, 4.0),

  // Lobby: reception sofa
  box(LOBBY.sofa.x, LOBBY.sofa.z, 2.0, 0.85),
];

let dynamicDecorObstacles: ObstacleBox[] = DEFAULT_DECOR.map(decorBox);

export function getDecorObstacles(): ObstacleBox[] {
  return dynamicDecorObstacles;
}

export function setDecorObstacles(boxes: ObstacleBox[]): void {
  dynamicDecorObstacles = boxes;
  walkGrid = null; // Invalidate grid cache for pathfinding
}

export const OBSTACLES: ObstacleBox[] = new Proxy([] as ObstacleBox[], {
  get(_target, prop) {
    const combined = [...STATIC_OBSTACLES, ...dynamicDecorObstacles];
    if (prop === 'length') return combined.length;
    if (prop === Symbol.iterator) return combined[Symbol.iterator].bind(combined);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return combined[Number(prop)];
    return (combined as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function isWalkable(x: number, z: number, padding: number = 0.35): boolean {
  if (
    x < OFFICE_BOUNDS.minX + padding ||
    x > OFFICE_BOUNDS.maxX - padding ||
    z < OFFICE_BOUNDS.minZ + padding ||
    z > OFFICE_BOUNDS.maxZ - padding
  ) {
    return false;
  }
  for (const obs of STATIC_OBSTACLES) {
    if (
      x >= obs.minX - padding &&
      x <= obs.maxX + padding &&
      z >= obs.minZ - padding &&
      z <= obs.maxZ + padding
    ) {
      return false;
    }
  }
  for (const obs of dynamicDecorObstacles) {
    if (
      x >= obs.minX - padding &&
      x <= obs.maxX + padding &&
      z >= obs.minZ - padding &&
      z <= obs.maxZ + padding
    ) {
      return false;
    }
  }
  return true;
}

export function validatePlacement(candidate: ObstacleBox, excludeBox?: ObstacleBox): boolean {
  // 1. Check bounds
  if (
    candidate.minX < OFFICE_BOUNDS.minX + 0.3 ||
    candidate.maxX > OFFICE_BOUNDS.maxX - 0.3 ||
    candidate.minZ < OFFICE_BOUNDS.minZ + 0.3 ||
    candidate.maxZ > OFFICE_BOUNDS.maxZ - 0.3
  ) {
    return false;
  }

  // 2. Overlap with static obstacles
  for (const s of STATIC_OBSTACLES) {
    if (
      candidate.minX < s.maxX &&
      candidate.maxX > s.minX &&
      candidate.minZ < s.maxZ &&
      candidate.maxZ > s.minZ
    ) {
      return false;
    }
  }

  // 3. Overlap with other dynamic decor
  for (const d of dynamicDecorObstacles) {
    if (
      excludeBox &&
      d.minX === excludeBox.minX &&
      d.maxX === excludeBox.maxX &&
      d.minZ === excludeBox.minZ &&
      d.maxZ === excludeBox.maxZ
    ) {
      continue;
    }
    if (
      candidate.minX < d.maxX &&
      candidate.maxX > d.minX &&
      candidate.minZ < d.maxZ &&
      candidate.maxZ > d.minZ
    ) {
      return false;
    }
  }

  // 4. Do not block anchor approach points
  const standSpot = (a: { x: number; z: number; approach?: { x: number; z: number } }) => a.approach ?? a;
  const spots = [...Object.values(WORKSTATION_ANCHORS), ...IDLE_ANCHORS].map(standSpot);
  for (const sp of spots) {
    if (
      sp.x >= candidate.minX - 0.25 &&
      sp.x <= candidate.maxX + 0.25 &&
      sp.z >= candidate.minZ - 0.25 &&
      sp.z <= candidate.maxZ + 0.25
    ) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Grid A* pathfinding
// ---------------------------------------------------------------------------

const CELL = 0.25;
const NAV_PADDING = 0.3;
const COLS = Math.round((OFFICE_BOUNDS.maxX - OFFICE_BOUNDS.minX) / CELL);
const ROWS = Math.round((OFFICE_BOUNDS.maxZ - OFFICE_BOUNDS.minZ) / CELL);

let walkGrid: Uint8Array | null = null;
function grid(): Uint8Array {
  if (!walkGrid) {
    walkGrid = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = cellCenter(c, r);
        walkGrid[r * COLS + c] = isWalkable(p.x, p.z, NAV_PADDING) ? 1 : 0;
      }
    }
  }
  return walkGrid;
}

function cellCenter(c: number, r: number): Vector2D {
  return { x: OFFICE_BOUNDS.minX + (c + 0.5) * CELL, z: OFFICE_BOUNDS.minZ + (r + 0.5) * CELL };
}

function toCell(p: Vector2D): [number, number] {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((p.x - OFFICE_BOUNDS.minX) / CELL)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((p.z - OFFICE_BOUNDS.minZ) / CELL)));
  return [c, r];
}

/** Nearest walkable cell index (BFS ring search). */
function nearestWalkable(p: Vector2D): number {
  const g = grid();
  const [c0, r0] = toCell(p);
  if (g[r0 * COLS + c0]) return r0 * COLS + c0;
  for (let rad = 1; rad < Math.max(COLS, ROWS); rad++) {
    let best = -1;
    let bestD = Infinity;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || !g[r * COLS + c]) continue;
        const q = cellCenter(c, r);
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = r * COLS + c;
        }
      }
    }
    if (best >= 0) return best;
  }
  return r0 * COLS + c0;
}

function astar(start: number, goal: number): number[] | null {
  const g = grid();
  const n = COLS * ROWS;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % COLS;
  const gr = Math.floor(goal / COLS);
  const h = (i: number) => {
    const dc = Math.abs((i % COLS) - gc);
    const dr = Math.abs(Math.floor(i / COLS) - gr);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  // binary heap of [f, idx]
  const heap: Array<[number, number]> = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };

  gScore[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goal) {
      const path: number[] = [];
      for (let i = cur; i !== -1; i = came[i]) path.push(i);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % COLS;
    const cr = Math.floor(cur / COLS);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const ni = nr * COLS + nc;
        if (!g[ni] || closed[ni]) continue;
        // no corner cutting
        if (dr && dc && (!g[cr * COLS + nc] || !g[nr * COLS + cc])) continue;
        const tentative = gScore[cur] + (dr && dc ? Math.SQRT2 : 1);
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          came[ni] = cur;
          push(tentative + h(ni), ni);
        }
      }
    }
  }
  return null;
}

/**
 * Grid A* with line-of-sight smoothing. Start and goal are snapped to the nearest
 * walkable cell; the exact target is always the final waypoint.
 */
export function findPath(start: Vector2D, target: Vector2D): Vector2D[] {
  if (isLineClear(start, target)) {
    return [{ x: target.x, z: target.z }];
  }
  const s = nearestWalkable(start);
  const t = nearestWalkable(target);
  const cells = astar(s, t);
  if (!cells) return [{ x: target.x, z: target.z }];

  const raw = cells.map((i) => cellCenter(i % COLS, Math.floor(i / COLS)));
  // String-pulling: keep a waypoint only when line of sight breaks.
  const smooth: Vector2D[] = [];
  let anchor: Vector2D = start;
  for (let i = 1; i < raw.length; i++) {
    if (!isLineClear(anchor, raw[i])) {
      smooth.push(raw[i - 1]);
      anchor = raw[i - 1];
    }
  }
  const last = smooth[smooth.length - 1] ?? start;
  if (!isLineClear(last, target)) smooth.push(raw[raw.length - 1]);
  smooth.push({ x: target.x, z: target.z });
  return smooth;
}

function isLineClear(a: Vector2D, b: Vector2D): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(dist / 0.1));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    if (!isWalkable(px, pz, 0.25)) return false;
  }
  return true;
}
