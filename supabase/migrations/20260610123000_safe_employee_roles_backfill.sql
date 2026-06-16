alter table public.employees
add column if not exists role text not null default 'warehouse',
add column if not exists store_number integer,
add column if not exists permissions text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_role_check'
  ) then
    alter table public.employees
    add constraint employees_role_check
    check (role in ('admin', 'accounting', 'warehouse', 'store'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_store_number_check'
  ) then
    alter table public.employees
    add constraint employees_store_number_check
    check (store_number is null or store_number > 0);
  end if;
end $$;

update public.employees
set
  role = 'admin',
  permissions = array['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings']::text[]
where id = '77f47458-3aa1-4fdb-a08a-8e7924671ec1'::uuid
   or auth_user_id = 'e7bb5b60-b264-49b2-8358-81d0f3c37b09'::uuid;

grant select (id, name, active, created_at, updated_at, auth_user_id, role, store_number, permissions)
on public.employees to authenticated;
