// 탭3 PACE 권고(PRD 6장): 체계 단계에 따른 통신수단 전환 순서와 점검 체크리스트(저장 안 함)
import { el, levelChip } from '../format.js';
import { tipAttrs } from '../tooltip.js';

const STEPS = [
  ['P', '주'],
  ['A', '보조'],
  ['C', '비상'],
  ['E', '긴급'],
];

function paceCard(sys, rules, g) {
  const active = sys.level >= 2; // II 대비부터 전환 권고
  return el('div', { class: `panel pace lv${sys.level}` },
    el('div', { class: 'pace-head' }, el('strong', {}, sys.name), ' ', levelChip(sys.level, rules, tipAttrs(g, `level${sys.level}`))),
    el('p', {}, rules.paceAction[String(sys.level)]),
    el('ol', { class: 'pace-steps' },
      ...STEPS.map(([k, label], i) =>
        el('li', { class: active && i === 0 ? 'now' : '' }, el('span', { class: 'step' }, `${k} ${label}`), sys.pace[k]),
      ),
    ),
    sys.level > 0 ? el('p', { class: 'muted' }, sys.message) : null,
  );
}

function checklist(overall, rules, g) {
  const upTo = Math.max(1, overall); // 정상일 때도 평시 점검(I 관찰 항목)을 보여준다
  const groups = [];
  for (let lv = 1; lv <= upTo; lv++) {
    const items = rules.checklist[String(lv)] ?? [];
    groups.push(
      el('div', {},
        el('div', {}, levelChip(lv, rules, tipAttrs(g, `level${lv}`))),
        el('ul', { class: 'checks' },
          ...items.map((text, i) => {
            const id = `chk-${lv}-${i}`;
            return el('li', {}, el('input', { type: 'checkbox', id }), el('label', { for: id }, text));
          }),
        ),
      ),
    );
  }
  return el('div', { class: 'panel' },
    el('div', tipAttrs(g, 'checklist'), overall === 0 ? '평시 점검 항목' : `현재 단계(${rules.levels[overall]})까지 점검 항목`),
    ...groups,
  );
}

export function renderPace(container, { result, rules, glossary: g }) {
  const withPace = result.systems.filter((s) => s.pace);
  const others = result.systems.filter((s) => !s.pace && s.level > 0);
  container.replaceChildren(
    el('p', { ...tipAttrs(g, 'PACE'), class: 'msg' }, 'PACE: 주(P)·보조(A)·비상(C)·긴급(E) 통신수단 전환 순서. 일반 예시이며 부대별로 바꿔 씁니다.'),
    el('div', { class: 'cards' }, ...withPace.map((s) => paceCard(s, rules, g))),
    others.length
      ? el('div', { class: 'panel' },
          el('div', {}, '그 밖의 영향 체계'),
          el('ul', {}, ...others.map((s) => el('li', {}, levelChip(s.level, rules), ` ${s.name}: ${s.message}`))),
        )
      : null,
    checklist(result.overall, rules, g),
  );
}
