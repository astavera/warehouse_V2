alter table public.accounting_accounts
  add column if not exists store_id uuid null references public.accounting_stores(id) on delete set null;

create index if not exists accounting_accounts_store_id_idx
on public.accounting_accounts(store_id);
