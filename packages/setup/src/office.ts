import type { Exec } from './exec.js';

const base = (coreUrl: string) => coreUrl.replace(/\/+$/, '');

export function officeLoginUrl(coreUrl: string, token: string): string {
  return `${base(coreUrl)}/office/login?token=${encodeURIComponent(token)}`;
}

export function officePublicUrl(coreUrl: string): string {
  return `${base(coreUrl)}/office/`;
}

export async function openInBrowser(url: string, exec: Exec): Promise<void> {
  const r = await exec('cmd', ['/c', 'start', '""', url], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`could not open the browser (exit ${r.code})`);
}
