/**
 * v1.3.0 Forbid-container-workItems workflow-rule unit tests (node:test).
 *
 * Покрытие:
 *   - guard: false когда forbidContainerWorkItems выключен;
 *   - guard: false когда workItems не менялись;
 *   - guard: false на не-container kind (task);
 *   - guard: true когда added на Story (level-2);
 *   - guard: true когда editedWorkItems на Epic (level-3);
 *   - action: workflow.check(false, ...) → throws WorkflowCheckException.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const checkLog = [];

const ytStubs = {
  '@jetbrains/youtrack-scripting-api/entities': {
    Issue: { onChange: function(spec) { return { __isOnChange: true, spec: spec }; } }
  },
  '@jetbrains/youtrack-scripting-api/workflow': {
    message: function() {},
    check: function(cond, msg) {
      checkLog.push({ cond: cond, msg: msg });
      if (!cond) {
        const e = new Error(msg || 'workflow.check failed');
        e.name = 'WorkflowCheckException';
        throw e;
      }
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

const wfPath = path.resolve(__dirname, '../../workflow-forbid-container.js');
const wfModule = require(wfPath);

function _coll(items) {
  const arr = (items || []).slice();
  arr.isNotEmpty = function() { return arr.length > 0; };
  arr.isEmpty = function() { return arr.length === 0; };
  arr.size = arr.length;
  return arr;
}

function makeIssue(opts) {
  opts = opts || {};
  const fields = Object.assign({}, opts.fields || {});
  const kindField = opts.kindField || 'Type';
  if (opts.kind !== undefined) fields[kindField] = opts.kind ? { name: opts.kind } : null;
  return {
    id: opts.id || 'TEST-1',
    fields: fields,
    project: { extensionProperties: { ssp_settings: opts.settings || null } },
    workItems: { added: _coll(opts.added || []) },
    editedWorkItems: _coll(opts.edited || [])
  };
}

function makeCtx(issue, currentLang) {
  return {
    issue: issue,
    currentUser: { profile: { locale: currentLang ? { language: currentLang } : null } }
  };
}

function settingsForbid(extra) {
  return Object.assign({
    forbidContainerWorkItems: true,
    defaultLang: 'en',
    cascadeKindField: 'Type',
    cascadeLevel2Values: ['Story'],
    cascadeLevel3Values: ['Epic']
  }, extra || {});
}

function resetLogs() { checkLog.length = 0; }

/* ── Tests ──────────────────────────────────────────────────────────────── */

test('forbid: exports a single canonical `rule`', () => {
  assert.ok(wfModule.rule && wfModule.rule.spec);
  assert.strictEqual(typeof wfModule.rule.spec.guard, 'function');
  assert.strictEqual(typeof wfModule.rule.spec.action, 'function');
});

test('forbid guard: false when forbidContainerWorkItems is off', () => {
  resetLogs();
  const issue = makeIssue({
    settings: { forbidContainerWorkItems: false, cascadeLevel2Values: ['Story'], cascadeLevel3Values: ['Epic'] },
    kind: 'Story',
    added: [{ duration: 60 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('forbid guard: false when no work-item mutations', () => {
  resetLogs();
  const issue = makeIssue({ settings: settingsForbid(), kind: 'Story' });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('forbid guard: false on non-container kind (regular task)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsForbid(),
    kind: 'Task',
    added: [{ duration: 60 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), false);
});

test('forbid guard: true when added work-items on Story (level-2)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsForbid(),
    kind: 'Story',
    added: [{ duration: 60 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), true);
});

test('forbid guard: true when editedWorkItems on Epic (level-3)', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsForbid(),
    kind: 'Epic',
    edited: [{ duration: 30 }]
  });
  assert.strictEqual(wfModule.rule.spec.guard(makeCtx(issue)), true);
});

test('forbid action: workflow.check throws WorkflowCheckException with localized message', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsForbid({ defaultLang: 'ru' }),
    kind: 'Story',
    added: [{ duration: 60 }]
  });
  assert.throws(
    () => wfModule.rule.spec.action(makeCtx(issue)),
    /WorkflowCheckException|Запрещено прямое списание/i
  );
  assert.strictEqual(checkLog.length, 1);
  assert.strictEqual(checkLog[0].cond, false);
  assert.match(checkLog[0].msg, /Запрещено прямое списание/);
});

test('forbid action: en locale produces English message', () => {
  resetLogs();
  const issue = makeIssue({
    settings: settingsForbid({ defaultLang: 'en' }),
    kind: 'Epic',
    added: [{ duration: 60 }]
  });
  assert.throws(() => wfModule.rule.spec.action(makeCtx(issue)),
    /Direct work-item logging on container issues/);
});
