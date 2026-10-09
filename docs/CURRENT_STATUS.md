# CURRENT STATUS (마지막 갱신: 2026-10-09 KST, 계정 A)

> 인계·진행·결정 기록을 이 파일 하나로 관리한다. 1~5절은 매번 덮어쓰고, 6절은 체크만, 7절은 끝에 추가만 한다(PRD 9.2).

## 1. 지금 상태

**현재 페이즈**: P2 판단 엔진 — **완료**(교육 전 앞당겨 진행, 사용자 결정). 배포 검증(P1·P1.5)은 사용자 진행 중
(P1 데이터 계층도 코드 완료, 배포 검증만 남음. 두 페이즈를 한 번의 배포로 함께 검증한다)

**마지막으로 완료한 것**
- **P2 판단 엔진**: `config/rules.json`(부록 A 9개 체계, horizonRules, SRB·저고도 규칙, 출처 태그), `js/engine.js` evaluate(state, rules, options)
  - T1~T7, T10~T14 + 미래 칸·Kp→G·주야 구간 테스트 15건 통과(전체 44건)
  - 실데이터·재현 40프레임 모두 예외 없이 판정, 재현 최대치(2024-05-11 03 UTC) 종합 III
- Vercel 첫 빌드 실패(Node 20.x 지원 종료) → `engines.node` 24.x로 변경(커밋 741816c), Supabase 공개 설정 반영(0b270d5). **사용자 push 필요**
- **P0 AI 전망 모델 학습**: `config/forecast-model.json`, `reports/outlook-eval.md`, `tests/fixtures/outlook.json`
  - G1+: 모든 구간 ML 채택(BSS 기후학 대비 +0.035, 27일 재귀 대비 +0.015)
  - G3+: h=1~3일만 ML, 4~27일은 27일 재귀 표시(재귀를 못 이김)
  - 2024-05-08 기준 D+3(실제 G5) G3+ 확률 2.7% → CME 폭풍은 예측 불가함을 보여주는 사례
- **P0 재현 데이터**: `data/replay-2024-05.json` 40프레임(GOES·GFZ·당시 SWPC 3일 예보), R·G·S 등급을 공식 기록과 대조 확인
- P1.5 로그인·승인(Supabase): 가입 → 승인 대기 → 관리자 승인 → 열람
  - `supabase/migrations/20261009000000_auth_profiles.sql`: profiles, 가입 트리거, `is_active()`·`is_admin()`·`admin_set_profile()`, RLS
  - `/api/swx`: Bearer 토큰 확인(없음·무효 401, 미승인 403, 설정 없음 503), 함수 메모리 5분 캐시
  - 화면: `index.html`(로그인·가입·승인 대기·데이터 확인), `admin.html`(사용자 관리)
- P1 데이터 계층: 원천 10개 병렬 수집 → SwxState, 실데이터 10개 모두 OK
- 테스트 28건 통과(`node --test`)

**진행 중이던 것(미완료)**
- 없음. 화면 JS는 문법 검사만 했고, 실제 Supabase 프로젝트로는 아직 동작 확인 전

## 2. 다음 할 일(순서대로)

