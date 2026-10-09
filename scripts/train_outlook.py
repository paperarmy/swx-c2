"""AI 장차 전망 모델 학습(PRD 5.4, P0).

D+1~27 각 날짜의 일 최대 Kp가 G1 이상·G3 이상일 확률을 로지스틱 회귀 2개로 예측한다.
학습 1996~2019(대상일 기준), 검증 2020~현재. 기준선: ① 기후학(대상 월) ② 27일 재귀.

사용: python -P scripts/train_outlook.py
입력: GFZ Kp·SN·F10.7(없으면 data-raw/gfz-hist/에 내려받음)
출력: config/forecast-model.json   브라우저(js/forecast.js)가 쓰는 계수·기준선·채택 결과
      reports/outlook-eval.md       평가 보고서
      tests/fixtures/outlook.json   JS 계산 검증용 입력·출력 5쌍(T9)

브라우저와 같은 결과를 내도록 예측은 sklearn이 아니라 내보낸 계수로 직접 계산한다(predict 함수).
"""
import datetime as dt
import json
import math
import pathlib
import urllib.request

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "gfz-hist"
GFZ = "https://kp.gfz.de/app/json/?start={s}&end={e}&index={i}"

DATA_START = 1995  # 54일 지연 변수를 위해 학습 시작(1996)보다 앞서 받는다
TRAIN_START = pd.Timestamp("1996-01-01")
TRAIN_END = pd.Timestamp("2019-12-31")
VALID_START = pd.Timestamp("2020-01-01")
HORIZONS = range(1, 28)
BUCKETS = {"1-3": (1, 3), "4-13": (4, 13), "14-27": (14, 27)}
FEATURES = ["kp27", "kp54", "kp3", "h", "sn27", "f107_27", "sin_doy", "cos_doy"]
TARGETS = {"G1": 1, "G3": 3}
# NOAA R3(X1 이상) 플레어 빈도: 태양주기(약 11년)당 약 175회(NOAA Space Weather Scales)
R3_PER_CYCLE = 175
CYCLE_DAYS = 11 * 365.25


def kp_to_g(kp):
    """api/_lib/transform.js kpToG와 동일. Kp 5-(4.67)부터 G1, 9-는 G4."""
    g = np.round(kp + 1e-9) - 4  # JS Math.round와 같게(.5 올림), Kp는 1/3 단위라 .5가 나오지 않음
    cap = np.where(kp >= 9 - 1e-6, 5, 4)
    return np.clip(np.minimum(g, cap), 0, 5)


# ---------------------------------------------------------------- 데이터
def gfz_year(index, year):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / f"{index}-{year}.json"
    if not path.exists():
        url = GFZ.format(s=f"{year}-01-01T00:00:00Z", e=f"{year}-12-31T23:59:59Z", i=index)
        print(f"내려받기 {index} {year}")
        with urllib.request.urlopen(url, timeout=120) as r:
            path.write_bytes(r.read())
    raw = json.loads(path.read_text(encoding="utf-8"))
    return pd.Series(raw[index], index=pd.to_datetime(raw["datetime"]).tz_localize(None), dtype=float)


def load_daily():
    years = range(DATA_START, dt.date.today().year + 1)
    kp = pd.concat([gfz_year("Kp", y) for y in years])
    sn = pd.concat([gfz_year("SN", y) for y in years])
    fobs = pd.concat([gfz_year("Fobs", y) for y in years])
    for s in (kp, sn, fobs):
        s[s < 0] = np.nan  # GFZ 결측(-1)
    daily = pd.DataFrame({"kp": kp.resample("D").max()})
    daily["sn"] = sn.resample("D").mean()
    daily["fobs"] = fobs.resample("D").mean()
    # 마지막 날은 일부만 있을 수 있어 제외
    return daily.iloc[:-1]


