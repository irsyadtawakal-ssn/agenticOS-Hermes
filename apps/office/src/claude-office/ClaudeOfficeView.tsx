import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import Character from '../../vendor/claude-office/components/Character.tsx';
import FurnitureRenderer from '../../vendor/claude-office/components/FurnitureRenderer.tsx';
import { ROLE_TO_CHAR } from '../../vendor/claude-office/config.ts';
import { setTheme } from '../../vendor/claude-office/theme.ts';
import '../../vendor/claude-office/styles/office.css';
import '../../vendor/claude-office/styles/rooms.css';
import { shell, useShell } from '../shell/store.ts';
import { STATUS_LABELS } from '../starship/model.ts';
import { advance, clickDestination, createRoster, sendTo, SPRITES, transferRoom, ROOM } from './model.ts';
import { AREAS, WIDTH, HEIGHT, project } from './rooms.ts';
import type { RoomId } from '../../vendor/claude-office/rooms.ts';
import './office.css';

const SAVE = 'aos.claude-office.characters.v1';
function loadSkins(): Record<string, string> {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(SAVE) ?? '{}') ?? {}; } catch { /* defaults */ }
  const state = shell.getState();
  return Object.fromEntries(createRoster(state.agents, state.approvals, 0).map((a, i) => [a.id, SPRITES.includes(String(saved[a.id])) ? String(saved[a.id]) : SPRITES[i]]));
}
export function ClaudeOfficeView() {
  const [skins, setSkins] = useState(loadSkins);
  const [agents, setAgents] = useState(() => { const s = shell.getState(); return createRoster(s.agents, s.approvals, performance.now()); });
  const [pilot, setPilot] = useState('chief');
  const [night, setNight] = useState(false);
  const [scale, setScale] = useState(1);
  const [destination, setDestination] = useState<{ x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const liveStates = useShell(s => s.agents);
  const approvals = useShell(s => s.approvals);
  useEffect(() => { setTheme('default'); }, []);
  Object.assign(ROLE_TO_CHAR, skins);
  useEffect(() => {
    const fit = () => { const host = stage.current!; setScale(Math.min((host.clientWidth - 24) / WIDTH, (host.clientHeight - 30) / HEIGHT)); };
    const observer = new ResizeObserver(fit); observer.observe(stage.current!); fit();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let last = performance.now();
    let frame = 0;
    const tick = () => {
      const now = performance.now(), dt = now - last; last = now;
      const state = shell.getState();
      setAgents(previous => previous.map(a => advance(a, state.agents, state.approvals, now, dt, reduced.matches)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const chat = (profile: string) => { shell.select(profile); shell.setTab('chat'); };
  const changeSkin = (sprite: string) => {
    const next = { ...skins, [pilot]: sprite }; setSkins(next);
    try { localStorage.setItem(SAVE, JSON.stringify(next)); } catch { shell.showToast('Pilihan karakter belum dapat disimpan di browser ini.'); }
  };
  const walk = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.character-wrapper,.furniture-item,.co-area-label')) return;
    const bounds = room.current!.getBoundingClientRect();
    const target = clickDestination({ x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 });
    if (!target) { shell.showToast('Pilih lantai kantor yang terbuka.'); return; }
    setDestination(target); setAgents(previous => previous.map(a => a.id === pilot ? sendTo(a, target, performance.now() + 30000) : a));
  };
  const roster = useMemo(() => createRoster(liveStates, approvals, 0), [liveStates, approvals]);
  const selected = agents.find(a => a.id === pilot);
  const moving = selected?.pathQueue?.length;
  const go = (destination: RoomId) => { setDestination(null); setAgents(previous => previous.map(a => a.id === pilot ? transferRoom(a, destination, performance.now()) : a)); };

  return <section className="claude-office" aria-label="Claude Office W17ant">
    <header className="co-header"><div><span>AGENTIC OS · CLAUDE OFFICE</span><h1>Your agents, at work.</h1></div>
      <span className="co-source">W17ANT / PIXEL OFFICE</span><button onClick={() => setNight(!night)}>{night ? '☀ Day' : '☾ Night'}</button></header>
<div className="co-body"><main className="co-stage" ref={stage}>
      <div className="co-room-frame" style={{ width: WIDTH * scale, height: HEIGHT * scale }}>
        <div className="room-container co-room" ref={room} onClick={walk} style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}>
          <div className="room-background" style={{ backgroundImage: `url(${night ? ROOM.background.night : ROOM.background.day})` }} />
          <FurnitureRenderer items={ROOM.furniture} onItemClick={id => {
            if (id === 'kanban-board') { shell.toggleDrawer(); return; }
            const spot = ROOM.agentSpots.find(s => s.type === (id === 'coffee' ? 'coffee' : id === 'water-cooler' ? 'water' : 'none'));
            if (!spot) { shell.showToast('Pilih lantai untuk menggerakkan agent; aktivitas ini hanya visual.'); return; }
            setDestination(spot); setAgents(previous => previous.map(a => a.id === pilot ? sendTo(a, spot, performance.now() + 30000) : a));
          }} />
          {agents.map(agent => {
            const spot = ROOM.agentSpots.find(s => s.id === agent.assignedSpotId);
            const atDesk = Math.hypot(agent.position.x - agent.deskPosition.x, agent.position.y - agent.deskPosition.y) < 0.5;
            return <Character key={agent.id} agent={agent} zIndex={atDesk ? spot?.zIndex : undefined} onSelect={() => chat(agent.id)} />;
          })}
          {AREAS.map(a => { const point=project(a.u,a.v); return <button key={a.id} className="co-area-label" style={{left:point.x+'%',top:point.y+'%'}} onClick={event=>{event.stopPropagation();go(a.id);}} aria-label={`Arahkan ${pilot} ke ${a.name}`}>{a.name}</button>; })}
          {destination && !!moving && <div className="co-destination" style={{ left: destination.x + '%', top: destination.y + '%' }} />}
        </div>
      </div>
      <div className="co-walk-hint" role="status">{moving ? `${pilot} berjalan…` : `${pilot} · pilih lantai atau nama area untuk berjalan`}</div>
    </main><aside className="co-roster" aria-label="Agent roster"><div className="co-roster-title">TEAM <b>{roster.length}</b></div>
      <p>Status dari Core–Hermes</p><div className="co-agent-list">{roster.map(agent => <div className={'co-agent-row ' + (pilot === agent.id ? 'chosen' : '')} key={agent.id}>
        <button onClick={() => { setPilot(agent.id); setDestination(null); }} aria-label={`Pilih ${agent.name} untuk berjalan`} aria-pressed={pilot === agent.id}>
          <img src={`${import.meta.env.BASE_URL}claude-office/sprites/characters/${skins[agent.id]}-front-left.png`} alt="" />
          <span><strong>{agent.name}</strong><small className={'co-status-' + agent.coreStatus}>{STATUS_LABELS[agent.coreStatus]}</small><small>{AREAS.find(a => a.id === agents.find(a => a.id === agent.id)!.room)?.name}</small></span>
        </button><button className="co-chat" aria-label={`Chat dengan ${agent.name}`} onClick={() => chat(agent.id)}>↗</button>
      </div>)}</div><div className="co-customize"><label htmlFor="co-character">Karakter {pilot}</label><select id="co-character" value={skins[pilot]} onChange={e => changeSkin(e.target.value)}>{SPRITES.map(sprite => <option key={sprite}>{sprite}</option>)}</select><small>Gerak visual saja; tugas agent tetap dikelola Hermes.</small></div>
    </aside></div><footer className="co-footer"><span>Pilih agent → klik lantai · Klik karakter untuk chat</span><button onClick={() => shell.toggleDrawer()}>Mission board ↗</button></footer>
  </section>;
}
