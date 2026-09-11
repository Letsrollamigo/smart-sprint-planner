'use strict';
// #124 — ссылка на «Ёмкость»: цель «Поделиться» из выбора справа (shareTarget) и
// применение фокуса из ссылки через стейт выбора (applyFocus), domain/capacity-view.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');

global.document = global.document || { getElementById: () => null };   // render() без DOM — no-op
const view = require('../../widgets/main/src/domain/capacity-view.js');

function mkDeps(ui) {
  const box = { ui: ui, renders: 0 };
  box.deps = {
    T: (k) => k,
    getSprintRolesFor: () => [{ key: 'an' }, { key: 'dev' }],
    roleLabel: (r) => r.key.toUpperCase(),
    state: {
      getCapacityUiState: () => box.ui,
      setCapacityUiState: (v) => { box.ui = v; box.renders++; },
      getRoster: () => ({
        an: [{ login: 'lk', name: 'Лебедев К.' }, { login: 'oa', name: 'Орлова А.' }],
        dev: [{ login: 'lk', name: 'Лебедев К.' }, { login: 'sd', name: 'Сомов Д.' }],
      }),
      getSettings: () => ({ capacityMode: 'light' }),
    },
  };
  return box;
}

test('shareTarget: режим «Сотрудник» с выбором → user:<логин>, подпись — имя, спринт вкладки', () => {
  const { deps } = mkDeps({ selectedSprintId: 's-7', viewMode: 'person', selectedPerson: 'lk', selectedRole: 'dev' });
  assert.deepEqual(view.shareTarget(deps), { node: 'capacity', sprintId: 's-7', focus: 'user:lk', label: 'Лебедев К.' });
});

test('shareTarget: «Сотрудник» без выбора → ссылка на экран (без фокуса)', () => {
  const t = view.shareTarget(mkDeps({ selectedSprintId: 's-7', viewMode: 'person', selectedPerson: null }).deps);
  assert.deepEqual(t, { node: 'capacity', sprintId: 's-7' });
});

test('shareTarget: режим «По роли» → выбранная роль; без выбора — роль человека, иначе первая', () => {
  assert.equal(view.shareTarget(mkDeps({ viewMode: 'role', selectedRole: 'dev' }).deps).focus, 'role:dev');
  assert.equal(view.shareTarget(mkDeps({ viewMode: 'role', selectedRole: 'dev' }).deps).label, 'DEV');
  /* Сомов есть только в dev: без фолбэка на роль человека вышло бы role:an */
  assert.equal(view.shareTarget(mkDeps({ viewMode: 'role', selectedRole: null, selectedPerson: 'sd' }).deps).focus, 'role:dev');
  assert.equal(view.shareTarget(mkDeps({ viewMode: 'role', selectedRole: 'gone' }).deps).focus, 'role:an');
});

test('applyFocus: user → выбор человека в режиме «Сотрудник», роль сбрасывается; role → вид «по ролям»', () => {
  const b = mkDeps({ selectedPerson: null, selectedRole: 'an', viewMode: 'role', mainView: 'persons' });
  view.applyFocus(b.deps, 'user', 'sd');
  assert.equal(b.ui.selectedPerson, 'sd');
  assert.equal(b.ui.selectedRole, null);
  assert.equal(b.ui.viewMode, 'person');
  assert.equal(b.ui.mainView, 'persons', 'человека подсвечиваем в текущем виде');
  view.applyFocus(b.deps, 'role', 'dev');
  assert.deepEqual([b.ui.selectedRole, b.ui.selectedPerson, b.ui.viewMode, b.ui.mainView], ['dev', null, 'role', 'roles']);
  const before = b.renders;
  view.applyFocus(b.deps, 'hist', 'x');
  assert.equal(b.renders, before, 'чужой вид фокуса — no-op');
});
