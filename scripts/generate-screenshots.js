/**
 * Marketplace screenshot generator for Smart Sprint Planner.
 *
 * Generates 4 product screenshots from local mock data (no live YouTrack needed).
 * Output: marketplace-screenshots/  (1440×900, widget-only, English UI)
 *
 * JetBrains Marketplace requirements:
 *   - Min 1200×760px, recommended 1280×800px (16:10)
 *   - Consistent aspect ratio across all images
 *   - High-quality, legible text
 *   - No browser chrome / desktop background
 *
 * Usage:
 *   node scripts/save-olear-auth.js  # not needed — uses local mock
 *   npx http-server -p 3939 -c-1 . & node scripts/generate-screenshots.js
 *
 * Or simply:
 *   npm run screenshots
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const OUT_DIR   = join(ROOT, 'marketplace-screenshots');
mkdirSync(OUT_DIR, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert 'YYYY-MM-DD' → UTC milliseconds (widget stores gantt dates as timestamps) */
const d = (dateStr) => new Date(dateStr + 'T00:00:00Z').getTime();

// ─── Demo data ───────────────────────────────────────────────────────────────

const DEMO_SETTINGS = {
  validationGroups:     ['All Users'],
  editGroups:           ['All Users'],
  settingsManagerGroup: 'sprint-managers',
  historyClearGroups:   [],
  activeRoles: ['analysis', 'devPlatform', 'testing'],
  nkcJanMay: 160, nkcOther: 168,
  rate: 1, participation: 1,
  gradeKpe: { intern: 0.5, jun: 0.7, mid: 1.0, senior: 1.2 },
  fieldPriority: 'Priority', fieldXPriority: 'Priority',
  fieldState: 'State', fieldSystem: 'Subsystem',
  fieldSprint: 'Sprint', fieldVersion: 'Fix versions',
  personalPlanningEnabled: true, usePersonalForResource: false,
  dynEditEnabled: false,
  language: 'en'
};

// Personal planning per role — dateStart/dateEnd are UTC timestamps (widget stores them this way)
const ANALYSIS_PP = {
  resourcesByAssignee: {
    'a.ivanova': { name: 'Anna Ivanova',   resource: 80 },
    'k.smirnov': { name: 'Kirill Smirnov', resource: 80 },
  },
  taskAssignments: {
    'APP-101': { assignee: 'a.ivanova',  assigneeName: 'Anna Ivanova',   dateStart: d('2026-06-02'), dateEnd: d('2026-06-10') },
    'APP-102': { assignee: 'a.ivanova',  assigneeName: 'Anna Ivanova',   dateStart: d('2026-06-11'), dateEnd: d('2026-06-17') },
    'APP-103': { assignee: 'k.smirnov',  assigneeName: 'Kirill Smirnov', dateStart: d('2026-06-02'), dateEnd: d('2026-06-13') },
    'APP-104': { assignee: 'k.smirnov',  assigneeName: 'Kirill Smirnov', dateStart: d('2026-06-16'), dateEnd: d('2026-06-27') },
    'APP-105': { assignee: 'a.ivanova',  assigneeName: 'Anna Ivanova',   dateStart: d('2026-06-18'), dateEnd: d('2026-06-27') },
    'APP-106': { assignee: 'k.smirnov',  assigneeName: 'Kirill Smirnov', dateStart: d('2026-06-02'), dateEnd: d('2026-06-04') },
  }
};

