alter table public.expected_boxes
add column if not exists warehouse_received_box_count integer not null default 0
check (warehouse_received_box_count >= 0);
