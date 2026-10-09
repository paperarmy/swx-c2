import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSwxState, DEFAULT_COORDS } from '../api/_lib/build.js';
import { checkSwxState } from '../api/_lib/schema.js';
import handler, { parseCoords } from '../api/swx.js';
import { mockFetch, hangingFetch, SAMPLE_NOW } from './helpers/mock-fetch.js';

const build = (opts = {}) => buildSwxState({ now: SAMPLE_NOW, fetchImpl: mockFetch(), ...opts });
const src = (state, id) => state.sources.find((s) => s.id === id);

test('정상: 샘플 전체로 스키마에 맞는 SwxState', async () => {
  const s = await build();
  assert.deepEqual(checkSwxState(s), []);
  assert.equal(s.asOfUtc, '2026-10-09T04:50:00Z');
  assert.equal(s.mode, 'live');
  assert.deepEqual(s.scales, { R: 0, S: 0, G: 0 });
  assert.equal(s.forecast.length, 3);
  assert.ok(s.kpForecast.length > 0);
  assert.equal(s.metrics.xrayClass, 'C1.3');
  assert.equal(s.metrics.kp, 2);
  assert.equal(s.korea.isDaytime, true); // 13:50 KST
  assert.equal(s.korea.sunSource, 'builtin');
  assert.equal(typeof s.srb.active, 'boolean');
  assert.ok(s.history.dailyMaxKp.length > 50 && s.history.dailyMaxKp.length <= 60);
  assert.equal(typeof s.history.sn27, 'number');
  assert.equal(typeof s.history.f107_27, 'number');
  assert.deepEqual(s.sources.map((x) => x.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D10', 'D11', 'D13']);
  assert.ok(s.sources.filter((x) => x.id !== 'D7').every((x) => x.ok));
  assert.equal(src(s, 'D7').ok, false);
  assert.match(src(s, 'D7').note, /인증키 없음/);
});

test('일 최대 Kp: GFZ에 없는 최근 날짜를 NOAA D2로 채운다', async () => {
  const s = await build();
  const last = s.history.dailyMaxKp.at(-1);
  assert.equal(last.dateUtc, '2026-10-09');
});

test('D7 인증키가 있으면 천문연 출몰시각 사용', async () => {
  const s = await build({ apiKey: 'test-key' });
  assert.equal(src(s, 'D7').ok, true);
  assert.equal(s.korea.sunSource, 'kasi');
  assert.equal(s.korea.sunriseKst, '06:29');
});

test('D1 실패: 다른 원천은 그대로, 등급은 null, ok:false 표시', async () => {
  const s = await build({ fetchImpl: mockFetch({ fail: ['d1-'] }) });
  assert.deepEqual(checkSwxState(s), []);
  assert.deepEqual(s.scales, { R: null, S: null, G: null });
  assert.deepEqual(s.forecast, []);
  assert.equal(src(s, 'D1').ok, false);
  assert.equal(src(s, 'D1').error, 'network down');
  assert.equal(src(s, 'D4').ok, true);
});

test('GFZ 실패: 일 최대 Kp는 NOAA D2로, SN·F10.7은 null', async () => {
  const s = await build({ fetchImpl: mockFetch({ fail: ['d10-', 'd11-'] }) });
  assert.deepEqual(checkSwxState(s), []);
  assert.ok(s.history.dailyMaxKp.length >= 7 && s.history.dailyMaxKp.length <= 9);
  assert.equal(s.history.sn27, null);
  assert.equal(s.history.f107_27, null);
});

test('D13 실패: srb는 null(엔진은 "SRB 판단 불가")', async () => {
  const s = await build({ fetchImpl: mockFetch({ fail: ['d13-'] }) });
  assert.equal(s.srb, null);
  assert.deepEqual(checkSwxState(s), []);
});

test('전 원천 무응답: 타임아웃 후에도 예외 없이 스키마 유지', async () => {
  // AbortSignal.timeout 타이머는 프로세스를 붙잡지 않으므로, 시험 중에는 별도 타이머로 붙잡아 둔다.
  const keepAlive = setTimeout(() => {}, 5000);
  const s = await build({ fetchImpl: hangingFetch, timeoutMs: 50, apiKey: 'k' }).finally(() => clearTimeout(keepAlive));
  assert.deepEqual(checkSwxState(s), []);
  assert.ok(s.sources.every((x) => !x.ok));
  assert.equal(src(s, 'D2').error, '시간 초과');
  assert.equal(s.korea.sunSource, 'builtin');
  assert.deepEqual(s.history.dailyMaxKp, []);
});

test('parseCoords: 한반도 범위만 허용, 아니면 대전', () => {
  assert.deepEqual(parseCoords({ lat: '37.5', lon: '127.0' }), { lat: 37.5, lon: 127 });
  assert.deepEqual(parseCoords({ lat: '51.5', lon: '0' }), DEFAULT_COORDS);
  assert.deepEqual(parseCoords({ lat: 'abc' }), DEFAULT_COORDS);
  assert.deepEqual(parseCoords(), DEFAULT_COORDS);
});

test('handler: 200, s-maxage=300 캐시 헤더, SwxState 본문', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();
  try {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handler({ query: {} }, res);
    assert.equal(res.code, 200);
    assert.match(res.headers['Cache-Control'], /s-maxage=300/);
    assert.deepEqual(checkSwxState(res.body), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('checkSwxState: 형식 오류를 잡아낸다', () => {
  assert.ok(checkSwxState(null).length > 0);
  assert.ok(checkSwxState({ asOfUtc: '2026-10-09', mode: 'demo' }).length > 0);
});
