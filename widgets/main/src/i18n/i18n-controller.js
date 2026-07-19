/**
 * i18n-controller.js — application-side i18n-обвязка монолита
 * (Фаза 5, зачистка «прочих» — слайс 8). Мост window.__SSP_I18N_CTRL.
 *
 * Наименее связный кластер «прочих» (2 callee: T + _doFullRerender; 0
 * cross-module callers — все вызовы внутри монолита: init-IIFE-бинды + render):
 *   • applyI18N() — обход DOM и применение T() к элементам с data-i18n*
 *     ([data-i18n] → text/placeholder/innerHTML с сохранением .ssp-icon;
 *     -title/-ph/-tooltip/-label варианты);
 *   • setLang(lang) — смена языка: _lang + localStorage(ssp_lang) + индикаторы
 *     langSel/langSelSettings; если словарь не inline (не EN/RU) — асинхронная
 *     подгрузка через _i18nBridge.loadDictionary → I18N[lang] → _doFullRerender;
 *     rollback на reject; иначе синхронный _doFullRerender;
 *   • _populateLangSelect(el) — заполнение <select> 15 языками из
 *     window.__SSP_I18N_LANGS__ (идемпотентно);
 *   • _syncProjectDefaultLang() — проброс _settings.defaultLang в loader
 *     (_i18nBridge.setProjectDefault), используется в getCurrentLang()-fallback.
 *
 * Слой application-side (ОТЛИЧАЕТСЯ от i18n-bridge.js — тот side-effect-инфра
 * ставит window.__SSP_I18N__ ДО старта IIFE). Здесь — контроллер, потребляющий
 * мост через deps.
 *
 * Паттерн (слайсы 2–7): deps-фабрика per-call (_i18nDeps в монолите). Стейт-
 * примитивы (_lang/I18N) и инфра (_i18nBridge/_doFullRerender/safeLs/_settings,
 * читаемые повсеместно) ОСТАЮТСЯ в стейт-ядре монолита за get/set-аксессорами
 * deps.state и прямыми ссылками. Все 4 функции — делегаторы в монолите (callers
 * внутренние init/render).
 *
 * Контракты — i18n.golden.test.js (через делегаторы applyI18N/setLang/
 * _populateLangSelect/_syncProjectDefaultLang).
 */
