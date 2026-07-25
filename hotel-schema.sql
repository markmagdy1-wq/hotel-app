-- ============================================================
-- The Front Desk — Supabase schema
-- Run this in your Supabase project's SQL Editor (Dashboard →
-- SQL Editor → New query), all at once, top to bottom.
-- ============================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Hotels (multi-property support)
-- ------------------------------------------------------------
create table hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Staff — links a real Supabase Auth user to one hotel + role
--    role: 'reception' | 'manager' | 'analyst'
-- ------------------------------------------------------------
create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  role text not null check (role in ('reception', 'manager', 'analyst')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Small helper used by every policy below: "which hotel(s) can the
-- current logged-in user see, and are they a manager there?"
create or replace function my_hotel_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select hotel_id from staff where user_id = auth.uid();
$$;

create or replace function is_manager_at(target_hotel uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid()
      and hotel_id = target_hotel
      and role = 'manager'
  );
$$;

-- ------------------------------------------------------------
-- 3. Rooms
-- ------------------------------------------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  number text not null,
  floor int,
  type text not null, -- 'One Bedroom' | 'Two Bedrooms' | 'Three Bedrooms'
  status text not null default 'vacant_clean',
  notes text default '',
  maintenance_baseline int not null default 0,
  last_cleaned_date date,
  created_at timestamptz not null default now(),
  unique (hotel_id, number)
);

-- ------------------------------------------------------------
-- 4. Guests
-- ------------------------------------------------------------
create table guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  national_id text,
  notes text default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. Bookings
-- ------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  persons int not null default 1,
  meal_plans text[] not null default '{}',
  status text not null default 'reserved', -- reserved | checked_in | checked_out | cancelled
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);

-- ------------------------------------------------------------
-- 6. Tickets (walk-in / day tickets)
-- ------------------------------------------------------------
create table tickets (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  persons int not null default 1,
  amount_paid numeric not null default 0,
  ticket_date date not null,
  notes text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. Maintenance log (each time maintenance is marked done)
-- ------------------------------------------------------------
create table maintenance_log (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  logged_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8. Pricing (per person / night)
-- ------------------------------------------------------------
create table room_rates (
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type text not null,
  rate numeric not null,
  primary key (hotel_id, room_type)
);

create table meal_plan_rates (
  hotel_id uuid not null references hotels(id) on delete cascade,
  plan text not null, -- 'HB' | 'FB' | 'All-inclusive'
  rate numeric not null,
  primary key (hotel_id, plan)
);

-- ============================================================
-- Row-level security — every table is locked to the caller's hotel
-- ============================================================
alter table hotels enable row level security;
alter table staff enable row level security;
alter table rooms enable row level security;
alter table guests enable row level security;
alter table bookings enable row level security;
alter table tickets enable row level security;
alter table maintenance_log enable row level security;
alter table room_rates enable row level security;
alter table meal_plan_rates enable row level security;

-- hotels: a user can see the hotel(s) they belong to
create policy "see own hotel" on hotels
  for select using (id in (select my_hotel_ids()));

-- staff: users can see other staff at their own hotel; only managers
-- can add/remove/edit staff at their hotel
create policy "see staff at own hotel" on staff
  for select using (hotel_id in (select my_hotel_ids()));
create policy "managers manage staff" on staff
  for all using (is_manager_at(hotel_id))
  with check (is_manager_at(hotel_id));

-- rooms: reception + manager + analyst can view; reception + manager
-- can write; nobody needs delete in normal operation
create policy "view rooms at own hotel" on rooms
  for select using (hotel_id in (select my_hotel_ids()));
create policy "edit rooms at own hotel" on rooms
  for insert with check (hotel_id in (select my_hotel_ids()));
create policy "update rooms at own hotel" on rooms
  for update using (hotel_id in (select my_hotel_ids()));

-- guests
create policy "view guests at own hotel" on guests
  for select using (hotel_id in (select my_hotel_ids()));
create policy "add guests at own hotel" on guests
  for insert with check (hotel_id in (select my_hotel_ids()));

-- bookings: everyone at the hotel can view/create/update; only
-- managers can hard-delete a record (matches the "Analytics delete"
-- feature — reception can still cancel via status update)
create policy "view bookings at own hotel" on bookings
  for select using (hotel_id in (select my_hotel_ids()));
create policy "create bookings at own hotel" on bookings
  for insert with check (hotel_id in (select my_hotel_ids()));
create policy "update bookings at own hotel" on bookings
  for update using (hotel_id in (select my_hotel_ids()));
create policy "managers delete bookings" on bookings
  for delete using (is_manager_at(hotel_id));

-- tickets: same pattern as bookings
create policy "view tickets at own hotel" on tickets
  for select using (hotel_id in (select my_hotel_ids()));
create policy "create tickets at own hotel" on tickets
  for insert with check (hotel_id in (select my_hotel_ids()));
create policy "managers delete tickets" on tickets
  for delete using (is_manager_at(hotel_id));

-- maintenance log: view + insert for everyone at the hotel
create policy "view maintenance log at own hotel" on maintenance_log
  for select using (hotel_id in (select my_hotel_ids()));
create policy "log maintenance at own hotel" on maintenance_log
  for insert with check (hotel_id in (select my_hotel_ids()));

-- pricing: everyone at the hotel can view; only managers can change it
create policy "view room rates at own hotel" on room_rates
  for select using (hotel_id in (select my_hotel_ids()));
create policy "managers set room rates" on room_rates
  for insert with check (is_manager_at(hotel_id));
create policy "managers update room rates" on room_rates
  for update using (is_manager_at(hotel_id));

create policy "view meal plan rates at own hotel" on meal_plan_rates
  for select using (hotel_id in (select my_hotel_ids()));
create policy "managers set meal plan rates" on meal_plan_rates
  for insert with check (is_manager_at(hotel_id));
create policy "managers update meal plan rates" on meal_plan_rates
  for update using (is_manager_at(hotel_id));

-- ============================================================
-- Seed: one hotel, default rooms, default pricing
-- Replace 'My Hotel' with your real hotel name before running,
-- or edit it afterward in the `hotels` table.
-- ============================================================
insert into hotels (name) values ('My Hotel');

-- Default room rates (per person / night) — edit freely afterward
insert into room_rates (hotel_id, room_type, rate)
select id, unnest(array['One Bedroom','Two Bedrooms','Three Bedrooms']),
       unnest(array[500, 400, 350])
from hotels where name = 'My Hotel';

insert into meal_plan_rates (hotel_id, plan, rate)
select id, unnest(array['HB','FB','All-inclusive']),
       unnest(array[150, 250, 400])
from hotels where name = 'My Hotel';

-- 24 rooms across 4 floors, matching the app's current defaults
do $$
declare
  h_id uuid;
  f int;
  i int;
  room_type text;
begin
  select id into h_id from hotels where name = 'My Hotel';
  for f in 1..4 loop
    for i in 1..6 loop
      room_type := case
        when i <= 2 then 'One Bedroom'
        when i <= 4 then 'Two Bedrooms'
        else 'Three Bedrooms'
      end;
      insert into rooms (hotel_id, number, floor, type, status)
      values (h_id, f::text || lpad(i::text, 2, '0'), f, room_type, 'vacant_clean');
    end loop;
  end loop;
end $$;
