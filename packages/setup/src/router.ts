import type { CheckResult } from './check.js';

export const REQUIRED_COMBOS = ['os-brain', 'os-worker', 'os-private'] as const;

export async function checkRouter(
  baseUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  requiredModels: readonly string[] = REQUIRED_COMBOS,
): Promise<CheckResult[]> {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/models`;
  let authed: Response;
  try {
    authed = await fetchFn(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch (err) {
    return [{ name: 'router-reachable', ok: false, detail: `${url}: ${(err as Error).message}` }];
  }
  const results: CheckResult[] = [{ name: 'router-reachable', ok: authed.ok, detail: `GET ${url} -> ${authed.status}` }];
  if (authed.ok) {
    let body: { data?: Array<{ id: string }> } | undefined;
    try {
      body = (await authed.json()) as { data?: Array<{ id: string }> };
    } catch {
      results.push({ name: 'router-models-json', ok: false, detail: `non-JSON response from ${url} - does AOS_ROUTER_URL end in /v1?` });
    }
    if (body) {
      const ids = new Set((body.data ?? []).map((m) => m.id));
      for (const combo of new Set(requiredModels)) {
        results.push({
          name: `combo:${combo}`,
          ok: ids.has(combo),
          detail: ids.has(combo) ? 'listed by /v1/models' : 'not listed - create it in 9Router dashboard -> Combos',
        });
      }
    }
  }
  try {
    const probeUrl = `${base}/chat/completions`;
    const anon = await fetchFn(probeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'aos-auth-probe', messages: [{ role: 'user', content: 'x' }], max_tokens: 1 }),
    });
    results.push({
      name: 'router-auth-required',
      ok: anon.status === 401 || anon.status === 403,
      detail: `anonymous POST /chat/completions -> ${anon.status} (expected 401/403; enable "Require API key" in 9Router)`,
    });
  } catch (err) {
    results.push({ name: 'router-auth-required', ok: false, detail: `anonymous POST failed: ${(err as Error).message}` });
  }
  return results;
}
