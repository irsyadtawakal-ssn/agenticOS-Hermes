import type { Approval, CostSummary, DailyCost, HealthComponent, KanbanTask, AgentState } from '../shell/api.ts';

export interface SimProfileMeta {
  name: string;
  title: string;
  tier: 'os-brain' | 'os-worker' | 'os-private';
  llmModel?: string;
  llmProvider?: string;
  llmFallback?: string;
  soulFile?: string;
  duties?: string[];
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
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/chief.md',
    duties: [
      'Pintu gerbang Telegram ke owner, memecah brief menjadi kartu Kanban yang jelas',
      'Mengatur alokasi tugas ke agen spesialis yang tepat (researcher, dev, dsb.)',
      'Menyusun morning briefing otomatis dan mengoordinasikan persetujuan (approval)',
      'Mengelola reminder terjadwal dan merangkum hasil kartu selesai untuk owner',
    ],
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
    llmModel: 'Nemotron 3 Super 120B',
    llmProvider: '9Router (os-worker)',
    llmFallback: 'Gemini 3.8 Flash',
    soulFile: 'infra/profiles/soul/researcher.md',
    duties: [
      'Melakukan riset web mendalam dan perbandingan komparatif multi-sumber',
      'Menulis dokumen analisis, perbandingan terstruktur, dan tabel ke workspace kartu',
      'Memverifikasi fakta dengan mencantumkan sitasi URL eksplisit untuk setiap temuan',
    ],
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
    llmModel: 'Gemini 3.8 Flash',
    llmProvider: '9Router (os-private)',
    llmFallback: 'Ollama Local (Strict Privacy)',
    soulFile: 'infra/profiles/soul/secretary.md',
    duties: [
      'Mengelola jadwal, kalender, catatan rahasia, dan data sensitif owner',
      'Menjaga kerapian papan Kanban dan memantau kartu yang berstatus blocked > 24 jam',
      'Melindungi privasi dan integritas data personal owner secara ketat tanpa kebocoran',
    ],
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
    llmModel: 'Nemotron 3 Super 120B',
    llmProvider: '9Router (os-worker)',
    llmFallback: 'Gemini 3.8 Flash',
    soulFile: 'infra/profiles/soul/content.md',
    duties: [
      'Memantau tren sosial media dan merumuskan angle kreatif konten',
      'Menyusun draft konten (platform target, audiens, hook, copy, CTA, hashtag)',
      'Menyajikan 2-3 alternatif variasi draf konten tanpa publikasi langsung',
    ],
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
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/dev.md',
    duties: [
      'Membaca dan menganalisis arsitektur repositori kode di Docker sandbox',
      'Mengimplementasikan fitur baru, refactoring, dan perbaikan bug sesuai konvensi',
      'Menjalankan test suite dan verifikasi kualitas sebelum mengajukan approval',
    ],
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
    title: 'Workstation Generalist',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/hermes-default.md',
    duties: [
      'Utilitas workstation umum, pemrosesan dokumen lokal, dan otomasi CLI',
      'Menjawab pertanyaan ringkas tanpa pengantar klise atau repetisi berlebihan',
      'Menjaga kelancaran integrasi alat lokal dan pemeliharaan lingkungan kerja',
    ],
    aspiration: 'Fortune',
    aspirationIcon: '💻',
    aspirationLabel: 'Operasi Desktop',
    zodiac: 'Capricorn',
    zodiacIcon: '♑',
    traits: ['Multitasking', 'Fokus Output', 'Tangguh', 'Efisien'],
    soulBio: 'Agent serbaguna berbasis Hermes Desktop untuk operasi workstation dan integrasi alat lokal.',
    skills: { logic: 8, creativity: 7, charisma: 6, mechanical: 9, cleaning: 8 },
  },
  adelia: {
    name: 'adelia',
    title: 'QC Master & Forensic Verifier',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/adelia.md',
    duties: [
      'QC Master & Forensic Verifier (Prinsip 4 Mata) untuk 21 cabang Suka Shawarma',
      'Menjalankan 7 filter forensik (panic closing, unlinked orders, batching, void audit)',
      'Mencegah tuduhan keliru terhadap kasir dan menghitung kerugian omzet riil',
      'Mengesahkan status [ALL VERIFIED & CLEARED] dan mendeligasikannya ke Clara',
    ],
    aspiration: 'Knowledge',
    aspirationIcon: '🔍',
    aspirationLabel: 'Audit Forensik & Akurasi',
    zodiac: 'Libra',
    zodiacIcon: '♎',
    traits: ['Prinsip 4 Mata', 'Skeptis Data', 'Objektif', 'Pelindung Kasir'],
    soulBio: 'Memverifikasi bukti selisih 21 cabang, menguji keterlambatan input kasir, dan memastikan nol tuduhan keliru.',
    skills: { logic: 10, creativity: 6, charisma: 7, mechanical: 8, cleaning: 9 },
  },
  clara: {
    name: 'clara',
    title: 'Dispatch Master & WAHA Officer',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/clara.md',
    duties: [
      'Dispatch Master & WAHA Delivery Officer ke grup WhatsApp Report Omzet Outlet',
      'Mendistribusikan berkas Jurnal Keuangan Harian ke Finance (Ka Nadya & Ka Hesti)',
      'Mengirim instruksi tindak lanjut & batas waktu 15:00 WIB ke 5 Area Manager (AM)',
      'Membuat laporan Dispatch Report terkonfirmasi di grup chat Hermes',
    ],
    aspiration: 'Popularity',
    aspirationIcon: '📢',
    aspirationLabel: 'Komunikasi Operasional',
    zodiac: 'Aquarius',
    zodiacIcon: '♒',
    traits: ['Hangat & Santai', 'Tepat Waktu', 'Disiplin 15:00 WIB', 'Rapi'],
    soulBio: 'Mendistribusikan laporan omzet harian, jurnal keuangan, dan instruksi tindak lanjut ke grup WA & 5 Area Manager.',
    skills: { logic: 8, creativity: 8, charisma: 10, mechanical: 8, cleaning: 8 },
  },
  crib: {
    name: 'crib',
    title: 'The Auditor Man (FoodApps)',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/crib.md',
    duties: [
      'The Auditor Man: rekonsiliasi omzet 4 platform online vs POS Supabase 21 cabang',
      'Menyajikan Scorecard Table 21 cabang lengkap terurut dari selisih terbesar',
      'Mengekstraksi log bukti transaksi mendalam untuk investigasi forensik Adelia',
      'Menegakkan SOP tata kelola: input susulan hanya boleh dieksekusi oleh Admin',
    ],
    aspiration: 'Fortune',
    aspirationIcon: '🧾',
    aspirationLabel: 'Rekonsiliasi Omzet',
    zodiac: 'Taurus',
    zodiacIcon: '♉',
    traits: ['Presisi Angka', 'Scorecard 21 Cabang', 'Anti Halusinasi', 'Cepat'],
    soulBio: 'Merekonsiliasi transaksi 4 platform (GoFood, GrabFood, ShopeeFood, TikTok Go) dengan struk POS Supabase 21 cabang.',
    skills: { logic: 10, creativity: 5, charisma: 6, mechanical: 9, cleaning: 9 },
  },
  maya: {
    name: 'maya',
    title: 'E-Commerce Master (SS Online)',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: 'infra/profiles/soul/maya.md',
    duties: [
      'E-Commerce Master: scraping transaksi TikTok Shop Seller & Shopee Seller',
      'Pembersihan data, normalisasi multiplier, dan auto-mapping SKU menu SS resmi',
      'Menghasilkan berkas Excel 4-sheet (Detail, Rekap Produk, Harian, Biaya)',
      'Sinkronisasi otomatis ke database Supabase dan pengiriman notifikasi Discord',
    ],
    aspiration: 'Creativity',
    aspirationIcon: '🛍️',
    aspirationLabel: 'Marketplace & SKU',
    zodiac: 'Gemini',
    zodiacIcon: '♊',
    traits: ['Enerjik', 'Pemeta SKU', 'Excel 4-Sheet', 'Multi-Platform'],
    soulBio: 'Menjalankan scraping transaksi TikTok Shop Seller & Shopee Seller, menyusun Excel 4-sheet, serta sinkronisasi Supabase & Discord.',
    skills: { logic: 9, creativity: 9, charisma: 8, mechanical: 8, cleaning: 8 },
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
  if (profile === 'owner' || profile === 'operator') {
    const opName = typeof localStorage !== 'undefined' ? localStorage.getItem('aos.settings.operatorName') || 'Operator' : 'Operator';
    const opTitle = typeof localStorage !== 'undefined' ? localStorage.getItem('aos.settings.operatorTitle') || localStorage.getItem('aos.settings.operatorRole') || 'Commander / CEO' : 'Commander / CEO';
    return {
      name: opName,
      title: opTitle,
      tier: 'os-brain',
      aspiration: 'Fortune',
      aspirationIcon: '👑',
      aspirationLabel: 'Kepemimpinan & Kejayaan Bisnis',
      zodiac: 'Leo',
      zodiacIcon: '♌',
      traits: ['Visi Strategis', 'Pengambil Keputusan', 'Inovatif', 'Komandan'],
      soulBio: 'Pemilik dan Komandan Tertinggi Kantor Agentic OS Hermes. Mengarahkan armada 10 agen otonom untuk mencapai keunggulan operasional.',
      skills: { logic: 10, creativity: 10, charisma: 10, mechanical: 10, cleaning: 8 },
      customPlumbobColor: '#f59e0b',
      duties: ['Memimpin visi strategis kantor dan menginstruksikan seluruh armada agen'],
    };
  }

  const base = customMetasCache[profile] ?? PROFILE_METAS[profile];
  if (base) {
    return {
      ...base,
      llmModel: base.llmModel ?? (base.tier === 'os-brain' ? 'Claude 3.5 Sonnet' : base.tier === 'os-worker' ? 'Nemotron 3 Super 120B' : 'Gemini 3.8 Flash'),
      llmProvider: base.llmProvider ?? `9Router (${base.tier})`,
      llmFallback: base.llmFallback ?? (base.tier === 'os-private' ? 'Ollama Local' : 'Gemini 3.1 Pro'),
      soulFile: base.soulFile ?? `infra/profiles/soul/${profile}.md`,
      duties: base.duties ?? [base.soulBio || `Melakukan tugas operasional spesialis ${base.title}`],
    };
  }

  return {
    name: profile,
    title: 'Agent Specialist',
    tier: 'os-brain',
    llmModel: 'Claude 3.5 Sonnet',
    llmProvider: '9Router (os-brain)',
    llmFallback: 'Gemini 3.1 Pro',
    soulFile: `infra/profiles/soul/${profile}.md`,
    duties: ['Menjalankan instruksi tugas dan koordinasi di workspace'],
    aspiration: 'Knowledge',
    aspirationIcon: '💡',
    aspirationLabel: 'Pengetahuan',
    zodiac: 'Aries',
    zodiacIcon: '♈',
    traits: ['Mandiri', 'Fokus'],
    soulBio: `Agent ${profile} di Agentic OS.`,
    skills: { logic: 7, creativity: 7, charisma: 7, mechanical: 7, cleaning: 7 },
  };
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
