-- Only needed if you already ran the ORIGINAL finance_setup.sql (the one
-- with a single `expense_partner_current` column). If you're setting up
-- finance_daily for the first time, just run the updated finance_setup.sql
-- instead — it already has the 4 partner columns and you can skip this file.

alter table public.finance_daily
  add column if not exists expense_partner_magdy numeric not null default 0,
  add column if not exists expense_partner_moheb numeric not null default 0,
  add column if not exists expense_partner_bola numeric not null default 0,
  add column if not exists expense_partner_kamel numeric not null default 0;

-- Best-effort only: any amount already saved in the old combined column
-- gets dumped into "م. محب" so nothing is silently lost — but since the old
-- column mixed different partners together, go through those rows by hand
-- and move each amount to the correct partner column.
update public.finance_daily
set expense_partner_moheb = expense_partner_current
where expense_partner_current is not null and expense_partner_current <> 0;

alter table public.finance_daily drop column if exists expense_partner_current;
