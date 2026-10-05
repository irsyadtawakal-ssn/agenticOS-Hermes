import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addProfileToRegistry, PROFILES, PROFILE_TIERS } from '../src/hermes/labels.ts';
import {
  calculateMotives,
  getProfileMeta,
  saveCustomProfileMeta,
  type SimProfileMeta,
} from '../src/sims-office/SimsMotives.ts';

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

describe('Agent Wizard & Dynamic Profiles Registry', () => {
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    (globalThis as any).localStorage = mockLocalStorage;
    mockLocalStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('dynamically registers a new profile and updates registry & tiers', () => {
    const initialCount = PROFILES.length;
    const testName = 'test-agent-qa';

    expect(PROFILES.includes(testName)).toBe(false);

    addProfileToRegistry({ name: testName, tier: 'os-brain' });

    expect(PROFILES.includes(testName)).toBe(true);
    expect(PROFILES.length).toBe(initialCount + 1);
    expect(PROFILE_TIERS[testName]).toBe('os-brain');

    const stored = JSON.parse(mockLocalStorage.getItem('aos_custom_profiles') || '[]');
    expect(stored.some((p: { name: string }) => p.name === testName)).toBe(true);
  });

  it('saves and retrieves custom SimProfileMeta with custom plumbob and traits', () => {
    const meta: SimProfileMeta = {
      name: 'copywriter-test',
      title: 'Senior Copywriter',
      tier: 'os-worker',
      aspiration: 'Creativity',
      aspirationIcon: '🎨',
      aspirationLabel: 'Kreativitas',
      zodiac: 'Gemini',
      zodiacIcon: '♊',
      traits: ['Kreatif', 'Cepat', 'Storyteller'],
      soulBio: 'Penulis konten andal untuk kampanye marketing.',
      skills: { logic: 8, creativity: 10, charisma: 9, mechanical: 5, cleaning: 7 },
      customPlumbobColor: '#ec4899',
    };

    saveCustomProfileMeta(meta);

    const retrieved = getProfileMeta('copywriter-test');
    expect(retrieved.name).toBe('copywriter-test');
    expect(retrieved.title).toBe('Senior Copywriter');
    expect(retrieved.customPlumbobColor).toBe('#ec4899');
    expect(retrieved.traits).toContain('Storyteller');

    // Motives calculation uses custom plumbob color
    const report = calculateMotives('copywriter-test', {
      approvals: [],
      tasks: [],
      costs: null,
      daily: [],
      health: [{ id: 'core', label: 'Core', status: 'ok', detail: 'normal' }],
      agents: [],
    });

    expect(report.overallMood).toBe('happy');
    expect(report.plumbobColor).toBe('#ec4899');
  });

  it('provides safe fallback SimProfileMeta for unregistered profiles', () => {
    const fallback = getProfileMeta('unknown-random-agent');
    expect(fallback.name).toBe('unknown-random-agent');
    expect(fallback.title).toBe('Agent Specialist');
    expect(fallback.tier).toBe('os-brain');
    expect(fallback.aspiration).toBe('Knowledge');
  });
});
