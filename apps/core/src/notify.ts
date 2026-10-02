import { existsSync, readFileSync } from 'node:fs';
import type { Approval } from './approvals.js';
import type { AosEvent } from './events.js';

export interface Notifier {
  send(text: string): Promise<boolean>;
}

export interface TelegramTarget {
  token: string;
  chatId: string;
}

export const nullNotifier: Notifier = { send: async () => false };

const ENV_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (match) out[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function telegramTargetFromEnv(text: string): TelegramTarget | null {
  const env = parseEnvText(text);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_HOME_CHANNEL?.trim() || (env.TELEGRAM_ALLOWED_USERS ?? '').split(',')[0]?.trim();
  return token && chatId ? { token, chatId } : null;
}

const defaultLog = (message: string) => console.error(`[aos-core] ${message}`);

export function createTelegramNotifier(target: TelegramTarget, fetchFn: typeof fetch = fetch, log: (message: string) => void = defaultLog): Notifier {
  return {
    async send(text) {
      try {
        const res = await fetchFn(`https://api.telegram.org/bot${target.token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: target.chatId, text, disable_web_page_preview: true }),
        });
        if (!res.ok) log(`telegram notify failed: HTTP ${res.status}`);
        return res.ok;
      } catch (err) {
        log(`telegram notify failed: ${(err as Error).message.split(target.token).join('[REDACTED]')}`);
        return false;
      }
    },
  };
}

export function createNotifierFromFile(path: string, fetchFn: typeof fetch = fetch, log: (message: string) => void = defaultLog): Notifier {
  if (!existsSync(path)) {
    log('telegram notifier disabled: chief .env not found');
    return nullNotifier;
  }
  const target = telegramTargetFromEnv(readFileSync(path, 'utf8'));
  if (!target) {
    log('telegram notifier disabled: TELEGRAM_BOT_TOKEN or chat id missing in chief .env');
    return nullNotifier;
  }
  return createTelegramNotifier(target, fetchFn, log);
}

export function formatApprovalRequest(a: Approval): string {
  return [
    `🔐 Izin diminta: ${a.id}`,
    `Agent: ${a.profile} · Kartu: ${a.task_id ?? '-'}`,
    `Aksi: ${a.tool} ${a.args_preview}`,
    `Aturan: ${a.rule_id}${a.reason ? ` (${a.reason})` : ''}`,
    `Balas ke chief: "setujui ${a.id}" atau "tolak ${a.id} <alasan>". Kedaluwarsa 24 jam.`,
  ].join('\n');
}

export function formatApprovalExpired(a: Approval): string {
  return `⌛ Izin ${a.id} (${a.profile} · ${a.tool}) kedaluwarsa tanpa keputusan. Kartu ${a.task_id ?? '-'} tetap terblokir.`;
}

export function formatTriage(a: Approval): string {
  return `⚠️ Kartu ${a.task_id} masuk triage setelah izin ${a.id} (blok berulang). Pindahkan manual bila ingin dilanjutkan.`;
}

export function formatBreaker(ev: AosEvent): string {
  const p = ev.payload as Record<string, unknown>;
  return `🛑 Circuit breaker: ${ev.profile} (kartu ${ev.task_id ?? '-'}) dihentikan — ${String(p.reason ?? '?')} (tool terakhir ${String(p.tool ?? '?')}).`;
}
