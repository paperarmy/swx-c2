import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, sunTimesKst, isDaytimeAt } from '../api/_lib/sun.js';

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const near = (actual, expected, tol = 3) =>
  assert.ok(Math.abs(minutes(actual) - minutes(expected)) <= tol, `${actual} vs ${expected} (±${tol}분)`);

const SEOUL = [37.5665, 126.978];

test('내장 일출·일몰: 서울 하지·동지(천문연 공표값 ±3분)', () => {
  const summer = sunTimesKst('2024-06-21', ...SEOUL);
  near(summer.sunriseKst, '05:11');
  near(summer.sunsetKst, '19:57');
  const winter = sunTimesKst('2024-12-21', ...SEOUL);
  near(winter.sunriseKst, '07:43');
  near(winter.sunsetKst, '17:17');
});

test('kstDate: UTC 15시 이후는 KST 다음 날', () => {
  assert.equal(kstDate(Date.parse('2026-10-09T14:59:00Z')), '2026-10-09');
  assert.equal(kstDate(Date.parse('2026-10-09T15:00:00Z')), '2026-10-10');
});

test('isDaytimeAt: KST로 바꿔 일출·일몰과 비교', () => {
  assert.equal(isDaytimeAt(Date.parse('2026-10-09T04:50:00Z'), '06:30', '18:00'), true); // 13:50 KST
  assert.equal(isDaytimeAt(Date.parse('2026-10-09T12:00:00Z'), '06:30', '18:00'), false); // 21:00 KST
  assert.equal(isDaytimeAt(Date.parse('2026-10-08T21:29:00Z'), '06:30', '18:00'), false); // 06:29 KST
  assert.equal(isDaytimeAt(Date.parse('2026-10-08T21:30:00Z'), '06:30', '18:00'), true); // 06:30 KST
});
