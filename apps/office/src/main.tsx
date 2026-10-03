import '../vendor/pixel-agents/webview-ui/src/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AosShell from './shell/AosShell.tsx';
import { createHermesTransport } from './hermes/transport.ts';

// Fresh entrypoint; the scene does not mount the old Pixel/Phaser applications.
createHermesTransport();
createRoot(document.getElementById('root')!).render(<StrictMode><AosShell /></StrictMode>);