def build_rows(daily):
    """기준일 t, 거리 h마다 한 행. 모든 변수는 t 이전(포함) 자료만 쓴다."""
    kp = daily["kp"]
    sn27 = daily["sn"].shift(1).rolling(27, min_periods=20).mean()  # t-27..t-1(당일 SN은 다음 날 공개)
    f27 = daily["fobs"].shift(1).rolling(27, min_periods=20).mean()
    kp3 = kp.rolling(3).max()  # t-2..t
    frames = []
    for h in HORIZONS:
        target_date = daily.index + pd.Timedelta(days=h)
        doy = target_date.dayofyear.to_numpy()
        f = pd.DataFrame(
            {
                "base": daily.index,
                "target": target_date,
                "h": h,
                "kp27": kp.shift(27 - h).to_numpy(),  # 대상일 27일 전 = t+h-27 ≤ t
                "kp54": kp.shift(54 - h).to_numpy(),  # 대상일 54일 전 ≤ t
                "kp3": kp3.to_numpy(),
                "sn27": sn27.to_numpy(),
                "f107_27": f27.to_numpy(),
                "sin_doy": np.sin(2 * np.pi * doy / 365.25),
                "cos_doy": np.cos(2 * np.pi * doy / 365.25),
                "kp_target": kp.shift(-h).to_numpy(),
            }
        )
        frames.append(f)
    rows = pd.concat(frames, ignore_index=True).dropna()
    for name, g in TARGETS.items():
        rows[name] = (kp_to_g(rows["kp_target"].to_numpy()) >= g).astype(int)
    rows["g27"] = np.minimum(kp_to_g(rows["kp27"].to_numpy()), 3).astype(int)
    rows["month"] = rows["target"].dt.month
    return rows


# ---------------------------------------------------------------- 모델·기준선
def predict(model, X):
    """내보낸 계수로 확률 계산(js/forecast.js와 같은 식)."""
    z = (X - np.array(model["mean"])) / np.array(model["std"])
    return 1 / (1 + np.exp(-(z @ np.array(model["coef"]) + model["intercept"])))


def fit(train, target):
    X = train[FEATURES].to_numpy()
    mean, std = X.mean(axis=0), X.std(axis=0)
    clf = LogisticRegression(max_iter=2000)  # 클래스 가중치 없음(PRD 5.4)
    clf.fit((X - mean) / std, train[target])
    return {
        "mean": mean.round(8).tolist(),
        "std": std.round(8).tolist(),
        "coef": clf.coef_[0].round(8).tolist(),
        "intercept": round(float(clf.intercept_[0]), 8),
    }


def brier(p, y):
    return float(np.mean((p - y) ** 2))


def bss(p, ref, y):
    return 1 - brier(p, y) / brier(ref, y)


def reliability(p, y, edges):
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if m.sum():
            out.append((lo, hi, int(m.sum()), float(p[m].mean()), float(y[m].mean())))
    return out


