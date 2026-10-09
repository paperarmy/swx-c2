// Supabase 공개 설정. anon(publishable) 키는 화면에 노출돼도 되는 공개 키다(권한은 RLS가 막는다).
// service_role 키는 절대 여기에 넣지 않는다.
// 값: Supabase 대시보드 → Project Settings → API (또는 Data API)
export const SUPABASE_URL = 'https://wgsrarrnzxbzemmprcek.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_yKX2Z_rkPyz0hWZ4qTJAMA_phbFgoUE';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
