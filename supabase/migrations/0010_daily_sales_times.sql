-- Preserve optional start/end working times for hourly Sales entries.
alter table public.daily_entries add column if not exists start_time time;
alter table public.daily_entries add column if not exists end_time time;

notify pgrst, 'reload schema';
