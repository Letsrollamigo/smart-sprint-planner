/**
 * Smart Sprint Planner — «мои роли» (#113, v3.51.0).
 *
 * Per-feature backend-модуль (§11): GET my-roles — роли вызывающего в проекте для внешних
 * клиентов (нода n8n, агенты MCP). Своей модели прав нет: ответ собран из тех же предикатов
 * ядра, что гейтят запись (is* — членство в группах планера + байпас инстанс-админа, кроме
 * управления историей #66). Require-ится в backend-project.js И backend-global.js; endpoint
 * дописывается в общий core.ENDPOINTS (gotcha #7).
 *
 * GET в YouTrack — транзакция только на чтение: здесь ничего не пишется.
 */

var core = require('./backend-core.js');

function handleMyRoles(ctx) {
  if (!core.authzGuard(ctx, 'viewer')) return;
  ctx.response.json({
    success: true,
    configured: core.isSettingsManagerConfigured(ctx),
    disabled: core.isPlannerDisabled(core.parseJson(core.getProp(ctx, 'ssp_settings'), null)),
    instanceAdmin: core.isInstanceAdmin(ctx),
    roles: {
      editor: core.isEditor(ctx),
      assigner: core.isAssigner(ctx),
      validator: core.isValidator(ctx),
      historyManager: core.isHistoryManager(ctx),
      settingsManager: core.isSettingsManager(ctx),
      planningManager: core.isPlanningManager(ctx),
      releaseManager: core.isReleaseManager(ctx),
      releaseEngineer: core.isReleaseEngineer(ctx),
      sprintLockManager: core.isSprintLockManager(ctx)
    }
  });
}

if (core && core.ENDPOINTS && !core.__accessEndpointsRegistered) {
  core.ENDPOINTS.push({ scope: 'project', method: 'GET', path: 'my-roles', handle: handleMyRoles });
  core.__accessEndpointsRegistered = true;
}
