'use strict';
/* #59 — кросс-ролевое исключение задачи из спринта (domain/rolecomposition-view.js).
   Покрывает: каскад по issueId на остальные роли текущего спринта в обоих режимах
   (exclude / delete), молчание при отсутствии задачи в других ролях, неучёт уже
   исключённой роли в счётчике тоста и односторонность правила (возврат не каскадится
   — функция вызывается ТОЛЬКО на исключение, что и проверяет последний кейс). */

const test = require('node:test');
const assert = require('node:assert');
const VIEW = require('../../widgets/main/src/domain/rolecomposition-view.js');

const EXCLUDED = 'INC_EXCLUDED';

function makeItems() {
  return {
    back:    [{ issueId: 'A-1', inclusionStatus: 'INC_PLANNED' }, { issueId: 'A-2', inclusionStatus: 'INC_PLANNED' }],
    front:   [{ issueId: 'A-1', inclusionStatus: 'INC_UNPLANNED' }],
    qa:      [{ issueId: 'A-1', inclusionStatus: EXCLUDED }],
    analyst: [{ issueId: 'A-9', inclusionStatus: 'INC_PLANNED' }],
  };
}

test('#59 exclude: каскадит на другие роли, уже исключённую не считает', () => {
  const items = makeItems();
  const touched = VIEW.cascadeExcludeAcrossRoles(items, 'back', 'A-1', 'exclude', EXCLUDED);

  assert.deepStrictEqual(touched, ['front']);            // qa уже EXCLUDED, analyst не содержит A-1
  assert.strictEqual(items.front[0].inclusionStatus, EXCLUDED);
  assert.strictEqual(items.qa[0].inclusionStatus, EXCLUDED);
  assert.strictEqual(items.back[0].inclusionStatus, 'INC_PLANNED');  // источник не трогаем (мутирует caller)
  assert.strictEqual(items.back[1].inclusionStatus, 'INC_PLANNED');  // соседняя задача роли не задета
});

test('#59 delete: сносит строку во всех остальных ролях, включая уже исключённую', () => {
  const items = makeItems();
  const touched = VIEW.cascadeExcludeAcrossRoles(items, 'back', 'A-1', 'delete', EXCLUDED);

  assert.deepStrictEqual(touched.sort(), ['front', 'qa']);
  assert.strictEqual(items.front.length, 0);
  assert.strictEqual(items.qa.length, 0);
  assert.strictEqual(items.back.length, 2);              // источник удаляет caller
  assert.strictEqual(items.analyst.length, 1);
});

test('#59 задачи нет в других ролях — каскад молчит (тост не показывается)', () => {
  const items = makeItems();
  assert.deepStrictEqual(VIEW.cascadeExcludeAcrossRoles(items, 'analyst', 'A-9', 'exclude', EXCLUDED), []);
  assert.deepStrictEqual(VIEW.cascadeExcludeAcrossRoles({}, 'back', 'A-1', 'exclude', EXCLUDED), []);
  assert.deepStrictEqual(VIEW.cascadeExcludeAcrossRoles(null, 'back', 'A-1', 'exclude', EXCLUDED), []);
});

test('#59 правило одностороннее: каскад ставит ТОЛЬКО EXCLUDED, не возвращает статусы', () => {
  const items = makeItems();
  VIEW.cascadeExcludeAcrossRoles(items, 'qa', 'A-1', 'exclude', EXCLUDED);
  assert.strictEqual(items.back[0].inclusionStatus, EXCLUDED);
  assert.strictEqual(items.front[0].inclusionStatus, EXCLUDED);
  /* обратной операции у функции нет — возврат из исключения делается вручную по ролям */
});

/* #121 — dry-run каскада и причина в копиях: cascadeTargets = те же роли, что touched (уже исключённая
   пропущена); payload {excludeReason, excludedAt, excludedBy} копируется в каждую цель; delete payload
   игнорирует; возврат не каскадится. Каждый assert падает на коде 3.45.0 (шестого аргумента не было). */
test('#121 cascadeTargets: те же роли, что touched у exclude; уже исключённая и роли без задачи пропущены; без мутации', () => {
  const items = makeItems();
  const targets = VIEW.cascadeTargets(items, 'back', 'A-1', EXCLUDED);
  assert.deepStrictEqual(targets, [{ rk: 'front', idx: 0 }]);
  assert.strictEqual(items.front[0].inclusionStatus, 'INC_UNPLANNED', 'dry-run не мутирует');
  assert.deepStrictEqual(VIEW.cascadeTargets(items, 'analyst', 'A-9', EXCLUDED), []);
  assert.deepStrictEqual(VIEW.cascadeTargets(null, 'back', 'A-1', EXCLUDED), []);
  const touched = VIEW.cascadeExcludeAcrossRoles(items, 'back', 'A-1', 'exclude', EXCLUDED);
  assert.deepStrictEqual(touched, targets.map((t) => t.rk), 'мутация идёт ровно по целям dry-run');
});

test('#121 exclude с payload: причина и отметки скопированы во все цели (одна отметка); delete payload игнорирует', () => {
  const items = makeItems();
  items.analyst.push({ issueId: 'A-1', inclusionStatus: 'INC_PLANNED' });
  const payload = { excludeReason: 'Блокер', excludedAt: 1700000000000, excludedBy: 'Петров И. С.' };
  const touched = VIEW.cascadeExcludeAcrossRoles(items, 'back', 'A-1', 'exclude', EXCLUDED, payload);
  assert.deepStrictEqual(touched.sort(), ['analyst', 'front']);
  ['front', 'analyst'].forEach((rk) => {
    const it = items[rk].find((i) => i.issueId === 'A-1');
    assert.strictEqual(it.inclusionStatus, EXCLUDED);
    assert.strictEqual(it.excludeReason, 'Блокер');
    assert.strictEqual(it.excludedAt, 1700000000000);
    assert.strictEqual(it.excludedBy, 'Петров И. С.');
  });
  assert.strictEqual(items.qa[0].excludeReason, undefined, 'уже исключённая не перезаписана');
  assert.strictEqual(items.back[0].excludeReason, undefined, 'источник мутирует caller');
  const del = makeItems();
  VIEW.cascadeExcludeAcrossRoles(del, 'back', 'A-1', 'delete', EXCLUDED, payload);
  assert.strictEqual(del.front.length, 0);
  assert.strictEqual(del.qa.length, 0);
});
