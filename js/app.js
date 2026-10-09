// 접속 흐름(P1.5): 설정 확인 → 로그인 → 승인 확인 → 데이터 표시.
// 화면(P3): 상단 표시줄 + 탭1 브리핑·탭2 매트릭스·탭3 PACE·탭6 장차 전망. 판단은 engine.evaluate()가 한다.
import { supabase, isConfigured, currentProfile, signIn, signUp, signOut, authFetch } from './auth.js';
import { evaluate } from './engine.js';
import { withOutlook } from './forecast.js';
import { installTooltips } from './tooltip.js';
import { renderStatus } from './render/status.js';
import { renderBrief } from './render/brief.js';
import { renderMatrix } from './render/matrix.js';
import { renderPace } from './render/pace.js';
import { renderOutlook } from './render/outlook.js';
import { renderDiagnose } from './render/diagnose.js';
import { renderReplay } from './render/replay.js';
import { createPlayer, scenarioState } from './replay.js';

const API_TIMEOUT_MS = 10000; // PRD 3.5
const REFRESH_MS = 5 * 60 * 1000;
const VIEWS = ['view-config', 'view-login', 'view-pending', 'view-app'];
const $ = (id) => document.getElementById(id);

let refreshTimer = null;
let signupMode = false;
let current = null; // { state, note } 마지막으로 받은 데이터
const options = { lowAltitudeOps: false }; // 화면 토글(PRD 12.3)

// 재현(P4): display가 있으면 실시간 대신 그 상태를 그린다. 실시간 수집은 뒤에서 계속된다.
let display = null; // { kind: 'replay' | 'scenario', state }
const replay = { cases: null, frames: null, index: 0, playing: false, speed: '1x', active: false, scenarioId: null, player: null };
let savedLowAlt = null; // 가상 재구성이 바꾼 토글을 되돌리기 위해

// 설정 파일은 한 번만 읽는다.
const once = (url) => {
  let p = null;
  return () => (p ??= fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
};
const loadRules = once('config/rules.json');
const loadGlossary = once('config/glossary.json');
const loadModel = once('config/forecast-model.json');
const loadCases = once('data/cases.json');

function show(viewId) {
  for (const id of VIEWS) $(id).hidden = id !== viewId;
  if (viewId !== 'view-app') clearInterval(refreshTimer);
}

async function route() {
  if (!isConfigured) return show('view-config');

  let profile = null;
  try {
    profile = await currentProfile();
  } catch (e) {
    $('auth-msg').textContent = `프로필을 불러오지 못했습니다: ${e.message}`;
  }

  $('who-box').hidden = !profile;
  if (!profile) return show('view-login');

  $('who-name').textContent = profile.display_name || profile.email;
  $('admin-link').hidden = !(profile.role === 'admin' && profile.status === 'active');

  if (profile.status !== 'active') {
    $('pending-text').textContent =
      profile.status === 'suspended'
        ? '정지된 계정입니다. 관리자에게 문의하십시오.'
        : '가입 신청이 접수되었습니다. 관리자가 승인하면 이용할 수 있습니다.';
    return show('view-pending');
  }

  show('view-app');
  await loadState();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadState, REFRESH_MS);
}

