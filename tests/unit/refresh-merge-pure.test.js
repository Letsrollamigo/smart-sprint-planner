'use strict';
// Unit tests for widgets/main/src/pure/refresh-merge-pure.js — #35.
// resolveRefreshMerge: field-class policy (зеркало / локальное / пограничные) + per-task dirty-guard.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveRefreshMerge } = require('../../widgets/main/src/pure/refresh-merge-pure.js');

function base(over) {
  return Object.assign({
    issueId: 'PRJ-1', roleKey: 'analysis',
    local: {}, snapshot: {}, remote: {},
  }, over || {});
}

describe('зеркальные строковые поля', () => {
  it('обновляются, если remote непустое и отличается', () => {
    const r = resolveRefreshMerge(base({
      local: { priority: 'Normal', system: 'A' },
      remote: { priority: 'Critical', system: 'A' },
    }));
    assert.deepEqual(r.updates, { priority: 'Critical' });
    assert.deepEqual(r.conflicts, []);
  });
  it('НЕ затираются пустым remote (страховка парсинга)', () => {
    const r = resolveRefreshMerge(base({
      local: { priority: 'Normal' },
      remote: { priority: '' },
    }));
    assert.deepEqual(r.updates, {});
  });
  it('no-op при совпадении', () => {
    const r = resolveRefreshMerge(base({ local: { system: 'A' }, remote: { system: 'A' } }));
    assert.deepEqual(r.updates, {});
  });
});

describe('state (комплексное зеркало)', () => {
  it('тянет state + localized + color + fieldId', () => {
    const r = resolveRefreshMerge(base({
      local: { state: 'Open' },
      remote: { state: 'Done', stateLocalized: 'Готово', stateColor: { background: '#0f0' }, stateFieldId: 'fid' },
    }));
    assert.equal(r.updates.state, 'Done');
    assert.equal(r.updates.stateLocalized, 'Готово');
    assert.deepEqual(r.updates.stateColor, { background: '#0f0' });
    assert.equal(r.updates.stateFieldId, 'fid');
  });
  it('не трогает при пустом remote.state', () => {
    const r = resolveRefreshMerge(base({ local: { state: 'Open' }, remote: { state: '' } }));
    assert.equal(r.updates.state, undefined);
  });
});

describe('пограничные estimate/fact — dirty-guard', () => {
  it('no-op при совпадении remote и local', () => {
    const r = resolveRefreshMerge(base({
      local: { estimate: 120 }, snapshot: { estimate: 120 }, remote: { estimate: 120 },
    }));
    assert.deepEqual(r.updates, {});
    assert.deepEqual(r.conflicts, []);
  });
  it('тихо обновляет, если локально НЕ трогали (local === snapshot)', () => {
    const r = resolveRefreshMerge(base({
      local: { estimate: 120 }, snapshot: { estimate: 120 }, remote: { estimate: 240 },
    }));
    assert.deepEqual(r.updates, { estimate: 240 });
    assert.deepEqual(r.conflicts, []);
  });
  it('эскалирует в conflict, если есть несохранённая правка (local !== snapshot)', () => {
    const r = resolveRefreshMerge(base({
      local: { estimate: 300 }, snapshot: { estimate: 120 }, remote: { estimate: 240 },
    }));
    assert.deepEqual(r.updates, {});
    assert.equal(r.conflicts.length, 1);
    assert.deepEqual(r.conflicts[0], { issueId: 'PRJ-1', roleKey: 'analysis', field: 'estimate', from: 300, to: 240 });
  });
  it('remote == null → не трогаем локальное', () => {
    const r = resolveRefreshMerge(base({
      local: { estimate: 300 }, snapshot: { estimate: 120 }, remote: { estimate: null },
    }));
    assert.deepEqual(r.updates, {});
    assert.deepEqual(r.conflicts, []);
  });
  it('fact обрабатывается так же, как estimate', () => {
    const r = resolveRefreshMerge(base({
      local: { fact: 60 }, snapshot: { fact: 60 }, remote: { fact: 90 },
    }));
    assert.deepEqual(r.updates, { fact: 90 });
  });
  it('local не задан, snapshot не задан, remote есть → тихо (оба null равны)', () => {
    const r = resolveRefreshMerge(base({ remote: { estimate: 240 } }));
    assert.deepEqual(r.updates, { estimate: 240 });
    assert.deepEqual(r.conflicts, []);
  });
});

describe('пограничный assignee — dirty-guard по login', () => {
  it('тихо назначает, если локально не трогали', () => {
    const r = resolveRefreshMerge(base({
      local: { assignee: 'alice' }, snapshot: { assignee: 'alice' },
      remote: { assignee: { login: 'bob', fullName: 'Bob' } },
    }));
    assert.deepEqual(r.assigneeUpdate, { login: 'bob', fullName: 'Bob' });
    assert.deepEqual(r.conflicts, []);
  });
  it('конфликт, если ручное распределение разошлось с baseline', () => {
    const r = resolveRefreshMerge(base({
      local: { assignee: 'carol' }, snapshot: { assignee: 'alice' },
      remote: { assignee: { login: 'bob' } },
    }));
    assert.equal(r.assigneeUpdate, undefined);
    assert.equal(r.conflicts.length, 1);
    assert.deepEqual(r.conflicts[0], { issueId: 'PRJ-1', roleKey: 'analysis', field: 'assignee', from: 'carol', to: 'bob' });
  });
  it('снятие исполнителя (remote null) при отсутствии правок → assigneeUpdate null', () => {
    const r = resolveRefreshMerge(base({
      local: { assignee: 'alice' }, snapshot: { assignee: 'alice' },
      remote: { assignee: null },
    }));
    assert.equal(r.assigneeUpdate, null);
  });
  it('no-op, если login совпадает', () => {
    const r = resolveRefreshMerge(base({
      local: { assignee: 'bob' }, snapshot: { assignee: 'bob' },
      remote: { assignee: { login: 'bob' } },
    }));
    assert.equal(r.assigneeUpdate, undefined);
    assert.deepEqual(r.conflicts, []);
  });
  it('assignee не запрошен (remote.assignee undefined) → не трогаем', () => {
    const r = resolveRefreshMerge(base({ local: { assignee: 'bob' }, remote: {} }));
    assert.equal(r.assigneeUpdate, undefined);
  });
});

