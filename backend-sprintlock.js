/**
 * Smart Sprint Planner — Sprint-lock backend (#57-2, epic 57).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»): тумблер блокировки создания
 * новых спринтов в шапке планера. Require-ится в backend-project.js И backend-global.js;
 * endpoint-объекты дописывает в общий core.ENDPOINTS (тот же читает backend-global.js —
 * gotcha #7).
 *
 * Модель (⚖ владелец 2026-07-27): состояние — ssp_settings.blockSprintCreation (bool);
 * право переключать — членство в sprintLockGroups/Names («Управление правами», admin-тир;
 * канон isReleaseManager: deny-by-default + байпас инстанс-админа). Этот эндпоинт —
 * ЕДИНСТВЕННЫЙ писатель ключа: обычный settings-save preserve'ит хранимое значение
 * (анти-гонка). Enforcement создания — гейт в sprint-data (backend-core,
 * isNewSprintCreation): 403 sprint_creation_locked для НОВОГО sprintId при включённом локе.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; размер-чек до
 * setProp; reason-коды БЕЗ эха значений.
 */

var core = require('./backend-core.js');

var ALLOWED_SPRINT_LOCK_KEYS = ['locked'];

/* Валидация тела POST sprint-lock (unit-тест). */
function validateSprintLockBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i++) {
    if (ALLOWED_SPRINT_LOCK_KEYS.indexOf(keys[i]) < 0) return false;
  }
  return typeof body.locked === 'boolean';
}

core.ENDPOINTS.push(
  // ── GET /sprint-lock ───────────────────────────────────────────────────────
  // Состояние тумблера + право текущего юзера его переключать (фронт: серый при false).
  {
    scope: 'project',
    method: 'GET',
    path: 'sprint-lock',
    handle: function (ctx) {
      if (!core.authzGuard(ctx, 'viewer')) return;
      var s = core.parseJson(core.getProp(ctx, 'ssp_settings'), null);
      ctx.response.json({
        success: true,
        locked: !!(s && s.blockSprintCreation === true),
        canToggle: core.isSprintLockManager(ctx)
      });
    }
  },
  // ── POST /sprint-lock ──────────────────────────────────────────────────────
  // Переключение блокировки. Authz — ТОЛЬКО членство в sprintLockGroups (deny-by-default).
  {
    scope: 'project',
    method: 'POST',
    path: 'sprint-lock',
    handle: function (ctx) {
      if (!core.authzGuard(ctx, 'viewer')) return;
      if (!core.isSprintLockManager(ctx)) { core.forbidden(ctx, 'sprint_lock_rights_required'); return; }
      var body = core.parseBodyOrReject(ctx, ALLOWED_SPRINT_LOCK_KEYS);   /* лимит 2МБ + sanitizeDeep (v3.2.1) */
      if (body === null) return;
      if (!validateSprintLockBody(body)) { core.badRequest(ctx, 'invalid_sprint_lock_body'); return; }
      var s = core.parseJson(core.getProp(ctx, 'ssp_settings'), null) || {};
      s.blockSprintCreation = body.locked;
      var str = JSON.stringify(s);
      if (str.length > core.MAX_PROP_SIZE) { core.badRequest(ctx, 'settings_data_too_large'); return; }
      core.setProp(ctx, 'ssp_settings', str);
      ctx.response.json({ success: true, locked: body.locked });
    }
  }
);

/* Экспорт для unit-тестов (backend-project.js ре-экспортит модульные хелперы). */
Object.assign(exports, {
  validateSprintLockBody: validateSprintLockBody
});
