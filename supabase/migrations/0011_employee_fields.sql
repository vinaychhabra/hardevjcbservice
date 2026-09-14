-- Add the missing employee/payroll fields expected by the app.
-- This keeps the operators table compatible with the employee form and salary features.

alter table public.operators
  add column if not exists email text,
  add column if not exists employee_role text,
  add column if not exists designation text,
  add column if not exists salary_amount numeric(14,2),
  add column if not exists salary_frequency text default 'monthly',
  add column if not exists advance_balance numeric(14,2) default 0,
  add column if not exists join_date date,
  add column if not exists notes text,
  add column if not exists aadhaar_number text,
  add column if not exists driving_license_number text;

-- Optional: keep a safe default for active staff records if the table lacks it.
alter table public.operators
  alter column is_active set default true;
