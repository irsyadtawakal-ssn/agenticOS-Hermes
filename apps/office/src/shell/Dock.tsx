import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { formatUsd, type Profile, TIERS } from './model.ts';
import { type DockTab, shell, useShell } from './store.ts';

const TABS: Array<[DockTab, string]> = [
  ['chat', 'Chat'],
  ['cards', 'Kartu'],
  ['activity', 'Aktivitas'],
  ['agent', 'Agent'],
];
const ACTIVE = new Set(['triage', 'todo', 'ready', 'running', 'blocked', 'review']);

export function Dock({ profile }: { profile: string }) {
  const tab = useShell((s) => s.dockTab);
  const tasks = useShell((s) => s.tasks);
  const activity = useShell((s) => s.activity);
  const agents = useShell((s) => s.agents);
  const costs = useShell((s) => s.costs);
  const agent = agents.find((a) => a.profile === profile);
  const mine = tasks.filter((t) => t.assignee === profile);
  const active = mine.filter((t) => ACTIVE.has(t.status));
  const history = mine.filter((t) => !ACTIVE.has(t.status)).slice(0, 10);
  const cost = costs?.byProfile.find((p) => p.profile === profile);
  const log = activity[profile] ?? [];

  return (
    <aside aria-label={`Dock ${profile}`} className="h-full flex flex-col text-sm">
      <header className="flex items-center justify-between p-12 border-b-2 border-border">
        <div>
          <div className="text-base">{profile}</div>
          <div className="text-text-muted">
            {TIERS[profile as Profile] ?? '-'} · {agent?.state ?? 'offline'}
            {agent?.detail ? ` · ${agent.detail}` : ''}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => shell.select(null)} aria-label="Tutup dock">
          ✕
        </Button>
      </header>
      <nav className="flex border-b-2 border-border" role="tablist" aria-label="Tab dock">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => shell.setTab(id)}
            className={`flex-1 py-6 cursor-pointer ${tab === id ? 'bg-active-bg' : 'hover:bg-btn-hover'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-12 flex flex-col gap-8" role="tabpanel">
        {tab === 'chat' && (
          <p className="text-text-muted">
            Chat langsung dengan agent hadir di M5b. Sementara pakai Telegram (chief) atau <code className="font-[inherit] text-text">hermes -p {profile} chat</code>.
          </p>
        )}
        {tab === 'cards' && (
          <>
            <strong>Aktif ({active.length})</strong>
            {active.length === 0 && <p className="text-text-muted">Tidak ada kartu aktif.</p>}
            {active.map((t) => (
              <div key={t.id} className="border-2 border-border p-6">
                <div>{t.title}</div>
                <div className="text-text-muted">
                  {t.id} · {t.status}
                </div>
              </div>
            ))}
            <strong className="mt-8">Riwayat</strong>
            {history.length === 0 && <p className="text-text-muted">Belum ada.</p>}
            {history.map((t) => (
              <div key={t.id} className="text-text-muted">
                {t.id} · {t.status} · {t.title}
              </div>
            ))}
          </>
        )}
        {tab === 'activity' && (
          <ol className="flex flex-col gap-4" aria-live="polite">
            {log.length === 0 && <li className="text-text-muted">Belum ada aktivitas.</li>}
            {log.map((a) => (
              <li key={a.id} className="flex justify-between gap-8">
                <span className="break-all">{a.text}</span>
                <span className={`shrink-0 ${a.status === 'blocked' || a.status === 'breaker' ? 'text-status-permission' : 'text-text-muted'}`}>
                  {a.status} · {new Date(a.ts).toLocaleTimeString('id-ID')}
                </span>
              </li>
            ))}
          </ol>
        )}
        {tab === 'agent' && (
          <dl className="grid grid-cols-2 gap-6">
            <dt className="text-text-muted">Tier</dt>
            <dd>{TIERS[profile as Profile] ?? '-'}</dd>
            <dt className="text-text-muted">State</dt>
            <dd>{agent?.state ?? 'offline'}</dd>
            <dt className="text-text-muted">Terakhir</dt>
            <dd>{agent?.detail ?? '-'}</dd>
            <dt className="text-text-muted">Biaya hari ini</dt>
            <dd>{cost ? formatUsd(cost.cost_usd) : 'tercatat sebagai shared'}</dd>
          </dl>
        )}
      </div>
    </aside>
  );
}
