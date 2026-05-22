update public.expected_boxes eb
set warehouse_received_box_count = greatest(coalesce(ri.package_count, 0), 0)
from public.receipt_items ri
where eb.received_item_id = ri.id
  and eb.warehouse_received_at is not null
  and coalesce(eb.warehouse_received_box_count, 0) = 0
  and lower(trim(coalesce(ri.package_type, ''))) like '%box%';
