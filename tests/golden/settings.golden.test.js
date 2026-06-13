/**
 * Golden-master: settings-обвязка (Фаза 5, зачистка «прочих» — слайс 11).
 *
 * Характеризация ДО выноса в settings-controller.js (__SSP_SETTINGS_CTRL) живого
 * ядра React-формы настроек (зона A). Vanilla-форма (renderRolesGrid-цепочка,
 * зона B) — мёртвый код (DOM-якоря удалены при #32 Phase 5), сносится отдельным
 * коммитом и здесь НЕ характеризуется.
 *
 * Контракты — только через выживающие entry-points:
 *   • openSettingsModal() — вход из init-bind (openSettingsBtn click); серверный
 *     гейт apiGet('check-settings-manager') → not-configured / no-access / form;
 *   • _buildSettingsFormProps(onClose) — сборка props формы (initial/roles/
 *     fieldsByType/defaultLangOptions/loadFieldValues/onSave/onClose); общая для
 *     модалки (global) и inline-страницы проектного виджета;
 *   • _saveSettingsData(data) — persist apiPost('sprint-data') + post-save хвост
 *     (cache-invalidate, _settings, project-default lang, feature-bar, soft-warn
 *     required, права/видимость, re-render);
 *   • _buildFieldsByType() — категоризация _projectFields по типам.
 *
 * Внешние deps стабятся через gm.set по closure-vars — per-call deps-фабрика
 * (_settingsDeps) подхватит стабы и после выноса. _fieldValuesCache остаётся
 * shared-стейтом ядра (общий с intro-view) — приходит object-ref'ом через deps;
 * loadFieldValues-контракт (кэш-хит / apiGet-промах) проверяется здесь.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');
const fx = require('./fixtures/state');

/** Прогон микро/макро-очереди (.then-цепочки apiGet/apiPost). */
async function settle(n) {
  for (let i = 0; i < (n || 3); i++) await new Promise(function (r) { setTimeout(r, 0); });
}

function recordToasts(gm) {
  const toasts = [];
  gm.set({ toast: function (msg, type) { toasts.push({ msg: String(msg), type: type || null }); } });
  return toasts;
}

/** Recording-стаб apiPost: лог {path, bodyKeys, hasSettings, savedAtFrozen, query}; резолв настраивается. */
function stubApiPost(gm, opts) {
  opts = opts || {};
  const log = [];
  gm.set({
    apiPost: function (path, body, query) {
      const s = body && body.settings;
      log.push({
        path: path,
        bodyKeys: Object.keys(body || {}).sort(),
        hasSettings: !!s,
        savedAtFrozen: !!(s && s.savedAt === require('./monolith-host').FIXED_NOW),
        query: query === undefined ? null : query,
      });
      if (opts.reject) return Promise.reject(new Error('gm-api-reject'));
      return Promise.resolve(opts.response !== undefined ? opts.response : { success: true });
    },
  });
  return log;
}

/** Recording-стаб apiGet: лог путей; резолв по карте path→response (или default). */
function stubApiGet(gm, map) {
  const log = [];
  gm.set({
    apiGet: function (path) {
      log.push(path);
      const key = Object.keys(map || {}).find(function (k) { return path === k || path.indexOf(k) === 0; });
      return Promise.resolve(key ? map[key] : {});
    },
  });
  return log;
}

/** Recording-стабы post-save делегаторов + lazy-loaders (closure-vars; per-call deps подхватят). */
function stubSaveDeps(gm) {
  const calls = {};
  function rec(name) { calls[name] = 0; return function () { calls[name] += 1; }; }
  gm.set({
    invalidateFieldValuesCache: function (f) { calls.invalidate = calls.invalidate || []; calls.invalidate.push(f); },
    _syncProjectDefaultLang: rec('syncLang'),
    _refreshFeatureStatusBar: rec('featureBar'),
    checkValidator: rec('checkValidator'),
    checkEditorRights: rec('checkEditor'),
    checkAssignerRights: rec('checkAssigner'),
    applyPersonalPlanningVisibility: rec('ppVisibility'),
    refreshClearHistoryBtn: rec('clearHistBtn'),
    renderPlannerRoles: rec('renderRoles'),
    _applyDiagLogVisibility: rec('diagVis'),
  });
  return calls;
}

