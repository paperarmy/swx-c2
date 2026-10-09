import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../api/_lib/transform.js';
import { sample, readSample, SAMPLE_NOW, KASI_XML } from './helpers/mock-fetch.js';

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

test('toUtcIso: Z 없는 NOAA 시각과 공백 구분 경보 시각을 UTC ISO로', () => {
  assert.equal(t.toUtcIso('2026-10-02T00:00:00'), '2026-10-02T00:00:00Z');
  assert.equal(t.toUtcIso('2026-10-09T04:48:00Z'), '2026-10-09T04:48:00Z');
  assert.equal(t.toUtcIso('2026-10-09 01:29:51.387'), '2026-10-09T01:29:51Z'); // 초 단위로 통일
  assert.throws(() => t.toUtcIso('not a time'));
});

test('xrayClass: 등급 경계와 나눗셈 오차', () => {
  assert.equal(t.xrayClass(1.2e-5), 'M1.2');
  assert.equal(t.xrayClass(1.3e-5), 'M1.3');
  assert.equal(t.xrayClass(9.99e-7), 'B9.9');
  assert.equal(t.xrayClass(1e-6), 'C1.0');
  assert.equal(t.xrayClass(2.5e-4), 'X2.5');
  assert.equal(t.xrayClass(1.2e-3), 'X12.0');
  assert.equal(t.xrayClass(null), null);
});

test('D1 parseScales: 현재 등급과 3일 예보', () => {
  const { scales, forecast } = t.parseScales(sample('d1-noaa-scales.json'));
  assert.deepEqual(scales, { R: 0, S: 0, G: 0 });
  assert.equal(forecast.length, 3);
  assert.deepEqual(forecast[0], { dateUtc: '2026-10-09', R12pct: 55, R35pct: 10, S1pct: 10, Gmax: 2 });
  assert.deepEqual(forecast.map((f) => f.dateUtc), ['2026-10-09', '2026-10-10', '2026-10-11']);
  assert.throws(() => t.parseScales({}), /D1/);
});

test('D2 parseKpObserved: 객체 배열, Kp 대문자 필드', () => {
  const rows = t.parseKpObserved(sample('d2-noaa-planetary-k-index.json'));
  assert.deepEqual(rows[0], { timeUtc: '2026-10-02T00:00:00Z', kp: 1 });
  assert.ok(rows.every((r) => ISO_Z.test(r.timeUtc) && typeof r.kp === 'number'));
});

test('D3 parseKpForecast: observed 행은 제외하고 추정·예보만', () => {
  const raw = sample('d3-noaa-planetary-k-index-forecast.json');
  const rows = t.parseKpForecast(raw);
  assert.equal(rows.length, raw.filter((r) => r.observed !== 'observed').length);
  assert.deepEqual(rows.at(-1), { timeUtc: '2026-10-12T00:00:00Z', kp: 2.33 });
});

test('D4 parseXray: 장파 채널 최신값·등급·10분 간격 시계열', () => {
  const x = t.parseXray(sample('d4-xrays-1-day.json'));
  assert.equal(x.xrayClass, 'C1.3');
  assert.ok(Math.abs(x.xrayFlux - 1.3006e-6) < 1e-9);
  assert.ok(x.series.length > 100 && x.series.length <= 146);
  assert.equal(x.series.at(-1).timeUtc, '2026-10-09T04:48:00Z');
  assert.ok(x.series.slice(0, -1).every((r) => r.timeUtc[15] === '0'));
});

test('D5 parseProton, D6 parseKp1m: 최신값', () => {
  const p = t.parseProton(sample('d5-integral-protons-1-day.json'));
  assert.ok(typeof p === 'number' && p >= 0);
  assert.equal(t.parseKp1m(sample('d6-planetary-k-index-1m.json')), 2);
});

test('D13 parseSrb: 전파 경보만, 3시간 안이면 진행 중', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const alert = (id, issued, title) => ({ product_id: id, issue_datetime: issued, message: `Code: X\r\nSerial Number: 1\r\n\r\n${title}\nBegin Time: ...` });
  const raw = [
    alert('K04A', '2026-10-09 04:00:00.000', 'ALERT: Geomagnetic K-index of 4'),
    alert('TIIA', '2026-10-09 03:30:00.000', 'ALERT: Type II Radio Emission'),
    alert('TIVA', '2026-10-07 03:30:00.000', 'ALERT: Type IV Radio Emission'),
  ];
  const srb = t.parseSrb(raw, now);
  assert.equal(srb.active, true);
  assert.equal(srb.lastAlertUtc, '2026-10-09T03:30:00Z');
  assert.deepEqual(srb.events.map((e) => e.productId), ['TIIA']);

  const later = t.parseSrb(raw, Date.parse('2026-10-09T07:00:00Z'));
  assert.equal(later.active, false);
  assert.equal(later.lastAlertUtc, '2026-10-09T03:30:00Z');

  const fromSample = t.parseSrb(sample('d13-alerts.json'), SAMPLE_NOW);
  assert.equal(typeof fromSample.active, 'boolean');
  assert.ok(fromSample.events.every((e) => /Radio/.test(e.title)));
});

test('D7 parseKasi: 출몰시각 XML과 오류 응답', () => {
  assert.deepEqual(t.parseKasi(readSample('d7-kasi-riseset.xml')), { sunriseKst: '06:32', sunsetKst: '18:03' }); // 실응답
  assert.deepEqual(t.parseKasi(KASI_XML), { sunriseKst: '06:29', sunsetKst: '18:06' });
  assert.throws(
    () => t.parseKasi('<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>'),
    /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/,
  );
});

test('GFZ parseGfz + dailyMaxKp: 2024년 5월 폭풍', () => {
  const rows = t.parseGfz(sample('d8-gfz-kp-2024-05.json'), 'Kp');
  assert.equal(rows.length, 40);
  assert.deepEqual(rows[0], { timeUtc: '2024-05-09T00:00:00Z', value: 0.667 });
  const daily = t.dailyMaxKp(rows.map((r) => ({ timeUtc: r.timeUtc, kp: r.value })));
  assert.equal(daily.length, 5);
  assert.deepEqual(daily.find((d) => d.dateUtc === '2024-05-11'), { dateUtc: '2024-05-11', kp: 9 });
  assert.throws(() => t.parseGfz({}, 'Kp'), /GFZ Kp/);
});

test('dailyMaxKp는 최근 days일만, recentMean은 최근 n개 평균', () => {
  const kp = Array.from({ length: 70 }, (_, i) => ({ timeUtc: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), kp: i % 9 }));
  const daily = t.dailyMaxKp(kp, 60);
  assert.equal(daily.length, 60);
  assert.equal(daily[0].dateUtc, '2026-01-11');
  const vals = Array.from({ length: 30 }, (_, i) => ({ value: i + 1 }));
  assert.equal(t.recentMean(vals, 27), 17);
  assert.equal(t.recentMean([], 27), null);
});
