// 접속 흐름(P1.5): 설정 확인 → 로그인 → 승인 확인 → 데이터 표시.
// 데이터 화면은 /api/swx 연결 확인용 최소 형태이며 P3에서 탭 6개로 교체한다.
import { supabase, isConfigured, currentProfile, signIn, signUp, signOut, authFetch } from './auth.js';
import { fmtKst, el } from './format.js';
import { withOutlook } from './forecast.js';
import { renderOutlook } from './render/outlook.js';

const API_TIMEOUT_MS = 10000; // PRD 3.5
const REFRESH_MS = 5 * 60 * 1000;
const VIEWS = ['view-config', 'view-login', 'view-pending', 'view-app'];
const $ = (id) => document.getElementById(id);

let refreshTimer = null;
let signupMode = false;
let modelPromise = null; // config/forecast-model.json(한 번만 읽음)

function loadModel() {
  modelPromise ??= fetch('config/forecast-model.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return modelPromise;
}

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

  $('who').hidden = !profile;
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
  render(withOutlook(state, await loadModel()), note);
}

function render(state, note) {
  $('as-of').textContent = fmtKst(state.asOfUtc);
  $('mode').textContent = { live: '실시간', fallback: '저장 데이터', replay: '재현' }[state.mode] ?? state.mode;
  for (const k of ['R', 'S', 'G']) $(`scale-${k}`).textContent = state.scales[k] ?? '-';

  const k = state.korea;
  $('daynight').textContent = `${k.isDaytime ? '주간' : '야간'} (일출 ${k.sunriseKst} · 일몰 ${k.sunsetKst} KST)`;

  const failed = state.sources.filter((s) => !s.ok);
  $('data-msg').className = 'msg';
  $('data-msg').textContent = [note, failed.length ? '일부 데이터 지연' : ''].filter(Boolean).join(' · ');
  $('sources').replaceChildren(
    ...state.sources.map((s) => el('span', { title: s.error ?? s.note ?? '' }, el('span', { class: `dot ${s.ok ? 'ok' : 'fail'}` }), s.id)),
  );
  renderOutlook($('tab-outlook'), state);
}

// 탭 전환
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('[data-tab]')) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      $(t.dataset.tab).hidden = !on;
    }
  });
}

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
