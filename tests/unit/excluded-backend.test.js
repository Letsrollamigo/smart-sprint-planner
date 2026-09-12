'use strict';

/* #121 (v3.46.0) — причина исключения задачи из спринта: нормализация на записи состава
 * (POST sprint-data без action и ?action=validate — общий pre-flight roleItems). Ключи
 * excludeReason / excludedAt / excludedBy живут на элементе только при INC_EXCLUDED; отметки
 * «кто/когда» ставит сервер на ПЕРЕХОДЕ в статус по эталону спринта (слот, если он держит этот
 * спринт, иначе снимки истории <sprintId>_<rk>); уже исключённая без причины (данные до 3.46.0)
 * проходит как есть. Mock ctx — по образцу sprint-rev-lock.test.js / phases-backend.test.js.
 * Каждый assert проверен инверсией: «безусловная обязательность» роняет (b2)/(k), «эталон —
 * всегда слот» роняет (j), «Date.now() на элемент» роняет (f).
 * Запуск: node --test 'tests/unit/excluded-backend.test.js'. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const core = require(path.join(__dirname, '..', '..', 'backend-project.js'));

const POST_SPRINT = core.ENDPOINTS.find((e) => e.method === 'POST' && e.path === 'sprint-data');

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 5);
const SID = 'sprint-2026-10';
const ME = 'Иванов И. И.';

function slot(over) {
  return Object.assign({ sprintId: SID, name: 'Спринт октябрь', status: 'PLANNING', dateStart: T0, dateEnd: T0 + 30 * DAY, _rev: 5 }, over || {});
}
function item(over) {
  return Object.assign({ issueId: 'A-1', title: 'Задача', url: 'https://yt.example.test/issue/A-1', inclusionStatus: 'INC_PLANNED', addedAt: T0, addedBy: 'user0' }, over || {});
}
function excluded(over) {
  return item(Object.assign({ inclusionStatus: 'INC_EXCLUDED', excludeReason: 'Блокер: зависимость не готова' }, over || {}));
}
function snap(rk, items, over) {
  return Object.assign({ sprintId: SID + '_' + rk, roleKey: rk, roleLabel: rk, name: 'Спринт октябрь', status: 'CONFIRMED',
    dateStart: T0, dateEnd: T0 + 30 * DAY, confirmedAt: T0, confirmedBy: 'fixture_user_1', items: items || [] }, over || {});
}

/* groups: ['editor'|'validator'] → членство в группах настроек проекта. */
function mkCtx(opts) {
  opts = opts || {};
  const settings = Object.assign({ editGroups: ['g-edit'], validationGroups: ['g-val'] }, opts.settings || {});
  const props = {
    ssp_settings: JSON.stringify(settings),
    ssp_sprint: opts.slot ? JSON.stringify(opts.slot) : '',
    ssp_roleitems: opts.roleItems ? JSON.stringify(opts.roleItems) : '',
    ssp_history: opts.history ? JSON.stringify(opts.history) : '',
    ssp_history_rev: '',
  };
  const groups = (opts.groups || ['editor']).map((g) => ({ editor: { id: 'g-edit', name: 'g-edit' }, validator: { id: 'g-val', name: 'g-val' } }[g])).filter(Boolean);
  const params = opts.params || {};
  return {
    settings: { settingsManagerGroup: { id: 'g-admin', name: 'Admins' } },
    currentUser: { id: 'u-1', login: 'user1', fullName: ME, groups: groups },
    project: { extensionProperties: props },
    request: { body: JSON.stringify(opts.body), getParameter: (k) => params[k] || '' },
    response: { status: 200, body: null, json(v) { this.body = v; } },
    _props: props,
  };
}
function post(opts) { const c = mkCtx(opts); POST_SPRINT.handle(c); return c; }
function storedItems(c, rk) { const ri = core.parseJson(c._props.ssp_roleitems, null); return ri && ri[rk]; }
function noKeys(it) { return !('excludeReason' in it) && !('excludedAt' in it) && !('excludedBy' in it); }
function ok(c) { assert.strictEqual(c.response.status, 200, JSON.stringify(c.response.body)); assert.strictEqual(c.response.body.success, true); }
function refused(c, code) { assert.strictEqual(c.response.status, 400); assert.strictEqual(c.response.body.reason, code); }

