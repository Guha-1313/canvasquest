# CanvasQuest — CHANGELOG

---

## Session 1 — 2026-05-26

### Step 1 Complete: Scaffold + PWA Shell

**Files created:**
- `index.html` — App shell with 4-tab bottom nav (Quests, Leaderboard, Guild, Profile), `#app` render target, setup modal, service worker registration
- `style.css` — Full design token system (`--bg`, `--surface`, `--gold`, `--green`, `--text`, `--muted`, `--danger`), Cinzel + Inter fonts, mobile-first 375px base, fixed bottom nav with gold active indicator, RPG card style with gold glow on hover, skeleton shimmer animation, safe-area inset support for iPhone notch/home bar
- `app.js` — Hash router (hashchange listener, 4 routes), placeholder view renderers, setup modal with validation (domain/token/username), show/hide token toggle, localStorage persistence (`cq_domain`, `cq_token`, `cq_username`, `cq_setup`)
- `manifest.json` — PWA manifest, name: CanvasQuest, short_name: CQ, theme #0f0e17, display: standalone, 192 + 512 icons
- `sw.js` — Cache-first strategy for app shell (index.html, style.css, app.js, manifest.json), network-first for all `/api/` calls, old cache cleanup on activate
- `vercel.json` — sw.js no-cache header, manifest.json content-type header
- `generate-icons.html` — Open in browser once to download `icon-192.png` and `icon-512.png` (gold coin ⚡ design on dark background)
- `CHANGELOG.md` — This file

**Next step:** Step 2 — Canvas API Integration (real assignments fetched and displayed)

---

## Session 2 — 2026-05-26

### Step 2 Complete: Canvas API Integration

**Changes to app.js:**
- Added `CanvasAPI` module: `getCourses()`, `getAssignments()`, `fetchAllAssignments()`, `refreshAssignments()`, `getAll()`
- `getCourses()` — fetches active enrollments, filters access-restricted courses
- `getAssignments()` — includes submission data, maps to game shape, filters no-due-at and >30 days past
- `fetchAllAssignments()` — parallel Promise.all across all courses, sorts overdue-first then ascending
- 401 handler: clears token + setup flag, reloads to show setup modal
- CORS/network error: shows dismissable red banner via `Banner` module
- Loading state: 3 skeleton shimmer cards rendered immediately before fetch
- `renderQuestsView()`: splits active vs completed, completed collapsed in `<details>` toggle
- Assignment cards: course pill, coin badge, due-date label with color coding (overdue/today/tomorrow/soon), state badge (complete/late)
- `card-overdue` gets red left glow box-shadow
- Pull-to-refresh: touchstart/touchmove/touchend, 80px drag threshold calls `refreshAssignments()`

**Changes to style.css:**
- `.assignment-card`, `.card-complete`, `.card-late`, `.card-overdue` states
- `.course-pill`, `.coin-badge`, `.assignment-name`, `.due-label` variants
- `.state-badge` (complete green / late orange)
- `.cors-banner` sticky error bar
- `.pull-hint` pull-to-refresh indicator
- `<details>` completed section toggle

**Next step:** Step 3 — Coin Economy + Game State

---

## Session 3 — 2026-05-28

### Design v2: Full visual overhaul from Claude Design handoff (GradeRPG.html)

**Source:** Fetched and extracted design bundle from Claude Design (GradeRPG.html + app.css + screens.jsx). Read chat transcripts to understand final design intent: mobile app aesthetic, minimal, modern, iOS-frame reference.

**Landing screen (setup modal) → full redesign:**
- Full-screen hero layout matching the design: deep dark green radial gradient bg + SVG noise texture overlay
- Animated wizard hat photo (`assets/wizard-hat.png`) with chartreuse halo pulse + float animation
- Floating sparkle elements (CSS radial gradient, animated)
- Brand mark top-left (crosshair glyph + CANVAS·QUEST), "Try Demo" top-right
- Cinzel serif headline: "What kind of *wizard* would you like to be?" with italic green glow on "wizard"
- Setup form fields below hero: JetBrains Mono labels, dark glassy inputs, green focus ring
- CTA: lime green gradient pill button with glow box-shadow
- Page dots indicator

**Quests view → full redesign:**
- App header: Cinzel greeting name, refresh + bell icon pills
- Player card: avatar initial with LVL badge, RPG class title, coin count, XP bar with green gradient fill
- Segmented tabs: Today / Soon / Done with live counts, active green highlight
- Quest cards: 3px left accent strip (red/green/gray), course code mono, due date, title, coin+XP reward row, circular check button. Overdue strip pulses via keyframe. Hover blooms accent glow
- Section labels with gradient rule line

**Profile view → full redesign:**
- Large spinning-ring avatar, Cinzel name, JetBrains Mono class/level
- 3-up stat tiles (Coins gold, XP green, Streak neutral)
- Settings inline (domain display, refresh + reset buttons)

