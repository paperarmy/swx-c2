// 판단 엔진 필수 테스트(PRD 5.3 T1~T7, 5.5 T10·T11, 12.3 T12~T14)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, kpToG, hasDaylight } from '../js/engine.js';

const rules = JSON.parse(readFileSync(new URL('../config/rules.json', import.meta.url), 'utf8'));
const replay = JSON.parse(readFileSync(new URL('../data/replay-2024-05.json', import.meta.url), 'utf8'));

// 기준 상태: 2026-10-12 05:00 UTC = 14:00 KST(주간), 모든 등급 0, 예보 없음
function state(over = {}) {
  const base = {
    asOfUtc: '2026-10-12T05:00:00Z',
    mode: 'live',
    scales: { R: 0, S: 0, G: 0 },
    forecast: [],
    kpForecast: [],
    metrics: { xrayFlux: 1e-6, xrayClass: 'C1.0', protonPfu: 0.3, kp: 1.33 },
    korea: { lat: 36.35, lon: 127.38, isDaytime: true, sunriseKst: '06:30', sunsetKst: '18:00', sunSource: 'builtin' },
    srb: { active: false, lastAlertUtc: null, events: [] },
    history: { dailyMaxKp: [], sn27: 100, f107_27: 120 },
    outlook: [],
    sources: [{ id: 'D1', ok: true, fetchedAtUtc: '2026-10-12T05:00:00Z' }],
  };
  return { ...base, ...over, korea: { ...base.korea, ...over.korea }, metrics: { ...base.metrics, ...over.metrics } };
}
const sys = (result, id) => result.systems.find((s) => s.id === id);
const texts = (cell) => cell.reasons.map((r) => r.text).join(' | ');

test('T1 모든 등급 0 → 전 체계 정상', () => {
  const r = evaluate(state(), rules);
  assert.equal(r.overall, 0);
  assert.ok(r.systems.every((s) => s.level === 0 && s.label === '정상'));
  assert.equal(r.systems.length, 9);
  assert.equal(r.headline, '현재 영향 없음');
});

test('T2 R3·주간 → 주간 HF망 II 대비', () => {
  const r = evaluate(state({ scales: { R: 3, S: 0, G: 0 }, metrics: { xrayClass: 'X1.4' } }), rules);
  const hf = sys(r, 'hf_day');
  assert.equal(hf.level, 2);
  assert.equal(hf.label, 'II 대비');
  assert.equal(hf.message, 'HF 수십분~1시간 두절 가능, 위성망 우선');
  assert.match(texts(hf.cells.now), /R3 \(X1\.4\) · 한반도 주간/);
  assert.equal(hf.reasons[0].source, 'NOAA-scales');
});

test('T3 R3·야간 → 주간 HF망 정상 + 야간 근거 문구', () => {
  const r = evaluate(state({ scales: { R: 3, S: 0, G: 0 }, korea: { isDaytime: false } }), rules);
  const hf = sys(r, 'hf_day');
  assert.equal(hf.level, 0);
  assert.match(texts(hf.cells.now), /한반도 야간으로 직접 영향 없음/);
});

test('T4 G3 → GNSS·시각동기·UHF 위성 II 대비, Ka·Ku 위성은 정상(G4부터)', () => {
  const r = evaluate(state({ scales: { R: 0, S: 0, G: 3 }, metrics: { kp: 7 } }), rules);
  for (const id of ['gnss', 'timing', 'uhf_sat']) assert.equal(sys(r, id).level, 2, id);
  assert.equal(sys(r, 'shf_sat').level, 0);
  assert.equal(sys(r, 'high_alt').level, 0);
});

test('T5 G5+S2 → GNSS III, UHF 위성은 더 높은 단계(III) 채택·근거 둘 다', () => {
  const r = evaluate(state({ scales: { R: 0, S: 2, G: 5 }, metrics: { kp: 9, protonPfu: 150 } }), rules);
  assert.equal(sys(r, 'gnss').level, 3);
  const uhf = sys(r, 'uhf_sat');
  assert.equal(uhf.level, 3);
  assert.equal(uhf.reasons.length, 2);
  assert.match(texts(uhf.cells.now), /G5/);
  assert.match(texts(uhf.cells.now), /S2/);
  assert.equal(sys(r, 'high_alt').level, 1); // S2 → I 관찰
});

test('T6 일부 데이터 누락 → 오류 없이 판단, 누락 안내', () => {
  const s = state({
    scales: { R: null, S: null, G: 2 },
    metrics: { xrayFlux: null, xrayClass: null, protonPfu: null },
    srb: null,
    outlook: undefined,
    sources: [
      { id: 'D1', ok: false, fetchedAtUtc: null, error: '시간 초과' },
      { id: 'D7', ok: false, fetchedAtUtc: null, note: '인증키 없음, 내장 계산 사용' },
    ],
  });
  const r = evaluate(s, rules);
  assert.equal(sys(r, 'gnss').level, 1);
  assert.ok(r.notices.some((n) => n === '일부 데이터 지연: D1'), r.notices.join());
  assert.ok(!r.notices.some((n) => n.includes('D7')), '의도적 건너뜀(note)은 지연으로 보지 않는다');
});

test('T7 2024년 5월 재현 최대치 시점 → 종합 III 조치', () => {
  const peak = replay.find((f) => f.asOfUtc === '2024-05-11T03:00:00Z'); // G5·X5.8·주간
  const r = evaluate(peak, rules);
  assert.equal(r.overall, 3);
  assert.equal(r.overallLabel, 'III 조치');
  assert.equal(sys(r, 'hf_day').level, 2); // R3 주간
  assert.equal(Math.max(...replay.map((f) => evaluate(f, rules).overall)), 3);
  assert.ok(replay.every((f) => evaluate(f, rules).systems.length === 9)); // 40프레임 모두 예외 없이
});

