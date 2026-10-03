import { describe, expect, it } from 'vitest';
import { AnchorRegistry } from '../src/sims-office/AnchorRegistry.ts';
import { IDLE_ANCHORS, WORKSTATION_ANCHORS } from '../src/sims-office/NavigationMesh.ts';

describe('The Sims 2 Office: seat reservations', () => {
  const couch = IDLE_ANCHORS.find((a) => a.activity === 'couch')!;

  it('lets only one Sim claim a seat', () => {
    const reg = new AnchorRegistry();
    expect(reg.reserve(couch, 'dev')).toBe(true);
    expect(reg.reserve(couch, 'maya')).toBe(false);
    expect(reg.holder(couch)).toBe('dev');
    expect(reg.isFree(couch, 'dev')).toBe(true);
    expect(reg.isFree(couch, 'maya')).toBe(false);
  });

  it('frees the old seat when a Sim moves on', () => {
    const reg = new AnchorRegistry();
    const other = IDLE_ANCHORS.find((a) => a.activity === 'coffee')!;
    reg.reserve(couch, 'dev');
    reg.reserve(other, 'dev');
    expect(reg.isFree(couch)).toBe(true);
    expect(reg.reserve(couch, 'maya')).toBe(true);
    reg.release('maya');
    expect(reg.isFree(couch)).toBe(true);
  });

  it('treats two anchor objects at the same spot as the same seat', () => {
    const reg = new AnchorRegistry();
    reg.reserve(couch, 'dev');
    expect(reg.reserve({ ...couch }, 'clara')).toBe(false);
  });

  it('has no two anchors sharing a physical spot', () => {
    const all = [...Object.values(WORKSTATION_ANCHORS), ...IDLE_ANCHORS];
    const keys = all.map((a) => AnchorRegistry.key(a));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
