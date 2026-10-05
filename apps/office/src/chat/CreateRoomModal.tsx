import { useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { getProfileMeta } from '../sims-office/SimsMotives.ts';
import { saveRoom, type ChatRoom } from './rooms.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { shell } from '../shell/store.ts';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (room: ChatRoom) => void;
}

const EMOJI_OPTIONS = ['🌯', '⚡', '💻', '📢', '🎯', '🚀', '💼', '🔬', '🔥', '📊', '🛡️', '💡', '🤖', '📦', '⭐'];

export function CreateRoomModal({ isOpen, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🌯');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>(['tara', 'adelia', 'clara', 'maya']);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleMember = (profile: string) => {
    simsAudio.playBubbleClick();
    setSelectedMembers((prev) =>
      prev.includes(profile) ? prev.filter((p) => p !== profile) : [...prev, profile]
    );
  };

  const handleSelectPreset = (members: string[]) => {
    simsAudio.playBubbleClick();
    setSelectedMembers([...members]);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Mohon masukkan nama room chat.');
      return;
    }
    if (selectedMembers.length === 0) {
      setError('Pilih minimal 1 agen sebagai anggota room.');
      return;
    }

    try {
      simsAudio.playSelectSim();
      const room = saveRoom({
        name: name.trim(),
        icon,
        description: description.trim(),
        members: selectedMembers,
      });

      // Automatically select the new room in shell & switch to chat tab
      shell.select(room.id);
      shell.setTab('chat');

      onCreated?.(room);
      onClose();
      // Reset form
      setName('');
      setDescription('');
      setSelectedMembers(['tara', 'adelia', 'clara', 'maya']);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 border border-sky-400/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-1 bg-sky-500/20 border border-sky-400/30 rounded-xl">{icon}</span>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>Buat Room Chat Baru</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-semibold uppercase">
                  Saluran Tim
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ruang obrolan kolaboratif antar-agen dengan anggota yang dapat disesuaikan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-6 overflow-y-auto flex flex-col gap-5 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Name & Icon Row */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Nama & Ikon Room <span className="text-rose-400">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative group">
                <button
                  type="button"
                  className="h-10 px-3 bg-slate-800 hover:bg-slate-700 text-xl border border-sky-400/30 rounded-xl flex items-center justify-center cursor-pointer transition"
                  title="Pilih Emoji"
                >
                  {icon}
                </button>
                <div className="absolute top-full left-0 mt-1 hidden group-hover:flex group-focus-within:flex flex-wrap gap-1 p-2 bg-slate-900 border border-sky-400/40 rounded-xl shadow-xl z-20 w-48">
                  {EMOJI_OPTIONS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setIcon(em)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-sky-500/30 transition ${
                        icon === em ? 'bg-sky-500/40 border border-sky-400' : ''
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Operasional Resto / War Room Ramadan"
                className="flex-1 bg-slate-800/90 border border-white/10 focus:border-cyan-400 rounded-xl px-4 py-2 text-sm text-white outline-none transition"
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Topik / Deskripsi Room
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Koordinasi harian tim SukaShawarma & rekonsiliasi omzet"
              className="w-full bg-slate-800/90 border border-white/10 focus:border-cyan-400 rounded-xl px-4 py-2 text-sm text-white outline-none transition"
            />
          </div>

          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Pilih Anggota ({selectedMembers.length} terpilih) <span className="text-rose-400">*</span>
              </label>
              <div className="flex gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => handleSelectPreset(['tara', 'adelia', 'clara', 'maya'])}
                  className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 cursor-pointer font-semibold transition"
                >
                  🌯 SukaShawarma
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset(['chief', 'dev', 'researcher', 'secretary', 'content', 'hermes-default'])}
                  className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 cursor-pointer font-semibold transition"
                >
                  💻 Core
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset(['chief', 'tara'])}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 cursor-pointer font-semibold transition"
                >
                  ⚡ Eksekutif
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset([...PROFILES])}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer font-semibold transition"
                >
                  Semua
                </button>
              </div>
            </div>

            {/* Member Checkbox Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-slate-950/60 rounded-xl border border-white/5">
              {PROFILES.map((p) => {
                const isSelected = selectedMembers.includes(p);
                const meta = getProfileMeta(p);
                const isShawarma = ['tara', 'adelia', 'clara', 'maya'].includes(p);
                const isChief = p === 'chief';
                const label = isChief ? 'Arthur (Chief)' : p === 'tara' ? 'Tara (Director)' : meta.title;

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleMember(p)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-left cursor-pointer transition ${
                      isSelected
                        ? 'bg-sky-950/50 border-sky-400/60 shadow-sm'
                        : 'bg-slate-900/50 border-white/5 opacity-70 hover:opacity-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-white/20 pointer-events-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white capitalize">{isChief ? 'Arthur' : p}</span>
                        {isShawarma && <span className="text-[10px]">🌯</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-white/10 cursor-pointer transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-sky-500/25 cursor-pointer transition flex items-center gap-1.5"
            >
              <span>✨</span>
              <span>Buat & Masuk Room</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
