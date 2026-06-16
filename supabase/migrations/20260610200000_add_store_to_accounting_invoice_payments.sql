alter table public.accounting_invoice_payments
  add column if not exists store_id uuid null references public.accounting_stores(id) on delete set null;

create index if not exists accounting_invoice_payments_store_id_idx
on public.accounting_invoice_payments(store_id);
