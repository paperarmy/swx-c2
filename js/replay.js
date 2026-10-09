// 탭5 과거 사례 재현(PRD 6장, P4). 순수 도우미 + 재생기.
import { evaluate } from './engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const SPEEDS = { '1x': 1500, '10x': 150 }; // 프레임(3시간)당 표시 시간(ms)

const kstDay = (iso) => Math.floor((Date.parse(iso) + KST_OFFSET_MS) / DAY_MS);

// 가상 "작전 D+n일": 첫 프레임의 KST 날짜를 D+0으로 본다.
export function operationDay(frames, i) {
  return kstDay(frames[i].asOfUtc) - kstDay(frames[0].asOfUtc);
}

// 프레임마다 종합 단계(타임라인 띠)
export function overallTimeline(frames, rules, options = {}) {
  return frames.map((f) => evaluate(f, rules, options).overall);
}

// 종합 단계가 처음 level 이상이 된 프레임. 없으면 null. 반환: { index, asOfUtc, headline }
export function firstReach(frames, rules, level, options = {}) {
  for (let i = 0; i < frames.length; i++) {
    const r = evaluate(frames[i], rules, options);
    if (r.overall >= level) return { index: i, asOfUtc: frames[i].asOfUtc, headline: r.headline };
  }
  return null;
}

// "2024-05-11 03:50"(KST) → UTC ISO
export const kstToUtc = (kst) => new Date(Date.parse(`${kst.replace(' ', 'T')}:00+09:00`)).toISOString().replace(/\.\d{3}Z$/, 'Z');

// 가상 재구성: 사례 조건(cases.json scenarios[].state)을 평온한 기본 상태에 덮어써 SwxState를 만든다.
export function scenarioState(sc) {
  const base = {
    asOfUtc: sc.asOfUtc,
    mode: 'replay',
    scenario: { id: sc.id, title: sc.title, hypothetical: sc.hypothetical },
    scales: { R: 0, S: 0, G: 0 },
    forecast: [],
    kpForecast: [],
    metrics: { xrayFlux: null, xrayClass: null, protonPfu: null, kp: null },
    korea: { lat: 36.35, lon: 127.38, isDaytime: true, sunriseKst: '06:30', sunsetKst: '18:30', sunSource: 'builtin' },
    srb: { active: false, lastAlertUtc: null, events: [] },
    history: { dailyMaxKp: [], sn27: null, f107_27: null },
    series: { xray: [], kp: [] },
    sources: [{ id: 'scenario', ok: true, fetchedAtUtc: null, note: '가상 재구성(관측자료 아님)' }],
  };
  const s = sc.state ?? {};
  return {
    ...base,
    scales: { ...base.scales, ...s.scales },
    metrics: { ...base.metrics, ...s.metrics },
    korea: { ...base.korea, ...s.korea },
    srb: s.srb === undefined ? base.srb : s.srb,
  };
}

// 재생기: 시간에 따라 index를 올리며 onFrame(i)를 부른다. 마지막 프레임에서 멈춘다.
export function createPlayer(length, onFrame) {
  let index = 0;
  let timer = null;
  let speed = '1x';
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    if (index >= length - 1) return stop();
    index++;
    if (index >= length - 1) stop(); // 마지막 프레임을 보여 줄 때는 이미 멈춘 상태로 알린다
    onFrame(index);
  };
  return {
    get index() {
      return index;
    },
    get playing() {
      return timer !== null;
    },
    get speed() {
      return speed;
    },
    seek(i) {
      index = Math.max(0, Math.min(length - 1, i));
      onFrame(index);
    },
    play() {
      if (index >= length - 1) {
        index = 0;
        onFrame(index);
      }
      stop();
      timer = setInterval(tick, SPEEDS[speed]);
    },
    pause: stop,
    setSpeed(s) {
      speed = s;
      if (timer) this.play();
    },
  };
}
