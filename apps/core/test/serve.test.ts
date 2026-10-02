import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ServeChild, serveLaunch, superviseServe } from '../src/serve.js';

const SETTINGS = {
  hermesExe: 'hermes',
  hermesHome: 'D:\\agentic-os\\hermes-home',
  port: 9129,
  token: 'serve-secret',
  lockDir: 'D:\\agentic-os\\serve-locks',
  cwd: 'D:\\agentic-os\\hermes-home\\workspaces\\chat',
  parentPid: 4242,
};

describe('serveLaunch', () => {
  it('builds an isolated loopback serve with a private lock dir', () => {
    const l = serveLaunch(SETTINGS, {
      PATH: 'C:\\bin',
      HERMES_DESKTOP: '1',
      HERMES_KANBAN_TASK: 't_1',
      HERMES_GATEWAY_LOCK_DIR: 'C:\\shared',
      HERMES_HOME: 'C:\\owner-hermes',
      AOS_UI_TOKEN: 'ui',
      AOS_ROUTER_KEY: 'rk',
    });
    expect(l.exe).toBe('hermes');
    expect(l.args).toEqual(['serve', '--isolated', '--skip-build', '--host', '127.0.0.1', '--port', '9129']);
    expect(l.cwd).toBe(SETTINGS.cwd);
    expect(l.env).toMatchObject({
      PATH: 'C:\\bin',
      HERMES_HOME: SETTINGS.hermesHome,
      HERMES_DASHBOARD_SESSION_TOKEN: 'serve-secret',
      HERMES_GATEWAY_LOCK_DIR: SETTINGS.lockDir,
      HERMES_PARENT_PID: '4242',
    });
    for (const k of ['HERMES_DESKTOP', 'HERMES_KANBAN_TASK', 'AOS_UI_TOKEN', 'AOS_ROUTER_KEY']) expect(l.env[k]).toBeUndefined();
  });
});

class FakeChild implements ServeChild {
  pid = 100;
  killed = false;
  private onExit: ((code: number | null) => void) | null = null;
  kill() {
    this.killed = true;
    return true;
  }
  on(_event: 'exit', cb: (code: number | null) => void) {
    this.onExit = cb;
    return this;
  }
  exit(code: number) {
    this.onExit?.(code);
  }
}

describe('superviseServe', () => {
  afterEach(() => vi.useRealTimers());

  it('restarts serve with backoff and stops cleanly', () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const logs: string[] = [];
    const sup = superviseServe(serveLaunch(SETTINGS, {}), {
      spawn: () => {
        const c = new FakeChild();
        children.push(c);
        return c;
      },
      log: (m) => logs.push(m),
      now: () => Date.now(),
    });
    expect(children).toHaveLength(1);
    expect(sup.running()).toBe(true);
    children[0].exit(1);
    expect(sup.running()).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(children).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(children).toHaveLength(2);
    children[1].exit(1);
    vi.advanceTimersByTime(5000);
    expect(children).toHaveLength(3);
    sup.stop();
    expect(children[2].killed).toBe(true);
    children[2].exit(0);
    vi.advanceTimersByTime(120_000);
    expect(children).toHaveLength(3);
    expect(logs.some((l) => l.includes('exited'))).toBe(true);
    expect(logs.join('\n')).not.toContain('serve-secret');
  });

  it('resets the backoff after a long healthy run', () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    superviseServe(serveLaunch(SETTINGS, {}), {
      spawn: () => {
        const c = new FakeChild();
        children.push(c);
        return c;
      },
      log: () => {},
      now: () => Date.now(),
    });
    children[0].exit(1);
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(10 * 60_000);
    children[1].exit(1);
    vi.advanceTimersByTime(2000);
    expect(children).toHaveLength(3);
  });
});
