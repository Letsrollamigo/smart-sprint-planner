/**
 * Smart Sprint Planner — Оперативная отчётность backend (#50 S1).
 *
 * Per-feature backend-модуль (§11 «фича бэка = свой модуль»): держит backend-core.js от
 * роста + изолирует домен отчётности. Require'ится в backend-project.js И backend-global.js;
 * свои endpoint-объекты ДОПИСЫВАЕТ в общий core.ENDPOINTS массив (оба handler-файла читают
 * именно его — иначе global-режим 404, gotcha #7). Экспорт через Object.assign(exports,…)
 * для unit-тестов.
 *
 * D8 (арх-спека §4): тяжёлое чтение истории (activities) — на ФРОНТЕ под правами юзера
 * (native rights-scoping YT), backend НЕ реплеит activities. Роль этого модуля (S1):
 *   GET reporting-access — серверный гейт членства в reporting-группе (US-ACC-04): фронт
 *   скрывает узлы дерева/секцию по ответу, но право проверяется на бэке.
 * Дальше (A10 — S7): snapshot-diff поверх ssp_history. Чтение/запись настроек отчётности —
 * общий core settings-handler (ключи reporting* в ALLOWED/ADMIN_TIER whitelist).
 *
 * ИНВАРИАНТЫ БЕЗОПАСНОСТИ — см. шапку backend-core.js: authzGuard первым; reason-коды без
 * эха значений. Fork-agnostic (без namespace-суффиксов, как capacity/release).
 */

var core = require('./backend-core.js');

/* S1 — reporting-access: серверная проверка членства (US-ACC-04). GET=viewer (auth); в
   ответе — флаги контуров A/B (B⊇A вшито в core.isReportingViewerA). Сам факт доступа не
   секрет (как check-editor / check-instance-admin); чувствительные ДАННЫЕ отчётов режет YT
   по правам юзера на фронтовом чтении (D8), не этот флаг. */
function handleGetReportingAccess(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  ctx.response.json({
    success: true,
    a: core.isReportingViewerA(ctx),
    b: core.isReportingViewerB(ctx)
  });
}

var REPORTING_ENDPOINTS = [
  { scope: 'project', method: 'GET', path: 'reporting-access', handle: handleGetReportingAccess }
];

/* Самрегистрация в ОБЩИЙ core.ENDPOINTS (оба handler-файла читают его — gotcha #7).
   Идемпотентно: guard на core-объекте защищает от двойного push в shared-контексте. */
if (core && core.ENDPOINTS && !core.__reportingEndpointsRegistered) {
  for (var ei = 0; ei < REPORTING_ENDPOINTS.length; ei++) core.ENDPOINTS.push(REPORTING_ENDPOINTS[ei]);
  core.__reportingEndpointsRegistered = true;
}

/* Runtime + test-only exports. */
exports.REPORTING_ENDPOINTS = REPORTING_ENDPOINTS;
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, {
    handleGetReportingAccess: handleGetReportingAccess
  });
}
