import type { CharacterModel, Outfit } from './CharacterRig.ts';

export type CharacterGender = 'male' | 'female' | 'non-binary';
export type GlassesType = 'none' | 'reading' | 'sunglasses' | 'cyber';

export interface CustomCharacterConfig {
  profile: string;
  gender: CharacterGender;
  model: CharacterModel; // 'business' | 'casual' | 'suit' | 'sleeves'
  heightScale: number; // 0.85 - 1.15
  // Face & Head
  skinColor: string;
  hairColor: string;
  eyeColor: string;
  eyebrowColor: string;
  // Clothing
  topColor: string;
  bottomColor: string;
  accentColor: string;
  shoesColor: string;
  // Accessories
  glasses: GlassesType;
  // Sims effects
  plumbobColor: string;
}

export const SKIN_TONES = [
  { name: 'Porcelain Fair', color: '#fbe2d3' },
  { name: 'Warm Peach', color: '#f5d5bc' },
  { name: 'Natural Beige', color: '#e8b993' },
  { name: 'Golden Honey', color: '#d9a37e' },
  { name: 'Warm Tan', color: '#c68e6a' },
  { name: 'Chestnut Bronze', color: '#a86b45' },
  { name: 'Deep Espresso', color: '#684027' },
  { name: 'Cyber Synth (Ice)', color: '#bae6fd' },
  { name: 'Cyber Android (Rose)', color: '#fbcfe8' },
];

export const HAIR_COLORS = [
  { name: 'Jet Black', color: '#111111' },
  { name: 'Dark Chocolate', color: '#2b1d14' },
  { name: 'Auburn Chestnut', color: '#542617' },
  { name: 'Golden Blonde', color: '#d97706' },
  { name: 'Platinum Silver', color: '#94a3b8' },
  { name: 'Frost White', color: '#e2e8f0' },
  { name: 'Cyber Magenta', color: '#db2777' },
  { name: 'Neon Cyan', color: '#06b6d4' },
  { name: 'Royal Violet', color: '#7c3aed' },
  { name: 'Emerald Forest', color: '#059669' },
];

export const EYE_COLORS = [
  { name: 'Dark Brown', color: '#1c1917' },
  { name: 'Hazel Amber', color: '#b45309' },
  { name: 'Deep Sapphire', color: '#1d4ed8' },
  { name: 'Emerald Green', color: '#047857' },
  { name: 'Amethyst Violet', color: '#6d28d9' },
  { name: 'Cyber Red', color: '#dc2626' },
  { name: 'Silver Slate', color: '#475569' },
];

export const CLOTHING_COLORS = [
  { name: 'Executive Navy', color: '#1e3a8a' },
  { name: 'Midnight Slate', color: '#0f172a' },
  { name: 'Deep Charcoal', color: '#334155' },
  { name: 'Crisp White', color: '#f8fafc' },
  { name: 'Ruby Crimson', color: '#9f1239' },
  { name: 'Rose Pink', color: '#ec4899' },
  { name: 'Emerald Green', color: '#065f46' },
  { name: 'Forest Moss', color: '#15803d' },
  { name: 'Solar Amber', color: '#f59e0b' },
  { name: 'Gold Dust', color: '#eab308' },
  { name: 'Electric Cyan', color: '#0284c7' },
  { name: 'Royal Violet', color: '#7c3aed' },
  { name: 'Earth Khaki', color: '#78350f' },
  { name: 'Warm Terracotta', color: '#c2410c' },
];

