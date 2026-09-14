-- Track whether a discrepancy has been reviewed after the operator meeting.
alter table public.daily_entries
  add column if not exists is_reviewed boolean not null default false,
  add column if not exists reviewed_at timestamptz;

notify pgrst, 'reload schema';
