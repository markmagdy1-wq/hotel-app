-- Run this once in Supabase SQL Editor to enable the accountant role's
-- daily revenue/expense entry (manual form + Excel import) in the app.

-- 1) The table. One row per day per hotel.
--    NOTE: `hotel_id` must match the type used by your other tables
--    (rooms.hotel_id, staff.hotel_id, etc). This assumes uuid, referencing
--    a `hotels` table. If your hotel_id is a bigint/int, change the type
--    below (and drop the `references public.hotels(id)` if you don't have
--    a hotels table with that name).
create table if not exists public.finance_daily (
  id bigserial primary key,
  hotel_id uuid not null references public.hotels(id),
  entry_date date not null,

  -- revenue breakdown (matches the accountant's Excel columns)
  revenue_rooms numeric not null default 0,
  revenue_coffee_shop numeric not null default 0,
  revenue_pool_bar numeric not null default 0,
  revenue_beach numeric not null default 0,
  revenue_rentals numeric not null default 0,
  revenue_other numeric not null default 0,
  revenue_reported_total numeric,      -- optional: the sheet's own "اجمالى الايراد" column, for cross-checking only
  revenue_total numeric not null default 0,  -- computed sum of the revenue_* columns above, kept for fast dashboard queries

  -- expense breakdown
  expense_operating numeric not null default 0,
  expense_salaries numeric not null default 0,
  expense_partner_magdy numeric not null default 0,
  expense_partner_moheb numeric not null default 0,
  expense_partner_bola numeric not null default 0,
  expense_partner_kamel numeric not null default 0,
  expense_bank_deposit numeric not null default 0,
  expense_staff_advances numeric not null default 0,
  expense_fixed numeric not null default 0,
  expense_other numeric not null default 0,
  expense_reported_total numeric,      -- optional: the sheet's own "اجمالى المصروفات" column
  expenses_total numeric not null default 0, -- computed sum of the expense_* columns above

  balance_previous numeric,            -- optional: "الرصيد السابق", informational only
  balance_ending numeric,              -- optional: "الرصيد النهائى", informational only

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (hotel_id, entry_date)
);

create index if not exists finance_daily_hotel_date_idx on public.finance_daily (hotel_id, entry_date desc);

-- 2) Row Level Security.
alter table public.finance_daily enable row level security;

-- Only managers and accountants at the same hotel can read finance rows —
-- reception and analyst roles get no access to this table at all.
drop policy if exists finance_daily_select on public.finance_daily;
create policy finance_daily_select
on public.finance_daily for select
using (
  exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.hotel_id = finance_daily.hotel_id
      and s.role in ('manager', 'accountant')
  )
);

drop policy if exists finance_daily_insert on public.finance_daily;
create policy finance_daily_insert
on public.finance_daily for insert
with check (
  exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.hotel_id = finance_daily.hotel_id
      and s.role in ('manager', 'accountant')
  )
);

drop policy if exists finance_daily_update on public.finance_daily;
create policy finance_daily_update
on public.finance_daily for update
using (
  exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and s.hotel_id = finance_daily.hotel_id
      and s.role in ('manager', 'accountant')
  )
);

-- 3) If inserting a staff row with role = 'accountant' fails with a check
--    constraint error, your `staff` table restricts which role values are
--    allowed. Find the constraint name with:
--      select conname from pg_constraint where conrelid = 'public.staff'::regclass;
--    then drop and recreate it to include 'accountant', e.g.:
--      alter table public.staff drop constraint <name_you_found>;
--      alter table public.staff add constraint staff_role_check
--        check (role in ('reception', 'manager', 'analyst', 'accountant'));
