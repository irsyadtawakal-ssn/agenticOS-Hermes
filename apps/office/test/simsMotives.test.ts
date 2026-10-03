import { describe, expect, it } from 'vitest';
import { calculateMotives, getProfileMeta } from '../src/sims-office/SimsMotives.ts';
import { PROFILES } from '../src/hermes/labels.ts';

describe('The Sims 2 Office: SimsMotives & Profile Metadata', () => {
  it('provides rich metadata for every roster profile', () => {
    for (const p of PROFILES) {
      const meta = getProfileMeta(p);
      expect(meta.name).toBe(p);
      expect(meta.title).toBeTruthy();
      expect(meta.aspiration).toBeTruthy();
      expect(meta.traits.length).toBeGreaterThan(0);
      expect(meta.soulBio.length).toBeGreaterThan(15);
      expect(meta.skills.logic).toBeGreaterThanOrEqual(1);
    }
  });

  it('calculates happy green motives for healthy idle agent', () => {
    const report = calculateMotives('chief', {
      approvals: [],
      tasks: [],
      costs: null,
      daily: [],
      health: [{ id: 'core', label: 'Core', status: 'ok', detail: 'OK' }],
      agents: [{ profile: 'chief', state: 'idle', task_id: null, detail: null, updated_at: null }],
    });

    expect(report.overallMood).toBe('happy');
    expect(report.plumbobColor).toBe('#22c55e');
    expect(report.motives.length).toBe(5);

    // All motives should be in the green zone (> 65)
    for (const m of report.motives) {
      expect(m.value).toBeGreaterThan(65);
      expect(m.color).toBe('green');
    }
  });

  it('drops social motive to yellow/red when approvals are pending', () => {
    const reportWithApproval = calculateMotives('dev', {
      approvals: [
        {
          id: 'app_1',
          created_at: Date.now(),
          profile: 'dev',
          task_id: 't_1',
          mode: 'ask',
          rule_id: 'r_shell',
          tool: 'terminal',
          args_preview: 'npm install',
          reason: 'Perlu install paket',
          status: 'pending',
        },
      ],
      tasks: [],
      costs: null,
      daily: [],
      health: [],
      agents: [{ profile: 'dev', state: 'working', task_id: 't_1', detail: null, updated_at: null }],
    });

    const social = reportWithApproval.motives.find((m) => m.id === 'social');
    expect(social).toBeDefined();
    expect(social?.value).toBe(40);
    expect(social?.color).toBe('yellow');
    expect(reportWithApproval.overallMood).toBe('neutral');
    expect(reportWithApproval.plumbobColor).toBe('#eab308');
  });

  it('drops energy motive to red when agent is in error/blocked state', () => {
    const reportError = calculateMotives('researcher', {
      approvals: [],
      tasks: [],
      costs: null,
      daily: [],
      health: [],
      agents: [{ profile: 'researcher', state: 'error', task_id: null, detail: 'Failed', updated_at: null }],
    });

    const energy = reportError.motives.find((m) => m.id === 'energy');
    expect(energy).toBeDefined();
    expect(energy?.value).toBe(20);
    expect(energy?.color).toBe('red');
    expect(reportError.overallMood).toBe('stressed');
    expect(reportError.plumbobColor).toBe('#ef4444');
  });

  it('reflects system health down status in environment motive', () => {
    const reportEnv = calculateMotives('chief', {
      approvals: [],
      tasks: [],
      costs: null,
      daily: [],
      health: [
        { id: 'hermes', label: 'Hermes', status: 'down', detail: 'crash' },
        { id: 'docker', label: 'Docker', status: 'down', detail: 'crash' },
        { id: 'core', label: 'Core', status: 'ok', detail: 'ok' },
      ],
      agents: [],
    });

    const env = reportEnv.motives.find((m) => m.id === 'environment');
    expect(env).toBeDefined();
    expect(env?.value).toBe(33);
    expect(env?.color).toBe('red');
  });
});