export const MODEL_OPTIONS: Array<{
  id: CharacterModel;
  label: string;
  desc: string;
  badge: string;
  icon: string;
}> = [
  {
    id: 'business',
    label: 'Formal Jas & Dasi',
    desc: 'Setelan jas eksekutif lengkap dengan kemeja dan dasi profesional.',
    badge: 'Executive',
    icon: '👔',
  },
  {
    id: 'casual',
    label: 'Jaket & Kaos Santai',
    desc: 'Gaya santai startup dengan jaket luar, kaos dalaman, dan celana jeans.',
    badge: 'Casual',
    icon: '👕',
  },
  {
    id: 'suit',
    label: 'Kemeja & Dasi Rapi',
    desc: 'Kemeja kerja rapi berdasi dengan celana bahan formal.',
    badge: 'Office',
    icon: '🤵',
  },
  {
    id: 'sleeves',
    label: 'Kemeja Lengan Pendek / Blouse',
    desc: 'Kemeja kasual lengan pendek atau blouse modern yang fleksibel.',
    badge: 'Modern',
    icon: '👚',
  },
];

export const PLUMBOB_PALETTE = [
  { color: '#22c55e', name: 'Sims Emerald' },
  { color: '#06b6d4', name: 'Neon Cyan' },
  { color: '#3b82f6', name: 'Deep Sapphire' },
  { color: '#a855f7', name: 'Royal Violet' },
  { color: '#eab308', name: 'Solar Amber' },
  { color: '#f97316', name: 'Sunset Orange' },
  { color: '#ec4899', name: 'Cyber Magenta' },
  { color: '#94a3b8', name: 'Platinum Silver' },
];

export const STYLE_PRESETS: Array<{
  name: string;
  icon: string;
  desc: string;
  config: Partial<CustomCharacterConfig>;
}> = [
  {
    name: 'Executive Leader (Pria)',
    icon: '👔',
    desc: 'Jas navy berwibawa dengan dasi emas cerah.',
    config: {
      gender: 'male',
      model: 'business',
      heightScale: 1.02,
      topColor: '#1e3a8a',
      accentColor: '#eab308',
      bottomColor: '#1e293b',
      shoesColor: '#0f172a',
      hairColor: '#2b1d14',
      skinColor: '#f5d5bc',
      glasses: 'reading',
    },
  },
  {
    name: 'Chief Officer (Wanita)',
    icon: '💼',
    desc: 'Blouse modern terstruktur dengan celana gelap rapi.',
    config: {
      gender: 'female',
      model: 'sleeves',
      heightScale: 0.98,
      topColor: '#7c3aed',
      accentColor: '#fbbf24',
      bottomColor: '#1e293b',
      shoesColor: '#111827',
      hairColor: '#d97706',
      skinColor: '#fde3cf',
      glasses: 'none',
    },
  },
  {
    name: 'Tech Lead Casual',
    icon: '💻',
    desc: 'Hoodie / jaket gelap santai khas programmer modern.',
    config: {
      gender: 'male',
      model: 'casual',
      heightScale: 1.0,
      topColor: '#334155',
      accentColor: '#f8fafc',
      bottomColor: '#0f172a',
      shoesColor: '#1c1917',
      hairColor: '#1c1917',
      skinColor: '#fae0cc',
      glasses: 'reading',
    },
  },
  {
    name: 'Creative Strategist',
    icon: '🎨',
    desc: 'Gaya artistik dengan perpaduan warna magenta dan cyan.',
    config: {
      gender: 'female',
      model: 'casual',
      heightScale: 0.97,
      topColor: '#db2777',
      accentColor: '#ffffff',
      bottomColor: '#0284c7',
      shoesColor: '#78350f',
      hairColor: '#581c87',
      skinColor: '#e8b993',
      glasses: 'sunglasses',
    },
  },
  {
    name: 'Cyberpunk Specialist',
    icon: '⚡',
    desc: 'Karakter futuristik bernuansa neon dan aksen cyber.',
    config: {
      gender: 'non-binary',
      model: 'business',
      heightScale: 1.0,
      topColor: '#0f172a',
      accentColor: '#06b6d4',
      bottomColor: '#0284c7',
      shoesColor: '#06b6d4',
      hairColor: '#06b6d4',
      skinColor: '#bae6fd',
      eyeColor: '#dc2626',
      glasses: 'cyber',
      plumbobColor: '#06b6d4',
    },
  },
  {
    name: 'Field Auditor Rapi',
    icon: '📊',
    desc: 'Kemeja rapi berdasi dengan palet earthy terpercaya.',
    config: {
      gender: 'male',
      model: 'suit',
      heightScale: 1.0,
      topColor: '#15803d',
      accentColor: '#eab308',
      bottomColor: '#334155',
      shoesColor: '#1c1917',
      hairColor: '#52525b',
      skinColor: '#c68e6a',
      glasses: 'reading',
    },
  },
];