/** Recording-стаб openModal: лог переданных спеков (без React-стороны). */
function stubOpenModal(gm) {
  const specs = [];
  gm.set({
    openModal: function (spec) {
      specs.push(spec);
      return { close: function () {} };
    },
  });
  return specs;
}

/** Нормализация openModal-спека: функции → '[fn]', body.props → форма (keys+типы). */
function shapeSpec(spec) {
  if (!spec) return null;
  const out = {
    id: spec.id, type: spec.type, title: String(spec.title),
    dialogClass: spec.dialogClass || null,
    dismissOnBackdrop: spec.dismissOnBackdrop,
    blockEscape: spec.blockEscape,
    showCloseButton: spec.showCloseButton,
    bodyKind: spec.body && spec.body.kind,
  };
  if (spec.body && spec.body.kind === 'component') {
    out.componentName = spec.body.name;
    out.propKeys = Object.keys(spec.body.props || {}).sort();
  } else if (spec.body && spec.body.kind === 'text') {
    out.bodyText = String(spec.body.text);
  }
  out.buttonIds = (spec.buttons || []).map(function (b) { return b.id; });
  return out;
}

/* ═══════════════════════ _buildFieldsByType ═══════════════════════ */

test('golden: _buildFieldsByType — категоризация полей проекта по типам', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    _projectFields: [
      { name: 'Priority', type: 'enum[1]' },
      { name: 'State', type: 'state[1]' },
      { name: 'Fix versions', type: 'version[*]' },
      { name: 'Estimate', type: 'period' },
      { name: 'Assignee', type: 'user[1]' },
      { name: 'Sprints', type: 'enum[*]' },
      { name: 'Ticket', type: 'string' },
      { name: 'System', type: 'ownedField[1]' },
    ],
  });

  const res = gm.call('_buildFieldsByType');
  checkJsonSnapshot('settings-fieldsByType', res);
});

/* ═══════════════════════ _buildSettingsFormProps ═══════════════════════ */

test('golden: _buildSettingsFormProps — форма props (структура + типы)', () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({
    _projectFields: [
      { name: 'Priority', type: 'enum[1]' },
      { name: 'Sprints', type: 'enum[*]' },
      { name: 'Estimate', type: 'period' },
    ],
    _projectGroups: [{ id: 'g1', name: 'sprint-managers' }],
  });

  const props = gm.call('_buildSettingsFormProps', function onClose() {});
  const shape = {
    keys: Object.keys(props).sort(),
    types: {},
    initialIsSettings: props.initial === gm.get('_settings'),
    rolesIsAllRoles: props.roles === gm.get('ALL_ROLES'),
    uiLang: props.uiLang,
    stateFieldName: props.stateFieldName,
    fieldsByType: props.fieldsByType,
    defaultLangOptions: props.defaultLangOptions,
    initialGroups: props.initialGroups,
  };
  Object.keys(props).sort().forEach(function (k) { shape.types[k] = typeof props[k]; });
  checkJsonSnapshot('settings-formProps', shape);
});

test('golden: _buildSettingsFormProps.loadFieldValues — кэш-промах (apiGet) + кэш-хит', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _projectFields: [], _fieldValuesCache: {}, _fieldValuesInflight: {} });
  const apiLog = stubApiGet(gm, { 'field-values': { success: true, values: ['A', 'B'] } });

  const props = gm.call('_buildSettingsFormProps', function () {});

  const v1 = await props.loadFieldValues('Sprints');   // промах → apiGet
  const v2 = await props.loadFieldValues('Sprints');   // хит → без apiGet
  const empty = await props.loadFieldValues('');        // пустое имя → []

  checkJsonSnapshot('settings-loadFieldValues', {
    v1: v1, v2: v2, empty: empty,
    apiGetCalls: apiLog,
    cacheKeys: Object.keys(gm.get('_fieldValuesCache')).sort(),
  });
});

/* ═══════════════════════ _saveSettingsData ═══════════════════════ */

