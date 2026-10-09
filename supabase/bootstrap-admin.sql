-- 최초 관리자 지정(부트스트랩, 한 번만). PRD 11.9 "관리자 계정 운영 원칙".
-- 1) 사이트에서 관리자로 쓸 계정으로 먼저 가입한다.
-- 2) 아래 이메일을 그 계정으로 바꿔 SQL Editor에서 Run.
-- 이후 역할 변경은 모두 사이트의 관리 화면(admin.html)에서 한다.

update public.profiles
   set role = 'admin', status = 'active', approved_at = now(), updated_at = now()
 where email = 'data@mnd.go.kr';

select email, role, status from public.profiles where role = 'admin';