**New design tokens:**
- `--bg: #0a0a06`, `--green: #b8ff3a`, `--text: #ece6d6`, `--text-dim: #9a9486`, `--danger: #ff5c5c`
- Added `--bg-elev`, `--surface-2`, `--line`, `--line-2`, `--green-soft`, `--green-deep`, `--maroon`

**New font:** JetBrains Mono added for monospace labels throughout

**Asset added:** `assets/wizard-hat.png` (677KB, from design bundle)

**Next step:** Step 3 — Coin Economy + Game State

---

## Session 4 — 2026-05-28

### Step 3 Complete: Coin Economy + Game State

**Changes to app.js:**
- `GameState` expanded from read-only stubs into a full module
- `updateStreak(dateString)`: tracks daily submission streak — yesterday increments, 2+ day gap resets to 1, updates `longest` field; no-op if already updated today
- `processAssignment(assignment)`: idempotent (skips ids already in `cq_completed`). On-time (diff ≤ 0 days): full `coin_value` + 50 XP + streak update. Late (diff > 0): deducts `min(25 * ceil(diff), coin_value * 0.8)`, minimum 5 coins, +15 XP, appends to `cq_late_badges`. Saves to `cq_coins`, `cq_xp`, `cq_completed`, `cq_coin_history` (last 10 events). Returns `{ coinsEarned, wasLate, newTotal, leveledUp }`.
- `syncAllAssignments(assignments)`: runs `processAssignment` on every assignment, returns total earned this sync
- `getStats()`: returns `{ coins, xp, level, streak, completedCount, nextLevelXP }`
- `refreshAssignments()`: now calls `GameState.syncAllAssignments(allAssignments)` after fetch, before render — coins auto-award on every app open

**New localStorage keys:**
- `cq_streak` now includes `lastDate` field (null initially)
- `cq_late_badges` — JSON array of late assignment IDs
- `cq_coin_history` — JSON array, last 10 award events `{ id, name, coinsEarned, wasLate, ts }`

**Demo behavior:** On first demo load, assignments demo-7, demo-8, demo-9 (submitted/graded) are processed — player card immediately shows coins > 500 and XP > 0. Subsequent refreshes are idempotent.

**Next step:** Step 4 — Full Quest UI polish + coin burst animation + level-up modal

---

## Session 5 — 2026-05-28

### Steps 4 + 5 Complete: Quest UI Polish + Notifications

**Step 4 — Quest UI + Animations (app.js + style.css):**
- `dueInfo()`: upgraded due text to emoji variants — `⚠ OVERDUE — Xd ago`, `🚨 Due TODAY`, `Due Tomorrow`
- `questCardHtml()`: added `.q-done-banner` overlay chip (`✓ COMPLETE` green / `⚠ SUBMITTED LATE` orange) positioned top-right of done cards
- `showCoinBurst(coins)`: creates a fixed `.coin-burst` div that floats up and fades over 1.4s (CSS `@keyframes coin-burst`) — triggered after `syncAllAssignments` returns `totalEarned > 0`
- `showLevelUpModal(level)`: full-screen overlay with `.level-up-modal` pop animation — shows class title, level number, "Continue Quest" CTA; vibrates device on trigger; triggered 800ms after render when `leveledUp` flag is set
- CSS: `@keyframes coin-burst`, `@keyframes fade-in`, `@keyframes lum-pop`, `.coin-burst`, `.level-up-overlay`, `.level-up-modal`, `.lum-*`, `.q-done-banner`

**Step 5 — Notifications + Bell Tray (app.js + style.css):**
- `NotificationManager` IIFE module: `requestPermission()`, `send(title, body)`, `checkDeadlines(assignments)`, `addAlert(msg)`, `toggleTray()`
- `checkDeadlines()`: for each unsubmitted assignment — 7-day window (6.5–7.5d) → push notification + save to `cq_notified_7d`; 1-day window (0.5–1.5d) → push notification + save to `cq_notified_1d`; count due-this-week → in-app yellow `.alert-banner` if > 0
- Bell icon: `.bell-dot` red dot badge (shown via JS when `unread > 0`); `onclick="NotificationManager.toggleTray()"` wired on bell button
- `.bell-tray`: slide-down panel with recent alerts list, "Clear all" button, "No alerts yet" empty state
- `requestPermission()` called on first setup (demo + form submit) and on returning-user boot
- `checkDeadlines()` called inside `refreshAssignments()` after every fetch
- CSS: `.bell-dot`, `.alert-banner`, `.bell-tray`, `.tray-item`, `.tray-empty`, `.tray-clear`, `@keyframes slide-down`
- `Views.renderQuests()` simplified to call `CanvasAPI.refreshAssignments()` (single entry point for all post-fetch logic)

