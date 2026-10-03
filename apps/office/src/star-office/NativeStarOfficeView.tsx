import { useEffect, useRef, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { shell } from '../shell/store.ts';

const URL_NATIVE = 'http://127.0.0.1:19000';

export function NativeStarOfficeView({ onLegacy }: { onLegacy: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== URL_NATIVE || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === 'aos:star-office:ready') { setLoaded(true); return; }
      if (data?.type !== 'aos:star-office:chat' || !PROFILES.includes(data.profile)) return;
      shell.select(data.profile);
      shell.setTab('chat');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#111827' }}>
    <div style={{ padding: '8px 12px', display: 'flex', gap: 12, color: '#cbd5e1', fontSize: 12 }}>
      <span style={{ flex: 1 }}>STAR OFFICE UI · Native Phaser + Flask</span>
      <a href={URL_NATIVE} target="_blank" rel="noreferrer">Buka penuh</a>
      <button onClick={onLegacy}>Deck 2.5D</button>
    </div>
    {!loaded && <div role="status" style={{ padding: 12 }}>Memuat Star Office… Jalankan pnpm star-office:start jika service belum aktif.</div>}
    <iframe ref={frame} src={URL_NATIVE + '/'} title="Star Office UI"
      style={{ width: '100%', flex: 1, minHeight: 0, border: 0 }} />
  </div>;
}
