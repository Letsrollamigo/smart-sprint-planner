/**
 * Smart Sprint Planner — Phases backend (#120 «Фазы работ внутри спринта», v3.45.0).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»). Require-ится в backend-project.js
 * И backend-global.js (иначе глобальный режим отвечает invalid_action — сателлит не
 * зарегистрирован). Своих endpoint'ов нет: ядро (POST sprint-data) тонко делегирует ветку
 * `?action=phases` в handle() ДО своего rev-гейта и возвращается из хендлера — вся логика
 * baseRev живёт здесь.
 *
 * POST sprint-data?action=phases { sprint: { sprintId, phases }, baseRev } — единственный путь
 * записи фаз. Права editor ∨ validator (authzGuard 'editorOrValidator'). Проверки по порядку:
 * тумблер phasesEnabled (бэкенд = форма) → тело → форма фаз (core.phasesShapeError) → baseRev
 * числом → спринт найден (слот держит ИЛИ есть снимки <sid>_*) → не завершён (слот не держит
 * И все снимки FINISHED) → у спринта есть даты → сверка baseRev со слотом ТОЛЬКО если слот держит
 * этот спринт (иначе слот не читается на конфликт: редактируемый CONFIRMED/ALLOCATED спринт
 * живёт вне слота, а _mergeRetry фронта на ?action= не работает — 409 заморозил бы вкладку из-за
 * чужой правки ДРУГОГО спринта) → границы спринта только для фаз, изменившихся относительно
 * сохранённых (старая фаза за границей не блокирует правку другой, ⚖4).
 *
 * Запись: слот (если держит) + все снимки <sid>_* получают одинаковые phases/phasesUpdatedAt/
 * phasesUpdatedBy (штампует сервер: fullName || login, клиентскому не верим); статусы, agreed,
 * revisions, confirmedBy/At снимков не трогаются; rev слота +1 (только если держит), rev истории
 * bump (только если были снимки). Оба setProp — в одном запросе (одна транзакция YouTrack).
 * Ничего не изменилось (все шесть пар равны по dayMs) → changed:false без записи и без бампов.
 *
 * applyStored / applyStoredAll — серверная принадлежность фаз: любая другая запись спринта или
 * истории (POST sprint-data, POST history, ?action=snapshot) переопределяет три ключа входящего
 * объекта сохранённым состоянием; носителя нет (спринт впервые появляется в инстансе — импорт
 * истории в режиме добавления) → входящие принимаются после проверки формы валидатором ядра.
 * import-replace принимает входящие осознанно (восстановление бэкапа) — ядро его не зовёт.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; ошибки только через
 * core.badRequest/forbidden (кладут cid) — отказ с массивом errors собирается здесь тем же
 * конвертом + core.logRefusal; размер-чек до setProp; в ответ не попадают чужие логины.
 */

var core = require('./backend-core.js');

var PHASE_KEYS = core.PHASE_KEYS;
var dayMs = core.dayMs;

