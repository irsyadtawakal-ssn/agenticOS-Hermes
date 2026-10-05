import { describe, expect, it } from 'vitest';
import { getProfileMeta } from '../src/sims-office/SimsMotives.ts';
import { SOUL_CONTENTS } from '../src/hermes/souls.ts';
import { PROFILES } from '../src/hermes/labels.ts';

describe('Soul.md, LLM Specification & Duties Verification', () => {
  it('ensures all 10 roster profiles have LLM model, provider, soulFile, and duties populated', () => {
    for (const p of PROFILES) {
      const meta = getProfileMeta(p);

      // LLM Engine Verification
      expect(meta.llmModel, `Missing llmModel for ${p}`).toBeTruthy();
      expect(meta.llmProvider, `Missing llmProvider for ${p}`).toBeTruthy();
      expect(typeof meta.llmModel).toBe('string');
      expect(typeof meta.llmProvider).toBe('string');

      // Soul file path verification
      expect(meta.soulFile, `Missing soulFile for ${p}`).toBe(`infra/profiles/soul/${p}.md`);

      // Duties verification (Tugas)
      expect(Array.isArray(meta.duties), `Duties should be an array for ${p}`).toBe(true);
      expect(meta.duties!.length, `Duties should not be empty for ${p}`).toBeGreaterThan(0);
      for (const duty of meta.duties!) {
        expect(duty.length).toBeGreaterThan(10);
      }
    }
  });

  it('verifies tier-specific LLM routing matches 9router combos.md', () => {
    // os-brain tier profiles should use Claude 3.5 Sonnet
    const brainProfiles = ['chief', 'dev', 'hermes-default', 'adelia', 'clara', 'crib', 'maya'];
    for (const p of brainProfiles) {
      const meta = getProfileMeta(p);
      expect(meta.tier).toBe('os-brain');
      expect(meta.llmModel).toBe('Claude 3.5 Sonnet');
      expect(meta.llmProvider).toBe('9Router (os-brain)');
      expect(meta.llmFallback).toBe('Gemini 3.1 Pro');
    }

    // os-worker tier profiles should use Nemotron 3 Super 120B
    const workerProfiles = ['researcher', 'content'];
    for (const p of workerProfiles) {
      const meta = getProfileMeta(p);
      expect(meta.tier).toBe('os-worker');
      expect(meta.llmModel).toBe('Nemotron 3 Super 120B');
      expect(meta.llmProvider).toBe('9Router (os-worker)');
      expect(meta.llmFallback).toBe('Gemini 3.8 Flash');
    }

    // os-private tier profiles should use Gemini 3.8 Flash with local fallback
    const privateProfiles = ['secretary'];
    for (const p of privateProfiles) {
      const meta = getProfileMeta(p);
      expect(meta.tier).toBe('os-private');
      expect(meta.llmModel).toBe('Gemini 3.8 Flash');
      expect(meta.llmProvider).toBe('9Router (os-private)');
      expect(meta.llmFallback).toBe('Ollama Local (Strict Privacy)');
    }
  });

  it('guarantees bundled SOUL_CONTENTS contains valid markdown text for all profiles', () => {
    for (const p of PROFILES) {
      const content = SOUL_CONTENTS[p];
      expect(content, `Missing SOUL_CONTENTS entry for ${p}`).toBeTruthy();
      expect(content.length, `Soul content for ${p} is too short`).toBeGreaterThan(100);
      expect(content.includes('#'), `Soul content for ${p} should contain markdown headers`).toBe(true);
    }
  });

  it('provides safe defaults for unknown profiles', () => {
    const unknownMeta = getProfileMeta('random-custom-agent');
    expect(unknownMeta.llmModel).toBeTruthy();
    expect(unknownMeta.llmProvider).toBeTruthy();
    expect(unknownMeta.soulFile).toBe('infra/profiles/soul/random-custom-agent.md');
    expect(unknownMeta.duties?.length).toBeGreaterThan(0);
  });
});
