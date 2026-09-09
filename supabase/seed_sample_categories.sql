-- =========================================================================
-- seed_sample_categories.sql
-- OPTIONAL. Not part of the migration chain — run this by hand (with
-- :tenant_id substituted) after a tenant signs up, if you want sample
-- equipment categories to start from instead of an empty list. This is
-- what "JCB is seed data, not a hard-coded model" means in practice.
-- =========================================================================

-- Usage: replace 'YOUR-TENANT-UUID' below, then run in the SQL editor.

insert into public.equipment_categories (tenant_id, name, default_meter_type, default_billing_unit, custom_fields_schema) values
  ('YOUR-TENANT-UUID', 'Backhoe Loader', 'engine_hours', 'day',
    '[{"key":"bucket_capacity","label":"Bucket Capacity (m3)","type":"number"},{"key":"brand","label":"Brand (e.g. JCB, Case)","type":"text"}]'::jsonb),
  ('YOUR-TENANT-UUID', 'Mini Excavator', 'engine_hours', 'day',
    '[{"key":"operating_weight","label":"Operating Weight (tons)","type":"number"}]'::jsonb),
  ('YOUR-TENANT-UUID', 'Generator', 'engine_hours', 'day',
    '[{"key":"kva_rating","label":"KVA Rating","type":"number"},{"key":"fuel_type","label":"Fuel Type","type":"select","options":["Diesel","Petrol","Gas"]}]'::jsonb),
  ('YOUR-TENANT-UUID', 'Forklift', 'engine_hours', 'day',
    '[{"key":"lift_capacity","label":"Lift Capacity (kg)","type":"number"}]'::jsonb),
  ('YOUR-TENANT-UUID', 'Scissor Lift', 'engine_hours', 'day',
    '[{"key":"platform_height","label":"Platform Height (m)","type":"number"}]'::jsonb);
