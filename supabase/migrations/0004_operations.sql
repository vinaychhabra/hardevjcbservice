-- =========================================================================
-- 0004_operations.sql
-- Adds: daily sales log, expenses, salary payments, maintenance records.
-- Also adds diesel_included to rental_contracts (hourly vs fixed, with or
-- without diesel, is now an explicit choice instead of the generic
-- fuel_responsibility field), and widens the manager/accountant default
-- roles + the signup RPC to grant the new permissions and seed a single
-- "JCB Excavator" equipment category automatically.
-- =========================================================================

alter table public.rental_contracts add column diesel_included boolean not null default true;

-- ---------- daily sales / collections log ----------
-- The quick day-to-day entry: "today this excavator earned X, at site Y,
-- Z hours, diesel was/wasn't included". Doesn't require a formal
-- customer record or invoice — those still exist for bigger jobs that
-- need credit terms, but most days you'll just log here.
create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_date date not null,
  asset_id uuid not null references public.assets(id),
  contract_id uuid references public.rental_contracts(id),
  customer_name_freeform text,
  site_name text,
  billing_type text not null default 'hourly', -- hourly / fixed_daily
  hours_worked numeric(6,2),
  rate numeric(14,2),
  amount numeric(14,2) not null default 0,
  diesel_included boolean not null default true,
  diesel_liters numeric(8,2),
  diesel_cost numeric(14,2),
  payment_status text not null default 'pending', -- pending / paid
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_daily_entries_date on public.daily_entries (tenant_id, entry_date);
create trigger trg_daily_entries_updated before update on public.daily_entries
  for each row execute function public.set_updated_at();

-- ---------- expenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  expense_date date not null,
  category text not null default 'other', -- diesel/repair/spare_parts/tyres/transport/insurance/other
  asset_id uuid references public.assets(id),
  vendor text,
  amount numeric(14,2) not null,
  payment_method text not null default 'cash',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_expenses_date on public.expenses (tenant_id, expense_date);
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------- salary payments ----------
create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operator_id uuid references public.operators(id),
  staff_name text not null, -- kept separate from operator_id so you can pay
                             -- helpers/drivers not in the Operators list too
  pay_period_start date not null,
  pay_period_end date not null,
  amount numeric(14,2) not null,
  paid_date date,
  payment_method text not null default 'cash',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_salary_period on public.salary_payments (tenant_id, pay_period_start);
create trigger trg_salary_updated before update on public.salary_payments
  for each row execute function public.set_updated_at();

-- ---------- maintenance records ----------
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.assets(id),
  maintenance_date date not null,
  type text not null default 'service', -- service/repair/tyre/breakdown/inspection
  meter_reading numeric(14,2),
  cost numeric(14,2) not null default 0,
  vendor text,
  description text,
  next_due_date date,
  next_due_meter numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_maintenance_asset on public.maintenance_records (tenant_id, asset_id);
create trigger trg_maintenance_updated before update on public.maintenance_records
  for each row execute function public.set_updated_at();

-- =========================================================================
-- RLS — same pattern as every other table
-- =========================================================================
alter table public.daily_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.salary_payments enable row level security;
alter table public.maintenance_records enable row level security;

create policy daily_entries_rw on public.daily_entries for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('daily_sales.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('daily_sales.write'));

create policy expenses_rw on public.expenses for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('expenses.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('expenses.write'));

create policy salary_rw on public.salary_payments for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('salaries.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('salaries.write'));

create policy maintenance_rw on public.maintenance_records for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('maintenance.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('maintenance.write'));

-- audit trail on the money-moving ones
create trigger trg_audit_daily_entries after insert or update or delete on public.daily_entries
  for each row execute function public.audit_trigger();
create trigger trg_audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_trigger();
create trigger trg_audit_salary after insert or update or delete on public.salary_payments
  for each row execute function public.audit_trigger();

-- =========================================================================
-- Widen default roles + signup flow for existing/new tenants
-- =========================================================================

-- Grant the new permissions to any tenant's existing manager/accountant
-- roles so you don't have to click through Settings > Roles to unlock
-- these screens if you already signed up before this migration.
update public.roles set permissions = permissions ||
  array['daily_sales.read','daily_sales.write','expenses.read','expenses.write',
        'salaries.read','salaries.write','maintenance.read','maintenance.write']
  where name in ('manager','accountant') and is_system = true
  and not (permissions @> array['daily_sales.read']);

update public.roles set permissions = permissions || array['maintenance.read']
  where name = 'field_staff' and is_system = true
  and not (permissions @> array['maintenance.read']);

-- Re-seed roles for NEW tenants from here on, with the new permissions
-- included, and auto-create a single "JCB Excavator" equipment category
-- so a one-service business doesn't have to set that up by hand.
create or replace function public.create_tenant_and_owner(
  company_name text, full_name text, country text default 'IN', currency text default 'INR'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_tenant_id uuid;
  owner_role_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.tenants (name, slug, country, currency)
  values (company_name, lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(uid::text, 1, 6), country, currency)
  returning id into new_tenant_id;

  insert into public.roles (tenant_id, name, permissions, is_system) values
    (new_tenant_id, 'owner', array['*'], true),
    (new_tenant_id, 'manager', array[
      'customers.read','customers.write','sites.read','sites.write',
      'equipment.read','equipment.write','operators.read','operators.write',
      'leads.read','leads.write','quotes.read','quotes.write',
      'rentals.read','rentals.write','usage.read','usage.write',
      'invoices.read','invoices.write','payments.read','payments.write','reports.read',
      'daily_sales.read','daily_sales.write','expenses.read','expenses.write',
      'salaries.read','salaries.write','maintenance.read','maintenance.write'
    ], true),
    (new_tenant_id, 'field_staff', array['equipment.read','usage.read','usage.write','rentals.read','maintenance.read','daily_sales.read','daily_sales.write'], true),
    (new_tenant_id, 'accountant', array[
      'invoices.read','invoices.write','payments.read','payments.write','reports.read',
      'daily_sales.read','daily_sales.write','expenses.read','expenses.write','salaries.read','salaries.write'
    ], true),
    (new_tenant_id, 'read_only', array['customers.read','equipment.read','rentals.read','invoices.read','reports.read'], true);

  select id into owner_role_id from public.roles where tenant_id = new_tenant_id and name = 'owner';

  insert into public.profiles (id, tenant_id, role_id, full_name, email)
  values (uid, new_tenant_id, owner_role_id, full_name, (select email from auth.users where id = uid));

  insert into public.equipment_categories (tenant_id, name, default_meter_type, default_billing_unit, custom_fields_schema)
  values (new_tenant_id, 'JCB Excavator', 'engine_hours', 'hour',
    '[{"key":"model","label":"Model (e.g. JCB 3DX)","type":"text"},{"key":"bucket_capacity","label":"Bucket Capacity (m3)","type":"number"}]'::jsonb);

  return new_tenant_id;
end;
$$;
