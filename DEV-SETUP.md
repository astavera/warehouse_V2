# Dev Setup

This copy is isolated for development work.

## What is already done
- Project duplicated into `warehouse-app-dev`
- Supabase client switched to environment variables
- `.env` replaced with safe placeholders so it does not keep using production values by accident

## What you need to do in Supabase
1. Log in to Supabase.
2. Create a new project for development, for example `warehouse-dev`.
3. Go to Project Settings > API.
4. Copy these two values:
   - Project URL
   - anon public key
5. Put them into `.env` in this folder.

## .env example
```env
VITE_SUPABASE_PROJECT_ID="your-dev-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-dev-anon-key"
VITE_SUPABASE_URL="https://your-dev-project.supabase.co"
```

## Important
- Do not reuse production URL or key here.
- This repo does not contain a full reproducible database setup yet; the existing `supabase/migrations` folder only has a partial migration.
- Before using this dev app fully, the new Supabase project still needs the database schema, storage bucket `receipts_photos`, and matching policies.

## Next local steps
1. Install dependencies.
2. Start the app.
3. Confirm it connects to the dev Supabase project.

PowerShell:
```powershell
npm.cmd install
npm.cmd run dev
```
