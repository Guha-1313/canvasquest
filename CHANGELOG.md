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
