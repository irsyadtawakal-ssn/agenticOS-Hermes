import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { contentType, cookieToken, getOfficeState, putOfficeState, resolveOfficeFile, validateOfficeValue } from '../src/office.js';

describe('office state', () => {
  it('starts empty and stores layout, seats and settings', () => {
    const db = openCoreDb(':memory:');
    expect(getOfficeState(db)).toEqual({ layout: null, seats: {}, settings: {} });
    putOfficeState(db, 'layout', { version: 1, cols: 2, rows: 2, tiles: [0, 0, 0, 0], furniture: [] }, 1);
    putOfficeState(db, 'seats', { '1': { palette: 0, hueShift: 0, seatId: 's1' } }, 2);
    putOfficeState(db, 'settings', { alwaysShowLabels: false }, 3);
    expect(getOfficeState(db)).toEqual({
      layout: { version: 1, cols: 2, rows: 2, tiles: [0, 0, 0, 0], furniture: [] },
      seats: { '1': { palette: 0, hueShift: 0, seatId: 's1' } },
      settings: { alwaysShowLabels: false },
    });
  });

  it('validates values per key', () => {
    expect(validateOfficeValue('layout', { version: 1, cols: 2, rows: 2, tiles: [], furniture: [] })).toBeNull();
    expect(validateOfficeValue('layout', { version: 2 })).toMatch(/layout/);
    expect(validateOfficeValue('layout', null)).toMatch(/layout/);
    expect(validateOfficeValue('seats', { '1': { palette: 1, hueShift: 0, seatId: null } })).toBeNull();
    expect(validateOfficeValue('seats', [])).toMatch(/seats/);
    expect(validateOfficeValue('settings', { soundEnabled: true, alwaysShowLabels: false })).toBeNull();
    expect(validateOfficeValue('settings', { soundEnabled: 'yes' })).toMatch(/settings/);
    expect(validateOfficeValue('nope', {})).toMatch(/unknown/);
  });
});

describe('cookies and static files', () => {
  it('reads the aos_ui cookie', () => {
    expect(cookieToken('a=1; aos_ui=tok123; b=2')).toBe('tok123');
    expect(cookieToken(undefined)).toBe('');
    expect(cookieToken('aos_uix=1')).toBe('');
  });

  it('resolves office files safely with SPA fallback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-office-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'x');
    expect(resolveOfficeFile(dir, '/office/')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/assets/app.js')).toBe(join(dir, 'assets', 'app.js'));
    expect(resolveOfficeFile(dir, '/office/some/route')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/../../secret.txt')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/%2e%2e/%2e%2e/x')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(join(dir, 'missing'), '/office/')).toBeNull();
    expect(contentType('a.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('a.png')).toBe('image/png');
    expect(contentType('a.unknown')).toBe('application/octet-stream');
  });
});
