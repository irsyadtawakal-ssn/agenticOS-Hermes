export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function formatResults(results: CheckResult[]): string {
  return results.map((r) => `${r.ok ? '[OK]  ' : '[FAIL]'} ${r.name} - ${r.detail}`).join('\n');
}
