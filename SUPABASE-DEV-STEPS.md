# Supabase Dev Archive

The old `DEV_*.sql` files were moved to `supabase/legacy-dev-insecure/`.

Do not run those files against production. They were useful during early local setup, but they opened broad anonymous access for kiosk testing.

For the active project, use the timestamped files in `supabase/migrations/` and deploy Edge Functions through the Supabase CLI.
