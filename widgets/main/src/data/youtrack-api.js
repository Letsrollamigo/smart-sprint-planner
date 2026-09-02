'use strict';
// YouTrack IO layer extracted from widgets/main/src/core.js (Tier C).
// Browser bridge: window.__SSP_YOUTRACK_API. Golden-tested in
// tests/golden/youtrack-api.golden.test.js (backend routing matrix, apiGet/apiPost
// contracts incl. save side-effects and auto-snapshot matrix, _currentSprintRoleRec
// rebind, gantt state-history detect/cache/chunking/degradation).
//
// Faithful extraction — bodies mirror the IIFE originals 1:1 modulo state access. The
// monolith keeps thin delegators (building deps per call via _ytApiDeps). Injected deps:
//   diag                                     — diagnostics log
//   host                                     — YT host API (fetchApp / fetchYouTrack)
//   STATUS                                   — sprint status constants
//   settings                                 — live settings reference at call time
//   markSavedAndCleanup, saveRoleHistorySnapshot — save side-effect services (monolith)
//   updateGanttHistDOM, getGanttContainer    — Gantt DOM hooks (DOM stays in monolith)
//   state                                    — get/set аксессоры монолитного стейта:
//     mode / activeProjectKey                  (роутинг #25 Ф1)
//     sprint / activeWorkingDraftKey / activeSubtab / currentSprintRoleRec / history
//                                              (save-сайд-эффекты apiPost)
//     ganttStateHist                           (кэш истории состояний Ганта #20)

/* #25 Ф1 — роутинг по режиму. project → backend-project (scope:true). global →
   backend-global + projectKey. В global нормализуем query: путь может нести
   встроенный '?a=b' (например field-values?fieldName=), поэтому раскладываем его
   в единый объект query (+ projectKey + переданный query), а fetchApp получает
   чистый путь. Это исключает двойной '?' при склейке. */
function _backendCall(path, baseOpts, deps) {
  baseOpts = baseOpts || {};
  if (deps.state.getMode() !== 'global') {
    baseOpts.scope = true;
    return deps.host.fetchApp('backend-project/' + path, baseOpts);
  }
  var q = {};
  var qi = path.indexOf('?');
  var cleanPath = path;
  if (qi >= 0) {
    cleanPath = path.slice(0, qi);
    path.slice(qi + 1).split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
  }
  if (baseOpts.query) {
    Object.keys(baseOpts.query).forEach(function (k) { q[k] = baseOpts.query[k]; });
  }
  /* #51 — фан-аут глобального пуша календаря: явный projectKey из query имеет
     приоритет над активным проектом (обычные вызовы projectKey не передают). */
  if (!q.projectKey) q.projectKey = deps.state.getActiveProjectKey();
  baseOpts.query = q;
  return deps.host.fetchApp('backend-global/' + cleanPath, baseOpts);
}

/* R6 — optimistic lock слотов history/releases/absences (обобщение #56-4): GET синкает
   rev из ответа, POST прикладывает baseRev из стора; 409 rev_conflict тостится общим
   путём ниже. Числовой rev живёт в sprint-store (map slot→rev, сброс на смене проекта). */
const REV_SLOT_PATHS = { history: 1, releases: 1, absences: 1 };

/* #84 — слоты, где 409 лечится перечитыванием и слиянием, и поля тела, которые в
   слиянии участвуют. Имена совпадают с полями ответа GET того же слота, поэтому
   одна таблица обслуживает и снятие базы, и сборку повторного тела.
   `settings` в sprint-data не участвует осознанно: слот rev'ом не гейтится. */
const MERGE_SLOTS = {
  'sprint-data': ['sprint', 'roleItems'],
  'history':     ['history'],
  'releases':    ['releases'],
  'absences':    ['absences']
};

/* #84 — куда положить слитое В ПАМЯТЬ вкладки: поле слота → сеттер стейта. Без
   досылки в памяти осталось бы «моё» без чужих правок, и следующая обычная запись
   ушла бы с валидным rev, но устаревшим содержимым — молча затёрла бы чужое (класс
   v2.16.6). Отсутствие сеттера = слияние не пробуем вовсе (см. _mergeRetry). */