/* #102 — гейт 68-3 закрывает запись исполнителя в YT, поэтому поле роли там пустое ВСЕГДА.
   Раньше эта пустота приезжала обратно как «снятие» и стирала распределение (воспроизведено
   живьём на :8081: DEMO-44 «Аналитик Иванов» → «— не назначено —» после «Обновить из задачи»,
   молча и с персистом). Пустое значение при закрытом канале больше не факт. */
describe('assigneeWritable — пустой assignee из YT при закрытом канале записи (#102)', () => {
  it('remote null при assigneeWritable=false → не трогаем и не конфликтуем', () => {
    const r = resolveRefreshMerge(base({
      assigneeWritable: false,
      local: { assignee: 'alice' }, snapshot: { assignee: 'alice' },
      remote: { assignee: null },
    }));
    assert.equal(r.assigneeUpdate, undefined);
    assert.deepEqual(r.conflicts, []);
  });
  it('remote null при закрытом канале не конфликтует и на грязном локальном', () => {
    const r = resolveRefreshMerge(base({
      assigneeWritable: false,
      local: { assignee: 'carol' }, snapshot: { assignee: 'alice' },
      remote: { assignee: null },
    }));
    assert.equal(r.assigneeUpdate, undefined);
    assert.deepEqual(r.conflicts, []);
  });
  it('НЕпустой remote при закрытом канале по-прежнему подтягивается', () => {
    const r = resolveRefreshMerge(base({
      assigneeWritable: false,
      local: { assignee: 'alice' }, snapshot: { assignee: 'alice' },
      remote: { assignee: { login: 'bob', fullName: 'Bob' } },
    }));
    assert.deepEqual(r.assigneeUpdate, { login: 'bob', fullName: 'Bob' });
  });
  it('при открытом канале снятие исполнителя работает как прежде', () => {
    const r = resolveRefreshMerge(base({
      assigneeWritable: true,
      local: { assignee: 'alice' }, snapshot: { assignee: 'alice' },
      remote: { assignee: null },
    }));
    assert.equal(r.assigneeUpdate, null);
  });
});

describe('комбинированный сценарий', () => {
  it('зеркало обновляется, чистый estimate тихо, грязный fact в конфликт', () => {
    const r = resolveRefreshMerge(base({
      local: { priority: 'Normal', estimate: 120, fact: 300 },
      snapshot: { estimate: 120, fact: 60 },
      remote: { priority: 'Critical', estimate: 240, fact: 90 },
    }));
    assert.equal(r.updates.priority, 'Critical');
    assert.equal(r.updates.estimate, 240);
    assert.equal(r.updates.fact, undefined);
    assert.equal(r.conflicts.length, 1);
    assert.equal(r.conflicts[0].field, 'fact');
  });
});

/* ── #92 — атрибуты состояния пишутся при любом расхождении, не только при смене имени ── */
describe('#92 stateColor/stateLocalized при неизменном имени состояния', () => {
  const COLOR = { background: '#a5f4bc', foreground: '#014f22' };
  it('цвет раскрасили задним числом (имя то же) → пишется только цвет', () => {
    const r = resolveRefreshMerge(base({
      local:  { state: 'In Progress', stateLocalized: 'In Progress', stateColor: null },
      remote: { state: 'In Progress', stateLocalized: 'In Progress', stateColor: COLOR },
    }));
    assert.deepEqual(r.updates, { stateColor: COLOR });
  });
  it('цвет сняли в проекте → стирается (null пишется поверх старого)', () => {
    const r = resolveRefreshMerge(base({
      local:  { state: 'Done', stateColor: COLOR },
      remote: { state: 'Done', stateColor: null },
    }));
    assert.deepEqual(r.updates, { stateColor: null });
  });
  it('всё совпадает по значению → фантомных изменений нет (счётчик тоста честный)', () => {
    const r = resolveRefreshMerge(base({
      local:  { state: 'Done', stateLocalized: 'Done', stateColor: { background: '#eee', foreground: null }, stateFieldId: 'f-1' },
      remote: { state: 'Done', stateLocalized: 'Done', stateColor: { background: '#eee', foreground: null }, stateFieldId: 'f-1' },
    }));
    assert.deepEqual(r.updates, {});
  });
  it('null и undefined цвета равны между собой → нет записи', () => {
    const r = resolveRefreshMerge(base({
      local:  { state: 'Done' },                       /* stateColor отсутствует */
      remote: { state: 'Done', stateColor: null },
    }));
    assert.deepEqual(r.updates, {});
  });
  it('смена имени состояния по-прежнему тянет весь комплекс', () => {
    const r = resolveRefreshMerge(base({
      local:  { state: 'Open', stateColor: null },
      remote: { state: 'Done', stateLocalized: 'Готово', stateColor: COLOR, stateFieldId: 'f-1' },
    }));
    assert.deepEqual(r.updates, { state: 'Done', stateLocalized: 'Готово', stateColor: COLOR, stateFieldId: 'f-1' });
  });
});
