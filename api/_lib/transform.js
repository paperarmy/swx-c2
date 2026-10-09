// 원천 응답 → SwxState 조각 변환(순수 함수). 구조 근거는 samples/README.md.

const HOUR_MS = 60 * 60 * 1000;

// SRB 경보가 이 시간 안에 발령됐으면 진행 중으로 본다. 판단 임계값이 아니라 데이터 정리 기준이다.
export const SRB_ACTIVE_HOURS = 3;
const SRB_KEEP_HOURS = 24;

// "2026-10-02T00:00:00", "2026-10-09 01:29:51.387" → "2026-10-02T00:00:00Z"
export function toUtcIso(tag) {
  let s = String(tag).trim().replace(' ', 'T');
  if (!/(Z|[+-]\d\d:?\d\d)$/i.test(s)) s += 'Z';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`시각 형식 오류: ${tag}`);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round = (v, digits) => (v === null ? null : Number(v.toFixed(digits)));

function mean(values) {
  const xs = values.filter((v) => v !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// D1 → scales, forecast
export function parseScales(raw) {
  const cur = raw?.['0'];
  if (!cur) throw new Error('D1: 현재 등급(키 "0")이 없음');
  const scales = { R: num(cur.R?.Scale), S: num(cur.S?.Scale), G: num(cur.G?.Scale) };
  const forecast = ['1', '2', '3']
    .map((k) => raw[k])
    .filter(Boolean)
    .map((d) => ({
      dateUtc: d.DateStamp,
      R12pct: num(d.R?.MinorProb),
      R35pct: num(d.R?.MajorProb),
      S1pct: num(d.S?.Prob),
      Gmax: num(d.G?.Scale),
    }));
  return { scales, forecast };
}

// D2 → [{ timeUtc, kp }] 관측 Kp(3시간)
export function parseKpObserved(raw) {
  if (!Array.isArray(raw)) throw new Error('D2: 배열이 아님');
  return raw
    .map((r) => ({ timeUtc: toUtcIso(r.time_tag), kp: num(r.Kp) }))
    .filter((r) => r.kp !== null);
}

// D3 → [{ timeUtc, kp }] 추정·예보 구간만
export function parseKpForecast(raw) {
  if (!Array.isArray(raw)) throw new Error('D3: 배열이 아님');
  return raw
    .filter((r) => r.observed !== 'observed')
    .map((r) => ({ timeUtc: toUtcIso(r.time_tag), kp: num(r.kp) }))
    .filter((r) => r.kp !== null);
}

// X선 플럭스(W/m²) → 등급 문자열. 예: 1.2e-5 → "M1.2"
export function xrayClass(flux) {
  if (flux === null || !(flux > 0)) return null;
  const bands = [
    ['X', 1e-4],
    ['M', 1e-5],
    ['C', 1e-6],
    ['B', 1e-7],
    ['A', 1e-8],
  ];
  for (const [letter, base] of bands) {
    // 1e-9: 1.3e-5/1e-5 = 1.2999…처럼 나눗셈 오차로 한 단계 내려가는 것을 막는다.
    if (flux >= base) return `${letter}${(Math.floor((flux / base) * 10 + 1e-9) / 10).toFixed(1)}`;
  }
  return 'A0.0';
}

// D4 → 최신 장파(0.1-0.8nm) 플럭스와 10분 간격 시계열
export function parseXray(raw) {
  if (!Array.isArray(raw)) throw new Error('D4: 배열이 아님');
  const rows = raw
    .filter((r) => r.energy === '0.1-0.8nm' && num(r.flux) !== null)
    .map((r) => ({ timeUtc: toUtcIso(r.time_tag), flux: num(r.flux) }))
    .sort((a, b) => a.timeUtc.localeCompare(b.timeUtc));
  if (!rows.length) throw new Error('D4: 0.1-0.8nm 자료 없음');
  const latest = rows.at(-1);
  const series = rows.filter((r) => r.timeUtc.slice(15, 16) === '0' || r === latest);
  return { xrayFlux: latest.flux, xrayClass: xrayClass(latest.flux), series };
}

// D5 → 최신 ≥10 MeV 양성자 플럭스(pfu)
export function parseProton(raw) {
  if (!Array.isArray(raw)) throw new Error('D5: 배열이 아님');
  const rows = raw
    .filter((r) => r.energy === '>=10 MeV' && num(r.flux) !== null)
    .sort((a, b) => String(a.time_tag).localeCompare(String(b.time_tag)));
  if (!rows.length) throw new Error('D5: >=10 MeV 자료 없음');
  return round(num(rows.at(-1).flux), 2);
}

// D6 → 최신 1분 추정 Kp
export function parseKp1m(raw) {
  if (!Array.isArray(raw)) throw new Error('D6: 배열이 아님');
  const rows = raw.filter((r) => num(r.estimated_kp) !== null);
  if (!rows.length) throw new Error('D6: estimated_kp 없음');
  rows.sort((a, b) => String(a.time_tag).localeCompare(String(b.time_tag)));
  return num(rows.at(-1).estimated_kp);
}

// D13 → 태양전파폭발(SRB) 상태. 제목 줄에 Radio Emission/Burst가 있는 경보만 본다.
export function parseSrb(raw, nowMs) {
  if (!Array.isArray(raw)) throw new Error('D13: 배열이 아님');
  const events = raw
    .map((a) => {
      const lines = String(a.message ?? '').split(/\r?\n/).map((l) => l.trim());
      const title = lines.find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED|EXTENDED|CANCEL)/.test(l)) ?? '';
      return { productId: a.product_id, issuedUtc: toUtcIso(a.issue_datetime), title };
    })
    .filter((e) => /Radio (Emission|Burst)/i.test(e.title))
    .filter((e) => nowMs - Date.parse(e.issuedUtc) <= SRB_KEEP_HOURS * HOUR_MS)
    .sort((a, b) => b.issuedUtc.localeCompare(a.issuedUtc));
  const lastAlertUtc = events[0]?.issuedUtc ?? null;
  const active = lastAlertUtc !== null && nowMs - Date.parse(lastAlertUtc) <= SRB_ACTIVE_HOURS * HOUR_MS;
  return { active, lastAlertUtc, events };
}