const PLATFORM_PP = {
  resourcesByAssignee: {
    'd.volkov':  { name: 'Dmitry Volkov',  resource: 100 },
    'i.sokolov': { name: 'Igor Sokolov',   resource: 60  },
  },
  taskAssignments: {
    'APP-201': { assignee: 'd.volkov',  assigneeName: 'Dmitry Volkov',  dateStart: d('2026-06-02'), dateEnd: d('2026-06-17') },
    'APP-202': { assignee: 'd.volkov',  assigneeName: 'Dmitry Volkov',  dateStart: d('2026-06-09'), dateEnd: d('2026-06-27') },
    'APP-203': { assignee: 'i.sokolov', assigneeName: 'Igor Sokolov',   dateStart: d('2026-06-02'), dateEnd: d('2026-06-27') },
    'APP-204': { assignee: 'i.sokolov', assigneeName: 'Igor Sokolov',   dateStart: d('2026-06-15'), dateEnd: d('2026-06-20') },
    'APP-205': { assignee: 'd.volkov',  assigneeName: 'Dmitry Volkov',  dateStart: d('2026-06-02'), dateEnd: d('2026-06-04') },
  }
};

const TESTING_PP = {
  resourcesByAssignee: {
    'm.kozlov': { name: 'Maxim Kozlov', resource: 80 },
  },
  taskAssignments: {
    'APP-301': { assignee: 'm.kozlov', assigneeName: 'Maxim Kozlov', dateStart: d('2026-06-16'), dateEnd: d('2026-06-27') },
    'APP-302': { assignee: 'm.kozlov', assigneeName: 'Maxim Kozlov', dateStart: d('2026-06-09'), dateEnd: d('2026-06-27') },
    'APP-303': { assignee: 'm.kozlov', assigneeName: 'Maxim Kozlov', dateStart: d('2026-06-16'), dateEnd: d('2026-06-23') },
    'APP-304': { assignee: 'm.kozlov', assigneeName: 'Maxim Kozlov', dateStart: d('2026-06-23'), dateEnd: d('2026-06-25') },
  }
};

const DEMO_SPRINT = {
  sprintId:        'sprint-jun-2026',
  name:            'Mobile App v3.0 · June 2026',
  dateStart:       '2026-06-02',
  dateEnd:         '2026-06-27',
  status:          'PLANNING',
  goal:            'Ship user-facing onboarding flow and payment refactor',
  // Role resource capacities in MINUTES (widget stores parsePeriod output as minutes)
  resourceAnalysis:    9600,  // 160 h × 60
  resourceDevPlatform: 9600,  // 160 h × 60
  resourceTesting:     4800,  //  80 h × 60
  // _sprint.roles[rk].resource — used by accordion header stats; also in MINUTES
  roles: {
    analysis:    { resource: 9600 },
    devPlatform: { resource: 9600 },
    testing:     { resource: 4800 },
  },
  // Personal planning per-role — used by Distribution view and Gantt
  personalPlanning: {
    analysis:    ANALYSIS_PP,
    devPlatform: PLATFORM_PP,
    testing:     TESTING_PP,
  }
};

// Items per role — internal widget format: issueId, title, priority, state,
// system, inclusionStatus, estimate_<rk>, fact_<rk>
function mkItem(issueId, title, opts = {}) {
  const rk = opts.rk || 'analysis';
  return {
    issueId,
    title,
    url:              `https://youtrack.example.com/issue/${issueId}`,
    priority:         opts.priority  || 'Normal',
    xpriority:        opts.xpriority || opts.priority || 'Normal',
    state:            opts.state     || 'Open',
    system:           opts.system    || '',
    version:          opts.version   || '',
    inclusionStatus:  opts.inc       || 'INC_PLANNED',
    assignee:         opts.assignee  || '',
    [`estimate_${rk}`]: opts.est  ?? null,
    [`fact_${rk}`]:     opts.fact ?? null,
    [`alloc_${rk}`]:    opts.alloc ?? (opts.est ?? null),
  };
}

// Role keys must match ALL_ROLES in legacy-monolith.js:
// analysis | devPlatform | testing | devBack | devFront | devIos | devAndroid | devFs | devDb

