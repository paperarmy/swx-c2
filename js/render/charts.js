// 탭1 미니 그래프(Chart.js, CDN 전역 window.Chart). Chart.js를 못 받으면 그래프만 생략한다.
import { kpToG } from '../engine.js';

const charts = new Map();
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const kstLabel = (iso, withDate) => {
  const s = new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString();
  return withDate ? `${s.slice(5, 10)} ${s.slice(11, 13)}시` : s.slice(11, 16);
};

function draw(canvas, config) {
  charts.get(canvas)?.destroy();
  charts.set(canvas, new window.Chart(canvas, config));
}

// 로그 눈금을 플레어 등급 글자로: 1e-8 A, 1e-7 B, 1e-6 C, 1e-5 M, 1e-4 X, 1e-3 X10. 사이 눈금은 비운다.
const XRAY_CLASS_TICKS = { '-8': 'A', '-7': 'B', '-6': 'C', '-5': 'M', '-4': 'X', '-3': 'X10' };
function xrayTick(value) {
  const exp = Math.log10(value);
  return Math.abs(exp - Math.round(exp)) < 1e-6 ? XRAY_CLASS_TICKS[String(Math.round(exp))] ?? '' : '';
}

const refLine = (label, value, n, color) => ({
  type: 'line', label, data: Array(n).fill(value), borderColor: color, borderDash: [6, 4], borderWidth: 1, pointRadius: 0,
});

// 단계 색: G1~2 → I, G3 → II, G4~5 → III (rules.scaleToLevel)
const levelColor = (kp, rules) => {
  const lv = rules.scaleToLevel[String(kpToG(kp, rules))];
  return lv ? css(`--lv${lv}`) : css('--muted');
};

export function drawCharts(xrayCanvas, kpCanvas, state, rules) {
  if (!window.Chart) return false;
  const text = css('--text');
  const grid = css('--border');
  const muted = css('--muted');
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: muted, maxTicksLimit: 6 }, grid: { color: grid } } },
  };

  const xs = state.series?.xray ?? [];
  draw(xrayCanvas, {
    type: 'line',
    data: {
      labels: xs.map((p) => kstLabel(p.timeUtc)),
      datasets: [
        { label: 'X선 W/m²', data: xs.map((p) => p.flux), borderColor: text, borderWidth: 1.5, pointRadius: 0 },
        ...rules.chartRefs.xray.map((r) => refLine(r.label, r.value, xs.length, muted)),
      ],
    },
    options: {
      ...base,
      scales: {
        ...base.scales,
        y: { type: 'logarithmic', min: 1e-8, max: 1e-3, ticks: { color: muted, callback: xrayTick }, grid: { color: grid } },
      },
    },
  });

  const ks = state.series?.kp ?? [];
  draw(kpCanvas, {
    type: 'bar',
    data: {
      labels: ks.map((p) => kstLabel(p.timeUtc, true)),
      datasets: [
        { type: 'bar', label: 'Kp', data: ks.map((p) => p.kp), backgroundColor: ks.map((p) => levelColor(p.kp, rules)) },
        ...rules.chartRefs.kp.map((r) => refLine(r.label, r.value, ks.length, muted)),
      ],
    },
    options: { ...base, scales: { ...base.scales, y: { min: 0, max: 9, ticks: { color: muted, stepSize: 1 }, grid: { color: grid } } } },
  });
  return true;
}
