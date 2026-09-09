-- =========================================================================
-- 0001_core.sql
-- Phase 0: multi-tenancy, auth profiles, roles/permissions, settings,
-- audit log, feature flags, and the helper functions RLS depends on.
--
-- Run these migrations IN ORDER via the Supabase SQL editor, or with
-- `supabase db push` if you're using the Supabase CLI locally.
-- =========================================================================

create extension if not exists "pgcrypto";

-- ---------- generic updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- tenants & branches ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text not null default 'IN',
  currency text not null default 'INR',
  plan text not null default 'starter',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_branches_updated before update on public.branches
  for each row execute function public.set_updated_at();

-- ---------- roles (tenant-defined, seeded with defaults per tenant) ----------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_roles_updated before update on public.roles
  for each row execute function public.set_updated_at();

-- ---------- profiles: 1:1 with auth.users, adds tenant/role/branch ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  branch_id uuid references public.branches(id),
  full_name text not null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- helper functions used by every RLS policy below ----------
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.is_active
      and (r.permissions @> array[perm] or r.permissions @> array['*'])
  );
$$;

-- ---------- self-serve signup: creates tenant + owner role + profile ----------
-- Client flow: supabase.auth.signUp({email, password}) THEN
-- supabase.rpc('create_tenant_and_owner', {company_name, full_name, country, currency})
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
      'invoices.read','invoices.write','payments.read','payments.write','reports.read'
    ], true),
    (new_tenant_id, 'field_staff', array['equipment.read','usage.read','usage.write','rentals.read'], true),
    (new_tenant_id, 'accountant', array['invoices.read','invoices.write','payments.read','payments.write','reports.read'], true),
    (new_tenant_id, 'read_only', array['customers.read','equipment.read','rentals.read','invoices.read','reports.read'], true);

  select id into owner_role_id from public.roles where tenant_id = new_tenant_id and name = 'owner';

  insert into public.profiles (id, tenant_id, role_id, full_name, email)
  values (uid, new_tenant_id, owner_role_id, full_name, (select email from auth.users where id = uid));

  return new_tenant_id;
end;
$$;

-- ---------- settings: generic key/value store (the "modify everything" engine) ----------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  namespace text not null,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, namespace, key)
);
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create trigger trg_flags_updated before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- ---------- audit log ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

-- tenants: a user can only ever see/update their own tenant row
create policy tenants_select on public.tenants for select
  using (id = public.current_tenant_id());
create policy tenants_update on public.tenants for update
  using (id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- branches
create policy branches_select on public.branches for select
  using (tenant_id = public.current_tenant_id());
create policy branches_write on public.branches for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
create policy branches_update on public.branches for update
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
create policy branches_delete on public.branches for delete
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- roles
create policy roles_select on public.roles for select
  using (tenant_id = public.current_tenant_id());
create policy roles_insert on public.roles for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
create policy roles_update on public.roles for update
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage') and not is_system);

-- profiles: everyone in a tenant can see teammates; only settings.manage can write others;
-- everyone can update their own row (e.g. full_name)
create policy profiles_select on public.profiles for select
  using (tenant_id = public.current_tenant_id());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid());
create policy profiles_update_admin on public.profiles for update
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- settings
create policy settings_select on public.settings for select
  using (tenant_id = public.current_tenant_id());
create policy settings_write on public.settings for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
create policy settings_update on public.settings for update
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- feature_flags
create policy flags_select on public.feature_flags for select
  using (tenant_id = public.current_tenant_id());
create policy flags_write on public.feature_flags for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
create policy flags_update on public.feature_flags for update
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- audit_logs: read-only from the client, written only by SECURITY DEFINER
-- functions/triggers (see 0003_audit_triggers.sql), never directly by users
create policy audit_select on public.audit_logs for select
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.read'));
