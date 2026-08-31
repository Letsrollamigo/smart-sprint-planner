/* widgets/main/src/refresh-merge-pure.js
   Side-effect модуль: чистое ядро слияния при «Обновить из задачи» (#35).
   Публикует window.__SSP_REFRESH_MERGE_PURE ДО исполнения IIFE core.js
   (паттерн как period-pure / sort-pure / hash-pure; импортируется в index.js раньше монолита).

   resolveRefreshMerge решает для ОДНОЙ задачи в контексте ОДНОЙ роли, что делать со
   свежими данными YouTrack относительно локального состояния и baseline-снимка. Оркестрация
   (батч, union ролей, выбор пользователя в модалке) — снаружи, в монолите.

   Field-class policy (#35 spec §2):
     • YT-зеркало (state/priority/xpriority/system/externalTicketId) — тянем из YT;
     • локально-планировочные (alloc/inclusion) — резолвер их не касается (не на входе);
     • пограничные (estimate/fact/assignee) — dirty-guard: тихо обновляем, если локально не
       трогали; эскалируем в conflicts, если есть несохранённая правка.

   Безопасные инварианты:
     • remote == null/undefined → НЕ трогаем локальное (YT не вернул значение — не затираем
       отсутствием данных). Это сознательное отличие от старого refreshRoleEstimates, который
       молча писал null.
     • зеркальные строковые поля пишем только если remote непустое — страховка на случай
       неидеального парсинга workflow-API формата на backend (см. #35 spec S1 risk);
     • пустой assignee из YT — факт только когда планер в это поле пишет (assigneeWritable). */

/* #92 — сравнение цвета состояния по значению ({background,foreground}|null); null/undefined
   считаются равными между собой. Идентичность объектов не годится: remote всегда новый. */
function _sameStateColor(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (a.background || null) === (b.background || null)
      && (a.foreground || null) === (b.foreground || null);
}

function _login(a) {
  if (a == null) return null;
  if (typeof a === 'string') return a || null;
  if (typeof a === 'object') return a.login || null;
  return null;
}

/* input = {
     issueId, roleKey,
     local:    { estimate, fact, state, stateLocalized, stateColor, stateFieldId,
                 priority, xpriority, system, externalTicketId, assignee },
     snapshot: { estimate, fact, assignee },   // baseline для dirty-детекции пограничных
     remote:   { estimate, fact, state, stateLocalized, stateColor, stateFieldId,
                 priority, xpriority, system, externalTicketId, assignee },  // нормализовано фронтом
     assigneeWritable: bool   // #102 — открыт ли канал записи исполнителя в YT (гейт 68-3); по умолчанию true
   }
   → { updates:{<field>:value}, assigneeUpdate:value|undefined, conflicts:[{issueId,roleKey,field,from,to}] }
     assigneeUpdate === undefined → не трогать; === null → снять исполнителя; иначе — новое значение. */
function resolveRefreshMerge(input) {
  input = input || {};
  var issueId = input.issueId, roleKey = input.roleKey;
  var local = input.local || {}, snap = input.snapshot || {}, remote = input.remote || {};
  var updates = {}, conflicts = [];
  var assigneeUpdate; /* undefined = не трогать */

  /* ── YT-зеркало: строковые enum/string поля ── */
  ['priority', 'xpriority', 'system', 'externalTicketId'].forEach(function (f) {
    var rv = remote[f];
    if (rv != null && rv !== '' && rv !== local[f]) updates[f] = rv;
  });

  /* ── YT-зеркало: state (комплекс name + localized + color + fieldId) ── */
  if (remote.state != null && remote.state !== '') {
    var stateChanged = remote.state !== local.state;
    if (stateChanged) updates.state = remote.state;
    if (stateChanged) {
      if (remote.stateLocalized !== undefined) updates.stateLocalized = remote.stateLocalized;
      if (remote.stateFieldId != null) updates.stateFieldId = remote.stateFieldId;
    }
    /* #92 — ЦВЕТ состояния назначается в проекте и задним числом: пишем его при любом
       расхождении, а не только при смене имени состояния — иначе поток, раскрашенный
       ПОСЛЕ набора состава, остаётся серым навсегда (класс v2.1.14 #20 «смена только
       State не считалась в changed»). Сравнение по значению — иначе каждый refresh
       рапортовал бы фантомные изменения. Прочие атрибуты (localized/fieldId) намеренно
       остаются на прежнем гейте: remote.stateLocalized тут всегда = имени состояния, а
       старые позиции его не хранят — «писать всегда» дало бы фантом на них (пойман
       голденом refresh-no-change). */
    if (remote.stateColor !== undefined && (stateChanged || !_sameStateColor(remote.stateColor, local.stateColor))) updates.stateColor = remote.stateColor;
  }

  /* ── Пограничные числовые: estimate, fact (dirty-guard) ── */
  ['estimate', 'fact'].forEach(function (f) {
    var rv = remote[f];
    if (rv == null) return;                 /* нет данных из YT — не трогаем */
    var lv = local[f] == null ? null : local[f];
    if (rv === lv) return;                  /* совпадает — no-op */
    var sv = snap[f] == null ? null : snap[f];
    if (lv === sv) updates[f] = rv;         /* локально не трогали — тихо обновляем */
    else conflicts.push({ issueId: issueId, roleKey: roleKey, field: f, from: lv, to: rv });
  });

  /* ── Пограничный assignee (сравнение по login; живёт вне item, в taskAssignments) ── */
  if (remote.assignee !== undefined) {
    var rLogin = _login(remote.assignee);
    var lLogin = _login(local.assignee);
    /* #102 — при закрытом канале записи (гейт 68-3 «Быстрая правка») поле роли в YT пустое
       ВСЕГДА: планер туда не пишет по построению. Пустота такого поля не значит «исполнителя
       сняли», и применять её — стирать работу пользователя. Непустое значение из YT по-прежнему
       подтягиваем: оно информативно и проходит тот же dirty-guard. */
    var remoteNullIsFact = input.assigneeWritable !== false || rLogin !== null;
    if (rLogin !== lLogin && remoteNullIsFact) {
      var sLogin = _login(snap.assignee);
      if (lLogin === sLogin) assigneeUpdate = remote.assignee; /* не dirty — тихо (включая снятие = null) */
      else conflicts.push({ issueId: issueId, roleKey: roleKey, field: 'assignee', from: lLogin, to: rLogin });
    }
  }

  return { updates: updates, assigneeUpdate: assigneeUpdate, conflicts: conflicts };
}

var _api = { resolveRefreshMerge: resolveRefreshMerge };

if (typeof window !== 'undefined') {
  try { window.__SSP_REFRESH_MERGE_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