(function () {
  'use strict';

  /** Обходит все элементы с data-i18n и обновляет их текст/плейсхолдер.
   *  v1.9.6: сохраняет .ssp-icon дочерние узлы при обновлении textContent (смена языка). */
  function applyI18N(deps) {
    var T = deps.T;
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var val = T(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = val;
      } else {
        var iconChild = el.querySelector('.ssp-icon');
        if (iconChild) {
          // Обновляем только текстовый узел, сохраняя icon span
          var textNode = null;
          for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === Node.TEXT_NODE) { textNode = el.childNodes[i]; break; }
          }
          if (textNode) { textNode.textContent = ' ' + val; }
          else { el.appendChild(document.createTextNode(' ' + val)); }
        } else {
          el.textContent = val;
        }
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      el.title = T(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
      /* setAttribute, не el.placeholder: для span-хостов Ring Input (data-ssp-input-host)
         property — expando, а input-mount читает АТРИБУТ (и слушает его MutationObserver'ом).
         Для нативных input/textarea атрибут отражается в property — эквивалентно. */
      el.setAttribute('placeholder', T(el.getAttribute('data-i18n-ph')));
    });
    /* v5.1.0 — i18n для tooltip-атрибута (data-tooltip → ::after) */
    document.querySelectorAll('[data-i18n-tooltip]').forEach(function(el) {
      el.setAttribute('data-tooltip', T(el.getAttribute('data-i18n-tooltip')));
    });
    /* v2.0.0 D5-B — i18n для Ring Radio host-spans: пишет в dataset.label,
       MutationObserver в radio-mount.jsx подхватит и перерендерит метку. */
    document.querySelectorAll('[data-i18n-label]').forEach(function(el) {
      el.dataset.label = T(el.getAttribute('data-i18n-label'));
    });
    /* v5.10.0 — удалён мёртвый guard на renderDistribPanel + tab-distrib (оба удалены в v5.6.0). */
  }

  /** Переключить язык. Если для языка нет inline-словаря (то есть это не EN/RU),
      сначала асинхронно подгружает JSON через loader, затем выполняет полный rerender. */
  function setLang(lang, deps) {
    var st = deps.state;
    var prev = st.getLang();
    st.setLang(lang);
    deps.safeLs.set('ssp_lang', lang);
    /* Синк in-memory языка loader'а: react-мост (getCurrentSspLang) читает его
       как канон, без синка локаль DatePicker замирала бы на стартовом языке. */
    if (deps.i18nBridge && typeof deps.i18nBridge.setCurrentLang === 'function') deps.i18nBridge.setCurrentLang(lang);
    /* Обновить индикатор выбранного языка в переключателях (шапка + overlay-копия) */
    var sel = document.getElementById('langSel');
    if (sel) sel.value = lang;
    var sel2 = document.getElementById('langSelSettings');
    if (sel2) sel2.value = lang;

    /* Если словарь языка ещё не загружен — поднять его через loader, обновить I18N[lang],
       потом запустить rerender. Для EN/RU словарь уже inline'нут в I18N → rerender сразу. */
    if (!deps.I18N[lang] && deps.i18nBridge && typeof deps.i18nBridge.loadDictionary === 'function') {
      deps.i18nBridge.loadDictionary(lang).then(function (dict) {
        deps.I18N[lang] = dict || {};
        deps.doFullRerender();
      }).catch(function () {
        /* Не удалось загрузить → откатываемся на предыдущий язык, чтобы UI не остался полу-переведённым. */
        st.setLang(prev);
        deps.safeLs.set('ssp_lang', prev);
        if (deps.i18nBridge && typeof deps.i18nBridge.setCurrentLang === 'function') deps.i18nBridge.setCurrentLang(prev);
        if (sel) sel.value = prev;
        if (sel2) sel2.value = prev;
      });
      return;
    }
    deps.doFullRerender();
  }

  /* v1.1.0 — заполняет <select> 15 языками из window.__SSP_I18N_LANGS__.
     Опции в формате `🇪🇸 Español (es)`. Сортировка приходит уже из bridge'а
     (EN → RU → rest by ISO). Если уже содержит >2 опций — считаем заполненным
     (повторно дёргаем безопасно — операция идемпотентна). */
  function _populateLangSelect(el, deps) {
    if (!el) return;
    var langs = (typeof window !== 'undefined' && window.__SSP_I18N_LANGS__) || null;
    if (!langs || !langs.length) return;
    if (el.options && el.options.length === langs.length && el._sspPopulated) return;
    var prevValue = el.value;
    el.innerHTML = '';
    for (var i = 0; i < langs.length; i++) {
      var l = langs[i];
      var opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = (l.flag ? l.flag + ' ' : '') + l.native + ' (' + l.code + ')';
      el.appendChild(opt);
    }
    el._sspPopulated = true;
    if (prevValue) el.value = prevValue;
  }

  /* v1.1.0 — после загрузки _settings — синхронизируем project-default в loader.
     Loader использует это значение в getCurrentLang() цепочке fallback'ов. */
  function _syncProjectDefaultLang(deps) {
    var bridge = deps.i18nBridge;
    if (!bridge || typeof bridge.setProjectDefault !== 'function') return;
    var s = deps.state.getSettings();
    var v = (s && typeof s.defaultLang === 'string') ? s.defaultLang : '';
    bridge.setProjectDefault(v || null);
  }

  var api = {
    applyI18N: applyI18N,
    setLang: setLang,
    _populateLangSelect: _populateLangSelect,
    _syncProjectDefaultLang: _syncProjectDefaultLang,
  };
  if (typeof window !== 'undefined') window.__SSP_I18N_CTRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
