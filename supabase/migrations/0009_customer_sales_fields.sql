-- Customer contact fields and searchable customer linkage for Sales.
alter table public.customers add column if not exists phone text;
alter table public.daily_entries add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.daily_entries add column if not exists customer_phone text;

create or replace function public.ensure_customer_for_sale(
  p_name text,
  p_phone text default null,
  p_address text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  customer_id uuid;
begin
  if auth.uid() is null or not public.has_permission('daily_sales.write') then
    raise exception 'Not authorized to create a sales customer';
  end if;

  select id into customer_id
  from public.customers
  where tenant_id = public.current_tenant_id()
    and lower(trim(name)) = lower(trim(p_name))
  limit 1;

  if customer_id is null then
    insert into public.customers (tenant_id, name, customer_type, phone, billing_address)
    values (public.current_tenant_id(), trim(p_name), 'individual', nullif(trim(p_phone), ''), nullif(trim(p_address), ''))
    returning id into customer_id;
  else
    update public.customers
    set phone = coalesce(nullif(trim(p_phone), ''), phone),
        billing_address = coalesce(nullif(trim(p_address), ''), billing_address)
    where id = customer_id;
  end if;

  return customer_id;
end;
$$;

grant execute on function public.ensure_customer_for_sale(text, text, text) to authenticated;

notify pgrst, 'reload schema';
