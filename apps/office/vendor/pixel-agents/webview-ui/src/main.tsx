import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Agentic OS (NOTICE P6): the office is wrapped by the dock/HUD shell.
import AosShell from '../../../../src/shell/AosShell.tsx';
import { isBrowserRuntime } from './runtime';

async function main() {
  // Agentic OS (NOTICE P3): decode office assets in every browser build;
  // HermesTransport delivers them to the office.
  if (isBrowserRuntime) {
    const { initBrowserMock } = await import('./browserMock.js');
    await initBrowserMock();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AosShell />
    </StrictMode>,
  );
}

main().catch(console.error);