test('T10 6시간 칸: R35pct 40%라도 구간이 전부 야간이면 주간 HF망 정상', () => {
  const s = state({
    asOfUtc: '2026-10-12T12:00:00Z', // 21:00 KST, 다음 6시간은 03:00 KST까지 야간
    korea: { isDaytime: false },
    forecast: [
      { dateUtc: '2026-10-12', R12pct: 60, R35pct: 40, S1pct: 5, Gmax: 0 },
      { dateUtc: '2026-10-13', R12pct: 60, R35pct: 40, S1pct: 5, Gmax: 0 },
    ],
  });
  const hf = sys(evaluate(s, rules), 'hf_day');
  assert.equal(hf.cells.h6.level, 0);
  assert.match(texts(hf.cells.h6), /야간/);
  assert.equal(hf.cells.h24.level, 2); // 24시간 구간에는 주간 포함 → R3 → II
  assert.equal(hf.cells.h24.probabilistic, true);
});

test('T11 두 체계가 같은 최고 단계면 headline은 우선순위(rules 순서)를 따른다', () => {
  const r = evaluate(state({ scales: { R: 3, S: 0, G: 3 }, metrics: { xrayClass: 'X1.0', kp: 7 } }), rules);
  assert.equal(sys(r, 'hf_day').level, 2);
  assert.equal(sys(r, 'gnss').level, 2);
  assert.equal(r.headline, '주간 HF망: HF 수십분~1시간 두절 가능, 위성망 우선');
});

test('T12 SRB 입력 없음 → GNSS "SRB 판단 불가"', () => {
  const r = evaluate(state({ srb: null }), rules);
  assert.match(texts(sys(r, 'gnss').cells.now), /SRB 판단 불가/);
  assert.ok(r.notices.some((n) => n.includes('SRB 판단 불가')));
});

test('T13 R3만 있고 SRB 없음 → GNSS 등급 미상향, SRB 있고 주간이면 GNSS·레이더 II', () => {
  const r = evaluate(state({ scales: { R: 3, S: 0, G: 0 } }), rules);
  assert.equal(sys(r, 'gnss').level, 0);
  const withSrb = evaluate(state({ srb: { active: true, lastAlertUtc: '2026-10-12T04:30:00Z', events: [] } }), rules);
  assert.equal(sys(withSrb, 'gnss').level, 2);
  assert.equal(sys(withSrb, 'radar').level, 2);
  const night = evaluate(state({ korea: { isDaytime: false }, srb: { active: true, lastAlertUtc: '2026-10-12T04:30:00Z', events: [] } }), rules);
  assert.equal(sys(night, 'gnss').level, 0);
});

test('T14 저고도 토글 ON + G1 → 저궤도 정찰위성 II, OFF면 I', () => {
  const s = state({ scales: { R: 0, S: 0, G: 1 }, metrics: { kp: 5 } });
  assert.equal(sys(evaluate(s, rules, { lowAltitudeOps: true }), 'leo_isr').level, 2);
  assert.equal(sys(evaluate(s, rules), 'leo_isr').level, 1);
});

test('미래 칸: Kp 예보·3일 Gmax·4~27일 전망', () => {
  const s = state({
    kpForecast: [
      { timeUtc: '2026-10-12T06:00:00Z', kp: 5.67 },
      { timeUtc: '2026-10-12T21:00:00Z', kp: 7.0 },
    ],
    forecast: [{ dateUtc: '2026-10-14', R12pct: 10, R35pct: 1, S1pct: 1, Gmax: 4 }],
    outlook: [
      { dateUtc: '2026-10-16', h: 4, pG1: 0.2, pG3: 0.16, basisG1: 'ml', basisG3: 'recurrence' },
      { dateUtc: '2026-10-13', h: 1, pG1: 0.9, pG3: 0.9 }, // h<4는 4~27일 칸에 쓰지 않음
    ],
  });
  const r = evaluate(s, rules);
  const gnss = sys(r, 'gnss');
  assert.equal(gnss.cells.h6.level, 1); // Kp 5.67 → G2 → I
  assert.equal(gnss.cells.h24.level, 2); // Kp 7.0 → G3 → II
  assert.equal(gnss.cells.d3.level, 3); // Gmax 4 → III
  assert.equal(gnss.cells.d4_27.level, 1); // 확률 전망은 I 상한
  assert.equal(gnss.cells.d4_27.probabilistic, true);
  assert.equal(sys(r, 'shf_sat').cells.d4_27.level, 0); // G4부터인 체계는 전망으로 올리지 않음
  assert.equal(sys(r, 'timing').cells.d4_27.level, 1); // G3 확률 기준 충족 → 시각동기(G3부터)도 I
  assert.match(r.headline, /^현재 영향 없음, 6시간 내 GNSS 항법·정밀유도 I 관찰 예상$/);
  assert.deepEqual(r.horizon, { now: 0, h6: 1, h24: 2, d3: 3, d4_27: 1 });
});

test('kpToG는 NOAA 표기와 같다', () => {
  assert.deepEqual([4.333, 4.667, 5.333, 5.667, 6.667, 7, 7.667, 8.333, 8.667, 9].map((k) => kpToG(k, rules)), [0, 1, 1, 2, 3, 3, 4, 4, 4, 5]);
});

test('hasDaylight: KST 일출·일몰 기준 구간 겹침', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(hasDaylight(at('2026-10-12T12:00:00Z'), at('2026-10-12T18:00:00Z'), '06:30', '18:00'), false); // 21~03시 KST
  assert.equal(hasDaylight(at('2026-10-12T12:00:00Z'), at('2026-10-12T22:00:00Z'), '06:30', '18:00'), true); // 07시 KST 포함
});
