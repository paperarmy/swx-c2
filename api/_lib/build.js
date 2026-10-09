// 원천 D1~D7, D10·D11, D13을 병렬 수집해 SwxState(PRD 3.2) 하나로 조립한다.
// 원천 하나가 실패해도 나머지로 응답하고, 실패는 sources[].ok=false로 알린다.
import { SOURCES, gfzUrl, kasiUrl, fetchJson, fetchText } from './sources.js';
import * as t from './transform.js';
import { kstDate, sunTimesKst, isDaytimeAt } from './sun.js';

export const DEFAULT_COORDS = { lat: 36.35, lon: 127.38 }; // 대전(PRD 3.2)

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;

const isoSec = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function collect(id, load, parse) {
  try {
    const value = parse(await load());
    return { id, ok: true, fetchedAtUtc: isoSec(Date.now()), value };
  } catch (e) {
    const error = e?.name === 'TimeoutError' ? '시간 초과' : String(e?.message ?? e);
    return { id, ok: false, fetchedAtUtc: isoSec(Date.now()), error };
  }
}

const skipped = (id, note) => ({ id, ok: false, fetchedAtUtc: null, note });

// GFZ Kp(확정·잠정)를 기본으로, GFZ에 아직 없는 최근 구간은 NOAA D2로 채운다.
function mergeKp(gfzKp, noaaKp) {
  const byTime = new Map();
  for (const r of noaaKp ?? []) byTime.set(r.timeUtc, r.kp);
  for (const r of gfzKp ?? []) byTime.set(r.timeUtc, r.value);
  return [...byTime.entries()].map(([timeUtc, kp]) => ({ timeUtc, kp }));
}

export async function buildSwxState({
  now = Date.now(),
  lat = DEFAULT_COORDS.lat,
  lon = DEFAULT_COORDS.lon,
  apiKey,
  fetchImpl,
  timeoutMs = 5000,
} = {}) {
  const opts = { fetchImpl, timeoutMs };
  const json = (url) => () => fetchJson(url, opts);
  const dateKst = kstDate(now);
  const startUtc = `${isoSec(now - HISTORY_DAYS * DAY_MS).slice(0, 10)}T00:00:00Z`;
  const endUtc = isoSec(now);

  const results = await Promise.all([
    collect('D1', json(SOURCES.D1), t.parseScales),
    collect('D2', json(SOURCES.D2), t.parseKpObserved),
    collect('D3', json(SOURCES.D3), t.parseKpForecast),
    collect('D4', json(SOURCES.D4), t.parseXray),
    collect('D5', json(SOURCES.D5), t.parseProton),
    collect('D6', json(SOURCES.D6), t.parseKp1m),
    apiKey
      ? collect('D7', () => fetchText(kasiUrl(dateKst, lat, lon, apiKey), opts), t.parseKasi)
      : skipped('D7', '인증키 없음, 내장 계산 사용'),
    collect('D10', json(gfzUrl('Kp', startUtc, endUtc)), (r) => t.parseGfz(r, 'Kp')),
    collect(
      'D11',
      () => Promise.all([fetchJson(gfzUrl('SN', startUtc, endUtc), opts), fetchJson(gfzUrl('Fobs', startUtc, endUtc), opts)]),
      ([sn, fobs]) => ({ sn: t.parseGfz(sn, 'SN'), fobs: t.parseGfz(fobs, 'Fobs') }),
    ),
    collect('D13', json(SOURCES.D13), (r) => t.parseSrb(r, now)),
  ]);

  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const v = (id) => (byId[id].ok ? byId[id].value : null);

  const d1 = v('D1');
  const xray = v('D4');
  const kpObserved = v('D2');
  const sun = v('D7') ?? sunTimesKst(dateKst, lat, lon);
  const solar = v('D11');

  return {
    asOfUtc: isoSec(now),
    mode: 'live',
    scales: d1?.scales ?? { R: null, S: null, G: null },
    forecast: d1?.forecast ?? [],
    kpForecast: v('D3') ?? [],
    metrics: {
      xrayFlux: xray?.xrayFlux ?? null,
      xrayClass: xray?.xrayClass ?? null,
      protonPfu: v('D5'),
      kp: v('D6') ?? kpObserved?.at(-1)?.kp ?? null,
    },
    korea: {
      lat,
      lon,
      isDaytime: isDaytimeAt(now, sun.sunriseKst, sun.sunsetKst),
      sunriseKst: sun.sunriseKst,
      sunsetKst: sun.sunsetKst,
      sunSource: v('D7') ? 'kasi' : 'builtin',
    },
    srb: v('D13'),
    history: {
      dailyMaxKp: t.dailyMaxKp(mergeKp(v('D10'), kpObserved), HISTORY_DAYS),
      sn27: solar ? t.recentMean(solar.sn) : null,
      f107_27: solar ? t.recentMean(solar.fobs) : null,
    },
    series: {
      xray: xray?.series ?? [],
      kp: kpObserved ?? [],
    },
    sources: results.map(({ value, ...meta }) => meta),
  };
}
