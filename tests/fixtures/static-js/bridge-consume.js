/* Фикстура tests/arch/static-js.test.js (W3). Обращения к несуществующим членам мостов здесь
   намеренные — по ним гейт доказывает, что умеет краснеть. Не исправлять. */
var VIEW = (typeof window !== 'undefined' && window.__FIX_VIEW) || {};
var ns = window.__FIX_NS__ || null;

/* Параметр с именем псевдонима — не мост: обращение через него гейт обязан пропустить. */
function shadowed(VIEW) { return VIEW.anything; }

window.__FIX_VIEW.lateBound = function () {};   // член, досаженный на мост снаружи, — известен

export default [
  VIEW.render,                   // есть
  VIEW.renderRenamed,            // нет в объекте издателя
  ns.alive,                      // есть
  ns.aliveRenamed,               // нет в экспортах модуля
  window.__FIX_VIEW.close,       // есть, обращение без псевдонима
  window.__FIX_VIEW.gone,        // нет, обращение без псевдонима
  window.__FIX_VIEW.lateBound,   // досажен выше
  window.__FIX_FLAG.toFixed,     // издатель — не объект
  window.__FIX_NOBODY.member,    // мост никто не публикует
  shadowed,
];