1. **GitHub Desktop에서 Push origin**(사용자) → Vercel 자동 재배포. 환경변수 3개(`KASI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) 확인
2. Supabase Site URL을 Vercel 주소로
3. 배포 URL에서 관리자 계정 가입 → `bootstrap-admin.sql`로 최초 관리자 지정 → 시험 계정 가입·승인 → 데이터 열람 확인 → `p1-done`, `p1.5-done`, `p2-done` 태그
4. 다음 페이즈: P2.5 AI 장차 전망 연동(`js/forecast.js` + T8·T9, 탭6) → P3 핵심 화면

## 3. 알려진 문제·주의사항

- Vercel 런타임은 Node 24.x(20.x 거부됨). 로컬은 Node 20.20.2 — 사용 기능(fetch, AbortSignal.timeout, --env-file)은 둘 다 지원. 로컬도 24로 올리는 것을 권장
- 새로 연 터미널부터 `node`가 PATH에 잡힌다. 기존 VS Code 창은 재시작 필요
- 천문연 인증키가 대화에 노출됐다. 저장소에는 없지만 외부 공개 전에 재발급을 검토한다
- Supabase 기본 메일 발송은 시간당 몇 통으로 제한된다. 교육 중에는 Auth의 "Confirm email"을 끄는 것을 권장(README)
- `data/fallback-latest.json`은 정적 파일이라 로그인 없이도 받을 수 있다(공개 데이터, P9에서 제거)
- supabase-js는 CDN(jsdelivr, 2.45.4 고정)에서 받는다. 발표장 인터넷이 막히면 로그인도 안 되므로 녹화본으로 대비(P6)
- SRB 판정은 경보 제목의 "Radio Emission/Burst"로 한다. 10cm 전파폭발 경보 코드는 미확인
- D9(우주환경센터 경보·국가 위기경보), D12(NOAA 27일 전망 아카이브) 제공 여부 미확인

## 4. 확인 방법

- `node --test` → 28건 통과
- `node --env-file=.env.local scripts/dev-swx.mjs > out.json` → 원천 10개 OK, "스키마 검사 통과"(인증 없이 데이터 계층만 확인)
- 배포 후: 비로그인으로 `/api/swx` → 401. 승인 대기 계정으로 로그인 → "승인 대기" 화면. 승인 후 → R/S/G·원천 상태 표시

## 5. 계정 메모

- 개발: 계정 A / 교육 중 채팅: 계정 B (PRD 9.5)

## 6. 페이즈 체크리스트

### P0 사전 준비(교육 전)
- [x] PRD를 `docs/PRD.md`로 저장(v2.3)
- [ ] GitHub·Vercel 계정, Node 20, Python 3.11 + scikit-learn, Claude Code `/model` Opus 5.5 확인 — Node 20.20.2·Python 3.13(scikit-learn 1.9.1, h5py)·Git 있음
- [x] 천문연 출몰시각 API 활용신청·인증키 확보(실응답 확인 완료)
- [ ] 우주환경센터 경보·국가 위기경보 제공 여부 확인(없으면 "미연동")
- [x] SWPC 경보 목록(D13) SRB 항목 확인(Type II/IV Radio Emission) — NOAA 27일 전망 아카이브(D12)는 미확인
- [ ] 보안 점검: 비공개 저장소, noindex(완료), 부대명·장비명·제원 미포함, 대외 게시 규정 확인
- [x] 저장소 생성(GitHub Desktop), 문서 4종·`.claude/commands/` 커밋 — GitHub publish는 남음
- [x] `samples/` 수집 + `samples/README.md`
- [x] `data/replay-2024-05.json` 생성(40프레임, 공식 기록 대조)
- [x] AI 전망 모델 학습(`train_outlook.py`), `reports/outlook-eval.md` 검토, `forecast-model.json`·`tests/fixtures/outlook.json` 커밋
- [ ] 빈 화면 + `/api/swx` Vercel 배포 경로 검증
- [x] `fallback-latest.json` 생성 — 발표 전날·당일 아침에 다시 생성
- [ ] 계정 A·B 전환 리허설, Git 자격 증명 설정

### P1 데이터 계층(교육 전)
- [x] `api/swx.js`: D1~D7, D10·D11(60일), D13 병렬 호출 → SwxState, 5초 타임아웃
- [x] 변환 함수 테스트(samples 입력)
- [ ] 로컬·배포 URL에서 스키마에 맞는 JSON 확인 — 로컬 완료, 배포 URL 남음

### P1.5 로그인·승인(교육 전)
- [x] Supabase 마이그레이션(profiles, 트리거, RLS, 관리자 함수), 최초 관리자 SQL
- [x] `/api/swx` 토큰·승인 확인 + 테스트(401·403·503·캐시)
- [x] 로그인·가입·승인 대기 화면, 사용자 관리 화면
- [x] Supabase 프로젝트 생성·마이그레이션 실행·`js/config.js` 설정(비로그인 접근 거부 확인, 이메일 확인 끔)
- [ ] 배포 URL에서 가입 → 승인 → 열람, 미승인 403, 비로그인 401 확인

### P2 판단 엔진(3일차 저녁)
- [x] `config/rules.json`(부록 A 9개 체계, horizonRules, source 태그)
- [x] `js/engine.js` evaluate(state, rules, options)
- [x] T1~T7, T10~T14 통과

### P2.5 AI 장차 전망(3일차 저녁)
- [ ] `js/forecast.js` + T8·T9 통과
- [ ] 탭6(달력·배지·고지 필수, 기간 선택)

### P3 핵심 화면(4일차 오전)
- [ ] 디자인 토큰 → `css/style.css`
- [ ] 탭1 브리핑, 탭2 매트릭스(근거 표시), 탭3 PACE
- [ ] 상단 4중 표시, 실데이터 연결

### P4 재현·판별(4일차 오후)
- [ ] 탭5 재현(재생 시 탭1~3 동기 변화)
- [ ] (선택) 탭4 장애 원인 판별, 용어 도움말

### P5 배포·검증(4일차 오후)
- [ ] Must 대조표, 상태 처리(로딩·오류·빈 결과), 모바일 점검
- [ ] 휴대폰·노트북, 네트워크 차단 시험

### P6 발표 패키지(4일차 저녁)
- [ ] 시연 시나리오 4개, 녹화본, fallback 갱신, 리허설 1회
- [ ] 심사위원용 시연 계정 준비(승인 상태)

## 7. 결정 로그

| 날짜 | 결정 | 이유 |
| --- | --- | --- |
| 2026-10-03 | 작전 조치 기준선 3등급, 개발 도구 VS Code + Claude Code(Opus 5.5) | PRD 초판 확정 사항 |
| 2026-10-09 | AI 장차 전망을 Must로 승격(로지스틱 회귀, 브라우저 계산) | 사용자 요청. 기준선 대체 규칙이 있어 일정 위험이 작음 |
| 2026-10-09 | 클래스 가중치 미사용, Platt 보정은 필요할 때만 | 계수만으로 확률 계산 가능, 브라우저 구현 단순화 |
| 2026-10-09 | 단계 명칭 I 관찰·II 대비·III 조치로 본문 전체 통일, "12장 우선" 규칙 삭제 | 문서 내 충돌 제거 |
| 2026-10-09 | 지속·반복 상향·해제 규칙(T15·T16)을 P8로 이동 | 판정 이력이 필요해 순수 함수 엔진으로는 구현 불가 |
| 2026-10-09 | 12.4 전망 확장 평가는 P10, 교육 트랙은 고지 문구만 필수 | P0·P2.5 일정 확보 |
| 2026-10-09 | 인계 문서를 CURRENT_STATUS.md 하나로 통합, 개발 문서 4종 체계 | 문서 수를 줄여 갱신 누락 방지 |
| 2026-10-09 | CLAUDE.md를 작업 규칙 단일 기준으로, PRD 8장은 안내만 | 이중 관리로 인한 불일치 방지 |
| 2026-10-09 | Node 20 유지(지원 종료 버전이지만 PRD대로) | 사용자 결정. Vercel이 거부하면 22.x로 전환 |
| 2026-10-09 | D7 인증키 없이 진행, 내장 일출·일몰 계산(Almanac 알고리즘, ±2분) | 키 발급 대기. 키가 생기면 환경변수만 추가 |
| 2026-10-09 | 보조 모듈은 `api/_lib/`에 둔다 | `_` 폴더는 Vercel 함수로 배포되지 않아 "서버 함수 1개" 원칙 유지 |
| 2026-10-09 | SwxState에 `series`·`korea.sunSource`·`srb.events`·`sources[].error/note` 추가(PRD v2.2) | 탭1 그래프·출처 표시에 필요 |
| 2026-10-09 | SRB 진행 중 = 최근 3시간 안의 "Radio Emission/Burst" 경보 | 10cm 경보 코드를 샘플로 확인하지 못해 제목 기준으로 판정 |
| 2026-10-09 | 시각 문자열은 초 단위로 통일(밀리초 제거) | 필드 간 형식 일관성 |
| 2026-10-09 | 로컬 비밀값은 `.env.local` + `node --env-file`로 읽는다 | Node 20 내장 기능, 추가 패키지 불필요 |
| 2026-10-09 | 교육 트랙 배포에는 Supabase를 연결하지 않는다 | DB는 고도화 P8부터(PRD 2장 "하지 않는 것", 11장) |
| 2026-10-09 | GitHub Desktop으로 만든 새 저장소로 이전, 이전 로컬 이력은 보존하지 않음 | 사용자 결정. 앞으로 GitHub에 올리며 작업 |
| 2026-10-09 | (위 "Supabase 연결 안 함"을 대체) 교육 목적으로 Supabase 로그인·승인을 P1.5로 지금 추가(PRD v2.3) | 사용자 결정 |
| 2026-10-09 | 역할 2단계(user·admin) + 상태(pending·active·suspended), 승인된 사용자만 열람 | 사용자 결정. P9에서 3단계·MFA·감사 로그로 확장 |
| 2026-10-09 | `/api/swx` 캐시를 CDN 공용(s-maxage)에서 함수 메모리 5분으로 변경, `private, no-store` | 인증 응답이 공용 캐시를 통해 미인증 사용자에게 나갈 위험 차단 |
| 2026-10-09 | Supabase 설정이 없으면 `/api/swx`는 503(열어두지 않음) | 설정 누락 시 무인증 공개를 막기 위함 |
| 2026-10-09 | supabase-js 2.45.4를 jsdelivr CDN ESM으로 사용 | 빌드 도구 없는 구조 유지 |
| 2026-10-09 | 재현 S등급은 GOES-18 SGPS 차등 채널 적분 근사로 산출, pfu는 근사값으로 표기 | 운영 적분값 아카이브 없음. S 등급은 SGAS 공식 기록과 일치 확인 |
| 2026-10-09 | 재현 SRB = 사건 목록의 1415 MHz 전파폭발(직전 3시간) | GNSS L1에 가장 가까운 관측 주파수 |
| 2026-10-09 | 재현·전망 계산의 NOAA 척도 변환(fluxToR·pfuToS·kpToG)은 api/_lib/transform.js에 둔다 | 공식 척도 정의이며 판단 임계값이 아님. 엔진·스크립트 공용 |
| 2026-10-09 | G1·G3 판정은 NOAA 표기대로 Kp 5-(4.67)·7-(6.67)부터 | SWPC 예보 표기와 일치 |
| 2026-10-09 | 전망 모델 학습 1996~2019(대상일 기준), 클래스 가중치·확률 보정 없음 | PRD 5.4. 고확률 구간 과신은 보고서에 공개, 보정은 P10 |
| 2026-10-09 | Python 실행은 `python -P`, 패키지는 사용자 영역(pip --user) | 현재 폴더 모듈 로딩 차단, 시스템 변경 최소화 |
| 2026-10-09 | P2 판단 엔진을 교육 전에 앞당겨 진행 | 사용자 결정. 발표의 "개발 과정"에서 사전 개발 범위로 밝힌다(PRD 7장) |
| 2026-10-09 | Vercel 런타임 Node 24.x | Vercel이 20.x 빌드를 거부 |
| 2026-10-09 | 엔진 출력에 칸별 결과(cells)·notices 추가, reasons는 {text, source}(PRD v2.4) | 매트릭스 칸 근거·출처 표시 |
| 2026-10-09 | Kp→G 기준값도 rules.json에 둔다 | 브라우저 엔진은 서버 모듈을 못 쓰고, 숫자는 규칙 파일에만 |
| 2026-10-09 | 지속·반복 상향·해제(T15·T16)는 P8 유지 | 이력 DB 필요(PRD 12.3) |
