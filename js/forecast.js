// AI 장차 전망 계산(PRD 5.4, P2.5) — 순수 함수.
// config/forecast-model.json(scripts/train_outlook.py가 생성)의 계수로 D+1~27 G1+·G3+ 확률을 계산한다.
// 계산 순서는 train_outlook.py의 outlook_from_history()와 같아야 한다(T9: 소수 셋째 자리 일치).

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGETS = ['G1', 'G3'];

const addDays = (dateStr, n) => new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

function dayOfYear(dateStr) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return Math.round((t - Date.UTC(Number(dateStr.slice(0, 4)), 0, 1)) / DAY_MS) + 1;
}

// train_outlook.py kp_to_g와 같음(Kp 5-부터 G1, 9-는 G4). 재귀 기준선 조회용.
function kpToG(kp) {
  const g = Math.round(kp) - 4;
  return Math.max(0, Math.min(kp >= 9 - 1e-6 ? 5 : 4, g));
}

function bucketOf(h, model) {
  // 학습 스크립트의 BUCKETS와 같은 키("1-3", "4-13", "14-27")
  return Object.keys(model.basis.G1).find((k) => {
    const [lo, hi] = k.split('-').map(Number);
    return h >= lo && h <= hi;
  });
}

function predict(m, x) {
  let z = m.intercept;
  for (let i = 0; i < x.length; i++) z += ((x[i] - m.mean[i]) / m.std[i]) * m.coef[i];
  return 1 / (1 + Math.exp(-z));
}

// SwxState.history → [{ dateUtc, h, pG1, pG3, basisG1, basisG3, basis }]
// 기준일 = history.dailyMaxKp의 마지막 날짜.
export function outlookFromHistory(history, model) {
  const kp = new Map(history.dailyMaxKp.map((d) => [d.dateUtc, d.kp]));
  const dates = [...kp.keys()].sort();
  if (!dates.length) return [];
  const base = dates.at(-1);
  const kp3 = Math.max(...dates.slice(-3).map((d) => kp.get(d)));

  const out = [];
  for (let h = 1; h <= 27; h++) {
    const target = addDays(base, h);
    const k27 = kp.get(addDays(target, -27)) ?? null;
    const k54 = kp.get(addDays(target, -54)) ?? null;
    const doy = dayOfYear(target);
    const x = [k27, k54, kp3, h, history.sn27, history.f107_27, Math.sin((2 * Math.PI * doy) / 365.25), Math.cos((2 * Math.PI * doy) / 365.25)];
    const complete = x.every((v) => v !== null && v !== undefined && Number.isFinite(v));
    const bucket = bucketOf(h, model);
    const month = Number(target.slice(5, 7));

    const entry = { dateUtc: target, h };
    for (const name of TARGETS) {
      let basis = model.basis[name][bucket];
      let p;
      if (basis === 'ml' && complete) {
        p = predict(model.models[name], x);
      } else if (k27 !== null) {
        basis = 'recurrence';
        p = model.recurrence[name][Math.min(kpToG(k27), 3)];
      } else {
        basis = 'climatology'; // 이력이 모자라면 기후학 기준선
        p = model.climatology[name][month - 1];
      }
      entry[`p${name}`] = Number(p.toFixed(6));
      entry[`basis${name}`] = basis;
    }
    entry.basis = entry.basisG1 === entry.basisG3 ? entry.basisG1 : 'mixed';
    out.push(entry);
  }
  return out;
}

// 플레어(R3 이상) 일 기저확률: NOAA 척도 빈도를 27일 평균 흑점수 비율로 조정한 근사
export function rBaseline(history, model) {
  const r = model.rBaseline;
  if (history.sn27 === null || history.sn27 === undefined) return { pR3PerDay: null, basis: 'climatology' };
  const rate = (r.r3PerCycle / r.cycleDays) * (history.sn27 / r.meanSn);
  return { pR3PerDay: Number((1 - Math.exp(-rate)).toFixed(4)), basis: 'climatology' };
}

// 기간 중 1회 이상 발생 확률 = 1 − ∏(1 − p)  (PRD 6.3)
export function periodRisk(outlook, startDate, endDate, key = 'pG3') {
  const days = outlook.filter((e) => e.dateUtc >= startDate && e.dateUtc <= endDate);
  if (!days.length) return null;
  return 1 - days.reduce((acc, e) => acc * (1 - e[key]), 1);
}

// SwxState에 outlook·outlookSkill·rBaseline을 채운 새 객체를 돌려준다(입력은 바꾸지 않음).
export function withOutlook(state, model) {
  if (!model || !state.history) return state;
  return {
    ...state,
    outlook: outlookFromHistory(state.history, model),
    outlookSkill: {
      trainPeriod: model.trainPeriod,
      validPeriod: model.validPeriod,
      G1: model.skill.G1,
      G3: model.skill.G3,
      basis: model.basis,
    },
    rBaseline: rBaseline(state.history, model),
  };
}
