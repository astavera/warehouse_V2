alter table public.accounting_vendors
add column if not exists payment_terms_days integer;

alter table public.accounting_vendors
drop constraint if exists accounting_vendors_payment_terms_days_check;

alter table public.accounting_vendors
add constraint accounting_vendors_payment_terms_days_check
check (payment_terms_days is null or (payment_terms_days >= 0 and payment_terms_days <= 365));
