alter table public.accounting_vendors
add column if not exists address text,
add column if not exists contact_name text,
add column if not exists phone text,
add column if not exists email text,
add column if not exists account_number text,
add column if not exists default_payment_method_id uuid null references public.accounting_payment_methods(id) on delete set null,
add column if not exists notes text;

alter table public.accounting_invoice_payments
add column if not exists account_number text;

create index if not exists accounting_vendors_account_number_idx
on public.accounting_vendors(account_number);
