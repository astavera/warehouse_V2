# All Zentro Solutions Agent Rules

- This repository is the existing All Zentro Solutions app. Do not create a new app.
- Keep the stack: React 18, Vite, TypeScript, Supabase, shadcn/ui, Tailwind CSS, React Query, and react-router-dom.
- Do not replace the existing kiosk/passcode auth system.
- Do not create parallel routing, data, UI, or auth architectures.
- Permissions are centralized in `src/lib/permissions.ts`.
- Modern State is a secondary brand and accounting dataset context, not the global app name.
- The Accounting source workbook is `data/_Modern State 2026 (1).xlsx`.
- Accounting imports must be idempotent.
- Imported Accounting records must preserve `source_file_name`, `source_file_sha256`, `source_sheet`, `source_row`, `source_row_hash`, `import_batch_id`, and `raw_payload`.
- `final_amount_to_pay = amount - credit`.
- Do not use floating point arithmetic for stored money values.
- Never expose a Supabase service role key in frontend code or any `VITE_` variable.
- `VITE_MOCK_LOCAL=true` must keep working for warehouse, prices, audit, settings, and accounting.
- Run `npm test`, `npm run lint`, and `npm run build` after relevant changes.
