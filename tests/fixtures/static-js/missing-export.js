/* Фикстура tests/arch/static-js.test.js (X3). Обращения к несуществующим экспортам здесь
   намеренные — по ним гейт доказывает, что умеет краснеть. Не исправлять. */
'use strict';

var core = require('../../../backend-core.js');

/* Параметр с именем модуля — не модуль: обращение через него гейт обязан пропустить. */
function shadowed(core) { return core.notAnExportButNotTheModule; }

module.exports = [
  core.parseJson,                                        // настоящий экспорт
  core.noSuchExport,                                     // экспорта нет
  core.__loadFlag,                                       // флаг загрузки — вне проверки
  require('../../../backend-core.js').alsoMissing,       // экспорта нет, обращение без псевдонима
  shadowed,
];
