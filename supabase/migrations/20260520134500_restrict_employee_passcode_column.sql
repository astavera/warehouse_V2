drop policy if exists "authenticated write employees" on public.employees;

create policy "authenticated update employees"
on public.employees for update
to authenticated
using (true)
with check (true);

revoke all on table public.employees from anon, authenticated;
grant select (id, name, active, created_at, updated_at, auth_user_id) on public.employees to authenticated;
grant update (name, active) on public.employees to authenticated;
