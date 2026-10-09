// 정상 SwxState를 data/fallback-latest.json으로 저장한다(PRD 3.5). 발표 전날 밤·당일 아침 실행 후 커밋.
// 사용: node scripts/make-fallback.mjs                         → 로컬에서 직접 수집
//       node scripts/make-fallback.mjs https://<배포주소>/api/swx  → 배포된 API 응답 저장
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSwxState } from '../api/_lib/build.js';
import { checkSwxState } from '../api/_lib/schema.js';

// 이 원천이 실패한 상태는 fallback으로 남기지 않는다(현재 등급이 비게 됨).
const REQUIRED = ['D1'];

const url = process.argv[2];
const state = url
  ? await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()
  : await buildSwxState({ apiKey: process.env.KASI_API_KEY });

const errors = checkSwxState(state);
const missing = REQUIRED.filter((id) => !state.sources?.find((s) => s.id === id)?.ok);
if (errors.length || missing.length) {
  console.error('저장하지 않음.');
  if (errors.length) console.error(`스키마 오류:\n- ${errors.join('\n- ')}`);
  if (missing.length) console.error(`필수 원천 실패: ${missing.join(', ')}`);
  process.exit(1);
}

const out = new URL('../data/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL('fallback-latest.json', out), JSON.stringify({ ...state, mode: 'fallback' }, null, 2) + '\n');

const failed = state.sources.filter((s) => !s.ok).map((s) => s.id);
console.log(`저장: data/fallback-latest.json (기준 ${state.asOfUtc})${failed.length ? ` — 실패 원천: ${failed.join(', ')}` : ''}`);
