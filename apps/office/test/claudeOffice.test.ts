import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advance, clickDestination, createRoster, DESKS, ROOM, sendTo, SPRITES, transferRoom } from '../src/claude-office/model.ts';
import { OFFICE_ROOMS, project } from '../src/claude-office/rooms.ts';

describe('Claude Office / Core bridge', () => {
  it('ships each wing background and keeps its routes on the walkable floor', () => {
    for (const room of Object.values(OFFICE_ROOMS)) {
      for (const path of Object.values(room.background)) expect(existsSync(resolve('public', path.replace(/^\//, '')))).toBe(true);
      for (const waypoint of room.waypoints!) {
        for (const connection of waypoint.connections) expect(room.waypoints!.some(w => w.id === connection)).toBe(true);
        if (room.id !== 'main-office') expect(clickDestination(waypoint)).not.toBeNull();
      }
    }
  });
  it('walks continuously across all areas using one graph, without teleporting', () => {
    let agent = createRoster([], [], 0)[0];
    for (const destination of ['meeting-room','server-room','nap-room','main-office'] as const) {
      agent = transferRoom(agent, destination, 0);
      let previous = agent.position;
      for (let t=0;t<120000 && agent.pathQueue?.length;t+=40) {
        agent=advance(agent,[],[],t,40,false);
        expect(Math.hypot(agent.position.x-previous.x,agent.position.y-previous.y)).toBeLessThanOrEqual(.201);
        previous=agent.position;
      }
      expect(agent.pathQueue).toEqual([]);
      expect(agent.room).toBe(destination);
      expect(agent.coreStatus).toBe('offline');
    }
  });
  it('assigns ten profiles to distinct native desk slots and ships all directions', () => {
    const roster = createRoster([], [], 0);
    expect(roster).toHaveLength(10);
    expect(new Set(roster.map(a => a.assignedSpotId)).size).toBe(10);
    for (const sprite of SPRITES) for (const facing of ['front-left', 'front-right', 'rear-left', 'rear-right'])
      expect(existsSync(resolve('public/claude-office/sprites/characters', `${sprite}-${facing}.png`))).toBe(true);
  });
  it('keeps offline agents stationary and avoids false typing during approval', () => {
    const agent = createRoster([], [], 0)[0];
    expect(advance(agent, [], [], 100000, 40, false).position).toEqual(agent.position);
    const pending = { id: 'approval-1', created_at: 0, profile: 'chief', task_id: null, mode: 'approval', rule_id: 'review', tool: 'execute', args_preview: '{}', reason: null, status: 'pending' };
    const blocked = createRoster([{ profile: 'chief', state: 'working' } as Parameters<typeof createRoster>[0][number]], [pending], 0)[0];
    const settled = advance(blocked, [{ profile: 'chief', state: 'working' } as Parameters<typeof createRoster>[0][number]], [pending], 0, 40, true);
    expect(settled.coreStatus).toBe('waiting');
    expect(settled.state).toBe('idle');
  });
  it('moves along the native graph and arrives without overshooting', () => {
    let agent = sendTo(createRoster([], [], 0)[0], DESKS[9], 100000);
    for (let t = 0; agent.pathQueue?.length && t < 100000; t += 40) agent = advance(agent, [], [], t, 40, false);
    expect(agent.pathQueue).toEqual([]);
    expect(agent.position.x).toBeCloseTo(DESKS[9].x);
    expect(agent.position.y).toBeCloseTo(DESKS[9].y);
  });
  it('rejects clicks outside the room and snaps interior clicks to native waypoints', () => {
    expect(clickDestination({ x: 0, y: 0 })).toBeNull();
    const target = clickDestination(project(16,7));
    expect(target).not.toBeNull();
    expect(ROOM.waypoints!.some(w => w.x === target!.x && w.y === target!.y)).toBe(true);
  });
  it('expires visual overrides and honors reduced motion without changing Core state', () => {
    const original = createRoster([], [], 0)[0];
    const manual = { ...sendTo(original, DESKS[9], 10), position: { x: DESKS[9].x, y: DESKS[9].y } };
    const returned = advance(manual, [], [], 20, 40, true);
    expect(returned.manualUntil).toBe(0);
    expect(returned.position).toEqual(original.deskPosition);
    expect(returned.coreStatus).toBe('offline');
  });
});