/* (a) ключи при другом статусе срезаются */
test('#121 (a): INC_PLANNED с тремя ключами → в слоте ключей нет', () => {
  const c = post({ slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [item({ excludeReason: 'x', excludedAt: 1, excludedBy: 'y' })] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.strictEqual(it.inclusionStatus, 'INC_PLANNED');
  assert.ok(noKeys(it), 'ключи должны быть срезаны: ' + JSON.stringify(it));
});

/* (b) переход без причины */
test('#121 (b): переход в INC_EXCLUDED без причины / с пробелами → 400 reason_required, слот не записан', () => {
  for (const reason of [undefined, '', '   \n ']) {
    const c = post({ slot: slot(), roleItems: { devFront: [item()] },
      body: { roleItems: { devFront: [excluded({ excludeReason: reason })] }, baseRev: 5 } });
    refused(c, 'reason_required');
    assert.strictEqual(storedItems(c, 'devFront')[0].inclusionStatus, 'INC_PLANNED', 'хранимое не тронуто');
    assert.match(String(c.response.body.cid), /^cid-/);
  }
  /* элемента в эталоне нет вовсе (новая задача сразу исключённой) — тоже переход */
  const n = post({ slot: slot(), roleItems: { devFront: [] }, body: { roleItems: { devFront: [excluded({ excludeReason: '' })] }, baseRev: 5 } });
  refused(n, 'reason_required');
});

/* (b2) legacy — уже исключена без причины и отметок */
test('#121 (b2): хранимая INC_EXCLUDED без причины и отметок пришла такой же → 200, ключей нет', () => {
  const legacy = item({ inclusionStatus: 'INC_EXCLUDED' });
  const c = post({ slot: slot(), roleItems: { devFront: [legacy] }, body: { roleItems: { devFront: [legacy] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.strictEqual(it.inclusionStatus, 'INC_EXCLUDED');
  assert.ok(noKeys(it), 'сервер не выдумывает отметки legacy: ' + JSON.stringify(it));
});

/* (c) потолок 500 после trim */
test('#121 (c): 501 символ → reason_too_long; 500 с пробелами вокруг → проходит trimmed', () => {
  const long = post({ slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [excluded({ excludeReason: 'x'.repeat(501) })] }, baseRev: 5 } });
  refused(long, 'reason_too_long');
  const fit = post({ slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [excluded({ excludeReason: '  ' + 'y'.repeat(500) + '\n' })] }, baseRev: 5 } });
  ok(fit);
  assert.strictEqual(storedItems(fit, 'devFront')[0].excludeReason, 'y'.repeat(500));
});

/* (d) отметки серверные */
test('#121 (d): новое исключение с клиентскими excludedAt/excludedBy → записаны серверные now / fullName', () => {
  const before = Date.now();
  const c = post({ slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [excluded({ excludedAt: 1, excludedBy: 'hacker' })] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.strictEqual(it.excludeReason, 'Блокер: зависимость не готова');
  assert.ok(typeof it.excludedAt === 'number' && it.excludedAt >= before && it.excludedAt <= Date.now(), 'excludedAt = now, не клиентский 1: ' + it.excludedAt);
  assert.strictEqual(it.excludedBy, ME);
});

/* (e) правка причины не двигает отметку */
test('#121 (e): хранимая исключена с T0/U0, приходит новая причина и чужие отметки → причина новая, отметки T0/U0', () => {
  const stored = excluded({ excludeReason: 'старая', excludedAt: T0, excludedBy: 'U0' });
  const c = post({ slot: slot(), roleItems: { devFront: [stored] },
    body: { roleItems: { devFront: [excluded({ excludeReason: '  новая  ', excludedAt: 999, excludedBy: 'кто-то' })] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.strictEqual(it.excludeReason, 'новая');
  assert.strictEqual(it.excludedAt, T0);
  assert.strictEqual(it.excludedBy, 'U0');
  /* пустая входящая причина у уже исключённой — хранимая остаётся (не reason_required) */
  const keep = post({ slot: slot(), roleItems: { devFront: [stored] },
    body: { roleItems: { devFront: [excluded({ excludeReason: '' })] }, baseRev: 5 } });
  ok(keep);
  assert.strictEqual(storedItems(keep, 'devFront')[0].excludeReason, 'старая');
});

/* (f) один now на запрос — каскад #59 в двух ролях */
test('#121 (f): один POST исключает задачу в двух ролях → обе с одной excludedAt (один Date.now на запрос)', () => {
  const orig = Date.now; let n = 1700000000000;
  Date.now = () => (n += 1);                         /* каждый вызов — новое значение */
  try {
    const c = post({ slot: slot(), roleItems: { devFront: [item()], devBack: [item()] },
      body: { roleItems: { devFront: [excluded()], devBack: [excluded()] }, baseRev: 5 } });
    ok(c);
    const a = storedItems(c, 'devFront')[0], b = storedItems(c, 'devBack')[0];
    assert.strictEqual(typeof a.excludedAt, 'number');
    assert.strictEqual(a.excludedAt, b.excludedAt, 'копии каскада несут одну отметку');
  } finally { Date.now = orig; }
});

/* (g) ?action=validate — та же нормализация */
test('#121 (g): ?action=validate под валидатором — reason_required на переходе, отметки серверные', () => {
  const bad = post({ groups: ['validator'], params: { action: 'validate' }, slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [excluded({ excludeReason: '' })] }, baseRev: 5 } });
  refused(bad, 'reason_required');
  const good = post({ groups: ['validator'], params: { action: 'validate' }, slot: slot(), roleItems: { devFront: [item()] },
    body: { roleItems: { devFront: [excluded({ excludedAt: 1, excludedBy: 'x' })] }, baseRev: 5 } });
  ok(good);
  const it = storedItems(good, 'devFront')[0];
  assert.notStrictEqual(it.excludedAt, 1);
  assert.strictEqual(it.excludedBy, ME);
});

/* (h) форма validateItem через историю: типы; INC_EXCLUDED без ключей читается и пишется */
test('#121 (h): форма — excludedAt строкой и причина числом отвергаются; снимок с INC_EXCLUDED без ключей проходит read и write', () => {
  const okSnap = [snap('devFront', [item({ inclusionStatus: 'INC_EXCLUDED' })])];
  assert.strictEqual(core.validateHistoryForRead(okSnap), true);
  assert.strictEqual(core.validateHistoryForWrite(okSnap), true);
  const withKeys = [snap('devFront', [excluded({ excludedAt: T0, excludedBy: 'U0' })])];
  assert.strictEqual(core.validateHistoryForWrite(withKeys), true);
  assert.strictEqual(core.validateHistoryForWrite([snap('devFront', [excluded({ excludedAt: '1' })])]), false, 'excludedAt строкой');
  assert.strictEqual(core.validateHistoryForWrite([snap('devFront', [excluded({ excludeReason: 5 })])]), false, 'причина числом');
  assert.strictEqual(core.validateHistoryForWrite([snap('devFront', [excluded({ excludedBy: {} })])]), false, 'excludedBy объектом');
  for (const k of ['excludeReason', 'excludedAt', 'excludedBy']) assert.ok(core.ALLOWED_ITEM_KEYS.includes(k), k + ' в ALLOWED_ITEM_KEYS');
});

/* (i) форма ≤ 1000 (импорт/снимок), запись состава ≤ 500 */
test('#121 (i): причина 700 символов проходит форму снимка (import-replace), но не запись состава', () => {
  const r700 = 'z'.repeat(700);
  assert.strictEqual(core.validateHistoryForWrite([snap('devFront', [excluded({ excludeReason: r700, excludedAt: T0, excludedBy: 'U0' })])]), true);
  assert.strictEqual(core.validateHistoryForWrite([snap('devFront', [excluded({ excludeReason: 'z'.repeat(1001) })])]), false, 'форма: > 1000');
  const c = post({ slot: slot(), roleItems: { devFront: [item()] }, body: { roleItems: { devFront: [excluded({ excludeReason: r700 })] }, baseRev: 5 } });
  refused(c, 'reason_too_long');
});

/* (j) эталон — снимки истории, когда слот держит другой спринт */
test('#121 (j): слот держит другой спринт, тело — реконструкция из снимков с исключённой T0/U0/R0 → не перештампована', () => {
  const c = post({ slot: slot({ sprintId: 'other', name: 'Другой' }),
    roleItems: { devFront: [item()] },                                              /* в слоте A-1 активна — «эталон = слот» перештамповал бы */
    history: [snap('devFront', [excluded({ excludeReason: 'R0', excludedAt: T0, excludedBy: 'U0' })])],
    body: { sprint: slot(), roleItems: { devFront: [excluded({ excludeReason: 'R0', excludedAt: T0, excludedBy: 'U0' })] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.strictEqual(it.excludeReason, 'R0');
  assert.strictEqual(it.excludedAt, T0);
  assert.strictEqual(it.excludedBy, 'U0');
});

/* (k) то же с legacy без причины */
test('#121 (k): слот держит другой спринт, снимок несёт INC_EXCLUDED без причины → проходит, ключей нет', () => {
  const legacy = item({ inclusionStatus: 'INC_EXCLUDED' });
  const c = post({ slot: slot({ sprintId: 'other', name: 'Другой' }), roleItems: { devFront: [item()] },
    history: [snap('devFront', [legacy])],
    body: { sprint: slot(), roleItems: { devFront: [legacy] }, baseRev: 5 } });
  ok(c);
  assert.ok(noKeys(storedItems(c, 'devFront')[0]));
});

/* (l) слот держит этот спринт — эталон слот, а не снимок */
test('#121 (l): слот держит этот спринт, в слоте активна, в снимке исключена T0 → переход: отметки now / me', () => {
  const c = post({ slot: slot(), roleItems: { devFront: [item()] },
    history: [snap('devFront', [excluded({ excludeReason: 'R0', excludedAt: T0, excludedBy: 'U0' })])],
    body: { sprint: slot(), roleItems: { devFront: [excluded({ excludeReason: 'новая' })] }, baseRev: 5 } });
  ok(c);
  const it = storedItems(c, 'devFront')[0];
  assert.notStrictEqual(it.excludedAt, T0, 'эталон — слот, снимок не считается');
  assert.strictEqual(it.excludedBy, ME);
});

/* (m) сброс слота парой {sprint:null, roleItems:{}} — нормализовать нечего, путь #67 H5 жив */
test('#121 (m): сброс слота {sprint:null, roleItems:{}} под валидатором проходит как прежде', () => {
  const c = post({ groups: ['validator'], slot: slot(), roleItems: { devFront: [excluded({ excludedAt: T0, excludedBy: 'U0' })] },
    body: { sprint: null, roleItems: {}, baseRev: 5 } });
  ok(c);
  assert.deepStrictEqual(storedItems(c, 'devFront'), undefined);
});
