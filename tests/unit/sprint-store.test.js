/* sprint-store.js — self-check стора конфликт-канона (ADR-001 r2).
 * Проверяет контракт, который оркеструет ядро: семантику сеттеров (перенос из ядра 1:1)
 * и сброс per-project (resetProjectSlice: с 2026-07-03 чистит весь срез, ⚖ владелец).
 * Запуск: node --test 'tests/unit/sprint-store.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const store = require('../../widgets/main/src/domain/sprint-store.js');

test('сеттеры: снапшоты — сквозное присваивание; slotRev — только число, иначе 0', () => {
  const snap = { name: 'S' };
  store.setServerSnapshotSprint(snap);
  assert.strictEqual(store.getServerSnapshotSprint(), snap);
  store.setServerSnapshotRoleItems({ devBack: [] });
  assert.deepStrictEqual(store.getServerSnapshotRoleItems(), { devBack: [] });
  store.setBaseRevHash('h1');
  assert.strictEqual(store.getBaseRevHash(), 'h1');
  store.setSlotRev(7);
  assert.strictEqual(store.getSlotRev(), 7);
  store.setSlotRev('junk');
  assert.strictEqual(store.getSlotRev(), 0);
});

test('resetProjectSlice: чистит ВЕСЬ срез — Sprint/RoleItems/baseRevHash + PP/Gantt/slotRev (⚖ 2026-07-03: residual slotRev чужого проекта мог молча обойти rev-lock #56-4)', () => {
  store.setServerSnapshotSprint({ name: 'S' });
  store.setServerSnapshotRoleItems({ devBack: [1] });
  store.setServerSnapshotCurrentRolePP({ pp: 1 });
  store.setServerSnapshotCurrentRoleGantt({ g: 1 });
  store.setBaseRevHash('h2');
  store.setSlotRev(5);

  store.resetProjectSlice();

  assert.strictEqual(store.getServerSnapshotSprint(), null);
  assert.strictEqual(store.getServerSnapshotRoleItems(), null);
  assert.strictEqual(store.getBaseRevHash(), '');
  assert.strictEqual(store.getServerSnapshotCurrentRolePP(), null);
  assert.strictEqual(store.getServerSnapshotCurrentRoleGantt(), null);
  assert.strictEqual(store.getSlotRev(), 0);
});
