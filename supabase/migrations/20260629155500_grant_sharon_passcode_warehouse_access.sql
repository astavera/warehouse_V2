update public.employees
set
  active = true,
  role = 'warehouse',
  store_number = null,
  permissions = array['receiving', 'expected_boxes']::text[],
  updated_at = now()
where lower(name) = 'sharon passcode';
