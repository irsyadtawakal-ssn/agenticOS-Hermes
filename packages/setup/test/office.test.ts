import { describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { officeLoginUrl, officePublicUrl, openInBrowser } from '../src/office.js';

describe('office helpers', () => {
  it('builds the login and public URLs', () => {
    expect(officeLoginUrl('http://127.0.0.1:7400/', 'a b&c')).toBe('http://127.0.0.1:7400/office/login?token=a%20b%26c');
    expect(officePublicUrl('http://127.0.0.1:7400')).toBe('http://127.0.0.1:7400/office/');
  });

  it('opens the browser through cmd start with an empty window title', async () => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => (calls.push([cmd, ...args]), { code: 0, stdout: '', stderr: '' });
    await openInBrowser('http://x/office/login?token=t', exec);
    expect(calls).toEqual([['cmd', '/c', 'start', '""', 'http://x/office/login?token=t']]);
  });

  it('reports a failure to open the browser', async () => {
    const exec: Exec = async () => ({ code: 1, stdout: '', stderr: 'nope' });
    await expect(openInBrowser('http://x', exec)).rejects.toThrow(/could not open the browser/);
  });
});
