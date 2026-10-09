// 탭1 지휘관 브리핑(PRD 6장): 종합 신호등, 한 줄 판단, R/S/G 현재·예보, 한반도 주·야간, X선·Kp 그래프
import { el, levelChip } from '../format.js';
import { tipAttrs } from '../tooltip.js';
import { drawCharts } from './charts.js';

const pctText = (v) => (v === null || v === undefined ? '-' : `${v}%`);

function scaleCard(g, key, title, value, detailKey, detail) {
  return el('div', { class: 'panel card' },
    el('div', tipAttrs(g, key), title),
    el('div', { class: 'value' }, value === null || value === undefined ? '-' : `${key}${value}`),
    el('div', { ...tipAttrs(g, detailKey), class: 'muted' }, detail),
  );
}

function forecastTable(g, forecast) {
  if (!forecast.length) return el('p', { class: 'msg' }, '3일 예보 없음');
  const th = (key, label) => el('th', tipAttrs(g, key), label);
  return el('div', { class: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {}, th('forecast3', '날짜(UTC)'), th('R12', 'R1~R2'), th('R35', 'R3 이상'), th('S1', 'S1 이상'), th('Gmax', '최대 G'))),
      el('tbody', {},
        ...forecast.map((d) =>
          el('tr', {},
            el('td', {}, d.dateUtc.slice(5)),
            el('td', {}, pctText(d.R12pct)),
            el('td', {}, pctText(d.R35pct)),
            el('td', {}, pctText(d.S1pct)),
            el('td', {}, d.Gmax === null || d.Gmax === undefined ? '-' : `G${d.Gmax}`),
          ),
        ),
      ),
    ),
  );
}

export function renderBrief(container, { state, result, rules, glossary: g }) {
  const m = state.metrics;
  const k = state.korea;
  const xrayCanvas = el('canvas', { 'aria-label': '최근 24시간 X선 그래프' });
  const kpCanvas = el('canvas', { 'aria-label': '최근 7일 Kp 그래프' });

  container.replaceChildren(
    el('div', { class: `panel signal lv${result.overall}` },
      levelChip(result.overall, rules, { ...tipAttrs(g, 'overall', g.terms[`level${result.overall}`]), class: 'big' }),
      el('div', { ...tipAttrs(g, 'headline'), class: 'headline' }, result.headline),
    ),
    el('div', { class: 'cards' },
      scaleCard(g, 'R', 'R 전파두절', state.scales.R, 'xray', `X선 ${m.xrayClass ?? '-'}`),
      scaleCard(g, 'S', 'S 태양복사', state.scales.S, 'pfu', `양성자 ${m.protonPfu ?? '-'} pfu`),
      scaleCard(g, 'G', 'G 지자기', state.scales.G, 'Kp', `Kp ${m.kp ?? '-'}`),
    ),
    el('div', { class: 'panel' },
      el('div', tipAttrs(g, 'daynight'),
        `한반도(대전) ${k.isDaytime ? '주간' : '야간'} · 일출 ${k.sunriseKst} · 일몰 ${k.sunsetKst} KST`,
        el('span', { class: 'muted' }, k.sunSource === 'kasi' ? ' (한국천문연구원)' : ' (내장 계산)'),
      ),
    ),
    el('div', { class: 'panel' }, el('div', tipAttrs(g, 'forecast3'), 'NOAA 3일 예보'), forecastTable(g, state.forecast)),
    el('div', { class: 'charts' },
      el('div', { class: 'panel' }, el('div', tipAttrs(g, 'chartXray'), 'X선 최근 24시간(KST)'), el('div', { class: 'chart-box' }, xrayCanvas)),
      el('div', { class: 'panel' }, el('div', tipAttrs(g, 'chartKp'), 'Kp 최근 7일(KST)'), el('div', { class: 'chart-box' }, kpCanvas)),
    ),
  );
  if (!drawCharts(xrayCanvas, kpCanvas, state, rules)) {
    for (const c of [xrayCanvas, kpCanvas]) c.replaceWith(el('p', { class: 'msg' }, '그래프 라이브러리를 불러오지 못했습니다.'));
  }
}
