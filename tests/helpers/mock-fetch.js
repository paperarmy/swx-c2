// samples/를 응답으로 돌려주는 가짜 fetch. 네트워크 없이 데이터 계층을 시험한다.
import { readFileSync } from 'node:fs';

const SAMPLES = new URL('../../samples/', import.meta.url);

// 샘플 수집 시각(samples/README.md)
export const SAMPLE_NOW = Date.parse('2026-10-09T04:50:00Z');

export const readSample = (file) => readFileSync(new URL(file, SAMPLES), 'utf8');
export const sample = (file) => JSON.parse(readSample(file));

const ROUTES = [
  [/noaa-scales\.json$/, 'd1-noaa-scales.json'],
  [/noaa-planetary-k-index\.json$/, 'd2-noaa-planetary-k-index.json'],
  [/noaa-planetary-k-index-forecast\.json$/, 'd3-noaa-planetary-k-index-forecast.json'],
  [/xrays-1-day\.json$/, 'd4-xrays-1-day.json'],
  [/integral-protons-1-day\.json$/, 'd5-integral-protons-1-day.json'],
  [/planetary_k_index_1m\.json$/, 'd6-planetary-k-index-1m.json'],
  [/alerts\.json$/, 'd13-alerts.json'],
  [/kp\.gfz\.de.*index=Kp$/, 'd10-gfz-kp-60d.json'],
  [/kp\.gfz\.de.*index=SN$/, 'd11-gfz-sn-60d.json'],
  [/kp\.gfz\.de.*index=Fobs$/, 'd11-gfz-fobs-60d.json'],
];

export const KASI_XML =
  '<response><header><resultCode>00</resultCode></header><body><items><item>' +
  '<sunrise>0629  </sunrise><sunset>1806  </sunset></item></items></body></response>';

// Supabase is_active() 가짜 응답: 토큰별로 승인·대기·무효
export const TOKENS = { active: 'token-active', pending: 'token-pending' };

function supabaseRpc(opts) {
  const token = opts?.headers?.Authorization?.replace('Bearer ', '');
  if (token === TOKENS.active) return response('true');
  if (token === TOKENS.pending) return response('false');
  return { ok: false, status: 401, json: async () => ({ message: 'JWT expired' }) };
}

// fail: 실패시킬 샘플 파일 접두어 목록(예: ['d1-', 'd10-'])
export function mockFetch({ fail = [] } = {}) {
  return async (url, opts) => {
    if (/\/rest\/v1\/rpc\/is_active$/.test(url)) return supabaseRpc(opts);
    if (/apis\.data\.go\.kr/.test(url)) return response(KASI_XML);
    const hit = ROUTES.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404 };
    if (fail.some((prefix) => hit[1].startsWith(prefix))) throw new Error('network down');
    return response(readSample(hit[1]));
  };
}

// 응답하지 않다가 signal이 끊기면 실패하는 fetch(타임아웃 시험용)
export const hangingFetch = (url, { signal }) =>
  new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

function response(body) {
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
}