**Not pushed yet** — will commit Day 3+4 together.

**Next step:** Step 6 — Supabase Leaderboard + assignment detail slide-up sheet

---

## Session 6 — 2026-06-03

### Step 6 Complete: Supabase Leaderboard

**index.html:** Supabase CDN script tag added before app.js.

**app.js — `Leaderboard` IIFE module:**
- `SUPABASE_URL` / `SUPABASE_KEY` constants at top of file (fill in before deploying)
- `client()`: lazy-initialises `window.supabase.createClient` only when credentials are set
- `sync()`: debounced 5s upsert of all `GameState.getStats()` fields into `leaderboard` table, keyed on `username`; skips demo mode; silent on error (non-critical)
- `fetchRows()`: `SELECT * FROM leaderboard WHERE canvas_domain = {domain} ORDER BY coins DESC LIMIT 50`; demo mode returns `MOCK_LEADERBOARD` (5 mock wizards)
- `renderView()`: async — injects skeleton loading immediately, then replaces with rendered rows; sticky header + refresh button; last-updated timestamp
- `renderRows()`: 🥇🥈🥉 medals for top 3, `.me` gold-tint row for current user, `.lb-you` chip, streak + coins per row; "Be the first wizard on this leaderboard!" empty state
- `MOCK_LEADERBOARD`: 5 demo entries so leaderboard is testable without Supabase credentials
- `Leaderboard.sync()` called inside `refreshAssignments()` after every coin sync

**style.css:** `.lb-screen`, `.lb-header`, `.lb-row`, `.lb-row.me`, `.lb-row.top1/2/3`, `.lb-pos`, `.lb-medal`, `.lb-name`, `.lb-you`, `.lb-coins`, `.lb-streak`, `.lb-empty`, `.lb-updated`, `.lb-loading`

**SQL to run in Supabase editor** (see build guide Step 6 for full schema + RLS policies).

**Next step:** Step 7 — Guild System + Step 8 Full Profile View

---

## Session 7 — 2026-06-03

### Steps 7 + 8 Complete: Guild System + Full Profile View

**Step 7 — Guild System (app.js + style.css):**
- `Guild` IIFE module: `groupByCourse()`, `getBoss()` (highest points_possible within 7-day window), `bossStatus()` (defeated/escaped/active), `claimBossBonus()` (idempotent +100 coins via `cq_claimed_guild_bonuses`)
- `renderView()`: groups all loaded assignments by `course_name`, renders one guild card per course; shows skeleton + auto-fetches if assignments not yet loaded
- Guild card: course name, ⚔ glyph, weekly boss name + coin value, health bar (CSS width = days_left/7 × 100%), status label (green "Boss Defeated! ✓ +100 ⚡" / red "Boss escaped..." / muted "Xd remaining")
- `Views.renderGuild()` wired to `Guild.renderView()`
- CSS: `.guild-card`, `.guild-header`, `.guild-boss`, `.guild-health-track`, `.guild-health-fill`, `.guild-boss-status.won/lost/active`

**Step 8 — Full Profile View (app.js + style.css):**
- `getRPGEmoji(level)`: returns 🧙/⚔️/🏹/🔮/👑 per level range
- `renderProfileView()` full rewrite: RPG emoji badge, editable display name, 2×3 stats grid (Coins/Level/XP/Streak/Completed/Best Streak), coin history list from `cq_coin_history`, editable settings (domain + token inline edit), Refresh + Reset buttons
- `setupProfileEdit()`: wires Edit/Save toggle on display name, domain, token fields; Enter key saves; username save triggers `Leaderboard.sync()`
- CSS: `.profile-class-badge`, `.profile-stats-grid`, `.pstat`, `.hist-list`, `.hist-row`, `.hist-coins.late`, `.settings-list`, `.setting-row`, `.setting-edit-btn`, `.btn-danger-outline`

**Next step:** Step 9 — Deploy (Vercel + Cloudflare CORS worker + README)

---

## Session 8 — 2026-06-04

### Step 9 Complete: Deploy + Go Live — Initial Release

**Files created:**
- `worker.js` — Cloudflare Worker CORS proxy. Extracts `?domain=` query param, validates it matches `*.instructure.com`, forwards request with all original headers (including Authorization), injects `Access-Control-Allow-Origin: *` on response, handles OPTIONS preflight. Deploy by pasting into Cloudflare Workers editor.
- `README.md` — Full documentation: Quick Start, Canvas token guide (Account → Settings → Approved Integrations), Supabase setup (full SQL schema for both tables + where to find keys), Cloudflare Worker deploy steps + apiFetch update snippet, Add to Home Screen (iPhone Safari + Android Chrome), Phase 2 OAuth placeholder, tech stack table.

**vercel.json** — already correct from Session 1; no changes needed.

**All 9 steps complete. Ready to deploy to Vercel.**
