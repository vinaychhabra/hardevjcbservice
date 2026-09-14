-- Allow the Supabase API roles to call the signup RPC and use the public schema.
-- RLS policies remain responsible for tenant and row-level authorization.
grant usage on schema public to anon, authenticated;
grant execute on function public.create_tenant_and_owner(text, text, text, text) to anon, authenticated;

-- The client uses the authenticated API role for these tenant-scoped tables.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Client forms omit tenant_id; populate it from the authenticated profile
-- before RLS evaluates the insert.
create or replace function public.set_current_tenant_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
	if new.tenant_id is null then
		new.tenant_id := public.current_tenant_id();
	end if;
	return new;
end;
$$;

do $$
declare
	table_name text;
begin
	foreach table_name in array array[
		'customers', 'contacts', 'sites', 'equipment_categories', 'assets', 'operators',
		'leads', 'quotes', 'quote_line_items', 'rental_contracts', 'usage_logs',
			'settings', 'feature_flags', 'invoices', 'invoice_line_items', 'payments'
end $$;
