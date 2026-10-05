import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadCharacterConfig,
  saveCharacterConfig,
  resetCharacterConfig,
  generateRandomCharacter,
  configToOutfit,
  type CustomCharacterConfig,
} from '../src/sims-office/CharacterCustomizer.ts';

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

describe('CharacterCustomizer System', () => {
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    (globalThis as any).localStorage = mockLocalStorage;
    mockLocalStorage.clear();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('loads baseline character config for chief and adelia', () => {
    const chief = loadCharacterConfig('chief');
    expect(chief).toBeDefined();
    expect(chief.profile).toBe('chief');
    expect(chief.model).toBe('business');
    expect(chief.topColor).toBe('#1e3a8a');

    const adelia = loadCharacterConfig('adelia');
    expect(adelia).toBeDefined();
    expect(adelia.profile).toBe('adelia');
    expect(adelia.gender).toBe('female');
    expect(adelia.model).toBe('sleeves');
  });

  it('correctly translates config to three.js outfit materials for all 4 models', () => {
    const base: CustomCharacterConfig = {
      profile: 'test',
      gender: 'male',
      model: 'business',
      heightScale: 1.05,
      skinColor: '#f5d5bc',
      hairColor: '#111111',
      eyeColor: '#1c1917',
      eyebrowColor: '#111111',
      topColor: '#1e3a8a',
      bottomColor: '#0f172a',
      accentColor: '#eab308',
      shoesColor: '#111111',
      glasses: 'reading',
      plumbobColor: '#22c55e',
    };

    // 1. Business Model
    const businessOutfit = configToOutfit(base);
    expect(businessOutfit.model).toBe('business');
    expect(businessOutfit.colors?.Suit).toBe(0x1e3a8a);
    expect(businessOutfit.colors?.Tie).toBe(0xeab308);
    expect(businessOutfit.colors?.Skin).toBe(0xf5d5bc);

    // 2. Casual Model
    const casualOutfit = configToOutfit({ ...base, model: 'casual' });
    expect(casualOutfit.model).toBe('casual');
    expect(casualOutfit.colors?.Red_Dark).toBe(0x1e3a8a);
    expect(casualOutfit.colors?.LightBlue).toBe(0x0f172a);
    expect(casualOutfit.colors?.White).toBe(0xeab308);

    // 3. Suit Model
    const suitOutfit = configToOutfit({ ...base, model: 'suit' });
    expect(suitOutfit.model).toBe('suit');
    expect(suitOutfit.colors?.Shirt).toBe(0x1e3a8a);
    expect(suitOutfit.colors?.Pants).toBe(0x0f172a);
    expect(suitOutfit.colors?.TieTexture).toBe(0xeab308);

    // 4. Sleeves Model
    const sleevesOutfit = configToOutfit({ ...base, model: 'sleeves' });
    expect(sleevesOutfit.model).toBe('sleeves');
    expect(sleevesOutfit.colors?.Shirt).toBe(0x1e3a8a);
    expect(sleevesOutfit.colors?.Pants).toBe(0x0f172a);
  });

  it('persists customized outfit to localStorage and reloads it', () => {
    const chief = loadCharacterConfig('chief');
    const updated: CustomCharacterConfig = {
      ...chief,
      topColor: '#ec4899',
      hairColor: '#06b6d4',
      glasses: 'cyber',
    };

    saveCharacterConfig(updated);

    const reloaded = loadCharacterConfig('chief');
    expect(reloaded.topColor).toBe('#ec4899');
    expect(reloaded.hairColor).toBe('#06b6d4');
    expect(reloaded.glasses).toBe('cyber');
  });

  it('resets character config back to default', () => {
    const chief = loadCharacterConfig('chief');
    saveCharacterConfig({
      ...chief,
      topColor: '#ff0000',
    });
    expect(loadCharacterConfig('chief').topColor).toBe('#ff0000');

    resetCharacterConfig('chief');
    expect(loadCharacterConfig('chief').topColor).toBe('#1e3a8a');
  });

  it('generates random harmonious character config', () => {
    const random = generateRandomCharacter('dev', 'female');
    expect(random.profile).toBe('dev');
    expect(random.gender).toBe('female');
    expect(['sleeves', 'suit', 'casual']).toContain(random.model);
    expect(random.heightScale).toBeGreaterThanOrEqual(0.85);
    expect(random.heightScale).toBeLessThanOrEqual(1.2);
    expect(random.skinColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(random.hairColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
