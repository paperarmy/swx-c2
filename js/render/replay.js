// 탭5 과거 사례 재현(PRD 6장·12.5): 관측자료 재생 + 국가 경보 시각 비교 + 사례로 배우기(가상 재구성)
import { el, fmtKst, levelChip } from '../format.js';
import { tipAttrs } from '../tooltip.js';
import { evaluate } from '../engine.js';
import { operationDay, overallTimeline, firstReach, kstToUtc } from '../replay.js';

// 사례 데이터가 바뀌지 않는 한 타임라인·첫 도달 시각은 한 번만 계산한다.
const memo = new WeakMap();
function analysis(frames, rules, options) {
  const key = `${options.lowAltitudeOps}`;
  const m = memo.get(frames) ?? {};
  if (!m[key]) {
    m[key] = { timeline: overallTimeline(frames, rules, options), ii: firstReach(frames, rules, 2, options), iii: firstReach(frames, rules, 3, options) };
    memo.set(frames, m);
  }
  return m[key];
}

const sourceTags = (tags, rules) =>
  el('div', { class: 'source' }, '근거: ', ...tags.flatMap((t, i) => [i ? ', ' : '', el('span', { 'data-tip': rules.citations[t] ?? t, tabindex: '0' }, t)]));

function compareTable(c, frames, a, rules, g) {
  const levelAt = (utc) => {
    let idx = -1;
    frames.forEach((f, i) => {
      if (Date.parse(f.asOfUtc) <= Date.parse(utc)) idx = i;
    });
    return idx < 0 ? null : a.timeline[idx];
  };
  const rows = [
    ...(a.ii ? [{ t: a.ii.asOfUtc, label: 'SWx-C2 첫 II 대비', who: 'swx', note: a.ii.headline }] : []),
    ...(a.iii ? [{ t: a.iii.asOfUtc, label: 'SWx-C2 첫 III 조치', who: 'swx', note: a.iii.headline }] : []),
    ...c.officialEvents.map((e) => ({ t: kstToUtc(e.timeKst), label: e.label, who: e.kind, note: '' })),
  ].sort((x, y) => x.t.localeCompare(y.t));
  return el('div', { class: 'panel' },
    el('div', tipAttrs(g, 'nationalCompare'), '국가 경보 시각과 SWx-C2 판정 비교(KST)'),
    el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, '시각'), el('th', {}, '내용'), el('th', {}, '그 시점 SWx-C2'))),
        el('tbody', {},
          ...rows.map((r) => {
            const lv = r.who === 'swx' ? null : levelAt(r.t);
            return el('tr', { class: r.who === 'swx' ? 'swx-row' : '' },
              el('td', {}, fmtKst(r.t)),
              el('td', {}, r.label, r.note ? el('div', { class: 'muted' }, r.note) : ''),
              el('td', {}, lv === null ? '' : levelChip(lv, rules)),
            );
          }),
        ),
      ),
    ),
    el('p', { class: 'msg' }, c.officialNote),
    el('p', { class: 'msg' },
      '주의: 재현은 확정 Kp와 3시간 간격 자료라 실시간 판정보다 정확하고 거칩니다. 국가 위기경보는 재난 기준(4단계부터), SWx-C2는 작전 대비 기준(3등급부터)이라 비교 대상의 기준이 다릅니다.'),
  );
}

function scenarioCard(sc, rules, g, onScenario, active) {
  return el('div', { class: `panel case${active ? ' active' : ''}` },
    el('div', {}, el('strong', {}, sc.title)),
    el('p', {}, sc.summary),
    el('p', {}, el('span', { class: 'badge' }, '교훈'), ' ', sc.lesson),
    el('p', { ...tipAttrs(g, 'scenario'), class: 'muted' }, `가상 재구성: ${sc.hypothetical}`),
    sourceTags(sc.sources, rules),
    el('div', { class: 'row' }, el('button', { class: 'primary', onclick: () => onScenario(sc) }, '이 조건으로 지금 규칙 판정 보기')),
  );
}

export function renderReplay(container, ctx, replay, handlers) {
  const { rules, glossary: g, options } = ctx;
  if (!replay.cases) {
    container.replaceChildren(el('div', { class: 'panel skeleton' }, '재현 데이터를 불러오는 중…'));
    return;
  }
  const c = replay.cases.replays[0];
  const parts = [];

  if (replay.frames) {
    const frames = replay.frames;
    const i = replay.index;
    const a = analysis(frames, rules, options);
    const r = evaluate(frames[i], rules, options);
    const slider = el('input', { type: 'range', min: '0', max: String(frames.length - 1), value: String(i), 'aria-label': '재현 시점' });
    slider.addEventListener('input', () => handlers.onSeek(Number(slider.value)));

    parts.push(
      el('div', { class: 'panel' },
        el('div', {}, el('strong', {}, c.title)),
        el('p', {}, c.summary),
        el('p', {}, el('span', { class: 'badge' }, '교훈'), ' ', c.lesson),
        sourceTags(c.sources, rules),
      ),
      el('div', { class: 'panel player' },
        el('div', { class: 'row' },
          el('button', { class: 'primary', onclick: replay.playing ? handlers.onPause : handlers.onPlay }, replay.playing ? '일시정지' : '재생'),
          ...['1x', '10x'].map((s) => el('button', { 'aria-pressed': String(replay.speed === s), onclick: () => handlers.onSpeed(s) }, s)),
          replay.active ? el('button', { onclick: handlers.onExit }, '실시간으로 돌아가기') : '',
        ),
        slider,
        el('div', { class: 'player-now' },
          el('span', { ...tipAttrs(g, 'operationDay'), class: 'badge' }, `가상 작전 D+${operationDay(frames, i)}일`),
          ' ', el('strong', {}, fmtKst(frames[i].asOfUtc)), ' ',
          levelChip(r.overall, rules), ' ', r.headline,
        ),
        el('div', { ...tipAttrs(g, 'timeline'), class: 'timeline', role: 'list' },
          ...a.timeline.map((lv, k) =>
            el('button', {
              class: `tl lv${lv}${k === i ? ' selected' : ''}`,
              'aria-label': `${fmtKst(frames[k].asOfUtc)} ${rules.levels[lv]}`,
              'data-tip': `${fmtKst(frames[k].asOfUtc)} · ${rules.levels[lv]}`,
              onclick: () => handlers.onSeek(k),
            }),
          ),
        ),
        el('p', { class: 'msg' }, '재생하거나 시점을 고르면 탭1~3이 그 시점 데이터로 바뀝니다. 상단에 "재현" 표시가 나타납니다.'),
      ),
      compareTable(c, frames, a, rules, g),
    );
  } else {
    parts.push(el('div', { class: 'panel skeleton' }, '재현 데이터를 불러오는 중…'));
  }

  parts.push(
    el('h3', tipAttrs(g, 'scenario'), '사례로 배우기 — 그때 그 조건을 지금 규칙으로 판정하면?'),
    el('div', { class: 'cards cases' }, ...replay.cases.scenarios.map((sc) => scenarioCard(sc, rules, g, handlers.onScenario, replay.scenarioId === sc.id))),
  );
  container.replaceChildren(...parts);
}
