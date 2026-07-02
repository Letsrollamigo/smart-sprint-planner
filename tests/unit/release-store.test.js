/* release-store.js — self-check скелета RM-стора (#48 R1.0, ADR-001).
 * Проверяет контракт, который оркеструет ядро: durable round-trip
 * (serialize→hydrate), guard'ы hydrate и сброс per-project (reset).
 * Запуск: node --test 'tests/unit/release-store.test.js'. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const store = require('../../widgets/main/src/domain/release-store.js');

test('durable round-trip: serialize → hydrate восстанавливает releases/current/freezeLocks', () => {
  store.reset();
  store.setReleases([{ id: 'R-1' }, { id: 'R-2' }]);
  store.setCurrent('R-2');
  store.setFreezeLock('R-1', true);
  const slot = store.serialize();

  store.reset();
  assert.deepStrictEqual(store.getReleases(), []);
  assert.strictEqual(store.getCurrent(), null);
  assert.strictEqual(store.getFreezeLock('R-1'), false);

  store.hydrate(slot);
  assert.deepStrictEqual(store.getReleases(), [{ id: 'R-1' }, { id: 'R-2' }]);
  assert.strictEqual(store.getCurrent(), 'R-2');
  assert.strictEqual(store.getFreezeLock('R-1'), true);
});

test('transient-буферы (snapshotDraft/pickState) НЕ персистятся', () => {
  store.reset();
  store.setSnapshotDraft({ tmp: 1 });
  store.setPickState({ q: 'x' });
  assert.strictEqual(store.serialize().snapshotDraft, undefined);
  assert.strictEqual(store.serialize().pickState, undefined);
});

test('hydrate игнорит мусор, setReleases приводит не-массив к []', () => {
  store.reset();
  store.hydrate(null);
  store.hydrate('nope');
  assert.deepStrictEqual(store.getReleases(), []);
  store.setReleases('not-an-array');
  assert.deepStrictEqual(store.getReleases(), []);
});

test('reset чистит весь срез и зовёт diag', () => {
  store.setReleases([{ id: 'R-9' }]);
  store.setCurrent('R-9');
  store.setSnapshotDraft({ x: 1 });
  let logged = false;
  store.reset({ diag: function () { logged = true; } });
  assert.deepStrictEqual(store.getReleases(), []);
  assert.strictEqual(store.getCurrent(), null);
  assert.strictEqual(store.getSnapshotDraft(), null);
  assert.ok(logged, 'reset должен вызвать deps.diag');
});

test('R4 архив (US-R4-02): get/set, reset чистит, serialize НЕ тащит (refetch по раскрытию)', () => {
  store.reset();
  assert.strictEqual(store.getArchive(), null); // null → ещё не загружен (lazy)
  assert.strictEqual(store.getArchivedCount(), 0);
  store.setArchive([{ id: 'A-1' }]);
  store.setArchivedCount(1);
  assert.deepStrictEqual(store.getArchive(), [{ id: 'A-1' }]);
  assert.strictEqual(store.getArchivedCount(), 1);
  const slot = store.serialize();
  assert.ok(!('archive' in slot) && !('archivedCount' in slot));
  store.reset();
  assert.strictEqual(store.getArchive(), null);
  assert.strictEqual(store.getArchivedCount(), 0);
});
