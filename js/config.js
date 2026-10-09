// Supabase 공개 설정. anon(publishable) 키는 화면에 노출돼도 되는 공개 키다(권한은 RLS가 막는다).
// service_role 키는 절대 여기에 넣지 않는다.
// 값: Supabase 대시보드 → Project Settings → API (또는 Data API)
export const SUPABASE_URL = 'https://wgsrarrnzxbzemmprcek.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnc3JhcnJuenhiemVtbXByY2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MTUxMDcsImV4cCI6MjEwNzA5MTEwN30.B-r-OhUbr1oWl-H-HkKziK_17mpQMEQlrOnXi0CYqAo';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
