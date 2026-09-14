-- Receivables for invoices and Daily Sales jobs with partial payments.
create or replace function public.set_current_tenant_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_daily_entries_tenant on public.daily_entries;
create trigger trg_daily_entries_tenant before insert on public.daily_entries
  for each row execute function public.set_current_tenant_id();
drop trigger if exists trg_expenses_tenant on public.expenses;
create trigger trg_expenses_tenant before insert on public.expenses
  for each row execute function public.set_current_tenant_id();
drop trigger if exists trg_salary_payments_tenant on public.salary_payments;
create trigger trg_salary_payments_tenant before insert on public.salary_payments
  for each row execute function public.set_current_tenant_id();
drop trigger if exists trg_maintenance_records_tenant on public.maintenance_records;
create trigger trg_maintenance_records_tenant before insert on public.maintenance_records
  for each row execute function public.set_current_tenant_id();
alter table public.daily_entries add column if not exists due_date date;
alter table public.daily_entries add column if not exists amount_paid numeric(14,2) not null default 0;
update public.daily_entries set due_date = entry_date where due_date is null;
alter table public.daily_entries alter column due_date set default current_date;
alter table public.daily_entries alter column due_date set not null;

create table public.daily_entry_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  daily_entry_id uuid not null references public.daily_entries(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'cash',
  reference text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_daily_entry_payments_entry on public.daily_entry_payments (tenant_id, daily_entry_id);

create trigger trg_daily_entry_payments_tenant before insert on public.daily_entry_payments
  for each row execute function public.set_current_tenant_id();

alter table public.daily_entry_payments enable row level security;
create policy daily_entry_payments_select on public.daily_entry_payments for select
  using (tenant_id = public.current_tenant_id() and public.has_permission('daily_sales.read'));
create policy daily_entry_payments_insert on public.daily_entry_payments for insert
  with check (tenant_id = public.current_tenant_id() and public.has_permission('daily_sales.write'));

create or replace function public.apply_daily_entry_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.daily_entries
  set amount_paid = amount_paid + new.amount,
      payment_status = case
        when amount_paid + new.amount >= (amount + case when diesel_included then 0 else coalesce(diesel_cost, 0) end) then 'paid'
        when amount_paid + new.amount > 0 then 'partially_paid'
        else 'pending'
      end
  where id = new.daily_entry_id and tenant_id = new.tenant_id;
  return new;
end;
$$;
create trigger trg_apply_daily_entry_payment after insert on public.daily_entry_payments
  for each row execute function public.apply_daily_entry_payment();

create trigger trg_audit_daily_entry_payments after insert on public.daily_entry_payments
  for each row execute function public.audit_trigger();
