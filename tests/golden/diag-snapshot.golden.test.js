/**
 * Голден формата ssp-state-snapshot (#63 п.4).
 *
 * Формат ЕДИНЫЙ с фикстурами tests/fixtures/prod-snapshots/ (файл юзера →
 * анонимизация → фикстура): сломался формат — сломался и support-канал, и
 * генератор фикстур. Характеризуем сборку buildStateSnapshot на прод-слепке
 * #62; крупные срезы (settings/roleItems/history) в голдене агрегатами —
 * их содержимое зафиксировано самой фикстурой.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const { checkJsonSnapshot } = require('./snap');

const SNAP = require('../fixtures/prod-snapshots/62-emp-mixed-sprints.json');

function clone(o) { return JSON.parse(JSON.stringify(o)); }

test('golden: buildStateSnapshot — формат слепка состояния на прод-стейте #62', () => {
  const h = createHost();
  const { gm, window } = h;
  gm.set({
    _settings: clone(SNAP.settings),
    _settingsLoaded: true,
    _sprint: clone(SNAP.state.sprint),
    _roleItems: clone(SNAP.state.roleItems),
    _history: clone(SNAP.state.history),
    _currentSprintId: SNAP.state.currentSprintId,
    _activeSubtab: SNAP.state.activeSubtab,
    _activeWorkingDraftKey: null,
    _diagLines: [
      { msg: 'boot ok', type: 'ok' },
      { msg: 'GET sprint-data 200' }, // нетипизированный info-трейс — в хвост не попадает
      { msg: 'field-values [X] FETCH ERR: boom', type: 'err' },
      { msg: 'rev conflict: слот обновлён извне', type: 'warn' },
    ],
  });
  const deps = gm.call('_diagSnapshotDeps');
  const snap = window.__SSP_DIAG_SNAPSHOT.buildStateSnapshot('2025.3 (148033)', deps);

  /* Жёсткие инварианты формата (спека, не характеризация). */
  assert.strictEqual(snap.format, 'ssp-state-snapshot');
  assert.strictEqual(snap.formatVersion, 1);
  assert.strictEqual(snap.appVersion, gm.get('APP_VERSION'), 'версия — из APP_VERSION');
  assert.deepStrictEqual(snap.errTail.map((l) => l.type), ['err', 'warn'], 'в хвосте только err/warn');
  assert.strictEqual(snap.state.sprint.sprintId, 'sprint-jul', 'рабочий слот в слепке');
  assert.strictEqual(snap.state.currentSprintId, 'sprint-jul');

  /* Голден-структура: appVersion маскируем (меняется каждый релиз). */
  const compact = Object.assign({}, snap, {
    appVersion: '«APP_VERSION»',
    settings: '«' + Object.keys(snap.settings).length + ' ключей настроек»',
    state: Object.assign({}, snap.state, {
      sprint: { sprintId: snap.state.sprint.sprintId, status: snap.state.sprint.status },
      roleItems: Object.keys(snap.state.roleItems).map((k) => k + ':' + snap.state.roleItems[k].length),
      history: snap.state.history.length + ' rk-снапшотов',
    }),
  });
  checkJsonSnapshot('diag-snapshot-format', compact);
});
