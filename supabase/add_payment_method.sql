-- Run ONCE in Supabase → SQL Editor.
-- The app writes to a column named  payment_method  (with an underscore).
-- If you created a column called "payment method" (with a space) by hand,
-- this renames it; otherwise it creates payment_method. Safe to re-run.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings' and column_name = 'payment method')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings' and column_name = 'payment_method') then
    alter table public.bookings rename column "payment method" to payment_method;
  else
    alter table public.bookings add column if not exists payment_method text;
  end if;
end $$;

-- Values stored: 'online' | 'on_arrival' | 'company'  (NULL = not chosen)
