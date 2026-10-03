import { describe, expect, it } from 'vitest';
import { phaseLabel, sampleSky, sunDirection, TIME_PRESETS } from '../src/sims-office/Environment.ts';

describe('The Sims 2 Office: day/night cycle', () => {
  it('is bright at noon and lamp-lit at night', () => {
    const noon = sampleSky(12.5);
    const night = sampleSky(23);
    expect(noon.sunI).toBeGreaterThan(night.sunI * 3);
    expect(noon.lamp).toBeLessThan(0.2);
    expect(night.lamp).toBe(1);
    expect(noon.sky.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(night.sky.getHSL({ h: 0, s: 0, l: 0 }).l);
  });

  it('turns the sky warm at sunset', () => {
    const dusk = sampleSky(18);
    expect(dusk.sky.r).toBeGreaterThan(dusk.sky.b);
    const noon = sampleSky(12.5);
    expect(noon.sky.b).toBeGreaterThan(noon.sky.r);
  });

  it('wraps continuously around midnight', () => {
    const a = sampleSky(23.999);
    const b = sampleSky(0);
    expect(Math.abs(a.sunI - b.sunI)).toBeLessThan(1e-3);
    expect(sampleSky(-1).sunI).toBeCloseTo(sampleSky(23).sunI, 5);
  });

  it('moves the sun from east to west above the horizon', () => {
    const morning = sunDirection(TIME_PRESETS.morning);
    const evening = sunDirection(TIME_PRESETS.evening);
    expect(morning.y).toBeGreaterThan(0);
    expect(evening.y).toBeGreaterThan(0);
    expect(morning.x).toBeGreaterThan(0);
    expect(evening.x).toBeLessThan(0);
    expect(sunDirection(12.25).y).toBeGreaterThan(morning.y);
  });

  it('labels phases in Indonesian', () => {
    expect(phaseLabel(TIME_PRESETS.morning)).toBe('Pagi');
    expect(phaseLabel(TIME_PRESETS.noon)).toBe('Siang');
    expect(phaseLabel(TIME_PRESETS.evening)).toBe('Sore');
    expect(phaseLabel(TIME_PRESETS.night)).toBe('Malam');
  });
});
