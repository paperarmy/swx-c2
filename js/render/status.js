// 상단 공통 표시줄(PRD 6장): 모드·기준 시각·데이터 상태 + 4중 표시(NOAA · 우주환경센터 · 국가 위기경보 · SWx-C2)
import { el, fmtKst, levelChip, MODE_LABEL } from '../format.js';
import { tipAttrs } from '../tooltip.js';

export function renderStatus(container, { state, result, rules, glossary }) {
  const g = glossary;
  const ok = state.sources.filter((s) => s.ok).length;
  const failed = state.sources.filter((s) => !s.ok && !s.note);
  const failTip = failed.length ? `지연·실패: ${failed.map((s) => `${s.id}(${s.error ?? '응답 없음'})`).join(', ')}` : '';
  const { R, S, G } = state.scales;
  const v = (x) => (x === null || x === undefined ? '-' : x);

  container.replaceChildren(
    el('div', { class: 'status-row' },
      el('span', { ...tipAttrs(g, 'mode'), class: `badge mode-${state.mode}` }, MODE_LABEL[state.mode] ?? state.mode),
      el('span', tipAttrs(g, 'asOf'), '기준 ', el('strong', {}, fmtKst(state.asOfUtc))),
      el('span', { ...tipAttrs(g, 'sources', failTip), class: failed.length ? 'warn' : '' },
        `원천 ${ok}/${state.sources.length} 정상${failed.length ? ' · 일부 데이터 지연' : ''}`),
      el('span', { class: 'dots' },
        ...state.sources.map((s) =>
          el('span', tipAttrs(g, s.id, s.ok ? '정상' : s.error ?? s.note ?? ''), el('span', { class: `dot ${s.ok ? 'ok' : 'fail'}` }), s.id),
        ),
      ),
    ),
    el('div', { class: 'status-row quad' },
      el('span', tipAttrs(g, 'noaa'), 'NOAA ', el('strong', {}, `R${v(R)} S${v(S)} G${v(G)}`)),
      el('span', tipAttrs(g, 'kasa'), '우주환경센터 경보 ', el('span', { class: 'muted' }, '미연동')),
      el('span', tipAttrs(g, 'national'), '국가 위기경보 ', el('span', { class: 'muted' }, '미연동')),
      el('span', tipAttrs(g, 'swxc2'), 'SWx-C2 ', levelChip(result.overall, rules)),
    ),
    ...(result.notices.length ? [el('div', { class: 'msg' }, result.notices.join(' · '))] : []),
  );
}
