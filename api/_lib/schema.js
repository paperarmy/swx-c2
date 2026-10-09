// SwxState(PRD 3.2) 형식 검사. 외부 라이브러리 없이 필수 필드와 타입만 본다.
// 반환: 오류 문자열 배열(비어 있으면 통과).

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;
const MODES = ['live', 'fallback', 'replay'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v) => v === null || isNum(v);

export function checkSwxState(s) {
  const errors = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  const eachItem = (arr, name, check) => {
    if (!Array.isArray(arr)) return errors.push(`${name}: 배열이 아님`);
    arr.forEach((item, i) => check(item ?? {}, `${name}[${i}]`));
  };

  need(s && typeof s === 'object', 'SwxState가 객체가 아님');
  if (!s || typeof s !== 'object') return errors;

  need(UTC_ISO.test(s.asOfUtc), 'asOfUtc: UTC ISO 형식 아님');
  need(MODES.includes(s.mode), `mode: ${MODES.join('|')} 중 하나여야 함`);

  for (const k of ['R', 'S', 'G']) need(isNumOrNull(s.scales?.[k]), `scales.${k}: 숫자 또는 null`);

  eachItem(s.forecast, 'forecast', (f, n) => {
    need(DATE.test(f.dateUtc), `${n}.dateUtc: YYYY-MM-DD`);
    for (const k of ['R12pct', 'R35pct', 'S1pct', 'Gmax']) need(isNumOrNull(f[k]), `${n}.${k}: 숫자 또는 null`);
  });

  eachItem(s.kpForecast, 'kpForecast', (k, n) => {
    need(UTC_ISO.test(k.timeUtc), `${n}.timeUtc`);
    need(isNum(k.kp), `${n}.kp`);
  });

  for (const k of ['xrayFlux', 'protonPfu', 'kp']) need(isNumOrNull(s.metrics?.[k]), `metrics.${k}: 숫자 또는 null`);
  need(s.metrics?.xrayClass === null || typeof s.metrics?.xrayClass === 'string', 'metrics.xrayClass');

  need(isNum(s.korea?.lat) && isNum(s.korea?.lon), 'korea.lat/lon');
  need(typeof s.korea?.isDaytime === 'boolean', 'korea.isDaytime: boolean');
  need(HHMM.test(s.korea?.sunriseKst) && HHMM.test(s.korea?.sunsetKst), 'korea.sunriseKst/sunsetKst: HH:MM');

  if (s.srb !== null) {
    need(typeof s.srb?.active === 'boolean', 'srb.active: boolean');
    need(s.srb?.lastAlertUtc === null || UTC_ISO.test(s.srb?.lastAlertUtc), 'srb.lastAlertUtc');
  }

  eachItem(s.history?.dailyMaxKp, 'history.dailyMaxKp', (d, n) => {
    need(DATE.test(d.dateUtc), `${n}.dateUtc`);
    need(isNum(d.kp), `${n}.kp`);
  });
  need((s.history?.dailyMaxKp?.length ?? 0) <= 60, 'history.dailyMaxKp: 60일 초과');
  need(isNumOrNull(s.history?.sn27) && isNumOrNull(s.history?.f107_27), 'history.sn27/f107_27');

  eachItem(s.sources, 'sources', (src, n) => {
    need(typeof src.id === 'string', `${n}.id`);
    need(typeof src.ok === 'boolean', `${n}.ok`);
  });

  return errors;
}