function baseSid(id) { return String(id).split('_')[0]; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* Все шесть ключей: null там, где пусто. Вход уже прошёл phasesShapeError. */
function normalize(phases) {
  var out = {};
  for (var i = 0; i < PHASE_KEYS.length; i++) {
    var p = phases && phases[PHASE_KEYS[i]];
    out[PHASE_KEYS[i]] = p ? { dateStart: p.dateStart, dateEnd: p.dateEnd } : null;
  }
  return out;
}

/* Пары равны по календарным дням (не-полуночные ms того же дня — та же пара). */
function samePair(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return dayMs(a.dateStart) === dayMs(b.dateStart) && dayMs(a.dateEnd) === dayMs(b.dateEnd);
}
function changedKeys(next, prev) {
  var out = [];
  for (var i = 0; i < PHASE_KEYS.length; i++) if (!samePair(next[PHASE_KEYS[i]], prev[PHASE_KEYS[i]])) out.push(PHASE_KEYS[i]);
  return out;
}

/* Носитель фаз для target: слот, если держит sid; иначе снимок с тем же ПОЛНЫМ sprintId, несущий
   ключ phases; иначе любой снимок базового sid с ключом phases; иначе null (носителя нет). */
function carrierFor(sid, slot, history, fullId) {
  if (slot && typeof slot === 'object' && slot.sprintId === sid) return slot;
  var recs = Array.isArray(history) ? history : [];
  var i, r;
  if (fullId) {
    for (i = 0; i < recs.length; i++) { r = recs[i]; if (r && r.sprintId === fullId && r.phases !== undefined) return r; }
  }
  for (i = 0; i < recs.length; i++) { r = recs[i]; if (r && typeof r.sprintId === 'string' && baseSid(r.sprintId) === sid && r.phases !== undefined) return r; }
  return null;
}

function copyPhaseKeys(target, src) {
  ['phases', 'phasesUpdatedAt', 'phasesUpdatedBy'].forEach(function (k) {
    if (src[k] === undefined) delete target[k]; else target[k] = src[k];
  });
}

/* Переопределить три ключа входящего объекта сохранённым состоянием (носитель есть) —
   иначе входящие остаются как есть. Мутирует target. */
function applyStored(target, sid, slot, history, fullId) {
  if (!target || typeof target !== 'object' || typeof sid !== 'string' || !sid) return target;
  var carrier = carrierFor(sid, slot, history, fullId);
  if (!carrier || carrier === target) return target;
  copyPhaseKeys(target, carrier);
  return target;
}
function applyStoredAll(records, slot, history) {
  if (!Array.isArray(records)) return records;
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (rec && typeof rec === 'object' && typeof rec.sprintId === 'string') applyStored(rec, baseSid(rec.sprintId), slot, history, rec.sprintId);
  }
  return records;
}

function refuse(ctx, reason, extra) {
  ctx.response.status = 400;
  var body = { success: false, error: 'Bad Request', reason: reason, cid: core.cid(ctx) };
  if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
  ctx.response.json(body);
  core.logRefusal(ctx, 400, reason);
}

