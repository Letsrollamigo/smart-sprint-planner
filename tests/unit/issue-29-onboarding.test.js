'use strict';
/* #29 (GH) — гейт draft-flush в global-режиме до выбора проекта (domain/draft-store.js).
   Симптом из репорта: POST draft с пустым projectKey → 400 invalid_project_key +
   вечный 5с-ретрай (ERR-шум в диаг-логе). Гейт тихо держит pending до выбора
   проекта; project-режим и global с выбранным проектом флашатся как раньше. */

const test = require('node:test');
const assert = require('node:assert');
const STORE = require('../../widgets/main/src/domain/draft-store.js');

function makeDeps(mode, projectKey) {
  const calls = [];
  let pending = true;
  return {
    calls,
    getPending: () => pending,
    deps: {
      T: (k) => k,
      toast: () => {},
      diag: () => {},
      apiPost: (path, body) => { calls.push(path); return Promise.resolve({ success: true }); },
      state: {
        getDraftPending: () => pending,
        setDraftPending: (b) => { pending = b; },
        getDraft: () => ({ ui: { collapsed: true } }),
        getMode: () => mode,
        getActiveProjectKey: () => projectKey,
      },
    },
  };
}

test('#29 global без выбранного проекта: flush молчит, pending остаётся', () => {
  const h = makeDeps('global', null);
  STORE.draftFlushNow(h.deps);
  assert.deepStrictEqual(h.calls, []);
  assert.strictEqual(h.getPending(), true);   // дошлётся следующим scheduleFlush
});

test('#29 global с выбранным проектом: flush уходит', () => {
  const h = makeDeps('global', 'DEMO');
  STORE.draftFlushNow(h.deps);
  assert.deepStrictEqual(h.calls, ['draft']);
  assert.strictEqual(h.getPending(), false);
});

test('#29 project-режим: поведение не тронуто', () => {
  const h = makeDeps('project', null);
  STORE.draftFlushNow(h.deps);
  assert.deepStrictEqual(h.calls, ['draft']);
});
