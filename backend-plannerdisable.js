/**
 * Smart Sprint Planner — Planner-disable backend (#80).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»): «Отключить планер в этом
 * проекте». Require-ится в backend-project.js И backend-global.js; endpoint-объект
 * дописывается в общий core.ENDPOINTS (тот же читает backend-global.js — gotcha #7).
 *
 * Модель (⚖ владелец 2026-08-26, вариант (а) карточки #80): состояние —
 * ssp_settings.plannerDisabled (bool); писатель — ТОЛЬКО этот эндпоинт (обычный
 * settings-save preserve'ит хранимое значение — анти-затирание формой, ожог #74);
 * право переключать — settingsManager (fail-closed: без настроенной группы authzGuard
 * отвечает plugin_not_configured; байпас инстанс-админа штатный).
 * Потребители флага: гейт filter-planner-projects и гейт global-делегирования
 * (backend-global.js, этот путь ЕДИНСТВЕННЫЙ exempt — иначе включить обратно нечем).
 * Workflow-правила флагом НЕ гейтятся (осознанно, карточка #80).
 *
 * GET не публикуется: в global-режиме видимость отключённого проекта в пикере уже
 * означает право включить (фильтр пикера), в project-режиме флаг приходит в settings
 * (sprint-data), а canManage — из check-settings-manager.
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; размер-чек до
 * setProp; reason-коды БЕЗ эха значений.
 */

var core = require('./backend-core.js');

var ALLOWED_PLANNER_DISABLE_KEYS = ['disabled'];

/* Валидация тела POST planner-disabled (unit-тест). */
function validatePlannerDisableBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i++) {
    if (ALLOWED_PLANNER_DISABLE_KEYS.indexOf(keys[i]) < 0) return false;
  }
  return typeof body.disabled === 'boolean';
}

core.ENDPOINTS.push(
  // ── POST /planner-disabled ─────────────────────────────────────────────────
  // Выключить/включить планер для проекта. Read-modify-write ОДНОГО ключа блоба.
  {
    scope: 'project',
    method: 'POST',
    path: 'planner-disabled',
    handle: function (ctx) {
      if (!core.authzGuard(ctx, 'settingsManager')) return;
      var body = core.parseBodyOrReject(ctx, ALLOWED_PLANNER_DISABLE_KEYS);   /* лимит 2МБ + sanitizeDeep */
      if (body === null) return;
      if (!validatePlannerDisableBody(body)) { core.badRequest(ctx, 'invalid_planner_disable_body'); return; }
      var s = core.parseJson(core.getProp(ctx, 'ssp_settings'), null) || {};
      if (body.disabled) s.plannerDisabled = true;
      else delete s.plannerDisabled;   /* включение чистит ключ — блоб без залежей */
      var str = JSON.stringify(s);
      if (str.length > core.MAX_PROP_SIZE) { core.badRequest(ctx, 'settings_data_too_large'); return; }
      core.setProp(ctx, 'ssp_settings', str);
      ctx.response.json({ success: true, disabled: !!body.disabled });
    }
  }
);

/* Экспорт для unit-тестов (backend-project.js ре-экспортит модульные хелперы). */
Object.assign(exports, {
  validatePlannerDisableBody: validatePlannerDisableBody
});
