-- Run this ONCE in Supabase → SQL Editor.
-- Lets manager + reception staff UPDATE guests, bookings and rooms of their own
-- hotel (needed for the Edit and Switch buttons on the Bookings tab).
-- Safe to re-run. Adds policies only; it does not remove any existing ones.

alter table public.guests   enable row level security;
alter table public.bookings enable row level security;
alter table public.rooms    enable row level security;

drop policy if exists guests_update_staff on public.guests;
create policy guests_update_staff
on public.guests for update
using (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = guests.hotel_id
            and s.role in ('manager', 'reception'))
)
with check (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = guests.hotel_id
            and s.role in ('manager', 'reception'))
);

drop policy if exists bookings_update_staff on public.bookings;
create policy bookings_update_staff
on public.bookings for update
using (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = bookings.hotel_id
            and s.role in ('manager', 'reception'))
)
with check (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = bookings.hotel_id
            and s.role in ('manager', 'reception'))
);

drop policy if exists rooms_update_staff on public.rooms;
create policy rooms_update_staff
on public.rooms for update
using (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = rooms.hotel_id
            and s.role in ('manager', 'reception'))
)
with check (
  exists (select 1 from public.staff s
          where s.user_id = auth.uid()
            and s.hotel_id = rooms.hotel_id
            and s.role in ('manager', 'reception'))
);

-- Check that the bookings table has the columns the app writes:
--   discount numeric default 0, total_amount numeric default 0, booking_type text
-- If either is missing, run:
-- alter table public.bookings add column if not exists discount numeric default 0;
-- alter table public.bookings add column if not exists total_amount numeric default 0;
