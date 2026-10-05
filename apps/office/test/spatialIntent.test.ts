import { describe, expect, it } from 'vitest';
import { parseOfficeSpatialIntent } from '../src/sims-office/spatialIntent.ts';

describe('Office Spatial Intent Parser', () => {
  it('detects gather in chief office from user prompt with specific mentioned agent', () => {
    // Exact user prompt from issue: "bisa kumpul di ruangan saya bersama adelia"
    const res = parseOfficeSpatialIntent('bisa kumpul di ruangan saya bersama adelia', 'tara');
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_chief_office');
    expect(res?.targets).toContain('adelia');
    expect(res?.targets).toContain('tara');
    expect(res?.isAll).toBe(false);
  });

  it('detects gather in chief office with 1-on-1 chat context ("keruangan saya pak")', () => {
    // Exact user prompt from issue: "keruangan saya pak"
    const res = parseOfficeSpatialIntent('keruangan saya pak', 'tara');
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_chief_office');
    expect(res?.targets).toEqual(['tara']);
    expect(res?.isAll).toBe(false);
  });

  it('detects gather in chief office when addressed to all ("semua ke ruangan saya")', () => {
    const res = parseOfficeSpatialIntent('semua ke ruangan saya sekarang', 'all');
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_chief_office');
    expect(res?.isAll).toBe(true);
    expect(res?.targets.length).toBeGreaterThan(5);
  });

  it('detects meeting room gathering ("semua ke ruang rapat")', () => {
    const res = parseOfficeSpatialIntent('tim, kita meeting di ruang rapat', 'all');
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_meeting_room');
    expect(res?.isAll).toBe(true);
  });

  it('detects SukaShawarma room gathering ("kumpul di ruang sukashawarma")', () => {
    const res = parseOfficeSpatialIntent('kumpul di ruang sukashawarma', ['tara', 'adelia', 'clara', 'maya']);
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_meeting_room');
    expect(res?.targets).toEqual(['tara', 'adelia', 'clara', 'maya']);
  });

  it('detects return to workstation ("kembali ke meja masing-masing")', () => {
    const res = parseOfficeSpatialIntent('rapat selesai, silakan kembali ke meja masing-masing', 'chief');
    expect(res).not.toBeNull();
    expect(res?.action).toBe('return_workstation');
  });

  it('detects pantry break intent ("adelia istirahat dulu ke pantry")', () => {
    const res = parseOfficeSpatialIntent('adelia istirahat dulu ke pantry ya', null);
    expect(res).not.toBeNull();
    expect(res?.action).toBe('go_pantry');
    expect(res?.targets).toEqual(['adelia']);
  });

  it('targets only selected agents when user broadcasts to a subset ("tolong ke ruangan saya" to clara & tara)', () => {
    // Exact user scenario from screenshot: broadcast to 2 agents
    const res = parseOfficeSpatialIntent('tolong ke ruangan saya', ['clara', 'tara']);
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_chief_office');
    expect(res?.targets).toEqual(['clara', 'tara']);
    expect(res?.isAll).toBe(false);
  });

  it('overrides subset targets when user explicitly says "semua" in prompt', () => {
    const res = parseOfficeSpatialIntent('tolong semua ke ruangan saya', ['clara', 'tara']);
    expect(res).not.toBeNull();
    expect(res?.action).toBe('gather_chief_office');
    expect(res?.isAll).toBe(true);
    expect(res?.targets.length).toBeGreaterThan(5);
  });

  it('handles variations such as "keruangan saya seakrang", "ke sini sekarang", and "ruangan saya"', () => {
    const res1 = parseOfficeSpatialIntent('keruangan saya seakrang', 'tara');
    expect(res1?.action).toBe('gather_chief_office');
    expect(res1?.targets).toEqual(['tara']);

    const res2 = parseOfficeSpatialIntent('ke sini sekarang', 'adelia');
    expect(res2?.action).toBe('gather_chief_office');
    expect(res2?.targets).toEqual(['adelia']);

    const res3 = parseOfficeSpatialIntent('ruangan saya', 'maya');
    expect(res3?.action).toBe('gather_chief_office');
    expect(res3?.targets).toEqual(['maya']);
  });

  it('ignores normal messages without spatial intent', () => {
    expect(parseOfficeSpatialIntent('tolong buatkan analisis data penjualan')).toBeNull();
    expect(parseOfficeSpatialIntent('halo adelia selamat pagi', 'adelia')).toBeNull();
    expect(parseOfficeSpatialIntent('ada error di script python', 'dev')).toBeNull();
  });
});