const MERGE_SETTERS = {
  sprint:   'setSprint',   roleItems: 'setRoleItems', history: 'setHistory',
  releases: 'setReleases', absences:  'setAbsences'
};

function _cloneJson(v) {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch (_) { return undefined; }
}

/* Слепок полей слоя слияния из ответа (GET) или из тела (POST). */
function _pickMergeFields(src, fields) {
  var out = {};
  for (var i = 0; i < fields.length; i++) {
    if (src && src[fields[i]] !== undefined) out[fields[i]] = _cloneJson(src[fields[i]]);
  }
  return out;
}

/* rev слота из ответа GET: у sprint-data он живёт внутри блоба спринта, у прочих — полем. */
function _revOfGet(path, r) {
  if (path === 'sprint-data') return (r && r.sprint && typeof r.sprint._rev === 'number') ? r.sprint._rev : 0;
  return (r && typeof r.rev === 'number') ? r.rev : 0;
}

/* #97 — дедлайн ЧТЕНИЯ. Зависший (не упавший) ответ раньше держал цепочку загрузки
   проекта вечно: шапка уже на новом проекте, тело — от прежнего, и ничто не выводило
   из этого состояния. Гонку выигрывает таймер → цепочка падает в catch, вызывающий
   покажет причину. Ошибка помечена `_readDeadlineExceeded`, чтобы отличать её от ответа сервера.
   Только GET: у записи таймаут опаснее самой проблемы — POST мог дойти до сервера,
   и клиент, «отменивший» его по времени, соврал бы о результате. */
const READ_DEADLINE_MS = 30000;

function _withDeadline(p, path, deps) {
  if (typeof setTimeout !== 'function') return p;
  var timer = null;
  return Promise.race([
    p,
    new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var e = new Error('read deadline ' + READ_DEADLINE_MS + 'ms exceeded: ' + path);
        e._readDeadlineExceeded = true;
        deps.diag('TIMEOUT ' + path + ' (' + READ_DEADLINE_MS + 'ms)', 'err');
        reject(e);
      }, READ_DEADLINE_MS);
    }),
  ]).then(
    function (r) { if (timer) clearTimeout(timer); return r; },
    function (e) { if (timer) clearTimeout(timer); throw e; }
  );
}

function apiGet(path, deps, _isRetry) {
  deps.diag('GET ' + path + ' [' + deps.state.getMode() + ']');
  return _withDeadline(_backendCall(path, {}, deps), path, deps)
    .then(function (r) {
      deps.diag('OK ' + path, 'ok');
      /* v3.12.0 (P2-хвост v3.2.1) — анти-clobber слотов: GET, чей rev МЕНЬШЕ уже
         виденного (свой POST успел бампнуть слот, пока GET был в полёте), — устаревший
         снапшот: применять нельзя (затёр бы свежий локальный стейт), rev не даунгрейдим.
         Перечитываем один раз — сервер заведомо ≥ виденного rev (монотонный bump). */
      if (!_isRetry && REV_SLOT_PATHS[path] && r && r.success !== false
          && typeof r.rev === 'number' && typeof deps.state.getSlotRevFor === 'function'
          && r.rev < deps.state.getSlotRevFor(path)) {
        deps.diag('stale ' + path + ' GET (rev ' + r.rev + ' < seen '
          + deps.state.getSlotRevFor(path) + ') — refetch', 'warn');
        return apiGet(path, deps, true);
      }
      /* #56-4 — синк rev слота sprint-data при загрузке (optimistic lock).
         v3.2.1 — синкаем и ПУСТОЙ слот (sprint=null после S3-сброса → rev 0):
         раньше stale _slotRev оставался и все записи вкладки ловили 409 до F5. */
      if (typeof deps.state.setSlotRev === 'function' && path.indexOf('sprint-data') === 0
          && r && r.success !== false) {
        deps.state.setSlotRev((r.sprint && typeof r.sprint._rev === 'number') ? r.sprint._rev : 0);
      }
      /* R6 — синк rev слотов history/releases/absences при загрузке. */
      if (REV_SLOT_PATHS[path] && r && r.success !== false && typeof r.rev === 'number'
          && typeof deps.state.setSlotRevFor === 'function') {
        deps.state.setSlotRevFor(path, r.rev);
      }
      /* #84 — вместе с rev снимаем базу трёхстороннего слияния: каким слот был,
         когда вкладка получила этот rev. Пара rev+база обязана двигаться синхронно —
         иначе на 409 мы сравнивали бы «своё» с базой другой ревизии. */
      if (MERGE_SLOTS[path] && r && r.success !== false
          && typeof deps.state.setSlotBase === 'function') {
        deps.state.setSlotBase(path, _pickMergeFields(r, MERGE_SLOTS[path]));
      }
      return r;
    })
    .catch(function (e) { deps.diag('ERR ' + path + ': ' + (e && e.message ? e.message : e), 'err'); throw e; });
}

