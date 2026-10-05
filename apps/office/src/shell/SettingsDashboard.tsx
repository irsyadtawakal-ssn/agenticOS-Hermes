import { useEffect, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { getProfileMeta } from '../sims-office/SimsMotives.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { triggerBackup } from './api.ts';
import { requestNotificationPermission, sendDesktopNotification } from './notifications.ts';
import { shell, useShell } from './store.ts';
import './sims-shell.css';

type SettingsTab = 'general' | 'audio' | 'notifications' | 'display' | 'agents' | 'security' | 'system';

export function SettingsDashboard() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // General Settings State
  const [officeName, setOfficeName] = useState(() => {
    return localStorage.getItem('aos.settings.officeName') || 'Hermes Office';
  });
  const [operatorName, setOperatorName] = useState(() => {
    return localStorage.getItem('aos.settings.operatorName') || 'Operator';
  });
  const [operatorRole, setOperatorRole] = useState(() => {
    return localStorage.getItem('aos.settings.operatorRole') || 'Project Lead';
  });
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('aos.settings.language') || 'id';
  });
  const [timezone, setTimezone] = useState(() => {
    return localStorage.getItem('aos.settings.timezone') || 'Asia/Jakarta';
  });
  const [timeFormat, setTimeFormat] = useState(() => {
    return localStorage.getItem('aos.settings.timeFormat') || '24h';
  });
  const [chatSendKey, setChatSendKey] = useState(() => {
    return localStorage.getItem('aos.settings.chatSendKey') || 'enter';
  });
  const [speechLang, setSpeechLang] = useState(() => {
    return localStorage.getItem('aos.settings.speechLang') || 'id-ID';
  });
  const [defaultDockTab, setDefaultDockTab] = useState(() => {
    return localStorage.getItem('aos.settings.defaultDockTab') || 'cards';
  });
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Audio State
  const [isMuted, setIsMuted] = useState(() => simsAudio.isMuted());
  const [volume, setVolume] = useState(() => Math.round(simsAudio.getVolume() * 100));

  // Notification State
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default';
  });
  const [notifyOnDone, setNotifyOnDone] = useState(() => {
    return localStorage.getItem('aos.settings.notifyDone') !== 'false';
  });
  const [notifyOnApproval, setNotifyOnApproval] = useState(() => {
    return localStorage.getItem('aos.settings.notifyApproval') !== 'false';
  });
  const [audioChimeOnNotif, setAudioChimeOnNotif] = useState(() => {
    return localStorage.getItem('aos.settings.notifChime') !== 'false';
  });

  // Display State
  const viewMode = useShell((s) => s.viewMode);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(() => {
    return localStorage.getItem('aos.sims.alwaysShowLabels') === 'true';
  });
  const [shadowsEnabled, setShadowsEnabled] = useState(() => {
    return localStorage.getItem('aos.sims.shadows') !== 'false';
  });
  const [highFpsMode, setHighFpsMode] = useState(() => {
    return localStorage.getItem('aos.sims.highFps') !== 'false';
  });

  // System & Backup State
  const health = useShell((s) => s.health);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Sync notif permission periodically or on focus
  useEffect(() => {
    const checkPerm = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
    };
    window.addEventListener('focus', checkPerm);
    return () => window.removeEventListener('focus', checkPerm);
  }, []);

  const handleSaveGeneral = () => {
    simsAudio.playBubbleClick();
    localStorage.setItem('aos.settings.officeName', officeName.trim() || 'Hermes Office');
    localStorage.setItem('aos.settings.operatorName', operatorName.trim() || 'Operator');
    localStorage.setItem('aos.settings.operatorRole', operatorRole);
    localStorage.setItem('aos.settings.language', language);
    localStorage.setItem('aos.settings.timezone', timezone);
    localStorage.setItem('aos.settings.timeFormat', timeFormat);
    localStorage.setItem('aos.settings.chatSendKey', chatSendKey);
    localStorage.setItem('aos.settings.speechLang', speechLang);
    localStorage.setItem('aos.settings.defaultDockTab', defaultDockTab);

    window.dispatchEvent(new Event('aos-settings-updated'));
    setSaveSuccessMsg('Pengaturan umum berhasil disimpan!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleResetGeneral = () => {
    if (confirm('Kembalikan pengaturan umum ke nilai default?')) {
      simsAudio.playBubbleClick();
      setOfficeName('Hermes Office');
      setOperatorName('Operator');
      setOperatorRole('Project Lead');
      setLanguage('id');
      setTimezone('Asia/Jakarta');
      setTimeFormat('24h');
      setChatSendKey('enter');
      setSpeechLang('id-ID');
      setDefaultDockTab('cards');

      localStorage.removeItem('aos.settings.officeName');
      localStorage.removeItem('aos.settings.operatorName');
      localStorage.removeItem('aos.settings.operatorRole');
      localStorage.removeItem('aos.settings.language');
      localStorage.removeItem('aos.settings.timezone');
      localStorage.removeItem('aos.settings.timeFormat');
      localStorage.removeItem('aos.settings.chatSendKey');
      localStorage.removeItem('aos.settings.speechLang');
      localStorage.removeItem('aos.settings.defaultDockTab');

      window.dispatchEvent(new Event('aos-settings-updated'));
      setSaveSuccessMsg('Pengaturan umum dikembalikan ke default.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  const handleMuteToggle = () => {
    const nextMuted = simsAudio.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) {
      simsAudio.playClick();
    }
  };

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    simsAudio.setVolume(newVal / 100);
  };

  const handleRequestNotif = async () => {
    simsAudio.playBubbleClick();
    const granted = await requestNotificationPermission();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
    if (granted) {
      sendDesktopNotification('🔔 Notifikasi Diizinkan', {
        body: 'Agentic OS kini dapat mengirimkan notifikasi tugas dan persetujuan langsung ke desktop Anda.',
      });
    }
  };

  const handleTestNotif = () => {
    simsAudio.playPlumbob();
    sendDesktopNotification('🧪 Uji Notifikasi Agentic OS', {
      body: 'Notifikasi desktop berfungsi dengan baik dan siap menerima update tugas!',
    });
  };

  const handleRunBackup = async () => {
    simsAudio.playBubbleClick();
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await triggerBackup();
      setBackupResult({
        ok: true,
        msg: `Backup berhasil dibuat: ${res.path ?? 'core.db'} (${res.bytes ? (res.bytes / 1024).toFixed(1) + ' KB' : 'sukses'})`,
      });
      simsAudio.playTaskComplete();
    } catch (err) {
      setBackupResult({
        ok: false,
        msg: `Gagal membuat backup: ${(err as Error).message}`,
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleClearCache = () => {
    if (confirm('Bersihkan preferensi dan sesi lokal? Halaman akan dimuat ulang.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div
      className="sims-settings-backdrop"
      onClick={() => shell.toggleSettings()}
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard Pengaturan"
    >
      <div className="sims-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sims-settings-header">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Dashboard Pengaturan
              </h2>
              <p className="text-[11px] text-sky-200/80">
                Pusat Konfigurasi Umum & Preferensi Sistem Agentic OS Hermes
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer transition"
            onClick={() => shell.toggleSettings()}
            title="Tutup Pengaturan (Esc)"
          >
            ✕ Tutup (Esc)
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="sims-settings-tab-list" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            className={`sims-settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('general');
            }}
          >
            <span>🏠</span>
            <span>Pengaturan Umum</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audio'}
            className={`sims-settings-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('audio');
            }}
          >
            <span>🔊</span>
            <span>Audio & Suara</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notifications'}
            className={`sims-settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('notifications');
            }}
          >
            <span>🔔</span>
            <span>Notifikasi</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'display'}
            className={`sims-settings-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('display');
            }}
          >
            <span>🖥️</span>
            <span>Tampilan & 3D</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agents'}
            className={`sims-settings-tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('agents');
            }}
          >
            <span>🤖</span>
            <span>Agen & AI</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            className={`sims-settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('security');
            }}
          >
            <span>🛡️</span>
            <span>Keamanan</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'system'}
            className={`sims-settings-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => {
              simsAudio.playClick();
              setActiveTab('system');
            }}
          >
            <span>💾</span>
            <span>Sistem & Cadangan</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="sims-settings-body">
          {/* TAB 0: PENGATURAN UMUM */}
          {activeTab === 'general' && (
            <>
              {saveSuccessMsg && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs font-semibold flex items-center justify-between">
                  <span>✓ {saveSuccessMsg}</span>
                  <button
                    type="button"
                    onClick={() => setSaveSuccessMsg(null)}
                    className="text-emerald-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Identitas Organisasi & Kantor */}
              <div className="sims-settings-section-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    🏢 Identitas Kantor & Profil Pengguna
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold border border-sky-400/30">
                    {operatorRole} · {officeName}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Kantor / Workspace
                    </label>
                    <input
                      type="text"
                      value={officeName}
                      onChange={(e) => setOfficeName(e.target.value)}
                      placeholder="Contoh: Hermes HQ, Studio AI..."
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Nama ini ditampilkan pada baris informasi utama dan header workspace.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Panggilan Operator (Anda)
                    </label>
                    <input
                      type="text"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      placeholder="Nama Anda..."
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Nama panggilan yang dikenali oleh agen asisten dalam percakapan.
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Peran / Jabatan Anda
                  </label>
                  <select
                    value={operatorRole}
                    onChange={(e) => setOperatorRole(e.target.value)}
                    className="sims-chat-session-select w-full h-8 text-xs"
                  >
                    <option value="Project Lead">👑 Project Lead / Owner</option>
                    <option value="Lead Architect">🛠️ Lead Architect / Tech Lead</option>
                    <option value="Security Admin">🛡️ Security Admin / Officer</option>
                    <option value="Operator">💻 System Operator</option>
                    <option value="Reviewer">🔍 Quality & Code Reviewer</option>
                  </select>
                </div>
              </div>

              {/* Bahasa, Zona Waktu & Format */}
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  🌐 Bahasa, Wilayah & Format Waktu
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Bahasa Antarmuka
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="sims-chat-session-select w-full h-8 text-xs"
                    >
                      <option value="id">Bahasa Indonesia (ID)</option>
                      <option value="en">English (US)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Zona Waktu Utama
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="sims-chat-session-select w-full h-8 text-xs"
                    >
                      <option value="Asia/Jakarta">Asia/Jakarta (WIB · UTC+7)</option>
                      <option value="Asia/Makassar">Asia/Makassar (WITA · UTC+8)</option>
                      <option value="Asia/Jayapura">Asia/Jayapura (WIT · UTC+9)</option>
                      <option value="UTC">UTC / GMT</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Format Penunjuk Jam
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTimeFormat('24h')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                          timeFormat === '24h'
                            ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        24 Jam
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeFormat('12h')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                          timeFormat === '12h'
                            ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        12 Jam (AM/PM)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Perilaku Obrolan & Masukan */}
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  💬 Perilaku Obrolan & Dikte Suara
                </h3>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Kombinasi Tombol Kirim Pesan</strong>
                    <span className="text-xs text-slate-400">
                      Pilih tombol yang memicu pengiriman pesan di textarea obrolan.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChatSendKey('enter')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        chatSendKey === 'enter'
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                      title="Enter untuk kirim, Shift+Enter untuk baris baru"
                    >
                      Enter (Biasa)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatSendKey('ctrl')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                        chatSendKey === 'ctrl'
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                          : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                      title="Ctrl+Enter untuk kirim, Enter untuk baris baru"
                    >
                      Ctrl + Enter
                    </button>
                  </div>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Bahasa Dikte Suara (Speech Recognition)</strong>
                    <span className="text-xs text-slate-400">
                      Model bahasa yang dideteksi oleh mikrofon saat melakukan input suara.
                    </span>
                  </div>
                  <select
                    value={speechLang}
                    onChange={(e) => setSpeechLang(e.target.value)}
                    className="sims-chat-session-select text-xs h-8 px-2"
                  >
                    <option value="id-ID">🇮🇩 Bahasa Indonesia (id-ID)</option>
                    <option value="en-US">🇺🇸 English (en-US)</option>
                  </select>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Tab Panel Samping Default saat Buka</strong>
                    <span className="text-xs text-slate-400">
                      Pilih panel samping mana yang otomatis terbuka saat pertama membuka kantor.
                    </span>
                  </div>
                  <select
                    value={defaultDockTab}
                    onChange={(e) => setDefaultDockTab(e.target.value)}
                    className="sims-chat-session-select text-xs h-8 px-2"
                  >
                    <option value="cards">📋 Kartu Kanban (Cards)</option>
                    <option value="chat">💬 Percakapan (Chat)</option>
                    <option value="activity">⚡ Log Aktivitas (Activity)</option>
                    <option value="agent">👤 Status Agen (Inspector)</option>
                  </select>
                </div>
              </div>

              {/* Tombol Simpan & Reset */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetGeneral}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/30 rounded-xl transition cursor-pointer"
                >
                  🔄 Kembalikan ke Standar Default
                </button>

                <button
                  type="button"
                  onClick={handleSaveGeneral}
                  className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-lg cursor-pointer transition flex items-center gap-1.5"
                >
                  <span>💾</span>
                  <span>Simpan Pengaturan Umum</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 1: AUDIO */}
          {activeTab === 'audio' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Kontrol Suara & Efek Web Audio
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Efek Suara The Sims</strong>
                    <span className="text-xs text-slate-400">
                      Aktifkan atau matikan seluruh efek suara UI dan simulasi agen.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={!isMuted}
                      onChange={handleMuteToggle}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div className="flex-1 mr-4">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-sm text-white">Volume Master</strong>
                      <span className="text-xs font-mono text-sky-300 font-bold">{volume}%</span>
                    </div>
                    <span className="text-xs text-slate-400 block mb-2">
                      Mengatur tingkat kekerasan suara efek interaksi dan nada notifikasi.
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      disabled={isMuted}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                    />
                  </div>
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Uji Efek Suara Simulasi
                </h3>
                <p className="text-xs text-slate-400">
                  Klik tombol di bawah untuk mendengarkan sampel suara yang disintesis via Web Audio API:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isMuted}
                    onClick={() => simsAudio.playPlumbob()}
                    className="px-3 py-2 bg-sky-500/15 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-40"
                  >
                    🎵 Plumbob Chime
                  </button>
                  <button
                    type="button"
                    disabled={isMuted}
                    onClick={() => simsAudio.playBubbleClick()}
                    className="px-3 py-2 bg-sky-500/15 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-40"
                  >
                    💬 Bubble Click
                  </button>
                  <button
                    type="button"
                    disabled={isMuted}
                    onClick={() => simsAudio.playBroadcast()}
                    className="px-3 py-2 bg-sky-500/15 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-40"
                  >
                    📢 Broadcast Ping
                  </button>
                  <button
                    type="button"
                    disabled={isMuted}
                    onClick={() => simsAudio.playCoffee()}
                    className="px-3 py-2 bg-sky-500/15 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-40"
                  >
                    ☕ Mesin Kopi
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: NOTIFIKASI */}
          {activeTab === 'notifications' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Izin Notifikasi Desktop OS
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <strong className="text-sm text-white">Status Izin Browser:</strong>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          notifPermission === 'granted'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : notifPermission === 'denied'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {notifPermission === 'granted'
                          ? 'Diizinkan (Active)'
                          : notifPermission === 'denied'
                            ? 'Diblokir (Blocked)'
                            : 'Belum Diatur (Default)'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      Notifikasi muncul di sudut layar Windows bahkan saat tab kantor sedang diminimize.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {notifPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={handleRequestNotif}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow transition"
                      >
                        Minta Izin
                      </button>
                    )}
                    {notifPermission === 'granted' && (
                      <button
                        type="button"
                        onClick={handleTestNotif}
                        className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 text-emerald-200 rounded-lg text-xs font-semibold cursor-pointer transition"
                      >
                        Kirim Tes Notifikasi
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Preferensi Pemicu Notifikasi
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Tugas Selesai (Kanban Done)</strong>
                    <span className="text-xs text-slate-400">
                      Kirim notifikasi saat agen berhasil menyelesaikan tugas di papan Kanban.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifyOnDone}
                      onChange={(e) => {
                        setNotifyOnDone(e.target.checked);
                        localStorage.setItem('aos.settings.notifyDone', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Permintaan Izin Operasi (Approval)</strong>
                    <span className="text-xs text-slate-400">
                      Kirim notifikasi mendesak saat agen meminta izin menjalankan perintah sensitif.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifyOnApproval}
                      onChange={(e) => {
                        setNotifyOnApproval(e.target.checked);
                        localStorage.setItem('aos.settings.notifyApproval', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Nada Suara Notifikasi</strong>
                    <span className="text-xs text-slate-400">
                      Bunyikan suara lonceng halus saat notifikasi desktop dikirim.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={audioChimeOnNotif}
                      onChange={(e) => {
                        setAudioChimeOnNotif(e.target.checked);
                        localStorage.setItem('aos.settings.notifChime', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: TAMPILAN & 3D */}
          {activeTab === 'display' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Mode Kantor Aktif
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => shell.setViewMode('sims')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      viewMode === 'sims'
                        ? 'border-sky-400 bg-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                        : 'border-white/10 hover:border-sky-400/40 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🏡</span>
                      <strong className="text-white text-sm">The Sims 2 3D Office</strong>
                    </div>
                    <p className="text-xs text-slate-300 mb-3">
                      Lingkungan 3D Three.js lengkap dengan pencahayaan siang/malam, karakter bergerak, thought bubbles, dan kontrol kamera 360°.
                    </p>
                    <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                      <span>Status: {viewMode === 'sims' ? '✓ Aktif' : 'Pilih'}</span>
                    </div>
                  </div>

                  <div
                    onClick={() => shell.setViewMode('claude')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      viewMode === 'claude'
                        ? 'border-sky-400 bg-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                        : 'border-white/10 hover:border-sky-400/40 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">👾</span>
                      <strong className="text-white text-sm">Claude Classic Pixel Office</strong>
                    </div>
                    <p className="text-xs text-slate-300 mb-3">
                      Tampilan 2D pixel art retro bernostalgia dengan denah ruang kerja minimalis yang ringan dan cepat.
                    </p>
                    <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                      <span>Status: {viewMode === 'claude' ? '✓ Aktif' : 'Pilih'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Pengaturan Grafik 3D
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Selalu Tampilkan Label Agen</strong>
                    <span className="text-xs text-slate-400">
                      Menampilkan nama agen di atas kepala secara permanen tanpa harus mengarahkan kursor.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={alwaysShowLabels}
                      onChange={(e) => {
                        setAlwaysShowLabels(e.target.checked);
                        localStorage.setItem('aos.sims.alwaysShowLabels', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Bayangan Tiga Dimensi (Shadows)</strong>
                    <span className="text-xs text-slate-400">
                      Kalkulasi bayangan realistis karakter dan furnitur di lantai kantor.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={shadowsEnabled}
                      onChange={(e) => {
                        setShadowsEnabled(e.target.checked);
                        localStorage.setItem('aos.sims.shadows', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Mode Performa Tinggi (60 FPS)</strong>
                    <span className="text-xs text-slate-400">
                      Matikan untuk menghemat baterai laptop (mode hemat daya 30 FPS).
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={highFpsMode}
                      onChange={(e) => {
                        setHighFpsMode(e.target.checked);
                        localStorage.setItem('aos.sims.highFps', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            </>
          )}

          {/* TAB 4: AGEN & AI */}
          {activeTab === 'agents' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Daftar Agen Hermes ({PROFILES.length} Personel)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {PROFILES.map((p) => {
                    const meta = getProfileMeta(p);
                    return (
                      <div
                        key={p}
                        className="p-3 bg-slate-900/60 border border-white/10 rounded-xl flex items-start gap-2.5"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full inline-block mt-0.5 shrink-0 shadow-[0_0_8px]"
                          style={{
                            backgroundColor: meta?.plumbobColor ?? '#38bdf8',
                            boxShadow: `0 0 8px ${meta?.plumbobColor ?? '#38bdf8'}`,
                          }}
                        />
                        <div className="min-w-0">
                          <strong className="text-xs text-white capitalize block font-bold">
                            {p}
                          </strong>
                          <span className="text-[11px] text-sky-300 block">
                            {meta?.title ?? 'Agent'}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1 line-clamp-2">
                            {meta?.role ?? '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Konfigurasi 9Router & Proxy AI
                </h3>
                <div className="text-xs space-y-2 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Endpoint 9Router:</span>
                    <code className="text-sky-300 font-mono">http://127.0.0.1:20128/v1</code>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Model Default:</span>
                    <span className="text-white font-mono">claude-3-5-sonnet-20241022</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Protokol Komunikasi:</span>
                    <span className="text-emerald-300 font-semibold">WebSocket Relay + SSE</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 5: KEAMANAN */}
          {activeTab === 'security' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Status Token & Autentikasi Sistem
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block">AOS_UI_TOKEN</strong>
                      <span className="text-slate-400 text-[11px]">
                        Cookie autentikasi untuk antarmuka web The Sims Office
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Terpasang & Aktif
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block">AOS_BRIDGE_TOKEN</strong>
                      <span className="text-slate-400 text-[11px]">
                        Token pengiriman event dari background Hermes ke Core
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Terproteksi
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block">AOS_SERVE_TOKEN</strong>
                      <span className="text-slate-400 text-[11px]">
                        Token relay interaktif WebSocket obrolan live
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Siap Relay
                    </span>
                  </div>
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Kebijakan Guardrail & Izin Operasi
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Operasi penulisan di luar folder workspace, eksekusi perintah terminal shell berisiko tinggi, dan modifikasi konfigurasi core selalu memerlukan konfirmasi manual melalui panel <strong>Approval</strong> sebelum dieksekusi oleh agen Hermes.
                </p>
              </div>
            </>
          )}

          {/* TAB 6: SISTEM & BACKUP */}
          {activeTab === 'system' && (
            <>
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Kesehatan Komponen (Health Probes)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {health.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 bg-slate-900/60 rounded-lg border border-white/5 flex items-center justify-between"
                    >
                      <div>
                        <strong className="text-xs text-white block">{h.label}</strong>
                        <span className="text-[10px] text-slate-400">{h.detail}</span>
                      </div>
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          h.status === 'ok'
                            ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                            : h.status === 'down'
                              ? 'bg-rose-400 shadow-[0_0_8px_#f43f5e]'
                              : 'bg-slate-500'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Cadangan Database & Pemeliharaan
                </h3>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm text-white block">Cadangkan Data (Backup Core DB)</strong>
                    <span className="text-xs text-slate-400">
                      Menyimpan snapshot basis data SQLite core, kartu Kanban, dan event log.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={backupLoading}
                    onClick={handleRunBackup}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow disabled:opacity-50 shrink-0"
                  >
                    {backupLoading ? '⏳ Sedang Mencadangkan…' : '💾 Buat Backup Sekarang'}
                  </button>
                </div>
                {backupResult && (
                  <div
                    className={`p-3 rounded-lg text-xs mt-1 border ${
                      backupResult.ok
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    {backupResult.msg}
                  </div>
                )}
              </div>

              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Cache & Informasi Runtime
                </h3>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    <div>Platform: <strong className="text-white">Windows (PowerShell)</strong></div>
                    <div>Zona Waktu: <strong className="text-white">Asia/Jakarta (WIB)</strong></div>
                    <div>Versi: <strong className="text-sky-300">Agentic OS v0.1.0</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 rounded-lg text-xs font-semibold cursor-pointer transition"
                  >
                    Hapus Cache Preferensi
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
