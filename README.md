# StudyRank

Competitive study tracker. AI camera verifies your focus. Rank up against friends.

---

## Week 1 — What's built

- Auth (email/password + Google OAuth) via Supabase
- Onboarding flow with placement quiz
- Dashboard with stats + friends leaderboard
- Session timer (camera in week 2)
- Full design system (dark theme, rank badges, stats cards)

---

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)

---

## 1. Environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in your Supabase project → **Settings → API**.

---

## 2. Supabase database setup

1. Go to your Supabase project → **SQL Editor**
2. Paste and run the entire contents of `supabase/migrations/001_initial_schema.sql`

This creates:
- `profiles` table with rank fields
- `sessions` table
- Trigger that auto-creates a profile row on every new signup
- Row Level Security policies (users can only access their own data)

---

## 3. Google OAuth setup

In Supabase dashboard:

1. Go to **Authentication → Providers → Google** and enable it
2. In **Google Cloud Console** (console.cloud.google.com):
   - Create a project (or use existing)
   - **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs:
     - `https://your-project-ref.supabase.co/auth/v1/callback`
     - `http://localhost:3000/auth/callback` (for local dev)
   - Copy **Client ID** and **Client Secret**
3. Paste them into the Supabase Google provider form and save
4. In Supabase → **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (update after deploy)
   - Redirect URLs: add `http://localhost:3000/auth/callback`

---

## 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 5. Deploy to Vercel

```bash
git init && git add . && git commit -m "week 1 foundation"
git remote add origin https://github.com/your-username/studyranked.git
git push -u origin main
```

Then in Vercel:

1. Import your GitHub repo at vercel.com/new
2. Framework preset: **Next.js** (auto-detected)
3. Add **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

After deploy, update Supabase:
- **Authentication → URL Configuration → Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`
- Update Google Cloud Console redirect URIs to include the production URL

---

## 6. Week 2 — Camera + focus detection

### Focus Tracking
- `components/camera/FocusTracker.tsx` — access `getUserMedia`, render to canvas
- Integrate MediaPipe FaceMesh or `face-api.js` (WebAssembly, runs fully in-browser — no uploads)
- Track gaze direction and head pose → derive a focus score per second
- Feed `verified_seconds` + `distraction_count` into Supabase on session end

### Session Flow
- Write a `sessions` row on start, update it on end
- Calculate `rank_points_earned` based on verified focus ratio
- Add `/session/[id]/summary` post-session recap page

### Rank Engine
- Recalculate `rank_tier` + `rank_division` after each session
- Animated rank-up modal when a threshold is crossed (100 RP = next division)

### Friends
- Invite by username or shareable link
- Real-time leaderboard via Supabase Realtime
- Weekly reset cron (Edge Function resets `weekly_hours` every Monday)
