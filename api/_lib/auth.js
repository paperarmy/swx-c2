// /api/swx 열람 권한 확인(P1.5). 사용자 토큰으로 Supabase의 is_active()를 호출한다.
// 토큰 검증은 Supabase(PostgREST)가 하고, 승인 여부는 DB 함수가 판단한다.

export function supabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

export function bearerToken(header) {
  return /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1] ?? null;
}

// 반환: 'active'(승인) | 'inactive'(승인 대기·정지) | 'invalid'(토큰 무효·만료)
export async function checkAccess(token, cfg, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const res = await fetchImpl(`${cfg.url}/rest/v1/rpc/is_active`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401 || res.status === 403) return 'invalid';
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return (await res.json()) === true ? 'active' : 'inactive';
}
