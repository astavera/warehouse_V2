create index if not exists accounting_invoices_paid_due_date_idx
on public.accounting_invoices(paid, status, due_date);

create index if not exists accounting_invoices_final_amount_to_pay_idx
on public.accounting_invoices(final_amount_to_pay desc);

create or replace function public.get_accounting_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dashboard jsonb;
begin
  if not public.accounting_can_access('accounting.view') then
    raise exception 'Access denied to accounting dashboard' using errcode = '42501';
  end if;

  with invoice_base as (
    select
      i.id,
      i.vendor_id,
      i.invoice_number,
      i.due_date,
      i.amount,
      i.credit,
      i.final_amount_to_pay,
      i.status,
      i.paid,
      v.name as vendor_name,
      v.normalized_name as vendor_normalized_name,
      v.payment_terms_days as vendor_payment_terms_days
    from public.accounting_invoices i
    left join public.accounting_vendors v on v.id = i.vendor_id
  ),
  payment_base as (
    select
      p.id,
      p.vendor_id,
      p.payment_date,
      p.payment_method_id,
      p.amount_paid,
      p.status,
      v.name as vendor_name,
      v.normalized_name as vendor_normalized_name,
      pm.name as payment_method_name,
      pm.normalized_name as payment_method_normalized_name
    from public.accounting_invoice_payments p
    left join public.accounting_vendors v on v.id = p.vendor_id
    left join public.accounting_payment_methods pm on pm.id = p.payment_method_id
  ),
  summary as (
    select jsonb_build_object(
      'pendingAmount', coalesce(sum(final_amount_to_pay) filter (where not (status = 'paid' or paid)), 0)::text,
      'overdueAmount', coalesce(sum(final_amount_to_pay) filter (where not (status = 'paid' or paid) and due_date < current_date), 0)::text,
      'dueNext7Amount', coalesce(sum(final_amount_to_pay) filter (where not (status = 'paid' or paid) and due_date between current_date and current_date + 7), 0)::text,
      'dueNext15Amount', coalesce(sum(final_amount_to_pay) filter (where not (status = 'paid' or paid) and due_date between current_date and current_date + 15), 0)::text,
      'dueNext30Amount', coalesce(sum(final_amount_to_pay) filter (where not (status = 'paid' or paid) and due_date between current_date and current_date + 30), 0)::text,
      'paidThisMonth', (
        select coalesce(sum(amount_paid), 0)::text
        from payment_base
        where payment_date >= date_trunc('month', current_date)::date
          and payment_date < (date_trunc('month', current_date) + interval '1 month')::date
      ),
      'totalCreditApplied', coalesce(sum(credit), 0)::text,
      'pendingCount', count(*) filter (where not (status = 'paid' or paid)),
      'paidCount', count(*) filter (where status = 'paid' or paid),
      'overdueCount', count(*) filter (where not (status = 'paid' or paid) and due_date < current_date),
      'dueSoonCount', count(*) filter (where not (status = 'paid' or paid) and due_date between current_date and current_date + 7),
      'creditAppliedCount', count(*) filter (where credit > 0),
      'highAmountCount', count(*) filter (where final_amount_to_pay >= 7000)
    ) as data
    from invoice_base
  ),
  latest_import as (
    select to_jsonb(row) as data
    from (
      select id, source_file_name, imported_at, rows_processed, rows_inserted, warnings_count
      from public.accounting_import_batches
      order by imported_at desc
      limit 1
    ) row
  ),
  vendor_balance_rows as (
    select
      vendor_id,
      coalesce(vendor_name, 'No vendor') as vendor_name,
      count(*) as invoice_count,
      coalesce(sum(final_amount_to_pay), 0) as total_amount,
      coalesce(sum(final_amount_to_pay) filter (where due_date < current_date), 0) as overdue_amount,
      coalesce(sum(final_amount_to_pay) filter (where due_date between current_date and current_date + 15), 0) as due_next_15_amount,
      count(*) filter (where due_date between current_date and current_date + 15) as due_next_15_count,
      coalesce(sum(final_amount_to_pay) filter (where due_date between current_date and current_date + 30), 0) as due_next_30_amount
    from invoice_base
    where not (status = 'paid' or paid)
    group by vendor_id, vendor_name
    order by coalesce(sum(final_amount_to_pay), 0) desc
    limit 8
  ),
  vendor_balances as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'vendorId', vendor_id,
      'vendorName', vendor_name,
      'invoiceCount', invoice_count,
      'totalAmount', total_amount::text,
      'overdueAmount', overdue_amount::text,
      'dueNext15Amount', due_next_15_amount::text,
      'dueNext15Count', due_next_15_count,
      'dueNext30Amount', due_next_30_amount::text
    ) order by total_amount desc), '[]'::jsonb) as data
    from vendor_balance_rows
  ),
  high_due_30 as (
    select coalesce(jsonb_agg(invoice_data order by sort_amount desc), '[]'::jsonb) as data
    from (
      select
        final_amount_to_pay as sort_amount,
        jsonb_build_object(
          'id', id,
          'vendor_id', vendor_id,
          'invoice_number', invoice_number,
          'due_date', due_date,
          'amount', amount::text,
          'credit', credit::text,
          'final_amount_to_pay', final_amount_to_pay::text,
          'status', status,
          'paid', paid,
          'accounting_vendors', case when vendor_id is null then null else jsonb_build_object(
            'id', vendor_id,
            'name', vendor_name,
            'normalized_name', vendor_normalized_name,
            'payment_terms_days', vendor_payment_terms_days
          ) end
        ) as invoice_data
      from invoice_base
      where not (status = 'paid' or paid)
        and due_date between current_date and current_date + 30
      order by final_amount_to_pay desc
      limit 8
    ) rows
  ),
  high_due_90 as (
    select coalesce(jsonb_agg(invoice_data order by sort_amount desc), '[]'::jsonb) as data
    from (
      select
        final_amount_to_pay as sort_amount,
        jsonb_build_object(
          'id', id,
          'vendor_id', vendor_id,
          'invoice_number', invoice_number,
          'due_date', due_date,
          'amount', amount::text,
          'credit', credit::text,
          'final_amount_to_pay', final_amount_to_pay::text,
          'status', status,
          'paid', paid,
          'accounting_vendors', case when vendor_id is null then null else jsonb_build_object(
            'id', vendor_id,
            'name', vendor_name,
            'normalized_name', vendor_normalized_name,
            'payment_terms_days', vendor_payment_terms_days
          ) end
        ) as invoice_data
      from invoice_base
      where not (status = 'paid' or paid)
        and due_date between current_date and current_date + 90
      order by final_amount_to_pay desc
      limit 8
    ) rows
  ),
  high_invoices as (
    select coalesce(jsonb_agg(invoice_data order by sort_amount desc), '[]'::jsonb) as data
    from (
      select
        final_amount_to_pay as sort_amount,
        jsonb_build_object(
          'id', id,
          'vendor_id', vendor_id,
          'invoice_number', invoice_number,
          'due_date', due_date,
          'amount', amount::text,
          'credit', credit::text,
          'final_amount_to_pay', final_amount_to_pay::text,
          'status', status,
          'paid', paid,
          'accounting_vendors', case when vendor_id is null then null else jsonb_build_object(
            'id', vendor_id,
            'name', vendor_name,
            'normalized_name', vendor_normalized_name,
            'payment_terms_days', vendor_payment_terms_days
          ) end
        ) as invoice_data
      from invoice_base
      where not (status = 'paid' or paid)
        and final_amount_to_pay >= 7000
      order by final_amount_to_pay desc
      limit 8
    ) rows
  ),
  recent_payments as (
    select coalesce(jsonb_agg(payment_data order by payment_date desc nulls last), '[]'::jsonb) as data
    from (
      select
        payment_date,
        jsonb_build_object(
          'id', id,
          'vendor_id', vendor_id,
          'payment_date', payment_date,
          'payment_method_id', payment_method_id,
          'amount_paid', amount_paid::text,
          'status', status,
          'accounting_vendors', case when vendor_id is null then null else jsonb_build_object(
            'id', vendor_id,
            'name', vendor_name,
            'normalized_name', vendor_normalized_name
          ) end,
          'accounting_payment_methods', case when payment_method_id is null then null else jsonb_build_object(
            'id', payment_method_id,
            'name', payment_method_name,
            'normalized_name', payment_method_normalized_name
          ) end
        ) as payment_data
      from payment_base
      order by payment_date desc nulls last
      limit 8
    ) rows
  )
  select jsonb_build_object(
    'invoices', '[]'::jsonb,
    'payments', (select data from recent_payments),
    'latestImport', (select data from latest_import),
    'highAmountDue30Invoices', (select data from high_due_30),
    'highAmountDue90Invoices', (select data from high_due_90),
    'summary', (select data from summary),
    'vendorBalances', (select data from vendor_balances),
    'recentPayments', (select data from recent_payments),
    'highAmountInvoices', (select data from high_invoices)
  )
  into dashboard;

  return dashboard;
end;
$$;

revoke all on function public.get_accounting_dashboard() from public, anon;
grant execute on function public.get_accounting_dashboard() to authenticated;
