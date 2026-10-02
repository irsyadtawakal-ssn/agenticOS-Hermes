import { describe, expect, it } from 'vitest';
import type { Approval } from '../src/approvals.js';
import {
  createTelegramNotifier,
  formatApprovalRequest,
  formatBreaker,
  parseEnvText,
  telegramTargetFromEnv,
} from '../src/notify.js';

const approval: Approval = {
  id: 'abc234', created_at: 1, profile: 'dev', task_id: 't_1', session_id: 's', tool_call_id: null, mode: 'park',
  rule_id: 'git-push', tool: 'terminal', args_preview: '{"command": "git push origin main"}', args_hash: 'a'.repeat(64),
  reason: 'git push / PR / publish paket', status: 'pending', decided_by: null, decided_at: null, instruction: null,
  token_expires_at: null, resumed_at: null,
};

describe('telegram target', () => {
  it('parses the chief .env and prefers the home channel', () => {
    expect(parseEnvText('# x\nA=1\nB="two"\n')).toEqual({ A: '1', B: 'two' });
    expect(telegramTargetFromEnv('TELEGRAM_BOT_TOKEN=123:abc\nTELEGRAM_HOME_CHANNEL=42\nTELEGRAM_ALLOWED_USERS=7,8\n')).toEqual({ token: '123:abc', chatId: '42' });
    expect(telegramTargetFromEnv('TELEGRAM_BOT_TOKEN=123:abc\nTELEGRAM_ALLOWED_USERS= 7 ,8\n')).toEqual({ token: '123:abc', chatId: '7' });
    expect(telegramTargetFromEnv('TELEGRAM_HOME_CHANNEL=42\n')).toBeNull();
  });
});

describe('createTelegramNotifier', () => {
  it('posts plain text to sendMessage', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await createTelegramNotifier({ token: '123:abc', chatId: '42' }, fetchFn).send('halo');
    expect(ok).toBe(true);
    expect(calls).toEqual([{ url: 'https://api.telegram.org/bot123:abc/sendMessage', body: { chat_id: '42', text: 'halo', disable_web_page_preview: true } }]);
  });

  it('returns false and never logs the token on failure', async () => {
    const logs: string[] = [];
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const rejected = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    const target = { token: '123:SECRETTOKEN', chatId: '42' };
    expect(await createTelegramNotifier(target, failing, (m) => logs.push(m)).send('x')).toBe(false);
    expect(await createTelegramNotifier(target, rejected, (m) => logs.push(m)).send('x')).toBe(false);
    expect(logs).toHaveLength(2);
    expect(logs.join(' ')).not.toContain('SECRETTOKEN');
  });
});

describe('formatters', () => {
  it('tells the owner how to approve or deny through chief', () => {
    const text = formatApprovalRequest(approval);
    for (const part of ['abc234', 'dev', 't_1', 'terminal', 'git push origin main', 'git-push', 'setujui abc234', 'tolak abc234']) {
      expect(text).toContain(part);
    }
  });

  it('describes a tripped breaker', () => {
    const text = formatBreaker({ id: 'e', ts: 1, type: 'breaker.tripped', profile: 'researcher', session_id: 's', task_id: 't_9', mode: 'kanban', payload: { tool: 'web_search', reason: 'same tool call repeated' } });
    expect(text).toContain('researcher');
    expect(text).toContain('t_9');
    expect(text).toContain('same tool call repeated');
  });
});