// All est/fact/alloc in MINUTES — widget stores and renders as minutes (fmtPeriod divides by 60)
// E.g. 16h → 960 min, 12h → 720 min, 8h → 480 min, 4h → 240 min
const ANALYSIS_ITEMS = [
  mkItem('APP-101', 'Onboarding flow — requirements & acceptance criteria',  { rk:'analysis', priority:'Critical',  state:'In Progress', system:'Onboarding',    est:960, fact:720, alloc:960 }),
  mkItem('APP-102', 'Payment refactor — impact analysis & risk matrix',      { rk:'analysis', priority:'Critical',  state:'In Progress', system:'Payments',      est:480, fact:360, alloc:480 }),
  mkItem('APP-103', 'User research: profile setup drop-off investigation',   { rk:'analysis', priority:'High',      state:'Open',        system:'Onboarding',    est:720, fact:0,   alloc:720 }),
  mkItem('APP-104', 'A/B test plan: new payment confirmation screen',        { rk:'analysis', priority:'High',      state:'Open',        system:'Payments',      est:480, fact:0,   alloc:480 }),
  mkItem('APP-105', 'Spec: push notification permission flow (iOS/Android)', { rk:'analysis', priority:'Normal',    state:'Open',        system:'Notifications', est:360, fact:0,   alloc:360 }),
  mkItem('APP-106', 'Analytics event schema — onboarding funnel v3',        { rk:'analysis', priority:'Normal',    state:'Open',        system:'Analytics',     est:240, fact:0,   alloc:240 }),
  mkItem('APP-107', 'Dark mode contrast audit (WCAG 2.1 AA)',                { rk:'analysis', priority:'Low',       state:'Open',        system:'UI / Theme',    est:240, fact:0,   alloc:0,   inc:'INC_UNPLANNED' }),
];

const PLATFORM_ITEMS = [
  mkItem('APP-201', 'Refactor payment gateway adapter (Stripe → internal)', { rk:'devPlatform', priority:'Critical',  state:'In Progress', system:'Payments',      est:1440, fact:960, alloc:1440 }),
  mkItem('APP-202', 'Implement idempotency keys for /charge endpoint',      { rk:'devPlatform', priority:'High',      state:'Open',        system:'Payments',      est:960,  fact:0,   alloc:960  }),
  mkItem('APP-203', 'Migrate user service to Postgres 15',                  { rk:'devPlatform', priority:'High',      state:'Open',        system:'Infrastructure',est:1200, fact:0,   alloc:1200 }),
  mkItem('APP-204', 'Rate limiting middleware for public API',               { rk:'devPlatform', priority:'Normal',    state:'Open',        system:'API Gateway',   est:480,  fact:0,   alloc:480  }),
  mkItem('APP-205', 'Fix N+1 query in GET /feed endpoint',                  { rk:'devPlatform', priority:'Normal',    state:'Done',        system:'Feed',          est:240,  fact:180, alloc:240  }),
  mkItem('APP-206', 'Push notification delivery reliability (FCM / APNs)',  { rk:'devPlatform', priority:'Low',       state:'Open',        system:'Notifications', est:480,  fact:0,   alloc:0,   inc:'INC_PENDING' }),
];

const TESTING_ITEMS = [
  mkItem('APP-301', 'E2E: full onboarding flow (Appium, iOS + Android)',    { rk:'testing', priority:'Critical',  state:'Open',  system:'Onboarding',  est:720,  fact:0, alloc:720  }),
  mkItem('APP-302', 'Regression: payment gateway on 5 real devices',       { rk:'testing', priority:'High',      state:'Open',  system:'Payments',    est:960,  fact:0, alloc:960  }),
  mkItem('APP-303', 'Performance: cold start < 2 s on mid-range Android',  { rk:'testing', priority:'High',      state:'Open',  system:'Performance', est:480,  fact:0, alloc:480  }),
  mkItem('APP-304', 'Smoke suite: Android 14 + iOS 17 compatibility',      { rk:'testing', priority:'Normal',    state:'Open',  system:'Platform',    est:240,  fact:0, alloc:240  }),
];

const DEMO_ROLE_ITEMS = {
  analysis:    ANALYSIS_ITEMS,
  devPlatform: PLATFORM_ITEMS,
  testing:     TESTING_ITEMS,
};

