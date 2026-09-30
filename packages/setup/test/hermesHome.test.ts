import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermesHomeCandidates, hermesSourceDir, parseLock, resolveHermesHome } from '../src/hermesHome.js';

const LOCAL = 'C:\\Users\\me\\AppData\\Local';

describe('hermesHomeCandidates', () => {
  it('orders explicit overrides before defaults and dedupes', () => {
    const env = { AOS_HERMES_HOME: 'D:\\h', HERMES_HOME: 'D:\\h', LOCALAPPDATA: LOCAL, USERPROFILE: 'C:\\Users\\me' };
    expect(hermesHomeCandidates(env)).toEqual(['D:\\h', join(LOCAL, 'hermes'), join('C:\\Users\\me', '.hermes')]);
  });
});

describe('resolveHermesHome', () => {
  it('returns the first candidate that contains config.yaml', () => {
    const env = { LOCALAPPDATA: LOCAL, USERPROFILE: 'C:\\Users\\me' };
    const expected = join(LOCAL, 'hermes');
    expect(resolveHermesHome({ env, exists: (p) => p === join(expected, 'config.yaml') })).toBe(expected);
  });

  it('accepts a candidate that only has a profiles directory', () => {
    const env = { LOCALAPPDATA: LOCAL };
    const expected = join(LOCAL, 'hermes');
    expect(resolveHermesHome({ env, exists: (p) => p === join(expected, 'profiles') })).toBe(expected);
  });

  it('throws with the checked candidates when nothing exists', () => {
    expect(() => resolveHermesHome({ env: { LOCALAPPDATA: LOCAL }, exists: () => false })).toThrow(
      /HERMES_HOME not found\. Checked: .*hermes/,
    );
  });
});

describe('resolveHermesHome overrides', () => {
  it('returns AOS_HERMES_HOME as-is without checking existence', () => {
    const env = { AOS_HERMES_HOME: 'D:\\custom\\hermes', LOCALAPPDATA: LOCAL };
    expect(resolveHermesHome({ env, exists: () => false })).toBe('D:\\custom\\hermes');
  });

  it('returns HERMES_HOME when AOS_HERMES_HOME is absent', () => {
    const env = { HERMES_HOME: 'E:\\other', LOCALAPPDATA: LOCAL };
    expect(resolveHermesHome({ env, exists: () => false })).toBe('E:\\other');
  });

  it('rejects an unexpanded variable in an override', () => {
    const env = { AOS_HERMES_HOME: '%LOCALAPPDATA%\\hermes' };
    expect(() => resolveHermesHome({ env, exists: () => true })).toThrow(/unexpanded variable/);
    expect(() => resolveHermesHome({ env: { HERMES_HOME: '%X%\\h' }, exists: () => true })).toThrow(
      /HERMES_HOME contains an unexpanded variable/,
    );
  });
});

describe('hermesSourceDir', () => {
  it('points at the installer checkout', () => {
    expect(hermesSourceDir('X')).toBe(join('X', 'hermes-agent'));
  });
});

describe('parseLock', () => {
  it('reads the pinned commit', () => {
    expect(parseLock('# pinned\ncommit=0123abcd4567ef\ninstalled_at=2026-09-30\n')).toEqual({ commit: '0123abcd4567ef' });
  });
  it('rejects a lock without a commit line', () => {
    expect(() => parseLock('installed_at=2026-09-30')).toThrow(/commit=<git sha>/);
  });
});
