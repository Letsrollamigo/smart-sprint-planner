/* widgets/main/src/pure/planning-model-pure.js
   Side-effect модуль: чистые функции маппинга «Модель планирования» (simple|light|full)
   ↔ тройка legacy-флагов (personalPlanningEnabled / usePersonalForResource /
   manualPersonalResource). Публикует window.__SSP_PLANNING_MODEL_PURE.

   planningModel — источник правды UI (v2.14.0). Расчёты и super-light читают legacy-флаги,
   поэтому форма пишет И planningModel, И derived-зеркало флагов (см. settings-form.collect).

   Каноническая таблица (PLANNING_MODEL_DROPDOWN_SPEC §2):
     simple        → { PP:false, useRes:false, manual:false }
     light + auto  → { PP:true,  useRes:true,  manual:false }
     light + manual→ { PP:true,  useRes:true,  manual:true  }
     full          → { PP:true,  useRes:true,  manual:false } (#45 R4 — ресурс из утверждённой
                      ёмкости спринта, read-only; capacityMode='full' деривируется в collect). */

var PLANNING_MODELS = ['simple', 'light', 'full'];

/* legacy-гибрид: PP включён, но авто-перенос суммы в общий ресурс выключен.
   Таких проектов чистый маппинг форсил бы useRes=true — sticky-legacy сохраняет false.
   PLANNING_MODEL_SHIM — снять, когда legacy-проекты вычистятся (≥2 minor). */
function isLegacyHybrid(settings) {
  var s = settings || {};
  return !!s.personalPlanningEnabled && !s.usePersonalForResource;
}

/* model + под-вариант → derived legacy-флаги.
   lightSub: 'auto' | 'manual' (актуально только при light).
   opts.legacyHybrid: при light не включать useRes насильно (sticky-legacy). */
function planningModelToFlags(model, lightSub, opts) {
  var o = opts || {};
  if (model === 'light') {
    return {
      personalPlanningEnabled: true,
      usePersonalForResource: o.legacyHybrid ? false : true,
      manualPersonalResource: lightSub === 'manual',
    };
  }
  if (model === 'full') {
    /* #45 R4 — Full форсит персональный расчёт + ресурс из утверждённой ёмкости (read-only). */
    return {
      personalPlanningEnabled: true,
      usePersonalForResource: true,
      manualPersonalResource: false,
    };
  }
  /* simple → персональный расчёт выключен. */
  return {
    personalPlanningEnabled: false,
    usePersonalForResource: false,
    manualPersonalResource: false,
  };
}

/* settings → { model, lightSub }. Источник — settings.planningModel; если его нет или
   он невалиден (старый снимок) — деривируем из legacy-флагов.
   PLANNING_MODEL_SHIM — fallback-деривацию снять, когда planningModel есть у всех. */
function planningModelFromSettings(settings) {
  var s = settings || {};
  var model = s.planningModel;
  if (PLANNING_MODELS.indexOf(model) < 0) {
    model = s.personalPlanningEnabled ? 'light' : 'simple';
  }
  return {
    model: model,
    lightSub: s.manualPersonalResource ? 'manual' : 'auto',
  };
}

var _api = {
  PLANNING_MODELS: PLANNING_MODELS,
  isLegacyHybrid: isLegacyHybrid,
  planningModelToFlags: planningModelToFlags,
  planningModelFromSettings: planningModelFromSettings,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_PLANNING_MODEL_PURE = _api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}
