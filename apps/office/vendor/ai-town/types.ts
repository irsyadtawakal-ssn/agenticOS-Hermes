// Agentic OS: replace Convex validators with equivalent local types.
export type Point = { x: number; y: number };
export type Vector = { dx: number; dy: number };
// Paths are arrays of [x, y, dx, dy, t] tuples.
export type Path = [number, number, number, number, number][];

export type PathComponent = { position: Point; facing: Vector; t: number };

export function queryPath(p: Path, at: number): PathComponent {
  return unpackPathComponent(p[at]);
}
export function packPathComponent(p: PathComponent): [number, number, number, number, number] {
  return [p.position.x, p.position.y, p.facing.dx, p.facing.dy, p.t];
}
export function unpackPathComponent(p: [number, number, number, number, number]): PathComponent {
  return {
    position: { x: p[0], y: p[1] },
    facing: { dx: p[2], dy: p[3] },
    t: p[4],
  };
}
