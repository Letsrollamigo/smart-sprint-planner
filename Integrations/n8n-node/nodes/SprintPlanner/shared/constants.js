// @ts-check
/** Общие константы сервера — fork-agnostic. Per-fork значения живут в branding.js. */

export const SERVER_NAME = 'sprint-planner-mcp';
/** Минимальная версия плагина (= версия контракта), под которую собран сервер. */
export const CONTRACT_MIN = '3.51.0';
/** Предел длины текстовой части ответа инструмента (символов). */
export const CHARACTER_LIMIT = 40000;

export const ROLE_KEYS = /** @type {const} */ (['analysis', 'testing', 'devPlatform', 'devBack', 'devFront', 'devIos', 'devAndroid', 'devFs', 'devDb']);
export const ROLE_LABELS = {
  ru: { analysis: 'Анализ', testing: 'Тестирование', devPlatform: 'Платформенная разработка', devBack: 'Разработка Back', devFront: 'Разработка Front', devIos: 'Разработка IOS', devAndroid: 'Разработка Android', devFs: 'Разработка FullStack', devDb: 'Разработка СУБД' },
  en: { analysis: 'Analysis', testing: 'Testing', devPlatform: 'Platform development', devBack: 'Dev Back', devFront: 'Dev Front', devIos: 'Dev iOS', devAndroid: 'Dev Android', devFs: 'Dev FullStack', devDb: 'Dev DB' }
};
export const SPRINT_STATUSES = /** @type {const} */ (['PLANNING', 'CONFIRMED', 'ALLOCATED', 'FINISHED']);
export const INCLUSION_STATUSES = /** @type {const} */ (['INC_PENDING', 'INC_PLANNED', 'INC_UNPLANNED', 'INC_EXCLUDED']);
export const ABSENCE_TYPES = /** @type {const} */ (['vacation', 'sick', 'out_of_membership', 'regional_holiday', 'training', 'teamleading', 'other']);
export const RELEASE_STATUSES = /** @type {const} */ (['planned', 'prep', 'work', 'released', 'cancelled']);
export const RELEASE_KINDS = /** @type {const} */ (['release', 'hotfix']);
export const RELEASE_SOURCES = /** @type {const} */ (['internal', 'vendor']);
export const PHASE_KEYS = /** @type {const} */ (['analysis', 'development', 'techTest', 'regression', 'bizTest', 'deploy']);

/** Пути контракта, к которым сервер вообще обращается (инвариант «исходящий HTTP только к контракту»). */
export const CONTRACT_PATHS = /** @type {const} */ ([
  'app-version', 'sprint-data', 'history', 'capacity', 'capacity-archive', 'calendar', 'absences',
  'releases', 'releases-archive', 'reminders', 'reminders-journal', 'sprint-lock', 'filter-planner-projects', 'my-roles'
]);

/** Лимиты списков в ответах чтения (вместо усечения по символам — предсказуемо для агента). */
export const LIMITS = { itemsPerRole: 200, history: 20, releases: 100, journal: 50, capacityArchive: 20 };
