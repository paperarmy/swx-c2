// GET /api/swx — 원천 데이터를 SwxState 하나로 반환한다(PRD 3, P1).
// 승인된 로그인 사용자만 호출할 수 있다(P1.5). Authorization: Bearer <Supabase 액세스 토큰>
// 쿼리 ?lat=&lon=으로 기준 좌표를 바꿀 수 있다(한반도 범위만, 그 밖이면 대전).
import { buildSwxState, DEFAULT_COORDS } from './_lib/build.js';
import { supabaseConfig, bearerToken, checkAccess } from './_lib/auth.js';

const KOREA_BOX = { latMin: 33, latMax: 43.1, lonMin: 124, lonMax: 131 };

// 응답이 사용자별 인증을 거치므로 CDN 공용 캐시(s-maxage)는 쓰지 않는다.
// 대신 함수 인스턴스 메모리에 5분간 보관해 원천 호출을 줄인다.
const STATE_TTL_MS = 5 * 60 * 1000;
const stateCache = new Map();

export function parseCoords(query = {}) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const inBox =
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= KOREA_BOX.latMin && lat <= KOREA_BOX.latMax &&
    lon >= KOREA_BOX.lonMin && lon <= KOREA_BOX.lonMax;
  return inBox ? { lat, lon } : DEFAULT_COORDS;
}

async function cachedState(coords) {
  const key = `${coords.lat},${coords.lon}`;
  const hit = stateCache.get(key);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit.state;
  const state = await buildSwxState({ ...coords, apiKey: process.env.KASI_API_KEY });
  stateCache.set(key, { at: Date.now(), state });
  return state;
}

export function clearStateCache() {
  stateCache.clear();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  const cfg = supabaseConfig();
  if (!cfg) return res.status(503).json({ error: '인증 설정(SUPABASE_URL·SUPABASE_ANON_KEY)이 없습니다' });

  const token = bearerToken(req.headers?.authorization);
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다' });

  try {
    const access = await checkAccess(token, cfg);
    if (access === 'invalid') return res.status(401).json({ error: '로그인이 만료되었습니다' });
    if (access === 'inactive') return res.status(403).json({ error: '승인되지 않았거나 정지된 계정입니다' });
    return res.status(200).json(await cachedState(parseCoords(req.query)));
  } catch (e) {
    // 화면은 이 경우 fallback-latest.json으로 전환한다(PRD 3.5).
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