/** Default baseline configs for pre-existing agents */
const DEFAULT_AGENT_CONFIGS: Record<string, CustomCharacterConfig> = {
  owner: {
    profile: 'owner',
    gender: 'male',
    model: 'business',
    heightScale: 1.05,
    skinColor: '#f1c7a5',
    hairColor: '#18181b',
    eyeColor: '#1d4ed8',
    eyebrowColor: '#18181b',
    topColor: '#18181b',
    bottomColor: '#1e293b',
    accentColor: '#f59e0b',
    shoesColor: '#0f172a',
    glasses: 'none',
    plumbobColor: '#f59e0b',
  },
  chief: {
    profile: 'chief',
    gender: 'male',
    model: 'business',
    heightScale: 1.0,
    skinColor: '#f1c7a5',
    hairColor: '#2b1d14',
    eyeColor: '#1c1917',
    eyebrowColor: '#2b1d14',
    topColor: '#1e3a8a',
    bottomColor: '#1e3a8a',
    accentColor: '#eab308',
    shoesColor: '#0f172a',
    glasses: 'none',
    plumbobColor: '#22c55e',
  },
  researcher: {
    profile: 'researcher',
    gender: 'male',
    model: 'sleeves',
    heightScale: 1.0,
    skinColor: '#f5d5bc',
    hairColor: '#78350f',
    eyeColor: '#1c1917',
    eyebrowColor: '#78350f',
    topColor: '#065f46',
    bottomColor: '#334155',
    accentColor: '#ffffff',
    shoesColor: '#1c1917',
    glasses: 'reading',
    plumbobColor: '#eab308',
  },
  secretary: {
    profile: 'secretary',
    gender: 'female',
    model: 'suit',
    heightScale: 0.98,
    skinColor: '#fde3cf',
    hairColor: '#d97706',
    eyeColor: '#1c1917',
    eyebrowColor: '#d97706',
    topColor: '#9f1239',
    bottomColor: '#1e293b',
    accentColor: '#e2e8f0',
    shoesColor: '#0f172a',
    glasses: 'reading',
    plumbobColor: '#a855f7',
  },
  content: {
    profile: 'content',
    gender: 'female',
    model: 'casual',
    heightScale: 0.97,
    skinColor: '#e8b993',
    hairColor: '#581c87',
    eyeColor: '#1c1917',
    eyebrowColor: '#581c87',
    topColor: '#db2777',
    bottomColor: '#0369a1',
    accentColor: '#ffffff',
    shoesColor: '#78350f',
    glasses: 'none',
    plumbobColor: '#ec4899',
  },
  dev: {
    profile: 'dev',
    gender: 'male',
    model: 'casual',
    heightScale: 1.0,
    skinColor: '#fae0cc',
    hairColor: '#1c1917',
    eyeColor: '#1c1917',
    eyebrowColor: '#1c1917',
    topColor: '#334155',
    bottomColor: '#0f172a',
    accentColor: '#ffffff',
    shoesColor: '#1c1917',
    glasses: 'reading',
    plumbobColor: '#22c55e',
  },
  'hermes-default': {
    profile: 'hermes-default',
    gender: 'male',
    model: 'business',
    heightScale: 1.0,
    skinColor: '#c68e6a',
    hairColor: '#111111',
    eyeColor: '#1c1917',
    eyebrowColor: '#111111',
    topColor: '#475569',
    bottomColor: '#475569',
    accentColor: '#0ea5e9',
    shoesColor: '#0f172a',
    glasses: 'none',
    plumbobColor: '#22c55e',
  },
  adelia: {
    profile: 'adelia',
    gender: 'female',
    model: 'sleeves',
    heightScale: 0.98,
    skinColor: '#d9a37e',
    hairColor: '#3f1d0b',
    eyeColor: '#1c1917',
    eyebrowColor: '#3f1d0b',
    topColor: '#f59e0b',
    bottomColor: '#1f2937',
    accentColor: '#ffffff',
    shoesColor: '#111827',
    glasses: 'reading',
    plumbobColor: '#22c55e',
  },
  clara: {
    profile: 'clara',
    gender: 'female',
    model: 'suit',
    heightScale: 0.98,
    skinColor: '#f8d5c0',
    hairColor: '#fbbf24',
    eyeColor: '#1c1917',
    eyebrowColor: '#fbbf24',
    topColor: '#7c3aed',
    bottomColor: '#111827',
    accentColor: '#fbbf24',
    shoesColor: '#0f172a',
    glasses: 'none',
    plumbobColor: '#22c55e',
  },
  crib: {
    profile: 'crib',
    gender: 'male',
    model: 'casual',
    heightScale: 1.0,
    skinColor: '#a86b45',
    hairColor: '#52525b',
    eyeColor: '#1c1917',
    eyebrowColor: '#52525b',
    topColor: '#15803d',
    bottomColor: '#78350f',
    accentColor: '#ffffff',
    shoesColor: '#1c1917',
    glasses: 'none',
    plumbobColor: '#22c55e',
  },
  maya: {
    profile: 'maya',
    gender: 'female',
    model: 'sleeves',
    heightScale: 0.97,
    skinColor: '#e0ac85',
    hairColor: '#111111',
    eyeColor: '#1c1917',
    eyebrowColor: '#111111',
    topColor: '#ec4899',
    bottomColor: '#0c4a6e',
    accentColor: '#ffffff',
    shoesColor: '#0f172a',
    glasses: 'none',
    plumbobColor: '#22c55e',
  },
};

