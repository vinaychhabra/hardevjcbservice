-- Ensure existing tenants can add JCB excavators without manually seeding a category.
insert into public.equipment_categories (tenant_id, name, default_meter_type, default_billing_unit, custom_fields_schema)
select
  tenants.id,
  'JCB Excavator',
  'engine_hours',
  'hour',
  '[{"key":"model","label":"Model (e.g. JCB 3DX)","type":"text"},{"key":"bucket_capacity","label":"Bucket Capacity (m3)","type":"number"}]'::jsonb
from public.tenants
where tenants.is_active
  and not exists (
    select 1
    from public.equipment_categories categories
    where categories.tenant_id = tenants.id
  );
