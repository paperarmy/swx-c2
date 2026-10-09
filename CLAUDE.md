# SWx-C2 작업 규칙

> 이 파일이 Claude Code 작업 규칙의 단일 기준이다. 아래 '기술 규칙'은 교육 트랙(P0~P6)에 적용한다. P7부터는 PRD 11.7의 '고도화 규칙'을 이 파일 끝에 추가하고, 둘이 충돌하면 고도화 규칙을 따른다.

## 프로젝트
- 우주기상(R/S/G)을 지휘통신 체계별 영향으로 번역하고, AI로 D+1~27일 지자기 위험 확률을 전망하는 웹 보드.
- 현재 페이즈는 docs/CURRENT_STATUS.md에 있다. 해당 페이즈 범위 밖의 작업은 하지 않는다.

## 문서 4종
| 파일 | 용도 | 언제 읽나 |
| --- | --- | --- |
| CLAUDE.md | 작업 규칙(이 파일) | 매 세션 자동 |
| docs/CURRENT_STATUS.md | 현재 페이즈·다음 할 일·결정 로그 | 매 세션 시작(/pickup) |
| docs/PRD.md | 요구사항 단일 기준 | 현재 페이즈 관련 장만 |
| README.md | 사람용 소개·실행 방법 | 실행·구조가 바뀔 때 갱신 |

## 기술 규칙
- 빌드 도구·프레임워크 없이 HTML/CSS/순수 JS(ES 모듈). 외부 라이브러리는 Chart.js와 supabase-js만(CDN, 버전 고정).
- 서버는 api/swx.js(Vercel 서버 함수, Node 20) 하나만. 원천 API는 이 파일에서만 호출한다. 보조 모듈은 api/_lib/에 둔다.
- 인증(P1.5): Supabase Auth, 역할 2단계(user·admin), 가입 시 승인 대기. 권한 판단은 화면이 아니라 RLS·DB 함수에서 한다. 화면의 메뉴 숨김은 편의일 뿐이다.
- /api/swx는 승인 사용자의 토큰을 확인한다. 응답이 사용자별이므로 CDN 공용 캐시(s-maxage)를 쓰지 않는다.
- DB 스키마·정책 변경은 supabase/migrations/에 새 SQL 파일로만 한다. 대시보드에서 직접 고치지 않는다.
- 화면·엔진·전망은 SwxState(PRD 3.2)만 입력으로 받는다. 원천 API 형식을 화면 코드에서 다루지 않는다.
- 판단 엔진은 순수 함수 `evaluate(state, rules, options)`(js/engine.js). 판단 임계값·문구·PACE는 config/rules.json에만 둔다. 코드에 숫자를 직접 쓰지 않는다.
- AI 장차 전망: 학습은 scripts/train_outlook.py(Python, scikit-learn 로지스틱 회귀)에서 사전에 1회. 브라우저(js/forecast.js)는 config/forecast-model.json의 계수로 계산만 한다. 클래스 가중치는 쓰지 않는다.
- scripts/, samples/, reports/, docs/, tests/는 배포물에 포함하지 않는다(.vercelignore).
- 시간은 저장·계산 모두 UTC, 화면 표시만 KST. 시각 필드명에 Utc/Kst 접미사를 붙인다.
- 화면은 5분마다 자동 새로고침하고, /api/swx 실패 또는 10초 초과 시 data/fallback-latest.json을 쓴다.
- 단계 명칭은 정상 · I 관찰 · II 대비 · III 조치만 쓴다. 관심·주의·경계·심각(국가 위기경보 명칭)은 쓰지 않는다.
- 체계별 판단 규칙의 기준은 PRD 부록 A다. 모든 규칙에 출처 태그(source)를 둔다.
- 색·글꼴·간격은 css/style.css의 토큰만 사용한다. 색은 단계 4개에만 의미를 주고, 단계 글자를 함께 표시한다.
- 테스트는 Node 내장 `node --test`. 추가 설치 없이 돈다.
- 비밀값(KASI_API_KEY)은 환경변수로만 다루고 커밋하지 않는다. 로컬은 .env.local + `node --env-file=.env.local`.
- Supabase anon(publishable) 키는 공개 키라 js/config.js에 둔다. service_role 키는 어디에도 쓰지 않는다(교육 트랙은 필요 없음).

## 작업 방식
- 코드를 쓰기 전에 계획을 먼저 보여주고 승인을 받는다.
- 한 번에 한 기능만 바꾼다. 요청하지 않은 기능·리팩터링은 하지 않고 제안만 한다.
- engine.js·forecast.js를 바꾸면 node --test를 실행하고 결과를 보고한다.
- 원천 API 구조는 추측하지 말고 samples/를 열어 확인한다.
- 작업이 끝나면 바꾼 파일과 확인 방법을 3줄 이내로 요약한다.
- 커밋 메시지는 "[P번호] 변경 내용" 형식의 한글로 쓴다.
- 기능 하나를 끝낼 때마다 커밋하고 docs/CURRENT_STATUS.md를 갱신한다.
- 결정이 생기면 docs/CURRENT_STATUS.md 결정 로그 끝에 "날짜 | 결정 | 이유"로 추가한다. 기존 행은 고치지 않는다.
- PRD와 다르게 구현해야 하면 먼저 묻는다. 승인되면 결정 로그에 남기고 PRD 부록 C에 반영한다.
- 새 세션은 /pickup으로 시작하고, 세션을 끝내거나 사용량 경고가 보이면 /handoff를 실행한다.
- 페이즈가 끝나면 태그를 단다(p0-done, p1-done …).

## 보안
- 공개 데이터만 사용한다. 실제 장비명·제원·부대명·군 내부 정보를 코드·문구·테스트에 넣지 않는다.
- 가입 정보는 이메일·표시 이름만 받는다. 부대명은 받지 않는다.
- 화면에 사용자 입력을 넣을 때는 textContent만 쓴다(innerHTML 금지).
- GitHub 저장소는 비공개, index.html은 noindex.
- 화면 하단에 출처(NOAA SWPC, GFZ CC BY 4.0, 한국천문연구원)와 "공개 데이터 기반 시제품, 공식 예·경보가 있으면 공식 예·경보를 우선" 문구를 유지한다.
