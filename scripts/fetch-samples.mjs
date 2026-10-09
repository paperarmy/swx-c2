// 원천 API 응답을 samples/에 원본 그대로 저장한다(PRD 3.1, P0).
// 사용: node scripts/fetch-samples.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCES, gfzUrl } from '../api/_lib/sources.js';

const OUT = new URL('../samples/', import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1000;

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const now = Date.now();
const start60 = `${day(now - 60 * DAY_MS)}T00:00:00Z`;
const end = `${day(now)}T00:00:00Z`;

const targets = {
  'd1-noaa-scales.json': SOURCES.D1,
  'd2-noaa-planetary-k-index.json': SOURCES.D2,
  'd3-noaa-planetary-k-index-forecast.json': SOURCES.D3,
  'd4-xrays-1-day.json': SOURCES.D4,
  'd5-integral-protons-1-day.json': SOURCES.D5,
  'd6-planetary-k-index-1m.json': SOURCES.D6,
  'd13-alerts.json': SOURCES.D13,
  'd8-gfz-kp-2024-05.json': gfzUrl('Kp', '2024-05-09T00:00:00Z', '2024-05-13T23:59:59Z'),
  'd10-gfz-kp-60d.json': gfzUrl('Kp', start60, end),
  'd11-gfz-sn-60d.json': gfzUrl('SN', start60, end),
  'd11-gfz-fobs-60d.json': gfzUrl('Fobs', start60, end),
};

await mkdir(OUT, { recursive: true });

const results = await Promise.all(
  Object.entries(targets).map(async ([file, url]) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      await writeFile(new URL(file, OUT), body);
      return { file, ok: true, bytes: body.length };
    } catch (e) {
      return { file, ok: false, error: e.message, url };
    }
  }),
);

for (const r of results) {
  console.log(r.ok ? `OK    ${r.file} (${r.bytes} bytes)` : `FAIL  ${r.file} — ${r.error}\n      ${r.url}`);
}
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
