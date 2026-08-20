'use strict';
/**
 * #70 — регресс: «Сохранить параметры» после свитча селектора писал форму ВЫБРАННОГО
 * спринта в РАБОЧИЙ слот ({sprintId: слота, name/dates: формы}) — переименование слота
 * + затирание его history-записи авто-снапшотом, задвоение в пикере. Гейт (канон v1.9.9,
 * JS-гейт в обработчике): сейв вводных блокируется, когда выбранный спринт ≠ рабочий слот.
 * WC-путь жив: resumeWorkingDraft подменяет slot.sprintId на редактируемый → id совпадают.
 * doValidateRole гейта не требует — форму не читает, работает только со слотом.
 */
const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const CTRL = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'domain', 'sprint-controller.js'));

/* Гейт стоит ДО DOM-чтений; для pass-through-кейсов достаточно element-стаба. */
function elStub() {
  return { value: '', textContent: '', classList: { add() {}, remove() {} }, scrollIntoView() {}, focus() {} };
}
global.document = { getElementById: () => elStub(), querySelector: () => null, querySelectorAll: () => [] };

function makeDeps(over) {
  over = over || {};
  const toasts = [];
  const posts  = [];
  const sprint = 'sprint' in over ? over.sprint
    : { sprintId: 'SLOT', name: 'Рабочий', dateStart: 1, dateEnd: 2, status: 'PLANNING' };
  const deps = {
    T: (k) => k,
    toast: (msg, kind) => toasts.push({ msg, kind }),
    apiPost: (p, body) => { posts.push({ path: p, body }); return Promise.resolve(); },
    state: {
      getSprint: () => sprint,
      getCurrentSprintId: () => ('selectedId' in over ? over.selectedId : 'SLOT'),
      getActiveWorkingDraftKey: () => over.wcKey || null,
      getCurrentUser: () => ({ login: 'u' }),
      getIsEditor: () => true,
      getBaseRevHash: () => null,
    },
    markDirty: () => {}, draftSet: () => {}, draftGet: () => ({}),
    withLoader: (btn, fn) => fn(),
    fromDateIn: (v) => v,
    ALL_ROLES: [],
    STATUS: { PLANNING: 'PLANNING', CONFIRMED: 'CONFIRMED', ALLOCATED: 'ALLOCATED' },
    parsePeriod: () => 0,
  };
  return { deps, toasts, posts, sprint };
}

test('#70 doSaveRoleHeader: выбран чужой спринт → warn-гейт, POST не уходит, слот не тронут', () => {
  const { deps, toasts, posts, sprint } = makeDeps({ selectedId: 'OTHER' });
  CTRL.doSaveRoleHeader('analysis', deps);
  assert.strictEqual(toasts.length, 1);
  assert.strictEqual(toasts[0].msg, 'toastSaveParamsForeignSprint');
  assert.strictEqual(toasts[0].kind, 'warn');
  assert.strictEqual(posts.length, 0);
  assert.strictEqual(sprint.name, 'Рабочий');           // идентичность слота не порвана
  assert.strictEqual(sprint.sprintId, 'SLOT');
});

test('#70 doSaveSprintIntro: выбран чужой спринт → тот же warn-гейт без POST', () => {
  const { deps, toasts, posts, sprint } = makeDeps({ selectedId: 'OTHER' });
  CTRL.doSaveSprintIntro(deps);
  assert.strictEqual(toasts.length, 1);
  assert.strictEqual(toasts[0].msg, 'toastSaveParamsForeignSprint');
  assert.strictEqual(posts.length, 0);
  assert.strictEqual(sprint.name, 'Рабочий');
});

test('#70 гейт пропускает при выбранный === слот (доходит до валидации формы)', () => {
  const { deps, toasts, posts } = makeDeps({ selectedId: 'SLOT' });
  CTRL.doSaveRoleHeader('analysis', deps);
  // Пустая форма → валидационный тост (НЕ гейт-тост) — гейт пройден.
  assert.strictEqual(toasts[0].msg, 'toastSprintNameRequired');
  assert.strictEqual(posts.length, 0);
});

test('#70 гейт пропускает при неинициализированном селекторе (currentSprintId=null)', () => {
  const { deps, toasts } = makeDeps({ selectedId: null });
  CTRL.doSaveSprintIntro(deps);
  assert.strictEqual(toasts[0].msg, 'toastSprintNameRequired');
});

test('#70 байпас при активной рабочей копии: слот = скретч WC, расхождение id легитимно', () => {
  // resumeWorkingDraft (в т.ч. edit из вкладки истории) подменяет slot.sprintId,
  // селектор не синкается — гейт НЕ должен блокировать сейв в live-WC.
  const { deps, toasts } = makeDeps({ selectedId: 'OTHER', wcKey: 'SLOT_analysis' });
  CTRL.doSaveRoleHeader('analysis', deps);
  assert.strictEqual(toasts[0].msg, 'toastSprintNameRequired'); // дошли до валидации формы
});
