import { describe, expect, it } from 'vitest';
import { createHub } from '../src/hub.js';

describe('createHub', () => {
  it('fans out messages, unsubscribes, and drops failing subscribers', () => {
    const hub = createHub();
    const got: string[] = [];
    const off = hub.subscribe((m) => got.push(m));
    hub.subscribe(() => {
      throw new Error('closed');
    });
    hub.publish('agents', [1]);
    expect(got).toEqual([JSON.stringify({ topic: 'agents', data: [1] })]);
    expect(hub.size()).toBe(1);
    off();
    hub.publish('agents', [2]);
    expect(got).toHaveLength(1);
    expect(hub.size()).toBe(0);
  });
});
