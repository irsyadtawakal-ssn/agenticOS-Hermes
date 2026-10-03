import { Container, Graphics, Text } from 'pixi.js';
import { floorToScreen } from './isometric.ts';
import { consoleFootprint, ROOMS, roomDoor, stationFor, workPosition } from './model.ts';
import { PROFILES } from '../hermes/labels.ts';
import type { Footprint } from './model.ts';
import type { Point } from '../../vendor/ai-town/types.ts';

function polygon(g: Graphics, points: Point[], color: number, alpha = 1) {
  g.beginFill(color, alpha).drawPolygon(points.flatMap(p => [p.x, p.y])).endFill();
}
function floor(g: Graphics, r: Footprint, color: number, height = 0, alpha = 1) {
  polygon(g, [floorToScreen({ x: r.x, y: r.y }, height), floorToScreen({ x: r.x + r.w, y: r.y }, height), floorToScreen({ x: r.x + r.w, y: r.y + r.h }, height), floorToScreen({ x: r.x, y: r.y + r.h }, height)], color, alpha);
}
// Every solid object shares its footprint with the logical collision map.
function box(g: Graphics, r: Footprint, height: number, top: number, left: number, right: number) {
  const b = { x: r.x + r.w, y: r.y }, c = { x: r.x + r.w, y: r.y + r.h }, d = { x: r.x, y: r.y + r.h };
  polygon(g, [floorToScreen(d), floorToScreen(c), floorToScreen(c, height), floorToScreen(d, height)], left);
  polygon(g, [floorToScreen(b), floorToScreen(c), floorToScreen(c, height), floorToScreen(b, height)], right);
  floor(g, r, top, height);
}
function plate(parent: Container, text: string, point: Point, color: number, size = 11) {
  const p = floorToScreen(point);
  const t = new Text(text, { fontFamily: 'monospace', fontSize: size, fill: color, letterSpacing: 1.8 });
  t.position.set(p.x, p.y); parent.addChild(t);
}
function objectLayer(depth: Container, r: Footprint): Graphics {
  const g = new Graphics(); g.zIndex = r.x + r.w + r.y + r.h; depth.addChild(g); return g;
}
function wall(depth: Container, r: Footprint, height: number, accent: number) {
  const g = objectLayer(depth, r);
  box(g, r, height, 0x435c76, 0x18273c, 0x22344d);
  floor(g, r, accent, height + 1, 0.7);
  // Recessed strips on the inside surface give the room a warm, inhabited feel.
  const a = floorToScreen({ x: r.x + r.w, y: r.y + r.h }, height - 14);
  const b = floorToScreen({ x: r.x, y: r.y }, height - 14);
  g.lineStyle(2, accent, 0.5).moveTo(a.x, a.y).lineTo(b.x, b.y);
}
function roomWalls(depth: Container, room: typeof ROOMS[number]) {
  const door = roomDoor(room), thick = 24;
  const sides = [
    { x: room.x, y: room.y, w: room.w, h: thick },
    { x: room.x, y: room.y + room.h - thick, w: room.w, h: thick },
    { x: room.x, y: room.y + thick, w: thick, h: room.h - thick * 2 },
    { x: room.x + room.w - thick, y: room.y + thick, w: thick, h: room.h - thick * 2 },
  ];
  for (const [index, side] of sides.entries()) {
    const overlaps = side.x < door.x + door.w && side.x + side.w > door.x && side.y < door.y + door.h && side.y + side.h > door.y;
    const pieces = !overlaps ? [side] : side.w > side.h
      ? [{ ...side, w: door.x - side.x }, { ...side, x: door.x + door.w, w: side.x + side.w - door.x - door.w }]
      : [{ ...side, h: door.y - side.y }, { ...side, y: door.y + door.h, h: side.y + side.h - door.y - door.h }];
    // Back walls tall, front walls cut low so all crew remain discoverable.
    for (const piece of pieces) {
      if (piece.w <= 0 || piece.h <= 0) continue;
      // Short segments avoid a long diagonal wall sorting in front of unrelated crew.
      const horizontal = side.w > side.h, length = horizontal ? piece.w : piece.h;
      for (let offset = 0; offset < length; offset += 24) {
        const segment = horizontal ? { ...piece, x: piece.x + offset, w: Math.min(24, length - offset) } : { ...piece, y: piece.y + offset, h: Math.min(24, length - offset) };
        wall(depth, segment, index === 0 || index === 2 ? 58 : 18, room.color);
      }
    }
  }
  const threshold = new Graphics(); depth.addChild(threshold); threshold.zIndex = door.x + door.y;
  floor(threshold, door, 0x335369);
  floor(threshold, { x: door.x + 3, y: door.y + 3, w: door.w - 6, h: door.h - 6 }, room.color, 1, 0.45);
}
function consoleDesk(depth: Container, profile: string, color: number) {
  const r = consoleFootprint(profile), g = objectLayer(depth, r);
  floor(g, { x: r.x - 4, y: r.y - 4, w: r.w + 10, h: r.h + 10 }, 0x000000, 0, 0.25);
  box(g, r, 21, 0x526b80, 0x27394d, 0x1a2c40);
  const monitor = { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: 10 };
  box(g, monitor, 38, 0x253c53, 0x112036, 0x1a2d43);
  const a = floorToScreen({ x: monitor.x + 3, y: monitor.y + monitor.h }, 34), b = floorToScreen({ x: monitor.x + monitor.w - 3, y: monitor.y + monitor.h }, 34);
  g.lineStyle(6, color, 0.75).moveTo(a.x, a.y).lineTo(b.x, b.y);
  floor(g, { x: r.x + 10, y: r.y + 23, w: 26, h: 8 }, 0x16283e, 22);
  floor(g, { x: r.x + 12, y: r.y + 24, w: 22, h: 2 }, color, 23, 0.65);
  const p = workPosition(profile), seat = floorToScreen({ x: p.x, y: p.y - 4 });
  // Seats are markers at the work anchor, not blocked navigation cells.
  g.lineStyle(1, color, 0.3).drawEllipse(seat.x, seat.y, 17, 7);
}

