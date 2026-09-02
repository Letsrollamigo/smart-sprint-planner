/**
 * #84 — «перечитать-и-слить вместо „обновите страницу"»: поведение api-шва на 409.
 *
 * Проверяем не саму арифметику слияния (она в tests/unit/slot-merge.test.js), а шов:
 * снятие базы на GET, перечитывание слота на 409, повторную запись слитого и — главное —
 * досылку слитого В ПАМЯТЬ вкладки. Память и rev обязаны быть одной версией: валидный
 * rev при устаревшем содержимом пропустил бы следующую обычную запись через замок, и
 * она затёрла бы чужое молча (класс v2.16.6).
 * Пересечение правок остаётся честным отказом #100 с меткой заморозки.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHost } = require('./monolith-host');
const fx = require('./fixtures/state');

function boot() {
  const host = createHost();
  fx.applyBaseState(host.gm);
  return host;
}

const rec = (id, extra) => Object.assign({ sprintId: id, status: 'PLANNING' }, extra || {});

/** Хост-сценарист: отвечает по очереди на POST'ы, GET history отдаёт «свежее». */
function scriptedHost(freshHistory, freshRev, postResponses) {
  const log = [];
  let post = 0;
  return {
    log: log,
    fetchApp: function (p, o) {
      const method = (o && o.method) || 'GET';
      log.push({ path: p, method: method, body: o && o.body ? JSON.parse(JSON.stringify(o.body)) : null });
      if (method === 'POST') return Promise.resolve(postResponses[post++]);
      return Promise.resolve({ success: true, history: freshHistory, rev: freshRev });
    },
    fetchYouTrack: function () { return Promise.resolve({}); },
  };
}

test('#84: правки в разных записях сливаются — повторная запись несёт обе', async () => {
  const { gm } = boot();

  /* GET снимает базу и rev слота. */
  gm.set({ _host: scriptedHost([rec('s1'), rec('s2')], 5, []) });
  await gm.call('apiGet', 'history');
  assert.strictEqual(gm.call('SPRINT_STORE.getSlotRevFor', 'history'), 5, 'GET синкает rev');
  assert.ok(gm.call('SPRINT_STORE.getSlotBase', 'history'), 'GET снимает базу слияния');

  /* Пока мы правили s1, коллега записал s2 → 409, слот уехал на rev 7. */
  const theirs = [rec('s1'), rec('s2', { goal: 'их' })];
  const host = scriptedHost(theirs, 7, [
    { success: false, error: 'rev_conflict', rev: 7 },
    { success: true, rev: 8 },
  ]);
  gm.set({ _host: host });

  const mine = [rec('s1', { goal: 'моя' }), rec('s2')];
  /* Активная запись роли указывает ВНУТРЬ того массива, который вкладка сейчас отправит —
     как это и бывает в живом сохранении (saveCurrentRoleState правит histRec по ссылке). */
  gm.set({ _history: mine, _currentSprintRoleRec: mine[0] });
  await gm.call('apiPost', 'history', { history: mine });

  const posts = host.log.filter((c) => c.method === 'POST');
  const gets = host.log.filter((c) => c.method === 'GET');
  assert.strictEqual(posts.length, 2, 'первая запись отбита, вторая — слитая');
  assert.strictEqual(gets.length, 1, 'слот перечитан ровно один раз');

  const sent = posts[1].body.history;
  const byId = Object.fromEntries(sent.map((r) => [r.sprintId, r]));
  assert.strictEqual(byId.s1.goal, 'моя', 'моя правка дошла');
  assert.strictEqual(byId.s2.goal, 'их', 'чужая правка не затёрта');
  assert.strictEqual(posts[1].body.baseRev, 7, 'повтор идёт с rev, который вернул сервер');

  /* 🔴 Ключевой инвариант: слитое ДОСЛАНО в память вкладки, и только поэтому rev
     честно продвинут. Память и rev обязаны быть одной версией — иначе следующая
     обычная запись пройдёт замок с устаревшим содержимым (класс v2.16.6). */
  const inMemory = gm.get('_history');
  const memById = Object.fromEntries(inMemory.map((r) => [r.sprintId, r]));
  assert.strictEqual(memById.s1.goal, 'моя', 'в памяти вкладки моя правка');
  assert.strictEqual(memById.s2.goal, 'их', 'в памяти вкладки и чужая тоже');
  assert.strictEqual(gm.call('SPRINT_STORE.getSlotRevFor', 'history'), 8,
    'rev продвинут до серверного — память уже соответствует ему');
  /* 🔴 Слитое приходит НОВЫМ массивом новых объектов (merge3 прогоняет через JSON).
     Если активная запись роли осталась указывать в прежний массив, следующая правка
     personalPlanning легла бы в отцепленный объект и до сервера не доехала — это #100
     ровно в том виде, в каком он уже случался. */
  const activeRec = gm.get('_currentSprintRoleRec');
  assert.ok(activeRec, 'предусловие теста: активная запись роли выставлена');
  assert.ok(gm.get('_history').indexOf(activeRec) >= 0,
    'активная запись роли перепривязана в новый _history, а не осталась в отцепленном массиве');
  assert.strictEqual(activeRec.goal, 'моя', 'и это именно слитая запись');
});

