alter table public.rental_contracts
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists completed_date date;

-- Content already exists in the table for notes and status, so this migration is intentionally light.
-- It adds the missing fields used by the contract edit / completion workflow in the app.
