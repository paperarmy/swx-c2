// AI 장차 전망 테스트(PRD 5.4 T8·T9)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outlookFromHistory, rBaseline, periodRisk, withOutlook } from '../js/forecast.js';
import { evaluate } from '../js/engine.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const model = read('../config/forecast-model.json');
const fixtures = read('./fixtures/outlook.json');
const rules = read('../config/rules.json');
const replay = read('../data/replay-2024-05.json');

test('T8 outlook 27개, 확률 0~1, basis 있음', () => {
  for (const c of fixtures) {
    const out = outlookFromHistory(c.history, model);
    assert.equal(out.length, 27, c.baseDate);
    assert.deepEqual(out.map((e) => e.h), Array.from({ length: 27 }, (_, i) => i + 1));
    for (const e of out) {
      assert.ok(e.pG1 >= 0 && e.pG1 <= 1 && e.pG3 >= 0 && e.pG3 <= 1, `${c.baseDate} h=${e.h}`);
      assert.ok(['ml', 'recurrence', 'climatology', 'mixed'].includes(e.basis));
    }
  }
});

test('T9 Python 학습 결과와 JS 계산이 소수 셋째 자리까지 같다(5쌍)', () => {
  for (const c of fixtures) {
    const out = outlookFromHistory(c.history, model);
    c.expected.forEach((exp, i) => {
      const got = out[i];
      assert.equal(got.dateUtc, exp.dateUtc);
      for (const k of ['pG1', 'pG3']) {
        assert.ok(Math.abs(got[k] - exp[k]) < 5e-4, `${c.baseDate} h=${exp.h} ${k}: JS ${got[k]} vs Py ${exp[k]}`);
      }
      assert.equal(got.basisG1, exp.basisG1);
      assert.equal(got.basisG3, exp.basisG3);
    });
  }
});

test('채택 규칙 반영: G3는 h=1~3만 ML, 이후 27일 재귀', () => {
  const out = outlookFromHistory(fixtures[0].history, model);
  assert.equal(out[0].basisG3, model.basis.G3['1-3']);
  assert.equal(out[10].basisG3, model.basis.G3['4-13']);
  assert.equal(out[20].basisG3, model.basis.G3['14-27']);
});

test('이력이 모자라면 재귀·기후학으로 내려간다(오류 없음)', () => {
  const short = { dailyMaxKp: [{ dateUtc: '2026-10-01', kp: 3 }, { dateUtc: '2026-10-02', kp: 5.33 }], sn27: null, f107_27: null };
  const out = outlookFromHistory(short, model);
  assert.equal(out.length, 27);
  assert.ok(out.every((e) => e.basisG1 !== 'ml'));
  assert.ok(out.some((e) => e.basisG1 === 'climatology'));
  assert.deepEqual(outlookFromHistory({ dailyMaxKp: [], sn27: 1, f107_27: 1 }, model), []);
});

test('periodRisk = 1 − ∏(1 − p)', () => {
  const o = [{ dateUtc: '2026-10-10', pG3: 0.1 }, { dateUtc: '2026-10-11', pG3: 0.2 }, { dateUtc: '2026-10-12', pG3: 0.5 }];
  assert.ok(Math.abs(periodRisk(o, '2026-10-10', '2026-10-11') - (1 - 0.9 * 0.8)) < 1e-12);
  assert.equal(periodRisk(o, '2027-01-01', '2027-01-02'), null);
});

test('rBaseline: 흑점수가 많을수록 R3 기저확률이 높다', () => {
  const lo = rBaseline({ sn27: 30 }, model).pR3PerDay;
  const hi = rBaseline({ sn27: 180 }, model).pR3PerDay;
  assert.ok(lo > 0 && hi > lo && hi < 1);
  assert.equal(rBaseline({ sn27: null }, model).pR3PerDay, null);
});

test('withOutlook → 엔진 4~27일 칸 연동, 입력 상태는 바꾸지 않음', () => {
  const frame = replay.find((f) => f.asOfUtc === '2024-05-08T00:00:00Z') ?? replay[0];
  const s = withOutlook(frame, model);
  assert.equal(frame.outlook, undefined);
  assert.equal(s.outlook.length, 27);
  assert.ok(s.outlookSkill.G1 && s.rBaseline.pR3PerDay > 0);
  const r = evaluate(s, rules);
  assert.ok(!r.notices.includes(rules.texts.outlookMissing));
  assert.ok([0, 1].includes(r.horizon.d4_27));
});
