import { createHermesTransport } from '../../../../../src/hermes/transport.ts';
import { isBrowserRuntime } from '../runtime.js';
import { PostMessageTransport } from './postMessageTransport.js';
import type { MessageTransport } from './types.js';

// Agentic OS (NOTICE.md P2): the browser office talks to OS Core through HermesTransport.
function createTransport(): MessageTransport {
  return isBrowserRuntime ? createHermesTransport() : new PostMessageTransport();
}

/** Singleton transport instance. Import this everywhere instead of vscodeApi. */
export const transport: MessageTransport = createTransport();
export type { MessageTransport } from './types.js';