test('#84: правка одного и того же места остаётся отказом с заморозкой (#100)', async () => {
  const { gm, document: doc } = boot();

  gm.set({ _host: scriptedHost([rec('s1')], 5, []) });
  await gm.call('apiGet', 'history');

  const host = scriptedHost([rec('s1', { goal: 'их' })], 7, [
    { success: false, error: 'rev_conflict', rev: 7 },
  ]);
  gm.set({ _host: host });

  await assert.rejects(
    () => gm.call('apiPost', 'history', { history: [rec('s1', { goal: 'моя' })] }),
    /rev_conflict/,
    'пересечение по одному полю — отказ, а не молчаливое слияние'
  );
  assert.strictEqual(host.log.filter((c) => c.method === 'POST').length, 1, 'повторной записи не было');
  assert.strictEqual(doc.body.dataset.sspRevConflict, '1', 'метка заморозки правок стоит');
  assert.strictEqual(gm.call('SPRINT_STORE.getSlotRevFor', 'history'), 5,
    'записи не было — rev вкладки не двигается');
});

test('#84: без снятой базы слияния не пробуем — прежний отказ', async () => {
  const { gm } = boot();
  /* GET'а не было → базы нет (например, запись из восстановленного черновика). */
  const host = scriptedHost([rec('s1')], 7, [{ success: false, error: 'rev_conflict', rev: 7 }]);
  gm.set({ _host: host });

  await assert.rejects(() => gm.call('apiPost', 'history', { history: [rec('s1')] }), /rev_conflict/);
  assert.strictEqual(host.log.filter((c) => c.method === 'GET').length, 0, 'слот не перечитывали');
});

test('#84: ?action=… не сливаем — тело там не весь слот', async () => {
  const { gm } = boot();
  gm.set({ _host: scriptedHost([rec('s1')], 5, []) });
  await gm.call('apiGet', 'history');

  const host = scriptedHost([rec('s1', { goal: 'их' })], 7, [{ success: false, error: 'rev_conflict', rev: 7 }]);
  gm.set({ _host: host });

  await assert.rejects(
    () => gm.call('apiPost', 'history', { history: [rec('s1', { personalPlanning: {} })] }, { action: 'assignerSync' }),
    /rev_conflict/
  );
  assert.strictEqual(host.log.filter((c) => c.method === 'GET').length, 0, 'частичное тело не сливаем');
});

/* Слот sprint-data — отдельная ветка шва: rev живёт ВНУТРИ блоба спринта (_revOfGet),
   в слиянии два поля, синк идёт через setSlotRev, а не setSlotRevFor. Класс v2.16.6
   («потеря состава при параллельном планировании») жил именно здесь. */