/* v5.0.3 (итерация 5) — после успешного POST history обновлённая запись в _history имеет
   ту же sprintId, что и _currentSprintRoleRec: перепривязываем ссылку, чтобы distrib-таблица
   видела свежие items/personalPlanning.
   #84 — зовётся ДВАЖДЫ: из хвоста apiPost и ещё раз после досылки слитого в память
   (_mergeRetry). Слитое приходит НОВЫМ массивом новых объектов, а хвост apiPost отрабатывает
   ДО досылки — то есть перепривязывает на прежний массив, который тут же заменяется.
   Ссылка, оставшаяся в отцепленном массиве, увела бы следующую правку personalPlanning
   в объект, которого никто не отправляет: #100 ровно в том виде, в каком он уже случался. */
function _rebindCurrentRoleRec(deps) {
  try {
    var rec     = deps.state.getCurrentSprintRoleRec();
    var history = deps.state.getHistory();
    if (rec && rec.sprintId && Array.isArray(history)) {
      var freshRec = history.find(function (h) { return h.sprintId === rec.sprintId; });
      if (freshRec && freshRec !== rec) deps.state.setCurrentSprintRoleRec(freshRec);
    }
  } catch (_) {}
}

/* #100 — отказ оптимистичной блокировки: сервер запись не принял, а локальный стейт
   вызывающий уже мутировал. Метка «разошлись с сервером» замораживает правки до
   перезагрузки (прод-баг: после тоста человек сделал ещё три назначения, и все
   потерялись). Метка живёт в DOM, поэтому reload её снимает, а module-level стейта
   не прибавляется (гейт C1). Вынесено из apiPost в #84: точек отказа стало две —
   слот вообще не сливается и слияние упёрлось в пересечение. */
function _revConflictRefuse(path, deps) {
  try { document.body.dataset.sspRevConflict = '1'; } catch (_) {}
  if (typeof deps.toast === 'function') {
    /* R6 — у слотов history/releases/absences своя формулировка («данные», не «спринт»). */
    deps.toast(deps.T(REV_SLOT_PATHS[path] ? 'errSlotRevConflict' : 'errRevConflict'), 'err');
  }
}

/* #84 — «перечитать-и-слить вместо „обновите страницу"». 409 означает: слот сдвинулся
   с тех пор, как эта вкладка его читала. Перечитываем слот, трёхсторонне сливаем
   (база — слепок на момент нашего baseRev) и переписываем поверх свежего. Правки в
   разных местах сливаются молча; правка одного и того же места разными значениями
   остаётся честным отказом #100 (⚖ владелец 2026-09-02).

   🔴 Порядок «сперва досылка слитого в память, только потом доверие к rev» —
   несущий. Валидный rev при устаревшем содержимом пропустил бы следующую обычную
   запись через замок, и она затёрла бы чужое молча (класс v2.16.6, ровно то, от
   чего стоит замок). Поэтому merge-запись доводится до конца ТОЛЬКО когда слитое
   легло в память вкладки (MERGE_SETTERS): нет сеттера — слияние не пробуем вовсе и
   отдаём прежний отказ. Экран при этом НЕ перерисовываем (⚖ владелец: сливаем
   молча) — память = сервер, а таблицы подхватят её на ближайшей перерисовке.

   Перечитываем сырым _backendCall, а не apiGet: apiGet синкает rev и базу побочным
   эффектом, то есть двигал бы их ДО того, как слияние удалось.

   Возвращает промис повторной записи либо null, если слить нечем (тогда наверху
   отрабатывает прежний отказ). Потолок: одна попытка слияния на запрос — второй
   конфликт в том же окне уходит в отказ. */
