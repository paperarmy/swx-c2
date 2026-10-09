# samples/ — 원천 API 응답 구조

2026-10-09 04:50 UTC 무렵 수집한 원본이다. 변환 코드(`api/_lib/transform.js`)와 테스트는 이 파일들을 기준으로 한다. 다시 받으려면 `node scripts/fetch-samples.mjs`를 실행한다.

**공통 주의**: NOAA `products/` 계열의 `time_tag`에는 `Z`가 없지만 UTC다. 변환할 때 `Z`를 붙인다. 숫자가 문자열로 오는 곳이 있다(D1).

## D1 `d1-noaa-scales.json` — R/S/G 현재·예보

객체 하나. 키는 `"-1"`(어제), `"0"`(현재), `"1"`(오늘 예보), `"2"`, `"3"`(이후 일자 예보).

```json
"0": { "DateStamp": "2026-10-09", "TimeStamp": "04:48:00",
       "R": { "Scale": "0", "Text": "none", "MinorProb": null, "MajorProb": null },
       "S": { "Scale": "0", "Text": "none", "Prob": null },
       "G": { "Scale": "0", "Text": "none" } },
"1": { "DateStamp": "2026-10-09", "R": { "Scale": null, "MinorProb": "55", "MajorProb": "10" },
       "S": { "Scale": null, "Prob": "10" }, "G": { "Scale": "2", "Text": "moderate" } }
```

| 필드 | 의미 | SwxState |
| --- | --- | --- |
| `"0".R/S/G.Scale` | 현재 등급(문자열 숫자) | `scales.R/S/G` |
| `"1"~"3".DateStamp` | 예보 대상 UTC 일자 | `forecast[].dateUtc` |
| `R.MinorProb` | R1~R2 확률(%) | `forecast[].R12pct` |
| `R.MajorProb` | R3 이상 확률(%) | `forecast[].R35pct` |
| `S.Prob` | S1 이상 확률(%) | `forecast[].S1pct` |
| `G.Scale` | 예보 최대 G | `forecast[].Gmax` |

## D2 `d2-noaa-planetary-k-index.json` — Kp 관측(3시간, 최근 약 7일)

객체 배열(배열의 배열 아님).
`{"time_tag":"2026-10-02T00:00:00","Kp":1.00,"a_running":4,"station_count":7}` — `Kp` 대문자 K.

## D3 `d3-noaa-planetary-k-index-forecast.json` — Kp 관측+예보(3시간)

`{"time_tag":"2026-10-11T18:00:00","kp":2.00,"observed":"predicted","noaa_scale":null}` — `kp` 소문자.
`observed`는 `observed` | `estimated` | `predicted`. `kpForecast`에는 `observed`가 아닌 항목만 쓴다.

## D4 `d4-xrays-1-day.json` — GOES X선(1분, 24시간)

시각마다 2행. `energy`가 `"0.1-0.8nm"`인 장파 채널이 플레어 등급 기준이다.
`{"time_tag":"2026-10-09T04:48:00Z","satellite":18,"flux":1.30e-06,"observed_flux":...,"electron_correction":...,"electron_contaminaton":false,"energy":"0.1-0.8nm"}`
단위 W/m². 등급: A <1e-7 ≤ B <1e-6 ≤ C <1e-5 ≤ M <1e-4 ≤ X.

## D5 `d5-integral-protons-1-day.json` — GOES 양성자(5분, 24시간)

시각마다 에너지별 여러 행. S척도 기준은 `energy: ">=10 MeV"`.
`{"time_tag":"2026-10-09T04:40:00Z","satellite":18,"flux":0.30,"energy":">=10 MeV"}` — 단위 pfu.

## D6 `d6-planetary-k-index-1m.json` — 1분 추정 Kp(약 6시간)

`{"time_tag":"2026-10-09T04:47:00","kp_index":2,"estimated_kp":2.00,"kp":"2Z"}` — 소수 값은 `estimated_kp`.

## D13 `d13-alerts.json` — SWPC 경보·주의보(최근 약 1개월, 66건)

`{"product_id":"TIIA","issue_datetime":"2026-10-09 01:29:51.387","message":"Space Weather Message Code: ALTTP2\r\n..."}`
`issue_datetime`은 공백 구분·`Z` 없음(UTC). 본문 첫 제목 줄이 `ALERT:`/`WARNING:`/`WATCH:`/`SUMMARY:` 등으로 시작한다.

이번 샘플의 전파 관련 항목: `TIIA`(ALTTP2, Type II Radio Emission), `TIVA`(ALTTP4, Type IV Radio Emission). 10cm 전파폭발 경보는 이번 샘플에 없어 코드를 확인하지 못했다. 그래서 SRB 판정은 제목에 `Radio Emission` 또는 `Radio Burst`가 있는지로 한다.

## D8·D10 `d8-gfz-kp-2024-05.json`, `d10-gfz-kp-60d.json` — GFZ Kp(3시간)

열 단위 배열.
`{"Kp":[0.667, ...],"datetime":["2024-05-09T00:00:00Z", ...],"status":["def", ...],"meta":{"license":"CC BY 4.0","source":"GFZ Potsdam"}}`
`status`는 `def`(확정) | `pre`(잠정). 최근 자료는 `pre`다.

## D11 `d11-gfz-sn-60d.json`, `d11-gfz-fobs-60d.json` — 태양흑점수·F10.7(일)

`{"SN":[39.0, ...],"SNstatus":["pre", ...],"datetime":["2026-08-10T00:00:00Z", ...]}`
`{"Fobs":[95.4, ...],"datetime":[...]}` — 기준 시각 전날까지 제공된다.

## D7 `d7-kasi-riseset.xml` — 한국천문연구원 위치별 출몰시각(XML)

`getLCRiseSetInfo?locdate=20261009&latitude=36.35&longitude=127.38&dnYn=Y&ServiceKey=…` 응답. 인증키는 파일에 없다.

```xml
<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
<body><items><item>… <location>대전</location><locdate>20261009</locdate>
<sunrise>0632  </sunrise><sunset>1803  </sunset><suntransit>121750</suntransit> …</item></items></body></response>
```

- `sunrise`·`sunset`은 KST `HHMM` 뒤에 공백 2칸. `civilm`/`civile`(시민박명), `nautm`/`naute`, `astm`/`aste`, 월출몰도 함께 온다.
- 잘못된 키는 HTTP 오류 상태와 함께 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(등록되지 않은 서비스키)를 돌려준다. 이때 `sources`에는 `HTTP xxx` 오류로 기록되고 내장 계산을 쓴다.
- 같은 날 내장 계산(06:32/18:04)과 1분 이내로 일치한다.
