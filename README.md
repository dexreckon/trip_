# Margalla Trail 5 Trip — setup (≈15 minutes, all free tiers)

A static web app (no build step) + Supabase for database, screenshot storage, login and live updates.

## 1. Create the Supabase project
1. Go to <https://supabase.com> → New project (any name, pick a region close to Pakistan, e.g. Singapore/Mumbai).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: turn **OFF "Confirm email"** (students sign up with roll number + password, there is no real email).
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`.

## 2. Create the 2 organizer accounts
1. **Authentication → Users → Add user → Create new user**: enter an email + password, tick *Auto Confirm User*. Do this twice.
2. **SQL Editor** → run (use your two emails):
```sql
insert into organizers (user_id, name)
select id, 'Organizer 1' from auth.users where email = 'first@example.com';
insert into organizers (user_id, name)
select id, 'Organizer 2' from auth.users where email = 'second@example.com';
```
Organizers log in on the same site using the **Log in** tab with their **email** (students use their roll number).

## 3. Deploy on Vercel
- Push this folder to GitHub → Vercel → *Add New Project* → import it (Framework: **Other**, no build command, output = root). Or run `npx vercel --prod` in this folder.
- Open the Vercel URL once, log in as an organizer → **Settings** tab → set price, trip date, destination, bank/wallet details, organizer phone numbers.
- Send the link to students.

## How it works
| Who | What |
|---|---|
| Student | Register (name, roll no, phone, emergency contact + relation, password) → payment screen (bank details, upload screenshot) → "verification pending" → auto-opens dashboard once confirmed |
| Student dashboard | Countdown, destination/details, live organizer messages, personal QR code, trip progress timeline, 🚨 Emergency button |
| Organizer | Overview (students, money collected, pending), Payments (view screenshot → Confirm / Reject with reason), Attendance (scan QR or mark manually for 4 checkpoints), Alerts (broadcast), Emergencies (call student / family, map link), Students (search, CSV export), Settings (price etc.) |

Attendance checkpoints: Left University → Arrived at Trail 5 → Leaving for Food → Back at University.

## Home-screen install ("shortcut")
- **Android / Chrome**: an *"Add Trail 5 Trip to your home screen — Install"* banner appears automatically; one tap installs it.
- **iPhone / Safari**: Apple does not allow websites to add themselves. The app shows a banner with the 3-step guide (Share → Add to Home Screen).

## Notes
- Forgot password: reset the user in Supabase → Authentication → Users.
- Payment screenshots are in a **private** bucket; only that student and organizers can open them.
- Pop-up notifications only fire while the app is open or in the background tab; there is no server push. Organizers should keep the Emergencies screen open during the trip.
- The QR code is cached on the student's phone, so it still shows with weak signal at the trail. Organizers need internet to save each scan.
- Changing `app.js`/`style.css` later? Bump `VERSION` in `sw.js` so phones pick up the update.