const STORAGE_KEY = 'aos_custom_character_styles';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) || 0;
}

export function numberToHex(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

export function configToOutfit(config: CustomCharacterConfig): Outfit {
  const colors: Record<string, number> = {};
  const skin = hexToNumber(config.skinColor);
  const hair = hexToNumber(config.hairColor);
  const eye = hexToNumber(config.eyeColor);
  const eyebrow = hexToNumber(config.eyebrowColor || config.hairColor);
  const top = hexToNumber(config.topColor);
  const bottom = hexToNumber(config.bottomColor);
  const accent = hexToNumber(config.accentColor);
  const shoes = hexToNumber(config.shoesColor);

  switch (config.model) {
    case 'business':
      colors.Suit = top;
      colors.White = accent;
      colors.Tie = accent;
      colors.Black = shoes;
      colors.Skin = skin;
      colors.Hair = hair;
      colors.Eye = eye;
      colors.Eyebrows = eyebrow;
      break;

    case 'casual':
      colors.Red_Dark = top;
      colors.White = accent;
      colors.LightBlue = bottom;
      colors.LightBrown = shoes;
      colors.Skin = skin;
      // Slightly darker skin tint for shadow regions
      colors.Skin_Darker = Math.max(0, skin - 0x151515);
      colors.Hair = hair;
      colors.Eye = eye;
      colors.Eyebrows = eyebrow;
      break;

    case 'suit':
      colors.Shirt = top;
      colors.Pants = bottom;
      colors.TieTexture = accent;
      colors.Details = shoes;
      colors.Skin = skin;
      colors.Hair = hair;
      colors.Eyes = eye;
      break;

    case 'sleeves':
      colors.Shirt = top;
      colors.Pants = bottom;
      colors.Skin = skin;
      colors.Hair = hair;
      colors.Eyes = eye;
      break;
  }

  return {
    model: config.model,
    colors,
  };
}

export function loadAllCharacterConfigs(): Record<string, CustomCharacterConfig> {
  const result: Record<string, CustomCharacterConfig> = { ...DEFAULT_AGENT_CONFIGS };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        for (const [p, cfg] of Object.entries(stored)) {
          result[p] = { ...DEFAULT_AGENT_CONFIGS[p], ...(cfg as CustomCharacterConfig) };
        }
      }
    }
  } catch {}
  return result;
}

