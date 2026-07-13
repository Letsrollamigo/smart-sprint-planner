/**
 * v1.2.1 DTA workflow-rule unit-тесты (node:test).
 *
 * Запуск: `node --test 'tests/unit/*.test.js'`. Stub'ит
 * `@jetbrains/youtrack-scripting-api/*` через Module._resolveFilename hack,
 * чтобы можно было require workflow-dta-aggregation.js без YT runtime.
 *
 * v1.2.3 update: возврат к single canonical export `exports.rule`
 * (YT scripting registers on-change rules только под этим точным именем —
 * dual-export через issueRule/workItemRule в v1.2.1 интерпретировался YT
 * как "exported script"). Имя fact-поля берётся из
 * settings[FIELD_FACT_KEY_BY_ROLE[role]] — реальное имя custom-field в YT.
 * Локализация — primary settings.defaultLang, secondary normalized
 * currentUser.profile.locale.language.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

/* ── YT scripting-api stubs ─────────────────────────────────────────────── */

const messageLog = [];
const checkLog = [];

const ytStubs = {
  '@jetbrains/youtrack-scripting-api/entities': {
    Issue: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } },
    IssueWorkItem: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } },
    EnumField: { fieldType: 'enum' },
    Field: { periodType: 'period' },
    IssueLinkPrototype: 'IssueLinkPrototype'
  },
  '@jetbrains/youtrack-scripting-api/workflow': {
    message: function(s) { messageLog.push(s); },
    /* Реальный YT workflow.check бросает WorkflowCheckException при
       cond=false, прерывая action и блокируя save. Имитируем то же. */
    check: function(cond, msg) {
      checkLog.push({ cond: cond, msg: msg });
      if (!cond) {
        const e = new Error(msg || 'workflow.check failed');
        e.name = 'WorkflowCheckException';
        throw e;
      }
    }
  },
  '@jetbrains/youtrack-scripting-api/date-time': {
    toPeriod: function(ms) {
      const minutes = Math.floor(ms / 60000);
      return {
        getWeeks: function() { return 0; },
        getDays: function() { return 0; },
        getHours: function() { return Math.floor(minutes / 60); },
        getMinutes: function() { return minutes % 60; },
        __mins: minutes
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

const wfPath = path.resolve(__dirname, '../../workflow-dta-aggregation.js');
const wfModule = require(wfPath);

/* ── Helpers ────────────────────────────────────────────────────────────── */

function periodOfMinutes(m) {
  return {
    getWeeks: () => 0,
    getDays: () => 0,
    getHours: () => Math.floor(m / 60),
    getMinutes: () => m % 60
  };
}

function _makeColl(items) {
  const arr = (items || []).slice();
  arr.isNotEmpty = function() { return arr.length > 0; };
  arr.isEmpty = function() { return arr.length === 0; };
  arr.size = arr.length;
  return arr;
}

function makeIssue(opts) {
  const fields = Object.assign({}, opts.fields || {});
  const allItems = opts.workItems || [];
  const issue = {
    id: opts.id || 'TEST-1',
    isReported: opts.isReported !== false,   /* default true */
    isResolved: !!opts.isResolved,            /* default false */
    fields: fields,
    project: {
      extensionProperties: { ssp_settings: opts.settings || null }
    },
    workItems: _makeColl(allItems)
  };
  /* По умолчанию имитируем «edited mode» — все workItems сразу видны как
     editedWorkItems (full recompute path). Тесты, явно проверяющие delta,
     передают opts.added/opts.removed и opts.edited:[]. */
  issue.editedWorkItems = _makeColl(opts.edited !== undefined ? opts.edited : allItems);
  issue.workItems.added = _makeColl(opts.added || []);
  issue.workItems.removed = _makeColl(opts.removed || []);
  return issue;
}

function makeIssueCtx(issue, currentLang) {
  return {
    issue: issue,
    currentUser: { profile: { locale: currentLang ? { language: currentLang } : null } }
  };
}

function resetLogs() { messageLog.length = 0; checkLog.length = 0; }

/* Канонические настройки с реальными именами YT-полей для двух ролей. */
function settingsWith(extra) {
  return Object.assign({
    dtaEnabled: true,
    defaultLang: 'ru',
    activeRoles: { devFront: true, testing: true },
    workItemTypeMapping: { 'Development': 'devFront', 'QA': 'testing' },
    fieldFactDevFront:    'Факт разработка ФРОНТ ЧЧ',
    fieldFactTesting:     'Факт тестирование ЧЧ',
    fieldFactAnalysis:    'Факт анализ ЧЧ',
    fieldFactDevBack:     'Факт разработка БЭК ЧЧ',
    fieldFactDevPlatform: 'Факт разработка платформа ЧЧ',
    fieldFactDevIos:      'Факт разработка iOS ЧЧ',
    fieldFactDevAndroid:  'Факт разработка Android ЧЧ',
    fieldFactDevFullstack:'Факт разработка fullstack ЧЧ',
    fieldFactDevDb:       'Факт разработка СУБД ЧЧ'
  }, extra || {});
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

test('exports a single canonical `rule` (YT spec — exports.rule)', () => {
  assert.ok(wfModule.rule && wfModule.rule.spec,
    'workflow must expose exports.rule (not custom-named exports) for YT to register it as on-change');
  assert.strictEqual(typeof wfModule.rule.spec.guard, 'function');
  assert.strictEqual(typeof wfModule.rule.spec.action, 'function');
});

test('guard: false when dtaEnabled missing', () => {
  resetLogs();
  const issue = makeIssue({ settings: { activeRoles: { devFront: true } } });
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), false);
});

test('guard: false when workItemTypeMapping is empty', () => {
  resetLogs();
  const issue = makeIssue({
    settings: { dtaEnabled: true, workItemTypeMapping: {}, activeRoles: { devFront: true } }
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), false);
});

test('guard: true when dtaEnabled and mapping populated and workItems changed', () => {
  resetLogs();
  /* v1.2.4: guard требует hasWorkItemChanges — иначе skip как no-op. */
  const issue = makeIssue({
    settings: settingsWith(),
    workItems: [{ type: { name: 'Development' }, duration: 60 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), true);
});

test('guard: false when no workItem changes (no-op skip)', () => {
  resetLogs();
  const issue = makeIssue({ settings: settingsWith() }); // empty edited/added/removed
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), false);
});

test('guard: false on resolved issue', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith(),
    isResolved: true,
    workItems: [{ type: { name: 'Development' }, duration: 60 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), false);
});

test('action: writes period to real YT field name from settings', () => {
  resetLogs();
  const issue = makeIssue({
    id: 'PRJ-42',
    settings: settingsWith(),
    workItems: [
      { type: { name: 'Development' }, duration: 120 },
      { type: { name: 'Development' }, duration: 60 },
      { type: { name: 'QA' }, duration: 45 }
    ]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(issue.fields['Факт разработка ФРОНТ ЧЧ'], 'real YT field set');
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'].__mins, 180);
  assert.strictEqual(issue.fields['Факт тестирование ЧЧ'].__mins, 45);
  /* defaultLang=ru → message по-русски */
  assert.ok(messageLog.some(s => /Распределение времени/.test(s)),
    'workflow.message must be in Russian (settings.defaultLang=ru)');
});

test('action: zeroes out fact-field when all workItems of role removed (delta path)', () => {
  resetLogs();
  /* delta path: editedWorkItems empty, removed contains the deleted item.
     Стартуем с текущим fact = 120m, минусуем removed.duration = 120m → 0. */
  const issue = makeIssue({
    id: 'PRJ-7',
    fields: { 'Факт разработка ФРОНТ ЧЧ': periodOfMinutes(120) },
    settings: settingsWith(),
    workItems: [],
    edited: [],
    removed: [{ type: { name: 'Development' }, duration: 120 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'], null,
    'fact-field cleared after removed workItem brings role to 0');
});

test('action: emits errFieldMissing when role has no fact-field configured', () => {
  resetLogs();
  /* Роль devFront в маппинге, но settings.fieldFactDevFront НЕ задан. */
  const settings = settingsWith();
  delete settings.fieldFactDevFront;
  const issue = makeIssue({
    settings: settings,
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /Не задано фактическое поле|No fact-field configured/.test(s)),
    'should emit errFieldMissing diagnostic');
});

test('action: skips type without mapping', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith(),
    workItems: [
      { type: { name: 'Development' }, duration: 30 },
      { type: { name: 'UnmappedType' }, duration: 999 }
    ]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'].__mins, 30,
    'only mapped type contributes');
});

test('action: skips inactive role with diagnostic message', () => {
  resetLogs();
  const settings = settingsWith({
    activeRoles: { devFront: true, devBack: false },
    workItemTypeMapping: { 'Development': 'devFront', 'Backend': 'devBack' }
  });
  const issue = makeIssue({
    settings: settings,
    workItems: [
      { type: { name: 'Development' }, duration: 60 },
      { type: { name: 'Backend' }, duration: 999 }
    ]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'].__mins, 60);
  assert.strictEqual(issue.fields['Факт разработка БЭК ЧЧ'], undefined,
    'inactive role not written');
  assert.ok(messageLog.some(s => /devBack|Backend|неактивной/.test(s)),
    'diagnostic about inactive-role mapping');
});

test('locale: settings.defaultLang=ru → ru message regardless of currentUser locale', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ defaultLang: 'ru' }),
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  /* currentUser.locale='en' — но defaultLang='ru' priority выше. */
  wfModule.rule.spec.action(makeIssueCtx(issue, 'en'));
  assert.ok(messageLog.some(s => /Распределение/.test(s)), 'ru message wins via defaultLang');
});

test('locale: defaultLang=en, currentUser=ru-RU → ru via prefix normalization', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ defaultLang: 'en' }),
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue, 'ru-RU'));
  /* defaultLang=en → en wins (primary). */
  assert.ok(messageLog.some(s => /Distributed/.test(s)), 'en wins as primary');
});

