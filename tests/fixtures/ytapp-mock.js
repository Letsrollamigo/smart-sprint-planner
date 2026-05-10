/**
 * Mock for YouTrack Apps SDK (YTApp / YT.host.fetchYouTrack).
 * Injected into the widget iframe before index.html loads.
 * Registers a minimal YTApp that resolves immediately and routes all
 * fetchYouTrack calls to the mock backend defined in youtrack-api-mock.js.
 */
window.__ytMockHandlers = {};

window.YT = {
  host: {
    fetchYouTrack: function(path, opts) {
      var handler = window.__ytMockHandlers[path];
      if (handler) return handler(opts || {});
      console.warn('[ytapp-mock] unhandled path:', path);
      return Promise.resolve({ success: false, error: 'not mocked: ' + path });
    }
  }
};

window.YTApp = {
  register: function(config) {
    if (config && typeof config.render === 'function') {
      // Simulate the post-login widget lifecycle: call render() with mock context
      setTimeout(function() {
        try {
          config.render({
            login: 'test',
            fullName: 'Test User',
            ringId: 'test-ring-id',
            isAdmin: true,
            groups: ['sprint-validators', 'sprint-editors', 'sprint-managers'],
            guest: false
          });
        } catch(e) {
          console.error('[ytapp-mock] render error:', e);
        }
      }, 0);
    }
    return Promise.resolve();
  }
};
