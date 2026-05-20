# Expected Boxes Emails

This project sends warehouse-received emails through the Supabase Edge Function:

`send-expected-box-emails`

## Required Supabase secrets

Set these in Supabase:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set EXPECTED_BOX_FROM_EMAIL="Modern State Warehouse <notifications@yourdomain.com>"
```

Supabase automatically provides:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
supabase functions deploy send-expected-box-emails
```

## Runtime behavior

When `Receiving` saves a batch and matches one or more `expected_boxes`, the app:

1. Marks those expected boxes as `received`.
2. Sets `warehouse_received_email_sent = false`.
3. Calls the Edge Function with the matched expected box IDs.
4. The Edge Function sends email to active recipients with `notify_warehouse_received = true`.
5. The Edge Function marks `warehouse_received_email_sent = true`.

Carrier-delivered emails require a separate carrier tracking sync function/API integration.
