-- Track the full machine-day timeline so office departure/return can be audited.
-- This helps detect fraud or missed movement even when work start/end time is the main billing field.
alter table public.daily_entries
  add column if not exists office_departure_time time,
  add column if not exists office_return_time time;

notify pgrst, 'reload schema';
