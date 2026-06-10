All Zentro Solutions

Operational webapp for warehouse receiving, store price checks, inventory audit, settings/roles, and Accounting / Accounts Payable.

## Development

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

## Accounting Import

The Modern State Accounting workbook lives at:

```bash
data/_Modern State 2026 (1).xlsx
```

Run the parser/importer with:

```bash
npm run import:modern-state-excel
```

To write to Supabase, set `SUPABASE_SERVICE_ROLE_KEY` in a local/server environment. The importer always writes `reports/excel_import_reconciliation.md`.

More details: `docs/accounting.md`.
