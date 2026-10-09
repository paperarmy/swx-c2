// 로그인·프로필·인증 요청 공통 모듈(P1.5).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

export { isConfigured };

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// 로그인 안 했으면 null. 프로필은 RLS상 본인 것만 읽힌다.
export async function currentProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, status')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password, displayName) =>
  supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });

export const signOut = () => supabase.auth.signOut();

// 액세스 토큰을 붙여 요청한다(/api/swx).
export async function authFetch(url, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...opts.headers };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(url, { ...opts, headers });
}
