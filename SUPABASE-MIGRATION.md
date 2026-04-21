# Supabase Migration

This project includes a migration script to copy warehouse data and storage from one Supabase project to another.

## What it migrates

- `carriers`
- `employees`
- `suppliers`
- `receipt_batches`
- `receipt_items`
- `receipt_photos`
- storage bucket `receipts_photos`

The script preserves the original UUIDs so foreign-key relationships continue to work.

## Required credentials

Create a local env file based on `.env.migration.example` and provide:

- `SOURCE_SUPABASE_URL`
- `SOURCE_SUPABASE_SERVICE_ROLE_KEY`
- `TARGET_SUPABASE_URL`
- `TARGET_SUPABASE_SERVICE_ROLE_KEY`

Use the base project URL, for example:

`https://project-ref.supabase.co`

Do not use the `/rest/v1/` URL.

## Run

```powershell
$env:SOURCE_SUPABASE_URL="https://source.supabase.co"
$env:SOURCE_SUPABASE_SERVICE_ROLE_KEY="source-service-role"
$env:TARGET_SUPABASE_URL="https://target.supabase.co"
$env:TARGET_SUPABASE_SERVICE_ROLE_KEY="target-service-role"
npm run migrate:supabase
```

## Important behavior

- The target tables are cleared before import.
- The script inserts rows in dependency-safe order.
- The target bucket `receipts_photos` is created if missing.
- Files in `receipts_photos` are copied with the same paths.

## Recommended checklist after migration

1. Open the app against the target project.
2. Verify login works.
3. Verify Dashboard and History show receipts.
4. Open a receipt photo from History.
5. Create one new receipt and confirm it saves normally.