// /api/swx → 실패·10초 초과 시 fallback-latest.json(PRD 3.5)
async function loadState() {
  let state;
  let note = '';
  try {
    const res = await authFetch('/api/swx', { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) return route();
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    state = await res.json();
  } catch (e) {
    note = `실시간 데이터를 받지 못해 저장된 데이터를 표시합니다(${e.message}).`;
    try {
      state = await (await fetch('data/fallback-latest.json')).json();
    } catch {
      $('data-msg').textContent = '데이터를 불러오지 못했습니다.';
      $('data-msg').className = 'msg error';
      return;
    }
  }
  current = { state: withOutlook(state, await loadModel()), note };
  await render();
}

async function render() {
  if (!current) return;
  const [rules, glossary] = await Promise.all([loadRules(), loadGlossary()]);
  if (!rules) {
    $('data-msg').textContent = '판단 규칙(config/rules.json)을 불러오지 못했습니다.';
    $('data-msg').className = 'msg error';
    return;
  }
  const shown = display?.state ?? current.state;
  const ctx = { state: shown, result: evaluate(shown, rules, options), rules, glossary: glossary ?? { terms: {} }, options };
  $('data-msg').className = 'msg';
  $('data-msg').textContent = display ? '' : current.note;
  $('replay-banner').hidden = !display;
  $('replay-banner-text').textContent =
    display?.kind === 'scenario' ? `가상 재구성 중: ${display.state.scenario.title}` : display ? '재현 모드: 과거 사례 시점의 데이터를 보고 있습니다' : '';
  renderStatus($('status'), ctx);
  renderBrief($('tab-brief'), ctx);
  renderMatrix($('tab-matrix'), ctx, {
    onToggleLowAlt: (on) => {
      options.lowAltitudeOps = on;
      render();
    },
  });
  renderPace($('tab-pace'), ctx);
  renderDiagnose($('tab-diagnose'), ctx);
  renderReplay($('tab-replay'), ctx, replay, replayHandlers);
  renderOutlook($('tab-outlook'), ctx.state, ctx.glossary);
}

// ---------------------------------------------------------------- 재현(탭5)
async function ensureReplay() {
  replay.cases ??= await loadCases();
  if (!replay.frames && replay.cases) {
    const c = replay.cases.replays[0];
    replay.frames = await fetch(c.file).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (replay.frames) {
      const model = await loadModel();
      replay.frames = replay.frames.map((f) => withOutlook(f, model));
      replay.player = createPlayer(replay.frames.length, (i) => showFrame(i));
    }
  }
  render();
}

function showFrame(i) {
  replay.index = i;
  replay.active = true;
  replay.scenarioId = null;
  restoreLowAlt();
  replay.playing = replay.player?.playing ?? false;
  display = { kind: 'replay', state: replay.frames[i] };
  render();
}

function restoreLowAlt() {
  if (savedLowAlt !== null) {
    options.lowAltitudeOps = savedLowAlt;
    savedLowAlt = null;
  }
}

function exitReplay() {
  replay.player?.pause();
  replay.playing = false;
  replay.active = false;
  replay.scenarioId = null;
  restoreLowAlt();
  display = null;
  render();
}

const replayHandlers = {
  onSeek: (i) => replay.player?.seek(i),
  onPlay: () => {
    replay.player?.play();
    showFrame(replay.player.index);
  },
  onPause: () => {
    replay.player?.pause();
    replay.playing = false;
    render();
  },
  onSpeed: (sp) => {
    replay.speed = sp;
    replay.player?.setSpeed(sp);
    render();
  },
  onExit: exitReplay,
  onScenario: (sc) => {
    replay.player?.pause();
    replay.playing = false;
    replay.active = true;
    replay.scenarioId = sc.id;
    if (savedLowAlt === null) savedLowAlt = options.lowAltitudeOps;
    options.lowAltitudeOps = Boolean(sc.options?.lowAltitudeOps);
    display = { kind: 'scenario', state: scenarioState(sc) };
    selectTab('tab-matrix');
  },
};
$('replay-exit').addEventListener('click', exitReplay);

// 탭 전환. 숨겨진 상태로 그린 그래프는 크기가 0이므로 보일 때 다시 그린다.
function selectTab(id) {
  for (const t of document.querySelectorAll('[data-tab]')) {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    $(t.dataset.tab).hidden = !on;
  }
  if (id === 'tab-replay') ensureReplay();
  else render();
}
for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => selectTab(tab.dataset.tab));

// 테마: 어두운 상황실 테마 기본, 발표용 밝은 테마(PRD 6.2). 선택은 이 브라우저에만 기억한다.
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').textContent = theme === 'light' ? '어두운 테마' : '밝은 테마';
}
try {
  applyTheme(localStorage.getItem('swx-theme') === 'light' ? 'light' : 'dark');
} catch {
  applyTheme('dark');
}
$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem('swx-theme', next);
  } catch {
    /* 저장소를 못 쓰면 이번 화면에만 적용 */
  }
  render();
});

installTooltips();

// 로그인·가입 폼
function setMode(signup) {
  signupMode = signup;
  $('tab-login').setAttribute('aria-selected', String(!signup));
  $('tab-signup').setAttribute('aria-selected', String(signup));
  $('name-field').hidden = !signup;
  $('auth-submit').textContent = signup ? '가입 신청' : '로그인';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-msg').textContent = '';
}

async function submitAuth(event) {
  event.preventDefault();
  const msg = $('auth-msg');
  const email = $('email').value.trim();
  const password = $('password').value;
  $('auth-submit').disabled = true;
  msg.className = 'msg';
  msg.textContent = '처리 중…';
  try {
    const { data, error } = signupMode
      ? await signUp(email, password, $('display-name').value.trim())
      : await signIn(email, password);
    if (error) throw error;
    if (signupMode && !data.session) {
      msg.textContent = '확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하십시오.';
    } else {
      msg.textContent = '';
    }
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = e.message;
  } finally {
    $('auth-submit').disabled = false;
  }
}

$('tab-login').addEventListener('click', () => setMode(false));
$('tab-signup').addEventListener('click', () => setMode(true));
$('auth-form').addEventListener('submit', submitAuth);
$('logout').addEventListener('click', () => signOut());

if (isConfigured) supabase.auth.onAuthStateChange(() => setTimeout(route, 0));
route();