function handle(ctx, body) {
  if (!core.authzGuard(ctx, 'editorOrValidator')) return;
  var settings = core.parseJson(core.getProp(ctx, 'ssp_settings'), null);
  if (!settings || settings.phasesEnabled !== true) { core.badRequest(ctx, 'phases_disabled'); return; }

  var sp = body && body.sprint;
  if (!sp || typeof sp !== 'object' || Array.isArray(sp)
      || typeof sp.sprintId !== 'string' || !sp.sprintId || sp.sprintId.length > 100
      || !sp.phases || typeof sp.phases !== 'object' || Array.isArray(sp.phases)) {
    core.badRequest(ctx, 'invalid_phases_body'); return;
  }
  var shapeErr = core.phasesShapeError(sp.phases);
  if (shapeErr) { core.badRequest(ctx, 'invalid_phases_structure:' + shapeErr); return; }
  if (!isNum(body.baseRev)) { core.badRequest(ctx, 'base_rev_required'); return; }

  var sid = sp.sprintId;
  var slot = core.parseJson(core.getProp(ctx, 'ssp_sprint'), null);
  var slotHolds = !!(slot && typeof slot === 'object' && slot.sprintId === sid);
  var history = core.parseJson(core.getProp(ctx, 'ssp_history'), []);
  if (!Array.isArray(history)) history = [];
  history = core.stripDeprecatedHistoryKeys(core.migrateHistoryArr(history));
  var snaps = history.filter(function (r) { return r && typeof r === 'object' && typeof r.sprintId === 'string' && baseSid(r.sprintId) === sid; });

  if (!slotHolds && !snaps.length) { core.badRequest(ctx, 'sprint_not_found'); return; }
  if (!slotHolds && snaps.every(function (s) { return s.status === 'FINISHED'; })) { core.badRequest(ctx, 'sprint_finished'); return; }
  var datesSrc = slotHolds ? slot : snaps.filter(function (s) { return isNum(s.dateStart) && isNum(s.dateEnd); })[0];
  if (!datesSrc || !isNum(datesSrc.dateStart) || !isNum(datesSrc.dateEnd)) { core.badRequest(ctx, 'sprint_dates_missing'); return; }

  var slotRev = 0, newSlotRev = null;
  if (slotHolds) {
    slotRev = isNum(slot._rev) ? slot._rev : 0;
    if (core.revConflict(ctx, body.baseRev, slotRev)) return;
    newSlotRev = slotRev + 1;
  }

  var stored = slotHolds ? slot : (snaps.filter(function (s) { return s.phases !== undefined; })[0] || null);
  var prev = normalize(stored && stored.phases);
  var next = normalize(sp.phases);
  var changed = changedKeys(next, prev);

  var errors = [];
  for (var i = 0; i < changed.length; i++) {
    var p = next[changed[i]];
    if (!p) continue;
    if (dayMs(p.dateStart) < dayMs(datesSrc.dateStart) || dayMs(p.dateEnd) > dayMs(datesSrc.dateEnd)) {
      errors.push({ phase: changed[i], code: 'phases_out_of_sprint', sprintDateStart: datesSrc.dateStart, sprintDateEnd: datesSrc.dateEnd });
    }
  }
  if (errors.length) { refuse(ctx, 'phases_out_of_sprint:' + errors[0].phase, { errors: errors }); return; }

  var resp = { success: true, action: 'phases', sprintId: sid, changed: changed.length > 0, phases: next,
    phasesUpdatedAt: stored ? (stored.phasesUpdatedAt || null) : null,
    phasesUpdatedBy: stored ? (stored.phasesUpdatedBy || null) : null, snaps: 0 };
  if (!changed.length) {
    if (slotHolds) resp.rev = slotRev;
    ctx.response.json(resp);
    return;
  }

  var now = Date.now();
  var cu = ctx.currentUser || {};
  var me = String(cu.fullName || cu.login || '');
  resp.phasesUpdatedAt = now;
  resp.phasesUpdatedBy = me;

  /* Валидация и размер — до любого setProp (анти-torn-write), затем обе записи подряд. */
  var slotStr = null, histStr = null;
  if (slotHolds) {
    slot = core.stripDeprecatedSprintKeys(slot);
    slot.phases = next; slot.phasesUpdatedAt = now; slot.phasesUpdatedBy = me;
    slot.pluginVersion = core.CURRENT_PLUGIN_VERSION;
    slot._rev = newSlotRev;
    if (!core.validateSprintForWrite(slot)) { core.badRequest(ctx, 'invalid_sprint_structure'); return; }
    slotStr = JSON.stringify(slot);
    if (slotStr.length > core.MAX_PROP_SIZE) { core.badRequest(ctx, 'sprint_data_too_large'); return; }
  }
  if (snaps.length) {
    for (var j = 0; j < snaps.length; j++) {
      snaps[j].phases = next; snaps[j].phasesUpdatedAt = now; snaps[j].phasesUpdatedBy = me;
      snaps[j].pluginVersion = core.CURRENT_PLUGIN_VERSION;
    }
    if (!core.validateHistoryForWrite(history)) { core.badRequest(ctx, 'invalid_history_structure'); return; }
    histStr = JSON.stringify(history);
    if (histStr.length > core.MAX_HISTORY_SIZE) { core.badRequest(ctx, 'history_data_too_large'); return; }
  }
  if (slotStr !== null) { core.setProp(ctx, 'ssp_sprint', slotStr); resp.rev = newSlotRev; }
  if (histStr !== null) { core.setProp(ctx, 'ssp_history', histStr); resp.historyRev = core.bumpSlotRev(ctx, 'ssp_history_rev'); resp.snaps = snaps.length; }
  try { console.log('[smart-sprint-planner] ' + core.cid(ctx) + ' phases: sid=' + sid + ' changed=[' + changed.join(',') + '] snaps=' + resp.snaps + ' by=' + String(cu.login || '')); } catch (e) { /* never throw */ }
  ctx.response.json(resp);
}

/* Самрегистрация на объекте ядра (образец core.__enrichRoleItems): ядро не require'ит сателлит
   (цикл), ветка action=phases и три точки applyStored зовут core.__phases. Идемпотентно. */
if (core && !core.__phases) core.__phases = { handle: handle, applyStored: applyStored, applyStoredAll: applyStoredAll, dayMs: dayMs };

/* Runtime + test-only exports. */
exports.handle = handle;
exports.applyStored = applyStored;
exports.applyStoredAll = applyStoredAll;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, { normalize: normalize, samePair: samePair, changedKeys: changedKeys, carrierFor: carrierFor, dayMs: dayMs, PHASE_KEYS: PHASE_KEYS });
}
