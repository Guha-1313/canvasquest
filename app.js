/* =====================================================
   CanvasQuest — app.js  (design v2)
   ===================================================== */

'use strict';

// ── Storage ──────────────────────────────────────────
const Store = {
  get:     (k)    => localStorage.getItem(k),
  set:     (k, v) => localStorage.setItem(k, v),
  remove:  (k)    => localStorage.removeItem(k),
  isSetup: ()     => localStorage.getItem('cq_setup') === 'true',
};

// ── Demo mode ─────────────────────────────────────────
const DEMO_DOMAIN = 'demo.instructure.com';
const DEMO_TOKEN  = 'DEMO_TOKEN_CANVASQUEST';
const DEMO_USER   = 'Demo Wizard';

function isDemoMode() { return Store.get('cq_token') === DEMO_TOKEN; }

// ── Supabase config (fill in your project URL + anon key) ─
const SUPABASE_URL = '';
const SUPABASE_KEY = '';

function makeDue(d) {
  const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString();
}
function makeSubmitted(d, offsetHours = -2) {
  const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(dt.getHours() + offsetHours);
  return dt.toISOString();
}

const MOCK_ASSIGNMENTS = [
  { id:'demo-1', name:'Research Paper: The Fall of Rome',    course_name:'HIS 301', due_at:makeDue(-5), points_possible:150, submitted_at:null,              workflow_state:'unsubmitted', coin_value:150 },
  { id:'demo-2', name:'Problem Set 4: Differential Equations',course_name:'MAT 275', due_at:makeDue(-2), points_possible:100, submitted_at:null,              workflow_state:'unsubmitted', coin_value:100 },
  { id:'demo-3', name:'Lab Report: Enzyme Kinetics',          course_name:'BIO 181', due_at:makeDue(0),  points_possible:75,  submitted_at:null,              workflow_state:'unsubmitted', coin_value:75  },
  { id:'demo-4', name:'Reading Response: Chapter 7–9',        course_name:'ENG 102', due_at:makeDue(1),  points_possible:50,  submitted_at:null,              workflow_state:'unsubmitted', coin_value:50  },
  { id:'demo-5', name:'Case Study Analysis: Apple vs Samsung',course_name:'MGT 300', due_at:makeDue(3),  points_possible:200, submitted_at:null,              workflow_state:'unsubmitted', coin_value:200 },
  { id:'demo-6', name:'Midterm Exam Prep: Submit Outline',    course_name:'CSE 240', due_at:makeDue(6),  points_possible:25,  submitted_at:null,              workflow_state:'unsubmitted', coin_value:25  },
  { id:'demo-7', name:'Quiz 3: Photosynthesis',               course_name:'BIO 181', due_at:makeDue(-8), points_possible:50,  submitted_at:makeSubmitted(-8,-3), workflow_state:'graded',    coin_value:50  },
  { id:'demo-8', name:'Discussion Post: Ethical AI',          course_name:'CSE 240', due_at:makeDue(-10),points_possible:25,  submitted_at:makeSubmitted(-10,-6),workflow_state:'submitted', coin_value:25  },
  { id:'demo-9', name:'Problem Set 3: Linear Algebra',        course_name:'MAT 275', due_at:makeDue(-7), points_possible:100, submitted_at:makeSubmitted(-5,0), workflow_state:'submitted', coin_value:100 },
];

