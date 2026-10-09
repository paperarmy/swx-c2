// 탭6 AI 장차 전망(PRD 6.3). 입력: withOutlook()을 거친 SwxState.
// 27일 달력(G1+ 확률 = 농도, G3+ 확률 = 숫자), 작전 기간 위험 확률, 근거·성능 배지, 고지 문구.
import { el } from '../format.js';
import { periodRisk } from '../forecast.js';

const BASIS_LABEL = { ml: 'ML', recurrence: '27일 재귀', climatology: '기후학', mixed: '혼합' };
const pct = (p, digits = 0) => (p === null || p === undefined ? '-' : `${(p * 100).toFixed(digits)}%`);
const signed = (v) => (v === null || v === undefined ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`);

const NOTICE =
  '확률 전망이며 확정 예보가 아닙니다. 코로나 구멍에서 오는 반복형 폭풍에만 예측력이 있고, ' +
  '코로나물질방출(CME)로 생기는 폭풍은 사실상 예측할 수 없습니다. 플레어(R)는 장기 예측이 불가능해 기저확률만 제공합니다.';

function skillBadges(skill) {
  return ['G1', 'G3'].map((name) => {
    const s = skill[name];
    const parts = Object.entries(skill.basis[name]).map(
      ([bucket, basis]) => `${bucket}일 ${BASIS_LABEL[basis]}(재귀 대비 ${signed(s.byHorizon[bucket].vsRecurrence)})`,
    );
    return el('div', { class: 'badge-line' },
      el('span', { class: 'badge' }, `${name}+`),
      ` 기후학 대비 BSS ${signed(s.bssVsClimatology)} · `,
      parts.join(' · '),
    );
  });
}

function calendar(outlook) {
  return el('div', { class: 'calendar', role: 'list' },
    ...outlook.map((e) =>
      el('div', {
        class: 'day',
        role: 'listitem',
        style: `--p:${e.pG1.toFixed(3)}`,
        title: `${e.dateUtc} UTC(KST ${e.dateUtc.slice(5)} 09:00~익일 09:00) · G1+ ${pct(e.pG1, 1)} · G3+ ${pct(e.pG3, 1)} · 근거 G1 ${BASIS_LABEL[e.basisG1]}, G3 ${BASIS_LABEL[e.basisG3]}`,
      },
        el('div', { class: 'date' }, `D+${e.h} · ${e.dateUtc.slice(5).replace('-', '/')}`),
        el('div', { class: 'g3' }, pct(e.pG3, 1)),
        el('div', { class: 'g1' }, `G1+ ${pct(e.pG1)}`),
        el('div', { class: 'basis' }, BASIS_LABEL[e.basisG3]),
      ),
    ),
  );
}

function periodPicker(outlook) {
  const first = outlook[0].dateUtc;
  const last = outlook.at(-1).dateUtc;
  const start = el('input', { type: 'date', min: first, max: last, value: outlook[Math.min(3, outlook.length - 1)].dateUtc });
  const end = el('input', { type: 'date', min: first, max: last, value: outlook[Math.min(9, outlook.length - 1)].dateUtc });
  const result = el('div', { class: 'period-result', role: 'status' });
  const update = () => {
    const [a, b] = start.value <= end.value ? [start.value, end.value] : [end.value, start.value];
    const g3 = periodRisk(outlook, a, b, 'pG3');
    const g1 = periodRisk(outlook, a, b, 'pG1');
    result.textContent = g3 === null ? '기간을 전망 범위 안에서 고르십시오.' : `기간 중 G3 이상 1회 이상 확률 ${pct(g3)} · G1 이상 ${pct(g1)}`;
  };
  start.addEventListener('change', update);
  end.addEventListener('change', update);
  update();
  return el('div', { class: 'panel' },
    el('div', {}, '작전 기간(UTC 일자)'),
    el('div', { class: 'row' }, start, el('span', {}, '~'), end),
    result,
  );
}

export function renderOutlook(container, state) {
  if (!state.outlook?.length) {
    container.replaceChildren(el('p', { class: 'msg' }, '장차 전망을 계산할 이력 자료가 없습니다.'));
    return;
  }
  const s = state.outlookSkill;
  const r = state.rBaseline;
  container.replaceChildren(
    el('div', { class: 'panel' },
      el('div', {}, `AI 장차 전망 D+1~27 (기준일 ${state.history.dailyMaxKp.at(-1).dateUtc} UTC) · 학습 ${s.trainPeriod} · 검증 ${s.validPeriod}`),
      ...skillBadges(s),
    ),
    periodPicker(state.outlook),
    el('div', { class: 'panel' },
      el('div', { class: 'msg' }, '칸의 숫자는 G3 이상 확률, 배경 농도는 G1 이상 확률입니다. 아래 표시는 G3 근거입니다.'),
      calendar(state.outlook),
    ),
    el('div', { class: 'panel' },
      `플레어(R3 이상) 일 기저확률 약 ${pct(r.pR3PerDay, 1)} — 최근 27일 평균 흑점수 기준 근사(장기 예측 아님)`,
    ),
    el('p', { class: 'msg' }, NOTICE),
  );
}
