# Supabase Dev Steps

Use these steps on the new Supabase project `qzlhbwvmepvhlcsxmqpf`.

## 1. Create the database schema
1. Open Supabase.
2. Open the dev project.
3. Go to `SQL Editor`.
4. Create a new query.
5. Copy and run the contents of `supabase/DEV_SCHEMA.sql`.

## 2. Create storage for photos
1. Still in `SQL Editor`, create another query.
2. Copy and run the contents of `supabase/DEV_STORAGE.sql`.

This creates the `receipts_photos` bucket and storage policies for authenticated users.

## 3. Enable email login
You no longer need Supabase email auth for the kiosk flow.

## 4. Enable kiosk passcodes on employees
If you already ran the original schema before this change:
1. Open `SQL Editor`.
2. Run the contents of `supabase/DEV_KIOSK_AUTH.sql`.
3. Run the contents of `supabase/DEV_KIOSK_POLICIES.sql`.

If you have not run the schema yet, `supabase/DEV_SCHEMA.sql` already includes `passcode`.
You should still run `supabase/DEV_KIOSK_POLICIES.sql` for kiosk mode.

## 5. Create your first user
Open `/login`, switch to `Register`, and create a user with:
- name
- 4-digit passcode

After registration, that employee can return later and log in with the passcode only.

## 6. Start the dev app
From `C:\Users\MANAGER\Downloads\warehouse-app-dev`:

```powershell
npm.cmd install
npm.cmd run dev
```

## 7. Expected behavior
- If you are not logged in, the app redirects to `/login`.
- First-time users register with `name + 4-digit passcode`.
- Returning users log in with the `4-digit passcode` only.
- The header shows `Bienvenido, Nombre`.
- `Receive` records batches under the signed-in employee.

## Notes
- The dev app already points to the new Supabase project through `.env`.
- The stable app folder was not modified.
- `DEV_KIOSK_POLICIES.sql` opens access for the dev project so kiosk passcode login works without Supabase email auth.
- Data access still uses the dev Supabase project only.
