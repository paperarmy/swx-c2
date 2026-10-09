// 판단 엔진(PRD 5장, P2). evaluate(state, rules, options) — 순수 함수.
// 입력: SwxState(PRD 3.2), rules.json, 화면 토글(options.lowAltitudeOps)
// 출력: 종합 단계·한 줄 판단·체계별 칸(현재·6시간·24시간·3일·4~27일)과 근거
// 임계값·문구는 모두 rules에서 읽는다. 시각은 state.asOfUtc만 쓴다(Date.now 사용 금지).

const HOUR_MS = 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * HOUR_MS;
const KP_EPSILON = 0.01; // Kp 1/3 단위 표기(4.667 등)의 반올림 오차 흡수

export const COLUMNS = ['now', 'h6', 'h24', 'd3', 'd4_27'];

// ---------------------------------------------------------------- 척도 도우미
export function kpToG(kp, rules) {
  if (kp === null || kp === undefined) return null;
  return rules.kpToG.thresholds.filter((t) => kp >= t - KP_EPSILON).length;
}

const toLevel = (scale, rules) => rules.scaleToLevel[String(Math.min(5, Math.max(0, scale)))];

// 확률 규칙(horizonRules.R / S)으로 예보 하루치의 등급을 정한다. 반환: { scale, text } | null
function probScale(day, ruleList) {
  for (const r of ruleList) {
    const pct = day[r.field];
    if (pct !== null && pct !== undefined && pct >= r.minPct) {
      return { scale: r.scale, text: `${r.field.replace('pct', '')} 확률 ${pct}% (${day.dateUtc} UTC)` };
    }
  }
  return null;
}

const maxBy = (items, key) => items.reduce((best, x) => (best === null || x[key] > best[key] ? x : best), null);

// ---------------------------------------------------------------- 주·야간
const hhmm = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

