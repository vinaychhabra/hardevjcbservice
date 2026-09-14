-- Unlink historical sales from archived machines so they no longer display as active excavators.
-- This keeps the record for audit/history while removing the stale machine link.

alter table public.daily_entries alter column asset_id drop not null;

update public.daily_entries d
set asset_id = null
where d.asset_id is not null
  and exists (
    select 1
    from public.assets a
    where a.id = d.asset_id
      and a.is_active = false
  );

notify pgrst, 'reload schema';
