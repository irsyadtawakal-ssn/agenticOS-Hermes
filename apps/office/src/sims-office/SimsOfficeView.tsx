import { useEffect, useRef, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { shell, useShell } from '../shell/store.ts';
import { SimsScene } from './SimsScene.ts';
import type { WallDisplayMode } from './WallManager.ts';
import { simsAudio } from './SimsAudio.ts';
import { DECOR_CATALOG } from './DecorLayout.ts';
import type { DecorCatalogEntry } from './DecorLayout.ts';
import { SimsConsole } from './SimsConsole.tsx';
import { chat } from '../chat/store.ts';
import './sims.css';

interface SimsOfficeViewProps {
  onSwitchClassic?: () => void;
}

export function SimsOfficeView({ onSwitchClassic }: SimsOfficeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SimsScene | null>(null);

  const agents = useShell((s) => s.agents);
  const approvals = useShell((s) => s.approvals);
  const selected = useShell((s) => s.selected);

  const [wallMode, setWallMode] = useState<WallDisplayMode>('cutaway');
  const [isMuted, setIsMuted] = useState(() => simsAudio.isMuted());
  const [isMusicOn, setIsMusicOn] = useState(false);
  const [isBuildMode, setIsBuildMode] = useState(false);
  const [buildCategory, setBuildCategory] = useState<string>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [timeLabel, setTimeLabel] = useState('');
  const [simSpeed, setSimSpeed] = useState(1);

  const showLocalToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new SimsScene(containerRef.current, {
      onSelectAgent: (profile) => {
        shell.select(profile);
      },
      onOpenChat: (profile) => {
        shell.select(profile);
        shell.setTab('chat');
      },
      onOpenKanban: () => {
        shell.toggleDrawer();
      },
      onToast: (msg) => {
        showLocalToast(msg);
      },
      onBuildModeChange: (active) => {
        setIsBuildMode(active);
      },
    });

    sceneRef.current = scene;
    setWallMode(scene.getWallMode());
    setTimeLabel(scene.getTimeLabel());
    setIsMusicOn(scene.isMusicEnabled());
    const clockTimer = window.setInterval(() => setTimeLabel(scene.getTimeLabel()), 1000);

    return () => {
      window.clearInterval(clockTimer);
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  // Listen to Chat All Broadcasts
  useEffect(() => {
    return chat.onBroadcast((targets) => {
      simsAudio.playBroadcast();
      sceneRef.current?.broadcastThought('chat', targets);
      showLocalToast(`📢 Broadcast terkirim ke ${targets.length} agen!`);
    });
  }, []);

  // Sync Live Agent States
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateLiveStates(agents, approvals);
    }
  }, [agents, approvals]);

  // Sync Selected Agent Focus
  useEffect(() => {
    if (sceneRef.current && selected) {
      sceneRef.current.selectAgent(selected, false);
    }
  }, [selected]);

  const handleRotateLeft = () => sceneRef.current?.rotateLeft();
  const handleRotateRight = () => sceneRef.current?.rotateRight();
  const handleZoomIn = () => sceneRef.current?.zoomIn();
  const handleZoomOut = () => sceneRef.current?.zoomOut();
  const handleResetView = () => sceneRef.current?.resetView();

  const handleCycleWalls = () => {
    if (sceneRef.current) {
      const next = sceneRef.current.cycleWallMode();
      setWallMode(next);
      showLocalToast(`Mode Dinding: ${next.toUpperCase()}`);
    }
  };

  const TIME_MODE_LABELS: Record<string, string> = {
    live: 'Live (jam asli)',
    morning: 'Pagi',
    noon: 'Siang',
    evening: 'Sore',
    night: 'Malam',
  };

  const handleCycleTime = () => {
    if (!sceneRef.current) return;
    const next = sceneRef.current.cycleTimeMode();
    showLocalToast(`Waktu: ${TIME_MODE_LABELS[next]}`);
  };

  const handleToggleMute = () => {
    const next = simsAudio.toggleMute();
    setIsMuted(next);
    showLocalToast(next ? 'Audio: Muted' : 'Audio: Active');
  };

  const handleToggleMusic = () => {
    if (!sceneRef.current) return;
    const next = sceneRef.current.toggleMusic();
    setIsMusicOn(next);
    showLocalToast(next ? '🎵 Musik Sims: Aktif' : '🎵 Musik Sims: Mati');
  };

  const handleToggleBuildMode = () => {
    if (!sceneRef.current) return;
    const next = !isBuildMode;
    sceneRef.current.setBuildMode(next);
    setIsBuildMode(next);
    showLocalToast(next ? '🛠 Mode Build/Buy Aktif' : 'Mode Live Aktif');
  };

  const handleSelectAgent = (profile: string) => {
    shell.select(profile);
    sceneRef.current?.selectAgent(profile, true);
  };

  const handleOpenChat = (profile: string) => {
    shell.select(profile);
    shell.setTab('chat');
  };

  const handleOpenKanban = () => {
    shell.toggleDrawer();
  };

  const handleSetSpeed = (speed: number) => {
    setSimSpeed(speed);
    sceneRef.current?.setSpeed(speed);
    showLocalToast(
      speed === 0
        ? 'Simulasi: Dijeda (⏸)'
        : speed === 1
        ? 'Kecepatan: Normal 1x (▶)'
        : speed === 2
        ? 'Kecepatan: Cepat 2x (⏩)'
        : 'Kecepatan: Ultra 3x (⏭)'
    );
  };

  const onlineCount = PROFILES.filter((p) => {
    const raw = agents.find((a) => a.profile === p)?.state;
    return raw && raw !== 'offline';
  }).length;

  return (
    <div className="sims-container">
      {/* 3D WebGL Canvas Viewport */}
      <div ref={containerRef} className="sims-viewport" tabIndex={0} />

      {/* Header Info Banner */}
      <header className="sims-header">
        <div className="sims-logo">
          <span className="sims-plumbob-icon">💎</span>
          <span>THE SIMS 2 OFFICE</span>
        </div>
        <div className="sims-status-badge">
          <span className="sims-status-dot" />
          <span>{onlineCount} / {PROFILES.length} ONLINE</span>
        </div>
      </header>

      {/* Floating Camera Navigation Toolbar */}
      <div className="sims-toolbar" aria-label="Kontrol Kamera 3D">
        <button
          className="sims-btn"
          onClick={handleRotateLeft}
          title="Putar Kamera Kiri 90° (Q)"
          aria-label="Rotate Left"
        >
          ⟲ Q
        </button>
        <button
          className="sims-btn"
          onClick={handleRotateRight}
          title="Putar Kamera Kanan 90° (E)"
          aria-label="Rotate Right"
        >
          E ⟳
        </button>
        <button
          className="sims-btn"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
        >
          +
        </button>
        <button
          className="sims-btn"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
        >
          -
        </button>
        <button
          className="sims-btn"
          onClick={handleResetView}
          title="Reset Sudut & Posisi Kamera"
          aria-label="Center Camera"
        >
          ⌖ Center
        </button>
        <button
          className="sims-btn sims-btn-highlight"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleDrawer();
          }}
          title="Buka / Tutup Papan Kanban (Shortcut: B)"
          aria-label="Toggle Kanban Board"
        >
          📋 Kanban (B)
        </button>
        <button
          className="sims-btn sims-btn-highlight"
          onClick={() => {
            simsAudio.playBubbleClick();
            if (!selected) shell.select('chief');
            shell.setTab('chat');
            setTimeout(() => {
              const el = document.querySelector('.sims-chat-textarea') as HTMLElement | null;
              el?.focus();
            }, 60);
          }}
          title="Buka Chatbox Agen (Shortcut: C)"
          aria-label="Open Chatbox"
        >
          💬 Chat (C)
        </button>
      </div>

      {/* Floating Build/Buy Catalog Panel */}
      {isBuildMode && (
        <div className="sims-build-panel">
          <div className="sims-build-header">
            <div className="sims-build-title">
              <span>🛠</span>
              <span>KATALOG BUILD / BUY (THE SIMS 2)</span>
            </div>
            <div className="sims-build-tabs">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'plants', label: '🌿 Tanaman' },
                { id: 'lighting', label: '💡 Lampu' },
                { id: 'seating', label: '🪑 Kursi' },
                { id: 'tables', label: '🪙 Meja' },
                { id: 'utility', label: '🚰 Utilitas' },
              ].map((t) => (
                <button
                  key={t.id}
                  className={`sims-build-tab ${buildCategory === t.id ? 'active' : ''}`}
                  onClick={() => setBuildCategory(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sims-build-items">
            {Object.values(DECOR_CATALOG)
              .filter((item: DecorCatalogEntry) => buildCategory === 'all' || item.category === buildCategory)
              .map((item: DecorCatalogEntry) => (
                <button
                  key={item.kind}
                  className="sims-build-card"
                  onClick={() => {
                    sceneRef.current?.getDecorManager().startPlacing(item.kind);
                    showLocalToast(`Klik lantai untuk letakkan ${item.name}`);
                  }}
                  title={`Beli ${item.name} (${item.width}m x ${item.depth}m)`}
                >
                  <span className="sims-build-card-icon">{item.icon}</span>
                  <span className="sims-build-card-name">{item.name}</span>
                  <span className="sims-build-card-size">{item.width}×{item.depth}m</span>
                </button>
              ))}
          </div>

          <div className="sims-build-footer">
            <span className="sims-build-hint">
              💡 Klik barang untuk geser · Klik lantai untuk letakkan · [R] Putar · [Del] Hapus
            </span>
            <div className="sims-build-actions">
              <button
                className="sims-build-act-btn"
                onClick={() => sceneRef.current?.getDecorManager().rotateCurrent()}
                title="Putar barang 90° (R)"
              >
                ⟳ Putar (R)
              </button>
              <button
                className="sims-build-act-btn"
                onClick={() => sceneRef.current?.getDecorManager().deleteCurrent()}
                title="Hapus barang terpilih (Delete)"
              >
                🗑 Hapus
              </button>
              <button
                className="sims-build-act-btn"
                onClick={() => {
                  sceneRef.current?.getDecorManager().resetToDefault();
                  showLocalToast('Layout furnitur direset ke default');
                }}
                title="Kembalikan tata letak kantor semula"
              >
                🔄 Reset
              </button>
              <button
                className="sims-build-act-btn"
                onClick={handleToggleBuildMode}
                title="Keluar dari mode Build/Buy"
              >
                ✓ Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The Sims 2 Aqua/Steel Gloss Console (Live Mode) */}
      <SimsConsole
        selectedProfile={selected ?? 'chief'}
        onSelectAgent={handleSelectAgent}
        onOpenChat={handleOpenChat}
        onOpenKanban={handleOpenKanban}
        simSpeed={simSpeed}
        onSetSpeed={handleSetSpeed}
        timeLabel={timeLabel}
        onCycleTime={handleCycleTime}
        wallMode={wallMode}
        onCycleWalls={handleCycleWalls}
        isBuildMode={isBuildMode}
        onToggleBuildMode={handleToggleBuildMode}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        isMusicOn={isMusicOn}
        onToggleMusic={handleToggleMusic}
        onSwitchClassic={onSwitchClassic}
      />

      {/* Local Toast Banner */}
      {toastMsg && <div className="sims-toast">{toastMsg}</div>}
    </div>
  );
}
