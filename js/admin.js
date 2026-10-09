// 사용자 관리(P1.5): 가입 승인, 관리자 지정·해제, 정지·복구.
// 화면에서 메뉴를 숨기는 것은 편의일 뿐이고, 실제 권한은 RLS와 admin_set_profile()이 판단한다.
import { supabase, isConfigured, currentProfile } from './auth.js';
import { fmtKst, el, ROLE_LABEL, STATUS_LABEL } from './format.js';

const $ = (id) => document.getElementById(id);

try {
  if (localStorage.getItem('swx-theme') === 'light') document.documentElement.dataset.theme = 'light';
} catch {
  /* 기본 테마 */
}
let filter = 'pending';
let me = null;

function say(text, isError = false) {
  $('admin-msg').textContent = text;
  $('admin-msg').className = isError ? 'msg error' : 'msg';
}

// 현재 상태에 따라 가능한 조치: [버튼 이름, 새 역할, 새 상태]
function actionsFor(p) {
  if (p.status === 'pending') return [['승인', 'user', 'active'], ['거절(정지)', 'user', 'suspended']];
  if (p.status === 'suspended') return [['복구', p.role, 'active']];
  return p.role === 'admin'
    ? [['관리자 해제', 'user', 'active'], ['정지', p.role, 'suspended']]
    : [['관리자 지정', 'admin', 'active'], ['정지', p.role, 'suspended']];
}

async function setProfile(p, role, status, label) {
  say(`${p.email}: ${label} 처리 중…`);
  const { error } = await supabase.rpc('admin_set_profile', { target: p.id, new_role: role, new_status: status });
  if (error) return say(`${label} 실패: ${error.message}`, true);
  say(`${p.email}: ${label} 완료`);
  await load();
}

async function load() {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (filter === 'pending') query = query.eq('status', 'pending');
  const { data, error } = await query;
  if (error) return say(`목록을 불러오지 못했습니다: ${error.message}`, true);

  $('users').replaceChildren(
    ...data.map((p) =>
      el(
        'tr',
        {},
        el('td', {}, p.email),
        el('td', {}, p.display_name || '-'),
        el('td', {}, ROLE_LABEL[p.role] ?? p.role),
        el('td', {}, STATUS_LABEL[p.status] ?? p.status),
        el('td', {}, fmtKst(p.created_at)),
        el(
          'td',
          {},
          ...actionsFor(p).map(([label, role, status]) =>
            el('button', { onclick: () => setProfile(p, role, status, label), ...(p.id === me.id && status !== 'active' ? { disabled: '' } : {}) }, label),
          ),
        ),
      ),
    ),
  );
  if (!data.length) say(filter === 'pending' ? '승인 대기 중인 사용자가 없습니다.' : '사용자가 없습니다.');
}

async function init() {
  if (!isConfigured) return say('Supabase 설정이 없습니다(js/config.js).', true);
  me = await currentProfile().catch(() => null);
  if (!me || me.role !== 'admin' || me.status !== 'active') {
    location.replace('index.html');
    return;
  }
  for (const b of document.querySelectorAll('[data-filter]')) {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      for (const x of document.querySelectorAll('[data-filter]')) x.setAttribute('aria-selected', String(x === b));
      load();
    });
  }
  $('reload').addEventListener('click', load);
  await load();
}

init();
