# Deploying the staff-management fix

## What was wrong
"Add user" in the Users tab only wrote to the app's own local key-value
storage (`window.storage`) — it never touched Supabase. There was no code
path that created a Supabase Auth account or a `staff` row, so nothing
showed up in your database. (There was also a smaller bug: the app wasn't
even passing your logged-in Supabase session down to the component that
needed it.)

Creating real Supabase Auth users requires the **service role key**, which
must never be shipped to the browser — so this has to go through a small
server-side function. That's what's added here.

## What's included
- `supabase/functions/create-staff-user/index.ts` — creates a real Supabase
  Auth user and links them to your hotel via the `staff` table. Only
  callable by a signed-in manager.
- `supabase/functions/delete-staff-user/index.ts` — removes a staff member's
  access (and optionally deletes their login entirely). Only callable by a
  signed-in manager.
- `hotel-reception.jsx` — updated app. The Users tab now calls these
  functions instead of local storage, and lists the real staff at your
  hotel (pulled live from Supabase).

## Deploy steps

1. Install the Supabase CLI if you don't have it:
   ```
   npm install -g supabase
   ```

2. Log in and link the CLI to your project (from your project folder):
   ```
   supabase login
   supabase link --project-ref jdzlbanicwdzzsdufvxc
   ```

3. Deploy both functions:
   ```
   supabase functions deploy create-staff-user
   supabase functions deploy delete-staff-user
   ```

   No manual secrets needed — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` are automatically available to every Edge
   Function in your project.

4. Replace your app's `hotel-reception.jsx` with the updated one here.

## How it works now
1. A manager must be signed in with a **real Supabase account** (email +
   password that matches a row in `auth.users`, linked via `staff`) — not
   one of the old local/demo logins. The Users tab tells you plainly if
   you're on a local session and can't add staff yet.
2. Filling in the "Add a user" form calls `create-staff-user`, which:
   - Verifies you're a manager (via your JWT, checked server-side)
   - Creates the Supabase Auth account
   - Inserts the matching `staff` row for your hotel
3. The staff list under "Staff at this hotel" is now fetched live from
   Supabase, not local storage — so it's accurate across devices and
   sessions.
4. "Remove" calls `delete-staff-user`, which deletes both the `staff` link
   and the underlying login.

## One thing to set up first
Your very first manager account still needs to exist before any of this
works, since you need *a* manager to create other staff. Do that once,
manually, from the Supabase dashboard:
- **Authentication → Users → Add user** (set email + password)
- **Table Editor → staff → Insert row**: `user_id` = the new user's ID,
  `hotel_id` = your hotel's ID (from the `hotels` table), `role` =
  `manager`, `display_name` = their name.

After that, that manager can log in with their real email/password and add
everyone else through the Users tab.