function _mergeRetry(path, body, query, deps) {
  var fields = MERGE_SLOTS[path];
  /* ?action=… — записи с иной семантикой тела: validate/assignerSync/snapshot шлют
     не весь слот, clear/import-replace деструктивны осознанно. Их не сливаем. */
  if (!fields || (query && query.action) || !body || typeof body !== 'object') return null;
  var MERGE = (typeof window !== 'undefined' && window.__SSP_SLOT_MERGE_PURE) || null;
  if (!MERGE || typeof deps.state.getSlotBase !== 'function') return null;
  var base = deps.state.getSlotBase(path);
  if (!base) return null;
  var touched = fields.filter(function (f) { return body[f] !== undefined && base[f] !== undefined; });
  if (!touched.length) return null;
  /* Fail-closed: слить и не суметь положить результат в память = та самая дыра
     «валидный rev при устаревшем содержимом». Лучше прежний честный отказ. */
  if (!touched.every(function (f) { return typeof deps.state[MERGE_SETTERS[f]] === 'function'; })) return null;

  /* #97 — перечитывание идёт под тем же дедлайном чтения, что и обычный GET:
     зависший (не упавший) ответ иначе держал бы сохранение вечно. */
  return _withDeadline(_backendCall(path, {}, deps), path, deps).then(function (fresh) {
    if (!fresh || fresh.success === false) { _revConflictRefuse(path, deps); throw new Error('rev_conflict'); }
    var merged = {};
    for (var i = 0; i < touched.length; i++) {
      var f = touched[i];
      var res = MERGE.merge(base[f], body[f], fresh[f]);
      if (!res.ok) {
        deps.diag('#84 ' + path + ': слить не вышло, правки пересеклись — '
          + res.conflicts.slice(0, 5).join(', '), 'warn');
        _revConflictRefuse(path, deps);
        throw new Error('rev_conflict');
      }
      merged[f] = res.result;
    }
    var retryBody = {};
    Object.keys(body).forEach(function (k) { if (k !== 'baseRev') retryBody[k] = body[k]; });
    Object.keys(merged).forEach(function (k) { retryBody[k] = merged[k]; });
    retryBody.baseRev = _revOfGet(path, fresh);
    deps.diag('#84 ' + path + ': конфликт слит, пишем поверх свежего (rev ' + retryBody.baseRev + ')', 'ok');
    return apiPost(path, retryBody, query, deps, true).then(function (ok) {
      /* Сервер принял слитое → кладём его же в память вкладки. С этого момента
         память = сервер, поэтому rev и база, засинканные хвостом apiPost выше,
         честны, и следующая обычная запись пройдёт замок заслуженно. */
      Object.keys(merged).forEach(function (f) { deps.state[MERGE_SETTERS[f]](merged[f]); });
      if (merged.history) _rebindCurrentRoleRec(deps);   /* см. коммент у _rebindCurrentRoleRec */
      deps.diag('#84 ' + path + ': слитое дослано в память вкладки (' + Object.keys(merged).join(',') + ')', 'ok');
      return ok;
    });
  });
}