// History: 4 past sprints with realistic delta values
function mkSnap(sprintId, name, dateStart, dateEnd, roleKey, roleLabel, est, fact, status = 'CONFIRMED') {
  const delta = fact - est;
  const items = Array.from({ length: Math.round(est / 8) }, (_, i) => ({
    issueId:         `APP-${roleKey.slice(0,2).toUpperCase()}${sprintId.slice(-1)}${i+1}`,
    title:           `Sprint task ${i+1}`,
    inclusionStatus: i === Math.round(est / 8) - 1 && status !== 'CONFIRMED' ? 'INC_UNPLANNED' : 'INC_PLANNED',
    [`estimate_${roleKey}`]: 8,
    [`fact_${roleKey}`]:     Math.round(8 + (delta / Math.round(est / 8))),
  }));
  return { sprintId, name, dateStart, dateEnd, roleKey, roleLabel, status,
           confirmedAt: Date.now() - 86400000 * 7,
           confirmedBy: 'a.petrov',
           [`nkc_${roleKey}`]: 160,
           [`resource_${roleKey}`]: 160,
           [`estimate_total_${roleKey}`]: est,
           [`fact_total_${roleKey}`]: fact,
           items,
           personalPlanning: {}, hasWorkingCopy: false, revisions: [] };
}

// Current sprint records MUST use composite sprintId = '<sprintId>_<roleKey>'
// so that _findHistRecForCurrent() can locate them for Gantt / Distribution rendering.
function mkCurrentSnap(name, dateStart, dateEnd, roleKey, pp, items) {
  return {
    sprintId:   'sprint-jun-2026_' + roleKey,
    name,
    dateStart:  d(dateStart),
    dateEnd:    d(dateEnd),
    roleKey,
    status:     'CONFIRMED',
    confirmedAt: null,
    confirmedBy: null,
    personalPlanning: pp,
    items,
    hasWorkingCopy: false,
    revisions: [],
  };
}

const DEMO_HISTORY = [
  // Current sprint (composite sprintId — needed by Gantt + Distribution)
  mkCurrentSnap('Mobile App v3.0 · June 2026','2026-06-02','2026-06-27', 'analysis',    ANALYSIS_PP,  ANALYSIS_ITEMS),
  mkCurrentSnap('Mobile App v3.0 · June 2026','2026-06-02','2026-06-27', 'devPlatform', PLATFORM_PP,  PLATFORM_ITEMS),
  mkCurrentSnap('Mobile App v3.0 · June 2026','2026-06-02','2026-06-27', 'testing',     TESTING_PP,   TESTING_ITEMS),
  // Past sprints (for Sprint History tab)
  mkSnap('sprint-mar-2026','Sprint 20 · March 2026','2026-03-03','2026-03-28','analysis','Analysis', 152,166),
  mkSnap('sprint-apr-2026','Sprint 21 · April 2026','2026-04-01','2026-04-25','analysis','Analysis', 160,148),
  mkSnap('sprint-may-2026','Sprint 22 · May 2026',  '2026-05-05','2026-05-30','analysis','Analysis', 160,172),
  mkSnap('sprint-mar-2026','Sprint 20 · March 2026','2026-03-03','2026-03-28','devPlatform','Platform development', 144,138),
  mkSnap('sprint-apr-2026','Sprint 21 · April 2026','2026-04-01','2026-04-25','devPlatform','Platform development', 160,160),
  mkSnap('sprint-may-2026','Sprint 22 · May 2026',  '2026-05-05','2026-05-30','devPlatform','Platform development', 160,155),
  mkSnap('sprint-mar-2026','Sprint 20 · March 2026','2026-03-03','2026-03-28','testing','Testing',   80, 88),
  mkSnap('sprint-apr-2026','Sprint 21 · April 2026','2026-04-01','2026-04-25','testing','Testing',   80, 76),
  mkSnap('sprint-may-2026','Sprint 22 · May 2026',  '2026-05-05','2026-05-30','testing','Testing',   80, 84),
];