test('golden: _saveSettingsData — happy path (persist + post-save хвост)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  const post = stubApiPost(gm, { response: { success: true } });
  const calls = stubSaveDeps(gm);

  const data = {
    activeRoles: ['analysis'], fieldPriority: 'Priority', fieldState: 'State',
    fieldSprint: 'Sprints', fieldVersion: 'Fix versions', defaultLang: 'ru',
  };
  const r = await gm.call('_saveSettingsData', data);

  checkJsonSnapshot('settings-save-happy', {
    result: r,
    apiPost: post,
    toasts: toasts,
    settingsUpdated: gm.get('_settings') === data,
    calls: calls,
  });
});

test('golden: _saveSettingsData — error path (success:false → toast err, _settings не тронут)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const before = gm.get('_settings');
  const toasts = recordToasts(gm);
  const post = stubApiPost(gm, { response: { success: false, reason: 'whitelist-violation' } });
  const calls = stubSaveDeps(gm);

  const r = await gm.call('_saveSettingsData', { fieldPriority: 'Priority', fieldState: 'State' });

  checkJsonSnapshot('settings-save-error', {
    result: r,
    apiPost: post,
    toasts: toasts,
    settingsUntouched: gm.get('_settings') === before,
    postSaveSkipped: calls,
  });
});

test('golden: _saveSettingsData — invalidate cache при смене fieldSprint/fieldVersion', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  recordToasts(gm);
  stubApiPost(gm, { response: { success: true } });
  const calls = stubSaveDeps(gm);
  /* старые значения полей в _settings, новые в data → должно дёрнуть invalidate ×2 */
  gm.set({ _settings: { fieldSprint: 'OldSprint', fieldVersion: 'OldVersion', fieldPriority: 'Priority', fieldState: 'State' } });

  await gm.call('_saveSettingsData', {
    fieldSprint: 'NewSprint', fieldVersion: 'NewVersion', fieldPriority: 'Priority', fieldState: 'State',
  });

  checkJsonSnapshot('settings-save-invalidate', { invalidated: calls.invalidate || [] });
});

test('golden: _saveSettingsData — soft-warn про обязательные поля (setTimeout)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  const toasts = recordToasts(gm);
  stubApiPost(gm, { response: { success: true } });
  stubSaveDeps(gm);

  const r = await gm.call('_saveSettingsData', { activeRoles: [] }); // нет fieldPriority/fieldState
  await new Promise(function (res) { setTimeout(res, 450); });        // ждём soft-warn таймер (400мс)

  checkJsonSnapshot('settings-save-missing-required', { result: r, toasts: toasts });
});

/* ═══════════════════════ openSettingsModal ═══════════════════════ */

test('golden: openSettingsModal — проект не настроен (configured:false → info-модал)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  stubApiGet(gm, { 'check-settings-manager': { configured: false, canManage: false } });
  const specs = stubOpenModal(gm);

  gm.call('openSettingsModal');
  await settle();

  checkJsonSnapshot('settings-modal-not-configured', { specs: specs.map(shapeSpec) });
});

test('golden: openSettingsModal — нет прав менеджера (canManage:false → info-модал с группой)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  stubApiGet(gm, { 'check-settings-manager': { configured: true, canManage: false, groupName: 'sprint-managers' } });
  const specs = stubOpenModal(gm);

  gm.call('openSettingsModal');
  await settle();

  checkJsonSnapshot('settings-modal-no-access', { specs: specs.map(shapeSpec) });
});

test('golden: openSettingsModal — менеджер (canManage:true → form-модал + lazy groups)', async () => {
  const { gm } = createHost();
  fx.applyBaseState(gm);
  gm.set({ _projectFields: [{ name: 'Sprints', type: 'enum[*]' }], _projectGroups: [] });
  stubApiGet(gm, { 'check-settings-manager': { configured: true, canManage: true } });
  const specs = stubOpenModal(gm);
  let groupsLoaded = 0;
  gm.set({ loadProjectGroups: function () { groupsLoaded += 1; return Promise.resolve([]); } });

  gm.call('openSettingsModal');
  await settle();

  checkJsonSnapshot('settings-modal-form', { specs: specs.map(shapeSpec), groupsLoaded: groupsLoaded });
});
