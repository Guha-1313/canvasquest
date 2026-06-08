# CanvasQuest

A gamified Canvas LMS PWA. Turn your assignments into quests, earn coins for on-time submissions, level up your wizard, and compete on the leaderboard — installable on iPhone and Android.

---

## Quick Start

1. Open the deployed app (or run locally with `npx serve .`)
2. Tap **Try Demo** to explore with mock data, or enter your Canvas credentials
3. Add to your home screen for the full PWA experience

---

## Getting Your Canvas Personal Access Token

1. Log in to your Canvas account in a browser
2. Click your profile picture → **Account** → **Settings**
3. Scroll to **Approved Integrations** → click **+ New Access Token**
4. Set a purpose (e.g. "CanvasQuest") and an optional expiry date
5. Click **Generate Token** and copy the token immediately — it won't be shown again
6. Paste it into the CanvasQuest setup screen

> **Note:** Your token is stored only in your browser's localStorage and is never sent to any CanvasQuest server. It is only used to call your school's Canvas API directly.

---

## Supabase Setup (Leaderboard)

The leaderboard requires a free [Supabase](https://supabase.com) project.

### 1. Create a project

Sign up at supabase.com and create a new project. Note your **Project URL** and **anon public key** from **Settings → API**.

### 2. Run the schema SQL

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
-- Leaderboard table
create table leaderboard (
  id uuid default gen_random_uuid() primary key,
  username text not null unique,
  canvas_domain text not null,
  coins integer default 0,
  level integer default 1,
  xp integer default 0,
  streak integer default 0,
  assignments_completed integer default 0,
  updated_at timestamptz default now()
);
alter table leaderboard enable row level security;
create policy "Public read"   on leaderboard for select using (true);
create policy "Insert own"    on leaderboard for insert with check (true);
create policy "Update own"    on leaderboard for update using (true);

-- Guild events table
create table guild_events (
  id uuid default gen_random_uuid() primary key,
  canvas_domain text not null,
  course_name text not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);
alter table guild_events enable row level security;
create policy "Public read"   on guild_events for select using (true);
create policy "Public insert" on guild_events for insert with check (true);
```

### 3. Add your credentials to app.js

Open `app.js` and fill in near the top:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-public-key';
```

---

## Cloudflare Worker Setup (CORS Proxy)

Canvas blocks direct API calls from browsers due to CORS. The included `worker.js` is a lightweight Cloudflare Worker proxy that forwards requests and adds the required headers.

### Deploy steps

1. Sign up for a free [Cloudflare](https://dash.cloudflare.com) account
2. Go to **Workers & Pages** → **Create Worker**
3. Paste the contents of `worker.js` into the editor
4. Click **Deploy** — note your worker URL (e.g. `https://canvasquest-proxy.yourname.workers.dev`)

### Configure CanvasQuest to use the proxy

In `app.js`, find the `apiFetch` function and update the base URL to route through your worker:

```js
// Before (direct):
const res = await fetch(`https://${Store.get('cq_domain')}/api/v1${path}`, { headers });

// After (proxied):
const base = `https://your-worker.workers.dev/api/v1${path}?domain=${Store.get('cq_domain')}`;
const res  = await fetch(base, { headers });
```

> The proxy only accepts requests to `*.instructure.com` domains and does not log credentials.

---

## Add to Home Screen

### iPhone (Safari)

1. Open the app URL in **Safari** (not Chrome)
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down and tap **Add to Home Screen**
4. Name it "CanvasQuest" and tap **Add**

The app will open full-screen without browser chrome, like a native app.

### Android (Chrome)

1. Open the app URL in **Chrome**
2. Tap the **⋮ menu** (top right) → **Add to Home screen**
3. Tap **Add** on the confirmation dialog

Or: Chrome may show an **"Install app"** banner automatically after a few visits.

---

## Phase 2 — OAuth (Planned)

The current setup uses a personal access token (manually generated). A future version will use Canvas OAuth 2.0 so users can authorize CanvasQuest directly without generating a token manually.

This requires a Canvas developer key (admin access) and a redirect URI — not available for personal/student use yet.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML + CSS + JS (no framework) |
| Auth | Canvas personal access token (localStorage) |
| Data | Canvas LMS REST API |
| Offline | Service Worker (cache-first PWA) |
| Leaderboard | Supabase (Postgres + anon key) |
| CORS Proxy | Cloudflare Worker |
| Hosting | Vercel |

---

## License

MIT
