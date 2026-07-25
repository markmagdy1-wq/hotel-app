# The Front Desk

A hotel reception/booking app (React + Supabase).

## Project structure
```
index.html              ← entry HTML page
src/main.jsx             ← mounts the React app
src/HotelReception.jsx    ← the whole app (rooms, bookings, guests, users, etc.)
supabase/functions/       ← Edge Functions for staff account management
```

## 1. Push this to GitHub
From inside this folder:
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 2. Deploy on Vercel
1. Go to vercel.com → **Add New → Project** → import this GitHub repo.
2. Vercel will auto-detect **Vite** as the framework — leave the defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Root Directory: `.` (leave blank/default, since these files sit at the repo root)
3. Deploy. The 404 you saw before was because the repo had no
   `package.json`/`index.html` for Vercel to build — this project fixes that.

## 3. Deploy the Supabase Edge Functions
The Users tab (staff management) depends on two Edge Functions. See the
separate `DEPLOY_STAFF_FUNCTIONS.md` for full steps — short version:
```
npm install -g supabase
supabase login
supabase link --project-ref jdzlbanicwdzzsdufvxc
supabase functions deploy create-staff-user
supabase functions deploy delete-staff-user
```

## 4. Run locally (optional, to test before pushing)
```
npm install
npm run dev
```
