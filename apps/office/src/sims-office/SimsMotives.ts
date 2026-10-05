import type { Approval, CostSummary, DailyCost, HealthComponent, KanbanTask, AgentState } from '../shell/api.ts';

export interface SimProfileMeta {
  name: string;
  title: string;
  tier: 'os-brain' | 'os-worker' | 'os-private';
  aspiration: 'Knowledge' | 'Fortune' | 'Popularity' | 'Family' | 'Creativity';
  aspirationIcon: string;
  aspirationLabel: string;
  zodiac: string;
  zodiacIcon: string;
  traits: string[];
  soulBio: string;
  skills: {
    logic: number;
    creativity: number;
    charisma: number;
    mechanical: number;
    cleaning: number;
  };
  customPlumbobColor?: string;
}

export const PROFILE_METAS: Record<string, SimProfileMeta> = {
  chief: {
    name: 'chief',
    title: 'Chief of Staff',
    tier: 'os-brain',
    aspiration: 'Popularity',
    aspirationIcon: '🤝',
    aspirationLabel: 'Sosial & Delegasi',
    zodiac: 'Aries',
    zodiacIcon: '♈',
    traits: ['Tegas', 'Diplomatis', 'Gerak Cepat', 'Disiplin'],
    soulBio: 'Pintu gerbang Telegram ke owner. Bertanggung jawab memecah brief menjadi kartu Kanban dan memimpin briefing kantor.',
    skills: { logic: 9, creativity: 7, charisma: 10, mechanical: 6, cleaning: 8 },
  },
  researcher: {
    name: 'researcher',
    title: 'Deep Researcher',
    tier: 'os-worker',
    aspiration: 'Knowledge',
    aspirationIcon: '💡',
    aspirationLabel: 'Pengetahuan Luas',
    zodiac: 'Virgo',
    zodiacIcon: '♍',
    traits: ['Kritis', 'Teliti', 'Pemeriksa Fakta', 'Sistematis'],
    soulBio: 'Spesialis riset web mendalam, perbandingan data komparatif, dan penulisan dokumen analisis ke workspace.',
    skills: { logic: 10, creativity: 5, charisma: 4, mechanical: 7, cleaning: 9 },
  },
  secretary: {
    name: 'secretary',
    title: 'Executive Assistant',
    tier: 'os-private',
    aspiration: 'Family',
    aspirationIcon: '📋',
    aspirationLabel: 'Keteraturan & Privasi',
    zodiac: 'Cancer',
    zodiacIcon: '♋',
    traits: ['Rapi', 'Terpercaya', 'Tertib Jadwal', 'Pemberi Ingatan'],
    soulBio: 'Penjaga jadwal dan kerapian Kanban. Satu-satunya agent yang dipercaya mengelola data sensitif & pribadi owner.',
    skills: { logic: 8, creativity: 6, charisma: 8, mechanical: 5, cleaning: 10 },
  },
  content: {
    name: 'content',
    title: 'Content Strategist',
    tier: 'os-worker',
    aspiration: 'Creativity',
    aspirationIcon: '🎨',
    aspirationLabel: 'Kreativitas & Seni',
    zodiac: 'Leo',
    zodiacIcon: '♌',
    traits: ['Inspiratif', 'Viral Tracker', 'Pencerita', 'Dinamis'],
    soulBio: 'Meneliti tren, merancang format narasi, dan menyusun draf konten menarik untuk publikasi mendatang.',
    skills: { logic: 6, creativity: 10, charisma: 9, mechanical: 4, cleaning: 6 },
  },
  dev: {
    name: 'dev',
    title: 'Fullstack Engineer',
    tier: 'os-brain',
    aspiration: 'Knowledge',
    aspirationIcon: '⚙️',
    aspirationLabel: 'Teknologi & Kode',
    zodiac: 'Scorpio',
    zodiacIcon: '♏',
    traits: ['Pemecah Masalah', 'Sandbox Cerdas', 'Optimis Bugless'],
    soulBio: 'Membaca repositori, merestrukturisasi arsitektur, dan menguji kode di Docker sandbox berkecepatan tinggi.',
    skills: { logic: 10, creativity: 8, charisma: 5, mechanical: 10, cleaning: 7 },
  },
  'hermes-default': {
    name: 'hermes-default',
    title: 'Desktop Specialist',
    tier: 'os-brain',
    aspiration: 'Fortune',
    aspirationIcon: '💎',
    aspirationLabel: 'Produktivitas Finansial',
    zodiac: 'Capricorn',
    zodiacIcon: '♑',
    traits: ['Multitasking', 'Fokus Output', 'Tangguh'],
    soulBio: 'Agent serbaguna berbasis Hermes Desktop untuk operasi workstation dan integrasi alat lokal.',
    skills: { logic: 8, creativity: 7, charisma: 6, mechanical: 9, cleaning: 8 },
  },
  adelia: {
    name: 'adelia',
    title: 'Product Designer',
    tier: 'os-brain',
    aspiration: 'Creativity',
    aspirationIcon: '🎨',
    aspirationLabel: 'Desain & Estetika',
    zodiac: 'Libra',
    zodiacIcon: '♎',
    traits: ['Detail-Oriented', 'Harmonis', 'Peka Visual'],
    soulBio: 'Fokus pada arsitektur antarmuka, ergonomi visual, dan keselarasan pengalaman pengguna The Sims.',
    skills: { logic: 7, creativity: 10, charisma: 8, mechanical: 6, cleaning: 8 },
  },
  clara: {
    name: 'clara',
    title: 'QA & Safety Auditor',
    tier: 'os-brain',
    aspiration: 'Knowledge',
    aspirationIcon: '🔍',
    aspirationLabel: 'Kualitas & Keamanan',
    zodiac: 'Aquarius',
    zodiacIcon: '♒',
    traits: ['Waspada', 'Audit Cepat', 'Metodis'],
    soulBio: 'Menguji skenario ekstrem, memastikan izin approval tepat sasaran, dan menjaga stabilitas lingkungan operasi.',
    skills: { logic: 9, creativity: 6, charisma: 7, mechanical: 8, cleaning: 9 },
  },
  crib: {
    name: 'crib',
    title: 'Infra & Systems Admin',
    tier: 'os-brain',
    aspiration: 'Fortune',
    aspirationIcon: '🛠',
    aspirationLabel: 'Infrastruktur Kokoh',
    zodiac: 'Taurus',
    zodiacIcon: '♉',
    traits: ['Tangguh', 'Uptime 99.9%', 'Praktis'],
    soulBio: 'Memelihara koneksi Docker daemon, Ollama inference engine, dan kestabilan komunikasi Hermes.',
    skills: { logic: 9, creativity: 5, charisma: 5, mechanical: 10, cleaning: 8 },
  },
  maya: {
    name: 'maya',
    title: 'Data Analyst & Metrics',
    tier: 'os-brain',
    aspiration: 'Knowledge',
    aspirationIcon: '📊',
    aspirationLabel: 'Analisis & Pola',
    zodiac: 'Gemini',
    zodiacIcon: '♊',
    traits: ['Cepat Menghitung', 'Konektor Pola', 'Adaptif'],
    soulBio: 'Memantau konsumsi token, performa inferensi per model, dan efisiensi throughput seluruh armada agen.',
    skills: { logic: 9, creativity: 7, charisma: 7, mechanical: 7, cleaning: 8 },
  },
};

