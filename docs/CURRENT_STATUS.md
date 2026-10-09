# CURRENT STATUS (마지막 갱신: 2026-10-09 KST, 계정 A)

> 인계·진행·결정 기록을 이 파일 하나로 관리한다. 1~5절은 매번 덮어쓰고, 6절은 체크만, 7절은 끝에 추가만 한다(PRD 9.2).

## 1. 지금 상태

**현재 페이즈**: P1 데이터 계층 — 코드 완료, **배포 검증만 남음**(사용자 계정 필요)

**마지막으로 완료한 것**
- 새 저장소로 이전(GitHub Desktop에서 생성). 이전 로컬 저장소의 커밋 이력 6건은 옮기지 않았고 현재 파일을 첫 커밋으로 넣었다
- `/api/swx` 데이터 계층: D1~D6, D10·D11, D13 병렬 수집 → SwxState, 5초 타임아웃, `s-maxage=300`, D7 실패 시 내장 일출·일몰
- 테스트 24건 통과(`node --test`, samples 기반·네트워크 불필요)
- 실데이터 실행 확인: **원천 10개 모두 OK**(D7 천문연 포함), 스키마 검사 통과
- D7 천문연 인증키 확인·실응답 샘플 저장, `parseKasi` 실응답 테스트 추가(대전 10-09 일출 06:32·일몰 18:03, 내장 계산과 1분 이내 일치)
- 키는 `.env.local`(git 제외)에 저장. Node 20.20.2 설치 완료(winget, `C:\Program Files\nodejs`)
- `samples/` 12개 + `samples/README.md`, `data/fallback-latest.json`(D7 포함으로 재생성)

**진행 중이던 것(미완료)**
- 없음

## 2. 다음 할 일(순서대로)

1. **GitHub Desktop으로 비공개 저장소 publish**(사용자) — `.env.local`이 변경 목록에 없는지 확인
2. **Vercel에서 저장소 Import**, 환경변수 `KASI_API_KEY` 등록 → 배포 URL의 `/api/swx` 응답 확인(P1 완료 기준) → `p1-done` 태그
3. P0 남은 작업: `data/replay-2024-05.json`, AI 전망 모델 학습(`train_outlook.py`)
4. 그다음 P2 판단 엔진

## 3. 알려진 문제·주의사항

- **Node 20은 2026-04 지원 종료**. Vercel이 20.x 런타임을 더 받지 않으면 `package.json`의 `engines.node`를 22.x로 바꾼다(코드 변경 불필요)
- 새로 연 터미널부터 `node`가 PATH에 잡힌다. 기존 VS Code 창은 재시작 필요
- 천문연 인증키가 대화에 노출됐다. 저장소에는 없지만, 외부 공개 전에 공공데이터포털에서 재발급을 검토한다
- 잘못된 키·한도 초과 시 D7은 `HTTP xxx` 오류로 기록되고 내장 계산으로 대체된다
- SRB 판정은 경보 제목의 "Radio Emission/Burst"로 한다. 10cm 전파폭발 경보 코드는 샘플에 없어 확인하지 못했다
- GFZ SN·F10.7은 전날까지만 제공된다. 당일 Kp는 NOAA D2로 보충한다
- PowerShell 5.1에서 NOAA를 직접 호출할 때는 TLS 1.2를 지정해야 한다(Node는 무관)
- D9(우주환경센터 경보·국가 위기경보), D12(NOAA 27일 전망 아카이브) 제공 여부 미확인

## 4. 확인 방법

- `node --test` → 24건 통과
- `node --env-file=.env.local scripts/dev-swx.mjs > out.json` → stderr에 원천 10개 OK와 "스키마 검사 통과"
- 배포 후: `https://<배포주소>/api/swx`, 응답 헤더 `Cache-Control: public, s-maxage=300`

## 5. 계정 메모

- 개발: 계정 A / 교육 중 채팅: 계정 B (PRD 9.5)

## 6. 페이즈 체크리스트

### P0 사전 준비(교육 전)
- [x] PRD를 `docs/PRD.md`로 저장(v2.2)
- [ ] GitHub·Vercel 계정, Node 20, Python 3.11 + scikit-learn, Claude Code `/model` Opus 5.5 확인 — Node 20.20.2·Python 3.13·Git 있음, scikit-learn 미확인
- [x] 천문연 출몰시각 API 활용신청·인증키 확보(실응답 확인 완료)
- [ ] 우주환경센터 경보·국가 위기경보 제공 여부 확인(없으면 "미연동")
- [x] SWPC 경보 목록(D13) SRB 항목 확인(Type II/IV Radio Emission) — NOAA 27일 전망 아카이브(D12)는 미확인
- [ ] 보안 점검: 비공개 저장소, noindex, 부대명·장비명·제원 미포함, 대외 게시 규정 확인
- [x] 저장소 생성(로컬), 문서 4종·`.claude/commands/` 커밋 — GitHub 원격 연결은 남음
- [x] `samples/` 수집 + `samples/README.md`(D7 제외)
- [ ] `data/replay-2024-05.json` 생성
- [ ] AI 전망 모델 학습(`train_outlook.py`), `reports/outlook-eval.md` 검토, `forecast-model.json`·`tests/fixtures/outlook.json` 커밋
- [ ] 빈 화면 + `/api/swx` Vercel 배포 경로 검증
- [x] `fallback-latest.json` 생성(P1 완료 후) — 발표 전날·당일 아침에 다시 생성
- [ ] 계정 A·B 전환 리허설, Git 자격 증명 설정

### P1 데이터 계층(교육 전)
- [x] `api/swx.js`: D1~D7, D10·D11(60일), D13 병렬 호출 → SwxState, 5초 타임아웃, `s-maxage=300`
- [x] 변환 함수 테스트(samples 입력) — 24건 통과
- [ ] 로컬·배포 URL에서 스키마에 맞는 JSON 확인 — 로컬 완료, 배포 URL 남음

### P2 판단 엔진(3일차 저녁)
- [ ] `config/rules.json`(부록 A 9개 체계, horizonRules, source 태그)
- [ ] `js/engine.js` evaluate(state, rules, options)
- [ ] T1~T7, T10~T14 통과

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
