/* widgets/main/src/i18n/plural.js
   CLDR-aware plural форматирование через Intl.PluralRules.
   Поддерживает one/two/few/many/other; fallback на 'other' если форма отсутствует. */

var _rulesCache = Object.create(null);

function getRules(lang) {
  var key = String(lang || 'en').toLowerCase();
  if (_rulesCache[key]) return _rulesCache[key];
  try {
    if (typeof Intl !== 'undefined' && Intl.PluralRules) {
      _rulesCache[key] = new Intl.PluralRules(key);
      return _rulesCache[key];
    }
  } catch (e) { /* unsupported locale → fallback ниже */ }
  _rulesCache[key] = null;
  return null;
}

/**
 * formatPlural(formsObject, count, lang) — выбирает форму по CLDR правилу.
 *
 * formsObject:
 *   {
 *     one:   '{n} файл',
 *     few:   '{n} файла',
 *     many:  '{n} файлов',
 *     other: '{n} файлов'
 *   }
 *
 * Если formsObject не объект (например, обычная string) — возвращается как есть.
 * Подстановка `{n}` или `{count}` на `count` (если присутствует в форме).
 */
export function formatPlural(formsObject, count, lang) {
  if (formsObject == null) return '';
  if (typeof formsObject === 'string') {
    return interpolate(formsObject, count);
  }
  if (typeof formsObject !== 'object') return String(formsObject);

  var rules = getRules(lang);
  var form = 'other';
  try {
    if (rules) {
      form = rules.select(typeof count === 'number' ? count : 0);
    }
  } catch (e) { /* стандартный fallback ниже */ }

  var picked = formsObject[form];
  if (typeof picked !== 'string') picked = formsObject.other;
  if (typeof picked !== 'string') {
    // Грубый fallback: первое строковое поле в объекте
    for (var k in formsObject) {
      if (Object.prototype.hasOwnProperty.call(formsObject, k) && typeof formsObject[k] === 'string') {
        picked = formsObject[k];
        break;
      }
    }
  }
  if (typeof picked !== 'string') return '';
  return interpolate(picked, count);
}

function interpolate(template, count) {
  if (typeof count !== 'number') return template;
  return template.replace(/\{n\}|\{count\}/g, String(count));
}

export function isPluralForms(value) {
  return value != null
    && typeof value === 'object'
    && (typeof value.other === 'string' || typeof value.one === 'string');
}
