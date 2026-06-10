update public.employees
set
  permissions = (
    select array_agg(distinct permission)
    from unnest(coalesce(permissions, array[]::text[]) || array['expected_boxes']::text[]) as permission(permission)
  ),
  updated_at = now()
where role in ('admin', 'accounting')
  and permissions is not null
  and not coalesce(permissions, array[]::text[]) @> array['expected_boxes']::text[];