function scriptedSprintHost(freshRev, freshRoleItems, postResponses) {
  const log = [];
  let post = 0;
  return {
    log: log,
    fetchApp: function (p, o) {
      const method = (o && o.method) || 'GET';
      log.push({ path: p, method: method, body: o && o.body ? JSON.parse(JSON.stringify(o.body)) : null });
      if (method === 'POST') return Promise.resolve(postResponses[post++]);
      return Promise.resolve({
        success: true,
        sprint: { sprintId: 'sp1', _rev: freshRev },
        roleItems: freshRoleItems,
        settings: {},
      });
    },
    fetchYouTrack: function () { return Promise.resolve({}); },
  };
}

test('#84 sprint-data: состав двух ролей сливается и доходит до памяти вкладки', async () => {
  const { gm } = boot();

  gm.set({ _host: scriptedSprintHost(5, { ba: [{ issueId: 'A-1' }], dev: [{ issueId: 'D-1' }] }, []) });
  await gm.call('apiGet', 'sprint-data');
  assert.strictEqual(gm.call('SPRINT_STORE.getSlotRev'), 5, 'rev sprint-data берётся из sprint._rev');

  /* Коллега проставил оценку по dev, мы правим ba → 409, слот уехал на _rev 7. */
  const host = scriptedSprintHost(7, { ba: [{ issueId: 'A-1' }], dev: [{ issueId: 'D-1', estimate_dev: 8 }] }, [
    { success: false, error: 'rev_conflict', rev: 7 },
    { success: true, rev: 8 },
  ]);
  gm.set({ _host: host });

  await gm.call('apiPost', 'sprint-data', {
    roleItems: { ba: [{ issueId: 'A-1', estimate_ba: 5 }], dev: [{ issueId: 'D-1' }] },
  });

  const posts = host.log.filter((c) => c.method === 'POST');
  assert.strictEqual(posts.length, 2, 'первая запись отбита, вторая — слитая');
  assert.strictEqual(posts[1].body.baseRev, 7, 'baseRev повтора взят из sprint._rev свежего блоба');
  assert.strictEqual(posts[1].body.roleItems.ba[0].estimate_ba, 5, 'моя оценка дошла');
  assert.strictEqual(posts[1].body.roleItems.dev[0].estimate_dev, 8, 'чужая оценка не затёрта');
  assert.strictEqual(posts[1].body.sprint, undefined, 'спринт в теле не менялся — не досылаем');

  const memRI = gm.get('_roleItems');
  assert.strictEqual(memRI.ba[0].estimate_ba, 5, 'в памяти вкладки моя оценка');
  assert.strictEqual(memRI.dev[0].estimate_dev, 8, 'в памяти вкладки и чужая тоже');
  assert.strictEqual(gm.call('SPRINT_STORE.getSlotRev'), 8,
    'rev продвинут до серверного — память уже соответствует ему');
});

test('#84: у каждого сливаемого поля есть сеттер стейта — иначе слияние молча отключится', () => {
  /* Шов fail-closed: нет сеттера → слияние не пробуем вовсе (иначе получили бы
     валидный rev при устаревшем содержимом — дыра v2.16.6). Гарантия полезна ровно
     до тех пор, пока новый слот в MERGE_SLOTS не забыли снабдить сеттером: тогда
     фича для него тихо выключится. Этот контракт и держим здесь. */
  const { gm } = boot();
  const deps = gm.call('_ytApiDeps');
  const SETTERS = { sprint: 'setSprint', roleItems: 'setRoleItems', history: 'setHistory',
                    releases: 'setReleases', absences: 'setAbsences' };
  ['sprint', 'roleItems', 'history', 'releases', 'absences'].forEach((f) => {
    assert.strictEqual(typeof deps.state[SETTERS[f]], 'function',
      'нет сеттера для поля «' + f + '» — слияние по нему выключится молча');
  });
});
