// GET /api/swx — 원천 데이터를 SwxState 하나로 반환한다(PRD 3, P1).
// 쿼리 ?lat=&lon=으로 기준 좌표를 바꿀 수 있다(한반도 범위만, 그 밖이면 대전).
import { buildSwxState, DEFAULT_COORDS } from './_lib/build.js';

const KOREA_BOX = { latMin: 33, latMax: 43.1, lonMin: 124, lonMax: 131 };

export function parseCoords(query = {}) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const inBox =
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= KOREA_BOX.latMin && lat <= KOREA_BOX.latMax &&
    lon >= KOREA_BOX.lonMin && lon <= KOREA_BOX.lonMax;
  return inBox ? { lat, lon } : DEFAULT_COORDS;
}

export default async function handler(req, res) {
  try {
    const state = await buildSwxState({ ...parseCoords(req.query), apiKey: process.env.KASI_API_KEY });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.status(200).json(state);
  } catch (e) {
    // 화면은 이 경우 fallback-latest.json으로 전환한다(PRD 3.5).
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