test('locale: no defaultLang, currentUser=ru-RU → ru via normalization', () => {
  resetLogs();
  const settings = settingsWith();
  delete settings.defaultLang;
  const issue = makeIssue({
    settings: settings,
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue, 'ru-RU'));
  assert.ok(messageLog.some(s => /Распределение/.test(s)),
    'ru-RU normalized to ru when defaultLang absent');
});

/* ── v1.2.4: notifyProgress (план/факт), type-check, delta vs full ─────── */

test('warnings off: no progress message when dtaWarningsEnabled is false', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: false, fieldDevFront: '$План фронт ЧЧ' }),
    fields: { '$План фронт ЧЧ': periodOfMinutes(8 * 60) },
    workItems: [{ type: { name: 'Development' }, duration: 60 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(!messageLog.some(s => /Выработано|Logged/.test(s)),
    'no progress message must be emitted when warnings off');
  /* msgFactUpdated всё равно есть — это feedback об изменении fact-поля. */
});

test('warnings on, plan>0, fact<90%: progressUnder90 message in ru', () => {
  resetLogs();
  /* plan = 8h = 480m; fact = 60m; percent = 12.50% */
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: true, fieldDevFront: '$План фронт' }),
    fields: { '$План фронт': periodOfMinutes(480) },
    workItems: [{ type: { name: 'Development' }, duration: 60 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /Выработано .* 1ч 0м из плановых 8ч \(12\.50%\)/.test(s)),
    'expected progressUnder90 RU message; got: ' + JSON.stringify(messageLog));
});

