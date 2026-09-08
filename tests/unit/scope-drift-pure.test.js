'use strict';
/* #114 — дрейф состава после согласования (pure/scope-drift-pure.js).
   Покрывает: компактность слепка (оценка только числом, признак исключения только когда
   есть), дифф по составу / оценкам / исключениям / возвратам, отсутствие слепка = нет дрейфа,
   сумму по ролям и короткую запись. Каждый assert способен упасть: слепок и строки
   строятся так, что любая ветка диффа даёт ненулевой вклад. */

const test = require('node:test');
const assert = require('node:assert');
const P = require('../../widgets/main/src/pure/scope-drift-pure.js');

const RK = 'devBack';
function it(id, est, inc) {
  const o = { issueId: id, title: id, inclusionStatus: inc || 'INC_PLANNED' };
  if (est !== undefined) o['estimate_' + RK] = est;
  return o;
}

test('#114 buildAgreed — компактный слепок: e только числом, x только для исключённых', () => {
  const agreed = P.buildAgreed([
    it('A-1', 120), it('A-2', null), it('A-3', '90'), it('A-4', 60, 'INC_EXCLUDED'), { title: 'без id' },
  ], RK, 1780315200000, 'validator');
  assert.deepStrictEqual(agreed, {
    at: 1780315200000, by: 'validator',
    items: { 'A-1': { e: 120 }, 'A-2': {}, 'A-3': { e: 90 }, 'A-4': { e: 60, x: 1 } },
  });
  assert.strictEqual(P.buildAgreed([], RK, 'нечисло', null).at, null, 'нечисловой at → null');
});

test('#114 computeDrift — нет слепка → дрейфа нет по определению', () => {
  const d = P.computeDrift(null, [it('A-1', 10)], RK);
  assert.strictEqual(d.has, false);
  assert.strictEqual(d.count, 0);
  assert.strictEqual(P.computeDrift({ at: 1, by: 'x' }, [it('A-1', 10)], RK).has, false, 'слепок без items — не слепок');
});

test('#114 computeDrift — состав, оценки, исключения, возвраты по отдельности', () => {
  const agreed = P.buildAgreed([it('A-1', 120), it('A-2', 60), it('A-3', 30), it('A-4', 45, 'INC_EXCLUDED'), it('A-5', 15)], RK, 5, 'v');
  const d = P.computeDrift(agreed, [
    it('A-1', 120),                  /* без изменений */
    it('A-2', 90),                   /* оценка */
    it('A-3', 30, 'INC_EXCLUDED'),   /* исключена */
    it('A-4', 45),                   /* возвращена */
    it('A-6', 10),                   /* добавлена */
    /* A-5 снята */
  ], RK);
  assert.strictEqual(d.has, true);
  assert.deepStrictEqual(d.added, ['A-6']);
  assert.deepStrictEqual(d.removed, ['A-5']);
  assert.deepStrictEqual(d.estimate, [{ id: 'A-2', from: 60, to: 90 }]);
  assert.deepStrictEqual(d.excluded, ['A-3']);
  assert.deepStrictEqual(d.restored, ['A-4']);
  assert.strictEqual(d.count, 5);
  assert.strictEqual(d.at, 5);
  assert.strictEqual(d.by, 'v');
});

test('#114 computeDrift — пустая и нулевая оценка: null≠0, null=undefined, строка=число', () => {
  const agreed = P.buildAgreed([it('B-1', null), it('B-2', 0), it('B-3', 30)], RK, 1, null);
  const same = P.computeDrift(agreed, [it('B-1'), it('B-2', 0), it('B-3', '30')], RK);
  assert.strictEqual(same.count, 0, 'undefined≡null, "30"≡30 — дрейфа нет');
  const diff = P.computeDrift(agreed, [it('B-1', 0), it('B-2', null), it('B-3', 30)], RK);
  assert.deepStrictEqual(diff.estimate.map((e) => e.id).sort(), ['B-1', 'B-2'], 'null→0 и 0→null — оба дрейф');
});

test('#114 computeDrift — исключённая при согласовании и оставшаяся исключённой — не дрейф', () => {
  const agreed = P.buildAgreed([it('C-1', 10, 'INC_EXCLUDED')], RK, 1, null);
  assert.strictEqual(P.computeDrift(agreed, [it('C-1', 10, 'INC_EXCLUDED')], RK).count, 0);
});

test('#114 summarizeDrift + formatShort — сумма по ролям и короткая запись без нулей', () => {
  const a = P.buildAgreed([it('D-1', 10), it('D-2', 20)], RK, 1, null);
  const d1 = P.computeDrift(a, [it('D-1', 10), it('D-3', 5)], RK);          /* +1 −1 */
  const d2 = P.computeDrift(a, [it('D-1', 15), it('D-2', 20, 'INC_EXCLUDED')], RK); /* ~1 ⊘1 */
  const d0 = P.computeDrift(a, [it('D-1', 10), it('D-2', 20)], RK);         /* 0 */
  const s = P.summarizeDrift([d1, d2, d0, null]);
  assert.deepStrictEqual(s, { count: 4, roles: 2, added: 1, removed: 1, estimate: 1, excluded: 1, restored: 0 });
  assert.strictEqual(P.formatShort(d1), '+1 −1');
  assert.strictEqual(P.formatShort(d2), '~1 ⊘1');
  assert.strictEqual(P.formatShort(s), '+1 −1 ~1 ⊘1');
  assert.strictEqual(P.formatShort(d0), '');
  assert.strictEqual(P.formatShort(null), '');
});
