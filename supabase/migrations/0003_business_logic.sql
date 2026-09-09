-- =========================================================================
-- 0003_business_logic.sql
-- With no backend server, the handful of things that MUST happen
-- server-side (audit trail, invoice numbering, payment totals, asset
-- status sync) move into Postgres triggers/functions instead. The
-- frontend never computes these itself — it just inserts/updates rows
-- and lets the database keep everything consistent.
-- =========================================================================

-- ---------- generic audit trigger ----------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid;
  v_entity_id text;
begin
  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);
  v_entity_id := coalesce(new.id, old.id)::text;

  insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, before, after)
  values (
    v_tenant_id,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_trigger();
create trigger trg_audit_assets after insert or update or delete on public.assets
  for each row execute function public.audit_trigger();
create trigger trg_audit_contracts after insert or update or delete on public.rental_contracts
  for each row execute function public.audit_trigger();
create trigger trg_audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.audit_trigger();
create trigger trg_audit_payments after insert on public.payments
  for each row execute function public.audit_trigger();
create trigger trg_audit_settings after insert or update on public.settings
  for each row execute function public.audit_trigger();

-- ---------- configurable document numbering (Settings namespace='numbering') ----------
create or replace function public.next_document_number(p_tenant_id uuid, p_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_setting record;
  v_prefix text;
  v_seq int;
begin
  select * into v_setting from public.settings
    where tenant_id = p_tenant_id and namespace = 'numbering' and key = p_doc_type
    for update;

  if v_setting is null then
    v_prefix := case p_doc_type when 'invoice' then 'INV-' when 'quote' then 'QTE-' else upper(p_doc_type) || '-' end;
    v_seq := 1;
    insert into public.settings (tenant_id, namespace, key, value)
      values (p_tenant_id, 'numbering', p_doc_type, jsonb_build_object('prefix', v_prefix, 'next_seq', v_seq + 1));
  else
    v_prefix := v_setting.value->>'prefix';
    v_seq := (v_setting.value->>'next_seq')::int;
    update public.settings set value = jsonb_build_object('prefix', v_prefix, 'next_seq', v_seq + 1) where id = v_setting.id;
  end if;

  return v_prefix || lpad(v_seq::text, 5, '0');
end;
$$;

create or replace function public.set_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := public.next_document_number(new.tenant_id, 'invoice');
  end if;
  return new;
end;
$$;
create trigger trg_invoice_number before insert on public.invoices
  for each row execute function public.set_invoice_number();

create or replace function public.set_quote_number()
returns trigger language plpgsql as $$
begin
  if new.quote_number is null or new.quote_number = '' then
    new.quote_number := public.next_document_number(new.tenant_id, 'quote');
  end if;
  return new;
end;
$$;
create trigger trg_quote_number before insert on public.quotes
  for each row execute function public.set_quote_number();

-- ---------- payments: applying a payment updates the invoice automatically ----------
create or replace function public.apply_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.invoices
    set amount_paid = amount_paid + new.amount,
        status = case
          when amount_paid + new.amount >= total then 'paid'
          when amount_paid + new.amount > 0 then 'partially_paid'
          else status
        end
    where id = new.invoice_id and tenant_id = new.tenant_id;
  return new;
end;
$$;
create trigger trg_apply_payment after insert on public.payments
  for each row execute function public.apply_payment();

-- ---------- rental contracts: keep asset.status in sync with contract status ----------
create or replace function public.sync_asset_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and new.status = 'active' then
    update public.assets set status = case when new.start_date > current_date then 'reserved' else 'on_rent' end
      where id = new.asset_id and tenant_id = new.tenant_id;
  elsif TG_OP = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('completed', 'cancelled', 'expired') then
      update public.assets set status = 'available' where id = new.asset_id and tenant_id = new.tenant_id;
    elsif new.status = 'active' then
      update public.assets set status = 'on_rent' where id = new.asset_id and tenant_id = new.tenant_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_sync_asset_status after insert or update on public.rental_contracts
  for each row execute function public.sync_asset_status();

-- ---------- usage logs: keep the asset's running meter reading current ----------
create or replace function public.sync_asset_meter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.end_meter is not null then
    update public.assets set current_meter_reading = new.end_meter
      where id = new.asset_id and tenant_id = new.tenant_id;
  end if;
  return new;
end;
$$;
create trigger trg_sync_asset_meter after insert on public.usage_logs
  for each row execute function public.sync_asset_meter();

-- ---------- quote line items: recompute quote totals whenever items change ----------
create or replace function public.recompute_quote_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_subtotal numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_subtotal from public.quote_line_items where quote_id = v_quote_id;
  update public.quotes set subtotal = v_subtotal, total = v_subtotal + tax_total where id = v_quote_id;
  return coalesce(new, old);
end;
$$;
create trigger trg_recompute_quote after insert or update or delete on public.quote_line_items
  for each row execute function public.recompute_quote_totals();

-- ---------- invoice line items: recompute invoice totals (incl. tax) whenever items change ----------
create or replace function public.recompute_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_subtotal numeric(14,2);
  v_tax numeric(14,2);
begin
  select coalesce(sum(amount), 0), coalesce(sum(amount * tax_rate_pct / 100), 0)
    into v_subtotal, v_tax from public.invoice_line_items where invoice_id = v_invoice_id;
  update public.invoices set subtotal = v_subtotal, tax_total = v_tax, total = v_subtotal + v_tax where id = v_invoice_id;
  return coalesce(new, old);
end;
$$;
create trigger trg_recompute_invoice after insert or update or delete on public.invoice_line_items
  for each row execute function public.recompute_invoice_totals();
