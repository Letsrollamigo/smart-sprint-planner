// @ts-check
/** Словари текстов: ru.js есть всегда, en.js — только там, где branding.languages его перечисляет. */

/** @param {string} lang */
export async function loadDictionary(lang) {
  const mod = await import(`./${lang}.js`);
  return /** @type {Record<string, unknown>} */ (mod.default);
}

/** @param {Record<string, unknown>} dict */
export function makeT(dict) {
  /** @param {string} key @param {Record<string, unknown>} [params] */
  return function t(key, params = {}) {
    /** @type {unknown} */
    let v = dict;
    for (const part of key.split('.')) {
      if (v && typeof v === 'object' && part in /** @type {Record<string, unknown>} */ (v)) v = /** @type {Record<string, unknown>} */ (v)[part];
      else return key;
    }
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (_, k) => (params[k] === undefined ? '{' + k + '}' : String(params[k])));
  };
}

/** Все ключи словаря (для теста полноты en относительно ru). @param {Record<string, unknown>} dict @param {string} [prefix] @returns {string[]} */
export function flatKeys(dict, prefix = '') {
  /** @type {string[]} */
  const out = [];
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object') out.push(...flatKeys(/** @type {Record<string, unknown>} */ (v), key));
    else out.push(key);
  }
  return out;
}