test('warnings on, fact 90-100%: progressNearLimit with executor advice', () => {
  resetLogs();
  /* plan 60m, fact 55m → 91.67% — в зоне «осталось <10%» */
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: true, fieldDevFront: '$План фронт' }),
    fields: { '$План фронт': periodOfMinutes(60) },
    workItems: [{ type: { name: 'Development' }, duration: 55 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /Остаток менее 10%/.test(s)),
    'expected near-limit warning; got: ' + JSON.stringify(messageLog));
  assert.ok(messageLog.some(s => /связаться с аналитиком/.test(s)),
    'devFront role → executor advice');
});

test('warnings on, fact>100%: progressOverLimit with overrun', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: true, fieldDevFront: '$План фронт' }),
    fields: { '$План фронт': periodOfMinutes(60) },
    workItems: [{ type: { name: 'Development' }, duration: 90 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /ПЕРЕЛИМИТ/.test(s)),
    'expected overrun message; got: ' + JSON.stringify(messageLog));
});

test('warnings on, analysis role → adviceAnalysis (decompose)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({
      dtaWarningsEnabled: true,
      fieldAnalysis: '$План анализ',
      workItemTypeMapping: { 'Анализ': 'analysis' },
      activeRoles: { analysis: true }
    }),
    fields: { '$План анализ': periodOfMinutes(60) },
    workItems: [{ type: { name: 'Анализ' }, duration: 90 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /декомпозировать/.test(s)),
    'analysis role over-limit → adviceAnalysis (decompose); got: ' + JSON.stringify(messageLog));
});

