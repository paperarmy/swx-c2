// 2024년 5월 G5 폭풍 재현 데이터 생성(PRD 3.3, P0) → data/replay-2024-05.json
// 3시간 간격 SwxState 배열. 각 프레임은 그 시각까지 알 수 있었던 값만 쓴다(미래 정보 금지).
//
// 사용: python -P scripts/extract_goes.py   (GOES netCDF → data-raw/goes-2024-05.json)
//       node scripts/make-replay.mjs
//
// 원천
//   R  GOES-16 XRS-B 1분 평균(NCEI)             — 프레임 직전 3시간 최대 플럭스
//   S  GOES-18 SGPS 5분 평균, ≥10 MeV 적분 근사  — 프레임 직전 3시간 최대(pfu는 근사값, samples/README 참고)
//   G  GFZ 확정 Kp(3시간)                        — 프레임 직전 3시간 구간
//   예보  SWPC 3일 예보(당시 발표본, 00:30·12:30 UTC)
//   SRB   SWPC 사건 목록의 1415 MHz 전파폭발(RBR) — GNSS L1(1575 MHz)에 가장 가까운 관측 주파수
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fluxToR, pfuToS, kpToG, xrayClass, parseGfz, dailyMaxKp, recentMean } from '../api/_lib/transform.js';
import { kstDate, sunTimesKst, isDaytimeAt } from '../api/_lib/sun.js';
import { DEFAULT_COORDS } from '../api/_lib/build.js';
import { checkSwxState } from '../api/_lib/schema.js';

const RAW = new URL('../data-raw/', import.meta.url);
const OUT = new URL('../data/replay-2024-05.json', import.meta.url);
const HOUR = 3600 * 1000;
const FIRST_FRAME = Date.parse('2024-05-09T03:00:00Z');
const LAST_FRAME = Date.parse('2024-05-14T00:00:00Z');
const DAYS = ['20240509', '20240510', '20240511', '20240512', '20240513'];
const SRB_FREQ_MHZ = 1415;
const SRB_WINDOW_H = 3;