function apiPost(path, body, query, deps, _isRetry) {
  deps.diag('POST ' + path + ' [' + deps.state.getMode() + ']');
  /* #56-4 — optimistic lock: к каждому write sprint-data прикладываем rev слота,
     который этот клиент видел. Сервер отвергает несовпадение (409 rev_conflict) —
     параллельная правка вторым пользователем больше не затирается молча. */
  if (path === 'sprint-data' && body && (body.sprint !== undefined || body.roleItems !== undefined)
      && body.baseRev === undefined && typeof deps.state.getSlotRev === 'function') {
    body.baseRev = deps.state.getSlotRev();
  }
  /* R6 — write history/releases/absences несёт rev, который клиент видел (body=null —
     операции без тела, напр. history?action=clear — не гейтятся, серверу нечего сверять). */
  if (REV_SLOT_PATHS[path] && body && typeof body === 'object' && body.baseRev === undefined
      && typeof deps.state.getSlotRevFor === 'function') {
    body.baseRev = deps.state.getSlotRevFor(path);
  }
  var opts = { method: 'POST', body: body };
  if (query && typeof query === 'object') opts.query = query;
  return _backendCall(path, opts, deps)
    .then(function (r) {
      /* v5.0.3 — backend всегда отвечает JSON-ом с полем success.
         Если success=false — это валидационная ошибка (status 400) или auth_required.
         fetchApp может resolve-ить в обоих случаях, поэтому проверяем явно
         и пробрасываем как rejected promise, чтобы wrapper НЕ помечал save успешным
         (раньше markSavedAndCleanup вызывался на 400 → sprint-данные считались
         сохранёнными, хотя сервер их отверг). */
      if (r && r.success === false) {
        var reason = (r && (r.reason || r.error)) || 'unknown_error';
        deps.diag('ERR ' + path + ': server returned success=false reason=' + reason, 'err');
        /* #56-4 — конкурентная правка. #84 — сперва пробуем перечитать-и-слить;
           отказ (#100: метка заморозки + тост) остаётся для случаев, когда слить
           нечем — слот не мержится, базы нет или правки пересеклись. */
        if (reason === 'rev_conflict') {
          var mergeP = _isRetry ? null : _mergeRetry(path, body, query, deps);
          if (mergeP) return mergeP;
          _revConflictRefuse(path, deps);
        }
        /* #80 — планер выключили, пока пользователь работал: понятный тост вместо кода
           причины; отказ уже не дал пометить сохранённым — черновик/dirty целы (риск 5). */
        if (reason === 'planner_disabled' && typeof deps.toast === 'function') {
          deps.toast(deps.T('errPlannerDisabled'), 'err');
        }
        throw new Error(reason);
      }
      deps.diag('OK ' + path, 'ok');
      /* #56-4 — успешный write sprint: сервер вернул новый rev слота. На merge-повторе
         синк тоже честен: _mergeRetry сразу за этим кладёт слитое в память вкладки,
         так что rev и содержимое остаются одной версией (см. коммент у _mergeRetry). */
      if (path === 'sprint-data' && r && typeof r.rev === 'number'
          && typeof deps.state.setSlotRev === 'function') {
        deps.state.setSlotRev(r.rev);
      }
      /* R6 — успешный write слота: сервер вернул новый rev. */
      if (REV_SLOT_PATHS[path] && r && typeof r.rev === 'number'
          && typeof deps.state.setSlotRevFor === 'function') {
        deps.state.setSlotRevFor(path, r.rev);
      }
      /* #84 — база слияния после обычной записи = то, что мы записали. Иначе первый же
         409 сравнивался бы с базой старше собственных сохранений и выдавал наши же
         правки за чужие. ?action=… пропускаем: там тело — не весь слот. */
      if (MERGE_SLOTS[path] && !(query && query.action)
          && body && typeof body === 'object'
          && typeof deps.state.setSlotBase === 'function') {
        var prevBase = deps.state.getSlotBase(path) || {};
        var nextBase = _pickMergeFields(body, MERGE_SLOTS[path]);
        MERGE_SLOTS[path].forEach(function (f) {
          if (nextBase[f] === undefined && prevBase[f] !== undefined) nextBase[f] = prevBase[f];
        });
        deps.state.setSlotBase(path, nextBase);
      }
      /* v5.0.3 — после успешного сохранения снять dirty + обновить snapshot/baseRevHash */
      try {
        if (path === 'sprint-data' && body) {
          if (body.sprint    !== undefined) deps.markSavedAndCleanup('sprint');
          if (body.roleItems !== undefined) deps.markSavedAndCleanup('roleItems');
          /* v5.0.3 — динамический upsert в историю даже при PLANNING/PLANNED.
             Пропускаем для:
             - action=validate (там есть свой явный saveRoleHistorySnapshot после валидации)
             - settings save (это конфигурация, не данные спринта)
             - FINISHED-спринтов (исторические записи неизменны)
             - отсутствия активной подвкладки/спринта
             - активной рабочей копии (B-fix): при активном _activeWorkingDraftKey
               пассивный auto-снапшот зовёт saveRoleHistorySnapshot, который видит
               _activeWorkingDraftKey===snapKey и НЕМЕДЛЕННО коммитит+удаляет только что
               созданную рабочую копию (resumeWorkingDraft постит sprint-data при открытии).
               Правки рабочей копии и так персистятся в черновик через
               _markDirty→syncWorkingDraftFromMemory; commit рабочей копии — только явный
               (Validate/Save → прямой saveRoleHistorySnapshot/_commitWorkingCopy). */
          var isValidate    = query && query.action === 'validate';
          var hasSprintData = body.sprint !== undefined || body.roleItems !== undefined;
          /* #67 H5-mirror — сброс слота (sprint:null) НЕ сохранение состава: локальный
             сброс теперь идёт ПОСЛЕ ака сервера (ordering-фикс history-view), и в момент
             этого хука _sprint ещё жив — авто-снапшот воскрешал бы только что удалённую
             запись истории. Раньше это глушилось побочно (setSprint(null) ДО POST'а). */
          if (body.sprint === null) hasSprintData = false;
          var sprint        = deps.state.getSprint();
          if (hasSprintData && !isValidate
              && sprint && sprint.sprintId
              && sprint.status !== deps.STATUS.FINISHED
              && !deps.state.getActiveWorkingDraftKey()
              && deps.state.getActiveSubtab()) {
            try {
              /* fire-and-forget — игнорируем ошибки, не блокируем основной save */
              deps.saveRoleHistorySnapshot(deps.state.getActiveSubtab()).catch(function (e) {
                deps.diag('auto-snapshot history failed: ' + (e && e.message ? e.message : e), 'err');
              });
            } catch (_) {}
          }
        } else if (path === 'history') {
          deps.markSavedAndCleanup('currentRole');
          _rebindCurrentRoleRec(deps);
        }
      } catch (_) {}
      return r;
    })
    .catch(function (e) { deps.diag('ERR ' + path + ': ' + (e && e.message ? e.message : e), 'err'); throw e; });
}

