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
    try { await fetchAllAssignments(); renderQuestsView(allAssignments); }
    catch (err) { if (err.message !== '401') showCorsError(); }
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

// ── Game state (basic, Step 3 will expand) ────────────
const GameState = {
  getCoins: () => parseInt(Store.get('cq_coins') || '500'),
  getXP:    () => parseInt(Store.get('cq_xp')    || '0'),
  getLevel: () => {
    const xp = parseInt(Store.get('cq_xp') || '0');
    return Math.min(50, Math.floor(xp / 500) + 1);
  },
  getStreak:    () => JSON.parse(Store.get('cq_streak') || '{"current":0,"longest":0}'),
  getCompleted: () => JSON.parse(Store.get('cq_completed') || '[]').length,
};

// ── Due date helpers ──────────────────────────────────
function dueInfo(dueAt) {
  const diff = (new Date(dueAt).getTime() - Date.now()) / 86400000;
  if (diff < -0.02) {
    const ago = Math.ceil(-diff);
    return { text: `${ago}d overdue`, cls: 'danger', variant: 'overdue' };
  }
  if (diff <= 1)  return { text: 'due today',     cls: 'warn',   variant: 'today' };
  if (diff <= 2)  return { text: 'due tomorrow',  cls: 'warn',   variant: 'soon'  };
  return { text: `in ${Math.ceil(diff)}d`,         cls: '',       variant: 'soon'  };
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
        <button class="icon-pill" aria-label="Alerts">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          ${overdueA.length > 0 ? '<span class="badge-dot"></span>' : ''}
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

// ── View renderers ────────────────────────────────────
const Views = {
  renderQuests() {
    renderQuestsLoading();
    CanvasAPI.fetchAllAssignments()
      .then(a => renderQuestsView(a))
      .catch(err => { if (err.message !== '401') showCorsError(); });
    return '';
  },
  renderLeaderboard() {
    return `<div class="view-placeholder"><div class="placeholder-icon">🗺️</div><h2>Realms</h2><p>Leaderboard coming in Step 6.</p></div>`;
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
      hide(); showShell(); Router.navigate('#quests');
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
      hide(); showShell(); Router.navigate(location.hash || '#quests');
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
    Router.navigate(location.hash || '#quests');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

boot();
