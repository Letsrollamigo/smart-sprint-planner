/**
 * YouTrack API mock for Playwright tests.
 * Use: await setupApiMock(page, initialState);
 * Intercepts all YT.host.fetchYouTrack calls via page.route().
 *
 * The widget communicates with backend via apiGet/apiPost which internally
 * call YT.host.fetchYouTrack. We intercept at the page level.
 *
 * Default state: empty project (no sprint, empty history, default settings).
 */

export const DEFAULT_SETTINGS = {
  validationGroups: ['sprint-validators'],
  editGroups: ['sprint-editors'],
  settingsManagerGroup: 'sprint-managers',
  historyClearGroups: [],
  activeRoles: {
    frontend: true, backend: true, qa: true,
    devops: false, analytics: false, pm: false,
    design: false, mobile: false, support: false
  },
  nkcJanMay: 160,
  nkcOther: 168,
  rate: 1,
  participation: 1,
  gradeKpe: { intern: 0.5, jun: 0.7, mid: 1.0, senior: 1.2 },
  fieldPriority: 'Priority',
  fieldXPriority: 'XPriority',
  fieldState: 'State',
  fieldSystem: 'Subsystem',
  fieldSprint: 'Sprint',
  fieldVersion: 'Version',
  personalPlanningEnabled: true,
  usePersonalForResource: false,
  dynEditEnabled: false,
  language: 'ru'
};

/**
 * Wires page.route() to intercept all HTTP-level requests to the mock backend.
 * The widget uses YT.host.fetchYouTrack (not direct HTTP), but we inject
 * __ytMockHandlers into the page to intercept at the JS level.
 */
export async function setupApiMock(page, stateOverride = {}) {
  const state = {
    sprint: null,
    roleItems: {},
    history: [],
    workingDrafts: {},
    settings: { ...DEFAULT_SETTINGS },
    currentUser: { login: 'test', fullName: 'Test User', isAdmin: true,
                   groups: ['sprint-validators','sprint-editors','sprint-managers'] },
    ...stateOverride
  };

  // Inject YTApp/YT mocks + mock state into the page context before any scripts run
  await page.addInitScript((serializedState) => {
    window.__mockState = JSON.parse(serializedState);

    // --- YouTrack Apps SDK mock ---
    window.YT = {
      host: {
        fetchYouTrack: function(path, opts) {
          var handler = window.__ytMockHandlers && window.__ytMockHandlers[path];
          if (handler) return handler(opts || {});
          console.warn('[ytapp-mock] unhandled path:', path);
          return Promise.resolve({ success: false, error: 'not mocked: ' + path });
        }
      }
    };

    // YTApp.register() — called with no args, resolves with host object
    window.YTApp = {
      register: function() {
        var host = {
          fetchApp: function(path, opts) {
            var handler = window.__ytMockHandlers && window.__ytMockHandlers[path];
            if (handler) return handler(opts || {});
            console.warn('[ytapp-mock] unhandled fetchApp path:', path);
            return Promise.resolve({ success: false, error: 'not mocked: ' + path });
          },
          fetchYouTrack: function(path, opts) {
            var key = 'yt:' + path.replace(/\?.*$/, '');
            var handler = window.__ytMockHandlers && window.__ytMockHandlers[key];
            if (handler) return handler(opts || {}, path);
            console.warn('[ytapp-mock] unhandled fetchYouTrack path:', path);
            return Promise.resolve([]);
          },
          context: {
            project: { id: 'TEST', name: 'Test Project', shortName: 'TEST' }
          },
          getBaseUrl: function() { return 'http://localhost:3939'; }
        };
        return Promise.resolve(host);
      }
    };
    // --- end SDK mock ---
    window.__ytMockHandlers = {
      // fetchApp paths (all prefixed with 'backend-project/')
      'backend-project/sprint-data': function(opts) {
        var body = opts && opts.body ? JSON.parse(opts.body) : null;
        var method = opts && opts.method ? opts.method.toUpperCase() : 'GET';
        if (method === 'POST' && body) {
          if (body.sprint !== undefined) window.__mockState.sprint = body.sprint;
          if (body.roleItems !== undefined) window.__mockState.roleItems = body.roleItems;
          if (body.settings !== undefined) window.__mockState.settings = body.settings;
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({
          success: true,
          sprint: window.__mockState.sprint,
          roleItems: window.__mockState.roleItems,
          settings: window.__mockState.settings,
          enableDebugLog: false,
          orphanGanttIssues: []
        });
      },
      'backend-project/history': function(opts) {
        var body = opts && opts.body ? JSON.parse(opts.body) : null;
        var method = opts && opts.method ? opts.method.toUpperCase() : 'GET';
        if (method === 'POST' && body && body.history) {
          window.__mockState.history = body.history;
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({
          success: true,
          history: window.__mockState.history,
          orphanGanttBySprintId: {}
        });
      },
      'backend-project/working-drafts': function(opts) {
        var body = opts && opts.body ? JSON.parse(opts.body) : null;
        var method = opts && opts.method ? opts.method.toUpperCase() : 'GET';
        if (method === 'DELETE' && opts && opts.draftKey) {
          delete window.__mockState.workingDrafts[opts.draftKey];
          return Promise.resolve({ success: true });
        }
        if (method === 'POST' && body) {
          if (body.drafts) window.__mockState.workingDrafts = body.drafts;
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, drafts: window.__mockState.workingDrafts });
      },
      'backend-project/app-version': function() {
        return Promise.resolve({ version: '5.12.0' });
      },
      'backend-project/current-user': function() {
        return Promise.resolve(window.__mockState.currentUser);
      },
      'backend-project/check-settings-manager': function() {
        return Promise.resolve({ configured: true, canManage: true });
      },
      'backend-project/check-validator': function() {
        return Promise.resolve({ canValidate: true });
      },
      'backend-project/check-editor': function() {
        return Promise.resolve({ canEdit: true });
      },
      'backend-project/project-fields': function() {
        return Promise.resolve({ fields: [] });
      },
      // fetchYouTrack paths (prefixed with 'yt:')
      'yt:users/me': function() {
        return Promise.resolve({ id: 'test-id', login: 'test', fullName: 'Test User' });
      },
      'yt:groups': function() {
        return Promise.resolve([
          { id: 'g1', name: 'sprint-validators' },
          { id: 'g2', name: 'sprint-editors' },
          { id: 'g3', name: 'sprint-managers' }
        ]);
      }
    };
  }, JSON.stringify(state));
}

/** Helper: generate a minimal sprint object for seeding */
export function makeSprint(overrides = {}) {
  return {
    sprintId: 'sprint-' + Date.now(),
    name: 'Test Sprint',
    dateStart: '2026-06-01',
    dateEnd: '2026-06-30',
    status: 'PLANNING',
    personalPlanning: {},
    ...overrides
  };
}

/** Helper: generate a history snapshot */
export function makeHistorySnap(overrides = {}) {
  return {
    sprintId: 'sprint-' + Date.now(),
    roleKey: 'frontend',
    roleLabel: 'Frontend',
    name: 'Test Sprint',
    dateStart: '2026-06-01',
    dateEnd: '2026-06-30',
    status: 'CONFIRMED',
    confirmedAt: Date.now(),
    confirmedBy: 'test',
    items: [],
    personalPlanning: {},
    hasWorkingCopy: false,
    revisions: [],
    ...overrides
  };
}
