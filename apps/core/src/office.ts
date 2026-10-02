import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Db } from './db.js';

export const OFFICE_KEYS = ['layout', 'seats', 'settings'] as const;
export type OfficeKey = (typeof OFFICE_KEYS)[number];

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface OfficeState {
  layout: Record<string, unknown> | null;
  seats: Record<string, SeatAssignment>;
  settings: { soundEnabled?: boolean; alwaysShowLabels?: boolean };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateOfficeValue(key: string, value: unknown): string | null {
  if (key === 'layout') {
    if (
      !isObj(value) ||
      value.version !== 1 ||
      typeof value.cols !== 'number' ||
      typeof value.rows !== 'number' ||
      !Array.isArray(value.tiles) ||
      !Array.isArray(value.furniture)
    ) {
      return 'layout must be a version 1 office layout';
    }
    return null;
  }
  if (key === 'seats') {
    if (!isObj(value)) return 'seats must be an object';
    for (const seat of Object.values(value)) {
      if (
        !isObj(seat) ||
        typeof seat.palette !== 'number' ||
        typeof seat.hueShift !== 'number' ||
        !(seat.seatId === null || typeof seat.seatId === 'string')
      ) {
        return 'seats entries need palette, hueShift and seatId';
      }
    }
    return null;
  }
  if (key === 'settings') {
    if (!isObj(value)) return 'settings must be an object';
    for (const [k, v] of Object.entries(value)) {
      if (!['soundEnabled', 'alwaysShowLabels'].includes(k) || typeof v !== 'boolean') {
        return 'settings only accepts boolean soundEnabled / alwaysShowLabels';
      }
    }
    return null;
  }
  return 'unknown office key';
}

export function getOfficeState(db: Db): OfficeState {
  const rows = db.prepare('SELECT key, value FROM office_state').all() as Array<{ key: string; value: string }>;
  const byKey = new Map(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  return {
    layout: (byKey.get('layout') as OfficeState['layout']) ?? null,
    seats: (byKey.get('seats') as OfficeState['seats']) ?? {},
    settings: (byKey.get('settings') as OfficeState['settings']) ?? {},
  };
}

export function putOfficeState(db: Db, key: OfficeKey, value: unknown, now: number): void {
  db.prepare(
    `INSERT INTO office_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}

export function cookieToken(header: string | undefined): string {
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'aos_ui') return rest.join('=');
  }
  return '';
}

export function resolveOfficeFile(officeDir: string, urlPath: string): string | null {
  const root = resolve(officeDir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0].replace(/^\/office\/?/, ''));
  } catch {
    return index;
  }
  if (!rel) return index;
  const candidate = resolve(root, normalize(rel));
  if (!candidate.startsWith(root + sep)) return index;
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : index;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
