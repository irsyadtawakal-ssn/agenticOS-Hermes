import type { CheckResult } from './check.js';

export const REQUIRED_COMBOS = ['os-brain', 'os-worker', 'os-private'] as const;

export async function checkRouter(baseUrl: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<CheckResult[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
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
      for (const combo of REQUIRED_COMBOS) {
        results.push({
          name: `combo:${combo}`,
          ok: ids.has(combo),
          detail: ids.has(combo) ? 'listed by /v1/models' : 'not listed - create it in 9Router dashboard -> Combos',
        });
      }
    }
  }
  try {
    const anon = await fetchFn(url);
    results.push({
      name: 'router-auth-required',
      ok: anon.status === 401 || anon.status === 403,
      detail: `anonymous GET -> ${anon.status} (expected 401/403; set REQUIRE_API_KEY=true)`,
    });
  } catch (err) {
    results.push({ name: 'router-auth-required', ok: false, detail: `anonymous GET failed: ${(err as Error).message}` });
  }
  return results;
}
