do $$
declare
  sharon_auth_user_id uuid;
  sharon_employee_id uuid;
  generated_passcode text;
  candidate integer;
begin
  select id
  into sharon_auth_user_id
  from auth.users
  where lower(email) = 'sharon@statenewsnyc.com'
  order by created_at desc
  limit 1;

  if sharon_auth_user_id is null then
    raise notice 'Auth user sharon@statenewsnyc.com was not found. Create the Supabase Auth user and rerun this migration.';
    return;
  end if;

  select id
  into sharon_employee_id
  from public.employees
  where auth_user_id = sharon_auth_user_id
  limit 1;

  if sharon_employee_id is null then
    select id
    into sharon_employee_id
    from public.employees
    where lower(name) = 'sharon'
    order by created_at asc
    limit 1;
  end if;

  if sharon_employee_id is null then
    for candidate in 9100..9999 loop
      if not exists (
        select 1
        from public.employees
        where passcode = candidate::text
      ) then
        generated_passcode := candidate::text;
        exit;
      end if;
    end loop;

    if generated_passcode is null then
      raise exception 'No available passcode for Sharon accounting employee';
    end if;

    insert into public.employees (
      name,
      passcode,
      active,
      auth_user_id,
      role,
      store_number,
      permissions
    )
    values (
      'Sharon',
      generated_passcode,
      true,
      sharon_auth_user_id,
      'accounting',
      null,
      array['accounting']::text[]
    );
  else
    update public.employees
    set
      auth_user_id = sharon_auth_user_id,
      active = true,
      role = 'accounting',
      store_number = null,
      permissions = array['accounting']::text[],
      updated_at = now()
    where id = sharon_employee_id;
  end if;
end $$;
