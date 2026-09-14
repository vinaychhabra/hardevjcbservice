alter table public.assets
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expiry_date date,
  add column if not exists registration_certificate_number text,
  add column if not exists registration_certificate_expiry_date date,
  add column if not exists last_service_date date,
  add column if not exists last_service_hours numeric(14,2) not null default 0,
  add column if not exists next_service_due_hours numeric(14,2) not null default 500,
  add column if not exists last_service_notes text;
