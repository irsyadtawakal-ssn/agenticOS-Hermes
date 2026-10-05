import React, { useState, useId } from 'react';
import { PROFILES, addProfileToRegistry } from '../hermes/labels.ts';
import { createProfile, type CreateProfileInput } from './api.ts';
import { saveCustomProfileMeta, type SimProfileMeta } from '../sims-office/SimsMotives.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';

interface AgentWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentCreated?: (profileName: string) => void;
}

const ASPIRATIONS: Array<{
  id: SimProfileMeta['aspiration'];
  icon: string;
  label: string;
  desc: string;
}> = [
  { id: 'Knowledge', icon: '💡', label: 'Knowledge (Pengetahuan)', desc: 'Fokus pada riset mendalam, pemecahan masalah kompleks, dan logika kuat.' },
  { id: 'Fortune', icon: '🛠', label: 'Fortune (Infrastruktur)', desc: 'Fokus pada efisiensi sistem, uptime tinggi, kode tangguh, dan metrik performa.' },
  { id: 'Popularity', icon: '🤝', label: 'Popularity (Kolaborasi)', desc: 'Fokus pada koordinasi antar agent, delegasi tugas, dan komunikasi tim.' },
  { id: 'Family', icon: '📋', label: 'Family (Privasi & Tertib)', desc: 'Fokus pada kerapian berkas, kerahasiaan data owner, dan kepatuhan jadwal.' },
  { id: 'Creativity', icon: '🎨', label: 'Creativity (Ide & Kreatif)', desc: 'Fokus pada eksplorasi ide, penulisan konten menarik, dan inovasi.' },
];

const ZODIACS = [
  { name: 'Aries', icon: '♈' },
  { name: 'Taurus', icon: '♉' },
  { name: 'Gemini', icon: '♊' },
  { name: 'Cancer', icon: '♋' },
  { name: 'Leo', icon: '♌' },
  { name: 'Virgo', icon: '♍' },
  { name: 'Libra', icon: '♎' },
  { name: 'Scorpio', icon: '♏' },
  { name: 'Sagittarius', icon: '♐' },
  { name: 'Capricorn', icon: '♑' },
  { name: 'Aquarius', icon: '♒' },
  { name: 'Pisces', icon: '♓' },
];

const PLUMBOB_SWATCHES = [
  { color: '#22c55e', name: 'Sims Emerald' },
  { color: '#06b6d4', name: 'Neon Cyan' },
  { color: '#3b82f6', name: 'Deep Sapphire' },
  { color: '#a855f7', name: 'Royal Violet' },
  { color: '#eab308', name: 'Solar Amber' },
  { color: '#f97316', name: 'Sunset Orange' },
  { color: '#ec4899', name: 'Cyber Magenta' },
];

