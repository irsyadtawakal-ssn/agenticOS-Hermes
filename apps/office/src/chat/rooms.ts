import { PROFILES } from '../hermes/labels.ts';

export interface ChatRoom {
  id: string; // e.g. 'room:sukashawarma', 'room:custom-xxx'
  name: string;
  icon: string;
  description: string;
  members: string[];
  isDefault?: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'aos_custom_chat_rooms';

export const DEFAULT_ROOMS: ChatRoom[] = [
  {
    id: 'room:sukashawarma',
    name: 'Divisi SukaShawarma',
    icon: '🌯',
    description: 'Saluran operasional restoran 21 cabang, e-commerce, forensik audit, & WA dispatch',
    members: ['tara', 'adelia', 'clara', 'maya'],
    isDefault: true,
    createdAt: 1700000000000,
  },
  {
    id: 'room:eksekutif',
    name: 'Strata Eksekutif (Boardroom)',
    icon: '⚡',
    description: 'Rapat direksi & pimpinan kantor (Arthur & Tara)',
    members: ['chief', 'tara'],
    isDefault: true,
    createdAt: 1700000001000,
  },
  {
    id: 'room:core',
    name: 'Divisi Core & Engineering',
    icon: '💻',
    description: 'Tim teknik, riset web, asisten, konten, dan utilitas workstation',
    members: ['chief', 'dev', 'researcher', 'secretary', 'content', 'hermes-default'],
    isDefault: true,
    createdAt: 1700000002000,
  },
  {
    id: 'room:townhall',
    name: 'Town Hall (Semua Tim)',
    icon: '📢',
    description: 'Ruang koordinasi umum seluruh 10 agen kantor AI',
    members: [...PROFILES],
    isDefault: true,
    createdAt: 1700000003000,
  },
];

function loadCustomRooms(): ChatRoom[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.members));
    }
  } catch (err) {
    console.warn('Failed to load custom chat rooms:', err);
  }
  return [];
}

let cachedRooms: ChatRoom[] = [...DEFAULT_ROOMS, ...loadCustomRooms()];
const roomListeners = new Set<() => void>();

function notifyRoomsChanged(): void {
  for (const listener of roomListeners) {
    try {
      listener();
    } catch {}
  }
}

export function getAllRooms(): ChatRoom[] {
  return [...cachedRooms];
}

export function getRoomById(id: string): ChatRoom | undefined {
  return cachedRooms.find((r) => r.id === id);
}

export function isRoomId(id: string): boolean {
  return id.startsWith('room:');
}

export function saveRoom(data: { name: string; icon: string; description: string; members: string[] }): ChatRoom {
  const newRoom: ChatRoom = {
    id: `room:custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.name.trim() || 'Room Baru',
    icon: data.icon || '💬',
    description: data.description.trim() || 'Ruang obrolan agen kustom',
    members: data.members.length > 0 ? data.members : [...PROFILES],
    isDefault: false,
    createdAt: Date.now(),
  };

  const customs = loadCustomRooms();
  customs.push(newRoom);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
  }
  cachedRooms = [...DEFAULT_ROOMS, ...customs];
  notifyRoomsChanged();
  return newRoom;
}

export function deleteRoom(id: string): boolean {
  const target = getRoomById(id);
  if (!target || target.isDefault) return false;

  const customs = loadCustomRooms().filter((r) => r.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
  }
  cachedRooms = [...DEFAULT_ROOMS, ...customs];
  notifyRoomsChanged();
  return true;
}

export function subscribeRooms(listener: () => void): () => void {
  roomListeners.add(listener);
  return () => {
    roomListeners.delete(listener);
  };
}
