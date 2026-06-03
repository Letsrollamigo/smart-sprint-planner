/* widgets/main/src/enum-locale-pure.js
   B7 — locale-aware DISPLAY значений enum-полей (Priority / State / X-Priority).
   Чистые функции + мапа стандартных значений; публикует window.__SSP_ENUM_PURE
   ДО исполнения IIFE legacy-monolith.js (паттерн как toast-pure/period-pure).

   dispEnum(s, isRu) принимает флаг локали ПАРАМЕТРОМ → функция чистая; текущий язык
   (_lang) инъектирует тонкий делегатор в монолите. Только display — logic-поля
   (item.state в DTA/снапшотах/Ганте, ранги сортировки) не затрагиваются. */

var _enumLocaleMap = {
  'Normal':'Обычная','Minor':'Незначительный','Major':'Значительный',
  'Critical':'Критическая','Blocker':'Блокирующий','High':'Высокий','Low':'Низкий',
  'Open':'Открыта','In Progress':'В работе','Resolved':'Решена',
  'Won\'t fix':'Не будет исправлена','Duplicate':'Дубликат','Fixed':'Исправлена',
  'Submitted':'Отправлена','Reopened':'Переоткрыта','Obsolete':'Устаревшая','Verified':'Проверена',
};
var _enumLocaleMapInverse = (function(){ var inv = {}; for (var k in _enumLocaleMap) { if (!(_enumLocaleMap[k] in inv)) inv[_enumLocaleMap[k]] = k; } return inv; })();

/* EN→RU для стандартных значений (на RU-UI YT и так отдаёт RU, но восстановит маппинг). */
function localizeEnumVal(s) { if (!s) return s; return _enumLocaleMap[s] || s; }

/* Display-резолвер: на RU — как localizeEnumVal; иначе — инверсная мапа RU→канон-EN,
   кастомные/немапленные значения остаются как есть. */
function dispEnum(s, isRu) { if (!s) return s; return isRu ? localizeEnumVal(s) : (_enumLocaleMapInverse[s] || s); }

if (typeof window !== 'undefined') {
  window.__SSP_ENUM_PURE = { localizeEnumVal: localizeEnumVal, dispEnum: dispEnum };
}
