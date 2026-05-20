alter table public.employees
add column if not exists passcode text;

update public.employees
set passcode = lpad(((1000 + floor(random() * 9000))::int)::text, 4, '0')
where passcode is null or passcode = '';

alter table public.employees
alter column passcode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_passcode_format'
  ) then
    alter table public.employees
    add constraint employees_passcode_format
    check (passcode ~ '^[0-9]{4}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_name_key'
  ) then
    alter table public.employees
    add constraint employees_name_key unique (name);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_passcode_key'
  ) then
    alter table public.employees
    add constraint employees_passcode_key unique (passcode);
  end if;
end $$;
