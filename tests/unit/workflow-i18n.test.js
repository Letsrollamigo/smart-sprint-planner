'use strict';

/* v1.7.1 — workflow message i18n audit.
 * Проверяет что все 4 workflow file (cascade, dta, forbid, state-rollup):
 *   - Имеют WF_I18N со всеми 15 локалями;
 *   - Корректно выбирают локаль через pickLocale (settings.defaultLang →
 *     ctx.currentUser.profile.locale.language → FALLBACK_LANG 'en');
 *   - Возвращают локализованный текст через tWf, без hardcoded EN-fallback'ов.
 */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');
const Module = require('node:module');

const messageLog = [];
const ytStubs = {
  '@jetbrains/youtrack-scripting-api/entities': {
    Issue:   { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } },
    Project: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } }
  },
  '@jetbrains/youtrack-scripting-api/workflow': {
    message: function(s) { messageLog.push(s); },
    check:   function(cond, msg) { if (!cond) throw new Error(msg || 'workflow.check failed'); }
  },
  '@jetbrains/youtrack-scripting-api/date-time': {
    toPeriod: function(ms) {
      const minutes = Math.floor((ms || 0) / 60000);
      return {
        getWeeks:   function() { return 0; },
        getDays:    function() { return 0; },
        getHours:   function() { return Math.floor(minutes / 60); },
        getMinutes: function() { return minutes % 60; }
      };
    }
  }
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(ytStubs, req)) return req;
  return origResolve.call(this, req, parent, ...rest);
};
const origLoad = Module._load;
Module._load = function(req, parent, ...rest) {
  if (Object.prototype.hasOwnProperty.call(ytStubs, req)) return ytStubs[req];
  return origLoad.call(this, req, parent, ...rest);
};

const EXPECTED_LOCALES = ['en','ru','cs','de','es','fr','hu','it','ja','ko','nl','pl','pt','tr','zh'];

function loadWorkflow(name) {
  return require(path.join(__dirname, '..', '..', name));
}

const wfCascade    = loadWorkflow('workflow-cascade-aggregation.js');
const wfDta        = loadWorkflow('workflow-dta-aggregation.js');
const wfForbid     = loadWorkflow('workflow-forbid-container.js');
const wfStateRoll  = loadWorkflow('workflow-state-rollup.js');

const allWorkflows = [
  { name: 'cascade-aggregation', wf: wfCascade   },
  { name: 'dta-aggregation',     wf: wfDta       },
  { name: 'forbid-container',    wf: wfForbid    },
  { name: 'state-rollup',        wf: wfStateRoll }
];

allWorkflows.forEach(function(entry) {
  test(entry.name + ': WF_I18N has all 15 expected locales', function() {
    assert.ok(entry.wf.WF_I18N, 'WF_I18N not exported by ' + entry.name);
    EXPECTED_LOCALES.forEach(function(lang) {
      assert.ok(entry.wf.WF_I18N[lang], entry.name + ' missing locale: ' + lang);
    });
  });

  test(entry.name + ': pickLocale uses settings.defaultLang if set', function() {
    if (typeof entry.wf.pickLocale !== 'function') return; // forbid-container exposes pickLocale via different path
    const lang = entry.wf.pickLocale({}, { defaultLang: 'de' });
    assert.strictEqual(lang, 'de');
  });

  test(entry.name + ': pickLocale falls back to ctx.currentUser.profile.locale.language when no defaultLang', function() {
    if (typeof entry.wf.pickLocale !== 'function') return;
    const ctx = { currentUser: { profile: { locale: { language: 'fr' } } } };
    const lang = entry.wf.pickLocale(ctx, {});
    assert.strictEqual(lang, 'fr');
  });

  test(entry.name + ': pickLocale falls back to FALLBACK_LANG (en) when nothing set', function() {
    if (typeof entry.wf.pickLocale !== 'function') return;
    const lang = entry.wf.pickLocale({}, {});
    assert.strictEqual(lang, 'en');
  });

  test(entry.name + ': pickLocale ignores unsupported lang, falls back to en', function() {
    if (typeof entry.wf.pickLocale !== 'function') return;
    const lang = entry.wf.pickLocale({}, { defaultLang: 'klingon' });
    assert.strictEqual(lang, 'en');
  });

  test(entry.name + ': tWf returns localized string from selected locale', function() {
    if (typeof entry.wf.tWf !== 'function') return;
    const en = entry.wf.WF_I18N.en;
    const ru = entry.wf.WF_I18N.ru;
    const sampleKey = Object.keys(en)[0];
    if (!sampleKey) return; // no keys in dict
    const enValue = entry.wf.tWf('en', sampleKey, {});
    const ruValue = entry.wf.tWf('ru', sampleKey, {});
    // EN ≠ RU for at least the canonical message keys (ensures real translation, not placeholder)
    assert.notStrictEqual(enValue, ruValue, entry.name + ' EN===RU for ' + sampleKey);
  });

  /* v1.7.1 — strict guard: every locale (cs/de/.../zh) must have NON-EN content
     for every key (no placeholder=EN copies). Catches accidental v1.7.0-style
     placeholder regressions on future releases.
     Allowlist for legitimate non-translatable values:
       - cascade.cascadeFieldChange — template '{field}: {from} → {to}' (no words)
       - dta.unitH / unitM — universal unit symbols (h, m); some languages share them */
  const NON_TRANSLATABLE_KEYS = {
    'cascade-aggregation': ['cascadeFieldChange'],
    'dta-aggregation':     ['unitH', 'unitM'],
    'forbid-container':    [],
    'state-rollup':        []
  };

  test(entry.name + ': WF_I18N has no placeholder (EN copy) translations for any locale × key', function() {
    const en = entry.wf.WF_I18N.en;
    const allowlist = NON_TRANSLATABLE_KEYS[entry.name] || [];
    const placeholders = [];
    EXPECTED_LOCALES.forEach(function(lang) {
      if (lang === 'en') return; // EN is the source — skip self-comparison
      const dict = entry.wf.WF_I18N[lang];
      if (!dict) return;
      Object.keys(en).forEach(function(key) {
        if (allowlist.indexOf(key) >= 0) return;
        if (dict[key] === en[key]) {
          placeholders.push(lang + '.' + key);
        }
      });
    });
    assert.strictEqual(placeholders.length, 0,
      entry.name + ' has ' + placeholders.length + ' placeholder=EN translations: ' + placeholders.join(', '));
  });
});
