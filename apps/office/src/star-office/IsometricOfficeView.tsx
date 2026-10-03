import { useEffect, useRef, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { shell, useShell } from '../shell/store.ts';
import { crewStatus, STATUS_LABELS } from '../starship/model.ts';
import { mountIsometric, NATIVE_SKINS } from './IsometricScene.ts';
import './isometric.css';

const KEY = 'aos.isometric.native-skins.v1';
function loadSkins(): Record<string, number> {
  let saved: Record<string, unknown> = {};
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? '{}'); if (value && typeof value === 'object') saved = value; } catch { /* defaults */ }
  return Object.fromEntries(PROFILES.map((p, i) => [p, Number.isInteger(saved[p]) && Number(saved[p]) >= 0 && Number(saved[p]) < 6 ? Number(saved[p]) : i % 6]));
}

export function IsometricOfficeView({ onNative }: { onNative: () => void }) {
  const agents = useShell(s => s.agents), approvals = useShell(s => s.approvals);
  const [pilot, setPilot] = useState('chief');
  const [skins, setSkins] = useState(loadSkins);
  const [error, setError] = useState<string | null>(null);
  const [motion, setMotion] = useState({ profile: 'chief', moving: false });
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Awaited<ReturnType<typeof mountIsometric>> | null>(null);
  const openChat = (profile: string) => { shell.select(profile); shell.setTab('chat'); };
  useEffect(() => {
    let disposed = false;
    void mountIsometric(host.current!, { ...skins }, setPilot, openChat, (profile, moving) => setMotion({ profile, moving })).then(instance => {
      if (disposed) instance.destroy(); else scene.current = instance;
    }).catch(e => { if (!disposed) setError((e as Error).message); });
    return () => { disposed = true; scene.current?.destroy(); scene.current = null; };
  }, []);
  const choose = (profile: string) => { setPilot(profile); scene.current?.select(profile); };
  const changeSkin = (index: number) => {
    const next = { ...skins, [pilot]: index };
    setSkins(next); scene.current?.skin(pilot, index);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { shell.showToast('Karakter berubah, tetapi browser tidak dapat menyimpan pilihan.'); }
  };
  const online = PROFILES.filter(p => crewStatus(p, agents, approvals) !== 'offline').length;
  return <section className="iso-office" aria-label="Isometric Star Office 2.5D">
    <header className="iso-header">
      <div className="iso-mark">✦</div>
      <div><span>AGENTIC OS / ISOMETRIC DECK</span><h1>ODYSSEY <b>2.5D</b></h1></div>
      <div className="iso-live"><i /> {online} / {PROFILES.length} ONLINE</div>
      <button onClick={onNative}>Star Office asli ↗</button>
    </header>
    <div className="iso-body">
      <aside className="iso-crew" aria-label="Pilih agent untuk berjalan">
        <div className="iso-rail-title">CREW MANIFEST <span>10</span></div>
        <p>Pilih agent, lalu klik lantai.</p>
        <div className="iso-crew-list">{PROFILES.map(profile => {
          const status = crewStatus(profile, agents, approvals);
          return <div className={'iso-crew-row ' + (pilot === profile ? 'selected' : '')} key={profile}>
            <button className="iso-choose" aria-label={`Pilih ${profile} untuk berjalan`} aria-pressed={pilot === profile} onClick={() => choose(profile)}>
              <span className="iso-avatar" style={{ backgroundImage: `url(${NATIVE_SKINS[skins[profile]]})` }} />
              <span><strong>{profile}</strong><small className={'iso-status-' + status}>{STATUS_LABELS[status]}</small></span>
            </button>
            <button className="iso-chat" aria-label={`Chat dengan ${profile}`} onClick={() => openChat(profile)}>↗</button>
          </div>;
        })}</div>
        <div className="iso-skins"><label htmlFor="iso-skin">Karakter {pilot}</label>
          <select id="iso-skin" value={skins[pilot]} onChange={e => changeSkin(Number(e.target.value))}>
            {NATIVE_SKINS.map((_, i) => <option value={i} key={i}>Star Office {i + 1}</option>)}
          </select>
          <small>Gerakan hanya visual. Status tetap dari Hermes.</small>
        </div>
      </aside>
      <main className="iso-stage">
        <div className="iso-stage-title"><span>DECK 01 / LIVE CREW</span><h2>A little world for your agents.</h2><p>Isometric floor · Raised furniture · Native Star Office characters</p></div>
        <div ref={host} className="iso-canvas" aria-label="Peta isometrik: klik karakter untuk pilih; klik lantai untuk berjalan; klik ganda karakter untuk chat" />
        {error && <div role="alert" className="iso-error">{error}<button onClick={onNative}>Buka Star Office asli</button></div>}
        <div className="iso-tools"><span>SELECTED / <b>{pilot}</b><small role="status">{motion.profile === pilot && motion.moving ? `${pilot} berjalan…` : 'Klik lantai untuk berjalan'}</small></span><div>
          <button aria-label="Perkecil deck" onClick={() => scene.current?.zoomBy(-0.15)}>−</button>
          <button aria-label="Reset kamera isometrik" onClick={() => scene.current?.reset()}>FIT</button>
          <button aria-label="Perbesar deck" onClick={() => scene.current?.zoomBy(0.15)}>+</button>
        </div></div>
      </main>
    </div>
    <footer className="iso-footer"><span>CLICK FLOOR TO WALK · DOUBLE CLICK CREW TO CHAT · SCROLL TO ZOOM</span><button onClick={() => shell.toggleDrawer()}>MISSIONS ↗</button></footer>
  </section>;
}
