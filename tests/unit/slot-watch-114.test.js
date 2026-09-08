'use strict';
/* #114 (строка пула #110) — подсказка «спринт изменён другим» (domain/slot-watch.js).
   Фейковый document: body.dataset (троттл, метка #100), элемент #widgetSlotChanged, слушатель
   visibilitychange. Проверяем: зонд не идёт без спринта / при заморозке #100 / чаще раза в
   20 с; серверный rev выше виденного → подсказка видна; равный → скрыта; ошибка зонда — тихо. */

const test   = require('node:test');
const assert = require('node:assert');

function fakeDocument() {
  const classes = new Set(['hidden']);
  const el = {
    textContent: '', title: '',
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
  };
  const listeners = {};
  return {
    el,
    visibilityState: 'visible',
    body: { dataset: {} },
    getElementById: (id) => (id === 'widgetSlotChanged' ? el : null),
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    fire: (ev) => listeners[ev] && listeners[ev](),
  };
}

function mkDeps(opts) {
  const calls = { probes: 0, diag: [] };
  const deps = {
    apiProbeRev: () => { calls.probes += 1; return opts.probe ? opts.probe() : Promise.resolve(opts.serverRev); },
    T: (k) => '[' + k + ']',
    diag: (m, lvl) => calls.diag.push({ m, lvl }),
    state: { getSprint: () => (opts.noSprint ? null : { sprintId: 'S-1' }), getSlotRev: () => opts.seenRev },
  };
  return { deps, calls };
}

function withDocument(doc, fn) {
  const prev = global.document;
  global.document = doc;
  return Promise.resolve().then(fn).finally(() => { if (prev === undefined) delete global.document; else global.document = prev; });
}

const SW = require('../../widgets/main/src/domain/slot-watch.js');

test('#114 slot-watch: без спринта и при заморозке #100 зонд не идёт', async () => {
  const doc = fakeDocument();
  await withDocument(doc, async () => {
    const a = mkDeps({ noSprint: true, serverRev: 5, seenRev: 1 });
    assert.strictEqual(await SW.check(a.deps, true), false);
    assert.strictEqual(a.calls.probes, 0);
    const b = mkDeps({ serverRev: 5, seenRev: 1 });
    doc.body.dataset.sspRevConflict = '1';
    assert.strictEqual(await SW.check(b.deps, true), false);
    assert.strictEqual(b.calls.probes, 0);
  });
});

test('#114 slot-watch: серверный rev выше виденного → подсказка видна; равный → скрыта', async () => {
  const doc = fakeDocument();
  await withDocument(doc, async () => {
    const a = mkDeps({ serverRev: 7, seenRev: 3 });
    assert.strictEqual(await SW.check(a.deps, true), true);
    assert.strictEqual(doc.el.classList.contains('hidden'), false, 'подсказка показана');
    assert.strictEqual(doc.el.textContent, '[slotChangedHint]');
    assert.strictEqual(doc.body.dataset.sspSlotServerRev, '7');
    assert.ok(a.calls.diag.some((d) => /3 → 7/.test(d.m) && d.lvl === 'warn'), 'диаг-строка с ревизиями');
    const b = mkDeps({ serverRev: 7, seenRev: 7 });
    assert.strictEqual(await SW.check(b.deps, true), false);
    assert.strictEqual(doc.el.classList.contains('hidden'), true, 'подсказка снята');
  });
});

test('#114 slot-watch: троттл 20 с — повторный зонд без force не идёт, force идёт', async () => {
  const doc = fakeDocument();
  await withDocument(doc, async () => {
    const a = mkDeps({ serverRev: 2, seenRev: 2 });
    assert.strictEqual(await SW.check(a.deps, false), false);
    assert.strictEqual(a.calls.probes, 1, 'первый зонд прошёл');
    assert.strictEqual(await SW.check(a.deps, false), false);
    assert.strictEqual(a.calls.probes, 1, 'второй сразу — подавлен троттлом');
    doc.body.dataset.sspSlotProbeAt = String(Date.now() - SW.MIN_GAP_MS - 1);
    await SW.check(a.deps, false);
    assert.strictEqual(a.calls.probes, 2, 'после паузы зонд снова идёт');
    await SW.check(a.deps, true);
    assert.strictEqual(a.calls.probes, 3, 'force обходит троттл');
  });
});

test('#114 slot-watch: ошибка зонда — false и предупреждение в диаг, без исключения', async () => {
  const doc = fakeDocument();
  await withDocument(doc, async () => {
    const a = mkDeps({ seenRev: 1, probe: () => Promise.reject(new Error('boom')) });
    assert.strictEqual(await SW.check(a.deps, true), false);
    assert.ok(a.calls.diag.some((d) => /boom/.test(d.m) && d.lvl === 'warn'));
  });
});

test('#114 slot-watch: install вешает visibilitychange и зовёт зонд только при visible', async () => {
  const doc = fakeDocument();
  await withDocument(doc, async () => {
    const a = mkDeps({ serverRev: 9, seenRev: 1 });
    assert.strictEqual(SW.install(a.deps), true);
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    assert.strictEqual(a.calls.probes, 0, 'уход со вкладки — не повод');
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(a.calls.probes, 1, 'возврат на вкладку — зонд');
    assert.strictEqual(doc.el.classList.contains('hidden'), false);
  });
});