// [startMs, endMs) 구간에 한반도 주간(KST 일출~일몰)이 조금이라도 있는가.
// 일출·일몰은 기준일 값을 구간 내 모든 날에 쓴다(하루 몇 분 차이는 무시).
export function hasDaylight(startMs, endMs, sunriseKst, sunsetKst) {
  const dayStartKst = Math.floor((startMs + KST_OFFSET_MS) / (24 * HOUR_MS)) * 24 * HOUR_MS - KST_OFFSET_MS;
  for (let d = dayStartKst; d < endMs; d += 24 * HOUR_MS) {
    const rise = d + hhmm(sunriseKst) * 60000;
    const set = d + hhmm(sunsetKst) * 60000;
    if (rise < endMs && set > startMs) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 칸별 입력(R·S·G) 만들기
// 각 칸: { daytime, R, S, G } — R/S/G는 { scale, level?, text, source, prob } 또는 null
function nowInputs(state, rules) {
  const { scales, metrics, korea } = state;
  const entry = (scale, text) => (scale === null || scale === undefined ? null : { scale, text, source: 'NOAA-scales', prob: false });
  const fmt = (v, digits) => (v === null || v === undefined ? '-' : Number(v).toFixed(digits));
  return {
    daytime: korea.isDaytime,
    R: entry(scales.R, `R${scales.R} (${metrics.xrayClass ?? 'X선 -'})`),
    S: entry(scales.S, `S${scales.S} (${fmt(metrics.protonPfu, 1)} pfu)`),
    G: entry(scales.G, `G${scales.G} (Kp ${fmt(metrics.kp, 2)})`),
  };
}

function windowInputs(state, rules, T, hours) {
  const end = T + hours * HOUR_MS;
  const hr = rules.horizonRules;

  // G: 구간과 겹치는 3시간 Kp 예보의 최대
  const kps = state.kpForecast.filter((k) => {
    const s = Date.parse(k.timeUtc);
    return s < end && s + 3 * HOUR_MS > T;
  });
  const top = maxBy(kps, 'kp');
  const G = top ? { scale: kpToG(top.kp, rules), text: `예보 Kp ${top.kp.toFixed(2)} (${top.timeUtc.slice(5, 16)} UTC)`, source: hr.forecastSource, prob: false } : null;

  // R·S: 구간이 걸친 UTC 일자의 확률
  const dates = new Set();
  for (let t = T; t < end; t += HOUR_MS) dates.add(new Date(t).toISOString().slice(0, 10));
  const days = state.forecast.filter((d) => dates.has(d.dateUtc));
  return {
    daytime: hasDaylight(T, end, state.korea.sunriseKst, state.korea.sunsetKst),
    G,
    R: bestProb(days, hr.R, hr.forecastSource),
    S: bestProb(days, hr.S, hr.forecastSource),
  };
}

function bestProb(days, ruleList, source) {
  const hits = days.map((d) => probScale(d, ruleList)).filter(Boolean);
  const top = maxBy(hits, 'scale');
  return top ? { ...top, source, prob: true } : null;
}

function threeDayInputs(state, rules, T) {
  const hr = rules.horizonRules;
  const today = new Date(T).toISOString().slice(0, 10);
  const days = state.forecast.filter((d) => d.dateUtc >= today);
  const gDays = days.filter((d) => d.Gmax !== null && d.Gmax !== undefined);
  const gTop = maxBy(gDays, 'Gmax');
  return {
    daytime: true, // 3일 구간에는 항상 주간이 포함된다
    G: gTop ? { scale: gTop.Gmax, text: `예보 최대 G${gTop.Gmax} (${gTop.dateUtc} UTC)`, source: hr.forecastSource, prob: false } : null,
    R: bestProb(days, hr.R, hr.forecastSource),
    S: bestProb(days, hr.S, hr.forecastSource),
  };
}

// 4~27일: AI 전망 확률이 임계를 넘으면 G 관련 체계를 I 관찰(상한)로. R·S는 예측하지 않는다.
function outlookInputs(state, rules) {
  const o = rules.horizonRules.outlook;
  const list = (state.outlook ?? []).filter((e) => e.h >= o.fromH && e.h <= o.toH);
  if (!list.length) return { daytime: null, G: null, R: null, S: null, missing: true };
  const g3 = maxBy(list, 'pG3');
  const g1 = maxBy(list, 'pG1');
  let G = null;
  if (g3.pG3 >= o.pG3) {
    G = { scale: 3, level: o.level, text: `D+${g3.h} G3 이상 확률 ${(g3.pG3 * 100).toFixed(0)}%`, source: o.source, prob: true };
  } else if (g1.pG1 >= o.pG1) {
    G = { scale: 1, level: o.level, text: `D+${g1.h} G1 이상 확률 ${(g1.pG1 * 100).toFixed(0)}%`, source: o.source, prob: true };
  }
  return { daytime: null, G, R: null, S: null };
}

// ---------------------------------------------------------------- 체계별 판정
function evaluateCell(sys, input, rules) {
  const cell = { level: 0, reasons: [], probabilistic: false };
  const contributions = [];
  for (const d of sys.drivers) {
    const e = input[d.scale];
    if (!e || e.scale === null || e.scale < d.minScale) continue;
    const level = Math.min(e.level ?? toLevel(e.scale, rules), toLevel(e.scale, rules));
    if (d.when === 'korea.isDaytime' && input.daytime === false) {
      cell.reasons.push({ text: `${e.text} · ${rules.texts.night}`, source: d.source ?? e.source });
      continue;
    }
    const suffix = d.when === 'korea.isDaytime' && input.daytime ? ' · 한반도 주간' : '';
    contributions.push({ level, prob: e.prob, reason: { text: e.text + suffix, source: e.source === 'NOAA-scales' ? d.source ?? e.source : e.source } });
  }
  return finalize(cell, contributions);
}

function finalize(cell, contributions) {
  for (const c of contributions) {
    cell.level = Math.max(cell.level, c.level);
    cell.reasons.push(c.reason);
  }
  const top = contributions.filter((c) => c.level === cell.level && c.level > 0);
  cell.probabilistic = top.length > 0 && top.every((c) => c.prob);
  return cell;
}

// 현재 칸에만 적용하는 특수 규칙(PRD 12.3): 태양전파폭발, 저고도 운용 토글
function applySpecialRules(sys, cell, state, rules, options, notices) {
  const srb = rules.specialRules.srb;
  if (srb.systems.includes(sys.id)) {
    if (state.srb === null || state.srb === undefined) {
      if (srb.unknownSystems.includes(sys.id)) {
        cell.reasons.push({ text: rules.texts.srbUnknown, source: srb.source });
        notices.add(rules.texts.srbUnknown);
      }
    } else if (state.srb.active && (!srb.requireDaytime || state.korea.isDaytime)) {
      const when = state.srb.lastAlertUtc ? ` (${state.srb.lastAlertUtc.slice(5, 16)} UTC)` : '';
      cell.level = Math.max(cell.level, srb.level);
      cell.reasons.push({ text: `${srb.text}${when} · 한반도 주간`, source: srb.source });
    }
  }

  const low = rules.specialRules.lowAltitude;
  if (options.lowAltitudeOps && low.systems.includes(sys.id) && (state.scales.G ?? 0) >= low.minG) {
    cell.level = Math.max(cell.level, low.level);
    cell.reasons.push({ text: `${low.text} · G${state.scales.G}`, source: low.source });
  }
}

function messageFor(sys, level, rules) {
  return sys.messages?.[String(level)] ?? rules.defaultMessages[String(level)] ?? '';
}

// ---------------------------------------------------------------- 진입점
export function evaluate(state, rules, options = {}) {
  const T = Date.parse(state.asOfUtc);
  const notices = new Set();

  const failed = (state.sources ?? []).filter((s) => !s.ok && !s.note).map((s) => s.id);
  if (failed.length) notices.add(`${rules.texts.dataDelay}: ${failed.join(', ')}`);

  const inputs = {
    now: nowInputs(state, rules),
    h6: windowInputs(state, rules, T, 6),
    h24: windowInputs(state, rules, T, 24),
    d3: threeDayInputs(state, rules, T),
    d4_27: outlookInputs(state, rules),
  };
  if (inputs.d4_27.missing) notices.add(rules.texts.outlookMissing);

  const systems = rules.systems.map((sys) => {
    const cells = {};
    for (const col of COLUMNS) cells[col] = evaluateCell(sys, inputs[col], rules);
    applySpecialRules(sys, cells.now, state, rules, options, notices);
    for (const col of COLUMNS) cells[col].label = rules.levels[cells[col].level];
    const level = cells.now.level;
    return {
      id: sys.id,
      name: sys.name,
      level,
      label: rules.levels[level],
      message: messageFor(sys, level, rules),
      reasons: cells.now.reasons,
      pace: sys.pace ?? null,
      badges: sys.badges ?? [],
      cells,
    };
  });

  const horizon = Object.fromEntries(COLUMNS.map((c) => [c, Math.max(0, ...systems.map((s) => s.cells[c].level))]));
  const overall = horizon.now;

  return {
    overall,
    overallLabel: rules.levels[overall],
    headline: headline(systems, overall, rules),
    systems,
    horizon,
    notices: [...notices],
    rulesVersion: rules.version,
  };
}

// 최고 단계 체계의 문구. 동률이면 rules.systems 순서(우선순위). 모두 정상이면 가장 가까운 미래 칸 안내.
function headline(systems, overall, rules) {
  if (overall > 0) {
    const top = systems.find((s) => s.level === overall);
    return `${top.name}: ${top.message}`;
  }
  for (const col of COLUMNS.slice(1)) {
    const s = systems.find((x) => x.cells[col].level > 0);
    if (s) return `${rules.texts.allClear}, ${rules.horizonLabels[col]} ${s.name} ${s.cells[col].label} 예상`;
  }
  return rules.texts.allClear;
}