test('warnings on, plan=0: progressNoEstimate (no percent)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: true }),
    /* План-поле в settings есть, но в issue.fields он не установлен → planPeriod=null. */
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.ok(messageLog.some(s => /Выработано .* 0ч 30м$/.test(s)),
    'no estimate → simple "Logged X" message; got: ' + JSON.stringify(messageLog));
});

test('mandatory type-check: throws when added workItem has no type', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: false }),
    workItems: [],
    edited: [],
    added: [{ /* no type */ duration: 30 }]
  });
  /* workflow.check throws on false-condition. Action должен пробросить
     это исключение наружу (save fails). */
  assert.throws(() => wfModule.rule.spec.action(makeIssueCtx(issue)),
    /WorkflowCheckException|workflow\.check/i);
});

test('delta path: starts from current fact, applies added/removed', () => {
  resetLogs();
  /* Текущий fact = 60m. Added: +30m. Removed: -10m. → 80m. */
  const issue = makeIssue({
    settings: settingsWith({ dtaWarningsEnabled: false }),
    fields: { 'Факт разработка ФРОНТ ЧЧ': periodOfMinutes(60) },
    workItems: [],
    edited: [],
    added: [{ type: { name: 'Development' }, duration: 30 }],
    removed: [{ type: { name: 'Development' }, duration: 10 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'].__mins, 80,
    'delta: 60 + 30 - 10 = 80');
});

test('locale: unknown lang falls back to en', () => {
  resetLogs();
  const settings = settingsWith();
  delete settings.defaultLang;
  const issue = makeIssue({
    settings: settings,
    workItems: [{ type: { name: 'Development' }, duration: 30 }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue, 'xx'));
  assert.ok(messageLog.some(s => /Distributed/.test(s)), 'unknown locale → en fallback');
});

test('action: getMinutes уважает settings.hoursPerDay (день = 6ч, не хардкод 8)', () => {
  resetLogs();
  const dayPeriod = { getWeeks: () => 0, getDays: () => 1, getHours: () => 0, getMinutes: () => 0 };
  const issue = makeIssue({
    id: 'PRJ-6H',
    settings: settingsWith({ hoursPerDay: 6 }),
    workItems: [{ type: { name: 'Development' }, duration: dayPeriod }]
  });
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(issue.fields['Факт разработка ФРОНТ ЧЧ'].__mins, 360);
});

test('P-6: guard→action — один доступ к settings (handoff-кэш)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsWith(),
    workItems: [{ type: { name: 'Development' }, duration: 60 }]
  });
  const ep = issue.project.extensionProperties;
  const raw = ep.ssp_settings;
  let reads = 0;
  Object.defineProperty(ep, 'ssp_settings', { get() { reads++; return raw; } });
  assert.strictEqual(wfModule.rule.spec.guard(makeIssueCtx(issue)), true);
  wfModule.rule.spec.action(makeIssueCtx(issue));
  assert.strictEqual(reads, 1, 'guard+action должны читать settings один раз (handoff-кэш)');
});
