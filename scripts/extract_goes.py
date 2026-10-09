"""GOES 과거 자료(netCDF) → 재현용 시계열 JSON (P0, PRD 3.3).

사용: python -P scripts/extract_goes.py
입력: NOAA NCEI GOES-16 XRS 1분 평균, GOES-18 SGPS 5분 평균(없으면 data-raw/에 내려받음)
출력: data-raw/goes-2024-05.json  {"xray": [[timeUtc, W/m2], ...], "proton": [[timeUtc, pfu], ...]}

다음 단계: node scripts/make-replay.mjs
"""
import datetime as dt
import json
import pathlib
import urllib.request

import h5py
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw"
DAYS = ["20240508", "20240509", "20240510", "20240511", "20240512", "20240513"]

BASE = "https://data.ngdc.noaa.gov/platforms/solar-space-observing-satellites/goes"
XRS_URL = BASE + "/goes16/l2/data/xrsf-l2-avg1m_science/2024/05/sci_xrsf-l2-avg1m_g16_d{d}_v2-2-1.nc"
SGPS_URL = BASE + "/goes18/l2/data/sgps-l2-avg5m/2024/05/sci_sgps-l2-avg5m_g18_d{d}_v3-0-2.nc"

EPOCH = dt.datetime(2000, 1, 1, 12, tzinfo=dt.timezone.utc)  # netCDF time 기준
E_MIN_MEV = 10.0  # S척도 기준 >=10 MeV


def fetch(url, path):
    if not path.exists():
        print(f"내려받기 {path.name}")
        urllib.request.urlretrieve(url, path)
    return path


def iso(sec):
    return (EPOCH + dt.timedelta(seconds=float(sec))).strftime("%Y-%m-%dT%H:%M:%SZ")


def xray_series(path):
    """XRS-B(0.1-0.8 nm) 1분 평균. 품질 플래그가 0인 값만 쓴다."""
    with h5py.File(path, "r") as h:
        t, flux, flag = h["time"][:], h["xrsb_flux"][:], h["xrsb_flag"][:]
    good = np.isfinite(flux) & (flux > 0) & (flag == 0)
    return [[iso(a), float(b)] for a, b, g in zip(t, flux, good) if g]


def integral_pfu(diff, integral, lo_kev, up_kev):
    """차등 채널을 에너지로 적분해 >=10 MeV 적분 플럭스(pfu)를 만든다.

    채널 사이 빈 구간은 양쪽 채널의 기하평균으로 채운다. 두 센서(서·동향) 중 큰 값을 쓴다.
    SWPC 운영값과 같지는 않으므로 SGAS 일 최대값과 대조해 검증한다(make-replay.mjs 출력).
    """
    diff = np.clip(np.nan_to_num(diff), 0, None)
    integral = np.clip(np.nan_to_num(integral), 0, None)
    n, sensors, chans = diff.shape
    out = np.zeros((n, sensors))
    for s in range(sensors):
        lo, up = lo_kev[s] / 1000, up_kev[s] / 1000
        total = np.zeros(n)
        for j in range(chans):
            width_kev = max(0.0, up[j] - max(lo[j], E_MIN_MEV)) * 1000
            total += diff[:, s, j] * width_kev
            if j + 1 < chans and lo[j + 1] > up[j] >= E_MIN_MEV:
                gap_kev = (lo[j + 1] - up[j]) * 1000
                total += np.sqrt(diff[:, s, j] * diff[:, s, j + 1]) * gap_kev
        out[:, s] = total + integral[:, s]
    return out.max(axis=1)


def proton_series(path):
    with h5py.File(path, "r") as h:
        t = h["time"][:]
        pfu = integral_pfu(
            h["AvgDiffProtonFlux"][:],
            h["AvgIntProtonFlux"][:],
            h["DiffProtonLowerEnergy"][:],
            h["DiffProtonUpperEnergy"][:],
        )
    return [[iso(a), round(float(b), 3)] for a, b in zip(t, pfu) if np.isfinite(b)]


def main():
    RAW.mkdir(exist_ok=True)
    xray, proton = [], []
    for d in DAYS:
        xray += xray_series(fetch(XRS_URL.format(d=d), RAW / f"xrs_{d}.nc"))
        proton += proton_series(fetch(SGPS_URL.format(d=d), RAW / f"sgps_{d}.nc"))
    out = RAW / "goes-2024-05.json"
    out.write_text(json.dumps({"xray": xray, "proton": proton}), encoding="utf-8")
    peak_x = max(xray, key=lambda r: r[1])
    peak_p = max(proton, key=lambda r: r[1])
    print(f"X선 {len(xray)}점, 최대 {peak_x[1]:.2e} W/m2 @ {peak_x[0]}")
    print(f"양성자 {len(proton)}점, 최대 {peak_p[1]:.1f} pfu @ {peak_p[0]}")
    print(f"저장: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
