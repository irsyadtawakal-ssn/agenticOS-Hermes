import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ROOMS,
  deleteRoom,
  getAllRooms,
  getRoomById,
  isRoomId,
  saveRoom,
  subscribeRooms,
} from '../src/chat/rooms.ts';
import { getRoomTimeline } from '../src/chat/store.ts';
import type { ChatItem } from '../src/chat/model.ts';

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    for (const k in storage) delete storage[k];
  },
};

describe('Chat Rooms Management & Timeline', () => {
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    (globalThis as any).localStorage = mockLocalStorage;
    mockLocalStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  describe('Default Rooms & ID Check', () => {
    it('defines default rooms for SukaShawarma, Eksekutif, Core, and Townhall', () => {
      const roomIds = DEFAULT_ROOMS.map((r) => r.id);
      expect(roomIds).toContain('room:sukashawarma');
      expect(roomIds).toContain('room:eksekutif');
      expect(roomIds).toContain('room:core');
      expect(roomIds).toContain('room:townhall');

      const suka = DEFAULT_ROOMS.find((r) => r.id === 'room:sukashawarma');
      expect(suka?.members).toEqual(['tara', 'adelia', 'clara', 'maya']);
      expect(suka?.icon).toBe('🌯');

      const exec = DEFAULT_ROOMS.find((r) => r.id === 'room:eksekutif');
      expect(exec?.members).toEqual(['chief', 'tara']);
      expect(exec?.icon).toBe('⚡');
    });

    it('identifies room ids correctly', () => {
      expect(isRoomId('room:sukashawarma')).toBe(true);
      expect(isRoomId('room:custom-123')).toBe(true);
      expect(isRoomId('chief')).toBe(false);
      expect(isRoomId('tara')).toBe(false);
      expect(isRoomId('adelia')).toBe(false);
    });

    it('retrieves room by id', () => {
      const room = getRoomById('room:sukashawarma');
      expect(room).toBeDefined();
      expect(room?.name).toBe('Divisi SukaShawarma');

      const nonExistent = getRoomById('room:non-existent');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('Custom Room Creation & Deletion', () => {
    it('saves a new custom room, persists to storage, and notifies subscribers', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeRooms(listener);

      const created = saveRoom({
        name: 'Tim Desain & UI',
        icon: '🎨',
        description: 'Diskusi visual dan brand guidelines',
        members: ['content', 'maya'],
      });

      expect(created.id.startsWith('room:custom-')).toBe(true);
      expect(created.name).toBe('Tim Desain & UI');
      expect(created.icon).toBe('🎨');
      expect(created.members).toEqual(['content', 'maya']);
      expect(created.isDefault).toBe(false);

      expect(listener).toHaveBeenCalledTimes(1);

      // Should be searchable via getAllRooms and getRoomById
      expect(getAllRooms().some((r) => r.id === created.id)).toBe(true);
      expect(getRoomById(created.id)).toEqual(created);

      // Clean up
      unsubscribe();
    });

    it('refuses to delete default rooms', () => {
      const deleted = deleteRoom('room:sukashawarma');
      expect(deleted).toBe(false);
      expect(getRoomById('room:sukashawarma')).toBeDefined();
    });

    it('deletes custom room and notifies subscribers', () => {
      const created = saveRoom({
        name: 'Temporary Ops',
        icon: '🚀',
        description: 'Short task room',
        members: ['adelia', 'clara'],
      });

      const listener = vi.fn();
      const unsubscribe = subscribeRooms(listener);

      const deleted = deleteRoom(created.id);
      expect(deleted).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(getRoomById(created.id)).toBeUndefined();

      unsubscribe();
    });
  });

  describe('getRoomTimeline()', () => {
    it('aggregates messages from all room members and sorts chronologically', () => {
      const fakeItem = (id: string, profile: string, text: string): ChatItem => ({
        id,
        kind: 'assistant',
        profile,
        text,
        streaming: false,
      });

      const mockState: { chats: Record<string, any> } = {
        chats: {
          tara: {
            items: [fakeItem('item-101', 'tara', 'Halo tim shawarma!')],
            status: 'idle',
            error: null,
            model: 'auto',
            busy: false,
          },
          adelia: {
            items: [fakeItem('item-102', 'adelia', 'Forensik audit siap.')],
            status: 'idle',
            error: null,
            model: 'auto',
            busy: false,
          },
          dev: {
            items: [fakeItem('item-103', 'dev', 'Server deployment done.')],
            status: 'idle',
            error: null,
            model: 'auto',
            busy: false,
          },
        },
      };

      // Room members: tara & adelia (dev is excluded)
      const roomTimeline = getRoomTimeline(mockState as any, ['tara', 'adelia'], 'all');
      expect(roomTimeline).toHaveLength(2);
      expect(roomTimeline[0].id).toBe('item-101');
      expect(roomTimeline[1].id).toBe('item-102');

      // Filter by specific member: adelia
      const adeliaTimeline = getRoomTimeline(mockState as any, ['tara', 'adelia'], 'adelia');
      expect(adeliaTimeline).toHaveLength(1);
      expect(adeliaTimeline[0].id).toBe('item-102');
    });
  });
});