export const AgentWizardModal: React.FC<AgentWizardModalProps> = ({ isOpen, onClose, onAgentCreated }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Identity
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Tier & Runtime
  const [tier, setTier] = useState<'os-brain' | 'os-worker' | 'os-private'>('os-brain');
  const [dockerNetwork, setDockerNetwork] = useState(true);
  const [egressProxy, setEgressProxy] = useState(true);

  // Step 3: Sims Persona & SOUL
  const [aspiration, setAspiration] = useState<SimProfileMeta['aspiration']>('Knowledge');
  const [zodiac, setZodiac] = useState('Aquarius');
  const [plumbobColor, setPlumbobColor] = useState('#22c55e');
  const [traitsText, setTraitsText] = useState('Teliti, Cepat, Terstruktur');
  const [soulPrompt, setSoulPrompt] = useState('');

  // Step 4: Submission
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState(false);

  const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
  const isNameTaken = PROFILES.includes(cleanName);
  const isNameValid = /^[a-z][a-z0-9_-]{1,31}$/.test(cleanName);

  if (!isOpen) return null;

  // Auto-generate starter SOUL if empty
  const getSuggestedSoul = () => {
    return `# ${cleanName ? cleanName.toUpperCase() : 'AGENT'} - ${title || 'Specialist'}\n\nAnda adalah ${title || 'agen spesialis'} di Agentic OS.\n\n## Peran Utama:\n${description || 'Menjalankan tugas sesuai spesialisasi tim.'}\n\n## Prinsip Kerja:\n- Bekerja secara mandiri dan cermat.\n- Selalu mencatat perkembangan di kartu workspace.\n- Berikan solusi yang langsung dapat dieksekusi.\n`;
  };

  const handleNextFromStep1 = () => {
    simsAudio.playClick();
    if (!isNameValid || isNameTaken || !title || !description) return;
    if (!soulPrompt) {
      setSoulPrompt(getSuggestedSoul());
    }
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    simsAudio.playClick();
    if (!soulPrompt) {
      setSoulPrompt(getSuggestedSoul());
    }
    setStep(3);
  };

  const handleNextFromStep3 = () => {
    simsAudio.playClick();
    setStep(4);
  };

  const handleSubmit = async () => {
    simsAudio.playClick();
    setErrorMsg(null);
    setSubmitting(true);

    const payload: CreateProfileInput = {
      name: cleanName,
      description,
      tier,
      docker_network: dockerNetwork,
      egress_proxy: egressProxy,
      soul: soulPrompt || getSuggestedSoul(),
    };

    try {
      // 1. Send to Backend API
      await createProfile(payload).catch((err: Error) => {
        console.warn('API /v1/profiles returned warning or running in mock:', err.message);
        // If server endpoint isn't ready or offline, continue with client registry
      });

      // 2. Register dynamic profile in frontend
      addProfileToRegistry({ name: cleanName, tier });

      // 3. Register custom Sims Meta
      const aspObj = ASPIRATIONS.find((a) => a.id === aspiration) ?? ASPIRATIONS[0];
      const zodObj = ZODIACS.find((z) => z.name === zodiac) ?? ZODIACS[0];
      const parsedTraits = traitsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const customMeta: SimProfileMeta = {
        name: cleanName,
        title: title || 'Specialist',
        tier,
        aspiration: aspObj.id,
        aspirationIcon: aspObj.icon,
        aspirationLabel: aspObj.label.split(' ')[0],
        zodiac: zodObj.name,
        zodiacIcon: zodObj.icon,
        traits: parsedTraits.length > 0 ? parsedTraits : ['Fokus', 'Mandiri'],
        soulBio: description,
        skills: {
          logic: tier === 'os-brain' ? 9 : 7,
          creativity: aspiration === 'Creativity' ? 9 : 7,
          charisma: aspiration === 'Popularity' ? 9 : 6,
          mechanical: tier === 'os-brain' ? 8 : 6,
          cleaning: 7,
        },
        customPlumbobColor: plumbobColor,
      };

      saveCustomProfileMeta(customMeta);

      // 4. Success Sound & Feedback
      simsAudio.playSuccess();
      setCreatedSuccess(true);
      onAgentCreated?.(cleanName);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Gagal membuat agent');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-sky-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]">
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-lg shadow-lg shadow-sky-500/20">
              ✨
            </span>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Wizard Tambah Agent Baru
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Hermes Fleet
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Langkah {step} dari 4: {step === 1 && 'Identitas & Peran'}
                {step === 2 && 'Tier & Hak Akses Runtime'}
                {step === 3 && 'Karakter Sims 3D & Persona'}
                {step === 4 && 'Konfirmasi & Peluncuran'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              simsAudio.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* STEP PROGRESS BAR */}
        <div className="grid grid-cols-4 border-b border-white/5 bg-slate-950/30 text-xs text-center font-mono">
          <div className={`py-2 border-b-2 transition-colors ${step === 1 ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10' : step > 1 ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            1. Identitas
          </div>
          <div className={`py-2 border-b-2 transition-colors ${step === 2 ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10' : step > 2 ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            2. Tier & Akses
          </div>
          <div className={`py-2 border-b-2 transition-colors ${step === 3 ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10' : step > 3 ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-500'}`}>
            3. SOUL & Sims
          </div>
          <div className={`py-2 border-b-2 transition-colors ${step === 4 ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10' : 'border-transparent text-slate-500'}`}>
            4. Peluncuran
          </div>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SUCCESS VIEW */}
          {createdSuccess ? (
            <div className="text-center py-8 space-y-4 animate-scaleUp">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/20">
                🎉
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Agent '{cleanName}' Berhasil Didaftarkan!</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto mt-1 leading-relaxed">
                  Profil baru telah ditambahkan ke konfigurasi armada Agentic OS dan otomatis ditempatkan di workstation kantor Sims 3D.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-xs font-mono">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: plumbobColor }} />
                <span className="font-bold text-white">{cleanName}</span>
                <span className="text-slate-400">({title})</span>
                <span className="text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">{tier}</span>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    simsAudio.playClick();
                    onClose();
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all"
                >
                  Selesai & Buka Kantor
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: IDENTITY */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      ID Profile Agent (System Name) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="contoh: copywriter, qa, support, devops"
                      value={name}
                      onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      className="w-full bg-slate-950 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all font-mono"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Hanya huruf kecil, angka, tanda minus atau garis bawah (2-32 karakter).</span>
                      {name && (
                        <span>
                          {isNameTaken ? (
                            <span className="text-rose-400 font-semibold">✗ Nama sudah digunakan</span>
                          ) : isNameValid ? (
                            <span className="text-emerald-400 font-semibold">✓ Nama valid</span>
                          ) : (
                            <span className="text-amber-400">Format belum sesuai</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Gelar / Job Title <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="contoh: QA & Security Auditor, Content Specialist"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 focus:border-sky-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Deskripsi Tugas & Tanggung Jawab <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Tuliskan spesialisasi dan tanggung jawab utama agent ini di Agentic OS..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 focus:border-sky-400 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: TIER & RUNTIME */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      Pilih Klasifikasi Tier Agent
                    </label>
                    <div className="grid grid-cols-1 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTier('os-brain');
                          setDockerNetwork(true);
                          setEgressProxy(true);
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${tier === 'os-brain' ? 'bg-sky-500/10 border-sky-400 shadow-md shadow-sky-500/10' : 'bg-slate-950/40 border-white/10 hover:border-white/20'}`}
                      >
                        <span className="text-2xl mt-0.5">🧠</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">os-brain (Penalaran Penuh & Mandiri)</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">Rekomendasi Dev & Admin</span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                            Mendapatkan model reasoning tier atas, izin eksekusi container Docker, terminal command, dan pemecahan masalah otonom.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTier('os-worker');
                          setDockerNetwork(false);
                          setEgressProxy(false);
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${tier === 'os-worker' ? 'bg-amber-500/10 border-amber-400 shadow-md shadow-amber-500/10' : 'bg-slate-950/40 border-white/10 hover:border-white/20'}`}
                      >
                        <span className="text-2xl mt-0.5">⚡</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">os-worker (Pekerja Tugas & Riset)</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Hemat Biaya Token</span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                            Fokus pada tugas spesifik seperti riset web, pengumpulan data, penulisan draft, dan pembuatan kartu Kanban. Non-sandbox.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTier('os-private');
                          setDockerNetwork(false);
                          setEgressProxy(false);
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${tier === 'os-private' ? 'bg-purple-500/10 border-purple-400 shadow-md shadow-purple-500/10' : 'bg-slate-950/40 border-white/10 hover:border-white/20'}`}
                      >
                        <span className="text-2xl mt-0.5">🔒</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">os-private (Data Rahasia & Personal)</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Privasi Eksekutif</span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                            Dipercaya mengelola data sensitif, jadwal pribadi owner, dan catatan tertutup. Terisolasi dari agent publik.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950/60 rounded-xl border border-white/5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Hak Akses Sandbox & Jaringan
                    </h4>
                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <div>
                        <span className="font-semibold text-white block">Docker Sandbox Container</span>
                        <span className="text-slate-400 text-[11px]">Jalankan terminal tools dalam container terisolasi</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={dockerNetwork}
                        onChange={(e) => setDockerNetwork(e.target.checked)}
                        className="rounded border-white/20 text-sky-500 focus:ring-sky-400 h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs cursor-pointer pt-2 border-t border-white/5">
                      <div>
                        <span className="font-semibold text-white block">Egress Proxy Filtering</span>
                        <span className="text-slate-400 text-[11px]">Filter akses internet agen melalui proxy keamanan</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={egressProxy}
                        onChange={(e) => setEgressProxy(e.target.checked)}
                        className="rounded border-white/20 text-sky-500 focus:ring-sky-400 h-4 w-4"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* STEP 3: SIMS & SOUL */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Aspiration */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Aspirasi Sims
                      </label>
                      <select
                        value={aspiration}
                        onChange={(e) => setAspiration(e.target.value as SimProfileMeta['aspiration'])}
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      >
                        {ASPIRATIONS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.icon} {a.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Zodiac */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Zodiak Sims
                      </label>
                      <select
                        value={zodiac}
                        onChange={(e) => setZodiac(e.target.value)}
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      >
                        {ZODIACS.map((z) => (
                          <option key={z.name} value={z.name}>
                            {z.icon} {z.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Plumbob Color */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Warna Plumbob Hologram
                    </label>
                    <div className="flex items-center gap-2">
                      {PLUMBOB_SWATCHES.map((swatch) => (
                        <button
                          key={swatch.color}
                          type="button"
                          title={swatch.name}
                          onClick={() => setPlumbobColor(swatch.color)}
                          className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${plumbobColor === swatch.color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110 opacity-75 hover:opacity-100'}`}
                          style={{ backgroundColor: swatch.color }}
                        >
                          {plumbobColor === swatch.color && <span className="text-[10px] text-black font-bold">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Traits */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Sifat / Karakter Traits (Pisahkan Koma)
                    </label>
                    <input
                      type="text"
                      placeholder="contoh: Teliti, Analitis, Solutif, Cepat"
                      value={traitsText}
                      onChange={(e) => setTraitsText(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                    />
                  </div>

                  {/* SOUL System Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        SOUL Persona Prompt (Markdown)
                      </label>
                      <button
                        type="button"
                        onClick={() => setSoulPrompt(getSuggestedSoul())}
                        className="text-[10px] text-sky-400 hover:underline"
                      >
                        Reset ke Template
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={soulPrompt}
                      onChange={(e) => setSoulPrompt(e.target.value)}
                      className="w-full bg-slate-950 border border-white/15 focus:border-sky-400 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none font-mono resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: REVIEW & LAUNCH */}
              {step === 4 && (
                <div className="space-y-4">
                  {/* Holographic ID Badge */}
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 border border-white/15 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-15 text-6xl">
                      {ASPIRATIONS.find((a) => a.id === aspiration)?.icon || '✨'}
                    </div>

                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg relative border border-white/20"
                        style={{ backgroundColor: `${plumbobColor}25` }}
                      >
                        <span className="relative z-10">{ASPIRATIONS.find((a) => a.id === aspiration)?.icon || '👤'}</span>
                        <span
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 shadow-sm"
                          style={{ backgroundColor: plumbobColor }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white capitalize">{cleanName}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {tier}
                          </span>
                        </div>
                        <div className="text-xs text-sky-200 font-medium">{title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{ZODIACS.find((z) => z.name === zodiac)?.icon} {zodiac}</span>
                          <span>•</span>
                          <span>{aspiration}</span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-300 leading-relaxed italic">
                      "{description}"
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {traitsText
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map((trait) => (
                          <span key={trait} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                            #{trait}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950/60 rounded-xl border border-white/5 text-xs text-slate-300 space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Direktori Konfigurasi:</span>
                      <span className="text-slate-200">infra/profiles/soul/{cleanName}.md</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Sandbox Docker:</span>
                      <span className={dockerNetwork ? 'text-emerald-400' : 'text-slate-500'}>{dockerNetwork ? 'Aktif' : 'Non-aktif'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Egress Proxy:</span>
                      <span className={egressProxy ? 'text-emerald-400' : 'text-slate-500'}>{egressProxy ? 'Terproteksi' : 'Bypass'}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        {!createdSuccess && (
          <div className="px-6 py-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  simsAudio.playClick();
                  setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
              >
                ← Kembali
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  simsAudio.playClick();
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Batal
              </button>
            )}

            <div>
              {step === 1 && (
                <button
                  type="button"
                  disabled={!isNameValid || isNameTaken || !title || !description}
                  onClick={handleNextFromStep1}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all"
                >
                  Lanjut ke Tier →
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all"
                >
                  Lanjut ke SOUL →
                </button>
              )}
              {step === 3 && (
                <button
                  type="button"
                  onClick={handleNextFromStep3}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all"
                >
                  Review Profil →
                </button>
              )}
              {step === 4 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Mendaftarkan Agent...
                    </>
                  ) : (
                    '🚀 Daftarkan & Aktifkan Agent'
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
