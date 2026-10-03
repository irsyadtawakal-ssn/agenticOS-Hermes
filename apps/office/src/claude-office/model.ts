import { FLOOR, areaAt, AREAS, project } from './rooms.ts';
import type { RoomId } from '../../vendor/claude-office/rooms.ts';
import type { Agent, Position } from '../../vendor/claude-office/types.ts';
import { stepToward } from '../../vendor/claude-office/agentManager.ts';
import { crewStatus } from '../starship/model.ts';
import type { AgentState, Approval } from '../shell/api.ts';
import { PROFILES } from '../hermes/labels.ts';

export const ROOM = FLOOR;
export const SPRITES = ['Me-1', 'Claude-1', 'dev-1', 'dev-2', 'employee-1', 'employee-2', 'employee-3', 'explore-1', 'Frontend-dev-1', 'security-audit-1'];
export const DESKS = ROOM.agentSpots.filter(spot => spot.type === 'desk');
export type VisualAgent = Agent & { coreStatus: ReturnType<typeof crewStatus>; due: number; manualUntil: number; returning: boolean };
export function createRoster(states: AgentState[], approvals: Approval[], now: number): VisualAgent[] {
  return PROFILES.map((profile, index) => {
    const spot = DESKS[index], coreStatus = crewStatus(profile, states, approvals);
    const position = { x: spot.x, y: spot.y };
    const agent: VisualAgent = { id: profile, name: profile, type: 'subagent', role: profile, state: 'idle',
      position, targetPosition: { x: spot.x, y: spot.y }, deskPosition: { x: spot.x, y: spot.y }, room: 'main-office', assignedRoom: 'main-office',
      assignedSpotId: spot.id, spriteFacing: spot.spriteFacing, color: ['#e6a875','#85b5db','#a5cb8e','#c598de'][index % 4], emoji: '●',
      hiredAt: now, statusText: coreStatus, coreStatus, due: now + 8000 + index * 1400, manualUntil: 0, returning: false,
      pathQueue: [] };
    return agent;
  });
}
function route(from: Position, to: Position): Position[] {
  const nodes=ROOM.waypoints!;
  const nearest=(point:Position)=>nodes.reduce((best,n)=>Math.hypot(n.x-point.x,n.y-point.y)<Math.hypot(best.x-point.x,best.y-point.y)?n:best);
  const start=nearest(from), end=nearest(to), queue=[start.id];
  const parents=new Map<string,string|null>([[start.id,null]]);
  const byId=new Map(nodes.map(n=>[n.id,n]));
  for(let i=0;i<queue.length;i++) { const id=queue[i]; if(id===end.id)break; for(const next of byId.get(id)!.connections)if(!parents.has(next)){parents.set(next,id);queue.push(next);} }
  if(!parents.has(end.id))return [];
  const path:Position[]=[];
  for(let id:string|null=end.id;id!==null;id=parents.get(id)??null){const n=byId.get(id)!;path.unshift({x:n.x,y:n.y});}
  return path;
}
export function sendTo(agent: VisualAgent, target: Position, manualUntil = 0): VisualAgent {
  return { ...agent, targetPosition: target, manualUntil, state: 'walking-to-desk',
    pathQueue: [...route(agent.position, target), target] };
}
export function advance(agent: VisualAgent, state: AgentState[], approvals: Approval[], now: number, dt: number, reduced: boolean): VisualAgent {
  const status = crewStatus(agent.id, state, approvals);
  let next = agent;
  if (status !== agent.coreStatus) next = { ...(!agent.manualUntil ? sendTo(agent, agent.deskPosition) : agent), coreStatus: status, returning: false };
  if (next.manualUntil && now >= next.manualUntil) next = { ...sendTo(next, next.deskPosition), manualUntil: 0, returning: false };
  const active = ['working', 'thinking'].includes(status);
  if (next.pathQueue?.length) {
    if (reduced) next = { ...next, position: next.targetPosition, pathQueue: [] };
    else {
      const step = stepToward(next.position, next.pathQueue[0], Math.min(dt, 80) * 0.005);
      next = { ...next, position: step.position, state: 'walking-to-desk', pathQueue: step.arrived ? next.pathQueue.slice(1) : next.pathQueue };
    }
    if (!next.pathQueue?.length) next = { ...next, state: active ? 'working' : 'idle', due: now + 8000 + PROFILES.indexOf(next.id) * 700 };
  } else if (active) next = { ...next, state: 'working' };
  else if (['offline', 'waiting', 'error'].includes(status)) next = { ...next, state: 'idle' };
  else if (next.room === 'main-office' && now > next.due && now > next.manualUntil && !reduced) {
    const spots = ROOM.agentSpots.filter(spot => spot.type === 'coffee');
    const target = next.returning ? next.deskPosition : spots[PROFILES.indexOf(next.id) % spots.length];
    next = { ...sendTo(next, target), returning: !next.returning, due: now + 12000 };
  }
  return { ...next, room: areaAt(next.position), statusText: status };
}
export function clickDestination(point: Position): Position | null {
  const currentRoom = ROOM;
  const polygon = currentRoom.walkableArea!;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  if (!inside) return null;
  // Native room routes are calibrated nodes. Snap clicks to these safe locations.
  return currentRoom.waypoints!.reduce((best, node) => Math.hypot(node.x - point.x, node.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y) ? node : best);
}

export function transferRoom(agent: VisualAgent, destination: RoomId, now: number): VisualAgent {
  const area = AREAS.find(a => a.id === destination)!;
  return sendTo(agent, destination === 'main-office' ? agent.deskPosition : project(area.id === 'nap-room' ? 7 : 16, area.id === 'meeting-room' ? 7 : 13), now + 120000);
}
