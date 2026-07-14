do $$
declare
  sharon_auth_user_id uuid;
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

  update public.employees
  set
    active = true,
    role = 'accounting',
    store_number = null,
    permissions = array['accounting', 'expected_boxes']::text[],
    updated_at = now()
  where auth_user_id = sharon_auth_user_id;
end $$;
