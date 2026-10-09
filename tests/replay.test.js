// 탭5 재현·탭4 판별 로직 테스트(P4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operationDay, overallTimeline, firstReach, kstToUtc, scenarioState, createPlayer } from '../js/replay.js';
import { diagnose, suggestAnswers } from '../js/diagnose.js';
import { evaluate } from '../js/engine.js';
import { checkSwxState } from '../api/_lib/schema.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const rules = read('../config/rules.json');
const frames = read('../data/replay-2024-05.json');
const cases = read('../data/cases.json');
const sys = (r, id) => r.systems.find((s) => s.id === id);

test('작전 D+n일: 첫 프레임 KST 날짜가 D+0', () => {
  assert.equal(operationDay(frames, 0), 0); // 2024-05-09 12:00 KST
  const i = frames.findIndex((f) => f.asOfUtc === '2024-05-10T15:00:00Z'); // 05-11 00:00 KST
  assert.equal(operationDay(frames, i), 2);
});

test('타임라인: 40프레임, 최대 III', () => {
  const t = overallTimeline(frames, rules);
  assert.equal(t.length, 40);
  assert.equal(Math.max(...t), 3);
});

test('첫 II 대비·III 조치 도달 시각(국가 경보 비교용)', () => {
  const ii = firstReach(frames, rules, 2);
  const iii = firstReach(frames, rules, 3);
  assert.ok(ii && iii);
  assert.ok(ii.index <= iii.index);
  // 국가 위기경보 '관심'(2024-05-11 03:50 KST)과 비교 가능한 시각 형식
  assert.equal(kstToUtc('2024-05-11 03:50'), '2024-05-10T18:50:00Z');
  assert.ok(Date.parse(iii.asOfUtc) <= Date.parse(kstToUtc('2024-05-11 09:30')));
});

test('가상 재구성: 스키마에 맞고 사례 교훈대로 판정된다', () => {
  const byId = Object.fromEntries(cases.scenarios.map((s) => [s.id, s]));
  for (const sc of cases.scenarios) assert.deepEqual(checkSwxState(scenarioState(sc)), [], sc.id);

  const quiet = evaluate(scenarioState(byId['2006-12a']), rules); // X선만 강함 → GNSS 그대로
  assert.equal(sys(quiet, 'gnss').level, 0);
  assert.equal(sys(quiet, 'hf_day').level, 2);

  const srb = evaluate(scenarioState(byId['2006-12b']), rules); // 전파폭발 → GNSS II
  assert.equal(sys(srb, 'gnss').level, 2);

  const r1967 = evaluate(scenarioState(byId['1967-05']), rules);
  assert.equal(sys(r1967, 'radar').level, 2);

  const sc22 = byId['2022-02'];
  assert.equal(sys(evaluate(scenarioState(sc22), rules, sc22.options), 'leo_isr').level, 2);
  assert.equal(sys(evaluate(scenarioState(sc22), rules), 'leo_isr').level, 1);

  assert.equal(evaluate(scenarioState(byId['2003-10']), rules).overall, 3);
});

test('재생기: 앞으로 진행, 끝에서 멈춤, 처음부터 다시', () => {
  const seen = [];
  const p = createPlayer(3, (i) => seen.push(i));
  p.seek(2);
  assert.equal(p.index, 2);
  p.seek(99);
  assert.equal(p.index, 2);
  p.play(); // 끝에서 누르면 처음부터
  assert.equal(p.index, 0);
  assert.ok(p.playing);
  p.pause();
  assert.ok(!p.playing);
  assert.deepEqual(seen, [2, 2, 0]);
});

test('장애 원인 판별: 점수와 판정', () => {
  assert.equal(diagnose({}, rules).verdict, null);
  const sw = diagnose({ daytime: 'yes', wide: 'yes', event: 'yes', narrow: 'no' }, rules);
  assert.equal(sw.score, 6);
  assert.equal(sw.verdict.label, '우주기상 가능성 높음');
  const jam = diagnose({ wide: 'no', event: 'no', narrow: 'yes' }, rules);
  assert.equal(jam.verdict.label, '재밍 의심');
  const unsure = diagnose({ daytime: 'yes', narrow: 'unknown' }, rules);
  assert.equal(unsure.verdict.label, '판단 유보');
  assert.ok(sw.reasons.every((r) => r.text.length > 0));
});

test('판별 제안: 현재 데이터에서 주간·사건 여부를 채운다', () => {
  const peak = frames.find((f) => f.asOfUtc === '2024-05-11T03:00:00Z');
  const h = suggestAnswers(peak);
  assert.equal(h.daytime.answer, 'yes');
  assert.equal(h.event.answer, 'yes');
  assert.match(h.event.text, /G5/);
});
