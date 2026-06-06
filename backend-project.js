/**
 * Smart Sprint Planner — HTTP Handler (PROJECT scope)
 *
 * #25 Ф1 — тонкая обёртка. Вся логика вынесена в общее ядро backend-core.js
 * (runtime require). Публикует endpoints ядра под scope:'project' — поведение
 * идентично прежней монолитной версии. Парный handler — backend-global.js.
 */

var core = require('./backend-core.js');

/* Test-only re-export: unit-тесты делают require('./backend-project.js'). */
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(exports, core);
}

exports.httpHandler = { endpoints: core.ENDPOINTS };
