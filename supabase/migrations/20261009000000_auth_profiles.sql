-- SWx-C2 교육 트랙 인증·권한(P1.5). PRD 11.9의 교육용 축소판.
-- 역할 2단계(user·admin), 가입 시 승인 대기(pending). 권한은 화면이 아니라 RLS·DB 함수에서 강제한다.
-- 적용: Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run(한 번만).

create type public.app_role as enum ('user', 'admin');
create type public.account_status as enum ('pending', 'active', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.app_role not null default 'user',
  status public.account_status not null default 'pending',
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

-- 가입하면 승인 대기 프로필을 자동으로 만든다.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 현재 로그인 사용자가 승인(active) 상태인지. /api/swx가 이 함수로 열람 권한을 확인한다.
create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active'
  );
$$;

-- 현재 로그인 사용자가 활성 관리자인지.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- 조회: 본인 것, 관리자는 전체. insert·update·delete 정책은 두지 않는다(직접 변경 불가).
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles
  for select to authenticated using ((select public.is_admin()));

-- 역할·상태 변경은 이 함수로만. 관리자만 호출 가능, 마지막 활성 관리자는 강등·정지 불가.
create function public.admin_set_profile(
  target uuid,
  new_role public.app_role,
  new_status public.account_status
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  cur public.profiles;
  result public.profiles;
begin
  if not public.is_admin() then
    raise exception '관리자만 변경할 수 있습니다' using errcode = '42501';
  end if;

  select * into cur from public.profiles where id = target for update;
  if not found then
    raise exception '사용자를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if cur.role = 'admin' and cur.status = 'active'
     and (new_role <> 'admin' or new_status <> 'active')
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception '마지막 활성 관리자는 강등하거나 정지할 수 없습니다' using errcode = 'P0001';
  end if;

  update public.profiles
     set role = new_role,
         status = new_status,
         updated_at = now(),
         approved_by = case when cur.status = 'pending' and new_status = 'active' then auth.uid() else approved_by end,
         approved_at = case when cur.status = 'pending' and new_status = 'active' then now() else approved_at end
   where id = target
  returning * into result;

  return result;
end;
$$;

-- 함수 실행 권한: 로그인 사용자만. 트리거 함수는 아무도 직접 호출하지 못하게 한다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_active() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_set_profile(uuid, public.app_role, public.account_status) from public, anon;
grant execute on function public.is_active() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_set_profile(uuid, public.app_role, public.account_status) to authenticated;
