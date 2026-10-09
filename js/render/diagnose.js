// 탭4 장애 원인 판별(PRD 6장·10.2): 우주기상인가, 재밍인가. 질문·점수는 rules.diagnosis.
import { el, levelChip } from '../format.js';
import { tipAttrs } from '../tooltip.js';
import { diagnose, suggestAnswers } from '../diagnose.js';

const answers = {}; // 다시 그려도 답 유지(저장 안 함)
const CHOICES = [
  ['yes', '예'],
  ['no', '아니오'],
  ['unknown', '모름'],
];

export function renderDiagnose(container, ctx) {
  const { state, rules, glossary: g } = ctx;
  const cfg = rules.diagnosis;
  const hints = suggestAnswers(state);
  const redraw = () => renderDiagnose(container, ctx);

  const questions = cfg.questions.map((q, n) =>
    el('fieldset', { class: 'panel question' },
      el('legend', {}, `${n + 1}. ${q.text}`),
      el('div', { class: 'row choices' },
        ...CHOICES.map(([value, label]) => {
          const id = `dq-${q.id}-${value}`;
          const input = el('input', { type: 'radio', name: `dq-${q.id}`, id, value });
          input.checked = (answers[q.id] ?? 'unknown') === value;
          input.addEventListener('change', () => {
            answers[q.id] = value;
            redraw();
          });
          return el('label', { for: id, class: 'choice' }, input, label);
        }),
      ),
      el('p', { class: 'muted' }, q.why, q.source ? el('span', { class: 'source', 'data-tip': rules.citations[q.source] ?? q.source, tabindex: '0' }, ` [${q.source}]`) : ''),
      hints[q.id] ? el('p', { class: 'hint' }, `현재 데이터: ${hints[q.id].text}`) : '',
    ),
  );

  const result = diagnose(answers, rules);
  const v = result.verdict;
  const resultPanel = el('div', { class: `panel verdict${v ? ` lv${v.level}` : ''}`, role: 'status' },
    v
      ? el('div', {}, levelChip(v.level, rules, { class: 'big' }), ' ', el('strong', { class: 'verdict-label' }, v.label), el('span', { class: 'muted' }, ` (점수 ${result.score}, 답한 질문 ${result.answered}개)`))
      : el('div', { class: 'muted' }, '질문에 답하면 판정이 나옵니다.'),
    v ? el('p', {}, v.advice) : '',
    result.reasons.length ? el('ul', {}, ...result.reasons.map((r) => el('li', {}, `${r.delta > 0 ? '+' : ''}${r.delta} `, r.text))) : '',
    el('p', { class: 'msg' }, cfg.disclaimer),
  );

  container.replaceChildren(
    el('p', { ...tipAttrs(g, 'diagnose'), class: 'msg' }, '통신·레이더·GNSS 장애가 생겼을 때, 우주기상 때문인지 적의 전파 방해(재밍)인지 가려 보는 점검표입니다.'),
    el('div', { class: 'row' },
      el('button', {
        onclick: () => {
          for (const [id, h] of Object.entries(hints)) answers[id] = h.answer;
          redraw();
        },
      }, '현재 데이터로 제안 채우기'),
      el('button', {
        onclick: () => {
          for (const k of Object.keys(answers)) delete answers[k];
          redraw();
        },
      }, '모두 지우기'),
    ),
    resultPanel,
    ...questions,
  );
}
