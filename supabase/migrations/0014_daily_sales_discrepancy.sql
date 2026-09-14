-- Add a manual fraud/discrepancy flag for daily machine logs.
alter table public.daily_entries
  add column if not exists discrepancy_flag boolean not null default false,
  add column if not exists discrepancy_note text;

notify pgrst, 'reload schema';
