// Vercel CLI 없이 /api/swx와 같은 SwxState를 만들어 출력한다(로컬 확인용).
// 사용: node scripts/dev-swx.mjs [lat lon] > out.json
import { buildSwxState, DEFAULT_COORDS } from '../api/_lib/build.js';
import { checkSwxState } from '../api/_lib/schema.js';

const [lat, lon] = process.argv.slice(2).map(Number);
const coords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : DEFAULT_COORDS;

const state = await buildSwxState({ ...coords, apiKey: process.env.KASI_API_KEY });
console.log(JSON.stringify(state, null, 2));

const errors = checkSwxState(state);
for (const s of state.sources) {
  console.error(`${s.ok ? 'OK  ' : 'FAIL'} ${s.id.padEnd(4)} ${s.error ?? s.note ?? ''}`);
}
console.error(errors.length ? `스키마 오류 ${errors.length}건:\n- ${errors.join('\n- ')}` : '스키마 검사 통과');
process.exitCode = errors.length ? 1 : 0;
