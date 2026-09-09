-- =========================================================================
-- 0002_domain.sql
-- Phase 1: Customers/CRM, Equipment/Asset master, Leads/Quotes,
-- Rental contracts + usage log, Invoices + Payments.
-- =========================================================================

-- ---------- customers & contacts ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  customer_type text not null default 'individual', -- individual/company/contractor/dealer/broker/government/enterprise
  tax_id text,
  billing_address text,
  credit_limit numeric(14,2),
  payment_terms_days int not null default 0,
  tags text[],
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  designation text,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------- sites ----------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  contact_name text,
  contact_phone text,
  access_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sites_updated before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------- equipment categories (fully tenant-configurable) & assets ----------
create table public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  parent_id uuid references public.equipment_categories(id),
  default_meter_type text not null default 'engine_hours',
  default_billing_unit text not null default 'day',
  custom_fields_schema jsonb, -- [{key,label,type,options}]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_categories_updated before update on public.equipment_categories
  for each row execute function public.set_updated_at();

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null references public.equipment_categories(id),
  branch_id uuid references public.branches(id),
  internal_code text not null,
  manufacturer text,
  model text,
  year int,
  serial_number text,
  registration_number text,
  purchase_date date,
  purchase_cost numeric(14,2),
  ownership_type text not null default 'owned', -- owned/financed/leased/subcontracted
  current_location text,
  status text not null default 'available',
  current_meter_reading numeric(14,2) not null default 0,
  meter_type text not null default 'engine_hours',
  custom_fields jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_assets_status on public.assets (tenant_id, status);
create trigger trg_assets_updated before update on public.assets
  for each row execute function public.set_updated_at();

-- ---------- operators ----------
create table public.operators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  license_number text,
  license_expiry date,
  skill_categories text,
  daily_rate numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_operators_updated before update on public.operators
  for each row execute function public.set_updated_at();

-- ---------- leads & quotes ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_freeform text,
  source text,
  category_id uuid references public.equipment_categories(id),
  quantity int not null default 1,
  required_from date,
  required_to date,
  site_id uuid references public.sites(id),
  budget numeric(14,2),
  stage text not null default 'new_lead',
  lost_reason text,
  salesperson_id uuid references public.profiles(id),
  next_follow_up date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid references public.leads(id),
  customer_id uuid not null references public.customers(id),
  quote_number text not null,
  version int not null default 1,
  status text not null default 'draft', -- draft/sent/approved/rejected/expired
  valid_until date,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_quotes_updated before update on public.quotes
  for each row execute function public.set_updated_at();

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  category_id uuid references public.equipment_categories(id),
  description text not null,
  billing_unit text not null default 'day',
  quantity numeric(14,2) not null default 1,
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0
);

-- ---------- rental contracts & usage log ----------
create table public.rental_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_number text not null,
  customer_id uuid not null references public.customers(id),
  site_id uuid references public.sites(id),
  asset_id uuid not null references public.assets(id),
  operator_id uuid references public.operators(id),
  contract_type text not null default 'one_off', -- one_off/recurring/fixed_monthly/meter_based/project
  billing_unit text not null default 'day',
  rate numeric(14,2) not null default 0,
  start_date date not null,
  end_date date,
  included_usage numeric(14,2),
  excess_usage_rate numeric(14,2),
  minimum_charge numeric(14,2),
  fuel_responsibility text not null default 'customer',
  operator_responsibility text not null default 'not_applicable',
  deposit_amount numeric(14,2),
  status text not null default 'draft', -- draft/active/suspended/completed/cancelled/expired
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_contracts_status on public.rental_contracts (tenant_id, status);
create trigger trg_contracts_updated before update on public.rental_contracts
  for each row execute function public.set_updated_at();

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null references public.rental_contracts(id) on delete cascade,
  asset_id uuid not null references public.assets(id),
  log_date date not null,
  start_meter numeric(14,2),
  end_meter numeric(14,2),
  usage_units numeric(14,2) not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  recorded_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- invoices & payments ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid not null references public.customers(id),
  contract_id uuid references public.rental_contracts(id),
  issue_date date not null,
  due_date date not null,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'draft', -- draft/sent/partially_paid/paid/overdue/void
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invoices_status on public.invoices (tenant_id, status, due_date);
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(14,2) not null default 1,
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  tax_rate_pct numeric(5,2) not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.customers(id),
  amount numeric(14,2) not null,
  payment_date date not null,
  method text not null default 'bank_transfer',
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- RLS — same pattern everywhere: select needs "<module>.read", writes need
-- "<module>.write", always scoped to tenant_id = current_tenant_id()
-- =========================================================================
alter table public.customers enable row level security;
alter table public.contacts enable row level security;
alter table public.sites enable row level security;
alter table public.equipment_categories enable row level security;
alter table public.assets enable row level security;
alter table public.operators enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.rental_contracts enable row level security;
alter table public.usage_logs enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;

create policy customers_rw on public.customers for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('customers.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('customers.write'));

create policy contacts_rw on public.contacts for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('customers.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('customers.write'));

create policy sites_rw on public.sites for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('sites.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('sites.write'));

create policy categories_rw on public.equipment_categories for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('equipment.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('equipment.write'));

create policy assets_rw on public.assets for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('equipment.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('equipment.write'));

create policy operators_rw on public.operators for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('operators.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('operators.write'));

create policy leads_rw on public.leads for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('leads.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('leads.write'));

create policy quotes_rw on public.quotes for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('quotes.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('quotes.write'));

create policy quote_items_rw on public.quote_line_items for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('quotes.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('quotes.write'));

create policy contracts_rw on public.rental_contracts for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('rentals.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('rentals.write'));

create policy usage_rw on public.usage_logs for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('usage.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('usage.write'));

create policy invoices_rw on public.invoices for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('invoices.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('invoices.write'));

create policy invoice_items_rw on public.invoice_line_items for all
  using (tenant_id = public.current_tenant_id() and public.has_permission('invoices.read'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('invoices.write'));

-- payments: no update/delete policy on purpose — financial records are
-- corrected with a reversing entry (Phase 2), never edited/deleted in place
create policy payments_select on public.payments for select
  using (tenant_id = public.current_tenant_id() and public.has_permission('payments.read'));
create policy payments_insert on public.payments for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('payments.write'));