export function drawIsometricDeck(world: Container): Container {
  const base = new Container(); world.addChild(base);
  const depth = new Container(); depth.sortableChildren = true; world.addChild(depth);
  const annotations = new Container(); world.addChild(annotations);
  const hull = new Graphics(); base.addChild(hull);
  const outline = [{ x: 420, y: 84 }, { x: 780, y: 84 }, { x: 804, y: 300 }, { x: 1092, y: 300 }, { x: 1092, y: 708 }, { x: 780, y: 708 }, { x: 780, y: 660 }, { x: 420, y: 660 }, { x: 420, y: 708 }, { x: 108, y: 708 }, { x: 108, y: 300 }, { x: 396, y: 300 }];
  polygon(hull, outline.map(p => floorToScreen(p, -16)), 0x223953);
  polygon(hull, outline.map(p => floorToScreen(p)), 0x0c1b2d);
  // Exposed central deck with two service passages.
  for (const r of [{ x: 408, y: 288, w: 384, h: 168 }, { x: 408, y: 456, w: 24, h: 240 }, { x: 768, y: 456, w: 24, h: 240 }]) floor(hull, r, 0x28364a);
  for (const room of ROOMS) {
    const g = new Graphics(); base.addChild(g);
    floor(g, room, 0x25364b);
    // Alternating panels, subtle bevels, and an illuminated inset perimeter.
    for (let x = room.x + 24; x < room.x + room.w - 24; x += 24) {
      for (let y = room.y + 24; y < room.y + room.h - 24; y += 24) {
        floor(g, { x: x + 1, y: y + 1, w: 22, h: 22 }, ((x + y) / 24) % 2 ? 0x304156 : 0x2c3c50);
      }
    }
    roomWalls(depth, room);
    for (const profile of PROFILES.filter(p => stationFor(p) === room.id)) consoleDesk(depth, profile, room.color);
    plate(annotations, room.name, { x: room.x + 36, y: room.y + 36 }, room.color, 10);
    if (room.id === 'bridge') {
      const window = objectLayer(depth, { x: room.x + 36, y: room.y + 24, w: room.w - 72, h: 12 });
      box(window, { x: room.x + 36, y: room.y + 24, w: room.w - 72, h: 12 }, 56, 0x20374d, 0x133650, 0x173f59);
      const a = floorToScreen({ x: room.x + 40, y: room.y + 36 }, 43), b = floorToScreen({ x: room.x + room.w - 40, y: room.y + 36 }, 43);
      window.lineStyle(12, 0x64d9e9, 0.18).moveTo(a.x, a.y).lineTo(b.x, b.y);
      window.lineStyle(1, 0xa5eeff, 0.8).moveTo(a.x, a.y + 8).lineTo(b.x, b.y + 8);
    }
    if (room.id === 'engineering') {
      const r = { x: 696, y: 528, w: 48, h: 72 }, g = objectLayer(depth, r);
      box(g, r, 10, 0x456d70, 0x1f404b, 0x223747);
      const p = floorToScreen({ x: 720, y: 564 });
      g.beginFill(0x75f9da, 0.13).drawEllipse(p.x, p.y - 27, 30, 47).endFill();
      g.lineStyle(4, 0x8cfbe1, 0.9).moveTo(p.x, p.y - 54).lineTo(p.x, p.y - 7);
      for (const h of [8, 26, 47]) g.lineStyle(2, 0x76d8d2).drawEllipse(p.x, p.y - h, 17, 7);
    }
    if (room.id === 'lounge') {
      const r = { x: 168, y: 600, w: 144, h: 36 }, g = objectLayer(depth, r);
      box(g, r, 14, 0x7b8aa2, 0x485f7d, 0x344963);
      box(g, { x: r.x, y: r.y, w: r.w, h: 9 }, 30, 0xa0acbe, 0x617793, 0x4b647e);
      for (let n = 0; n < 3; n++) floor(g, { x: r.x + 6 + n * 44, y: r.y + 11, w: 36, h: 20 }, n === 1 ? 0xb39571 : 0x8698b1, 15);
    }
  }
  // Navigation stripes on the promenade, with unobstructed walking lanes.
  for (const x of [438, 762]) floor(hull, { x, y: 306, w: 3, h: 132 }, 0x6ee3e7, 1, 0.4);
  plate(annotations, 'O D Y S S E Y  /  DECK 01', { x: 480, y: 320 }, 0x8199af, 11);
  plate(annotations, 'COMMAND • SCIENCE • ENGINEERING', { x: 480, y: 342 }, 0x617f99, 8);
  return depth;
}
