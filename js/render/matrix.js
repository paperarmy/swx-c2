// 탭2 영향 매트릭스(PRD 6장, 5.5): 9개 체계 × 현재·6시간·24시간·3일·4~27일.
// 칸을 누르면 근거 규칙·원인 지표·출처를 보여준다. 확률에서 나온 칸은 점선.
import { el, levelChip } from '../format.js';
import { tipAttrs } from '../tooltip.js';
import { COLUMNS } from '../engine.js';

let selected = null; // { sysId, col } — 다시 그려도 선택 유지

function defaultSelection(result) {
  const top = result.systems.find((s) => s.level === result.overall) ?? result.systems[0];
  return { sysId: top.id, col: 'now' };
}

function detail(result, rules, g) {
  const sys = result.systems.find((s) => s.id === selected.sysId);
  const cell = sys.cells[selected.col];
  return el('div', { class: 'panel detail', role: 'status' },
    el('div', {}, el('strong', {}, `${sys.name} · ${rules.horizonLabels[selected.col]}`), ' ', levelChip(cell.level, rules, tipAttrs(g, `level${cell.level}`))),
    selected.col === 'now' ? el('p', {}, sys.message) : null,
    cell.probabilistic ? el('p', { ...tipAttrs(g, 'probCell'), class: 'muted' }, '확률 예보에서 나온 판단') : null,
    cell.reasons.length
      ? el('ul', {}, ...cell.reasons.map((r) => el('li', {}, r.text, ' ', el('span', { class: 'source' }, `[${r.source}]`))))
      : el('p', { class: 'muted' }, '해당 원인 없음'),
  );
}

export function renderMatrix(container, ctx, handlers) {
  const { result, rules, glossary: g, options } = ctx;
  if (!selected || !result.systems.some((s) => s.id === selected.sysId)) selected = defaultSelection(result);
  const redraw = () => renderMatrix(container, ctx, handlers);

  const toggle = el('input', { type: 'checkbox', id: 'low-alt' });
  toggle.checked = Boolean(options.lowAltitudeOps);
  toggle.addEventListener('change', () => handlers.onToggleLowAlt(toggle.checked));

  const head = el('tr', {}, el('th', tipAttrs(g, 'level'), '체계'), ...COLUMNS.map((c) => el('th', tipAttrs(g, c), rules.horizonLabels[c])));
  const rows = result.systems.map((sys) =>
    el('tr', {},
      el('th', { scope: 'row' }, sys.name, ...sys.badges.map((b) => el('span', { ...tipAttrs(g, 'regional'), class: 'badge small' }, b))),
      ...COLUMNS.map((col) => {
        const cell = sys.cells[col];
        const isSel = selected.sysId === sys.id && selected.col === col;
        return el('td', {},
          el('button', {
            class: `cell lv${cell.level}${cell.probabilistic ? ' prob' : ''}${isSel ? ' selected' : ''}`,
            'aria-pressed': String(isSel),
            'data-tip': `${sys.name} · ${rules.horizonLabels[col]}: ${cell.label}${cell.probabilistic ? ' (확률 예보)' : ''}. 누르면 근거를 봅니다.`,
            onclick: () => {
              selected = { sysId: sys.id, col };
              redraw();
            },
          }, cell.label),
        );
      }),
    ),
  );

  container.replaceChildren(
    el('div', { class: 'row matrix-tools' },
      el('label', { ...tipAttrs(g, 'lowAlt'), for: 'low-alt', class: 'toggle' }, toggle, ' 저고도 운용·발사 국면'),
      el('span', { ...tipAttrs(g, 'probCell'), class: 'legend' }, el('span', { class: 'cell prob lv1 mini' }, '점선'), ' 확률 예보'),
    ),
    el('div', { class: 'table-wrap' }, el('table', { class: 'matrix' }, el('thead', {}, head), el('tbody', {}, ...rows))),
    detail(result, rules, g),
  );
}
