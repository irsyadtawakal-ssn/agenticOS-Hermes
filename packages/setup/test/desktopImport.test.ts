import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { desktopProfiles, importDesktop, importedEnv } from '../src/desktopImport.js';
import { applyProfiles } from '../src/apply.js';
import { loadRoster } from '../src/profiles.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aos-import-'));
  const source = join(root, 'desktop'); const target = join(root, 'aos'); const repo = join(root, 'repo');
  mkdirSync(join(source, 'profiles', 'maya', 'memories'), { recursive: true });
  mkdirSync(join(source, 'profiles', 'maya', 'skills', 'research'), { recursive: true });
  mkdirSync(join(repo, 'infra/profiles/soul'), { recursive: true });
  writeFileSync(join(repo, 'infra/profiles/roster.yaml'), 'profiles:\n  - {name: chief, tier: os-brain, gateway: true}\n');
  writeFileSync(join(repo, 'infra/profiles/soul/_common.md'), 'APPROVAL RULES');
  const agent = join(source, 'profiles/maya');
  writeFileSync(join(agent, 'config.yaml'), YAML.stringify({ model: { provider: 'custom', default: 'desktop-model' }, memory: { path: join(agent, 'memories') }, terminal: { backend: 'local' }, command_allowlist: ['.*'] }));
  writeFileSync(join(agent, 'SOUL.md'), 'MAYA PERSONA');
  writeFileSync(join(agent, '.env'), 'MODEL_KEY=secret\nTELEGRAM_BOT_TOKEN=bot\nHERMES_YOLO_MODE=1\nHERMES_CUSTOM_CUSTOM_API_KEY=router\n');
  writeFileSync(join(agent, 'memories/USER.md'), 'owner preferences');
  writeFileSync(join(agent, 'memories/USER.md.lock'), 'lock');
  writeFileSync(join(agent, 'skills/research/SKILL.md'), 'research skill');
  return { source, target, repo, agent };
}

describe('Desktop profile import', () => {
  it('imports local settings and memory, excludes delivery and preserves later edits on rerun', () => {
    const f = fixture();
    expect(desktopProfiles(f.source).map((p) => p.name)).toEqual(['maya']);
    importDesktop(f.source, f.target, f.repo);
    const p = join(f.target, 'profiles/maya');
    const c = YAML.parse(readFileSync(join(p, 'config.yaml'), 'utf8'));
    expect(c.model.default).toBe('desktop-model');
    expect(c.memory.path).toBe(join(p, 'memories'));
    expect(c.command_allowlist).toBeUndefined();
    expect(readFileSync(join(p, '.env'), 'utf8')).toBe('MODEL_KEY=secret\nHERMES_CUSTOM_CUSTOM_API_KEY=router\n');
    expect(existsSync(join(p, 'memories/USER.md.lock'))).toBe(false);
    expect(readFileSync(join(p, 'skills/research/SKILL.md'), 'utf8')).toBe('research skill');
    writeFileSync(join(p, 'SOUL.md'), 'updated persona');
    importDesktop(f.source, f.target, f.repo);
    expect(readFileSync(join(p, 'SOUL.md'), 'utf8')).toBe('updated persona');
    expect(readFileSync(join(f.agent, 'SOUL.md'), 'utf8')).toBe('MAYA PERSONA');
    expect(JSON.parse(readFileSync(join(f.repo, 'infra/profiles/office-roster.json'), 'utf8')).map((p: { name: string }) => p.name)).toEqual(['chief', 'maya']);
  });

  it('fails before copying when an existing agent name collides', () => {
    const f = fixture();
    writeFileSync(join(f.repo, 'infra/profiles/roster.yaml'), 'profiles:\n  - {name: maya, tier: os-brain, gateway: true}\n');
    expect(() => importDesktop(f.source, f.target, f.repo)).toThrow('conflict');
    expect(existsSync(f.target)).toBe(false);
  });

  it('reapplying profiles retains Desktop models and persona while enforcing sandbox and approvals', async () => {
    const f = fixture(); importDesktop(f.source, f.target, f.repo);
    writeFileSync(join(f.repo, 'infra/profiles/soul/chief.md'), 'CHIEF');
    await applyProfiles({ home: f.target, roster: loadRoster(readFileSync(join(f.repo, 'infra/profiles/roster.yaml'), 'utf8')), templatesDir: join(f.repo, 'infra/profiles/soul'), routerBaseUrl: 'http://127.0.0.1:20128/v1', routerKey: 'aos-key', timezone: 'Asia/Jakarta', stamp: 'test', exec: async () => ({ code: 0, stdout: '', stderr: '' }) });
    const p = join(f.target, 'profiles/maya');
    const c = YAML.parse(readFileSync(join(p, 'config.yaml'), 'utf8'));
    expect(c.model.default).toBe('desktop-model');
    expect(c.terminal.backend).toBe('docker');
    expect(c.approvals).toMatchObject({ mode: 'manual', unattended_mode: 'deny' });
    expect(readFileSync(join(p, 'SOUL.md'), 'utf8')).toContain('MAYA PERSONA');
    expect(readFileSync(join(p, '.env'), 'utf8')).toContain('HERMES_CUSTOM_CUSTOM_API_KEY=router');
    expect(readFileSync(join(p, '.env'), 'utf8')).not.toContain('OPENAI_API_KEY=aos-key');
  });

  it('filters process ownership and messaging credentials without discarding custom model credentials', () => {
    expect(importedEnv('AOS_UI_TOKEN=x\nHERMES_HOME=owner\nDISCORD_TOKEN=x\nOPENAI_API_KEY=keep\n')).toBe('OPENAI_API_KEY=keep\n');
    expect(importedEnv('TOOL_KEY="secret#value"\n')).toBe('TOOL_KEY="secret#value"\n');
  });
});