// ─── Mock setup ──────────────────────────────────────────────────────────────

async function injectMock(page, state) {
  await page.addInitScript((s) => {
    const st = JSON.parse(s);
    window.YT = {
      host: {
        fetchYouTrack(path, opts) {
          const h = window.__ytMockHandlers?.[path];
          if (h) return h(opts || {});
          return Promise.resolve([]);
        }
      }
    };
    window.YTApp = {
      register() {
        return Promise.resolve({
          fetchApp(path, opts) {
            const h = window.__ytMockHandlers?.[path];
            if (h) return h(opts || {});
            return Promise.resolve({ success: false, error: 'not mocked: ' + path });
          },
          fetchYouTrack(path, opts) {
            const key = 'yt:' + path.replace(/\?.*$/, '');
            const h = window.__ytMockHandlers?.[key];
            if (h) return h(opts || {}, path);
            return Promise.resolve([]);
          },
          context: { project: { id: 'APP', name: 'Mobile App', shortName: 'APP' } },
          getBaseUrl() { return 'http://localhost:3939'; }
        });
      }
    };
    window.__ytMockHandlers = {
      'backend-project/sprint-data'(opts) {
        const body   = opts?.body ? JSON.parse(opts.body) : null;
        const method = (opts?.method || 'GET').toUpperCase();
        if (method === 'POST' && body) {
          if (body.sprint     !== undefined) st.sprint    = body.sprint;
          if (body.roleItems  !== undefined) st.roleItems = body.roleItems;
          if (body.settings   !== undefined) st.settings  = body.settings;
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({
          success: true,
          sprint:           st.sprint,
          roleItems:        st.roleItems,
          settings:         st.settings,
          enableDebugLog:   false,
          orphanGanttIssues: []
        });
      },
      'backend-project/history'(opts) {
        const body   = opts?.body ? JSON.parse(opts.body) : null;
        const method = (opts?.method || 'GET').toUpperCase();
        if (method === 'POST' && body?.history) {
          st.history = body.history;
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, history: st.history, orphanGanttBySprintId: {} });
      },
      'backend-project/working-drafts'() {
        return Promise.resolve({ success: true, drafts: {} });
      },
      'backend-project/app-version'()        { return Promise.resolve({ version: '2.1.8' }); },
      'backend-project/current-user'()       { return Promise.resolve(st.currentUser); },
      'backend-project/check-settings-manager'() { return Promise.resolve({ configured: true, canManage: true  }); },
      'backend-project/check-validator'()    { return Promise.resolve({ canValidate: true }); },
      'backend-project/check-editor'()       { return Promise.resolve({ canEdit: true }); },
      'backend-project/project-fields'()     { return Promise.resolve({ fields: [] }); },
      'yt:users/me'()   { return Promise.resolve({ id: 'u1', login: 'a.ivanova', fullName: 'Anna Ivanova' }); },
      'yt:groups'()     { return Promise.resolve([{ id:'g1', name:'All Users' }]); },
    };
  }, JSON.stringify(state));
}

// ─── DOM polish helpers ───────────────────────────────────────────────────────

/**
 * Translate Russian enum values (priorities / states) back to English.
 *
 * The widget has a hardcoded _enumLocaleMap that unconditionally translates
 * standard YT English values ('Critical' → 'Критическая') regardless of the
 * language setting. This is Bug #B7 [C+P] — fix pending in codebase.
 * For screenshots we patch the DOM after render.
 *
 * Also converts accordion resource/alloc stats from raw minutes to hours,
 * because computeRoleQuickStats() sums alloc_ values (minutes) but
 * _formatHoursLight() displays them without unit conversion.
 */