export interface SimMotive {
  id: 'context' | 'budget' | 'energy' | 'environment' | 'social';
  label: string;
  simsAnalog: string;
  icon: string;
  value: number; // 0 to 100
  color: 'green' | 'yellow' | 'red';
  statusLabel: string;
}

export interface SimMotivesReport {
  profile: string;
  meta: SimProfileMeta;
  motives: SimMotive[];
  overallMood: 'happy' | 'neutral' | 'stressed';
  plumbobColor: string;
}

export interface MotiveInputState {
  approvals: Approval[];
  tasks: KanbanTask[];
  costs: CostSummary | null;
  daily: DailyCost[];
  health: HealthComponent[];
  agents: AgentState[];
}

const CUSTOM_METAS_KEY = 'aos_custom_profile_metas';

function loadCustomMetas(): Record<string, SimProfileMeta> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CUSTOM_METAS_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

const customMetasCache: Record<string, SimProfileMeta> = loadCustomMetas();

export function saveCustomProfileMeta(meta: SimProfileMeta): void {
  customMetasCache[meta.name] = meta;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_METAS_KEY, JSON.stringify(customMetasCache));
    }
  } catch {}
}

export function getProfileMeta(profile: string): SimProfileMeta {
  return (
    customMetasCache[profile] ??
    PROFILE_METAS[profile] ?? {
      name: profile,
      title: 'Agent Specialist',
      tier: 'os-brain',
      aspiration: 'Knowledge',
      aspirationIcon: '💡',
      aspirationLabel: 'Pengetahuan',
      zodiac: 'Aries',
      zodiacIcon: '♈',
      traits: ['Mandiri', 'Fokus'],
      soulBio: `Agent ${profile} di Agentic OS.`,
      skills: { logic: 7, creativity: 7, charisma: 7, mechanical: 7, cleaning: 7 },
    }
  );
}