// ── Canvas API ────────────────────────────────────────
const CanvasAPI = (() => {
  let allAssignments = [];

  function baseHeaders() {
    return { Authorization: `Bearer ${Store.get('cq_token')}` };
  }
  async function apiFetch(path) {
    const res = await fetch(`https://${Store.get('cq_domain')}/api/v1${path}`, { headers: baseHeaders() });
    if (res.status === 401) { Store.remove('cq_token'); Store.remove('cq_setup'); location.reload(); throw new Error('401'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async function getCourses() {
    const data = await apiFetch('/courses?enrollment_state=active&per_page=50');
    return data.filter(c => c.name && !c.access_restricted_by_date)
               .map(c => ({ id: c.id, name: c.name, course_code: c.course_code }));
  }
  async function getAssignments(courseId, courseName) {
    const data = await apiFetch(`/courses/${courseId}/assignments?include[]=submission&per_page=50&order_by=due_at`);
    const cutoff = Date.now() - 30 * 86400000;
    return data
      .filter(a => a.due_at && new Date(a.due_at).getTime() >= cutoff)
      .map(a => ({
        id: `${courseId}-${a.id}`, name: a.name, course_name: courseName,
        due_at: a.due_at, points_possible: a.points_possible || 0,
        submitted_at: a.submission?.submitted_at || null,
        workflow_state: a.submission?.workflow_state || 'unsubmitted',
        coin_value: Math.max(25, Math.min(a.points_possible || 25, 200)),
      }));
  }
  async function fetchAllAssignments() {
    const now = Date.now();
    let flat;
    if (isDemoMode()) {
      flat = [...MOCK_ASSIGNMENTS];
    } else {
      const courses = await getCourses();
      const results = await Promise.all(courses.map(c => getAssignments(c.id, c.name).catch(() => [])));
      flat = results.flat();
    }
    flat.sort((a, b) => {
      const aOver = new Date(a.due_at).getTime() < now;
      const bOver = new Date(b.due_at).getTime() < now;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return new Date(a.due_at) - new Date(b.due_at);
    });
    allAssignments = flat;
    return allAssignments;
  }
  async function refreshAssignments() {
    renderQuestsLoading();
    try {
      await fetchAllAssignments();
      const { totalEarned, leveledUp, newLevel } = GameState.syncAllAssignments(allAssignments);
      renderQuestsView(allAssignments);
      NotificationManager.checkDeadlines(allAssignments);
      Leaderboard.sync();
      if (totalEarned > 0) setTimeout(() => showCoinBurst(totalEarned), 400);
      if (leveledUp)       setTimeout(() => showLevelUpModal(newLevel),  800);
    } catch (err) { if (err.message !== '401') showCorsError(); }
  }
  function getAll() { return allAssignments; }
  return { fetchAllAssignments, refreshAssignments, getAll };
})();

// ── Error banner ──────────────────────────────────────
const Banner = (() => {
  let el = null;
  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'cors-banner'; el.hidden = true;
    document.getElementById('shell').prepend(el);
    return el;
  }
  function show(msg) {
    const b = ensure();
    b.innerHTML = `<span>${msg}</span><button class="banner-close" aria-label="Dismiss">✕</button>`;
    b.hidden = false;
    b.querySelector('.banner-close').addEventListener('click', () => { b.hidden = true; });
  }
  return { show, hide: () => { if (el) el.hidden = true; } };
})();

function showCorsError() {
  Banner.show('⚠️ Could not reach Canvas. You may need the CORS proxy. See README.');
}

// ── Utility ───────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatCoins(n) { return Number(n).toLocaleString(); }
function getInitial(name) { return (name || 'W').trim()[0].toUpperCase(); }
function getRPGClass(level) {
  if (level <= 5)  return 'Apprentice Wizard';
  if (level <= 15) return 'Quest Knight';
  if (level <= 30) return 'Shadow Archer';
  if (level <= 45) return 'Arcane Mage';
  return 'Legendary Champion';
}

// ── Game state ────────────────────────────────────────
const GameState = {
  getCoins:    () => parseInt(Store.get('cq_coins') || '500'),
  getXP:       () => parseInt(Store.get('cq_xp')    || '0'),
  getLevel() {
    const xp = parseInt(Store.get('cq_xp') || '0');
    return Math.min(50, Math.floor(xp / 500) + 1);
  },
  getStreak:    () => JSON.parse(Store.get('cq_streak')    || '{"current":0,"longest":0,"lastDate":null}'),
  getCompleted: () => JSON.parse(Store.get('cq_completed') || '[]').length,

  updateStreak(dateString) {
    const today = new Date().toISOString().slice(0, 10);
    const subDay = new Date(dateString).toISOString().slice(0, 10);
    const streak = JSON.parse(Store.get('cq_streak') || '{"current":0,"longest":0,"lastDate":null}');
    if (streak.lastDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (streak.lastDate === yesterday || streak.lastDate === subDay) {
      streak.current += 1;
    } else {
      streak.current = 1;
    }
    streak.longest  = Math.max(streak.longest, streak.current);
    streak.lastDate = today;
    Store.set('cq_streak', JSON.stringify(streak));
  },

  processAssignment(assignment) {
    const completed = JSON.parse(Store.get('cq_completed') || '[]');
    if (completed.includes(assignment.id)) return null;
    if (assignment.workflow_state !== 'submitted' && assignment.workflow_state !== 'graded') return null;
    if (!assignment.submitted_at) return null;

    const diff = (new Date(assignment.submitted_at) - new Date(assignment.due_at)) / 86400000;
    const oldLevel = this.getLevel();
    let coinsEarned, xpEarned, wasLate = false;

    if (diff <= 0) {
      coinsEarned = assignment.coin_value;
      xpEarned    = 50;
      this.updateStreak(assignment.submitted_at);
    } else {
      const deduct = Math.min(25 * Math.ceil(diff), assignment.coin_value * 0.8);
      coinsEarned  = Math.max(5, assignment.coin_value - deduct);
      xpEarned     = 15;
      wasLate      = true;
      const badges = JSON.parse(Store.get('cq_late_badges') || '[]');
      badges.push(assignment.id);
      Store.set('cq_late_badges', JSON.stringify(badges));
    }

    const newCoins = this.getCoins() + coinsEarned;
    const newXP    = this.getXP()    + xpEarned;
    Store.set('cq_coins', String(newCoins));
    Store.set('cq_xp',    String(newXP));

    completed.push(assignment.id);
    Store.set('cq_completed', JSON.stringify(completed));

    const history = JSON.parse(Store.get('cq_coin_history') || '[]');
    history.unshift({ id: assignment.id, name: assignment.name, coinsEarned, wasLate, ts: Date.now() });
    Store.set('cq_coin_history', JSON.stringify(history.slice(0, 10)));

    const newLevel  = this.getLevel();
    return { coinsEarned, wasLate, newTotal: newCoins, leveledUp: newLevel > oldLevel };
  },

  syncAllAssignments(assignments) {
    let totalEarned = 0;
    let leveledUp   = false;
    for (const a of assignments) {
      const result = this.processAssignment(a);
      if (result) {
        totalEarned += result.coinsEarned;
        if (result.leveledUp) leveledUp = true;
      }
    }
    return { totalEarned, leveledUp, newLevel: this.getLevel() };
  },

  getStats() {
    const level = this.getLevel();
    return {
      coins:         this.getCoins(),
      xp:            this.getXP(),
      level,
      streak:        this.getStreak(),
      completedCount: this.getCompleted(),
      nextLevelXP:   level * 500,
    };
  },
};

// ── Due date helpers ──────────────────────────────────
function dueInfo(dueAt) {
  const diff = (new Date(dueAt).getTime() - Date.now()) / 86400000;
  if (diff < -0.02) {
    const ago = Math.ceil(-diff);
    return { text: `⚠ OVERDUE — ${ago}d ago`, cls: 'danger', variant: 'overdue' };
  }
  if (diff <= 1)  return { text: '🚨 Due TODAY',   cls: 'warn', variant: 'today' };
  if (diff <= 2)  return { text: 'Due Tomorrow',   cls: 'warn', variant: 'soon'  };
  return { text: `in ${Math.ceil(diff)}d`,         cls: '',     variant: 'soon'  };
}

function isDone(a) { return a.workflow_state === 'submitted' || a.workflow_state === 'graded'; }

// ── Quest card HTML ───────────────────────────────────
function questCardHtml(a) {
  const done    = isDone(a);
  const due     = dueInfo(a.due_at);
  const isLate  = done && a.submitted_at && new Date(a.submitted_at) > new Date(a.due_at);
  const variant = done ? 'done' : due.variant;

  const accent = variant === 'overdue' ? '#ff5c5c'
               : variant === 'done'    ? '#5e5a4f'
               : '#b8ff3a';
  const glow   = variant === 'overdue' ? 'rgba(255,92,92,0.4)'
               : variant === 'done'    ? 'rgba(94,90,79,0.2)'
               : 'rgba(184,255,58,0.35)';

  const dueText = done ? (isLate ? 'submitted late' : 'complete') : due.text;
  const dueCls  = done ? '' : due.cls;

  return `
    <div class="quest-card ${variant}${done?' done':''}"
         style="--accent:${accent};--accent-glow:${glow}">
      <div class="strip"></div>
      ${done ? `<div class="q-done-banner${isLate?' late':''}">${isLate ? '⚠ SUBMITTED LATE' : '✓ COMPLETE'}</div>` : ''}
      <div class="q-body">
        <div class="q-meta">
          <span class="q-course">${escapeHtml(a.course_name)}</span>
          <span class="q-dot"></span>
          <span class="q-due ${dueCls}">${dueText}</span>
        </div>
        <div class="q-title${done?' done':''}">${escapeHtml(a.name)}</div>
        <div class="q-reward">
          <span class="coin-glyph">★</span>
          ${a.coin_value} · ${a.coin_value * 3} XP
        </div>
      </div>
      <div class="q-right">
        <button class="q-check" data-id="${escapeHtml(a.id)}" aria-label="Complete">
          ${done ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"/></svg>' : ''}
        </button>
      </div>
    </div>`;
}

// ── Quests view ───────────────────────────────────────
function renderQuestsLoading() {
  document.getElementById('app').innerHTML = `
    <div class="app-header">
      <div class="greet-block">
        <span class="greet-hi mono">LOADING</span>
        <span class="greet-name">Quests</span>
      </div>
    </div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>
    <div class="skeleton skeleton-card"></div>`;
}

function renderQuestsView(assignments) {
  Banner.hide();
  const username = Store.get('cq_username') || 'Wizard';
  const level    = GameState.getLevel();
  const coins    = GameState.getCoins();
  const xp       = GameState.getXP();
  const nextXP   = level * 500;
  const xpPct    = Math.min(100, Math.round((xp % 500) / 500 * 100));
  const streak   = GameState.getStreak();
  const initial  = getInitial(username);

  const pending  = assignments.filter(a => !isDone(a));
  const done     = assignments.filter(a => isDone(a));

  const overdueA = pending.filter(a => dueInfo(a.due_at).variant === 'overdue');
  const todayA   = pending.filter(a => dueInfo(a.due_at).variant === 'today');
  const soonA    = pending.filter(a => dueInfo(a.due_at).variant === 'soon');

  // Active tab counts
  const tabCounts = {
    today: overdueA.length + todayA.length,
    soon:  soonA.length,
    done:  done.length,
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';

  // Default tab: today unless empty
  const defaultTab = tabCounts.today > 0 ? 'today' : tabCounts.soon > 0 ? 'soon' : 'done';

  document.getElementById('app').innerHTML = `
    <div class="pull-hint" id="pull-hint">↓ Pull to refresh</div>

    <div class="app-header">
      <div class="greet-block">
        <span class="greet-hi mono">${greeting}</span>
        <span class="greet-name">${escapeHtml(username)}</span>
      </div>
      <div class="header-actions">
        <button class="icon-pill" aria-label="Refresh" onclick="CanvasAPI.refreshAssignments()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button class="icon-pill" id="btn-bell" aria-label="Alerts" onclick="NotificationManager.toggleTray()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="bell-dot" style="display:none"></span>
        </button>
      </div>
    </div>

    <div class="player-card" onclick="Router.navigate('#profile')" role="button" tabindex="0">
      <div class="player-row">
        <div class="player-avatar">
          <span class="player-avatar-letter">${initial}</span>
          <span class="player-level-badge">LVL ${level}</span>
        </div>
        <div class="player-info">
          <div class="player-title">${escapeHtml(getRPGClass(level))}</div>
          <div class="player-name">${escapeHtml(username)}</div>
        </div>
        <div class="player-coins">
          <span class="coin-glyph">★</span>
          ${formatCoins(coins)}
        </div>
      </div>
      <div class="xp-row">
        <div class="xp-label">
          <span>${xp % 500} / 500 XP</span>
          <span>NEXT: LVL ${level + 1}</span>
        </div>
        <div class="xp-track">
          <div class="xp-fill" style="width:${xpPct}%"></div>
        </div>
      </div>
    </div>

    <div class="tabs" role="tablist" id="quest-tabs">
      <button class="tab${defaultTab==='today'?' active':''} ${overdueA.length>0?'danger':''}"
              role="tab" data-tab-btn="today">
        Today <span class="count">${tabCounts.today}</span>
      </button>
      <button class="tab${defaultTab==='soon'?' active':''}"
              role="tab" data-tab-btn="soon">
        Soon <span class="count">${tabCounts.soon}</span>
      </button>
      <button class="tab${defaultTab==='done'?' active':''}"
              role="tab" data-tab-btn="done">
        Done <span class="count">${tabCounts.done}</span>
      </button>
    </div>

    <div class="quest-list" id="quest-list">
      ${buildQuestListHtml(overdueA, todayA, soonA, done, defaultTab)}
    </div>`;

  setupQuestTabs(overdueA, todayA, soonA, done);
  setupPullToRefresh();
}

function buildQuestListHtml(overdueA, todayA, soonA, done, tab) {
  if (tab === 'today') {
    const list = [...overdueA, ...todayA];
    if (!list.length) return emptyHtml('All clear on the quest board');
    return (overdueA.length ? `<div class="quest-section-label">Overdue</div>${overdueA.map(questCardHtml).join('')}` : '')
         + (todayA.length   ? `<div class="quest-section-label">Today</div>${todayA.map(questCardHtml).join('')}` : '');
  }
  if (tab === 'soon') {
    if (!soonA.length) return emptyHtml('No upcoming quests');
    return soonA.map(questCardHtml).join('');
  }
  if (tab === 'done') {
    if (!done.length) return emptyHtml('No completed quests yet');
    return done.map(questCardHtml).join('');
  }
  return '';
}

function emptyHtml(msg) {
  return `<div class="q-empty"><div class="q-empty-glyph">⌬</div><div>${msg}</div></div>`;
}

function showCoinBurst(coins) {
  const el = document.createElement('div');
  el.className = 'coin-burst';
  el.textContent = `+${coins} ⚡`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function showLevelUpModal(level) {
  const overlay = document.createElement('div');
  overlay.className = 'level-up-overlay';
  overlay.innerHTML = `
    <div class="level-up-modal">
      <div class="lum-stars">✦ ✦ ✦</div>
      <div class="lum-level mono">LEVEL ${level}</div>
      <div class="lum-title display">LEVEL UP!</div>
      <div class="lum-class">${escapeHtml(getRPGClass(level))}</div>
      <button class="btn-primary lum-close">Continue Quest</button>
    </div>`;
  overlay.querySelector('.lum-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 200]);
}

function setupQuestTabs(overdueA, todayA, soonA, done) {
  document.querySelectorAll('[data-tab-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab-btn]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tabBtn;
      document.getElementById('quest-list').innerHTML =
        buildQuestListHtml(overdueA, todayA, soonA, done, tab);
    });
  });
}

// ── Pull-to-refresh ───────────────────────────────────
function setupPullToRefresh() {
  const el = document.getElementById('app');
  if (!el) return;
  let startY = 0, pulling = false;
  el.addEventListener('touchstart', e => { if (el.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; } }, { passive: true });
  el.addEventListener('touchmove',  e => {
    if (!pulling) return;
    if (e.touches[0].clientY - startY > 20) document.getElementById('pull-hint')?.classList.add('pull-hint-active');
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!pulling) return;
    const delta = e.changedTouches[0].clientY - startY;
    pulling = false;
    document.getElementById('pull-hint')?.classList.remove('pull-hint-active');
    if (delta > 80) CanvasAPI.refreshAssignments();
  }, { passive: true });
}

// ── Profile view ──────────────────────────────────────
function renderProfileView() {
  const username = Store.get('cq_username') || 'Wizard';
  const level    = GameState.getLevel();
  const coins    = GameState.getCoins();
  const xp       = GameState.getXP();
  const streak   = GameState.getStreak();
  const completed= GameState.getCompleted();
  const initial  = getInitial(username);
  const rpgClass = getRPGClass(level).toUpperCase();

  document.getElementById('app').innerHTML = `
    <div class="profile-screen">
      <div class="profile-top">
        <span class="profile-top-label mono">Hero · Profile</span>
        <button class="icon-pill" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
      <div class="profile-content">
        <div class="profile-hero">
          <div class="profile-avatar"><span>${initial}</span></div>
          <div class="profile-name display">${escapeHtml(username)}</div>
          <div class="profile-class mono">${escapeHtml(rpgClass)} · LEVEL ${level}</div>
        </div>

        <div class="profile-stats">
          <div class="stat-tile gold">
            <span class="v display">${formatCoins(coins)}</span>
            <span class="l mono">Coins</span>
          </div>
          <div class="stat-tile green">
            <span class="v display">${formatCoins(xp)}</span>
            <span class="l mono">Total XP</span>
          </div>
          <div class="stat-tile">
            <span class="v display">${streak.current}d</span>
            <span class="l mono">Streak</span>
          </div>
        </div>

        <div class="profile-section-h mono">Settings</div>
        <div class="course-list">
          <div class="course-row" style="flex-direction:column;align-items:flex-start;gap:12px">
            <div style="width:100%">
              <div class="course-code mono" style="margin-bottom:6px">CANVAS DOMAIN</div>
              <div style="font-size:13px;color:var(--text)">${escapeHtml(Store.get('cq_domain') || '—')}</div>
            </div>
            <button class="btn-primary" style="width:100%;padding:12px 16px;font-size:13px"
                    onclick="CanvasAPI.refreshAssignments();Router.navigate('#quests')">
              Refresh Assignments
            </button>
            <button onclick="if(confirm('Reset all data? This cannot be undone.')){localStorage.clear();location.reload();}"
                    style="width:100%;padding:12px;border-radius:999px;border:1px solid rgba(255,92,92,0.35);color:var(--danger);font-size:13px;letter-spacing:0.04em;font-weight:500">
              Reset All Data
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Notification manager ──────────────────────────────
const NotificationManager = (() => {
  const K7D = 'cq_notified_7d';
  const K1D = 'cq_notified_1d';
  const alerts = [];
  let unread = 0;

  async function requestPermission() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    await Notification.requestPermission();
  }

  function send(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: 'icon-192.png' });
  }

  function updateBadge() {
    const dot = document.querySelector('.bell-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  }

  function addAlert(msg) {
    alerts.unshift({ msg, ts: Date.now() });
    unread++;
    updateBadge();
    const existing = document.getElementById('alert-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'alert-banner';
    banner.className = 'alert-banner';
    banner.innerHTML = `<span>${escapeHtml(msg)}</span><button class="banner-close" aria-label="Dismiss">✕</button>`;
    banner.querySelector('.banner-close').addEventListener('click', () => banner.remove());
    const shell = document.getElementById('shell');
    if (shell) shell.prepend(banner);
  }

  function checkDeadlines(assignments) {
    const notified7d = JSON.parse(Store.get(K7D) || '[]');
    const notified1d = JSON.parse(Store.get(K1D) || '[]');
    const now = Date.now();
    let weekCount = 0;

    for (const a of assignments) {
      if (isDone(a) || !a.due_at) continue;
      const days = (new Date(a.due_at) - now) / 86400000;
      if (days > 0 && days <= 7) weekCount++;
      if (days >= 6.5 && days <= 7.5 && !notified7d.includes(a.id)) {
        send(`⚔️ Quest expiring: ${a.name}`, `7 days left — ${a.coin_value} coins`);
        notified7d.push(a.id);
      }
      if (days >= 0.5 && days <= 1.5 && !notified1d.includes(a.id)) {
        send(`🚨 FINAL WARNING: ${a.name}`, `Due TOMORROW — ${a.coin_value} coins at risk!`);
        notified1d.push(a.id);
      }
    }

    Store.set(K7D, JSON.stringify(notified7d));
    Store.set(K1D, JSON.stringify(notified1d));
    if (weekCount > 0) addAlert(`⚡ ${weekCount} quest${weekCount > 1 ? 's' : ''} due this week`);
  }

  function toggleTray() {
    const existing = document.getElementById('bell-tray');
    if (existing) { existing.remove(); return; }
    unread = 0;
    updateBadge();
    const tray = document.createElement('div');
    tray.id = 'bell-tray';
    tray.className = 'bell-tray';
    if (alerts.length === 0) {
      tray.innerHTML = `<div class="tray-empty">No alerts yet</div>`;
    } else {
      tray.innerHTML = alerts.map(a => `<div class="tray-item">${escapeHtml(a.msg)}</div>`).join('')
        + `<button class="tray-clear">Clear all</button>`;
      tray.querySelector('.tray-clear').addEventListener('click', () => {
        alerts.length = 0; unread = 0; updateBadge(); tray.remove();
      });
    }
    document.getElementById('shell').prepend(tray);
  }

  return { requestPermission, checkDeadlines, toggleTray };
})();

// ── Leaderboard (Supabase) ────────────────────────────
const Leaderboard = (() => {
  let _client = null;
  let _syncTimer = null;
  let _lastUpdated = null;

  function client() {
    if (!_client && SUPABASE_URL && SUPABASE_KEY && window.supabase) {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _client;
  }

  function sync() {
    if (isDemoMode() || !client()) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
      const stats = GameState.getStats();
      const domain = Store.get('cq_domain') || '';
      const username = Store.get('cq_username') || 'Wizard';
      try {
        await client().from('leaderboard').upsert({
          username,
          canvas_domain: domain,
          coins: stats.coins,
          level: stats.level,
          xp: stats.xp,
          streak: stats.streak.current,
          assignments_completed: stats.completedCount,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'username' });
      } catch (_) { /* silent — leaderboard is non-critical */ }
    }, 5000);
  }

  async function fetchRows() {
    const domain = Store.get('cq_domain') || '';
    if (isDemoMode()) return MOCK_LEADERBOARD;
    if (!client()) return [];
    try {
      const { data } = await client()
        .from('leaderboard')
        .select('*')
        .eq('canvas_domain', domain)
        .order('coins', { ascending: false })
        .limit(50);
      _lastUpdated = new Date();
      return data || [];
    } catch (_) { return []; }
  }

  function renderRows(rows) {
    const myName = Store.get('cq_username') || '';
    const medals = ['🥇', '🥈', '🥉'];
    if (!rows.length) {
      return `<div class="lb-empty">Be the first wizard on this leaderboard!</div>`;
    }
    return rows.map((row, i) => {
      const isMe = row.username === myName;
      const medal = i < 3 ? `<span class="lb-medal">${medals[i]}</span>` : `<span class="lb-rank">${i + 1}</span>`;
      return `
        <div class="lb-row${isMe ? ' me' : ''}${i < 3 ? ' top' + (i+1) : ''}">
          <div class="lb-pos">${medal}</div>
          <div class="lb-info">
            <span class="lb-name">${escapeHtml(row.username)}${isMe ? ' <span class="lb-you">you</span>' : ''}</span>
            <span class="lb-level mono">LVL ${row.level}</span>
          </div>
          <div class="lb-stats">
            <span class="lb-coins">★ ${formatCoins(row.coins)}</span>
            <span class="lb-streak">${row.streak}🔥</span>
          </div>
        </div>`;
    }).join('');
  }

  async function renderView() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="lb-screen">
        <div class="lb-header">
          <span class="lb-title display">Realms</span>
          <button class="icon-pill" aria-label="Refresh" onclick="Leaderboard.renderView()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
        <div id="lb-list" class="lb-list">
          <div class="lb-loading">${[1,2,3,4,5].map(() => '<div class="skeleton" style="height:56px;margin-bottom:8px;border-radius:12px"></div>').join('')}</div>
        </div>
        <div class="lb-updated mono" id="lb-updated"></div>
      </div>`;

    const rows = await fetchRows();
    document.getElementById('lb-list').innerHTML = renderRows(rows);
    if (_lastUpdated) {
      document.getElementById('lb-updated').textContent =
        `Updated ${_lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  const MOCK_LEADERBOARD = [
    { username: 'Demo Wizard',   canvas_domain: DEMO_DOMAIN, coins: 2840, level: 6, xp: 2840, streak: 5, assignments_completed: 18 },
    { username: 'ArcaneMage99', canvas_domain: DEMO_DOMAIN, coins: 2310, level: 5, xp: 2310, streak: 3, assignments_completed: 14 },
    { username: 'QuestKnight',  canvas_domain: DEMO_DOMAIN, coins: 1950, level: 4, xp: 1950, streak: 7, assignments_completed: 12 },
    { username: 'ShadowArcher', canvas_domain: DEMO_DOMAIN, coins: 1600, level: 3, xp: 1600, streak: 1, assignments_completed: 9  },
    { username: 'ApprenticeX',  canvas_domain: DEMO_DOMAIN, coins: 820,  level: 2, xp: 820,  streak: 2, assignments_completed: 5  },
  ];

  return { sync, renderView };
})();

// ── View renderers ────────────────────────────────────
const Views = {
  renderQuests() {
    CanvasAPI.refreshAssignments();
    return '';
  },
  renderLeaderboard() {
    Leaderboard.renderView();
    return '';
  },
  renderGuild() {
    return `<div class="view-placeholder"><div class="placeholder-icon">✦</div><h2>Guild</h2><p>Guild system coming in Step 7.</p></div>`;
  },
  renderProfile() {
    renderProfileView(); return '';
  },
};

// ── Router ────────────────────────────────────────────
const Router = {
  routes: {
    '#quests':      Views.renderQuests,
    '#leaderboard': Views.renderLeaderboard,
    '#guild':       Views.renderGuild,
    '#profile':     Views.renderProfile,
  },
  navigate(hash) {
    const route = this.routes[hash] || this.routes['#quests'];
    const activeHash = this.routes[hash] ? hash : '#quests';
    const html = route.call(Views);
    if (html) document.getElementById('app').innerHTML = html;
    this.updateNav(activeHash);
    if (location.hash !== activeHash) history.replaceState(null, '', activeHash);
  },
  updateNav(activeHash) {
    document.querySelectorAll('.tabbar-item').forEach(btn => {
      const isActive = `#${btn.dataset.tab}` === activeHash;
      btn.classList.toggle('active', isActive);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('stroke-width', isActive ? '2' : '1.7');
      }
    });
  },
  init() {
    window.addEventListener('hashchange', () => this.navigate(location.hash));
    document.querySelectorAll('.tabbar-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const hash = `#${btn.dataset.tab}`;
        this.navigate(hash);
        history.pushState(null, '', hash);
      });
    });
  },
};

