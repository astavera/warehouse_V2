do $$
declare
  sharon_auth_user_id uuid;
  sharon_employee_id uuid;
begin
  select id
  into sharon_auth_user_id
  from auth.users
  where lower(email) = 'sharon@statenewsnyc.com'
  order by created_at desc
  limit 1;

  if sharon_auth_user_id is null then
    raise notice 'Auth user sharon@statenewsnyc.com was not found.';
    return;
  end if;

  select id
  into sharon_employee_id
  from public.employees
  where auth_user_id = sharon_auth_user_id
     or lower(name) = 'sharon'
  order by
    case when auth_user_id = sharon_auth_user_id then 0 else 1 end,
    created_at asc
  limit 1;

  if sharon_employee_id is null then
    raise notice 'Employee row for Sharon was not found.';
    return;
  end if;

  update public.employees
  set
    auth_user_id = sharon_auth_user_id,
    active = true,
    role = 'accounting',
    store_number = null,
    permissions = array['accounting']::text[],
    updated_at = now()
  where id = sharon_employee_id;
end $$;