const NCEI = 'https://www.ngdc.noaa.gov/stp/space-weather/swpc-products/daily_reports';
const GFZ = 'https://kp.gfz.de/app/json/';
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// data-raw/에 없으면 내려받아 보관한다(재실행 시 네트워크 불필요).
async function cached(file, url) {
  const path = new URL(file, RAW);
  if (!existsSync(path)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status} ${url}`);
    await writeFile(path, await res.text());
  }
  return readFile(path, 'utf8');
}

// SWPC 3일 예보 텍스트 → { issuedUtc, days[], kp[] }
export function parseThreeDay(text) {
  const issued = text.match(/:Issued:\s+(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/);
  if (!issued) throw new Error('3일 예보: 발표 시각 없음');
  const year = Number(issued[1]);
  const issuedUtc = `${ymd(year, MONTHS[issued[2]], issued[3])}T${issued[4]}:${issued[5]}:00Z`;
  const lines = text.split(/\r?\n/);

  const tableAt = lines.findIndex((l) => /^NOAA Kp index breakdown/.test(l));
  const dateLine = lines.slice(tableAt + 1).find((l) => /^\s+[A-Z][a-z]{2} \d{1,2}\s+[A-Z][a-z]{2} \d{1,2}/.test(l));
  const dates = [...dateLine.matchAll(/([A-Z][a-z]{2}) (\d{1,2})/g)].map((m) => ymd(year, MONTHS[m[1]], m[2]));

  const kp = [];
  for (const l of lines) {
    const m = l.match(/^(\d{2})-\d{2}UT\s+(.*)$/);
    if (!m) continue;
    [...m[2].matchAll(/(\d+\.\d+)/g)].forEach((v, i) => kp.push({ timeUtc: `${dates[i]}T${m[1]}:00:00Z`, kp: Number(v[1]) }));
  }

  const pct = (re) => {
    const line = lines.find((l) => re.test(l));
    return line ? [...line.matchAll(/(\d+)%/g)].map((m) => Number(m[1])) : [];
  };
  const s1 = pct(/^S1 or greater\s+\d+%/);
  const r12 = pct(/^R1-R2\s+\d+%/);
  const r35 = pct(/^R3 or greater\s+\d+%/);

  const days = dates.map((dateUtc, i) => ({
    dateUtc,
    R12pct: r12[i] ?? null,
    R35pct: r35[i] ?? null,
    S1pct: s1[i] ?? null,
    Gmax: kpToG(Math.max(...kp.filter((k) => k.timeUtc.startsWith(dateUtc)).map((k) => k.kp))),
  }));
  return { issuedUtc, days, kp };
}

// SWPC 사건 목록 → 지정 주파수 RBR 사건 [{ issuedUtc, productId, title }]
export function parseRbr(text, dateStr, freqMhz) {
  const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const out = [];
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^\s*\d+\s+\+?\s*\D?(\d{2})(\d{2})\s+\S+\s+\S+\s+\S+\s+\S+\s+RBR\s+(\d+)\s+(\d+)/);
    if (!m || Number(m[3]) !== freqMhz) continue;
    out.push({ issuedUtc: `${date}T${m[1]}:${m[2]}:00Z`, productId: `RBR${m[3]}`, title: `Radio Burst ${m[3]} MHz, ${m[4]} sfu` });
  }
  return out;
}

async function load() {
  const goes = JSON.parse(await readFile(new URL('goes-2024-05.json', RAW), 'utf8'));
  const xray = goes.xray.map(([t, f]) => ({ t: Date.parse(t), timeUtc: t, flux: f }));
  const proton = goes.proton.map(([t, p]) => ({ t: Date.parse(t), pfu: p }));

  const forecasts = [];
  const srbEvents = [];
  for (const d of ['20240508', ...DAYS]) {
    for (const hm of ['0030', '1230']) {
      const f = `${d}${hm}three_day_forecast.txt`;
      forecasts.push(parseThreeDay(await cached(f, `${NCEI}/3day_forecast/${d.slice(0, 4)}/${d.slice(4, 6)}/${f}`)));
    }
    const ev = `events_${d}.txt`;
    srbEvents.push(...parseRbr(await cached(ev, `${NCEI}/solar_event_reports/${d.slice(0, 4)}/${d.slice(4, 6)}/${d}events.txt`), d, SRB_FREQ_MHZ));
  }

  const gfz = async (index, start, end) =>
    parseGfz(JSON.parse(await cached(`gfz-${index}-2024.json`, `${GFZ}?start=${start}&end=${end}&index=${index}`)), index);
  const kp = (await gfz('Kp', '2024-03-01T00:00:00Z', '2024-05-14T23:59:59Z')).map((r) => ({ t: Date.parse(r.timeUtc), timeUtc: r.timeUtc, kp: r.value }));
  const sn = await gfz('SN', '2024-03-01T00:00:00Z', '2024-05-14T00:00:00Z');
  const fobs = await gfz('Fobs', '2024-03-01T00:00:00Z', '2024-05-14T00:00:00Z');
  return { xray, proton, forecasts, srbEvents, kp, sn, fobs };
}

const windowMax = (rows, key, from, to) => {
  const vals = rows.filter((r) => r.t > from && r.t <= to).map((r) => r[key]);
  return vals.length ? Math.max(...vals) : null;
};

function frame(T, src) {
  const { lat, lon } = DEFAULT_COORDS;
  const dateUtc = iso(T).slice(0, 10);

  const flux = windowMax(src.xray, 'flux', T - 3 * HOUR, T);
  const pfu = windowMax(src.proton, 'pfu', T - 3 * HOUR, T);
  const kpNow = src.kp.find((r) => r.t === T - 3 * HOUR)?.kp ?? null;
  const kpKnown = src.kp.filter((r) => r.t + 3 * HOUR <= T);

  const fc = src.forecasts.filter((f) => Date.parse(f.issuedUtc) <= T).sort((a, b) => b.issuedUtc.localeCompare(a.issuedUtc))[0];

  const srbRecent = src.srbEvents.filter((e) => Date.parse(e.issuedUtc) <= T && T - Date.parse(e.issuedUtc) <= 24 * HOUR)
    .sort((a, b) => b.issuedUtc.localeCompare(a.issuedUtc));
  const lastSrb = srbRecent[0]?.issuedUtc ?? null;

  const sun = sunTimesKst(kstDate(T), lat, lon);
  const before = (rows) => rows.filter((r) => r.timeUtc.slice(0, 10) < dateUtc);
  const note = '재현 데이터: GOES-16 XRS·GOES-18 SGPS(NCEI), GFZ 확정 Kp, SWPC 3일 예보·사건 목록(당시 발표본)';

  return {
    asOfUtc: iso(T),
    mode: 'replay',
    scales: { R: fluxToR(flux), S: pfuToS(pfu), G: kpToG(kpNow) },
    forecast: fc ? fc.days.filter((d) => d.dateUtc >= dateUtc) : [],
    kpForecast: fc ? fc.kp.filter((k) => Date.parse(k.timeUtc) >= T) : [],
    metrics: { xrayFlux: flux, xrayClass: xrayClass(flux), protonPfu: pfu === null ? null : Number(pfu.toFixed(2)), kp: kpNow },
    korea: { lat, lon, isDaytime: isDaytimeAt(T, sun.sunriseKst, sun.sunsetKst), ...sun, sunSource: 'builtin' },
    srb: { active: lastSrb !== null && T - Date.parse(lastSrb) <= SRB_WINDOW_H * HOUR, lastAlertUtc: lastSrb, events: srbRecent },
    history: {
      dailyMaxKp: dailyMaxKp(kpKnown, 60),
      sn27: recentMean(before(src.sn)),
      f107_27: recentMean(before(src.fobs)),
    },
    series: {
      xray: src.xray.filter((r) => r.t > T - 24 * HOUR && r.t <= T && r.timeUtc[15] === '0').map(({ timeUtc, flux: f }) => ({ timeUtc, flux: f })),
      kp: kpKnown.filter((r) => r.t > T - 7 * 24 * HOUR).map(({ timeUtc, kp: k }) => ({ timeUtc, kp: k })),
    },
    sources: [
      { id: 'replay', ok: true, fetchedAtUtc: null, note },
      { id: 'forecast', ok: Boolean(fc), fetchedAtUtc: fc?.issuedUtc ?? null, note: fc ? `SWPC 3일 예보 ${fc.issuedUtc} 발표본` : '해당 시각 이전 예보 없음' },
    ],
  };
}

const src = await load();
const frames = [];
for (let T = FIRST_FRAME; T <= LAST_FRAME; T += 3 * HOUR) frames.push(frame(T, src));

const errors = frames.flatMap((f) => checkSwxState(f).map((e) => `${f.asOfUtc}: ${e}`));
if (errors.length) {
  console.error(`스키마 오류 ${errors.length}건:\n- ${errors.slice(0, 20).join('\n- ')}`);
  process.exit(1);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(frames) + '\n');

// 확인용 요약(KST 표기)
const kst = (u) => new Date(Date.parse(u) + 9 * HOUR).toISOString().slice(5, 16).replace('T', ' ');
console.log('기준(KST)     R S G  X선    pfu     Kp    주야 SRB 예보발표(UTC)');
for (const f of frames) {
  const s = f.scales;
  console.log(
    `${kst(f.asOfUtc)}  ${s.R} ${s.S} ${s.G}  ${(f.metrics.xrayClass ?? '-').padEnd(5)} ${String(f.metrics.protonPfu ?? '-').padStart(7)} ${String(f.metrics.kp ?? '-').padStart(5)}  ${f.korea.isDaytime ? '주' : '야'}   ${f.srb.active ? 'Y' : '-'}   ${f.sources[1].fetchedAtUtc?.slice(5, 16) ?? '-'}`,
  );
}
const size = (JSON.stringify(frames).length / 1024).toFixed(0);
console.log(`\n저장: data/replay-2024-05.json (${frames.length}프레임, ${size} KB), 스키마 검사 통과`);