// ── Setup Modal ───────────────────────────────────────
const SetupModal = (() => {
  const modal   = document.getElementById('setup-modal');
  const form    = document.getElementById('setup-form');
  const errorEl = document.getElementById('setup-error');

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function hideError()    { errorEl.hidden = true; }
  function show() { modal.hidden = false; document.getElementById('input-domain')?.focus(); }
  function hide() { modal.hidden = true; }

  function init() {
    // Token visibility toggle
    document.querySelectorAll('.toggle-vis').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const show  = input.type === 'password';
        input.type  = show ? 'text' : 'password';
        btn.querySelector('.eye-icon').textContent = show ? '🙈' : '👁';
      });
    });

    // Demo mode
    document.getElementById('btn-demo')?.addEventListener('click', () => {
      Store.set('cq_domain',   DEMO_DOMAIN);
      Store.set('cq_token',    DEMO_TOKEN);
      Store.set('cq_username', DEMO_USER);
      Store.set('cq_setup',    'true');
      hide(); showShell(); NotificationManager.requestPermission(); Router.navigate('#quests');
    });

    // Form submit
    form.addEventListener('submit', e => {
      e.preventDefault(); hideError();
      const domain   = document.getElementById('input-domain').value.trim().replace(/^https?:\/\//, '');
      const token    = document.getElementById('input-token').value.trim();
      const username = document.getElementById('input-username').value.trim();
      if (!domain)           return showError('Canvas domain is required.');
      if (!token)            return showError('Access token is required.');
      if (!username)         return showError('Display name is required.');
      if (username.length<2) return showError('Display name must be at least 2 characters.');
      Store.set('cq_domain',   domain);
      Store.set('cq_token',    token);
      Store.set('cq_username', username);
      Store.set('cq_setup',    'true');
      hide(); showShell(); NotificationManager.requestPermission(); Router.navigate(location.hash || '#quests');
    });
  }

  return { show, hide, init };
})();

function showShell() { document.getElementById('shell').hidden = false; }

// ── Boot ──────────────────────────────────────────────
function boot() {
  SetupModal.init();
  Router.init();
  if (!Store.isSetup()) {
    SetupModal.show();
  } else {
    showShell();
    NotificationManager.requestPermission();
    Router.navigate(location.hash || '#quests');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

boot();