async function polishDOM(page) {
  await page.evaluate(() => {
    // 1. Translate Russian enum values → English in all visible text nodes
    const ruToEn = {
      'Критическая': 'Critical', 'Блокирующий': 'Blocker',
      'Высокий': 'High',         'Низкий': 'Low',
      'Обычная': 'Normal',       'Незначительный': 'Minor',
      'Значительный': 'Major',
      'Открыта': 'Open',         'В работе': 'In Progress',
      'Решена': 'Resolved',      'Исправлена': 'Fixed',
      'Отправлена': 'Submitted', 'Переоткрыта': 'Reopened',
      'Не будет исправлена': "Won't fix",
    };
    // Target cells that contain only a translated value (no surrounding text)
    document.querySelectorAll('td, .dyn-enum-cell, select option, th').forEach(el => {
      const txt = el.textContent.trim();
      if (ruToEn[txt]) el.textContent = ruToEn[txt];
    });

    // 2. Fix accordion header stats: alloc & resource values are in minutes,
    //    but _formatHoursLight just prints the raw number with an "h" suffix.
    //    Convert to hours so the header reads e.g. "Resource: 160 h".
    document.querySelectorAll('.planning-role-card').forEach(card => {
      const nums = card.querySelectorAll('.planning-role-toggle .planning-role-stat__num');
      if (nums.length < 2) return;
      // nums[0] = resource (minutes raw → show as hours)
      const resMin = parseInt(nums[0].textContent, 10);
      if (!isNaN(resMin) && resMin > 60) nums[0].textContent = String(Math.round(resMin / 60));
      // nums[1] = "allocMin / resMin"
      const parts = nums[1].textContent.split(' / ');
      if (parts.length === 2) {
        const allocH = Math.round((parseInt(parts[0], 10) || 0) / 60);
        const resH   = Math.round((parseInt(parts[1], 10) || 0) / 60);
        nums[1].textContent = allocH + ' / ' + resH;
      }
      // nums[2] = task count — leave unchanged
    });
  });
}

// ─── Tab switching (same mechanism as tab-helpers.js) ────────────────────────

async function clickTab(page, tabId) {
  await page.evaluate((id) => {
    const btn = document.querySelector(`.tab-btn.tab-state-tracker[data-tab="${id}"]`);
    if (btn) btn.click();
  }, tabId);
  await page.waitForSelector(`#tab-${tabId}.active`, { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

// ─── Main ────────────────────────────────────────────────────────────────────

let server;

async function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn('npx', ['http-server', '-p', '3939', '-c-1', '--cors', '.'], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 8_000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('3939')) { clearTimeout(timeout); resolve(); }
    });
    server.stderr.on('data', (d) => {
      if (String(d).includes('3939') || String(d).includes('Available')) { clearTimeout(timeout); resolve(); }
    });
    server.on('error', reject);
  });
}

