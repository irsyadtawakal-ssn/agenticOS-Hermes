import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { shell, useShell } from '../shell/store.ts';
import { defaultAppearance, crewStatus, HAIRS, normalizeAppearance, ROOMS, SKINS, stationFor, STATUS_COLORS, STATUS_LABELS, UNIFORMS } from './model.ts';
import type { Appearance } from './model.ts';
import { mountScene } from './StarOfficeScene.ts';
import { crewSheet } from './crewArt.ts';
import { officeTransport } from '../hermes/transport.ts';
import './starship.css';

const SAVE_KEY = 'aos.starship.crew.v1';
function loadAppearances(): Record<string, Appearance> {
  let saved: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>; } catch { /* use defaults */ }
  return Object.fromEntries(PROFILES.map((p, i) => [p, normalizeAppearance(saved[p], i)]));
}
const color = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
export function StarshipView({ onOffice }: { onOffice: () => void }) {
  const agents = useShell(s => s.agents), approvals = useShell(s => s.approvals), tasks = useShell(s => s.tasks), selected = useShell(s => s.selected);
  const [appearances, setAppearances] = useState(loadAppearances);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Appearance>(defaultAppearance(0));
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [connection, setConnection] = useState(officeTransport?.state ?? 'disconnected');
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Awaited<ReturnType<typeof mountScene>> | null>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const avatarPreview = useRef<HTMLCanvasElement>(null);
  const select = (profile: string) => { shell.select(profile); shell.setTab('chat'); };
  useEffect(() => {
    let disposed = false;
    setError(null);
    void mountScene(host.current!, appearances, select).then(instance => {
      if (disposed) instance.destroy(); else scene.current = instance;
    }).catch(e => { if (!disposed) setError(`Peta kapal tidak dapat dibuka: ${(e as Error).message}`); });
    return () => { disposed = true; scene.current?.destroy(); scene.current = null; };
  }, [appearances]);
  useEffect(() => { if (editing) editor.current?.showModal(); }, [editing]);
  useEffect(() => {
    const ctx = avatarPreview.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 64, 96);
    ctx.drawImage(crewSheet(draft), 0, 24, 16, 24, 0, 0, 64, 96);
  }, [draft]);
  useEffect(() => officeTransport?.onStateChange(setConnection), []);
  const closeEditor = () => { editor.current?.close(); setEditing(null); opener.current?.focus(); };
  const save = () => {
    if (!editing) return;
    const updated = { ...appearances, [editing]: draft };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(updated)); setAppearances(updated); closeEditor(); }
    catch { shell.showToast('Pengaturan karakter tidak dapat disimpan di browser ini.'); }
  };
  const active = PROFILES.filter(p => ['working', 'thinking'].includes(crewStatus(p, agents, approvals))).length;
  const ready = tasks.filter(t => ['ready', 'running', 'review'].includes(t.status));
  const stations = ROOMS.filter(r => r.id !== 'lounge');
  return (
    <section className="starship" aria-label="Star Office UI Starship">
      <header className="ship-header">
        <div className="ship-emblem" aria-hidden="true">✦</div>
        <div className="ship-title"><span>AGENTIC OS / STAR OFFICE UI</span><h1>AOS <strong>ODYSSEY</strong><small>PHASER</small></h1></div>
        <div className="ship-live"><i style={{ background: connection === 'connected' ? '#6de5ad' : '#ffbb72' }} /> CORE {connection.toUpperCase()} <span>{active} ACTIVE / {PROFILES.length} CREW</span></div>
        <button className="ship-button" onClick={onOffice}>Pixel Office ↗</button>
      </header>
      <div className="ship-body">
        <aside className="crew-rail" aria-label="Kru kapal">
          <div className="rail-heading"><span>CREW MANIFEST</span><b>{String(PROFILES.length).padStart(2, '0')}</b></div>
          <input className="crew-search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Cari kru…" aria-label="Cari kru" />
          <div className="crew-list">
            {PROFILES.filter(p => p.toLowerCase().includes(filter.toLowerCase())).map(p => {
              const status = crewStatus(p, agents, approvals), appearance = appearances[p];
              const station = ROOMS.find(r => r.id === stationFor(p))!;
              return <div className={`crew-row ${selected === p ? 'is-selected' : ''}`} key={p}>
                <button className="crew-select" onClick={() => select(p)} aria-label={`Chat dengan ${p}`}>
                  <span className="crew-icon" style={{ '--uniform': appearance.uniform, '--skin': appearance.skin, '--hair': appearance.hair } as CSSProperties}><i className={appearance.hairstyle} /><b /></span>
                  <span className="crew-info"><strong>{p}</strong><small>{station.name}</small><em style={{ color: color(STATUS_COLORS[status]) }}>● {STATUS_LABELS[status]}</em></span>
                </button>
                <button className="crew-edit" aria-label={`Edit karakter ${p}`} title="Edit karakter" onClick={e => { opener.current = e.currentTarget; setDraft(appearance); setEditing(p); }}>✎</button>
              </div>;
            })}
          </div>
          <div className="rail-bottom"><span>YOUR AGENTS. YOUR SHIP.</span><p>Klik kru untuk chat.<br />Edit penampilan lewat ✎.</p></div>
        </aside>
        <main className="ship-viewport">
          <div className="space-stars" aria-hidden="true" /><div className="space-planet" aria-hidden="true" />
          <div className="viewport-title"><span>STAR OFFICE / LIVE DECK</span><h2>Welcome aboard Odyssey.</h2><p>Kru dan aktivitas dari Hermes · Phaser 3</p></div>
          <div className="deck-canvas" ref={host} aria-label="Peta starship interaktif; pilih kru melalui daftar di kiri" />
          {error && <div className="ship-error" role="alert">{error}<button onClick={onOffice}>Buka Pixel Office</button></div>}
          <div className="deck-toolbar"><span>DECK 01 <b>/</b> MAIN SHIP</span><div>
            <button aria-label="Perkecil peta" onClick={() => scene.current?.zoomBy(-0.15)}>−</button>
            <button aria-label="Reset tampilan peta" onClick={() => scene.current?.reset()}>FIT</button>
            <button aria-label="Perbesar peta" onClick={() => scene.current?.zoomBy(0.15)}>+</button>
          </div></div>
          <div className="deck-help">SCROLL TO ZOOM · RIGHT-DRAG TO PAN · CLICK CREW TO CHAT</div>
        </main>
      </div>
      <footer className="ship-footer">
        <div className="ship-stations">{stations.map(r => <span key={r.id}><i style={{ background: color(r.color) }} />{r.name.replace('COMMAND ', '')}</span>)}</div>
        <button onClick={() => shell.toggleDrawer()}>MISSIONS <b>{ready.length}</b> ↗</button>
      </footer>
      <dialog className="crew-dialog" ref={editor} onCancel={e => { e.preventDefault(); closeEditor(); }} aria-labelledby="crew-editor-title">
        <div className="editor-header"><div><span>CREW CUSTOMIZATION</span><h2 id="crew-editor-title">{editing}</h2></div><button aria-label="Tutup editor karakter" onClick={closeEditor}>×</button></div>
        <div className="editor-preview"><canvas ref={avatarPreview} width={64} height={96} aria-label="Preview karakter kru" /><span>ODYSSEY CREW / {draft.headset ? 'HEADSET ON' : 'HEADSET OFF'}</span></div>
        {([['uniform', 'Warna seragam', UNIFORMS], ['skin', 'Warna kulit', SKINS], ['hair', 'Warna rambut', HAIRS]] as const).map(([field, title, options]) => <fieldset key={field}><legend>{title}</legend><div className="swatches">{options.map(option => <button key={option} aria-label={`${title} ${option}`} aria-pressed={draft[field] === option} style={{ background: option }} onClick={() => setDraft({ ...draft, [field]: option })} />)}</div></fieldset>)}
        <label className="editor-label">Gaya rambut<select value={draft.hairstyle} onChange={e => setDraft({ ...draft, hairstyle: e.target.value as Appearance['hairstyle'] })}><option value="short">Pendek</option><option value="long">Panjang</option><option value="bald">Tanpa rambut</option></select></label>
        <label className="editor-check"><input type="checkbox" checked={draft.headset} onChange={e => setDraft({ ...draft, headset: e.target.checked })} /> Headset komunikasi</label>
        <p className="editor-note">Disimpan per agent di browser ini.</p>
        <div className="editor-actions"><button onClick={closeEditor}>Batal</button><button className="primary" onClick={save}>Simpan karakter</button></div>
      </dialog>
    </section>
  );
}
