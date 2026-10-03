import type { Room, RoomId, Waypoint } from '../../vendor/claude-office/rooms.ts';
import type { Position } from '../../vendor/claude-office/types.ts';
export const WIDTH = 1000, HEIGHT = 700;
export function project(u: number, v: number): Position { return { x: (460 + (u-v)*23)/10, y: (105 + (u+v)*13)/7 }; }
export function unproject(p: Position) { const a=(p.x*10-460)/23, b=(p.y*7-105)/13; return {u:(a+b)/2,v:(b-a)/2}; }
export const AREAS = [
 { id:'main-office' as RoomId, name:'Workspace', u:5,v:2 },
 { id:'meeting-room' as RoomId, name:'Meeting', u:17,v:2 },
 { id:'server-room' as RoomId, name:'Research Lab', u:17,v:12 },
 { id:'nap-room' as RoomId, name:'Lounge', u:4,v:13 },
];
export function areaAt(p: Position): RoomId { const {u,v}=unproject(p); return u>12 ? (v<9?'meeting-room':'server-room') : v>11?'nap-room':'main-office'; }
const nodes: Waypoint[]=[];
const columns=[1,3,5,7,9,13,16], rows=[4,7,10,13];
for(let j=0;j<rows.length;j++) for(let i=0;i<columns.length;i++) {
 const id=`${i}-${j}`; const connections:string[]=[];
 // Divider openings occur on the central corridor and at the meeting/lab entrances.
 if(i>0) connections.push(`${i-1}-${j}`);
 if(i<columns.length-1) connections.push(`${i+1}-${j}`);
 if(j>0) connections.push(`${i}-${j-1}`);
 if(j<rows.length-1) connections.push(`${i}-${j+1}`);
 nodes.push({id,...project(columns[i],rows[j]),connections});
}
const desks: Room['agentSpots']=Array.from({length:10},(_,i)=>({id:`desk-${i}`, type:'desk', ...project(2+(i%5)*2, i<5?3.8:6.8), spriteFacing:'rear-right'}));
export const FLOOR: Room = {id:'main-office',name:'Office',description:'One connected office floor',width:WIDTH,height:HEIGHT,
 background:{day:import.meta.env.BASE_URL+'claude-office/rooms/unified-day.svg',night:import.meta.env.BASE_URL+'claude-office/rooms/unified-night.svg'},
 entryPoint:project(1,10),connections:[],waypoints:nodes,
 walkableArea:[project(0,0),project(20,0),project(20,16),project(0,16)],
 agentSpots:[...desks,{id:'coffee',type:'coffee',...project(7,13)},{id:'meeting',type:'standing',...project(16,7)},{id:'lab',type:'standing',...project(16,13)}],
 furniture:[...desks.map((s,i)=>({id:s.id,type:'desk',sprite:'desk-standing-left-front',...project(2+(i%5)*2,i<5?2.8:5.8)})),
 {id:'meeting-board',type:'whiteboard',sprite:'whiteboard',...project(18,2)},
 {id:'lab-desk',type:'desk',sprite:'desk-standing-left-front',...project(17,11.8)},
 {id:'lab-files',type:'filing-cabinet',sprite:'filing-closed',...project(19,12)},
 {id:'coffee',type:'coffee-machine',sprite:'coffee-off',...project(8,12)},
 ...[[1,1],[19,1],[19,15],[1,15]].map(([u,v],i)=>({id:`plant-${i}`,type:'plant-monstera',sprite:'plant-monstera',...project(u,v)})),
 {id:'kanban-board',type:'whiteboard',sprite:'todo-board',...project(11,1),interactive:true}],
};
export function roomFor(_id: RoomId): Room { return FLOOR; }
export const OFFICE_ROOMS = Object.fromEntries(AREAS.map(a=>[a.id,{...FLOOR,id:a.id,name:a.name}])) as Partial<Record<RoomId,Room>>;
