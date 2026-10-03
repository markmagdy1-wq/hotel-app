# Adding the accountant role + Excel import

## What's new
- A new **Accountant console** (`AccountantConsole` in `src/HotelReception.jsx`)
  with three tabs: daily manual entry, Excel import (with a column-mapping
  step, since your monthly sheets don't all use the same column order), and
  a history table + revenue/expense chart.
- A new `finance_daily` Supabase table (see `supabase/finance_setup.sql`),
  scoped by `hotel_id` and protected by RLS — only `manager` and
  `accountant` roles can read or write it.
- The `create-staff-user` Edge Function now accepts `role: "accountant"`.
- The **Users** tab (already in your project, just never wired into the
  nav — fixed now) has a third "Accountant" button, and lives under
  Manager console → **Users**.

## Steps to deploy

1. **Run the SQL.** Open Supabase → SQL Editor, paste in
   `supabase/finance_setup.sql`, and run it. Read the comment at the top —
   if your `hotel_id` columns elsewhere aren't `uuid`, adjust the type
   before running.

2. **Redeploy the Edge Function** (it now allows the `accountant` role):
   ```
   supabase functions deploy create-staff-user
   ```

3. **Install the new dependency:**
   ```
   npm install
   ```
   (`xlsx` was added to `package.json`.)

4. **Push and redeploy** to Vercel as usual.

5. **Create your first accountant.** Sign in as a manager with a real
   Supabase account → **Users** tab → fill in name/email/password → pick
   **Accountant** → Add user.

## What's new (update 2)
- **Export button** on the Accountant console's History & chart tab: pick a
  from/to date range and it downloads an `.xlsx` file in the same
  column layout as your original monthly sheets.
- **"جارى الشريك" split into 4 columns** — one per partner (م. مجدى، م. محب،
  م. بولا، م. كاميل) — in the daily entry form, the Excel import mapping,
  and the export.
- If you already ran the original `finance_setup.sql`, run
  `supabase/migrate_partner_split.sql` once to add the 4 new columns (it
  best-effort copies any old combined amounts into "م. محب" — go back and
  redistribute those by hand since the old column mixed partners together).
  If you're setting up fresh, just run the updated `finance_setup.sql`.

Your monthly sheets don't all put columns in the same order (I checked —
January has extra balance/beach columns that September doesn't). So instead
of a blind fixed mapping, the import tab:
1. Reads the header rows of whichever sheet (tab) you pick and **guesses**
   which column is which based on the Arabic labels.
2. Shows you that mapping so you can fix anything it got wrong before
   building the preview.
3. Shows a **row-by-row preview** — editable — with a computed total next
   to the sheet's own reported total, so a mismatch is easy to catch before
   saving.
4. Only writes to Supabase when you press the final save button.

Everything (blank cells, `1E+05`-style scientific notation, stray text) is
cleaned to a plain number automatically.