# ---------------------------------------------------------------- 실행
def main():
    daily = load_daily()
    rows = build_rows(daily)
    train = rows[(rows["base"] >= TRAIN_START) & (rows["target"] <= TRAIN_END)]  # 대상일까지 학습 기간 안(검증과 겹침 없음)
    valid = rows[rows["base"] >= VALID_START]
    first_train = train["base"].min()

    out = {
        "version": 1,
        "trainedAtUtc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trainPeriod": f"{first_train:%Y-%m-%d}~{TRAIN_END:%Y-%m-%d}",
        "validPeriod": f"{VALID_START:%Y-%m-%d}~{valid['target'].max():%Y-%m-%d}",
        "labels": {"G1": "일 최대 Kp ≥ 5-(G1 이상)", "G3": "일 최대 Kp ≥ 7-(G3 이상)"},
        "features": FEATURES,
        "models": {},
        "climatology": {},
        "recurrence": {},
        "basis": {},
        "skill": {},
    }
    report = {}

    for name in TARGETS:
        y_tr, y_va = train[name].to_numpy(), valid[name].to_numpy()
        model = fit(train, name)
        clim = train.groupby("month")[name].mean().reindex(range(1, 13)).to_numpy()
        rec = train.groupby("g27")[name].mean().reindex(range(4)).fillna(train[name].mean()).to_numpy()

        p_ml = predict(model, valid[FEATURES].to_numpy())
        p_clim = clim[valid["month"].to_numpy() - 1]
        p_rec = rec[valid["g27"].to_numpy()]

        skill = {"bssVsClimatology": round(bss(p_ml, p_clim, y_va), 4), "bssVsRecurrence": round(bss(p_ml, p_rec, y_va), 4), "byHorizon": {}}
        basis = {}
        for b, (lo, hi) in BUCKETS.items():
            m = valid["h"].between(lo, hi).to_numpy()
            s_clim = bss(p_ml[m], p_clim[m], y_va[m])
            s_rec = bss(p_ml[m], p_rec[m], y_va[m])
            skill["byHorizon"][b] = {"vsClimatology": round(s_clim, 4), "vsRecurrence": round(s_rec, 4)}
            basis[b] = "ml" if s_rec > 0 else "recurrence"  # 채택 규칙(PRD 5.4)

        out["models"][name] = model
        out["climatology"][name] = [round(float(v), 6) for v in clim]
        out["recurrence"][name] = [round(float(v), 6) for v in rec]
        out["basis"][name] = basis
        out["skill"][name] = skill

        edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] if name == "G1" else [0, 0.02, 0.05, 0.1, 0.2, 1]
        report[name] = {
            "rate_train": float(y_tr.mean()),
            "rate_valid": float(y_va.mean()),
            "bs": {"ml": brier(p_ml, y_va), "clim": brier(p_clim, y_va), "rec": brier(p_rec, y_va)},
            "rel_ml": reliability(p_ml, y_va, edges),
            "rel_rec": reliability(p_rec, y_va, edges),
            "sharp": np.histogram(p_ml, bins=edges)[0].tolist(),
            "edges": edges,
        }

    sn_mean = float(daily.loc[first_train:TRAIN_END, "sn"].mean())
    out["rBaseline"] = {
        "method": "NOAA 척도 빈도(R3 이상 주기당 약 175회)를 현재 27일 평균 흑점수 비율로 조정한 근사",
        "r3PerCycle": R3_PER_CYCLE,
        "cycleDays": CYCLE_DAYS,
        "meanSn": round(sn_mean, 2),
        "formula": "pR3PerDay = 1 - exp(-(r3PerCycle / cycleDays) * sn27 / meanSn)",
    }

    (ROOT / "config").mkdir(exist_ok=True)
    (ROOT / "config" / "forecast-model.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_fixtures(daily, out)
    write_report(out, report, train, valid)
    for name in TARGETS:
        s = out["skill"][name]
        print(f"{name}: BSS 기후학 대비 {s['bssVsClimatology']:+.3f}, 27일 재귀 대비 {s['bssVsRecurrence']:+.3f}, 채택 {out['basis'][name]}")
    print("저장: config/forecast-model.json, reports/outlook-eval.md, tests/fixtures/outlook.json")


# ---------------------------------------------------------------- 브라우저 계산 사양(js/forecast.js와 동일해야 함)
def outlook_from_history(history, model_json):
    """SwxState.history → D+1~27 전망. 기준일 = dailyMaxKp의 마지막 날짜."""
    kp = {d["dateUtc"]: d["kp"] for d in history["dailyMaxKp"]}
    dates = sorted(kp)
    base = dt.date.fromisoformat(dates[-1])
    kp3 = max(kp[d] for d in dates[-3:])
    out = []
    for h in HORIZONS:
        target = base + dt.timedelta(days=h)
        k27 = kp.get((target - dt.timedelta(days=27)).isoformat())
        k54 = kp.get((target - dt.timedelta(days=54)).isoformat())
        doy = target.timetuple().tm_yday
        x = np.array([k27, k54, kp3, h, history["sn27"], history["f107_27"], math.sin(2 * math.pi * doy / 365.25), math.cos(2 * math.pi * doy / 365.25)], dtype=float)
        bucket = next(b for b, (lo, hi) in BUCKETS.items() if lo <= h <= hi)
        entry = {"dateUtc": target.isoformat(), "h": h}
        for name in TARGETS:
            basis = model_json["basis"][name][bucket]
            if basis == "ml":
                p = float(predict(model_json["models"][name], x[None])[0])
            else:
                g27 = int(min(kp_to_g(np.array([k27]))[0], 3))
                p = model_json["recurrence"][name][g27]
            entry["p" + name] = round(p, 6)
            entry["basis" + name] = basis
        out.append(entry)
    return out


def write_fixtures(daily, model_json):
    cases = []
    for base in ["2021-11-03", "2023-03-23", "2024-05-08", "2024-10-09", "2025-06-01"]:
        b = pd.Timestamp(base)
        window = daily.loc[b - pd.Timedelta(days=59) : b]
        history = {
            "dailyMaxKp": [{"dateUtc": f"{d:%Y-%m-%d}", "kp": round(float(v), 3)} for d, v in window["kp"].items()],
            "sn27": round(float(daily["sn"].loc[b - pd.Timedelta(days=27) : b - pd.Timedelta(days=1)].mean()), 1),
            "f107_27": round(float(daily["fobs"].loc[b - pd.Timedelta(days=27) : b - pd.Timedelta(days=1)].mean()), 1),
        }
        cases.append({"baseDate": base, "history": history, "expected": outlook_from_history(history, model_json)})
    path = ROOT / "tests" / "fixtures"
    path.mkdir(parents=True, exist_ok=True)
    (path / "outlook.json").write_text(json.dumps(cases, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- 보고서
def write_report(out, rep, train, valid):
    L = []
    w = L.append
    w("# AI 장차 전망 모델 평가 보고서\n")
    w(f"생성: {out['trainedAtUtc']} · `scripts/train_outlook.py` · PRD 5.4\n")
    w("> 확률 전망이며 확정 예보가 아니다. 코로나 구멍에서 오는 반복형 폭풍에만 예측력이 있고, 코로나물질방출(CME)로 생기는 폭풍은 사실상 예측할 수 없다.\n")
    w("## 1. 설정\n")
    w("| 항목 | 값 |\n| --- | --- |")
    w(f"| 예측 대상 | D+1~27 각 날짜의 일 최대 Kp ≥ 5-(G1+), ≥ 7-(G3+). NOAA 표기와 같게 5-부터 G1 |")
    w(f"| 입력 변수 | {', '.join(FEATURES)} |")
    w("| 알고리즘 | 로지스틱 회귀(L2, C=1), 표준화, 클래스 가중치 없음 |")
    w(f"| 학습 | {out['trainPeriod']}(대상일 기준), {len(train):,}행 |")
    w(f"| 검증 | {out['validPeriod']}, {len(valid):,}행(태양주기 25 진행 중, 전체 주기 미포함) |")
    w("| 기준선 | ① 기후학: 학습 기간 대상 월별 발생률 ② 27일 재귀: 대상일 27일 전 G등급(0·1·2·3+)별 발생률 |")
    w("| 기준선 ③ | NOAA 27일 전망 아카이브 미확보 → **NOAA 비교 미완**. 발표에서 \"NOAA 대비 우수\"를 주장하지 않는다 |\n")

    w("## 2. 성능(검증 기간)\n")
    w("Brier skill score(BSS) = 1 − BS(모델)/BS(기준선). 0보다 크면 기준선보다 낫다. 드문 사건이라 정확도는 쓰지 않는다.\n")
    for name in TARGETS:
        r, s = rep[name], out["skill"][name]
        w(f"### {name} 이상 — 발생률 학습 {r['rate_train']:.1%} · 검증 {r['rate_valid']:.1%}\n")
        w("| 구간 | BSS vs 기후학 | BSS vs 27일 재귀 | 채택 |\n| --- | --- | --- | --- |")
        w(f"| 전체 | {s['bssVsClimatology']:+.3f} | {s['bssVsRecurrence']:+.3f} | - |")
        for b in BUCKETS:
            hb = s["byHorizon"][b]
            w(f"| h={b}일 | {hb['vsClimatology']:+.3f} | {hb['vsRecurrence']:+.3f} | {out['basis'][name][b]} |")
        w(f"\nBrier score: 모델 {r['bs']['ml']:.4f} · 기후학 {r['bs']['clim']:.4f} · 27일 재귀 {r['bs']['rec']:.4f}\n")
        w("신뢰도 곡선(예측 확률 구간별 실제 발생률)\n")
        w("| 예측 구간 | 모델 n | 모델 평균 예측 | 실제 발생률 | 재귀 n | 재귀 실제 |\n| --- | --- | --- | --- | --- | --- |")
        rec = {(lo, hi): (n, o) for lo, hi, n, _, o in r["rel_rec"]}
        for lo, hi, n, pm, ob in r["rel_ml"]:
            rn, ro = rec.get((lo, hi), (0, None))
            w(f"| {lo:.2f}~{hi:.2f} | {n:,} | {pm:.3f} | {ob:.3f} | {rn:,} | {'-' if ro is None else f'{ro:.3f}'} |")
        w("\n예측 분포(sharpness): " + ", ".join(f"{lo:.2f}~{hi:.2f}: {c:,}" for lo, hi, c in zip(r["edges"][:-1], r["edges"][1:], r["sharp"])) + "\n")

    w("## 3. 계수(표준화 변수 기준)\n")
    w("| 변수 | G1 계수 | G3 계수 |\n| --- | --- | --- |")
    for i, f in enumerate(FEATURES):
        w(f"| {f} | {out['models']['G1']['coef'][i]:+.3f} | {out['models']['G3']['coef'][i]:+.3f} |")
    w(f"| 절편 | {out['models']['G1']['intercept']:+.3f} | {out['models']['G3']['intercept']:+.3f} |\n")

    w("## 4. 데이터 누수 검사\n")
    w("| 항목 | 결과 |\n| --- | --- |")
    w(f"| 학습 대상일 ≤ {TRAIN_END:%Y-%m-%d} < 검증 기준일 시작 {VALID_START:%Y-%m-%d} | {'통과' if train['target'].max() <= TRAIN_END < VALID_START else '실패'} |")
    w("| kp27 = 대상일 27일 전(t+h−27 ≤ t), kp54 = 54일 전 ≤ t: h ≤ 27이므로 항상 기준일 이전 | 통과(구성상) |")
    w("| kp3 = 기준일 포함 최근 3일, sn27·f107_27 = 기준일 전날까지 27일 평균(당일 값은 다음 날 공개) | 통과(구성상) |")
    w("| 표준화 평균·표준편차, 기후학·재귀 발생률은 학습 기간에서만 계산 | 통과 |")
    w("| 클래스 가중치 미사용 → 확률 보정 불필요(신뢰도 곡선으로 확인) | 위 표 참고 |\n")

    w("## 5. 한계와 다음 단계(P10)\n")
    w("- 검증 기간이 태양주기 25 상승·극대기뿐이다. 하강기 성능은 아직 모른다(재귀는 하강기에 더 유효하다는 연구가 있음).")
    w("- 부트스트랩 신뢰구간, 주기 위상별 BSS, 추가 변수(1·2 자전 전 Ap, 재귀 강도), 롤링 홀드아웃은 고도화 P10.")
    w("- 신뢰도: G1 예측 0.4 이상 구간에서 실제 발생률이 예측보다 낮다(과신). 해당 구간 표본은 검증의 약 2%다. 검증 자료로 보정하면 평가가 오염되므로 교육 트랙에서는 보정하지 않고 화면 배지에 성능을 공개한다. 보정은 P10에서 별도 보정 기간을 두고 한다.")
    w("- R(플레어)은 장기 예측하지 않는다. `rBaseline`은 NOAA 척도 빈도를 흑점수로 조정한 근사다.")
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "outlook-eval.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
