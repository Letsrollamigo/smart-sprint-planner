'use strict';
/* sprint-field-pure.js — #88 «ролевое поле спринта».

   У крупной команды из нескольких ролей, живущей в ОДНОМ проекте, поле «Спринт»
   может быть своё у каждой роли. Настройка перестала быть общей: имя поля берётся
   из ролевого ключа fieldSprint<Роль>, а если он пуст — из общего fieldSprint.
   Значение живёт так же: карта sprint.sprintFieldValByRole с фолбэком на плоский
   sprint.sprintFieldVal. Оба фолбэка держат обратную совместимость: у настроек и
   спринтов до 3.35.0 ролевых ключей нет, и они читаются ровно как раньше.

   Модуль знает только про данные — ни DOM, ни транспорта, ни стейта; проверяется
   юнитами (tests/unit/sprint-field.test.js). Потребители: вводные спринта,
   таблица ролей в настройках, снимок роли в истории и запись в задачу.

   Публикует window.__SSP_SPRINT_FIELD_PURE. */

function _trimStr(v) {
  return (typeof v === 'string' && v.trim()) ? v.trim() : '';
}

/* Имя поля «Спринт» для роли: ролевое → общее → пусто (поле не настроено). */
function fieldNameFor(settings, role) {
  if (!settings || !role) return '';
  var own = role.sprintField ? _trimStr(settings[role.sprintField]) : '';
  return own || _trimStr(settings.fieldSprint);
}

/* Значение поля «Спринт» для роли: своё → общее → пусто.
   Общее берём ТОЛЬКО если роль пишет в общее поле. Иначе значение из чужого бандла
   подставилось бы в ролевой список и уехало бы в задачу как несуществующее —
   ровно тот случай, когда рабочую копию открыли по снимку одной роли, а у остальных
   поля свои. settings/role необязательны: без них поведение прежнее (падаем на общее). */
function valueFor(sprint, rk, settings, role) {
  if (!sprint) return '';
  var m = sprint.sprintFieldValByRole;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    var own = _trimStr(m[rk]);
    if (own) return own;
  }
  if (settings && role && role.sprintField) {
    var rf = _trimStr(settings[role.sprintField]);
    if (rf && rf !== _trimStr(settings.fieldSprint)) return '';
  }
  return _trimStr(sprint.sprintFieldVal);
}

/* Разошлись ли поля у ролей-участниц. Вводные показывают ОДИН список, пока ответ
   «нет» — проекты, живущие как сегодня, экрана не замечают (⚖ владелец 2026-09-03);
   строка на роль появляется только при расхождении. Роли без настроенного поля в
   расчёт не берём: они не создают выбора. */
function fieldsDiverge(settings, roles) {
  var seen = '';
  for (var i = 0; i < (roles || []).length; i++) {
    var f = fieldNameFor(settings, roles[i]);
    if (!f) continue;
    if (!seen) seen = f;
    else if (f !== seen) return true;
  }
  return false;
}

/* Кратность поля YouTrack закодирована прямо в типе: enum[1] против version[*]
   (проверено на стенде 2025.3). Многозначное поле спринта запрещено осознанно
   (⚖ владелец 2026-09-03): присваивание значения ЗАМЕНИЛО бы список целиком, а
   растягивание задачи на пачку спринтов и так против методологии. Тип без явной
   кратности (period, string, date) одиночный. */
function isSingleValueType(type) {
  var t = _trimStr(type).toLowerCase();
  if (!t) return false;
  return t.indexOf('[*]') < 0;
}

/* План записи в задачи для роли — [] означает «писать нечего»: выключено, поле не
   настроено, значение не выбрано или в составе нет активных задач. Пустой план —
   штатный тихий исход, а не ошибка. */
function writePlan(items, activeInc, fieldName, value) {
  if (!fieldName || !value) return [];
  var inc = activeInc || [];
  var out = [];
  (items || []).forEach(function (i) {
    if (!i || !i.issueId) return;
    if (inc.indexOf(i.inclusionStatus) < 0) return;
    out.push({ issueId: i.issueId, fieldName: fieldName, value: value });
  });
  return out;
}

var api = {
  fieldNameFor: fieldNameFor,
  valueFor: valueFor,
  fieldsDiverge: fieldsDiverge,
  isSingleValueType: isSingleValueType,
  writePlan: writePlan,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
try { if (typeof window !== 'undefined') window.__SSP_SPRINT_FIELD_PURE = api; } catch (_) { /* sandboxed write may throw */ }
