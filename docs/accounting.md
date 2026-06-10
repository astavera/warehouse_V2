# Accounting / Accounts Payable

All Zentro Solutions includes an Accounting / Accounts Payable module for Modern State AP data. Modern State is the dataset and operating context; the global app brand remains All Zentro Solutions.

## Stack

- React 18, Vite, TypeScript
- react-router-dom protected routes
- shadcn/ui, Radix UI, Tailwind CSS
- TanStack React Query for accounting data hooks
- Recharts for dashboard visuals
- Supabase/PostgreSQL for data
- Supabase Edge Functions and existing kiosk passcode auth

## Routes

- `/accounting`
- `/accounting/invoices`
- `/accounting/paid-invoices`
- `/accounting/vendors`
- `/accounting/credit-card-payments`
- `/accounting/personal-bills`
- `/accounting/truck`
- `/accounting/imports`
- `/accounting/catalogs`

All routes are protected by the existing `RequireModule` route guard using the `accounting` module permission.

## Permissions

Permissions are centralized in `src/lib/permissions.ts`.

- `admin`: receiving, prices, audit, accounting, settings
- `accounting`: receiving, prices, audit, accounting
- `warehouse`: receiving
- `store`: prices

Accounting also defines granular permission strings for server-side/import use:

- `accounting.view`
- `accounting.manage`
- `accounting.import`
- `accounting.reports`
- `accounting.catalogs`

## Database

The migration `supabase/migrations/20260609150000_add_accounting_module.sql` adds:

- `accounting_import_batches`
- `accounting_import_warnings`
- `accounting_vendors`
- `accounting_stores`
- `accounting_accounts`
- `accounting_payment_methods`
- `accounting_invoice_categories`
- `accounting_invoices`
- `accounting_invoice_payments`
- `accounting_credit_card_payments`
- `accounting_personal_bills`
- `accounting_truck_violations`

Imported rows preserve:

- `source_file_name`
- `source_file_sha256`
- `source_sheet`
- `source_row`
- `source_row_hash`
- `import_batch_id`
- `raw_payload`

Idempotency is enforced per table with `source_file_sha256 + source_sheet + source_row`.

## Excel Source

The initial source workbook is:

```bash
data/_Modern State 2026 (1).xlsx
```

The importer reads:

- General Info
- Pending Invoices
- Paid Invoices
- Credit Card Payments
- Personal Bills
- Truck

## Import Command

Set the service role key only in a local/server environment:

```bash
SUPABASE_SERVICE_ROLE_KEY="..."
```

Then run:

```bash
npm run import:modern-state-excel
```

Optional file override:

```bash
npm run import:modern-state-excel -- --file="data/_Modern State 2026 (1).xlsx"
```

If `SUPABASE_SERVICE_ROLE_KEY` is missing, the script still parses the Excel and generates a reconciliation report, but it does not write to Supabase.

## Reconciliation Report

The importer writes:

```bash
reports/excel_import_reconciliation.md
```

The report includes:

- import date/time
- source filename and SHA256
- sheets found and processed
- headers detected
- rows processed
- rows inserted/updated/skipped when Supabase write is configured
- warnings
- duplicate truck violation warnings
- parsed Excel totals
- Supabase comparison when DB write is configured

## Business Rules

- `final_amount_to_pay = amount - credit`
- Empty credit is treated as `0.00`
- Paid invoice means `status = paid`
- Pending invoice means `status = pending`
- Overdue means `due_date < today` and invoice is not paid
- Due soon 7/15/30 means due date is inside that window and invoice is not paid
- High amount means final amount to pay is at least `7000.00`
- Credit applied means credit is greater than `0.00`
- Truck duplicates are marked, not deleted
- Payment entry saves `status = Paid` automatically.
- Payment entry supports multiple invoice numbers through an Add/Remove list, not comma parsing.
- Vendor profiles can store address, contact, phone, email, account number, default payment method, and notes.
- Selecting a vendor in payment entry auto-fills saved vendor account information.

## Local Mock Mode

When `VITE_MOCK_LOCAL=true`, Accounting uses local mock data from `src/lib/localAccountingData.ts`.

Mock data includes:

- invoices
- paid invoice payments
- credit card payments
- personal bills
- truck violations
- import batches
- import warnings
- catalogs

Accounting write actions are blocked while truly offline unless running in explicit mock local mode.

## Validation

After changes:

```bash
npm test
npm run lint
npm run build
```

To validate in UI:

1. Log in as Sebastian/admin or the Accounting mock user.
2. Open `/accounting`.
3. Review dashboard totals and latest import.
4. Open `/accounting/invoices` and test filters/badges.
5. Open `/accounting/imports` and compare warnings with `reports/excel_import_reconciliation.md`.
6. Rerun `npm run import:modern-state-excel`; imported rows should upsert without duplicates.