async function main() {
  console.log('📦 Starting local server…');
  let serverStarted = false;
  try {
    await startServer();
    serverStarted = true;
    console.log('✅ Server on :3939');
  } catch {
    console.log('ℹ️  Server already running or timed out — continuing anyway');
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2   // retina → crisp text
  });
  const page = await ctx.newPage();

  const state = {
    sprint:      DEMO_SPRINT,
    roleItems:   DEMO_ROLE_ITEMS,
    history:     DEMO_HISTORY,
    workingDrafts: {},
    settings:    DEMO_SETTINGS,
    currentUser: { login: 'a.ivanova', fullName: 'Anna Ivanova', isAdmin: true,
                   groups: ['All Users', 'sprint-managers'] },
  };

  await injectMock(page, state);

  console.log('🌐 Loading widget…');
  await page.goto('http://localhost:3939/widgets/main/index.html');
  await page.waitForSelector('#widgetHeader, .widget-header', { timeout: 15_000 });
  await page.waitForTimeout(1_000);   // let Ring components settle

  // Hide debug/developer elements that shouldn't appear in marketplace screenshots
  await page.addStyleTag({ content: `
    #diagSection, .diag-section, [id*="diag"], [id*="Diag"],
    .diagnostic-log, #diagnosticLog, #diagLog,
    details:has(summary:contains("DIAGNOSTIC")),
    details[open] > summary { display: none !important; }
    details { display: none !important; }
  ` });
  // More targeted: hide any collapsible diagnostic section at the bottom
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(el => {
      if ((el.textContent || '').includes('DIAGNOSTIC')) el.style.display = 'none';
    });
  });

  // ── 1. Planning tab ──────────────────────────────────────────────────────
  console.log('📸 1/4 Planning tab…');
  await clickTab(page, 'planning');
  await page.waitForTimeout(800);

  // Ensure we are on the 'roles' level (default, but make it explicit)
  await page.evaluate(() => {
    const rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
    if (rolesBtn) rolesBtn.click();
  });
  await page.waitForTimeout(400);

  // Expand ALL role accordion cards by clicking .planning-role-toggle buttons inside #roleAccordions
  const expanded = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll('#roleAccordions .planning-role-toggle'));
    toggles.forEach(btn => btn.click());
    return toggles.length;
  });
  console.log(`   Clicked ${expanded} role toggles`);
  await page.waitForTimeout(1_000);   // wait for task tables to render

  // Scroll to show the role accordion section (skip the Sprint Overview form above it)
  await page.evaluate(() => {
    const accordions = document.getElementById('roleAccordions');
    if (accordions) accordions.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(300);

  await polishDOM(page);
  await page.screenshot({
    path: join(OUT_DIR, '01-planning-tab.png'),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });
  console.log('   → 01-planning-tab.png');

  // ── 2. Personal distribution (assignee view) ─────────────────────────────
  console.log('📸 2/4 Distribution by assignees…');
  // Switch to the 'people' level via the segmented control button
  await page.evaluate(() => {
    const peopleBtn = document.querySelector('.planning-level-btn[data-level="people"]');
    if (peopleBtn) peopleBtn.click();
  });
  await page.waitForTimeout(1_000);
  await polishDOM(page);
  await page.screenshot({
    path: join(OUT_DIR, '02-distribution-assignees.png'),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });
  console.log('   → 02-distribution-assignees.png');

  // ── 3. Gantt tab ─────────────────────────────────────────────────────────
  console.log('📸 3/4 Gantt chart…');
  await clickTab(page, 'gantt');
  await page.waitForTimeout(1_500);
  // If gantt container is still empty, try triggering a role change to force re-render
  const ganttItems = await page.evaluate(() => {
    const c = document.getElementById('ganttContainer');
    if (c && c.children.length === 0) {
      // Trigger role selector change to force refresh
      const sel = document.getElementById('ganttRoleSel');
      if (sel) {
        sel.dispatchEvent(new Event('change'));
        return { triggered: true, selValue: sel.value };
      }
    }
    return { triggered: false, children: c ? c.children.length : -1 };
  });
  console.log('   Gantt state:', JSON.stringify(ganttItems));
  if (ganttItems.triggered) await page.waitForTimeout(800);
  await polishDOM(page);
  await page.screenshot({
    path: join(OUT_DIR, '03-gantt-chart.png'),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });
  console.log('   → 03-gantt-chart.png');

  // ── 4. Sprint History tab ────────────────────────────────────────────────
  console.log('📸 4/4 Sprint History…');
  await clickTab(page, 'history');
  await page.waitForTimeout(1_000);
  await polishDOM(page);
  await page.screenshot({
    path: join(OUT_DIR, '04-sprint-history.png'),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });
  console.log('   → 04-sprint-history.png');

  await browser.close();
  if (serverStarted && server) server.kill();

  console.log('\n✅ Done! Screenshots saved to:');
  console.log(`   ${OUT_DIR}`);
  console.log('\n   Files:');
  console.log('   01-planning-tab.png         — Planning: role composition + task table');
  console.log('   02-distribution-assignees.png — Distribution by assignees view');
  console.log('   03-gantt-chart.png           — Gantt chart');
  console.log('   04-sprint-history.png        — Sprint history with delta');
}

main().catch(err => {
  console.error('❌', err.message);
  if (server) server.kill();
  process.exit(1);
});