/* #20 — история переходов состояний для Ганта: Activities API чанками по 25 задач,
   кэш в монолитном _ganttStateHist (TTL 5 мин на sprintKey) — доступ строго через
   deps.state-аксессоры В МОМЕНТ обращения (кэш может быть сброшен извне между
   чанками: смена спринта/инвалидация). DOM-апдейты — через монолитный
   _updateGanttHistDOM (инъекция), контейнер — через getGanttContainer(). */
function _fetchGanttStateHistory(ids, sprintKey, force, curStates, fieldId, deps) {
  if (!ids || !ids.length || !deps.settings || !deps.settings.fieldState) return;
  var now = Date.now();
  var TTL = 5 * 60 * 1000;
  var cached = deps.state.getGanttStateHist();
  if (!force &&
      cached._sprintKey === sprintKey &&
      cached._fetchedAt &&
      (now - cached._fetchedAt) < TTL) {
    /* v3.2.1 (#20-v2) — кэш-hit обязан заполнить СВЕЖИЕ плейсхолдеры: gantt-task-react
       ремаунтит список на каждый новый vm (useMemo([vm]) даёт новые типы компонентов),
       сбрасывая поканный текст в «Загрузка…»; ранний return без поков оставлял его
       навсегда до истечения TTL. Реплеим DOM-апдейты из кэша. */
    var cachedContainer = deps.getGanttContainer();
    if (cachedContainer) {
      ids.forEach(function (issueId) {
        if (cached[issueId]) deps.updateGanttHistDOM(cachedContainer, issueId, cached[issueId]);
      });
    }
    return;
  }
  /* Сброс: очищаем все issueId-записи, иначе processChunk пропустит их как «уже загруженные». */
  deps.state.setGanttStateHist({ _sprintKey: sprintKey, _fetchedAt: 0 });
  curStates = curStates || {};
  fieldId = fieldId || '';
  var CHUNK_SIZE = 25;

  function gsh() { return deps.state.getGanttStateHist(); }

  function processChunk(chunkIds) {
    return deps.host.fetchYouTrack('activities', { query: {
      categories: 'CustomFieldCategory',
      issueQuery: 'issue id: ' + chunkIds.join(', '),
      fields: 'timestamp,target(idReadable),field(id,name,presentation),' +
              'added(name,localizedName,color(background,foreground)),' +
              'removed(name,localizedName,color(background,foreground))',
      reverse: 'true',
      $top: 300
    }}).then(function (activities) {
      var container = deps.getGanttContainer();
      deps.diag('_fetchGanttStateHistory chunk=' + chunkIds.length + ' activities=' + (Array.isArray(activities) ? activities.length : typeof activities), 'ok');
      if (!Array.isArray(activities)) {
        chunkIds.forEach(function (issueId) {
          if (!gsh()[issueId]) {
            gsh()[issueId] = { sinceTs: null, prev: null, prevColor: null };
            if (container) deps.updateGanttHistDOM(container, issueId, gsh()[issueId]);
          }
        });
        return;
      }
      /* Идентификация нужного поля состояния:
         1) ПРИОРИТЕТ — по id поля (`field.id`): не локализуется, не коллизит с другими
            полями, работает для ЛЮБОГО типа (State/enum/owned/version). Универсально.
         2) Fallback (если id поля не дошёл из Слоя 1): по совпадению нового значения
            (added[0]) с текущим состоянием (curStates), иначе — по $type StateBundleElement.
         В YouTrack Activities API added/removed — МАССИВЫ, field.name ЛОКАЛИЗОВАН.
         reverse:true → берём первую (свежайшую) подходящую запись. */
      activities.forEach(function (act) {
        if (!act || !act.target) return;
        var issueId = act.target.idReadable;
        if (!issueId || gsh()[issueId]) return;
        var addedArr   = Array.isArray(act.added)   ? act.added   : (act.added   ? [act.added]   : []);
        var removedArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
        var addedVal   = addedArr[0]   || null;
        var removedVal = removedArr[0] || null;
        var sample     = addedVal || removedVal;
        if (!sample) return;
        var addedName  = addedVal ? (addedVal.localizedName || addedVal.name || '') : '';
        var cur        = curStates[issueId] || '';
        var actFieldId = (act.field && act.field.id) || '';
        var isStateChange = fieldId
          ? (actFieldId === fieldId)
          : (cur ? (addedName === cur) : (sample.$type === 'StateBundleElement'));
        if (!isStateChange) return;
        var prevName = removedVal ? (removedVal.localizedName || removedVal.name || '') : '';
        var prevC    = removedVal && removedVal.color ? removedVal.color : null;
        gsh()[issueId] = {
          sinceTs:   act.timestamp || null,
          prev:      prevName,
          prevColor: prevC ? { background: prevC.background || null, foreground: prevC.foreground || null } : null
        };
        if (container) deps.updateGanttHistDOM(container, issueId, gsh()[issueId]);
      });
      chunkIds.forEach(function (issueId) {
        if (!gsh()[issueId]) {
          gsh()[issueId] = { sinceTs: null, prev: null, prevColor: null };
          if (container) deps.updateGanttHistDOM(container, issueId, gsh()[issueId]);
        }
      });
    }).catch(function (e) {
      deps.diag('_fetchGanttStateHistory err: ' + String(e && e.message ? e.message : e), 'warn');
      var container2 = deps.getGanttContainer();
      if (container2) chunkIds.forEach(function (issueId) {
        if (!gsh()[issueId]) {
          var prevEl = container2.querySelector('[data-gantt-hist-prev="' + issueId + '"]');
          if (prevEl) prevEl.textContent = '';
        }
      });
    });
  }

  var p = Promise.resolve();
  for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
    (function (chunk) { p = p.then(function () { return processChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
  }
  p.then(function () { gsh()._fetchedAt = Date.now(); });
}

const api = {
  _backendCall,
  apiGet,
  apiPost,
  _fetchGanttStateHistory,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_YOUTRACK_API = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
