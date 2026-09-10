-- Add receipt/bill attachments for expenses and maintenance records.
alter table public.expenses add column if not exists receipt_url text;
alter table public.maintenance_records add column if not exists receipt_url text;

insert into storage.buckets (id, name, public)
values ('finance-attachments', 'finance-attachments', false)
on conflict (id) do nothing;

create policy finance_attachments_select on storage.objects
  for select using (
    bucket_id = 'finance-attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy finance_attachments_insert on storage.objects
  for insert with check (
    bucket_id = 'finance-attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy finance_attachments_update on storage.objects
  for update using (
    bucket_id = 'finance-attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy finance_attachments_delete on storage.objects
  for delete using (
    bucket_id = 'finance-attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
