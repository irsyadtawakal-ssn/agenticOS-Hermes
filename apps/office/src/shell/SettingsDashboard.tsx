import { useEffect, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { getProfileMeta } from '../sims-office/SimsMotives.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { formatUsd, sparkline, todayCost } from './model.ts';
import { triggerBackup } from './api.ts';
import { requestNotificationPermission, sendDesktopNotification } from './notifications.ts';
import { shell, useShell } from './store.ts';
import { AgentWizardModal } from './AgentWizardModal.tsx';
import './sims-shell.css';

export type HermesMenuKey =
  | 'model_main'
  | 'model_fallback'
  | 'model_auxiliary'
  | 'model_moa'
  | 'chat'
  | 'appearance'
  | 'workspace'
  | 'agents'
  | 'safety'
  | 'browser'
  | 'passwords'
  | 'memory'
  | 'voice'
  | 'advanced'
  | 'notifications'
  | 'billing'
  | 'providers'
  | 'gateways'
  | 'shortcuts'
  | 'tools'
  | 'sessions'
  | 'about';

export function SettingsDashboard() {
  const [selectedKey, setSelectedKey] = useState<HermesMenuKey>('model_main');
  const [modelGroupOpen, setModelGroupOpen] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeProfiles, setActiveProfiles] = useState<string[]>([...PROFILES]);

  // Model settings
  const [mainModel, setMainModel] = useState(() => localStorage.getItem('aos.settings.mainModel') || 'claude-3-5-sonnet-20241022');
  const [modelProvider, setModelProvider] = useState(() => localStorage.getItem('aos.settings.modelProvider') || '9router');
  const [temperature, setTemperature] = useState(() => Number(localStorage.getItem('aos.settings.temperature') || '0.7'));
  const [maxTokens, setMaxTokens] = useState(() => Number(localStorage.getItem('aos.settings.maxTokens') || '4096'));
  const [streamEnabled, setStreamEnabled] = useState(() => localStorage.getItem('aos.settings.stream') !== 'false');

  // Fallback models
  const [fallbackModel, setFallbackModel] = useState(() => localStorage.getItem('aos.settings.fallbackModel') || 'claude-3-5-haiku-20241022');
  const [maxRetries, setMaxRetries] = useState(() => Number(localStorage.getItem('aos.settings.maxRetries') || '3'));

  // Auxiliary models
  const [auxModel, setAuxModel] = useState(() => localStorage.getItem('aos.settings.auxModel') || 'gpt-4o-mini');

  // MoA settings
  const [moaEnabled, setMoaEnabled] = useState(() => localStorage.getItem('aos.settings.moaEnabled') === 'true');
  const [moaRounds, setMoaRounds] = useState(() => Number(localStorage.getItem('aos.settings.moaRounds') || '2'));

  // Chat settings
  const [chatSendKey, setChatSendKey] = useState(() => localStorage.getItem('aos.settings.chatSendKey') || 'enter');
  const [chatSoundOnSend, setChatSoundOnSend] = useState(() => localStorage.getItem('aos.settings.chatSound') !== 'false');

  // Appearance settings
  const viewMode = useShell((s) => s.viewMode);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(() => localStorage.getItem('aos.sims.alwaysShowLabels') === 'true');
  const [shadowsEnabled, setShadowsEnabled] = useState(() => localStorage.getItem('aos.sims.shadows') !== 'false');
  const [highFpsMode, setHighFpsMode] = useState(() => localStorage.getItem('aos.sims.highFps') !== 'false');

  // Workspace settings
  const [workspaceName, setWorkspaceName] = useState(() => localStorage.getItem('aos.settings.officeName') || 'Hermes Office');
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('aos.settings.operatorName') || 'Operator');

  // Safety settings
  const [confirmShellCommands, setConfirmShellCommands] = useState(() => localStorage.getItem('aos.settings.confirmShell') !== 'false');
  const [autoApproveSafe, setAutoApproveSafe] = useState(() => localStorage.getItem('aos.settings.autoApproveSafe') === 'true');

  // Voice & Audio settings
  const [isMuted, setIsMuted] = useState(() => simsAudio.isMuted());
  const [volume, setVolume] = useState(() => Math.round(simsAudio.getVolume() * 100));
  const [speechLang, setSpeechLang] = useState(() => localStorage.getItem('aos.settings.speechLang') || 'id-ID');

  // Notifications settings
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });
  const [notifyOnDone, setNotifyOnDone] = useState(() => localStorage.getItem('aos.settings.notifyDone') !== 'false');
  const [notifyOnApproval, setNotifyOnApproval] = useState(() => localStorage.getItem('aos.settings.notifyApproval') !== 'false');

  // Billing / Costs
  const costs = useShell((s) => s.costs);
  const daily = useShell((s) => s.daily);

  // System & Health
  const health = useShell((s) => s.health);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupResult, setBackupResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    const checkPerm = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
    };
    window.addEventListener('focus', checkPerm);
    return () => window.removeEventListener('focus', checkPerm);
  }, []);

  const handleSaveItem = (key: string, val: string) => {
    localStorage.setItem(key, val);
    showToast('Pengaturan tersimpan!');
    simsAudio.playBubbleClick();
    window.dispatchEvent(new Event('aos-settings-updated'));
  };

  const handleExportJson = () => {
    simsAudio.playBubbleClick();
    const configData: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('aos.')) {
        configData[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Pengaturan berhasil diekspor!');
  };

  const handleImportJson = () => {
    simsAudio.playBubbleClick();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Record<string, string>;
        for (const [k, v] of Object.entries(data)) {
          if (k.startsWith('aos.')) localStorage.setItem(k, v);
        }
        showToast('Pengaturan berhasil diimpor! Memuat ulang...');
        setTimeout(() => window.location.reload(), 1000);
      } catch {
        alert('File JSON pengaturan tidak valid');
      }
    };
    input.click();
  };

  const handleSyncReload = () => {
    simsAudio.playPlumbob();
    shell.refreshAll();
    showToast('Sinkronisasi konfigurasi dari Hermes Core berhasil!');
  };

  const handleRunBackup = async () => {
    simsAudio.playBubbleClick();
    setBackupLoading(true);
    setBackupResult(null);
    try {
      const res = await triggerBackup();
      setBackupResult({
        ok: true,
        msg: `Backup sukses: ${res.path ?? 'core.db'} (${res.bytes ? (res.bytes / 1024).toFixed(1) + ' KB' : 'tersimpan'})`,
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

  return (
    <div
      className="sims-settings-backdrop"
      onClick={() => shell.toggleSettings()}
      role="dialog"
      aria-modal="true"
      aria-label="Hermes Settings"
    >
      <div className="sims-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Left Sidebar (Hermes Structure) */}
        <aside className="hermes-settings-sidebar">
          <div className="hermes-sidebar-scroll">
            {/* Model Accordion */}
            <div>
              <button
                type="button"
                className={`hermes-nav-item ${
                  ['model_main', 'model_fallback', 'model_auxiliary', 'model_moa'].includes(selectedKey)
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  simsAudio.playClick();
                  setModelGroupOpen(!modelGroupOpen);
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">📦</span>
                  <span>Model</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {modelGroupOpen ? '⌄' : '›'}
                </span>
              </button>

              {modelGroupOpen && (
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    type="button"
                    className={`hermes-nav-subitem ${selectedKey === 'model_main' ? 'active' : ''}`}
                    onClick={() => {
                      simsAudio.playClick();
                      setSelectedKey('model_main');
                    }}
                  >
                    <span>⬡</span>
                    <span>Main model</span>
                  </button>

                  <button
                    type="button"
                    className={`hermes-nav-subitem ${selectedKey === 'model_fallback' ? 'active' : ''}`}
                    onClick={() => {
                      simsAudio.playClick();
                      setSelectedKey('model_fallback');
                    }}
                  >
                    <span>⬡</span>
                    <span>Fallback models</span>
                  </button>

                  <button
                    type="button"
                    className={`hermes-nav-subitem ${selectedKey === 'model_auxiliary' ? 'active' : ''}`}
                    onClick={() => {
                      simsAudio.playClick();
                      setSelectedKey('model_auxiliary');
                    }}
                  >
                    <span>⚙️</span>
                    <span>Auxiliary models</span>
                  </button>

                  <button
                    type="button"
                    className={`hermes-nav-subitem ${selectedKey === 'model_moa' ? 'active' : ''}`}
                    onClick={() => {
                      simsAudio.playClick();
                      setSelectedKey('model_moa');
                    }}
                  >
                    <span>👥</span>
                    <span>Mixture of Agents</span>
                  </button>
                </div>
              )}
            </div>

            {/* Standard Nav Items */}
            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'chat' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('chat');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">💬</span>
                <span>Chat</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'appearance' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('appearance');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🎨</span>
                <span>Appearance</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'workspace' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('workspace');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🖥️</span>
                <span>Workspace</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'agents' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('agents');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">👥</span>
                <span>Agents & Fleet</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                {activeProfiles.length}
              </span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'safety' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('safety');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🔒</span>
                <span>Safety</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'browser' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('browser');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🌐</span>
                <span>Browser</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'passwords' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('passwords');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🛡️</span>
                <span>Passwords & Logins</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'memory' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('memory');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🧠</span>
                <span>Memory & Context</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'voice' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('voice');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🎤</span>
                <span>Voice</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'advanced' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('advanced');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🔧</span>
                <span>Advanced</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'notifications' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('notifications');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🔔</span>
                <span>Notifications</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'billing' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('billing');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">📊</span>
                <span>Billing</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <div className="hermes-sidebar-divider" />

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'providers' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('providers');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">⚡</span>
                <span>Providers</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'gateways' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('gateways');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🌐</span>
                <span>Gateways</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'shortcuts' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('shortcuts');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">⌨️</span>
                <span>Keyboard Shortcuts</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'tools' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('tools');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🔑</span>
                <span>Tools & Keys</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'sessions' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('sessions');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">🗄️</span>
                <span>Sessions</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>

            <div className="hermes-sidebar-divider" />

            <button
              type="button"
              className={`hermes-nav-item ${selectedKey === 'about' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playClick();
                setSelectedKey('about');
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">ℹ️</span>
                <span>About</span>
              </div>
              <span className="text-[11px] text-slate-500">›</span>
            </button>
          </div>

          {/* Bottom Toolbar Icons (Export, Import, Refresh) */}
          <div className="hermes-sidebar-footer">
            <button
              type="button"
              onClick={handleExportJson}
              className="hermes-footer-btn"
              title="Export Settings (Download JSON)"
            >
              📥
            </button>
            <button
              type="button"
              onClick={handleImportJson}
              className="hermes-footer-btn"
              title="Import Settings (Upload JSON)"
            >
              📤
            </button>
            <button
              type="button"
              onClick={handleSyncReload}
              className="hermes-footer-btn"
              title="Sync & Reload Settings from Hermes Core"
            >
              🔄
            </button>
          </div>
        </aside>

        {/* Right Content Pane */}
        <main className="hermes-settings-main">
          {/* Header */}
          <header className="hermes-settings-header">
            <div>
              <h2 className="text-sm font-bold text-white capitalize flex items-center gap-2">
                <span>
                  {selectedKey === 'model_main'
                    ? '📦 Model · Main Model'
                    : selectedKey === 'model_fallback'
                      ? '📦 Model · Fallback Models'
                      : selectedKey === 'model_auxiliary'
                        ? '⚙️ Model · Auxiliary Models'
                        : selectedKey === 'model_moa'
                          ? '👥 Model · Mixture of Agents'
                          : selectedKey}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Konfigurasi parameter dan perilaku Hermes Agentic OS
              </p>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-white px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs font-semibold cursor-pointer transition"
              onClick={() => shell.toggleSettings()}
              title="Tutup (Esc)"
            >
              ✕ Tutup (Esc)
            </button>
          </header>

          {/* Toast Notification */}
          {toastMsg && (
            <div className="mx-6 mt-3 p-2 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-emerald-200 text-xs flex items-center justify-between">
              <span>✓ {toastMsg}</span>
            </div>
          )}

          {/* Body Content */}
          <div className="hermes-settings-body">
            {/* 1. MAIN MODEL */}
            {selectedKey === 'model_main' && (
              <>
                <div className="sims-settings-section-card">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    Primary Model Configuration
                  </h3>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Model Provider
                      </label>
                      <select
                        value={modelProvider}
                        onChange={(e) => {
                          setModelProvider(e.target.value);
                          handleSaveItem('aos.settings.modelProvider', e.target.value);
                        }}
                        className="sims-chat-session-select w-full h-8 text-xs"
                      >
                        <option value="9router">9Router (Local Proxy & Gateway)</option>
                        <option value="anthropic">Anthropic Claude API</option>
                        <option value="openai">OpenAI API</option>
                        <option value="ollama">Ollama Local LLM</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Model Identifier
                      </label>
                      <input
                        type="text"
                        value={mainModel}
                        onChange={(e) => setMainModel(e.target.value)}
                        onBlur={() => handleSaveItem('aos.settings.mainModel', mainModel)}
                        className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs font-mono"
                        placeholder="claude-3-5-sonnet-20241022"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-300">Temperature</label>
                        <span className="text-xs font-mono text-sky-300">{temperature.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={temperature}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setTemperature(v);
                          localStorage.setItem('aos.settings.temperature', String(v));
                        }}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Max Output Tokens
                        </label>
                        <input
                          type="number"
                          value={maxTokens}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMaxTokens(v);
                            localStorage.setItem('aos.settings.maxTokens', String(v));
                          }}
                          className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <span className="text-xs text-slate-300 font-semibold">Enable Streaming</span>
                        <label className="sims-toggle-switch">
                          <input
                            type="checkbox"
                            checked={streamEnabled}
                            onChange={(e) => {
                              setStreamEnabled(e.target.checked);
                              handleSaveItem('aos.settings.stream', String(e.target.checked));
                            }}
                          />
                          <span className="sims-toggle-slider" />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 2. FALLBACK MODELS */}
            {selectedKey === 'model_fallback' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Rate-limit & Failover Routing
                </h3>
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Secondary Fallback Model
                    </label>
                    <input
                      type="text"
                      value={fallbackModel}
                      onChange={(e) => setFallbackModel(e.target.value)}
                      onBlur={() => handleSaveItem('aos.settings.fallbackModel', fallbackModel)}
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs font-mono"
                      placeholder="claude-3-5-haiku-20241022"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Max Retry Attempts Before Failover
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={maxRetries}
                      onChange={(e) => {
                        setMaxRetries(Number(e.target.value));
                        handleSaveItem('aos.settings.maxRetries', e.target.value);
                      }}
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. AUXILIARY MODELS */}
            {selectedKey === 'model_auxiliary' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Auxiliary Task Model (Thought Bubbles & Summaries)
                </h3>
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fast / Auxiliary Model
                  </label>
                  <input
                    type="text"
                    value={auxModel}
                    onChange={(e) => setAuxModel(e.target.value)}
                    onBlur={() => handleSaveItem('aos.settings.auxModel', auxModel)}
                    className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs font-mono"
                    placeholder="gpt-4o-mini"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Digunakan untuk tugas ringan, pembuatan ringkasan kartu kanban, dan pesan status agen.
                  </span>
                </div>
              </div>
            )}

            {/* 4. MIXTURE OF AGENTS */}
            {selectedKey === 'model_moa' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Mixture of Agents (MoA) Architecture
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Enable Multi-Agent Synthesis</strong>
                    <span className="text-xs text-slate-400">
                      Meminta opini dari beberapa agen secara paralel lalu menggabungkannya via synthesizer.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={moaEnabled}
                      onChange={(e) => {
                        setMoaEnabled(e.target.checked);
                        handleSaveItem('aos.settings.moaEnabled', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                {moaEnabled && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Layer / Iteration Rounds
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={moaRounds}
                      onChange={(e) => {
                        setMoaRounds(Number(e.target.value));
                        handleSaveItem('aos.settings.moaRounds', e.target.value);
                      }}
                      className="sims-chat-textarea w-24 h-8 px-3 py-1 text-xs font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 5. CHAT */}
            {selectedKey === 'chat' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Chat Interaction & Formatting
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Tombol Kirim Pesan</strong>
                    <span className="text-xs text-slate-400">
                      Pilih tombol kirim untuk textarea obrolan.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChatSendKey('enter');
                        handleSaveItem('aos.settings.chatSendKey', 'enter');
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        chatSendKey === 'enter' ? 'bg-sky-500/25 border-sky-400 text-sky-200' : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      Enter (Biasa)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChatSendKey('ctrl');
                        handleSaveItem('aos.settings.chatSendKey', 'ctrl');
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                        chatSendKey === 'ctrl' ? 'bg-sky-500/25 border-sky-400 text-sky-200' : 'bg-slate-900 border-white/10 text-slate-400'
                      }`}
                    >
                      Ctrl + Enter
                    </button>
                  </div>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Sound on Send</strong>
                    <span className="text-xs text-slate-400">
                      Mainkan efek audio click saat pesan dikirimkan.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={chatSoundOnSend}
                      onChange={(e) => {
                        setChatSoundOnSend(e.target.checked);
                        handleSaveItem('aos.settings.chatSound', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* 6. APPEARANCE */}
            {selectedKey === 'appearance' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Visuals & Workspace Theme
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div
                    onClick={() => shell.setViewMode('sims')}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                      viewMode === 'sims' ? 'border-sky-400 bg-sky-500/20' : 'border-white/10 bg-slate-900'
                    }`}
                  >
                    <span className="font-bold block text-sm">🏡 The Sims 2 3D Office</span>
                    <span className="text-[11px] text-slate-400">Three.js 3D isometric view</span>
                  </div>
                  <div
                    onClick={() => shell.setViewMode('claude')}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                      viewMode === 'claude' ? 'border-sky-400 bg-sky-500/20' : 'border-white/10 bg-slate-900'
                    }`}
                  >
                    <span className="font-bold block text-sm">👾 Claude Classic Office</span>
                    <span className="text-[11px] text-slate-400">2D retro pixel view</span>
                  </div>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Always Show Agent Nametags</strong>
                    <span className="text-xs text-slate-400">Label nama permanen di atas kepala agen</span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={alwaysShowLabels}
                      onChange={(e) => {
                        setAlwaysShowLabels(e.target.checked);
                        handleSaveItem('aos.sims.alwaysShowLabels', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">3D Dynamic Shadows</strong>
                    <span className="text-xs text-slate-400">Render bayangan dinamis di lantai</span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={shadowsEnabled}
                      onChange={(e) => {
                        setShadowsEnabled(e.target.checked);
                        handleSaveItem('aos.sims.shadows', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* 7. WORKSPACE */}
            {selectedKey === 'workspace' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Workspace & Directory Configuration
                </h3>
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      onBlur={() => handleSaveItem('aos.settings.officeName', workspaceName)}
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Operator / Owner Name
                    </label>
                    <input
                      type="text"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      onBlur={() => handleSaveItem('aos.settings.operatorName', operatorName)}
                      className="sims-chat-textarea w-full h-8 px-3 py-1 text-xs"
                    />
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                    <div>
                      <strong className="text-xs text-white block">Armada Agent Terdaftar</strong>
                      <span className="text-[11px] text-slate-400">Total {activeProfiles.length} agent aktif di workspace ini.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        simsAudio.playClick();
                        setWizardOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>✨</span>
                      <span>Tambah Agent Baru</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 7b. AGENTS & FLEET */}
            {selectedKey === 'agents' && (
              <div className="space-y-4">
                <div className="sims-settings-section-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                        Armada Agent & Manajemen Roster
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Kelola seluruh agent AI yang aktif di Agentic OS, atur tier hak akses, dan kepribadian Sims 3D.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        simsAudio.playClick();
                        setWizardOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all flex items-center gap-2"
                    >
                      <span>✨</span>
                      <span>Tambah Agent Baru</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeProfiles.map((p) => {
                    const meta = getProfileMeta(p);
                    const tierBadgeClass =
                      meta.tier === 'os-brain'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        : meta.tier === 'os-worker'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30';

                    return (
                      <div
                        key={p}
                        className="p-4 rounded-xl bg-slate-900/80 border border-white/10 hover:border-sky-500/30 transition-all flex flex-col justify-between space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg border border-white/15 relative shrink-0 shadow-md"
                            style={{ backgroundColor: `${meta.customPlumbobColor || '#22c55e'}22` }}
                          >
                            <span>{meta.aspirationIcon || '👤'}</span>
                            <span
                              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-900 shadow-sm"
                              style={{ backgroundColor: meta.customPlumbobColor || '#22c55e' }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs capitalize truncate">{p}</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${tierBadgeClass}`}>
                                {meta.tier}
                              </span>
                            </div>
                            <div className="text-[11px] text-sky-300 truncate">{meta.title}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>{meta.zodiacIcon} {meta.zodiac}</span>
                              <span>•</span>
                              <span>{meta.aspirationLabel}</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2 italic">
                          "{meta.soulBio}"
                        </p>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                          <div className="flex gap-1 overflow-hidden">
                            {meta.traits.slice(0, 2).map((t) => (
                              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5">
                                #{t}
                              </span>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              simsAudio.playClick();
                              shell.select(p);
                              shell.toggleSettings();
                            }}
                            className="text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <span>Uji Chat</span>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 8. SAFETY */}
            {selectedKey === 'safety' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Execution Guardrails & Approvals
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Konfirmasi Perintah Terminal</strong>
                    <span className="text-xs text-slate-400">
                      Perintah terminal memerlukan approval manual sebelum dieksekusi oleh agen.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={confirmShellCommands}
                      onChange={(e) => {
                        setConfirmShellCommands(e.target.checked);
                        handleSaveItem('aos.settings.confirmShell', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Auto-allow Read-only Tools</strong>
                    <span className="text-xs text-slate-400">
                      Operasi baca file dan penelusuran diizinkan tanpa meminta izin manual.
                    </span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={autoApproveSafe}
                      onChange={(e) => {
                        setAutoApproveSafe(e.target.checked);
                        handleSaveItem('aos.settings.autoApproveSafe', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* 9. BROWSER */}
            {selectedKey === 'browser' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Web Browsing & Search Integration
                </h3>
                <div className="text-xs text-slate-300 space-y-2">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Browser Engine:</span>
                    <span className="font-mono text-sky-300">Headless Chromium via Playwright / Web Fetch</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Web Search Engine:</span>
                    <span className="font-mono text-emerald-300">Active (via Core Agent Tool)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Timeout per Request:</span>
                    <span className="font-mono text-slate-200">15000 ms</span>
                  </div>
                </div>
              </div>
            )}

            {/* 10. PASSWORDS & LOGINS */}
            {selectedKey === 'passwords' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Authentication & Core Tokens
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block font-mono">AOS_UI_TOKEN</strong>
                      <span className="text-[11px] text-slate-400">Cookie autentikasi web interface</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Validated
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block font-mono">AOS_BRIDGE_TOKEN</strong>
                      <span className="text-[11px] text-slate-400">Token pengiriman event background</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Connected
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-white/5">
                    <div>
                      <strong className="text-white block font-mono">AOS_SERVE_TOKEN</strong>
                      <span className="text-[11px] text-slate-400">WebSocket live relay token</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      ✓ Ready
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 11. MEMORY & CONTEXT */}
            {selectedKey === 'memory' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Agent Memory & Context Window
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Setiap profil agen memiliki memori persisten di <code>HERMES_HOME/profiles/[name]/memories</code> dan kepribadian inti yang diatur melalui berkas <code>SOUL.md</code>.
                </p>
                <div className="p-3 bg-slate-900/80 rounded-lg border border-white/5 text-xs font-mono space-y-1">
                  <div>Memori Aktif: <span className="text-sky-300">SQLite + Markdown Scratchpads</span></div>
                  <div>Roster Terpasang: <span className="text-emerald-300">{PROFILES.join(', ')}</span></div>
                </div>
              </div>
            )}

            {/* 12. VOICE */}
            {selectedKey === 'voice' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Audio Effects & Speech-to-Text
                </h3>
                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Master Suara & Efek</strong>
                    <span className="text-xs text-slate-400">Efek klik, putar kamera, dan notifikasi</span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={!isMuted}
                      onChange={() => {
                        const m = simsAudio.toggleMute();
                        setIsMuted(m);
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div className="flex-1 mr-4">
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-sm text-white">Tingkat Volume</strong>
                      <span className="text-xs font-mono text-sky-300 font-bold">{volume}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volume}
                      disabled={isMuted}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        simsAudio.setVolume(v / 100);
                      }}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                    />
                  </div>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Bahasa Dikte Suara (Mic)</strong>
                    <span className="text-xs text-slate-400">Model pengenalan suara browser</span>
                  </div>
                  <select
                    value={speechLang}
                    onChange={(e) => {
                      setSpeechLang(e.target.value);
                      handleSaveItem('aos.settings.speechLang', e.target.value);
                    }}
                    className="sims-chat-session-select text-xs h-8 px-2"
                  >
                    <option value="id-ID">🇮🇩 Bahasa Indonesia (id-ID)</option>
                    <option value="en-US">🇺🇸 English (en-US)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 13. ADVANCED */}
            {selectedKey === 'advanced' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  System Architecture & Runtime Ports
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">AOS Core Port:</span>
                    <span className="font-mono text-sky-300">7400</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Hermes Serve Relay Port:</span>
                    <span className="font-mono text-sky-300">9129</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">9Router AI Proxy Port:</span>
                    <span className="font-mono text-sky-300">20128</span>
                  </div>
                </div>
              </div>
            )}

            {/* 14. NOTIFICATIONS */}
            {selectedKey === 'notifications' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Desktop OS Notifications
                </h3>
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <strong className="text-sm text-white">Browser Permission:</strong>
                      <span className="text-xs font-bold text-sky-300 uppercase">{notifPermission}</span>
                    </div>
                    <span className="text-xs text-slate-400">Notifikasi muncul di desktop Windows</span>
                  </div>
                  {notifPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const g = await requestNotificationPermission();
                        if (typeof window !== 'undefined' && 'Notification' in window) setNotifPermission(Notification.permission);
                        if (g) showToast('Izin notifikasi diberikan!');
                      }}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
                    >
                      Minta Izin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sendDesktopNotification('🧪 Uji Notifikasi Hermes', { body: 'Notifikasi desktop berfungsi dengan baik!' });
                        showToast('Notifikasi tes terkirim!');
                      }}
                      className="px-3 py-1.5 bg-emerald-600/30 border border-emerald-400/40 text-emerald-200 rounded-lg text-xs font-semibold"
                    >
                      Kirim Tes Notifikasi
                    </button>
                  )}
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Tugas Selesai (Kanban Done)</strong>
                    <span className="text-xs text-slate-400">Notifikasi saat kartu kanban selesai</span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifyOnDone}
                      onChange={(e) => {
                        setNotifyOnDone(e.target.checked);
                        handleSaveItem('aos.settings.notifyDone', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>

                <div className="sims-settings-row">
                  <div>
                    <strong className="text-sm text-white block">Permintaan Izin Operasi (Approval)</strong>
                    <span className="text-xs text-slate-400">Notifikasi saat agen meminta izin eksekusi</span>
                  </div>
                  <label className="sims-toggle-switch">
                    <input
                      type="checkbox"
                      checked={notifyOnApproval}
                      onChange={(e) => {
                        setNotifyOnApproval(e.target.checked);
                        handleSaveItem('aos.settings.notifyApproval', String(e.target.checked));
                      }}
                    />
                    <span className="sims-toggle-slider" />
                  </label>
                </div>
              </div>
            )}

            {/* 15. BILLING */}
            {selectedKey === 'billing' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Usage & Cost Breakdown
                </h3>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">Biaya Hari Ini:</span>
                    <strong className="text-lg text-emerald-300 font-mono">
                      {formatUsd(todayCost(daily))}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Tren 7 Hari Terakhir:</span>
                    <span className="text-sky-300 text-sm font-mono tracking-widest">
                      {sparkline(daily.map((d) => d.cost_usd))}
                    </span>
                  </div>
                </div>

                {costs && costs.byProfile.length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-xs font-semibold text-slate-300 mb-1.5">Penggunaan per Agen:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {costs.byProfile.map((p) => (
                        <div key={p.profile} className="p-2 bg-slate-900/40 rounded border border-white/5 flex justify-between">
                          <span className="capitalize">{p.profile}</span>
                          <span className="font-mono text-emerald-400">{formatUsd(p.cost_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 16. PROVIDERS */}
            {selectedKey === 'providers' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Configured AI Providers
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-white/5 flex items-center justify-between">
                    <div>
                      <strong className="text-white block">9Router Local AI Proxy</strong>
                      <span className="text-[11px] text-slate-400 font-mono">http://127.0.0.1:20128/v1</span>
                    </div>
                    <span className="text-emerald-400 font-bold">● Active</span>
                  </div>
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-white/5 flex items-center justify-between">
                    <div>
                      <strong className="text-white block">Anthropic Claude</strong>
                      <span className="text-[11px] text-slate-400">Direct API Integration via env key</span>
                    </div>
                    <span className="text-sky-300 font-semibold">Configured</span>
                  </div>
                </div>
              </div>
            )}

            {/* 17. GATEWAYS */}
            {selectedKey === 'gateways' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  External Messaging Gateways
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between">
                    <span>📱 Telegram Bot</span>
                    <span className="text-slate-500 text-[11px]">Standby</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between">
                    <span>💬 WhatsApp Bridge</span>
                    <span className="text-slate-500 text-[11px]">Standby</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between">
                    <span>🎮 Discord Bot</span>
                    <span className="text-slate-500 text-[11px]">Standby</span>
                  </div>
                  <div className="p-2.5 bg-slate-900/50 rounded-lg border border-white/5 flex items-center justify-between">
                    <span>💼 Slack App</span>
                    <span className="text-slate-500 text-[11px]">Standby</span>
                  </div>
                </div>
              </div>
            )}

            {/* 18. KEYBOARD SHORTCUTS */}
            {selectedKey === 'shortcuts' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Available Keyboard Hotkeys
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Fokus Agen (1–6)</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">1 – 6</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Buka Chat All</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">Shift + C</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Buka Chat Agen</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">C / Ctrl + K</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Toggle Papan Kanban</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">B</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Toggle Approval Inbox</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">A</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Dashboard Pengaturan</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">S</kbd>
                  </div>
                  <div className="p-2 bg-slate-900/50 rounded flex justify-between items-center">
                    <span className="text-slate-300">Tutup Panel / Modal</span>
                    <kbd className="px-2 py-0.5 bg-slate-800 rounded border border-white/10 font-mono">Esc</kbd>
                  </div>
                </div>
              </div>
            )}

            {/* 19. TOOLS & KEYS */}
            {selectedKey === 'tools' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Registered Agent Tools & Capabilities
                </h3>
                <div className="space-y-1.5 text-xs">
                  {['terminal (CLI Execution)', 'read_file (File Reading)', 'write_file (File Creation)', 'web_search (Web Intelligence)', 'kanban_move (Task Board Automation)'].map((t) => (
                    <div key={t} className="p-2 bg-slate-900/50 rounded border border-white/5 flex items-center justify-between font-mono">
                      <span>{t}</span>
                      <span className="text-emerald-400 font-bold text-[10px]">REGISTERED</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 20. SESSIONS */}
            {selectedKey === 'sessions' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Chat Sessions & Persistence
                </h3>
                <p className="text-xs text-slate-300">
                  Riwayat percakapan disimpan secara lokal di basis data SQLite sesi Hermes. Sesi lama dapat dibuka kembali melalui pemilih sesi di panel obrolan.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Hapus seluruh sesi obrolan lokal?')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-500/20 border border-rose-400/30 text-rose-200 rounded-lg text-xs font-semibold"
                  >
                    Bersihkan Cache Sesi
                  </button>
                </div>
              </div>
            )}

            {/* 21. ABOUT */}
            {selectedKey === 'about' && (
              <div className="sims-settings-section-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Hermes Agentic OS
                </h3>
                <div className="text-xs text-slate-300 space-y-1.5">
                  <div>Versi: <strong className="text-sky-300">v0.1.0-alpha</strong></div>
                  <div>Engine: <strong className="text-white">Hermes AI Multi-Agent Operating System</strong></div>
                  <div>Roster: <strong className="text-white">Chief, Dev, UX, Sec, Doc, Ops (6 Personel)</strong></div>
                  <div>Zona Waktu: <strong className="text-white">Asia/Jakarta (WIB)</strong></div>
                </div>

                <div className="pt-3 border-t border-white/10">
                  <h4 className="text-xs font-semibold text-slate-300 mb-2">Cadangan Database Core</h4>
                  <button
                    type="button"
                    disabled={backupLoading}
                    onClick={handleRunBackup}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow disabled:opacity-50"
                  >
                    {backupLoading ? '⏳ Sedang Mencadangkan…' : '💾 Buat Backup Database Sekarang'}
                  </button>
                  {backupResult && (
                    <div className={`mt-2 p-2.5 rounded text-xs border ${backupResult.ok ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200' : 'bg-rose-950/40 border-rose-500/30 text-rose-200'}`}>
                      {backupResult.msg}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <AgentWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onAgentCreated={(_newProfile) => {
          setActiveProfiles([...PROFILES]);
        }}
      />
    </div>
  );
}
