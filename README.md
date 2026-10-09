# SWx-C2 — 우주기상 지휘통신 영향판단 보드

공개 우주기상 데이터를 받아 **"지금 어느 통신·항법 체계에 어떤 영향이 있고, 무엇으로 전환해야 하는가"**로 번역하는 웹 보드입니다. 사전 학습한 AI 모델로 **향후 1~27일의 지자기 폭풍 위험 확률**도 함께 보여줍니다.

> 공개 데이터 기반 시제품입니다. 공식 예·경보(우주항공청 우주환경센터 등)가 있으면 공식 예·경보를 우선합니다.

**상태**: 개발 중. 현재 진행 상황은 [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)를 보세요.

## 무엇을 하나

```
NOAA·GFZ·천문연 공개 데이터 → R/S/G 등급 → 한반도 주·야간 반영
  → 9개 체계별 작전영향 등급(정상 · I 관찰 · II 대비 · III 조치) → PACE 전환 권고
  + AI 장차 전망(D+1~27일 G1+·G3+ 확률)
```

| 탭 | 내용 |
| --- | --- |
| 1 지휘관 브리핑 | 종합 신호등, 한 줄 판단, R/S/G 카드, 한반도 주·야간, X-ray·Kp 그래프 |
| 2 영향 매트릭스 | 9개 체계 × 현재·6시간·24시간·3일·4~27일, 칸마다 근거 규칙 |
| 3 PACE 권고 | 단계별 통신수단 전환 순서, 점검 체크리스트 |
| 4 장애 원인 판별 | 우주기상과 재밍을 구분하는 질문형 체크(선택 기능) |
| 5 과거 사례 재현 | 2024년 5월 G5 폭풍 타임라인 재생 |
| 6 AI 장차 전망 | 27일 위험 달력, 작전 기간 위험 확률, 모델 성능 배지 |

## 구조

빌드 도구 없는 정적 화면, Vercel 서버 함수 1개, 규칙 설정 파일로 구성됩니다.

- **데이터 입구는 하나**: `api/swx.js`가 모든 원천을 내부 표준 형식(SwxState)으로 바꿉니다. 다른 데이터 환경으로 옮길 때는 이 파일만 교체하면 됩니다.
- **판단 기준은 파일 하나**: 임계값·문구·PACE는 `config/rules.json`에 있어, 코드를 고치지 않고 부대별로 수정할 수 있습니다.
- **AI는 브라우저에서 계산**: 로지스틱 회귀 계수(`config/forecast-model.json`)만 배포하므로 서버나 GPU가 필요 없습니다. 모델이 27일 재귀 기준선을 이기지 못하는 기간은 기준선을 대신 표시하고, 성능을 화면에 공개합니다.

```
api/swx.js          수집·변환 서버 함수(유일한 함수)
api/_lib/           원천 주소, 변환, 일출·일몰 계산, 스키마 검사
js/engine.js        판단 엔진(순수 함수)
js/forecast.js      AI 장차 전망 계산
js/render/          탭별 화면
config/             rules.json, forecast-model.json, glossary.json
data/               재현 사례, 오프라인 대비 데이터
scripts/            샘플 수집, fallback 생성, 모델 학습(배포 제외)
tests/              node --test
docs/               PRD.md, CURRENT_STATUS.md
```

## 실행 방법

필요한 것: Node 20, Vercel CLI(`npm i -g vercel`), 모델 학습 시 Python 3.11 + scikit-learn.

```bash
# 환경변수(한국천문연구원 출몰시각 API 키) — .env.local에 두고 커밋하지 않음
KASI_API_KEY=발급받은_키

# 로컬 실행 (http://localhost:3000, Vercel 로그인 필요)
vercel dev

# Vercel CLI 없이 /api/swx 결과만 확인(원천별 OK/FAIL과 스키마 검사는 stderr)
# --env-file은 .env.local의 KASI_API_KEY를 읽는다. 파일이 없으면 이 옵션을 빼고 실행(내장 일출·일몰 계산)
node --env-file=.env.local scripts/dev-swx.mjs > out.json

# 테스트(네트워크 없이 samples/로 실행)
node --test

# 원천 API 샘플 수집
node scripts/fetch-samples.mjs

# 오프라인 대비 데이터 갱신(발표 전날 밤·당일 아침)
node --env-file=.env.local scripts/make-fallback.mjs

# AI 전망 모델 재학습 → config/forecast-model.json, reports/outlook-eval.md
python scripts/train_outlook.py
```

## 배포

GitHub 비공개 저장소를 Vercel 프로젝트에 연결하면 push할 때마다 자동으로 배포됩니다. `KASI_API_KEY`는 Vercel 프로젝트 설정의 환경변수에 등록합니다. 천문연 API가 실패하면 주·야간은 내장 계산으로 대체합니다.

## 데이터 출처

| 출처 | 용도 | 라이선스 |
| --- | --- | --- |
| NOAA SWPC | R/S/G 등급·예보, Kp, X-ray, 양성자, 경보 | 미국 공공 데이터 |
| GFZ Potsdam | 과거·최근 Kp, 태양흑점수, F10.7 | CC BY 4.0 |
| 한국천문연구원(공공데이터포털) | 일출·일몰 시각 | 공공누리 |

## 개발 문서

| 문서 | 용도 |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | 요구사항(무엇을 만드는가) |
| [CLAUDE.md](CLAUDE.md) | Claude Code 작업 규칙(어떻게 만드는가) |
| [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) | 진행 상태·다음 할 일·결정 로그 |
| README.md | 이 문서 |
