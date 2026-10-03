-- Run ONCE in Supabase → SQL Editor, BEFORE using the new app version.
-- Lets a booking be saved with no room yet (reception picks the room later
-- with the Edit button when the guest arrives).
alter table public.bookings alter column room_id drop not null;