export function loadCharacterConfig(profile: string): CustomCharacterConfig {
  const all = loadAllCharacterConfigs();
  if (all[profile]) return all[profile];

  // Fallback starter config for newly created custom profiles
  return {
    profile,
    gender: 'male',
    model: 'casual',
    heightScale: 1.0,
    skinColor: '#f5d5bc',
    hairColor: '#2b1d14',
    eyeColor: '#1c1917',
    eyebrowColor: '#2b1d14',
    topColor: '#0284c7',
    bottomColor: '#0f172a',
    accentColor: '#f8fafc',
    shoesColor: '#1c1917',
    glasses: 'none',
    plumbobColor: '#22c55e',
  };
}

export function saveCharacterConfig(config: CustomCharacterConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const all = loadAllCharacterConfigs();
      all[config.profile] = config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

      // Also sync custom plumbob color to SimsProfileMeta if present
      const metaKey = 'aos_custom_profile_metas';
      const metaRaw = localStorage.getItem(metaKey);
      if (metaRaw) {
        const metas = JSON.parse(metaRaw);
        if (metas[config.profile]) {
          metas[config.profile].customPlumbobColor = config.plumbobColor;
          localStorage.setItem(metaKey, JSON.stringify(metas));
        }
      }

      // Notify entire app (SimsScene, Console, Settings, etc.)
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aos-character-customized', {
            detail: {
              profile: config.profile,
              config,
              outfit: configToOutfit(config),
            },
          })
        );
      }
    }
  } catch (err) {
    console.warn('Failed to save character config:', err);
  }
}

export function resetCharacterConfig(profile: string): CustomCharacterConfig {
  const def = DEFAULT_AGENT_CONFIGS[profile] ?? loadCharacterConfig(profile);
  saveCharacterConfig(def);
  return def;
}

export function generateRandomCharacter(profile: string, gender?: CharacterGender): CustomCharacterConfig {
  const chosenGender: CharacterGender = gender ?? (Math.random() > 0.5 ? 'female' : 'male');
  const models: CharacterModel[] =
    chosenGender === 'female' ? ['sleeves', 'suit', 'casual'] : ['business', 'suit', 'casual'];
  const model = models[Math.floor(Math.random() * models.length)];

  const skin = SKIN_TONES[Math.floor(Math.random() * (SKIN_TONES.length - 2))].color;
  const hair = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].color;
  const eye = EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)].color;
  const top = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)].color;
  const bottom = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)].color;
  const accent = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)].color;
  const shoes = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)].color;
  const plumbob = PLUMBOB_PALETTE[Math.floor(Math.random() * PLUMBOB_PALETTE.length)].color;
  const glassesList: GlassesType[] = ['none', 'reading', 'sunglasses', 'cyber'];
  const glasses = glassesList[Math.floor(Math.random() * glassesList.length)];
  const heightScale = Number((0.94 + Math.random() * 0.12).toFixed(2));

  return {
    profile,
    gender: chosenGender,
    model,
    heightScale,
    skinColor: skin,
    hairColor: hair,
    eyeColor: eye,
    eyebrowColor: hair,
    topColor: top,
    bottomColor: bottom,
    accentColor: accent,
    shoesColor: shoes,
    glasses,
    plumbobColor: plumbob,
  };
}
