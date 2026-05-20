alter table public.expected_boxes
add column if not exists carrier_tracking_events jsonb not null default '[]'::jsonb;
