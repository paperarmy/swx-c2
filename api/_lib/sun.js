// 일출·일몰 내장 계산(D7 대체). 미 해군천문대 Almanac for Computers(1990) 알고리즘, 오차 약 ±2분.
// 한반도 기준이므로 표시 시간대는 KST(UTC+9) 고정이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ZENITH = 90.833; // 대기 굴절·태양 반지름을 반영한 공식 일출·일몰 천정각
const RAD = Math.PI / 180;

const norm = (x, m) => ((x % m) + m) % m;
const pad = (n) => String(n).padStart(2, '0');

export function kstDate(nowMs) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstMinutesOfDay(nowMs) {
  const d = new Date(nowMs + KST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const hhmmToMinutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function dayOfYear(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// 반환: 해당 현지 일자의 일출(rising) 또는 일몰 UT 시각(시간 단위). 극야·백야면 null.
function eventUtHours(n, lat, lon, rising) {
  const lngHour = lon / 15;
  const t = n + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = norm(M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634, 360);
  let RA = norm(Math.atan(0.91764 * Math.tan(L * RAD)) / RAD, 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(ZENITH * RAD) - sinDec * Math.sin(lat * RAD)) / (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / RAD : Math.acos(cosH) / RAD) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return norm(T - lngHour, 24);
}

function utHoursToKst(ut) {
  const minutes = norm(Math.round((ut + 9) * 60), 1440);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// dateKst: "YYYY-MM-DD"(KST 일자) → { sunriseKst: "HH:MM", sunsetKst: "HH:MM" }
export function sunTimesKst(dateKst, lat, lon) {
  const n = dayOfYear(dateKst);
  const rise = eventUtHours(n, lat, lon, true);
  const set = eventUtHours(n, lat, lon, false);
  if (rise === null || set === null) throw new Error('일출·일몰 계산 불가(극지)');
  return { sunriseKst: utHoursToKst(rise), sunsetKst: utHoursToKst(set) };
}

export function isDaytimeAt(nowMs, sunriseKst, sunsetKst) {
  const m = kstMinutesOfDay(nowMs);
  return m >= hhmmToMinutes(sunriseKst) && m < hhmmToMinutes(sunsetKst);
}