export function calculateMotives(profile: string, state: MotiveInputState): SimMotivesReport {
  const meta = getProfileMeta(profile);

  // 1. Context Window (Analog: Hunger / Lapar)
  const profileCost = state.costs?.byProfile.find((p) => p.profile === profile);
  const totalTokens = profileCost ? profileCost.prompt_tokens + profileCost.completion_tokens : 0;
  const contextLimit = 128000;
  const contextRemainingPct = Math.max(10, Math.min(100, Math.round(100 - (totalTokens / contextLimit) * 100)));
  const contextColor: 'green' | 'yellow' | 'red' =
    contextRemainingPct > 65 ? 'green' : contextRemainingPct > 30 ? 'yellow' : 'red';
  const contextStatus =
    totalTokens > 0
      ? `${contextRemainingPct}% (${(totalTokens / 1000).toFixed(1)}k / 128k ctx)`
      : `${contextRemainingPct}% (Konteks Lapang)`;

  // 2. Budget / Token Spend (Analog: Comfort / Keuangan)
  const spentUsd = profileCost?.cost_usd ?? 0;
  const budgetLimitUsd = 5.0;
  const budgetRemainingPct = Math.max(10, Math.min(100, Math.round(100 - (spentUsd / budgetLimitUsd) * 100)));
  const budgetColor: 'green' | 'yellow' | 'red' =
    budgetRemainingPct > 65 ? 'green' : budgetRemainingPct > 30 ? 'yellow' : 'red';
  const budgetStatus = `$${spentUsd.toFixed(2)} / $${budgetLimitUsd.toFixed(2)}`;

  // 3. Task Queue / Workload (Analog: Energy / Tenaga)
  const assignedTasks = state.tasks.filter((t) => t.assignee === profile && t.status !== 'done');
  const agentState = state.agents.find((a) => a.profile === profile)?.state ?? 'idle';

  let energyPct = 95;
  let energyStatus = 'Siap & Segar';

  if (agentState === 'error' || agentState === 'blocked') {
    energyPct = 20;
    energyStatus = 'Terkendala / Error';
  } else if (assignedTasks.length === 0) {
    energyPct = agentState === 'working' ? 85 : 95;
    energyStatus = agentState === 'working' ? 'Aktif Bekerja' : 'Standby / Santai';
  } else if (assignedTasks.length === 1) {
    energyPct = 80;
    energyStatus = '1 Tugas Sedang Jalan';
  } else if (assignedTasks.length <= 3) {
    energyPct = 55;
    energyStatus = `${assignedTasks.length} Tugas Menumpuk`;
  } else {
    energyPct = 25;
    energyStatus = `${assignedTasks.length} Tugas Padat!`;
  }

  const energyColor: 'green' | 'yellow' | 'red' = energyPct > 65 ? 'green' : energyPct > 30 ? 'yellow' : 'red';

  // 4. System Health / Environment (Analog: Environment / Suasana)
  const healthComponents = state.health;
  let envPct = 100;
  let envStatus = 'Semua Normal';
  if (healthComponents.length > 0) {
    const okCount = healthComponents.filter((h) => h.status === 'ok').length;
    envPct = Math.round((okCount / healthComponents.length) * 100);
    envStatus = `${okCount}/${healthComponents.length} Komponen OK`;
  }
  const envColor: 'green' | 'yellow' | 'red' = envPct > 70 ? 'green' : envPct > 35 ? 'yellow' : 'red';

  // 5. Approvals / Social (Analog: Social / Hubungan Manusia)
  const pendingApprovals = state.approvals.filter((a) => a.profile === profile && a.status === 'pending');
  let socialPct = 100;
  let socialStatus = 'Izin Lancar';

  if (pendingApprovals.length === 1) {
    socialPct = 40;
    socialStatus = '1 Izin Menunggu Human';
  } else if (pendingApprovals.length > 1) {
    socialPct = 20;
    socialStatus = `${pendingApprovals.length} Izin Tertunda!`;
  }
  const socialColor: 'green' | 'yellow' | 'red' = socialPct > 65 ? 'green' : socialPct > 30 ? 'yellow' : 'red';

  const motives: SimMotive[] = [
    {
      id: 'context',
      label: 'Konteks',
      simsAnalog: 'Kebutuhan Ruang / Lapar',
      icon: '🧠',
      value: contextRemainingPct,
      color: contextColor,
      statusLabel: contextStatus,
    },
    {
      id: 'budget',
      label: 'Anggaran',
      simsAnalog: 'Finansial / Kenyamanan',
      icon: '🪙',
      value: budgetRemainingPct,
      color: budgetColor,
      statusLabel: budgetStatus,
    },
    {
      id: 'energy',
      label: 'Tenaga',
      simsAnalog: 'Energi / Beban Kerja',
      icon: '⚡',
      value: energyPct,
      color: energyColor,
      statusLabel: energyStatus,
    },
    {
      id: 'environment',
      label: 'Sistem',
      simsAnalog: 'Lingkungan / Docker & Core',
      icon: '🌱',
      value: envPct,
      color: envColor,
      statusLabel: envStatus,
    },
    {
      id: 'social',
      label: 'Sosial',
      simsAnalog: 'Approval / Relasi Owner',
      icon: '💬',
      value: socialPct,
      color: socialColor,
      statusLabel: socialStatus,
    },
  ];

  // Plumbob mood derived from lowest motive
  const minVal = Math.min(...motives.map((m) => m.value));
  let overallMood: 'happy' | 'neutral' | 'stressed' = 'happy';
  let plumbobColor = meta.customPlumbobColor || '#22c55e'; // Green or custom

  if (minVal <= 30) {
    overallMood = 'stressed';
    plumbobColor = '#ef4444'; // Red
  } else if (minVal <= 65) {
    overallMood = 'neutral';
    plumbobColor = '#eab308'; // Amber/Yellow
  }

  return {
    profile,
    meta,
    motives,
    overallMood,
    plumbobColor,
  };
}
