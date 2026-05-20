create table if not exists public.kiosk_login_attempts (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  passcode_hash text not null,
  ip_address text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.kiosk_login_attempts enable row level security;

drop policy if exists "no client access kiosk_login_attempts" on public.kiosk_login_attempts;

create index if not exists kiosk_login_attempts_lookup_idx
on public.kiosk_login_attempts (ip_address, passcode_hash, created_at desc);

create index if not exists kiosk_login_attempts_created_at_idx
on public.kiosk_login_attempts (created_at);
