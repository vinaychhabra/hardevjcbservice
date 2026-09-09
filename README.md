# EquipRent OS — Frontend (React + Supabase)

A multi-tenant equipment rental CRM/ERP. No custom backend server — React
talks directly to Supabase (Postgres + Auth), and tenant isolation +
role-based permissions are enforced entirely by Postgres Row Level
Security. A handful of Postgres triggers/functions handle the few things
that must happen server-side (audit logging, invoice numbering, applying
payments, keeping asset status in sync with contracts).

## 1. Create your Supabase project

1. Go to https://supabase.com, create a new project, wait for it to provision.
2. In **Project Settings > API**, copy the **Project URL** and **anon public key**.
3. In **Authentication > Providers**, make sure Email is enabled. For
   local testing, under **Authentication > Settings**, you can turn off
   "Confirm email" so signup logs you straight in.

## 2. Run the migrations

In the Supabase dashboard, open the **SQL Editor** and run these three
files **in order** (or use the Supabase CLI: `supabase db push`):

```
supabase/migrations/0001_core.sql
supabase/migrations/0002_domain.sql
supabase/migrations/0003_business_logic.sql
```

Optionally, after your first tenant signs up, run
`supabase/seed_sample_categories.sql` (with the tenant UUID filled in)
to get some example equipment categories to start from.

## 3. Configure the frontend

```bash
cp .env.example .env
# edit .env with your Project URL and anon key
npm install
npm run dev
```

Open http://localhost:5173, click **Create a company account**, and
you're the owner of a new tenant.

## 4. Deploy

- **Frontend**: push this repo to GitHub, import it in Vercel, set the
  same two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
  the Vercel project settings, deploy.
- **Database**: already live in Supabase — nothing else to deploy for
  Phase 0/1.

## How tenant isolation & permissions work

- Every business table has a `tenant_id` column and Row Level Security
  enabled. Policies check `tenant_id = public.current_tenant_id()`,
  where `current_tenant_id()` looks up the signed-in user's tenant from
  `public.profiles`. A user can never see or write another tenant's rows,
  no matter what the frontend code does.
- Permissions work the same way: `public.has_permission('customers.write')`
  checks the signed-in user's role. Roles and their permission arrays
  live in `public.roles`, editable from Settings > Roles & Users.
- `role.permissions` containing `'*'` means "all permissions" — that's
  what the seeded `owner` role gets.

## What's built (Phase 0 + Phase 1)

- Signup/login, multi-tenant provisioning (`create_tenant_and_owner` RPC)
- Customers & contacts, Sites, Equipment categories (fully
  tenant-defined, with per-category custom fields), Assets, Operators
- Leads, Quotes (server-computed totals via trigger)
- Rental contracts (one-off, recurring, fixed-monthly — via
  `contract_type`), daily usage log, automatic asset status sync
- Invoices (auto-numbered, server-computed totals) & payments
  (auto-applied to invoice balance/status)
- Owner dashboard: fleet status breakdown, active rentals, overdue AR
- Settings: billing units & tax defaults, document numbering, roles &
  permissions, team member list — all backed by a generic
  `settings` key/value table so new config doesn't need new migrations

## Known gap: inviting teammates

Creating a new Supabase Auth user for someone else requires the
**service role key**, which must never be exposed in the browser. Right
now, add teammates manually via the Supabase dashboard (Authentication >
Users > Invite), then insert a matching row into `public.profiles` with
their `tenant_id` and `role_id`. Phase 3 will add a small Edge Function
to do this from the Settings UI instead.

## What's next (see phase plan)

Phase 2 (recurring billing, expenses, maintenance, reports) and beyond
will need a small number of **Supabase Edge Functions** — not a full
backend server, just serverless functions for anything that needs a
schedule (cron), a secret API key (WhatsApp, AI), or a webhook.
