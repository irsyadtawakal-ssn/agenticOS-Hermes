import officeRoster from '../../../../infra/profiles/office-roster.json';

function loadStoredProfiles(): Array<{ name: string; tier: string }> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('aos_custom_profiles');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return [];
}

const initialCustom = loadStoredProfiles();
export const PROFILES: string[] = [
  ...officeRoster.map((p) => p.name),
  ...initialCustom.map((p) => p.name).filter((name) => !officeRoster.some((o) => o.name === name)),
];

export const PROFILE_TIERS: Record<string, string> = {
  ...Object.fromEntries(officeRoster.map((p) => [p.name, p.tier])),
  ...Object.fromEntries(initialCustom.map((p) => [p.name, p.tier])),
};

export function addProfileToRegistry(profile: { name: string; tier: string }): void {
  if (!PROFILES.includes(profile.name)) {
    PROFILES.push(profile.name);
  }
  PROFILE_TIERS[profile.name] = profile.tier;
  try {
    if (typeof localStorage !== 'undefined') {
      const current = loadStoredProfiles().filter((p) => p.name !== profile.name);
      current.push(profile);
      localStorage.setItem('aos_custom_profiles', JSON.stringify(current));
    }
  } catch {}
}

export function agentIdFor(profile: string): number | null {
  const index = (PROFILES as readonly string[]).indexOf(profile);
  return index < 0 ? null : index + 1;
}

// Hermes tools that should animate as "reading" (mirrors os-bridge READ_TOOLS + browser navigation).
export const READING_TOOLS = [
  'web_search',
  'web_extract',
  'read_file',
  'search_files',
  'session_search',
  'vision_analyze',
  'skills_list',
  'skill_view',
  'kanban_show',
  'kanban_list',
  'kanban_attachments',
  'office_list_tasks',
  'office_list_approvals',
  'browser_navigate',
  'browser_snapshot',
  'browser_get_images',
  'browser_vision',
  'browser_console',
];

export const SUBAGENT_TOOLS = ['delegate_task'];

const FIELDS = ['path', 'file_path', 'command', 'query', 'goal', 'url'] as const;

function previewFields(preview: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof preview !== 'string') return out;
  try {
    const parsed = JSON.parse(preview) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const key of FIELDS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    }
  } catch {
    // args_preview is often truncated JSON; fall back to field-by-field extraction.
  }
  for (const key of FIELDS) {
    const match = new RegExp(`"${key}":\\s*"([^"]*)`).exec(preview);
    if (match) out[key] = match[1];
  }
  return out;
}

const short = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function activityLabel(tool: string, argsPreview: unknown): string {
  const f = previewFields(argsPreview);
  const join = (verb: string, value: string | undefined) => (value ? `${verb} ${short(value)}` : verb);
  switch (tool) {
    case 'read_file':
      return join('Membaca', f.path ?? f.file_path);
    case 'search_files':
      return 'Mencari file';
    case 'web_search':
      return join('Mencari web', f.query);
    case 'web_extract':
      return 'Membuka halaman web';
    case 'write_file':
    case 'patch':
      return join('Menulis', f.path ?? f.file_path);
    case 'terminal':
    case 'process_manage':
      return join('Menjalankan', f.command);
    case 'execute_code':
      return 'Menjalankan kode';
    case 'delegate_task':
      return `Subtask: ${f.goal ? short(f.goal) : 'delegasi'}`;
    default:
      if (tool.startsWith('browser_') || tool === 'computer_use') return 'Memakai browser';
      if (tool.startsWith('kanban_') || tool.startsWith('office_')) return `Kanban: ${tool}`;
      return tool;
  }
}