// D7 XML → { sunriseKst, sunsetKst }. 공공데이터포털 문서 기준이며 실응답으로 미검증(samples/README.md).
export function parseKasi(xml) {
  const pick = (tag) => String(xml).match(new RegExp(`<${tag}>\\s*(\\d{2})(\\d{2})`));
  const rise = pick('sunrise');
  const set = pick('sunset');
  if (!rise || !set) {
    const msg = String(xml).match(/<(?:resultMsg|returnAuthMsg)>([^<]*)/)?.[1] ?? '응답에 출몰시각 없음';
    throw new Error(`D7: ${msg}`);
  }
  return { sunriseKst: `${rise[1]}:${rise[2]}`, sunsetKst: `${set[1]}:${set[2]}` };
}

// GFZ 열 단위 응답 → [{ timeUtc, value }]
export function parseGfz(raw, index) {
  const values = raw?.[index];
  const times = raw?.datetime;
  if (!Array.isArray(values) || !Array.isArray(times)) throw new Error(`GFZ ${index}: 형식 오류`);
  return times
    .map((t, i) => ({ timeUtc: toUtcIso(t), value: num(values[i]) }))
    .filter((r) => r.value !== null);
}

// 3시간 Kp → 일 최대 Kp(최근 days일)
export function dailyMaxKp(kpRows, days = 60) {
  const byDate = new Map();
  for (const { timeUtc, kp } of kpRows) {
    const d = timeUtc.slice(0, 10);
    byDate.set(d, Math.max(byDate.get(d) ?? -Infinity, kp));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-days)
    .map(([dateUtc, kp]) => ({ dateUtc, kp: round(kp, 3) }));
}

// 최근 n개 일값 평균(27일 평균 SN·F10.7)
export function recentMean(rows, n = 27) {
  return round(mean(rows.slice(-n).map((r) => r.value)), 1);
}
