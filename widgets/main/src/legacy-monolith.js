(function () {
  'use strict';

  /* ═══ Константы (латинские enum-коды, синхрон с backend ROLE_KEYS / STATUS_CODES / INC_CODES) ═══════════ */
  var INC = {
    PENDING:   'INC_PENDING',
    PLANNED:   'INC_PLANNED',
    UNPLANNED: 'INC_UNPLANNED',
    EXCLUDED:  'INC_EXCLUDED'
  };
  var ACTIVE_INC = [INC.PLANNED, INC.UNPLANNED];

  /* Локализованные подписи статусов и inclusion-статусов.
     Логика и storage оперируют латинскими кодами; UI получает локализацию через T(). */
  function statusLabel(code) {
    if (!code) return '';
    return T('status_' + code) || code;
  }
  function incLabel(code) {
    if (!code) return '';
    return T('inc_' + code) || code;
  }
  /** v5.0.1 — локализованная подпись роли. Storage оперирует role.key (латинским),
   *  отображение — через i18n T('role.<key>'); fallback на labelEn/label для совместимости. */
  function roleLabel(role) {
    if (!role) return '';
    var t = T('role.' + role.key);
    if (t !== 'role.' + role.key) return t;
    return (_lang === 'en' && role.labelEn) ? role.labelEn : (role.label || role.key);
  }

  /* Defensive миграция: на случай, если из storage прилетит старая русская строка
     (backend уже мигрирует на чтении, это второй слой защиты). */
  /* Legacy→canonical миграция статусов/включений/грейдов вынесена в
     widgets/main/src/migrate-pure.js (window.__SSP_MIGRATE_PURE) — паттерн как
     PERIOD_PURE/sort-pure. Здесь — тонкие делегаторы (call-sites без изменений,
     hoisting сохранён). MIGRATE_PURE используется также _migrateGrade/_migrateKpeObject. */
  var MIGRATE_PURE = (typeof window !== 'undefined' && window.__SSP_MIGRATE_PURE) || {};
  function migrateStatus(v) { return MIGRATE_PURE.migrateStatus(v); }
  function migrateInc(v)    { return MIGRATE_PURE.migrateInc(v); }

  /* v6.1.0 D70 — safe localStorage wrapper для production iframe без allow-same-origin.
     В sandboxed iframe `localStorage` exists как объект (typeof === 'object'), но любой
     доступ к свойствам выбрасывает SecurityError — typeof-guard НЕ помогает. Все access
     должны быть через try/catch. Этот wrapper унифицирует все 20 callsite'ов. */
  var safeLs = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* v6.1.0 D81 (F4) — multi-key sort: XPriority desc → Priority desc → ID asc.
     Primary key переключается циклом 'off' → 'xpriority' → 'priority' → 'id' → 'off'.
     State persistит в safeLs.ssp_sortKey. Применяется к renderRoleComposition,
     renderCurrentRoleTaskTable, renderGanttChart.
     v1.2.0 P0 (Bug #4): in-memory memo на случай, когда localStorage заблокирован
     в YT iframe — get/setItem молча падают с SecurityError, get возвращает null,
     getSortKey всегда даёт 'off' → визуально «сортировка не работает». Memo
     гарантирует консистентность state в пределах сессии независимо от storage. */
  var SORT_KEYS_CYCLE = ['off', 'xpriority', 'priority', 'id', 'system', 'externalTicketId', 'assignee'];
  var _sortKeyMemo = null;
  function getSortKey() {
    if (_sortKeyMemo !== null) return _sortKeyMemo;
    var v = safeLs.get('ssp_sortKey');
    _sortKeyMemo = SORT_KEYS_CYCLE.indexOf(v) >= 0 ? v : 'off';
    return _sortKeyMemo;
  }
  function setSortKey(k) {
    if (SORT_KEYS_CYCLE.indexOf(k) < 0) k = 'off';
    _sortKeyMemo = k;
    safeLs.set('ssp_sortKey', k);
  }
  var SORT_PURE = (typeof window !== 'undefined' && window.__SSP_SORT_PURE) || {};
  /* #35 — чистое ядро слияния «Обновить из задачи» (refresh-merge-pure.js). */
  var REFRESH_MERGE_PURE = (typeof window !== 'undefined' && window.__SSP_REFRESH_MERGE_PURE) || {};
  /* #36 — share-параметры из URL, считанные ОДИН раз на init (consumed в _loadAndRenderProject). */
  var _pendingShareParams = null;
  /* #36 — guard авто-синка state→URL: выключен во время init-restore (иначе _applyActiveProject
     затёр бы sprintId из ссылки до его применения); включается в конце init-хвоста. */
  var _urlSyncEnabled = false;
  /* Multi-key task sort — чистые компараторы живут в sort-pure.js (window.__SSP_SORT_PURE),
     юнит-тестируются изолированно. IIFE владеет состоянием сортировки: getSortKey()
     резолвит активный primary-ключ, когда вызывающий его опускает. */
  function multiKeySort(items, primary, taMap) {
    return SORT_PURE.multiKeySort(items, primary || getSortKey(), taMap);
  }
  /* v6.2.1 D98 — sort полностью в th таблиц задач. globalSortToggle в шапке удалён.
     При клике на th[data-sort-key]: toggle между этим ключом и 'off'. */
  function _rerenderAllSortableTables() {
    Object.keys(_uiExpandedRoles || {}).forEach(function(rk) {
      if (_uiExpandedRoles[rk] && typeof renderRoleComposition === 'function') {
        try { renderRoleComposition(rk); } catch(_){}
      }
    });
    try { if (typeof renderCurrentRoleTaskTable === 'function') renderCurrentRoleTaskTable(); } catch (_) {}
    try { if (typeof renderGanttChart === 'function') renderGanttChart(); } catch (_) {}
  }
  /* v1.2.0 P0 (Bug #4): event delegation на document — устойчиво к re-render thead.
     Раньше handlers вешались поэлементно через th.addEventListener, и после каждого
     thead.innerHTML = '...' DOM-узлы пересоздавались. Идемпотентный флаг _sspSortBound
     помогал только если повторный _bindSortHeaders успевал выполниться до клика; при
     любом сбое в render-цикле sort-headers выглядели нерабочими. Один document-level
     listener покрывает все 3 callsite (composition × 2 + people distribution). */
  var _sortDelegated = false;
  function _bindSortHeaders(thead) {
    if (_sortDelegated) return;
    _sortDelegated = true;
    document.addEventListener('click', function(e) {
      var t = e.target;
      var th = (t && typeof t.closest === 'function') ? t.closest('th[data-sort-key]') : null;
      if (!th) return;
      var k = th.getAttribute('data-sort-key');
      if (!k) return;
      var cur = getSortKey();
      setSortKey(cur === k ? 'off' : k);
      _rerenderAllSortableTables();
    });
  }
  /* Гарантируем установку document-listener при загрузке IIFE: ленивый bind
     зависел от первого вызова render-функции, а до открытия sprint их может не
     быть. Самовызов идемпотентен через _sortDelegated. */
  _bindSortHeaders();


  /* ═══════════════════════════════════════════════════════════
     I18N — Multi-language (15 langs in v1.1.0).
     Inlined dictionaries (EN+RU) и loader API живут в window.__SSP_I18N__,
     поставленном из widgets/main/src/index.js до загрузки этой IIFE.
     T(key) — возвращает перевод текущего языка с fallback на EN, затем RU.
     applyI18N() — обходит DOM и обновляет элементы с data-i18n.
     setLang(lang) — асинхронно подгружает словарь, потом rerender.
  ═══════════════════════════════════════════════════════════ */
  var _i18nBridge = (typeof window !== 'undefined' && window.__SSP_I18N__) || null;
  var _i18nDicts  = (typeof window !== 'undefined' && window.__SSP_I18N_DICTS__) || { en: {}, ru: {} };

  /* Словари по языкам. EN+RU inlined в bundle (через index.js bridge), остальные
     13 загружаются по требованию через _i18nBridge.loadDictionary(lang) и записываются
     в этот же объект. T(key) сначала смотрит в I18N[_lang], затем в I18N.en, затем в I18N.ru, иначе key. */
  var I18N = {
    en: (_i18nDicts && _i18nDicts.en) || {},
    ru: (_i18nDicts && _i18nDicts.ru) || {}
  };

  /* Cтартовый язык — единая цепочка из loader.getCurrentLang(): localStorage.ssp_lang
     ⊃ ssp_settings.defaultLang ⊃ navigator.language ⊃ DEFAULT_LANG (en, v1.3.1).
     projectDefault (ssp_settings.defaultLang) подставляется loader.setProjectDefault()
     позже, после загрузки настроек — но если localStorage пуст и он уже установлен,
     getCurrentLang() учтёт его в той же цепочке. */
  var _lang = _i18nBridge ? _i18nBridge.getCurrentLang() : (safeLs.get('ssp_lang') || 'en');

  /** Возвращает перевод для текущего языка с fallback на EN, потом RU, потом сам key. */
  function T(key) {
    var d = I18N[_lang] || {};
    if (d[key] !== undefined) return d[key];
    if (I18N.en && I18N.en[key] !== undefined) return I18N.en[key];
    if (I18N.ru && I18N.ru[key] !== undefined) return I18N.ru[key];
    return key;
  }
  /* v2.0.0 D125 D4 — expose T to React mount-points (datepicker translations etc.). */
  try { window.__SSP_T = T; } catch(_) {}

  /** Plural-форматирование через CLDR-engine (Intl.PluralRules внутри). Если plural-engine
     не доступен — возвращает строку как есть. */

  /* ═══════════════════════════════════════════════════════════
     ICONS — Ring UI ярус 1 (v1.9.6). SVG-иконки из @jetbrains/icons +
     наш loader.svg. Поставлены через window.__SSP_ICONS (аналог i18n-bridge).
     icon(name, ariaLabel, opts) → HTMLSpanElement с инлайн-SVG.
  ═══════════════════════════════════════════════════════════ */
  var ICONS = (typeof window !== 'undefined' && window.__SSP_ICONS) || {};

  function icon(name, ariaLabel, opts) {
    opts = opts || {};
    var svg = ICONS[name];
    if (!svg) {
      console.warn('[ssp] missing icon: ' + name);
      var empty = document.createElement('span');
      empty.className = 'ssp-icon ssp-icon--missing';
      empty.setAttribute('data-icon-name', name);
      return empty;
    }
    var wrap = document.createElement('span');
    wrap.className = 'ssp-icon' +
      (opts.size ? ' ssp-icon--' + opts.size : '') +
      (opts.cls  ? ' ' + opts.cls : '');
    wrap.innerHTML = svg;
    if (ariaLabel) {
      wrap.setAttribute('role', 'img');
      wrap.setAttribute('aria-label', ariaLabel);
    } else {
      wrap.setAttribute('aria-hidden', 'true');
    }
    return wrap;
  }

  /** v1.9.9 — Ring UI Tier 2: applies ring-variables_dark-dark to <html> to enable
   *  Ring CSS dark-mode vars. Mirrors body.theme-dark / data-theme="dark" detection.
   *  Called once on init and watched for dynamic theme switches. */
  function applyRingTheme() {
    var isDark = document.body.classList.contains('theme-dark') ||
                 document.body.getAttribute('data-theme') === 'dark' ||
                 (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('ring-variables_dark-dark');
    } else {
      document.documentElement.classList.remove('ring-variables_dark-dark');
    }
  }
  if (typeof MutationObserver !== 'undefined') {
    var _ringThemeObserver = new MutationObserver(applyRingTheme);
    _ringThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }
  if (window.matchMedia) {
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyRingTheme); } catch (_) {}
  }

  /** Sweep по элементам с data-icon="..." — вставляет SVG-иконку и проставляет aria-label.
   *  Вызывается один раз при init после DOMContentLoaded. */
  function applyIcons() {
    document.querySelectorAll('[data-icon]').forEach(function(el) {
      var iconName = el.getAttribute('data-icon');
      var ariaKey  = el.getAttribute('data-aria-label-key');
      var ariaLabel = ariaKey ? T(ariaKey) : (el.getAttribute('aria-label') || '');
      var iconNode = icon(iconName, '', { cls: 'btn-icon' });
      // v1.9.6 polish: spacing icon<->text via flex gap (parent) or summary margin-right.
      el.insertBefore(iconNode, el.firstChild);
      if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
      el.removeAttribute('data-icon');
      el.removeAttribute('data-aria-label-key');
    });
  }

  /** #43 W2 (B-2/D-1) — CTA статических empty-state'ов (index.html, data-ssp-cta).
   *  focus-sprint — фокус на селектор спринта в шапке/рельсе;
   *  goto-roles   — переключение на уровень «Роли» (planning-level state-tracker);
   *  open-settings — programmatic click по #openSettingsBtn (видимость CTA
   *  синхронизируется с серверной проверкой в renderPlanningRoles). */
  function bindEmptyStateCtas() {
    document.querySelectorAll('[data-ssp-cta]').forEach(function(btn) {
      if (btn._sspCtaBound) return;
      btn._sspCtaBound = true;
      var kind = btn.getAttribute('data-ssp-cta');
      btn.addEventListener('click', function() {
        if (kind === 'focus-sprint') {
          var sel = document.getElementById('widgetSprintSel');
          if (sel) {
            try { sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { sel.scrollIntoView(); }
            try { sel.focus(); } catch (_) {}
          }
        } else if (kind === 'goto-roles') {
          var lvl = document.querySelector('.planning-level-btn[data-level="roles"]');
          if (lvl) lvl.click();
        } else if (kind === 'open-settings') {
          var sBtn = document.getElementById('openSettingsBtn');
          if (sBtn) sBtn.click();
        }
      });
    });
  }

  /** Обёртка для async-действий кнопки: показывает Ring LoaderInline, блокирует повторный клик,
   *  восстанавливает исходное состояние через .finally().
   *  v2.0.0 D125 Phase D3: делегирует в window.__SSP_LOADER (Ring LoaderInline).
   *  Fallback на legacy SVG-spinner оставлен на случай если React-bridge не успел инициализироваться. */
  function withLoader(btn, asyncFn) {
    if (!btn) return asyncFn();
    var bridge = window.__SSP_LOADER;
    if (bridge && typeof bridge.attach === 'function') {
      bridge.attach(btn);
      return asyncFn().finally(function() { bridge.detach(btn); });
    }
    var origDisabled = btn.disabled;
    btn.disabled = true;
    var origIcon = btn.querySelector('.ssp-icon');
    var loader = document.createElement('span');
    loader.className = 'ssp-loader';
    loader.innerHTML = ICONS['loader'] || '';
    if (origIcon) {
      origIcon.replaceWith(loader);
      var restore = function() { loader.replaceWith(origIcon); btn.disabled = origDisabled; };
    } else {
      var prevSib = document.createTextNode(' ');
      btn.appendChild(prevSib);
      btn.appendChild(loader);
      var restore = function() { prevSib.remove(); loader.remove(); btn.disabled = origDisabled; };
    }
    return asyncFn().finally(restore);
  }

  /** Initial mount spinner — показываем если первая загрузка занимает >500ms. */

  /* ═══ i18n-обвязка вынесена в i18n-controller.js (Фаза 5, зачистка «прочих» —
     слайс 8) за мост window.__SSP_I18N_CTRL; golden — i18n.golden.test.js (через
     делегаторы applyI18N/setLang/_populateLangSelect/_syncProjectDefaultLang).
     Deps-фабрика per-call: стейт-примитивы (_lang/I18N) и инфра (_i18nBridge/
     _doFullRerender/safeLs/_settings, читаемые повсеместно) остаются в стейт-ядре
     за get/set-аксессорами. Все 4 — делегаторы (callers внутренние init/render).
     Слой application-side; i18n-bridge.js — отдельная side-effect-инфра (ставит
     window.__SSP_I18N__ ДО старта IIFE). ═══ */
  var I18N_CTRL = (typeof window !== 'undefined' && window.__SSP_I18N_CTRL) || {};
  function _i18nDeps() {
    return {
      T: T,
      doFullRerender: _doFullRerender,
      safeLs: safeLs,
      I18N: I18N,
      i18nBridge: _i18nBridge,
      state: {
        getLang: function () { return _lang; },
        setLang: function (v) { _lang = v; },
        getSettings: function () { return _settings; },
      },
    };
  }
  function applyI18N() { return I18N_CTRL.applyI18N(_i18nDeps()); }

  /** v1.9.6 — icon-aware text setter: обновляет только текстовый узел кнопки, сохраняя .ssp-icon. */
  function setButtonText(btn, text) {
    var iconEl = btn.querySelector('.ssp-icon');
    if (!iconEl) { btn.textContent = text; return; }
    for (var i = 0; i < btn.childNodes.length; i++) {
      if (btn.childNodes[i].nodeType === Node.TEXT_NODE) {
        btn.childNodes[i].textContent = ' ' + text;
        return;
      }
    }
    btn.appendChild(document.createTextNode(' ' + text));
  }

  function setLang(lang) { return I18N_CTRL.setLang(lang, _i18nDeps()); }

  function _populateLangSelect(el) { return I18N_CTRL._populateLangSelect(el, _i18nDeps()); }

  /* v1.1.0 — заполняет defaultLangSel (settings overlay) 15 ISO-опциями + первая
     "inherit-from-user" (value=""). Идемпотентно. */

  function _syncProjectDefaultLang() { return I18N_CTRL._syncProjectDefaultLang(_i18nDeps()); }

  /* v1.4.1 D126 — пере-применить локализованный префикс T('labelProject') к шапке.
     До v1.4.1 projectNameLabel.textContent выставлялся один раз (на register/load)
     и оставался stale при смене языка. Теперь _doFullRerender дёргает это, и шапка
     перерисовывается синхронно с другими динамическими областями. Безопасно вызывать
     раньше, чем _projectDisplayName заполнен — функция в этом случае no-op. */
  function _updateProjectNameLabel() {
    if (!_projectDisplayName) return;
    var lbl = document.getElementById('projectNameLabel');
    if (lbl) lbl.textContent = T('labelProject') + _projectDisplayName;
  }

  /* v1.4.1 D127 — Custom localized date picker: вынесен в
     widgets/main/src/datepicker-bridge.js (Фаза 5 слайс E3) за мост
     window.__SSP_DP_BRIDGE (НЕ __SSP_DATEPICKER — это React-мост Ring
     DatePicker'ов таблиц). Интерфейс кластера чисто DOM-овый (document-level
     capture-листенеры на input[data-ssp-datepicker] + синтетические
     input/change) — делегаторов в монолите нет. install — в той же точке
     init, где зона регистрировала листенеры; deps late-binding (язык —
     в момент рендера). */
  if (typeof window !== 'undefined' && window.__SSP_DP_BRIDGE) {
    window.__SSP_DP_BRIDGE.install({
      T: function (key) { return T(key); },
      esc: function (s) { return esc(s); },
      getLang: function () { return _lang; }
    });
  }


  function _doFullRerender() {
    applyI18N();
    /* v2.0.0 D6 — refresh Ring Tabs labels на смене языка. */
    try { if (typeof _mountTabsAndSync === 'function') _mountTabsAndSync(); } catch (_) {}
    /* v2.1.0 F1+F2+F3 — mount Ring Input/Select/Collapse hosts (idempotent). */
    try { if (window.__SSP_INPUT)    window.__SSP_INPUT.mountAllIn(document); } catch (_) {}
    try { if (window.__SSP_SELECT)   window.__SSP_SELECT.mountAllIn(document); } catch (_) {}
    try { if (window.__SSP_COLLAPSE) window.__SSP_COLLAPSE.mountAllIn(document); } catch (_) {}
    _updateProjectNameLabel();
    /* v1.3.1 — после applyI18N status-bar показывает локализованный
       on/off лейбл для своих 4 chip'ов. */
    try { _refreshFeatureStatusBar(); } catch(_){}
    /* v6.3.1 D118 — ре-рендер ВСЕХ динамических областей. Раньше вызывалась только
       устаревшая `renderPlannerRoles` (удалена в v5.6.0) → большая часть динамического
       контента (accordion-карточки, таблицы, Гант, шапка виджета) оставалась с
       прежними строками; перевод применялся только после ручной смены вкладки. */
    try { if (typeof renderWidgetHeader === 'function') renderWidgetHeader(); } catch(_){}
    try { if (typeof renderPlanningRoles === 'function') renderPlanningRoles(); } catch(_){}
    /* Перерендер уже раскрытых ролей (composition table'ы). */
    try {
      Object.keys(_uiExpandedRoles || {}).forEach(function(rk) {
        if (_uiExpandedRoles[rk] && typeof renderRoleComposition === 'function') {
          try { renderRoleComposition(rk); } catch(_){}
        }
      });
    } catch(_){}
    try { if (typeof renderCurrentRoleTaskTable === 'function') renderCurrentRoleTaskTable(); } catch(_){}
    try { if (typeof renderCurrentRoleAssigneeTable === 'function') renderCurrentRoleAssigneeTable(); } catch(_){}
    try { if (typeof renderGanttChart === 'function') renderGanttChart(); } catch(_){}
    try { if (typeof renderHistory === 'function') renderHistory(); } catch(_){}
    /* Subtab-метки «Аллокация общего ресурса» / «Распределение по исполнителям» —
       обновятся через applyI18N (data-i18n атрибуты). */
    if (typeof refreshDirtyIndicator === 'function') refreshDirtyIndicator();
  }

  var STATUS = {
    PLANNING:  'PLANNING',
    CONFIRMED: 'CONFIRMED',
    ALLOCATED: 'ALLOCATED',
    FINISHED:  'FINISHED'
  };

  var PAGE_SIZE = 25, PICK_PAGE = 10, HIST_PAGE = 10;

  /* ═══ Типы ролей (порядок и ключи жёсткие) ════════════════
     v6.3.1 D119 — добавлен labelEn для каждой роли. Раньше roleLabel(role) читал
     role.labelEn (которого не было) и всегда возвращал русский label независимо
     от _lang. Теперь смена языка корректно отображает роли в EN. */
  var ALL_ROLES = [
    { key: 'analysis',   label: 'Анализ',               labelEn: 'Analysis',     fieldEst: 'fieldAnalysis',     fieldFact: 'fieldFactAnalysis',
      resKey: 'resourceAnalysis', remKey: 'remainAnalysis',    userField: 'userFieldAnalysis' },
    { key: 'testing',    label: 'Тестирование',          labelEn: 'Testing',      fieldEst: 'fieldTesting',      fieldFact: 'fieldFactTesting',
      resKey: 'resourceTesting',  remKey: 'remainTesting',     userField: 'userFieldTesting' },
    { key: 'devPlatform', label: 'Платформенная разработка', labelEn: 'Platform development', fieldEst: 'fieldDevPlatform', fieldFact: 'fieldFactDevPlatform',
      resKey: 'resourceDevPlatform', remKey: 'remainDevPlatform', userField: 'userFieldDevPlatform' },
    { key: 'devBack',    label: 'Разработка Back',       labelEn: 'Dev Back',     fieldEst: 'fieldDevBack',      fieldFact: 'fieldFactDevBack',
      resKey: 'resourceDevBack',  remKey: 'remainDevBack',     userField: 'userFieldDevBack' },
    { key: 'devFront',   label: 'Разработка Front',      labelEn: 'Dev Front',    fieldEst: 'fieldDevFront',     fieldFact: 'fieldFactDevFront',
      resKey: 'resourceDevFront', remKey: 'remainDevFront',    userField: 'userFieldDevFront' },
    { key: 'devIos',     label: 'Разработка IOS',        labelEn: 'Dev iOS',      fieldEst: 'fieldDevIos',       fieldFact: 'fieldFactDevIos',
      resKey: 'resourceDevIos',   remKey: 'remainDevIos',      userField: 'userFieldDevIos' },
    { key: 'devAndroid', label: 'Разработка Android',    labelEn: 'Dev Android',  fieldEst: 'fieldDevAndroid',   fieldFact: 'fieldFactDevAndroid',
      resKey: 'resourceDevAndroid', remKey: 'remainDevAndroid', userField: 'userFieldDevAndroid' },
    { key: 'devFs',      label: 'Разработка FullStack',  labelEn: 'Dev FullStack', fieldEst: 'fieldDevFullstack', fieldFact: 'fieldFactDevFullstack',
      resKey: 'resourceDevFs',    remKey: 'remainDevFs',       userField: 'userFieldDevFs' },
    { key: 'devDb',      label: 'Разработка СУБД',       labelEn: 'Dev DB',       fieldEst: 'fieldDevDb',        fieldFact: 'fieldFactDevDb',
      resKey: 'resourceDevDb',    remKey: 'remainDevDb',       userField: 'userFieldDevDb' },
  ];

  /* Получить активные роли из настроек */
  function getActiveRoles(settingsObj) {
    var s = settingsObj || _settings;
    if (!s || !s.activeRoles || !s.activeRoles.length) return [];
    return ALL_ROLES.filter(function(r){ return s.activeRoles.indexOf(r.key) >= 0; });
  }

  /* ═══ Состояние ════════════════════════════════════════════ */
  var _host, _ctx, _settings = null, _projectFields = [], _projectGroups = [];
  /* #25 Ф1 — режим виджета. 'project' (PROJECT_SETTINGS) или 'global' (MAIN_MENU_ITEM,
     проект выбирается в picker'е шапки). Backend-роутинг ветвится по _mode. */
  var _mode = 'project';
  var _activeProjectKey = null;
  var _globalProjects = [];
  var _NO_PROJECT_SENTINEL = { __noProject__: true };
  var _sprint = null;
  /* v5.2.0 — guard для overlimit-модала: ключ "<rk>:<sprintId>" → bool */
  var _overlimitModalShownFor = {};
  // _items теперь хранится по ролям: { roleKey: [items] }
  var _roleItems = {};
  var _history = [];
  /* ═══ v5.4.0 — Общий контекст спринта (Этап 2) ═══
     _currentSprintId — id «логического спринта» виджета (соответствует _sprint.sprintId
     для активного и любому уникальному <sprintId> из _history для исторических).
     Источник истины для шапки виджета (.widget-header) и всех вкладок.
     Сохраняется в ui.currentSprintId через _draftSet('ui', ...).
     При null — empty-state шапки (только кнопка «+ Новый спринт»). */
  var _currentSprintId = null;
  /* ═══ v5.5.0 — Этап 3: state единой вкладки «Планирование» ═══
     _planningLevel — текущий уровень детализации внутри tab-planning ('roles'|'people'|'gantt').
     Сохраняется в ui.planningLevel через _draftSet('ui', ...).
     _dirtyRoleKeys — map roleKey -> true для ролей с несохранёнными правками
     personalPlanning[roleKey]; используется для soft-warn модала при смене роли в «Людях». */
  var _planningLevel = 'roles';
  var _dirtyRoleKeys = Object.create(null);
  /* ═══ v5.3.0 — working copies (immutable snapshots model, D3/b) ═══
     _workingDrafts хранит мутабельные копии валидированных снимков.
     Базовый _history[i] остаётся неизменным до явной ре-валидации.
     Persistence через бэкенд (apiPost/apiGet 'working-drafts'), debounced 300мс.
     Multi-user: бэкенд возвращает полную карту, клиент видит чужие drafts (для
     pill «Уже редактирует {who}» и cross-user lock на кнопке «Открыть на правку»). */
  var _workingDrafts            = {};     // { '<sprintId>_<roleKey>': workingDraft }
  var _workingDraftsDirty       = false;
  var _workingDraftsLoaded      = false;
  var _activeWorkingDraftKey    = null;   // если != null — идёт правка working copy
  var _thisTabToken             = (typeof crypto !== 'undefined' && crypto.randomUUID)
                                    ? crypto.randomUUID()
                                    : ('tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
  var _currentUser = null, _isValidator = false, _isEditor = false;
  /* v1.4.1 D125 — кэш display-имени проекта. Заполняется на YTApp.register
     (из _ctx.project.name|shortName) и на loadProjectFields (из r.projectName).
     Нужен, чтобы _doFullRerender мог пере-применить локализованный префикс
     T('labelProject') при смене языка — до v1.4.1 projectNameLabel ставился
     один раз и оставался stale. */
  var _projectDisplayName = '';
  /* v6.1.0 D82 (F5) — assigner-роль (variant b: assignee + start/end-dates). */
  var _isAssigner = false;
  /* v2.0.0 Phase D3 — Singleton promise для async permission checks.
     Решает race condition: critical click-handlers (Gantt reassign и т.п.) могут
     выстрелить до того как checkXxxNow().then() обновит _isEditor/_isValidator/_isAssigner.
     Pre-existing baseline: D2 baseline тоже подвержен race, но +1.4KB LoaderInline в D3
     сдвинул timing и сделал race наблюдаемой. Future-proof для D4-D7 яруса 3. */
  var _permissionsCheckPromise = null;
  var _histPage = 1;
  var _selectedIds = new Set(); /* Phase 4 #32: _pickPage/_pickResults/_pickHasMore переехали в React-стейт pickPicker */
  /* v5.0.3 — кэш метаданных всех загруженных страниц текущего запроса
     (по idReadable → issue meta). Накапливается при пагинации и при select-all. */
  var _pickAllResults = new Map();
  var _pickQueryFingerprint = '';
  var _pickAllInFlight = false;
  var MAX_PICK_TOTAL = 1000;
  var _currentPickRole = null;
  /* _pendingDelHist / _pendingFinishHist removed — overlays migrated to openModal() (Phase 1 #32). */
  var _diagLines = [];
  var _enableDebugLog = false;
  var _activeSubtab = null;
  // v5.0.1 — состояние settings-overlay (multi-select групп). Объявлено в основной
  // state-секции вместо локального скоупа SETTINGS OVERLAY, чтобы избежать TypeError
  // "Cannot set properties of undefined (setting 'ids')" если applySettingsUI
  // вызывается из необычной точки или JS-runtime YouTrack ведёт себя неожиданно.
  var _valGroupsState        = { ids: [], names: [] };
  var _editGroupsState       = { ids: [], names: [] };
  /* v6.1.0 D82 (F5) — assigner-роль. */
  var _settingsLoaded  = false;

  var _ytBase = (function() {
    try {
      if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
        return window.location.ancestorOrigins[0];
      }
    } catch(e) { /* ignore */ }
    try {
      var ref = document.referrer || '';
      var rm = ref.match(/^(https?:\/\/[^\/]+)/);
      if (rm) return rm[1];
    } catch(e) { /* ignore */ }
    try {
      var href = window.location.href || '';
      var hm = href.match(/^(https?:\/\/[^\/]+)/);
      if (hm) return hm[1];
    } catch(e) { /* ignore */ }
    return '';
  })();

  function _ytBaseFromProject() {
    if (!_ytBase) {
      try {
        var su = (typeof YTApp !== 'undefined' && YTApp.serverUrl) ? YTApp.serverUrl : null;
        if (su) { var sm = su.match(/^(https?:\/\/[^\/]+)/); if (sm) { _ytBase = sm[1]; } }
      } catch(e) { /* ignore */ }
    }
  }

  /* ═══ Утилиты ══════════════════════════════════════════════ */
  /** Экранирование для безопасной вставки в HTML-контент и атрибуты.
   * Экранирует: & < > " ' — предотвращает XSS в контексте тегов и атрибутов. */
  /* Чистые DOM-free утилиты (esc/safeUrl/uid/deepClone/_formatHoursLight) вынесены
     в widgets/main/src/util-pure.js (window.__SSP_UTIL_PURE) — паттерн как
     PERIOD_PURE/sort-pure. Делегаторы; call-sites и hoisting сохранены.
     UTIL_PURE используется также deepClone/_formatHoursLight ниже по файлу. */
  var UTIL_PURE = (typeof window !== 'undefined' && window.__SSP_UTIL_PURE) || {};
  function esc(s)       { return UTIL_PURE.esc(s); }
  function safeUrl(url) { return UTIL_PURE.safeUrl(url); }
  function uid()        { return UTIL_PURE.uid(); }

  /* Форматирование/парсинг периодов вынесено в widgets/main/src/period-pure.js
     (window.__SSP_PERIOD_PURE) — паттерн как TOAST_PURE/sort-pure.
     Здесь — тонкие делегаторы: call-sites без изменений, function-декларации
     сохраняют hoisting. Единицы локали резолвятся внутри модуля через window.__SSP_T. */
  var PERIOD_PURE = (typeof window !== 'undefined' && window.__SSP_PERIOD_PURE) || {};
  function fmtPeriod(m)    { return PERIOD_PURE.fmtPeriod(m); }
  function fmtHours(m)     { return PERIOD_PURE.fmtHours(m); }
  function fmtHoursOnly(m) { return PERIOD_PURE.fmtHoursOnly(m); }
  function parsePeriod(s)  { return PERIOD_PURE.parsePeriod(s); }

  /* B7 enum-locale DISPLAY вынесено в widgets/main/src/enum-locale-pure.js
     (window.__SSP_ENUM_PURE) — паттерн как PERIOD_PURE/TOAST_PURE. Делегаторы;
     текущий язык _lang инъектируется в dispEnum. Только display — logic-поля
     (item.state в DTA/снапшотах/Ганте, ранги) не затрагиваются. */
  var ENUM_PURE = (typeof window !== 'undefined' && window.__SSP_ENUM_PURE) || {};
  function localizeEnumVal(s) { return ENUM_PURE.localizeEnumVal(s); }
  function dispEnum(s) { return ENUM_PURE.dispEnum(s, _lang === 'ru'); }

  /* Тир B — фабрики modal-спеков (WC-семейство, closeWc, confirmGoal, dynField,
     importReplace) вынесены в widgets/main/src/modal-specs.js
     (window.__SSP_MODAL_SPECS) — паттерн как PERIOD_PURE/UTIL_PURE. Делегаторы
     у мест исходных деклараций: call-sites и hoisting без изменений; T/openModal
     и downstream-колбэки инъектируются на вызове. Golden-контракты колбэков —
     tests/golden/modal-specs.golden.test.js. */
  var MODAL_SPECS = (typeof window !== 'undefined' && window.__SSP_MODAL_SPECS) || {};

  /* Тир B — Excel-экспорт (AOA-билдеры спринта и конфликта) вынесен в
     widgets/main/src/excel-export.js (window.__SSP_EXCEL_EXPORT). Делегаторы
     собирают deps на вызове (живые ссылки ALL_ROLES/ACTIVE_INC + сервисы);
     XLSX остаётся глобалом (vendored, lazy-load). Golden-оракул —
     tests/golden/excel.golden.test.js (capture-стаб XLSX). */
  var EXCEL_EXPORT = (typeof window !== 'undefined' && window.__SSP_EXCEL_EXPORT) || {};
  function _excelDeps() {
    return {
      t: T, toast: toast, diag: diag, loadXLSXLib: loadXLSXLib,
      allRoles: ALL_ROLES, activeInc: ACTIVE_INC,
      fmtDate: fmtDate, fmtDT: fmtDT, fmtPeriod: fmtPeriod, fmtHours: fmtHours,
      statusLabel: statusLabel, roleLabel: roleLabel, incLabel: incLabel, dispEnum: dispEnum,
    };
  }

  /* Date-хелперы вынесены в widgets/main/src/date-pure.js (window.__SSP_DATE_PURE) —
     паттерн как PERIOD_PURE. Делегаторы; все чистые (fmtDate/fmtDT — локаль ru-RU).
     toDateIn — локальное время (прежний UTC-дубль удалён). */
  var DATE_PURE = (typeof window !== 'undefined' && window.__SSP_DATE_PURE) || {};
  function toDateIn(ts)  { return DATE_PURE.toDateIn(ts); }
  function fromDateIn(s) { return DATE_PURE.fromDateIn(s); }
  function fmtDate(ts)   { return DATE_PURE.fmtDate(ts); }
  function fmtDT(ts)     { return DATE_PURE.fmtDT(ts); }

  /* v1.9.11 / #32 Phase 6c — тост-обвязка (Ring alertService + legacy DOM
     fallback, очередь ≤3, click-anchor позиционирование, ARIA): вынесена в
     widgets/main/src/toast-ring.js (Фаза 5 слайс E3) за мост
     window.__SSP_TOAST_RING; pure-хелперы — по-прежнему toast-pure.js
     (__SSP_TOAST_PURE). install(deps) на init возвращает toastApi и публикует
     window.__SSP_TOAST; deps late-binding { T, diag } — читаются в момент
     вызова (gm.set/recording-стабы голденов подхватываются). */
  var toastApi = (typeof window !== 'undefined' && window.__SSP_TOAST_RING)
    ? window.__SSP_TOAST_RING.install({
        T: function (key) { return T(key); },
        diag: function (msg, level) { return diag(msg, level); }
      })
    : {};

  /* Backward-compat для 107 существующих call-sites toast(msg, type). */
  function toast(msg, type) {
    var t = (type || 'info');
    var fn = toastApi[t] || toastApi.info;
    return fn(msg);
  }

  /* Легаси-модал-фасад B-32 (открытие/закрытие .overlay, модальный стек,
     focus trap, scroll lock, MutationObserver-detach, одноимённый глобал,
     pure-хелперы modal-pure.js) демонтирован при декомпозиции:
     .overlay-элементов в DOM не осталось (#32 Phase 6), потребителей у
     фасада не было — все модалки на __SSP_RING_MODAL
     (см. tests/golden/modal-facade.golden.test.js). */
  /* Phase 1 #32 — декларативный spec-API поверх __SSP_RING_MODAL.
     Возвращает { close(), update(partial) }. Fallback — no-op (Ring не подключён). */
  function openModal(spec) {
    if (window.__SSP_RING_MODAL) return window.__SSP_RING_MODAL.open(spec);
    return { close: function() {}, update: function() {} };
  }


  /* ═══════════════════════════════════════════════════════════
     v5.0.3 — Локальный черновик в localStorage
     ═══════════════════════════════════════════════════════════
     Сохраняем несохранённые изменения в localStorage с debounce 800ms.
     При F5/перезагрузке восстанавливаем. Кнопка «🧹 Очистить черновик»
     в шапке для принудительного сброса. Бейдж «Несохранённые изменения»
     + подсветка изменённых строк таблицы. Backend не задействован. */
  var DRAFT_VERSION = 1;
  /* v5.5.0 — D38 (упрощённая реализация): единая точка истины версии в JS-коде.
     Поднимать вместе с manifest.json/version при каждом релизе (правило проекта
     синхронности значений между manifest и кодом). Полное автоподтягивание из
     manifest через backend endpoint app-version реализовано в v5.6.0 (D40, см. _loadAppVersion);
     APP_VERSION остаётся как runtime-fallback при cache miss / network error.
     v6.0.0: бампить здесь синхронно с manifest.json/version, backend-project.js и widgets[0].description.
     common/version.js — placeholder для полного извлечения при конвертации IIFE→module. */
  var APP_VERSION = '2.5.6';

  /* v2.5.6-decomp (Тир D слайс 6): per-assignee палитра v5.7.0 (D47) и её резолвер
     сняты как доказуемо мёртвые — цвет полос Ганта с v2.1.14 идёт из родного
     stateColor задачи YT; серый fallback остаётся (Гант + история состояний #20). */
  var ASSIGNEE_FALLBACK_COLOR = '#9aa3ad'; /* серый — для нераспределённых задач */

  /* v5.6.0 — D40, закрывает KL#3 v5.4.0 полностью.
     TTL-кеш в localStorage.ssp_app_version_cache (5 мин). Cache hit → синхронная
     подстановка. Cache miss / истёк / повреждён → синхронный fallback на runtime
     APP_VERSION + async apiGet('app-version'). При network error / 404 — fallback остаётся. */
  function _loadAppVersion() {
    var badge = document.getElementById('appVersionBadge');
    if (!badge) return;
    var TTL_MS = 5 * 60 * 1000;
    var nowTs = Date.now();
    /* Cache hit (синхронно) */
    var raw = safeLs.get('ssp_app_version_cache');
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version && parsed.ts && (nowTs - parsed.ts) < TTL_MS) {
          badge.textContent = 'v' + parsed.version;
          return;
        }
      } catch(_){}
    }
    /* Synchronous fallback на runtime const, async update из backend */
    badge.textContent = 'v' + APP_VERSION;
    if (typeof apiGet !== 'function') return;
    try {
      apiGet('app-version').then(function(resp){
        var v = resp && resp.version;
        if (!v) return;
        badge.textContent = 'v' + v;
        safeLs.set('ssp_app_version_cache', JSON.stringify({ version: v, ts: Date.now() }));
      }, function(err){
        diag('loadAppVersion fetch err (fallback to APP_VERSION): '+(err&&err.message?err.message:err), 'warn');
      });
    } catch(e) { diag('loadAppVersion sync err: '+e, 'err'); }
  }
  var _baseRevHash = '';
  var _serverSnapshotSprint    = null;
  var _serverSnapshotRoleItems = null;
  var _serverSnapshotCurrentRolePP    = null;
  var _serverSnapshotCurrentRoleGantt = null;
  var _draftRestoreInProgress = false;

  /* v5.0.3 — серверный черновик (через GET/POST /draft).
     YouTrack iframe sandboxed без allow-same-origin → localStorage недоступен.
     Поэтому используем единый объект `_draft` в памяти, синхронизируемый с backend
     через debounced POST. Структура: { meta, ui, sprint, roleItems, distrib, dirty }.
     На init: GET /draft заполняет _draft. Любое изменение помечает _draftPending=true,
     debounced flush отправляет всё одним POST. */
  var _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
  var _draftPending = false;

  /* ═══ Persistence-инфра черновиков и working copies ═══════════
     Вынесено в draft-store.js (Фаза 5 слайс 3, коммит Б) за мост
     window.__SSP_DRAFT_STORE; golden-контракты — draft-store.golden.test.js
     (идут через эти делегаторы; _workingDraftsFlushNow — golden-вход).
     Deps-фабрика per-call: стейт черновика и working copies остаётся в
     стейт-ядре монолита (его пишут init-restore и _resetProjectStateCaches,
     читают gm-хук голденов и deps-фабрики других модулей); модуль ходит
     get/set-аксессорами в момент обращения. Таймеры flush 300мс и
     debounce 800мс уехали в приватный стейт модуля. Внутренние
     _draftDel/_draftScheduleFlush/syncWorkingDraftFromMemory приватны
     модулю — внешних вызовов в монолите нет. */
  var DRAFT_STORE = (typeof window !== 'undefined' && window.__SSP_DRAFT_STORE) || {};
  function _draftStoreDeps() {
    return {
      T: T, toast: toast, diag: diag,
      apiGet: apiGet, apiPost: apiPost,
      safeLs: safeLs, deepClone: deepClone,
      allRoles: ALL_ROLES, draftVersion: DRAFT_VERSION,
      renderWidgetHeader: renderWidgetHeader,
      renderWorkingCopyBanner: renderWorkingCopyBanner,
      refreshDirtyIndicator: refreshDirtyIndicator,
      state: {
        getDraft: function () { return _draft; },
        setDraft: function (d) { _draft = d; },
        getDraftPending: function () { return _draftPending; },
        setDraftPending: function (b) { _draftPending = b; },
        getDraftRestoreInProgress: function () { return _draftRestoreInProgress; },
        getWorkingDrafts: function () { return _workingDrafts; },
        setWorkingDrafts: function (m) { _workingDrafts = m; },
        getWorkingDraftsDirty: function () { return _workingDraftsDirty; },
        setWorkingDraftsDirty: function (b) { _workingDraftsDirty = b; },
        getWorkingDraftsLoaded: function () { return _workingDraftsLoaded; },
        setWorkingDraftsLoaded: function (b) { _workingDraftsLoaded = b; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        getActiveSubtab: function () { return _activeSubtab; },
        getThisTabToken: function () { return _thisTabToken; },
        getHistory: function () { return _history; },
        getSprint: function () { return _sprint; },
        getRoleItems: function () { return _roleItems; },
        getBaseRevHash: function () { return _baseRevHash; },
        /* raw-сеттер (как state.setCurrentSprintId хедер-вью) — НЕ контроллер
           setCurrentSprintId монолита: тот сам зовёт рендер шапки. */
        setCurrentSprintId: function (id) { _currentSprintId = id; },
      },
    };
  }
  function _draftSet(suffix, value) { return DRAFT_STORE.draftSet(suffix, value, _draftStoreDeps()); }
  function _draftGet(suffix) { return DRAFT_STORE.draftGet(suffix, _draftStoreDeps()); }
  function _draftFlushNow() { return DRAFT_STORE.draftFlushNow(_draftStoreDeps()); }
  function _draftLoadFromBackend() { return DRAFT_STORE.draftLoadFromBackend(_draftStoreDeps()); }
  function _draftClearOnBackend() { return DRAFT_STORE.draftClearOnBackend(_draftStoreDeps()); }

  /* ═══════════════════════════════════════════════════════════
     v5.3.0 — Working copies persistence (immutable snapshots, D3/b)
     ═══════════════════════════════════════════════════════════
     Аналогично _draft, но multi-user видимость (карта общая по проекту,
     не per-login); backend: viewer GET, validator POST, владелец/
     settingsManager DELETE; дроссель flush 300мс. Реализация — в
     draft-store.js (см. блок-комментарий моста выше); карта _workingDrafts
     и флаги остаются в стейт-ядре. */
  function _workingDraftsLoadFromBackend() { return DRAFT_STORE.workingDraftsLoadFromBackend(_draftStoreDeps()); }
  function _workingDraftsScheduleFlush() { return DRAFT_STORE.workingDraftsScheduleFlush(_draftStoreDeps()); }
  function _workingDraftsFlushNow() { return DRAFT_STORE.workingDraftsFlushNow(_draftStoreDeps()); }
  function _workingDraftsDeleteOnBackend(key) { return DRAFT_STORE.workingDraftsDeleteOnBackend(key, _draftStoreDeps()); }
  function reconcileHasWorkingCopyFlag() { return DRAFT_STORE.reconcileHasWorkingCopyFlag(_draftStoreDeps()); }
  function gcWorkingDrafts() { return DRAFT_STORE.gcWorkingDrafts(_draftStoreDeps()); }
  /* Простой 32-битный хэш (FNV-1a) для conflict detection.
     Используется только для сравнения версий, не для криптографии. */
  /* Hash/equality/diff-утилиты рабочих копий вынесены в widgets/main/src/hash-pure.js
     (window.__SSP_HASH_PURE) — паттерн как PERIOD_PURE. Делегаторы; все чистые.
     (_sortKeys — внутренний хелпер модуля, наружу не торчит.) */
  var HASH_PURE = (typeof window !== 'undefined' && window.__SSP_HASH_PURE) || {};
  function _wcSha1Light(s) { return HASH_PURE._wcSha1Light(s); }
  function _blockEq(a, b)  { return HASH_PURE._blockEq(a, b); }
  function _mapById(arr)   { return HASH_PURE._mapById(arr); }
  function _numEq(a, b)    { return HASH_PURE._numEq(a, b); }
  /* Кластер ре-валидации working copy (уровни ре-валидации, хэш базового снимка,
     overlimit-чек аллокаций) вынесен в widgets/main/src/revalidation.js
     (window.__SSP_REVALIDATION) — Тир C. Делегаторы; state-контекст (роли,
     статусы, доступ к _roleItems, hash-утилиты) собирается в _revalDeps на вызове. */
  var REVALIDATION = (typeof window !== 'undefined' && window.__SSP_REVALIDATION) || {};
  function _revalDeps() {
    return {
      allRoles: ALL_ROLES, status: STATUS, activeInc: ACTIVE_INC,
      getRoleItemsArr: getRoleItemsArr, hash: HASH_PURE,
    };
  }
  function computeRequiredRevalidationLevel(snap, work) {
    return REVALIDATION.computeRequiredRevalidationLevel(snap, work, _revalDeps());
  }
  function applyRevalidationLevel(currentStatus, level) {
    return REVALIDATION.applyRevalidationLevel(currentStatus, level, _revalDeps());
  }
  function computeBaseSnapshotHash(snap) {
    return REVALIDATION.computeBaseSnapshotHash(snap, _revalDeps());
  }

  /* ═══ v5.3.0 — Working copy lifecycle ═══
     Стейт-машина рабочих копий (create/resume/discard/commit/restore/save) вынесена в
     widgets/main/src/working-copy.js (window.__SSP_WORKING_COPY) — Тир C. Делегаторы;
     контекст собирается в _wcDeps на вызове. Стейт (_workingDrafts/_history/_sprint/
     _roleItems/_activeWorkingDraftKey/…) остаётся здесь — модуль ходит к нему через
     аксессоры deps.state. Persistence-инфра (_workingDrafts load/flush/delete/
     reconcile/gc) и syncWorkingDraftFromMemory — в draft-store.js (Фаза 5 слайс 3),
     делегаторы выше. */
  var WC = (typeof window !== 'undefined' && window.__SSP_WORKING_COPY) || {};
  function _wcDeps() {
    return {
      t: T, toast: toast, diag: diag,
      allRoles: ALL_ROLES, status: STATUS, activeInc: ACTIVE_INC, draftVersion: DRAFT_VERSION,
      deepClone: deepClone, apiGet: apiGet, apiPost: apiPost,
      getRoleItemsArr: getRoleItemsArr, calcRemForRole: calcRemForRole,
      isActiveSprintRecord: isActiveSprintRecord,
      computeBaseSnapshotHash: computeBaseSnapshotHash,
      computeRequiredRevalidationLevel: computeRequiredRevalidationLevel,
      applyRevalidationLevel: applyRevalidationLevel,
      workingDraftsScheduleFlush: _workingDraftsScheduleFlush,
      workingDraftsDeleteOnBackend: _workingDraftsDeleteOnBackend,
      draftGet: _draftGet, draftSet: _draftSet, markClean: _markClean,
      showDiscardConfirmModal: showDiscardConfirmModal,
      showWorkingCopyConflictModal: showWorkingCopyConflictModal,
      exportConflictToExcel: exportConflictToExcel,
      hideWorkingCopyBanner: hideWorkingCopyBanner,
      renderWorkingCopyBanner: renderWorkingCopyBanner,
      renderPlanningRoles: renderPlanningRoles,
      renderRolePlannerHeader: renderRolePlannerHeader,
      renderRoleComposition: renderRoleComposition,
      updateRoleRemaining: updateRoleRemaining,
      renderHistory: renderHistory,
      renderPlannerRoles: renderPlannerRoles,
      renderWidgetHeader: renderWidgetHeader,
      state: {
        getWorkingDrafts: function () { return _workingDrafts; },
        getHistory: function () { return _history; },
        getSprint: function () { return _sprint; },
        setSprint: function (s) { _sprint = s; },
        getRoleItems: function () { return _roleItems; },
        setRoleItems: function (r) { _roleItems = r; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        setActiveWorkingDraftKey: function (k) { _activeWorkingDraftKey = k; },
        getCurrentUser: function () { return _currentUser; },
        getThisTabToken: function () { return _thisTabToken; },
        getSettings: function () { return _settings; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        getCurrentRolePP: function () { return _currentRolePP; },
        setCurrentRolePP: function (v) { _currentRolePP = v; },
        setCurrentRoleGantt: function (v) { _currentRoleGantt = v; },
        setCurrentRoleNkcKey: function (v) { _currentRoleNkcKey = v; },
        getBaseRevHash: function () { return _baseRevHash; },
        setDraftRestoreInProgress: function (b) { _draftRestoreInProgress = b; },
        getLang: function () { return _lang; },
        getUiExpandedRoles: function () { return (typeof _uiExpandedRoles !== 'undefined') ? _uiExpandedRoles : undefined; },
      },
    };
  }
  function createWorkingDraftFromSnapshot(snap, idx) { return WC.createWorkingDraftFromSnapshot(snap, idx, _wcDeps()); }
  function resumeWorkingDraft(key, idx) { return WC.resumeWorkingDraft(key, idx, _wcDeps()); }
  function discardWorkingDraft(key) { return WC.discardWorkingDraft(key, _wcDeps()); }
  function _doDiscardWorkingDraft(key) { return WC._doDiscardWorkingDraft(key, _wcDeps()); }

  /* syncWorkingDraftFromMemory — приватен draft-store.js (единственный
     вызов — WC-путь _markDirty внутри модуля). */

  /* Commit working copy → overwrite базового snap + revisions[] — вынесен в working-copy.js. */
  function _commitWorkingCopy(rk, idx, draft, snapFromCurrent) {
    return WC._commitWorkingCopy(rk, idx, draft, snapFromCurrent, _wcDeps());
  }

  /* ═══ v5.3.0 — UI: working copy banner — вынесен в header-view.js
     (Тир D слайс 5, ступень 1, коммит В); делегаторы для callers
     монолита и _wcDeps-фабрики working-copy. ═══ */
  function renderWorkingCopyBanner() { return HEADER_VIEW.renderWorkingCopyBanner(_headerDeps()); }
  function hideWorkingCopyBanner() { return HEADER_VIEW.hideWorkingCopyBanner(); }

  /* ═══ v5.3.0 — UI: модалки (diff, conflict, multi-tab, discard) ═══ */
  function diffItemsForUI(snap, working) { return HASH_PURE.diffItemsForUI(snap, working); }
  /* Phase 3 #32 — wcDiff мигрирован на openModal() (bespoke wcDiffView, настоящий React).
     Дифф (diffItemsForUI) считается в IIFE, в React уезжают только plain-данные секций.
     read-only тип: backdrop ✅ / escape ✅ / close-X ✅. */
  function showWorkingCopyDiffModal(key) {
    var draft = _workingDrafts[key];
    if (!draft) return;
    var snap = _history.find(function(s){ return s && s.sprintId === key; });
    if (!snap) return;
    var diff = diffItemsForUI(snap, draft);
    var titleOf = function(it){ return it.title || it.issueId || ''; };
    var h = openModal({
      id: 'wcDiff',
      type: 'read-only',
      title: T('wcDiffTitle'),
      body: { kind: 'component', name: 'wcDiffView', props: {
        added:   diff.added.map(titleOf),
        removed: diff.removed.map(titleOf),
        changed: diff.changed.map(function(c){
          return {
            title: titleOf(c.item),
            fields: c.fields.map(function(f){
              return {
                name: String(f.name),
                from: f.from == null ? '—' : String(f.from),
                to:   f.to   == null ? '—' : String(f.to),
              };
            }),
          };
        }),
        labels: {
          added: T('wcDiffAdded'), removed: T('wcDiffRemoved'), changed: T('wcDiffChanged'),
          noChanges: T('wcDiffNoChanges'), close: T('btnClose'),
        },
        onClose: function(){ h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: true,
      blockEscape: false,
      showCloseButton: true,
    });
  }

  /* Phase 2 #32 — WC-семейство мигрировано на openModal(); Тир B — тела вынесены
     в modal-specs.js. Callback-контракты сохранены: conflict → 'overwrite'|'export'|'cancel';
     multiTab/discard → boolean; onClose гарантирует ровно один вызов callback. */
  function showWorkingCopyConflictModal(key, baseSnap, mySnap, callback) {
    return MODAL_SPECS.showWorkingCopyConflictModal(key, baseSnap, mySnap, callback, { t: T, openModal: openModal });
  }

  function showMultiTabConflictModal(key, callback) {
    return MODAL_SPECS.showMultiTabConflictModal(key, callback, { t: T, openModal: openModal });
  }

  function showDiscardConfirmModal(key, callback) {
    return MODAL_SPECS.showDiscardConfirmModal(key, callback, { t: T, openModal: openModal });
  }

  /* Wire-up button handlers (idempotent — guard через _sspBound) */
  function bindWorkingCopyHandlers() {
    var bind = function(id, ev, fn) {
      var el = document.getElementById(id);
      if (!el || el._sspWcBound) return;
      el._sspWcBound = true;
      el.addEventListener(ev, fn);
    };
    bind('wcBannerCloseBtn', 'click', function(){
      if (!_activeWorkingDraftKey) return;
      _activeWorkingDraftKey = null;
      hideWorkingCopyBanner();
      apiGet('sprint-data').then(function(r){
        if (r && r.success) {
          _sprint    = r.sprint    || null;
          _roleItems = r.roleItems || {};
          /* v5.9.0 — D59: orphans из backend. */
          if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
            _sprint._orphanGanttIssues = r.orphanGanttIssues;
          }
          if (typeof renderPlannerRoles === 'function') renderPlannerRoles();
          if (typeof renderHistory === 'function') renderHistory();
        }
      }).catch(function(){});
    });
    bind('wcBannerDiffBtn', 'click', function(){
      if (!_activeWorkingDraftKey) return;
      showWorkingCopyDiffModal(_activeWorkingDraftKey);
    });
    /* wcConflict/wcMultiTab/wcDiscard кнопки — мигрированы на openModal() (Phase 2 #32);
       wcDiff — Phase 3 #32. Их .overlay HTML удалён; bind'ы больше не нужны
       (wcDiff закрывается через handle внутри showWorkingCopyDiffModal). */
  }
  /* Bind при загрузке скрипта (DOM уже готов т.к. main.js — defer) */
  try { bindWorkingCopyHandlers(); } catch(e){ diag('bindWorkingCopyHandlers failed: '+e, 'err'); }

  /* ═══ Реассайн-контроллер вынесен в reassign-controller.js (Фаза 5, зачистка
     «прочих» — слайс 7, домен D46) за мост window.__SSP_REASSIGN_CTRL; golden-контракты
     — reassign.golden.test.js (идут через делегатор openReassignModal). Deps-фабрика
     per-call: стейт зоны (_reassignModalHandle + читаемые _currentRolePP/
     _currentSprintRoleRec/_activeSubtab/_currentSprintId/_sprint/_dirtyRoleKeys)
     остаётся в стейт-ядре за get/set-аксессорами; _applyReassign приватен модулю
     (вход только openReassignModal.onApply). Делегаторы: openReassignModal
     (потребитель gantt-view) и hideReassignModal (потребитель header-view —
     закрытие при переключении вкладки). ═══ */
  var REASSIGN_CTRL = (typeof window !== 'undefined' && window.__SSP_REASSIGN_CTRL) || {};
  var _reassignModalHandle = null;
  function _reassignDeps() {
    return {
      T: T, diag: diag,
      openModal: openModal,
      isActiveSprintRecord: isActiveSprintRecord,
      saveCurrentRoleState: saveCurrentRoleState,
      updateIssueAssigneeField: updateIssueAssigneeField,
      renderGanttChart: renderGanttChart,
      renderCurrentRoleTaskTable: renderCurrentRoleTaskTable,
      state: {
        getCurrentRolePP: function () { return _currentRolePP; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        getActiveSubtab: function () { return _activeSubtab; },
        getCurrentSprintId: function () { return _currentSprintId; },
        getSprint: function () { return _sprint; },
        getDirtyRoleKeys: function () { return _dirtyRoleKeys; },
        getReassignModalHandle: function () { return _reassignModalHandle; },
        setReassignModalHandle: function (v) { _reassignModalHandle = v; },
      },
    };
  }
  function hideReassignModal() { return REASSIGN_CTRL.hideReassignModal(_reassignDeps()); }
  /* v5.8.0 — A.5 (D56): универсальное скрытие всех overlay'ев класса .overlay при tab switch.
     Закрывает leakage класс багов: открыт #reassignOverlay/#wcConflictOverlay/etc. → юзер
     переключил вкладку → overlay «всплыл» позже на чужой вкладке. Settings-overlay
     (отдельный класс .settings-overlay) НЕ затрагивается — управляется собственным flow. */
  function _hideAllOverlays() {
    var nodes = document.querySelectorAll('.overlay');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('hidden');
    }
  }
  /* Хелперы скролла/показа легаси-оверлеев демонтированы вместе с модал-фасадом. */
  function openReassignModal(issueId) { return REASSIGN_CTRL.openReassignModal(issueId, _reassignDeps()); }

  /* Тир B — тело в excel-export.js (buildConflictAOA); AOA 1:1, текстовый Δ-маркер. */
  function _buildConflictAOA(snap, otherSnap) {
    return EXCEL_EXPORT.buildConflictAOA(snap, otherSnap, _excelDeps());
  }

  function exportConflictToExcel(baseSnap, mySnap) {
    if (typeof XLSX === 'undefined') {
      try { toast(T('toastXlsxLoading') || 'Загружаем XLSX-библиотеку…', 'info'); } catch(_){}
      loadXLSXLib().then(function(){ exportConflictToExcel(baseSnap, mySnap); })
                   .catch(function(e){
                     diag('XLSX load failed: '+(e&&e.message?e.message:e), 'err');
                     try { toast(T('toastXlsxErr')); } catch(_){}
                   });
      return;
    }
    try {
      var aoaBase    = _buildConflictAOA(baseSnap, mySnap);
      var aoaWorking = _buildConflictAOA(mySnap, baseSnap);
      var wsBase    = XLSX.utils.aoa_to_sheet(aoaBase);
      var wsWorking = XLSX.utils.aoa_to_sheet(aoaWorking);
      var cols = [{wch:14},{wch:14},{wch:42},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:24},{wch:12},{wch:12}];
      wsBase['!cols'] = cols;
      wsWorking['!cols'] = cols;
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsBase,    T('excelSheetBase'));
      XLSX.utils.book_append_sheet(wb, wsWorking, T('excelSheetWorking'));
      var ts   = new Date();
      var pad  = function(n){ return String(n).padStart(2,'0'); };
      var nm   = (baseSnap && baseSnap.name) ? String(baseSnap.name).replace(/[\\\/:*?"<>|]+/g, '_') : 'sprint';
      var fn   = 'Sprint-' + nm + '-conflict-' + ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate())
                 + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.xlsx';
      XLSX.writeFile(wb, fn);
      diag('Conflict Excel exported: '+fn, 'ok');
    } catch(e) {
      diag('exportConflictToExcel failed: '+(e&&e.message?e.message:e), 'err');
      try { toast(T('toastXlsxErr')); } catch(_){}
    }
  }

  /* v5.2 → v5.3 миграция: однократный commit-as-PLANNING для in-flight правки. */
  function migrateEditingFromHistoryV52() {
    if (!_settings) return;
    if (_settings.migratedTo === '5.3') return;
    if (_sprint && _sprint.editingFromHistory === true && _sprint.historyIdx != null) {
      var idx = _sprint.historyIdx;
      var existingSnap = _history[idx];
      if (existingSnap && existingSnap.roleKey) {
        diag('v5.2→v5.3 migration: committing in-flight edit as PLANNING for '+existingSnap.sprintId, 'info');
        try { saveRoleHistorySnapshot(existingSnap.roleKey, idx); } catch(e){
          diag('migration save failed: '+(e&&e.message?e.message:e), 'err');
        }
      } else {
        diag('v5.2→v5.3 migration: stale historyIdx='+idx+', no snap found, skipping commit', 'warn');
      }
      delete _sprint.editingFromHistory;
      delete _sprint.historyIdx;
      apiPost('sprint-data', { sprint: _sprint, roleItems: _roleItems }).catch(function(){});
      setTimeout(function(){ try { toast(T('wcMigrationNotice'), 'info'); } catch(_){} }, 500);
    }
    _settings.migratedTo = '5.3';
    apiPost('sprint-data', { settings: _settings }).catch(function(){});
  }

  /* Debounce-персист, dirty-механика и WC-sync — в draft-store.js
     (Фаза 5 слайс 3); делегаторы на мосту DRAFT_STORE (объявлен выше). */
  function _draftSaveDebounced(suffix, valueGetter, delayMs) { return DRAFT_STORE.draftSaveDebounced(suffix, valueGetter, delayMs, _draftStoreDeps()); }
  function _markDirty(section) { return DRAFT_STORE.markDirty(section, _draftStoreDeps()); }
  function _markClean(section) { return DRAFT_STORE.markClean(section, _draftStoreDeps()); }
  function _draftIsDirty() { return DRAFT_STORE.draftIsDirty(_draftStoreDeps()); }
  /* Простой числовой хеш (FNV-1a) для сравнения версий состояния */
  function computeRevHash(sprint, roleItems) { return HASH_PURE.computeRevHash(sprint, roleItems); }
  /* v5.0.3 — Multi-state индикатор черновика:
     - "●  Несохранённые изменения" (оранжевый) — при dirty=true
     - "💾 Черновик сохранён HH:MM"     (серый) — при наличии меты, но dirty=false
     - скрыт                              — когда меты нет вовсе
     Кнопка «🧹 Очистить черновик» видна, когда есть мета (любое состояние).
  */
  function refreshDirtyIndicator() {
    var any  = _draftIsDirty();
    var meta = _draftGet('meta');
    var badge = document.getElementById('dirtyBadge');
    var btn   = document.getElementById('clearDraftBtn');
    diag('refreshDirtyIndicator: any='+any+' meta='+(meta?'yes('+(meta.savedAt||'?')+')':'no')+' badge='+(badge?'yes':'no')+' btn='+(btn?'yes':'no'), 'info');
    if (badge) {
      badge.classList.remove('dirty-badge--clean');
      if (any) {
        badge.textContent = T('dirtyBadge');
        badge.title = T('tooltipDirtyRow');
        badge.classList.remove('hidden');
      } else if (meta) {
        var ts = '';
        try { ts = new Date(meta.savedAt).toLocaleTimeString(_lang === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }); }
        catch(_) { ts = ''; }
        badge.textContent = T('draftSavedAt').replace('{ts}', ts);
        badge.title = T('draftSavedAtTitle');
        badge.classList.add('dirty-badge--clean');
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    if (btn) {
      setButtonText(btn, T('btnClearDraft'));
      btn.title           = T('btnClearDraftTitle');
      if (meta) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    }
  }
  function clearDraftStorage() { return DRAFT_STORE.clearDraftStorage(_draftStoreDeps()); }

  /* v5.0.3 — bind live-listeners на стабильные инпуты шапки спринта.
     Идемпотентно (через _sspDraftBound). Вызывается после init и после
     перерисовки шапки. */
  function bindSprintHeaderDraftListeners() {
    [
      { id: 'sprintName',      apply: function(v){ _sprint.name = v.trim().substring(0,60) || null; } },
      { id: 'dateStart',       apply: function(v){ _sprint.dateStart = (typeof fromDateIn === 'function') ? fromDateIn(v) : v; } },
      { id: 'dateEnd',         apply: function(v){ _sprint.dateEnd   = (typeof fromDateIn === 'function') ? fromDateIn(v) : v; } },
      { id: 'sprintFieldVal',  apply: function(v){ _sprint.sprintFieldVal = v || null; } },
      { id: 'versionFieldVal', apply: function(v){ _sprint.versionFieldVal = v || null; } }
    ].forEach(function(spec) {
      var el = document.getElementById(spec.id);
      if (!el || el._sspDraftBound) return;
      el._sspDraftBound = true;
      var handler = function(){
        if (!_sprint || _draftRestoreInProgress) return;
        try { spec.apply(el.value); } catch(_){}
        _markDirty('sprint');
        _draftSaveDebounced('sprint', function(){ return _sprint; });
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
  }
  function bindClearDraftHandlers() {
    var btn = document.getElementById('clearDraftBtn');
    if (btn && !btn._sspBound) {
      btn._sspBound = true;
      btn.addEventListener('click', function(){
        var dirty = _draftGet('dirty') || {};
        var meta  = _draftGet('meta');
        if (!meta || !_draftIsDirty()) {
          clearDraftStorage();
          refreshDirtyIndicator();
          try { toast(T('toastDraftCleared'), 'info'); } catch(_){}
          return;
        }
        var ts = '';
        try { ts = new Date(meta.savedAt).toLocaleString(_lang === 'en' ? 'en-US' : 'ru-RU'); } catch(_) { ts = String(meta.savedAt); }
        var sections = [];
        if (dirty.sprint)    sections.push(T('draftSectionSprint'));
        if (dirty.roleItems) sections.push(T('draftSectionRoleItems'));
        if (dirty.currentRole)   sections.push(T('draftSectionCurrentRole'));
        var info = T('draftMetaInfo').replace('{ts}', ts).replace('{sections}', sections.join(', '));
        openModal({
          id: 'clearDraft',
          type: 'confirm',
          title: T('clearDraftConfirmTitle'),
          body: { kind: 'lines', lines: [
            { text: T('clearDraftConfirmBody'), style: { color: 'var(--warn)' } },
            { text: info, style: { marginTop: '8px', fontSize: '12px', color: 'var(--muted)' } },
          ]},
          buttons: [
            { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); } },
            { id: 'confirm', text: T('btnYesClearDraft'), variant: 'danger', onClick: function(h) {
              h.close();
              /* v5.0.3 — backend-clear + перезагрузка серверной версии */
              _draftClearOnBackend().then(function(){
                return loadAllData();
              }).then(function(){
                _serverSnapshotSprint    = _sprint    ? deepClone(_sprint)    : null;
                _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null;
                _baseRevHash = computeRevHash(_sprint, _roleItems);
                try {
                  if (typeof renderPlannerRoles === 'function') renderPlannerRoles();
                  if (typeof renderHistory === 'function')      renderHistory();
                } catch(_){}
                refreshDirtyIndicator();
                try { toast(T('toastDraftCleared'), 'success'); } catch(_){}
              }).catch(function(e){
                try { toast(T('toastDraftClearErr')+': '+(e&&e.message?e.message:e), 'error'); } catch(_){}
              });
            }},
          ],
          dismissOnBackdrop: false,
          blockEscape: false,
          showCloseButton: false,
        });
      });
    }
  }

  function bindResInputDraftListener(rk) {
    var el = document.getElementById('res_'+rk);
    if (!el || el._sspDraftBound) return;
    el._sspDraftBound = true;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return;
    var handler = function(){
      if (!_sprint || el.readOnly || _draftRestoreInProgress) return;
      _sprint[role.resKey] = (typeof parsePeriod === 'function') ? parsePeriod(el.value) : el.value;
      _markDirty('sprint');
      _draftSaveDebounced('sprint', function(){ return _sprint; });
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    /* #34 — blur-реформат к каноничному виду (часы+минуты). Пусто → пусто;
       без цифр (мусор) → revert к сохранённому значению. */
    el.addEventListener('blur', function(){
      if (el.readOnly || _draftRestoreInProgress) return;
      var raw = (el.value || '').trim();
      if (raw === '') { el.value = ''; return; }
      if (!/\d/.test(raw)) {
        el.value = _sprint && _sprint[role.resKey] ? fmtPeriod(_sprint[role.resKey]) : '';
        return;
      }
      el.value = fmtPeriod(parsePeriod(raw));
    });
  }

  /* v5.0.3 — Восстановление черновика из localStorage в state.
     Вызывается из init после loadAllData, до рендера UI. */
  function restoreDraftIfAny() { return WC.restoreDraftIfAny(_wcDeps()); }

  /* ════ #25 Ф2 — каркас дашборда (рельс + пейн), ТОЛЬКО global-режим ════
     _buildGlobalDashShell строит .ssp-dash (grid) единожды на init при _mode==='global'
     и переносит существующих детей .page в .ssp-pane (move, не recreate — id/классы/
     обработчики сохраняются). Рельс на Этапе 1 — каркас с кнопкой «свернуть»; chrome,
     контекст и навигация переедут в рельс на следующих этапах. Состояние collapse —
     safeLs (мгновенно, до загрузки черновика) + _draft.ui.railCollapsed (источник истины
     в sandbox-iframe, где localStorage может быть недоступен). */
  var _railCollapsedMemo = null;
  function getRailCollapsed() {
    if (_railCollapsedMemo !== null) return _railCollapsedMemo;
    _railCollapsedMemo = (safeLs.get('ssp_railCollapsed') === '1');
    return _railCollapsedMemo;
  }
  function setRailCollapsed(v) {
    v = !!v;
    _railCollapsedMemo = v;
    safeLs.set('ssp_railCollapsed', v ? '1' : '0');
    try { var ui = _draftGet('ui') || {}; ui.railCollapsed = v; _draftSet('ui', ui); } catch(_){}
  }
  function _applyRailCollapsed(v) {
    v = !!v;
    var dash = document.querySelector('.ssp-dash');
    if (dash) dash.classList.toggle('ssp-rail-collapsed', v);
    var tgl = document.getElementById('sspRailToggle');
    if (tgl) {
      tgl.textContent = v ? '»' : '«';
      tgl.setAttribute('aria-label', v ? 'Развернуть панель' : 'Свернуть панель');
      tgl.setAttribute('title', v ? 'Развернуть панель' : 'Свернуть панель');
      tgl.setAttribute('aria-expanded', v ? 'false' : 'true');
    }
  }
  /* #25 Ф2 п.6 — подпись полного имени спринта в рельсе: вынесена в header-view.js
     (Тир D слайс 5, ступень 1); делегатор для callers init-зоны рельса. */
  function _updateRailSprintName() { return HEADER_VIEW._updateRailSprintName(); }
  /* ════ #25 Ф2 Этап 3+4+7 — дерево навигации + dashNode-стейт ════
     Узлы: sprint-params (D6) · planning-{roles,people,standup} (D5) · gantt · history · share(#36 — copy deep-link URL).
     Кликает по дереву → программно дёргаем существующие tracker-узлы (.tab-btn / .planning-level-btn),
     callsite'ы целы. Состояние в _draft.ui.dashNode + body-класс ssp-dashnode-<id>. */
  var SSP_DASH_NODES = ['sprint-params','planning-roles','planning-people','planning-standup','gantt','history'];

  function _buildDashTree() {
    var tree = document.createElement('div');
    tree.className = 'ssp-tree'; tree.setAttribute('role','tree');

    /* нативная Ring-иконка (SVG из __SSP_ICONS через icon()), а не emoji */
    function _treeIcon(iconName) {
      var ic = (typeof icon === 'function') ? icon(iconName) : document.createElement('span');
      ic.classList.add('ssp-tree__icon');
      return ic;
    }
    function mkItem(nodeId, labelKey, iconName, extraClass) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ssp-tree__item' + (extraClass ? ' ' + extraClass : '');
      b.dataset.node = nodeId;
      if (iconName) b.appendChild(_treeIcon(iconName));
      var t = document.createElement('span'); t.setAttribute('data-i18n', labelKey); t.textContent = T(labelKey);
      b.appendChild(t);
      b.addEventListener('click', function(){ if (!b.classList.contains('ssp-tree__item--disabled')) _setDashNode(nodeId); });
      return b;
    }
    function mkChild(nodeId, labelKey, iconName) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ssp-tree__child'; b.dataset.node = nodeId;
      if (iconName) b.appendChild(_treeIcon(iconName));
      var t = document.createElement('span'); t.setAttribute('data-i18n', labelKey); t.textContent = T(labelKey);
      b.appendChild(t);
      b.addEventListener('click', function(){ _setDashNode(nodeId); });
      return b;
    }

    /* 1. Параметры спринта (D6) */
    tree.appendChild(mkItem('sprint-params', 'treeSprintParams', 'settings'));

    /* 2. Планирование (раскрывающаяся группа с детьми Роли/Люди/Stand-up) */
    var grp = document.createElement('details'); grp.className = 'ssp-tree__group'; grp.open = true;
    var sum = document.createElement('summary'); sum.className = 'ssp-tree__group-summary';
    sum.appendChild(_treeIcon('task'));
    var sumTxt = document.createElement('span'); sumTxt.setAttribute('data-i18n','tabPlanning'); sumTxt.textContent = T('tabPlanning');
    sum.appendChild(sumTxt); grp.appendChild(sum);
    var kids = document.createElement('div'); kids.className = 'ssp-tree__children';
    kids.appendChild(mkChild('planning-roles',   'planningLevelRoles',   'group'));
    kids.appendChild(mkChild('planning-people',  'planningLevelPeople',  'user'));
    kids.appendChild(mkChild('planning-standup', 'planningLevelStandup', 'comment'));
    grp.appendChild(kids);
    tree.appendChild(grp);

    /* 3. Гант / История */
    tree.appendChild(mkItem('gantt',   'tabGantt',   'bars'));
    tree.appendChild(mkItem('history', 'tabHistory', 'history'));

    /* 4. Поделиться (#36) — копирует текущий deep-link URL; enable/disable по наличию спринта.
       mkItem-клик зовёт _setDashNode('share') (no-op, не в SSP_DASH_NODES); добавляем copy-handler. */
    var share = mkItem('share', 'treeShare', 'share', 'ssp-tree__item--share ssp-tree__item--disabled');
    share.addEventListener('click', function(){
      if (!share.classList.contains('ssp-tree__item--disabled')) _onShareClick();
    });
    tree.appendChild(share);

    return tree;
  }

  function _deriveDashNodeFromTabLevel() {
    /* Маппинг устаревшего состояния (activeTab/planningLevel) в новое dashNode. */
    var ui = _draftGet('ui') || {};
    var t = ui.activeTab || 'planning';
    if (t === 'gantt')   return 'gantt';
    if (t === 'history') return 'history';
    var lvl = ui.planningLevel || _planningLevel || 'roles';
    if (lvl === 'people')  return 'planning-people';
    if (lvl === 'standup') return 'planning-standup';
    return 'planning-roles';
  }

  function _setDashNode(nodeId) {
    if (SSP_DASH_NODES.indexOf(nodeId) < 0) return;   /* share/disabled — no-op */
    /* подсветка дерева */
    document.querySelectorAll('.ssp-tree [data-node]').forEach(function(n){
      n.classList.toggle('active', n.dataset.node === nodeId);
    });
    /* body-класс для CSS-стейта (для #sprintIntroCard и др.) */
    var cls = document.body.className.replace(/\bssp-dashnode-\S+/g, '').replace(/\s+/g,' ').trim();
    document.body.className = cls + ' ssp-dashnode-' + nodeId;
    /* делегирование на скрытые tracker-узлы (callsite'ы целы) */
    function _clickTab(t) { var el = document.querySelector('.tab-btn[data-tab="'+t+'"]'); if (el && !el.classList.contains('active')) el.click(); }
    function _clickLevel(l){ var el = document.querySelector('.planning-level-btn[data-level="'+l+'"]'); if (el && !el.classList.contains('active')) el.click(); }
    if (nodeId === 'sprint-params')    { _clickTab('planning'); }
    else if (nodeId === 'planning-roles')   { _clickTab('planning'); _clickLevel('roles'); }
    else if (nodeId === 'planning-people')  { _clickTab('planning'); _clickLevel('people'); }
    else if (nodeId === 'planning-standup') { _clickTab('planning'); _clickLevel('standup'); }
    else if (nodeId === 'gantt')            { _clickTab('gantt'); }
    else if (nodeId === 'history')          { _clickTab('history'); }
    /* persist */
    try { var ui = _draftGet('ui') || {}; ui.dashNode = nodeId; _draftSet('ui', ui); } catch(_){}
    /* #36 — отразить узел в URL (no-op до _urlSyncEnabled / вне global) */
    try { _syncStateToUrl(); } catch(_){}
  }

  function _buildGlobalDashShell() {
    var page = document.querySelector('.page');
    if (!page || document.querySelector('.ssp-dash')) return;   /* идемпотентно */
    function _el(cls) { var d = document.createElement('div'); if (cls) d.className = cls; return d; }

    var dash = _el('ssp-dash');
    var rail = _el('ssp-rail'); rail.id = 'sspRail';
    var pane = _el('ssp-pane'); pane.id = 'sspPane';

    /* Этап 2 — захватываем существующие узлы chrome/контекста/навигации (move, не recreate:
       id/классы/обработчики и серверная видимость #openSettingsBtn сохраняются). */
    var pageHeader  = page.querySelector('.page-header');          /* иконка/title/версия (+ picker/links внутри) */
    var picker      = document.getElementById('globalProjectPicker');
    var headerLinks = page.querySelector('.page-header__links');   /* Настройки/Руководство/Обр.связь/язык/Очистить */
    var widgetHdr   = document.getElementById('widgetHeader');     /* спринт-селектор/бейдж/WC/новый */
    var statusBar   = document.getElementById('widgetStatusBarSpoiler')  /* спойлер «Статус активности модулей» */
                    || document.getElementById('widgetStatusBar');       /* fallback, если обёртки нет */
    var tabs        = page.querySelector('.tabs');                 /* tracker-табы + Ring-Tabs host #sspTabsHost */

    /* ── Голова рельса: кнопка «свернуть» + бренд (.page-header) ── */
    var head = _el('ssp-rail__head');
    var tgl = document.createElement('button');
    tgl.type = 'button'; tgl.className = 'ssp-rail__toggle'; tgl.id = 'sspRailToggle';
    head.appendChild(tgl);
    /* picker и links вытаскиваем из .page-header ДО переноса бренда (иначе уедут вместе с ним) */
    if (pageHeader)  head.appendChild(pageHeader);
    /* утилиты — компактной группой сразу под брендом. В auto-grow iframe нет
       фиксированного «дна экрана», поэтому классический «низ сайдбара» не прижать —
       наверху аккуратнее (см. правку 2026-06-06 по фидбэку владельца). */
    var utils = _el('ssp-rail__utils');
    if (headerLinks) utils.appendChild(headerLinks);
    /* спойлер «Статус активности модулей» — под пикером языка (в utils-зоне, по фидбэку) */
    if (statusBar) utils.appendChild(statusBar);
    /* контекст: проект-пикер + логические карточки спринта */
    var ctx = _el('ssp-rail__context');
    if (picker)      ctx.appendChild(picker);
    if (widgetHdr) {
      var _sprintBox = widgetHdr.querySelector('.widget-header__sprint');  /* селектор + имя спринта */
      var _badge     = widgetHdr.querySelector('.widget-header__badge');   /* #widgetSprintBadge — статусы ролей */
      var _wc        = widgetHdr.querySelector('.widget-header__wc');       /* #widgetWcIndicator — рабочая копия */
      var _newBtn    = widgetHdr.querySelector('.widget-header__new');      /* #widgetNewSprintBtn */
      /* п.6 — подпись полного имени спринта внутри спринт-блока (под селектором) */
      if (_sprintBox && !document.getElementById('sspRailSprintName')) {
        var _nm = document.createElement('div');
        _nm.id = 'sspRailSprintName'; _nm.className = 'ssp-rail-sprint-name';
        _sprintBox.appendChild(_nm);
      }
      /* Карточка 1 = сам #widgetHeader (renderWidgetHeader проверяет его наличие):
         имя спринта + рабочая копия (WC над статусами ролей). */
      if (_sprintBox) widgetHdr.appendChild(_sprintBox);   /* порядок: спринт первым */
      if (_wc)        widgetHdr.appendChild(_wc);            /* WC сразу под спринтом */
      /* Карточка 2 = статусы ролей спринта (отдельный блок). */
      var _card2 = _el('ssp-rail-card ssp-rail-card--badges');
      if (_badge) _card2.appendChild(_badge);

      ctx.appendChild(widgetHdr);                /* блок 1: спринт + WC */
      ctx.appendChild(_card2);                   /* блок 2: статусы ролей */
      if (_newBtn) ctx.appendChild(_newBtn);     /* «Новый спринт» — отдельной строкой */
    }
    /* ── Навигация (Этап 3+4+7 — дерево D5/D6/Ф2.5) ── */
    var nav = _el('ssp-rail__nav');
    if (tabs) nav.appendChild(tabs);            /* tracker-узлы сохраняются для callsite'ов (скрыты CSS) */
    nav.appendChild(_buildDashTree());

    rail.appendChild(head);
    rail.appendChild(utils);
    rail.appendChild(ctx);
    rail.appendChild(nav);

    /* Остаток .page (баннеры, projectSettings*, tab-panel'ы, #diagWrap) → пейн. */
    while (page.firstChild) { pane.appendChild(page.firstChild); }

    dash.appendChild(rail); dash.appendChild(pane);
    page.appendChild(dash);

    tgl.addEventListener('click', function() {
      setRailCollapsed(!dash.classList.contains('ssp-rail-collapsed'));
      _applyRailCollapsed(getRailCollapsed());
    });
    _applyRailCollapsed(getRailCollapsed());
    _updateRailSprintName();
    /* #36 v2.5.2 — сразу выставить видимость кнопки «Поделиться» по наличию host.navigation
       (на YT<2026.1 спрятать немедленно, не дожидаясь выбора проекта). */
    try { _updateShareBtnState(); } catch (_) {}
    diag('#25 Ф2 dash shell built (global): chrome/context/nav → rail', 'ok');
  }

  /* v5.0.3 — Восстановление UI-навигации (активная вкладка/подвкладка/спринт-селектор).
     Вызывается после рендера, поскольку DOM подвкладок строится в renderPlannerRoles. */
  function restoreUiState() {
    var ui = _draftGet('ui') || {};
    try {
      /* v5.4.0 (D29) — silent миграция _currentSprintId. Делаем ДО рендера шапки и вкладок:
         (1) ui.currentSprintId если валиден; (2) _sprint?.sprintId; (3) первый non-FINAL
         из getLogicalSprintIds(); (4) null (empty state). Идемпотентно. */
      try {
        var ids = (typeof getLogicalSprintIds === 'function') ? getLogicalSprintIds() : [];
        var resolved = null;
        if (ui.currentSprintId && ids.indexOf(ui.currentSprintId) >= 0) {
          resolved = ui.currentSprintId;
        } else if (_sprint && _sprint.sprintId && ids.indexOf(_sprint.sprintId) >= 0) {
          resolved = _sprint.sprintId;
        } else if (ids.length) {
          resolved = ids[0];
        }
        _currentSprintId = resolved;
        if (resolved !== ui.currentSprintId) {
          ui.currentSprintId = resolved; _draftSet('ui', ui);
        }
      } catch(e) { diag('restoreUiState: currentSprintId migration err: '+e, 'err'); }

      if (ui.activeTab) {
        var tabBtn = document.querySelector('.tab-btn[data-tab="'+ui.activeTab+'"]');
        if (tabBtn && tabBtn.style.display !== 'none') tabBtn.click();
      }
      /* Восстановление уровня детализации tab-planning (default 'roles'). */
      try {
        var lvl = ui.planningLevel;
        if (!lvl) lvl = 'roles';
        _planningLevel = lvl;
        if (lvl !== ui.planningLevel) { ui.planningLevel = lvl; _draftSet('ui', ui); }
        document.querySelectorAll('.planning-level-btn').forEach(function(b){
          b.classList.toggle('active', b.dataset.level === lvl);
        });
        document.querySelectorAll('.planning-level-pane').forEach(function(p){
          p.classList.toggle('hidden', p.id !== 'planning-level-' + lvl);
        });
      } catch(e) { diag('restoreUiState: planningLevel migration err: '+e, 'err'); }
      /* v5.5.0 — Этап 3b: восстановление раскрытых ролей в accordion'е уровня «Роли» */
      try {
        if (Array.isArray(ui.expandedRoles)) {
          ui.expandedRoles.forEach(function(rk){ if (rk) _uiExpandedRoles[rk] = true; });
        }
      } catch(e) { diag('restoreUiState: expandedRoles err: '+e, 'err'); }
      /* #25 Ф2 — состояние «свёрнут рельс» из backend-черновика (источник истины в sandbox,
         где localStorage недоступен; safeLs мог не сохранить). В project-режиме .ssp-dash
         нет — _applyRailCollapsed guard'ится. */
      try {
        if (typeof ui.railCollapsed === 'boolean') {
          _railCollapsedMemo = ui.railCollapsed;
          _applyRailCollapsed(ui.railCollapsed);
        }
      } catch(e) { diag('restoreUiState: railCollapsed err: '+e, 'err'); }
      if (ui.currentRoleNkcKey) {
        var nkcSel = document.getElementById('currentRoleNkcSel');
        if (nkcSel && nkcSel.querySelector('option[value="'+ui.currentRoleNkcKey+'"]')) {
          nkcSel.value = ui.currentRoleNkcKey;
          nkcSel.dispatchEvent(new Event('change'));
        }
      }
      /* v5.4.0 — финальный рендер шапки виджета после восстановления UI */
      if (typeof renderWidgetHeader === 'function') {
        try { renderWidgetHeader(); } catch(_){}
      }
      /* v5.6.0 — Этап 4 (4c): refreshPlannerForCurrentSprint удалена; hybrid-режим
         применяется через setCurrentSprintId → _applyHybridSprintMode. */
    } catch(e) { diag('restoreUiState err: '+e, 'err'); }
  }
  /* Снять dirty + обновить snapshot + обновить кэш черновика — после успешного apiPost.
     Вынесен в sprint-controller.js (Фаза 5 слайс 6) за __SSP_SPRINT_CTRL; делегатор
     выживает — golden-вход youtrack-api (_ytApiDeps его зовёт) + gm.set голденов. */
  function markSavedAndCleanup(section) { return SPRINT_CTRL.markSavedAndCleanup(section, _sprintDeps()); }
  /* `deepClone` определён ниже как function declaration (hoisted),
     поэтому доступен из обработчиков выше по тексту. */

  function diag(msg, type) {
    _diagLines.push({msg:msg, type:type||'info'});
    if(_diagLines.length>100) _diagLines.shift();
    var log=document.getElementById('diagLog');
    if(!log) return;
    var line=document.createElement('div');
    line.className='diag-line diag-line--'+(type||'info');
    line.textContent=new Date().toLocaleTimeString('ru-RU')+' '+msg;
    log.appendChild(line);
    log.scrollTop=log.scrollHeight;
  }

  /* ═══ calcRem для конкретной роли ══════════════════════════ */
  function calcRemForRole(roleKey) {
    var role = ALL_ROLES.find(function(r){ return r.key === roleKey; });
    if (!role) return 0;
    var items = (_roleItems[roleKey] || []).filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    var resource = _sprint ? (_sprint[role.resKey] || 0) : 0;
    // Используем аллокацию; если не задана — дельта max(0, est-fact)
    var used = items.reduce(function(s, i) {
      var alloc = i['alloc_' + roleKey];
      if (alloc !== null && alloc !== undefined) {
        return s + Math.max(0, alloc);
      }
      var est  = i['estimate_' + roleKey];
      var fact = i['fact_'     + roleKey];
      return s + Math.max(0, (est||0) - (fact||0));
    }, 0);
    return resource - used;
  }

  /* ═══ Backend API ══════════════════════════════════════════
     IO-слой вынесен в widgets/main/src/youtrack-api.js (window.__SSP_YOUTRACK_API) —
     Тир C. Делегаторы; контекст собирается в _ytApiDeps на вызове. Стейт
     (_mode/_activeProjectKey — роутинг #25 Ф1; _sprint/_activeWorkingDraftKey/
     _activeSubtab/_currentSprintRoleRec/_history — save-сайд-эффекты apiPost;
     _ganttStateHist — кэш Ганта #20) остаётся здесь — модуль ходит к нему через
     аксессоры deps.state. */
  var YT_API = (typeof window !== 'undefined' && window.__SSP_YOUTRACK_API) || {};
  function _ytApiDeps() {
    return {
      diag: diag, host: _host, STATUS: STATUS, settings: _settings,
      markSavedAndCleanup: markSavedAndCleanup,
      saveRoleHistorySnapshot: saveRoleHistorySnapshot,
      updateGanttHistDOM: _updateGanttHistDOM,
      getGanttContainer: function () { return document.getElementById('ganttContainer'); },
      state: {
        getMode: function () { return _mode; },
        getActiveProjectKey: function () { return _activeProjectKey; },
        getSprint: function () { return _sprint; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        getActiveSubtab: function () { return _activeSubtab; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        setCurrentSprintRoleRec: function (r) { _currentSprintRoleRec = r; },
        getHistory: function () { return _history; },
        getGanttStateHist: function () { return _ganttStateHist; },
        setGanttStateHist: function (o) { _ganttStateHist = o; },
      },
    };
  }
  function _backendCall(path, baseOpts) { return YT_API._backendCall(path, baseOpts, _ytApiDeps()); }
  function apiGet(path) { return YT_API.apiGet(path, _ytApiDeps()); }
  function apiPost(path, body, query) { return YT_API.apiPost(path, body, query, _ytApiDeps()); }

  /* ═══ Инициализация ════════════════════════════════════════ */
  /* v5.0.3 (итерация 5) — timing-логи + retry для YTApp.register().
     В корп. сетях через прокси первая попытка может зависнуть/таймаутить;
     повторяем до 3 раз с экспоненциальной задержкой. */
  var _ytRegT0 = Date.now();
  diag('YTApp.register START', 'info');
  function _ytAppRegisterWithRetry(attempt) {
    attempt = attempt || 1;
    return YTApp.register().catch(function(err){
      if (attempt >= 3) {
        diag('YTApp.register FAILED after '+attempt+' attempts: '+(err&&err.message?err.message:err), 'err');
        /* UI fallback: показать баннер вместо тихого молчания. */
        try {
          var b = document.getElementById('bannerNotConfigured');
          if (b) {
            b.classList.remove('hidden');
            b.style.background = 'rgba(224,90,106,.18)';
            b.style.color = '#b13e4d';
            b.textContent = '⚠ Не удалось зарегистрировать виджет в YouTrack. Перезагрузите страницу (F5). Если ошибка повторяется — обратитесь к администратору.';
          }
        } catch(_){}
        throw err;
      }
      var delay = 500 * attempt;
      diag('YTApp.register attempt '+attempt+' failed, retry in '+delay+'ms: '+(err&&err.message?err.message:err), 'err');
      return new Promise(function(r){ setTimeout(r, delay); }).then(function(){
        return _ytAppRegisterWithRetry(attempt + 1);
      });
    });
  }
  _ytAppRegisterWithRetry().then(function(h) {
    diag('YTApp.register OK ('+(Date.now()-_ytRegT0)+'ms)', 'ok');
    _host = h;
    _ctx  = h.context;
    if (!_ytBase) {
      try {
        var bu = h.getBaseUrl ? h.getBaseUrl() : null;
        if (bu) {
          var bum = bu.match(/^(https?:\/\/[^\/]+)/);
          if (bum) _ytBase = bum[1];
          else if (bu.indexOf('http') === 0) _ytBase = bu.replace(/\/$/, '');
        }
      } catch(ex) { /* ignore */ }
    }
    /* #25 Ф1-A — НАДЁЖНЫЙ детект режима. host.context.project — нестандартное поле
       (нет в Host API), на YT 2026.1 пусто → раньше оба виджета падали в global.
       Источник истины: YTApp.widget.id (генерируемый id) / YTApp.entity (hosting-проект
       в PROJECT_SETTINGS, отсутствует в MAIN_MENU_ITEM) → legacy _ctx.project. */
    var _yt = (typeof YTApp !== 'undefined') ? YTApp : null;
    var _wid = (_yt && _yt.widget) ? String(_yt.widget.id || _yt.widget.key || '') : '';
    var _entType = (_yt && _yt.entity) ? String(_yt.entity.type || '') : '';
    var _entId   = (_yt && _yt.entity) ? String(_yt.entity.id || '') : '';
    var _legacyProj = (_ctx && _ctx.project) ? String(_ctx.project.id || _ctx.project.shortName || '') : '';
    diag('#25 mode signals: widget.id="' + _wid + '" entity.type="' + _entType + '" entity.id="' + _entId + '" ctx.project="' + _legacyProj + '"', 'info');
    if (_wid === 'ssp-main-global') {
      _mode = 'global';
    } else if (_wid === 'ssp-main') {
      _mode = 'project';
    } else if (/global/i.test(_wid)) {
      _mode = 'global';
    } else if (_entId && (!_entType || /Project/i.test(_entType))) {
      _mode = 'project';
    } else if (_legacyProj) {
      _mode = 'project';
    } else {
      _mode = 'global';
    }
    diag('#25 widget mode resolved = ' + _mode, 'ok');
    if (_mode === 'project') {
      _activeProjectKey = (_ctx && _ctx.project && (_ctx.project.shortName || _ctx.project.key))
        || (_yt && _yt.entity && (_yt.entity.shortName || _yt.entity.key)) || null;
      var _pname = (_ctx && _ctx.project && (_ctx.project.name || _ctx.project.shortName))
        || (_yt && _yt.entity && (_yt.entity.name || _yt.entity.shortName)) || '';
      if (_pname) { _projectDisplayName = _pname; _updateProjectNameLabel(); }
      _syncAclFireAndForget();
    } else {
      try { document.body.classList.add('ssp-global-mode'); } catch(_) {}
      /* #25 Ф2 — каркас дашборда (рельс+пейн) строим сразу после класса режима,
         пока DOM .page статичен; последующие рендеры/запросы по id работают (узлы в пейне). */
      try { _buildGlobalDashShell(); } catch(_) {}
    }
    if (typeof _loadAppVersion === 'function') { try { _loadAppVersion(); } catch(_) {} }
    /* v5.0.3 (итерация 5) — loadProjectGroups убран из критического пути
       (нужен только в settings-overlay; ленивая загрузка при openSettingsOverlay).
       На сетях через прокси GET /groups может занимать 5–10 секунд. */
    /* #25 Ф1 — loadMe (user-scoped) один раз; данные проекта грузятся ниже по режиму. */
    diag('init: loadMe START', 'info');
    return loadMe();
  }).then(function() {
    if (_mode === 'global') return _initGlobalProjectSelection();
    return _renderProjectSettingsPage();   // #25 Ф1-A — проект = страница настроек
  }).catch(function(e) {
    if (e === _NO_PROJECT_SENTINEL) { diag('global: awaiting project selection', 'info'); return; }
    diag('INIT ERROR: '+(e&&e.message?e.message:e),'err');
    toast(T('toastInitError')+(e&&e.message?e.message:e));
  });

  /* #25 Ф1 — загрузка+рендер данных активного проекта. Переиспользуется на init и смене проекта. */
  function _loadAndRenderProject() {
    var _initT0 = Date.now();
    diag('init: loadProjectFields START', 'info');
    return loadProjectFields().then(function() {
      diag('init: loadProjectFields OK ('+(Date.now()-_initT0)+'ms)', 'ok');
    }).then(function() {
    var t = Date.now();
    diag('init: loadAllData START', 'info');
    return loadAllData().then(function(r){
      diag('init: loadAllData OK ('+(Date.now()-t)+'ms)', 'ok');
      return r;
    });
  }).then(function() {
    /* v5.0.3 — снапшот серверной версии и хеш для сравнения с черновиком */
    _serverSnapshotSprint    = _sprint    ? deepClone(_sprint)    : null;
    _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null;
    _baseRevHash = computeRevHash(_sprint, _roleItems);
    /* v5.0.3 — серверный draft (localStorage недоступен в YouTrack iframe sandbox) */
    return _draftLoadFromBackend();
  }).then(function() {
    /* Накатить черновик из backend-памяти (если есть и не устарел) */
    restoreDraftIfAny();
    renderPlannerRoles();
    renderHistory();
    /* v5.2.0 — единоразовый onboarding-toast про lock строк после ALLOCATED */
    maybeShowAllocatedLockHint();
    /* v5.0.3 (итерация 5) — пересчитать resource-inputs во всех активных ролях,
       если включён режим usePersonalForResource. Без этого после F5 значения
       не отражались, потому что getPersonalPlanningResourceForRole/applyPersonalResourceToInputs
       раньше не были определены. */
    setTimeout(function(){
      if (typeof applyPersonalResourceToInputs === 'function') applyPersonalResourceToInputs();
    }, 50);
    /* v5.0.3 — bind live-listeners на стабильные инпуты шапки */
    bindSprintHeaderDraftListeners();
    /* v5.0.1 — видимость вкладки «Распределение задач» по personalPlanningEnabled.
       v5.0.3: ВЫЗЫВАЕМ ДО restoreUiState — иначе distrib-таб может быть скрыт
       на момент попытки восстановить активную вкладку. */
    applyPersonalPlanningVisibility();
    /* #25 Ф2 — в global-режиме при выборе/смене проекта всегда стартуем с уровня
       «Аллокация общего ресурса» (roles). Уровень «Распределение по исполнителям» на
       свежем открытии бывает пустым (роль ещё не выбрана, dropdown не наполнен) →
       перебиваем сохранённый ui.planningLevel ДО restoreUiState (без мигания). */
    if (_mode === 'global') {
      var _uiLvl = _draftGet('ui') || {};
      if (_uiLvl.planningLevel !== 'roles') { _uiLvl.planningLevel = 'roles'; _draftSet('ui', _uiLvl); }
    }
    /* v5.0.3 — восстановить UI-навигацию (активная вкладка/подвкладка/спринт-селектор) */
    restoreUiState();
    /* #36 — sprintId из share-ссылки приоритетнее восстановленного; невалидный → fallback-toast */
    if (_pendingShareParams && _pendingShareParams.sprintId) {
      if (_validSprintId(_pendingShareParams.sprintId)) {
        try { setCurrentSprintId(_pendingShareParams.sprintId, { confirmed: true }); } catch(e){ diag('share sprint apply err: '+e, 'err'); }
      } else {
        try { toast(T('sprintNotFoundFallback')); } catch(_){}
      }
    }
    /* #25 Ф2 — отрисовать активный уровень планирования ПОСЛЕ restoreUiState (именно там
       резолвится _currentSprintId). Без этого на свежем открытии проекта уровень пустой
       («Выберите спринт…») и наполнялся только по клику на вкладку уровня. */
    if (typeof _renderPlanningLevel === 'function') {
      try { _renderPlanningLevel(_planningLevel); } catch(e){ diag('init planning level render err: '+e, 'err'); }
    }
    /* #25 Ф2 Этап 3+4 — синхронизировать узел дерева с восстановленным tab/level
       (или сохранённый ui.dashNode). #36 — node из share-ссылки приоритетнее. */
    if (_mode === 'global' && typeof _setDashNode === 'function') {
      var _node = (_pendingShareParams && _pendingShareParams.node && SSP_DASH_NODES.indexOf(_pendingShareParams.node) >= 0)
        ? _pendingShareParams.node : null;
      if (!_node) {
        var _uiR = _draftGet('ui') || {};
        _node = _uiR.dashNode;
        if (SSP_DASH_NODES.indexOf(_node) < 0) _node = _deriveDashNodeFromTabLevel();
      }
      try { _setDashNode(_node); } catch(e){ diag('init dashNode err: '+e, 'err'); }
    }
    /* #36 — focus (scroll+flash), затем завершить restore: consume params + включить авто-синк URL. */
    if (_mode === 'global') {
      if (_pendingShareParams && _pendingShareParams.focus) { try { _applyShareFocus(_pendingShareParams.focus); } catch(_){} }
      _pendingShareParams = null;
      _urlSyncEnabled = true;
      try { _syncStateToUrl(); } catch(_){}
      try { _updateShareBtnState(); } catch(_){}
    }
    /* v5.0 — refresh кнопки перехода в overlay настроек (видимость по серверной проверке) */
    refreshOpenSettingsBtn();
    /* v5.0.1 — refresh кнопки «Очистить всю историю» (отдельная роль historyManager) */
    refreshClearHistoryBtn();
    /* ── I18N init: apply language and set selector ── */
    /* v1.1.0 — заполняем оба <select> 15 языками из bridge'а (LANGS), сортировка
       EN → RU → остальные по ISO-коду. Если bridge недоступен (offline-bundle test),
       fallback на исходные RU/EN опции из HTML. */
    _populateLangSelect(document.getElementById('langSel'));
    _populateLangSelect(document.getElementById('langSelSettings'));

    var langSelEl = document.getElementById('langSel');
    if (langSelEl) {
      langSelEl.value = _lang;
      // v5.0.1 — bind переключателя языка ВНУТРИ init-цепочки.
      // Это гарантирует, что DOM готов к моменту привязки (а не на самом верху IIFE,
      // когда YouTrack iframe мог ещё не отрендерить теги до конца).
      if (!langSelEl._sspBound) {
        langSelEl.addEventListener('change', function () { setLang(langSelEl.value); });
        langSelEl._sspBound = true;
      }
    }
    /* v5.1.0 — копия переключателя языка в settings overlay (секция «Прочее»). */
    var langSelSettingsEl = document.getElementById('langSelSettings');
    if (langSelSettingsEl) {
      langSelSettingsEl.value = _lang;
      if (!langSelSettingsEl._sspBound) {
        langSelSettingsEl.addEventListener('change', function () { setLang(langSelSettingsEl.value); });
        langSelSettingsEl._sspBound = true;
      }
    }
    applyI18N();
    /* v2.0.0 D6 — Ring Tabs mount (idempotent) после первой applyI18N в init. */
    try { if (typeof _mountTabsAndSync === 'function') _mountTabsAndSync(); } catch (_) {}
    /* v2.1.0 F1+F2+F3 — initial mount of Ring Input/Select/Collapse host-spans
       AFTER applyI18N (placeholder attribute is set there). Idempotent — safe
       to call again on language switch / dynamic re-render. */
    try { if (window.__SSP_INPUT)    window.__SSP_INPUT.mountAllIn(document); } catch (_) {}
    try { if (window.__SSP_SELECT)   window.__SSP_SELECT.mountAllIn(document); } catch (_) {}
    try { if (window.__SSP_COLLAPSE) window.__SSP_COLLAPSE.mountAllIn(document); } catch (_) {}
    applyIcons(); // v1.9.6 — sweep data-icon attrs → SVG spans (no-op on rerenders, data-icon removed after first pass)
    bindEmptyStateCtas(); // #43 W2 (B-2/D-1) — CTA статических empty-state'ов (идемпотентно)
    applyRingTheme(); // v1.9.9 — apply ring-variables_dark-dark on <html> for Ring CSS dark mode
    /* v5.0.3 — обновить индикатор черновика ПОСЛЕ applyI18N (иначе applyI18N
       не затрагивает текст бейджа без data-i18n, но переключение языка
       должно перенарисовать локализованную подпись с актуальным timestamp). */
    refreshDirtyIndicator();

    /* v2.2.0 Phase 6 #32 — settings открывается только через React-модалку (openSettingsModal).
       Старые binds closeBtn/saveBtn/nav-chip жили в #settingsOverlay DOM — демонтированы. */
    var openBtn  = document.getElementById('openSettingsBtn');
    if (openBtn  && !openBtn._sspBound)  { openBtn.addEventListener('click',  openSettingsModal);    openBtn._sspBound  = true; }
    /* v5.0.3 — bind кнопок локального черновика */
    bindClearDraftHandlers();
    /* Легаси Escape-хендлер (.overlay/модальный стек) демонтирован с модал-фасадом —
       Ring-модалки закрывает их собственный capture-listener (modal-mount.jsx). */

    /* ── Version badge ──
       v5.6.0 (D40, закрывает KL#3 v5.4.0 полностью): _loadAppVersion() с TTL-кешем 5 мин
       в localStorage.ssp_app_version_cache. Cache hit → синхронная подстановка из кеша.
       Cache miss → синхронный fallback на runtime APP_VERSION + async fetch из backend
       endpoint app-version (D40). При network error fallback остаётся.
       Версия теперь живёт в одном месте — manifest.json/version, backend читает её при
       сборке (хардкод синхронно с APP_VERSION в frontend по правилу проекта). */
    if (typeof _loadAppVersion === 'function') {
      try { _loadAppVersion(); } catch(e){ diag('_loadAppVersion err: '+e,'err'); }
    }
    diag('Init complete','ok');
  }).catch(function(e) {
    diag('INIT ERROR: '+(e&&e.message?e.message:e),'err');
    toast(T('toastInitError')+(e&&e.message?e.message:e));
  });
  } /* /_loadAndRenderProject (#25 Ф1) */

  /* ═══ #25 Ф1-A — проектный виджет = страница настроек (планер уехал в главное меню) ══ */

  function _loadSettingsOnly() {
    return apiGet('sprint-data').then(function (r) {
      _settings = (r && r.settings) || null;
    }).catch(function () {});
  }

  function _renderProjectSettingsPage() {
    diag('project mode -> settings page', 'info');
    return Promise.all([
      loadProjectFields(),
      _loadSettingsOnly(),
      (typeof loadProjectGroups === 'function' ? loadProjectGroups().catch(function () {}) : Promise.resolve())
    ]).then(function () {
      return apiGet('check-settings-manager').catch(function () { return null; });
    }).then(function (r) {
      var canManage  = !!(r && r.canManage);
      var configured = !!(r && r.configured);
      document.body.classList.add('ssp-project-settings-mode');
      var banner = document.getElementById('projectSettingsBanner');
      if (banner) { banner.textContent = T('projectMovedToMenu'); banner.classList.remove('hidden'); }
      try { _populateLangSelect(document.getElementById('langSel')); } catch (_) {}
      var langSelEl = document.getElementById('langSel');
      if (langSelEl) {
        langSelEl.value = _lang;
        if (!langSelEl._sspBound) { langSelEl.addEventListener('change', function () { setLang(langSelEl.value); }); langSelEl._sspBound = true; }
      }
      applyI18N();
      try { applyIcons(); } catch (_) {}
      try { applyRingTheme(); } catch (_) {}
      if (typeof _loadAppVersion === 'function') { try { _loadAppVersion(); } catch (_) {} }
      _mountProjectSettings(canManage, configured);
      diag('project settings page rendered (canManage=' + canManage + ', configured=' + configured + ')', 'info');
    });
  }

  function _mountProjectSettings(canManage, configured) {
    var host = document.getElementById('projectSettingsHost');
    if (!host) return;
    var ro = !canManage || !configured;
    host.classList.toggle('ssp-settings-readonly', ro);
    if (!window.__SSP_RING_MODAL || typeof window.__SSP_RING_MODAL.mountInline !== 'function') {
      host.textContent = T('settingsNotConfiguredHint');
      return;
    }
    var props = _buildSettingsFormProps(function () { _renderProjectSettingsPage(); });
    window.__SSP_RING_MODAL.mountInline(host, 'settingsForm', props);
  }

  /* ═══ #25 Ф1 — global-режим: picker проекта + смена проекта ════════════════ */

  function _syncAclFireAndForget() {
    try { apiPost('sync-acl', {}).then(function(){}, function(){}); } catch (_) {}
  }

  var _LAST_PROJECT_LS_KEY = 'ssp_last_project_key';
  function _getLastProjectKey() { try { return safeLs.get(_LAST_PROJECT_LS_KEY) || null; } catch (_) { return null; } }
  function _setLastProjectKey(k) { try { if (k) safeLs.set(_LAST_PROJECT_LS_KEY, k); } catch (_) {} }

  function _loadGlobalProjectList() {
    return _host.fetchYouTrack('admin/projects', { query: { fields: 'id,name,shortName,archived', '$top': 5000 } })
      .then(function (list) {
        var keys = [];
        (list || []).forEach(function (p) {
          if (p && p.shortName && !p.archived) keys.push(p.shortName);
        });
        if (!keys.length) return [];
        return apiPost('filter-planner-projects', { keys: keys }).then(function (r) {
          return (r && r.projects) || [];
        });
      }).catch(function (e) {
        diag('loadGlobalProjectList ERR: ' + (e && e.message ? e.message : e), 'err');
        return [];
      });
  }

  function _renderProjectPicker() {
    var wrap = document.getElementById('globalProjectPicker');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    var sel = document.getElementById('globalProjectSelect');
    if (!sel) {
      var label = document.createElement('span');
      label.className = 'ssp-global-project-label';
      label.setAttribute('data-i18n', 'globalProjectLabel');
      label.textContent = T('globalProjectLabel');
      sel = document.createElement('select');
      sel.id = 'globalProjectSelect';
      sel.className = 'ssp-global-project-select';
      sel.addEventListener('change', function () { _onProjectPicked(sel.value); });
      wrap.appendChild(label);
      wrap.appendChild(sel);
    }
    sel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.setAttribute('data-i18n', 'globalProjectPlaceholder');
    ph.textContent = T('globalProjectPlaceholder');
    sel.appendChild(ph);
    _globalProjects.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.key;
      o.textContent = p.name + ' (' + p.key + ')';
      sel.appendChild(o);
    });
    if (_activeProjectKey) sel.value = _activeProjectKey;
  }

  function _setPickerValue(k) {
    var sel = document.getElementById('globalProjectSelect');
    if (sel) sel.value = k || '';
  }

  function _setGlobalBanner(textKey, sub) {
    var b = document.getElementById('globalNoProjectBanner');
    if (!b) return;
    if (textKey) {
      var txt = T(textKey);
      if (sub != null) txt = txt.replace('{key}', String(sub));   /* #36 — noAccessToProject {key} */
      b.textContent = txt;
      b.classList.remove('hidden');
    } else b.classList.add('hidden');
  }

  function _initGlobalProjectSelection() {
    _urlSyncEnabled = false;   /* #36 — не синкать URL во время init-restore (иначе затрём sprintId) */
    return _readShareParams().then(function (share) {
      /* #36 — restore триггерится только при наличии projectKey (ядро ссылки); иначе игнор. */
      _pendingShareParams = (share && share.projectKey) ? share : null;
      return _loadGlobalProjectList();
    }).then(function (projects) {
      _globalProjects = projects || [];
      _renderProjectPicker();
      if (!_globalProjects.length) {
        _setGlobalBanner('globalNoProjects');
        throw _NO_PROJECT_SENTINEL;
      }
      var share = _pendingShareParams || {};
      var initKey = null;
      /* #36 — projectKey из ссылки приоритетнее last-used */
      if (share.projectKey) {
        if (_globalProjects.some(function (p) { return p.key === share.projectKey; })) {
          initKey = share.projectKey;
        } else {
          /* проект из ссылки недоступен/планер не подключён — banner, остаёмся на picker'е (D6) */
          _setGlobalBanner('noAccessToProject', share.projectKey);
          _pendingShareParams = null;
          throw _NO_PROJECT_SENTINEL;
        }
      }
      if (!initKey) {
        var last = _getLastProjectKey();
        if (last && _globalProjects.some(function (p) { return p.key === last; })) initKey = last;
        else if (_globalProjects.length === 1) initKey = _globalProjects[0].key;
      }
      if (!initKey) {
        _setGlobalBanner('globalPickPrompt');
        throw _NO_PROJECT_SENTINEL;
      }
      _applyActiveProject(initKey);
      _setGlobalBanner(null);
      return _loadAndRenderProject();
    });
  }

  function _applyActiveProject(key) {
    _activeProjectKey = key;
    _setPickerValue(key);
    _setLastProjectKey(key);
    var p = _globalProjects.filter(function (x) { return x.key === key; })[0];
    _projectDisplayName = (p && p.name) ? p.name : key;
    try { _updateProjectNameLabel(); } catch (_) {}
    try { _syncStateToUrl(); } catch (_) {}   /* #36 — авто-синк state→URL (no-op до _urlSyncEnabled) */
  }

  /* ═══ #36 Share-URL (deep-link + handoff) ═══════════════════════════════
     Вынесено в share-controller.js (Фаза 5 слайс 2, коммит В) за мост
     window.__SSP_SHARE_CTRL (⚠️ _SHARE_APP_PATH per-fork — DIFF_MAP §9);
     golden-контракты — permissions-share.golden.test.js (идут через эти
     делегаторы). Deps-фабрика per-call: стейт share-цепочки (_host/_mode/
     _urlSyncEnabled/проект/спринт/_ytBase/_sprint/_history) остаётся в
     монолите — init-restore пишет _urlSyncEnabled/_pendingShareParams. */
  var SHARE_CTRL = (typeof window !== 'undefined' && window.__SSP_SHARE_CTRL) || {};
  function _shareDeps() {
    return {
      T: T, toast: toast, diag: diag,
      state: {
        getHost: function () { return _host; },
        getMode: function () { return _mode; },
        getUrlSyncEnabled: function () { return _urlSyncEnabled; },
        getActiveProjectKey: function () { return _activeProjectKey; },
        getCurrentSprintId: function () { return _currentSprintId; },
        getYtBase: function () { return _ytBase; },
        getSprint: function () { return _sprint; },
        getHistory: function () { return _history; },
      },
    };
  }
  function _navAvailable() { return SHARE_CTRL._navAvailable(_shareDeps()); }
  function _readShareParams() { return SHARE_CTRL._readShareParams(_shareDeps()); }
  function _syncStateToUrl() { return SHARE_CTRL._syncStateToUrl(_shareDeps()); }
  function _validSprintId(id) { return SHARE_CTRL._validSprintId(id, _shareDeps()); }
  function _applyShareFocus(focus) { return SHARE_CTRL._applyShareFocus(focus, _shareDeps()); }
  /* Делегатор-точка входа share-голденов (как computeRoleQuickStats в слайсе 3);
     прод-caller — _onShareClick внутри модуля. */
  function _buildShareHref() { return SHARE_CTRL._buildShareHref(_shareDeps()); }
  function _onShareClick() { return SHARE_CTRL._onShareClick(_shareDeps()); }

  /* Состояние кнопки «Поделиться» в рельсе (#36) — вынесено в header-view.js
     (Тир D слайс 5, ступень 1, коммит В); делегатор для callers share-цепочки
     и init-зоны рельса. */
  function _updateShareBtnState() { return HEADER_VIEW._updateShareBtnState(_headerDeps()); }


  function _onProjectPicked(newKey) {
    if (!newKey || newKey === _activeProjectKey) return;
    if (_draftIsDirty()) {
      _confirmDiscardAndSwitch(
        function onConfirm() { _switchToProject(newKey); },
        function onCancel()  { _setPickerValue(_activeProjectKey); }
      );
    } else {
      _switchToProject(newKey);
    }
  }

  function _switchToProject(newKey) {
    diag('switch project -> ' + newKey, 'info');
    _resetProjectStateCaches();
    _applyActiveProject(newKey);
    _setGlobalBanner(null);
    _loadAndRenderProject().catch(function (e) {
      diag('switch load ERR: ' + (e && e.message ? e.message : e), 'err');
    });
  }

  function _resetProjectStateCaches() {
    _sprint = null;
    _roleItems = {};
    _history = [];
    _settings = null;
    _projectFields = [];
    _serverSnapshotSprint = null;
    _serverSnapshotRoleItems = null;
    _baseRevHash = '';
    _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
    _draftPending = false;
    _currentSprintId = null;
    _activeSubtab = null;
    _workingDrafts = {};
    _workingDraftsLoaded = false;
    _activeWorkingDraftKey = null;
    _currentSprintRoleRec = null;
    _currentRoleGantt = null;
    _ganttStateHist = {};
    _permissionsCheckPromise = null;
    _isValidator = false;
    _isEditor = false;
    _isAssigner = false;
  }

  function _confirmDiscardAndSwitch(onConfirm, onCancel) {
    if (!window.__SSP_RING_MODAL) {
      var ok = true;
      try { ok = window.confirm(T('globalSwitchDiscardMsg')); } catch (_) { ok = true; }
      if (ok) onConfirm(); else onCancel();
      return;
    }
    var decided = false;
    openModal({
      id: 'globalSwitchConfirm',
      type: 'confirm',
      title: T('globalSwitchDiscardTitle'),
      body: { kind: 'text', text: T('globalSwitchDiscardMsg') },
      buttons: [
        { id: 'cancel', text: T('globalSwitchCancel'), variant: 'secondary',
          onClick: function (api) { decided = true; onCancel(); api.close(); } },
        { id: 'ok', text: T('globalSwitchDiscardConfirm'), variant: 'primary',
          onClick: function (api) { decided = true; onConfirm(); api.close(); } }
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: true,
      onClose: function () { if (!decided) onCancel(); }
    });
  }

  /**
   * v5.0 — обновить видимость и поведение кнопки перехода в виджет настроек.
   * Видимость определяется ИСКЛЮЧИТЕЛЬНО серверной проверкой (check-settings-manager).
   * Параллельно: если плагин не сконфигурирован (configured:false) — показываем
   * глобальный баннер #bannerNotConfigured и прячем вкладки.
   */
  function refreshOpenSettingsBtn() {
    var btn    = document.getElementById('openSettingsBtn');
    var banner = document.getElementById('bannerNotConfigured');
    apiGet('check-settings-manager').then(function(r) {
      var canManage  = !!(r && r.canManage);
      var configured = !!(r && r.configured);
      diag('check-settings-manager: configured='+configured+' canManage='+canManage,'info');

      // Глобальный баннер «не настроен» (видим всем пользователям, не только settings-менеджерам)
      if (banner) {
        if (configured) banner.classList.add('hidden');
        else            banner.classList.remove('hidden');
      }

      // Кнопка открытия overlay настроек — только для settings-менеджеров
      if (!btn) return;
      btn.style.display = canManage ? '' : 'none';
    }).catch(function(e) {
      diag('refreshOpenSettingsBtn ERR: '+String(e),'err');
      if (btn) btn.style.display = 'none';
    });
  }

  /**
   * v5.0.1 — открытие/закрытие settings-overlay внутри ssp-main.
   * Открытие выполняет повторную серверную проверку через /check-settings-manager.
   * Закрытие — просто скрывает overlay, никакой mutation. Никаких deep-link/новых tab.
   */

  /**
   * v5.0.1 — bind интерактивных элементов settings-формы (один раз, через _sspBound).
   * Эти три чекбокса рендерятся прямо в HTML (не через JS), поэтому их bind
   * не делается в renderRolesGrid и должен быть отдельным.
   */
  /**
   * v5.0.1 — управление видимостью вкладки «Распределение задач».
   * Зависит от _settings.personalPlanningEnabled. Вызывается:
   *   - после init/loadAllData (стартовая видимость);
   *   - после успешного doSaveSettings (если параметр изменили).
   */
  function applyPersonalPlanningVisibility() {
    /* v5.6.0 — Этап 4 (4c): legacy tabBtnDistrib физически удалён в C2.
       Видимость уровня «Люди» внутри tab-planning теперь регулируется через
       _applyPersonalPlanningToSegmentedControl (D36 v5.5.0, дёргается из applyModesDependencies).
       Если уровень выключен и сейчас activeTab === 'planning' с уровнем 'people' —
       _applyPersonalPlanningToSegmentedControl делает fallback на 'roles'. */
    if (typeof _applyPersonalPlanningToSegmentedControl === 'function') {
      try { _applyPersonalPlanningToSegmentedControl(); } catch(_){}
    }
  }


  /**
   * v5.1.0 — Применить parent/child зависимости feature-flags в overlay.
   * Дочерний usePersonalForResource блокируется (визуально + пointer-events) при
   * выключенном parent personalPlanning. Читает текущее DOM-состояние чекбокса parent
   * (а не _settings), чтобы реагировать на ещё не сохранённые правки в форме.
   */


  /* ═══ v2.2.0 Phase 5 #32 — settingsOverlay → bespoke SettingsForm в Ring Dialog ═══
     openSettingsModal заменяет vanilla openSettingsOverlay: 3 состояния доступа
     (not-configured / denied → kind:'text'; canManage → component 'settingsForm').
     Старый openSettingsOverlay/applySettingsUI/collectSettings/doSaveSettings + DOM
     #settingsOverlay живут параллельно до Phase 6 (demount). */

  /* Списки имён полей проекта по типам (зеркалит фильтр fillFieldSelect). */
  function _buildFieldsByType() {
    function ofTypes(allowed) {
      var out = [];
      (_projectFields || []).forEach(function (f) {
        var ty = (f.type || '').toLowerCase();
        if (allowed.some(function (at) { return ty.indexOf((at || '').toLowerCase()) >= 0; })) out.push(f.name);
      });
      return out;
    }
    return {
      priority:         ofTypes(['enum']),
      xpriority:        ofTypes(['enum']),
      state:            ofTypes(['state', 'enum']),
      system:           ofTypes(['enum', 'owned']),
      externalTicketId: ofTypes(['string']),
      sprint:           ofTypes(['enum']),
      version:          ofTypes(['version', 'build']),
      period:           ofTypes(['period']),
      user:             ofTypes(['user']),
      /* 5c — cascade kind-field (enum-поля проекта). */
      enumFields:       ofTypes(['enum']),
    };
  }

  /* Сохранение settings из bespoke-формы. Возвращает Promise<{success}|{success:false,reason}>.
     Дословно зеркалит post-save хвост doSaveSettings (cache-invalidate, _settings,
     project-default lang, feature-bar, soft-warn, права/видимость, re-render). */
  function _saveSettingsData(data) {
    data.savedAt = Date.now();
    return apiPost('sprint-data', { settings: data }).then(function (resp) {
      if (!resp || !resp.success) {
        var reason = (resp && resp.reason) || (resp && resp.error) || 'unknown';
        toast(T('toastSettingsErr'), 'err');
        return { success: false, reason: reason };
      }
      try {
        if (_settings && (_settings.fieldSprint  !== data.fieldSprint))  invalidateFieldValuesCache(_settings.fieldSprint);
        if (_settings && (_settings.fieldVersion !== data.fieldVersion)) invalidateFieldValuesCache(_settings.fieldVersion);
      } catch (_) {}
      _settings = data;
      _syncProjectDefaultLang();
      _refreshFeatureStatusBar();
      var bc = document.getElementById('bannerCfg');
      if (bc) bc.classList.add('hidden');
      toast(T('toastSettingsSaved'), 'success');
      var missingRequired = [];
      if (!data.fieldPriority) missingRequired.push(T('fldPriority'));
      if (!data.fieldState)    missingRequired.push(T('fldState'));
      if (missingRequired.length) {
        setTimeout(function () {
          toast(T('toastRequiredFieldsMissing') + ': ' + missingRequired.join(', '), 'warn');
        }, 400);
      }
      checkValidator();
      checkEditorRights();
      checkAssignerRights();
      applyPersonalPlanningVisibility();
      refreshClearHistoryBtn();
      renderPlannerRoles();
      try { _applyDiagLogVisibility(); } catch (_) {}
      return { success: true };
    });
  }

  /* #25 Ф1-A — сборка props формы настроек (модалка global + inline-страница проекта). */
  function _buildSettingsFormProps(onCloseFn) {
    var langs = (typeof window !== 'undefined' && window.__SSP_I18N_LANGS__) || [];
    var defaultLangOptions = langs.map(function (l) {
      return { value: l.code, label: (l.flag ? l.flag + ' ' : '') + l.native + ' (' + l.code + ')' };
    });
    return {
      initial:            _settings || {},
      roles:              ALL_ROLES,
      fieldsByType:       _buildFieldsByType(),
      defaultLangOptions: defaultLangOptions,
      uiLang:             _lang,
      t:                  T,
      initialGroups:      _projectGroups || [],
      loadGroups:         function () { return loadProjectGroups().then(function () { return _projectGroups; }); },
      enumFields:         (_buildFieldsByType().enumFields) || [],
      stateFieldName:     (_settings && typeof _settings.fieldState === 'string' && _settings.fieldState) ? _settings.fieldState : 'State',
      loadFieldValues:    function (fieldName) {
        if (!fieldName) return Promise.resolve([]);
        if (_fieldValuesCache[fieldName]) return Promise.resolve(_fieldValuesCache[fieldName].values || []);
        return apiGet('field-values?fieldName=' + encodeURIComponent(fieldName)).then(function (r) {
          if (r && r.success && r.values) _fieldValuesCache[fieldName] = r;
          return (r && r.values) || [];
        }).catch(function () { return []; });
      },
      onUiLangChange:     function (lang) { setLang(lang); },
      onSave:             _saveSettingsData,
      onClose:            onCloseFn,
    };
  }

  function openSettingsModal() {
    apiGet('check-settings-manager').then(function (r) {
      diag('settingsModal open: configured=' + (r && r.configured) + ' canManage=' + (r && r.canManage), 'info');

      if (!r || !r.configured) {
        openModal({
          id: 'settingsAccess', type: 'info', title: T('appTitleSettings'),
          body: { kind: 'text', text: T('settingsNotConfiguredHint') },
          buttons: [{ id: 'ok', text: T('btnCancel'), variant: 'primary', onClick: function (h) { h.close(); } }],
          dismissOnBackdrop: true, showCloseButton: true,
        });
        return;
      }
      if (!r.canManage) {
        var txt = T('settingsNoAccessHint');
        if (r.groupName) txt += ' (' + T('settingsNoAccessGroup').replace('{group}', r.groupName) + ')';
        openModal({
          id: 'settingsAccess', type: 'info', title: T('appTitleSettings'),
          body: { kind: 'text', text: txt },
          buttons: [{ id: 'ok', text: T('btnCancel'), variant: 'primary', onClick: function (h) { h.close(); } }],
          dismissOnBackdrop: true, showCloseButton: true,
        });
        return;
      }

      /* canManage → форма. Lazy-load групп (для 5b multi-select). */
      if (typeof loadProjectGroups === 'function' && !window._sspGroupsLoaded) {
        window._sspGroupsLoaded = true;
        loadProjectGroups().catch(function (e) { diag('lazy loadProjectGroups err: ' + e, 'err'); });
      }

      var handle = openModal({
        id: 'settings', type: 'form', title: T('appTitleSettings'),
        dialogClass: 'ssp-ring-modal--wide ssp-ring-modal--settings',
        body: { kind: 'component', name: 'settingsForm',
          props: _buildSettingsFormProps(function () { if (handle) handle.close(); }) },
        buttons: [],
        dismissOnBackdrop: false,
        blockEscape: false,
        /* showCloseButton:false — форма рисует свой явный × (ssp-settings-close). */
        showCloseButton: false,
        onClose: function () { /* idемпотентный close из foundation */ },
      });
    }).catch(function (e) {
      diag('openSettingsModal check ERR: ' + String(e), 'err');
      toast(T('toastInitError') + (e && e.message ? e.message : String(e)), 'err');
    });
  }

  /* ── Загрузка данных ── */
  function loadMe() {
    return _host.fetchYouTrack('users/me', { query: { fields: 'id,login,fullName' } })
      .then(function(u){ _currentUser = u; diag('me=' + (u&&u.login?u.login:'?'), 'ok'); })
      .catch(function(e){ _currentUser = {login: 'unknown'}; diag('me ERR: ' + String(e), 'err'); });
  }

  function loadProjectFields() {
    return apiGet('project-fields').then(function(r) {
      if (r && r.success) {
        _projectFields = r.fields || [];
        diag('Fields loaded: '+_projectFields.length,'ok');
        if (r.projectName) {
          /* v1.4.1 — раньше textContent выставлялся только если он пустой; теперь
             всегда обновляем кэш и пере-применяем helper, чтобы projectNameLabel
             корректно перерисовывался при последующих setLang(). */
          _projectDisplayName = r.projectName;
          _updateProjectNameLabel();
        }
        _ytBaseFromProject();
      }
    }).catch(function(){});
  }

  function loadProjectGroups() {
    return _host.fetchYouTrack('groups', {
      query: { fields: 'id,name', $top: 5000 }
    }).then(function(g){
      var raw = Array.isArray(g) ? g : [];
      _projectGroups = raw
        .filter(function(gr){ return !!gr.id; })
        .map(function(gr) {
          var name = (gr.name && gr.name.trim()) ? gr.name.trim() : gr.id;
          return { id: gr.id, name: name };
        });
      diag('Groups loaded: ' + _projectGroups.length, 'ok');
      // v5.0: рендер multi-select групп выполняется в виджете настроек.
      // В main.js _projectGroups держится только как справочник для отображения
      // имён групп (например, в баннерах прав).
    }).catch(function(e){ _projectGroups = []; diag('Groups ERR: ' + String(e), 'err'); });
  }

  /* v1.3.1 — Status-bar активных функциональных модулей. Обновляет
     визуальное состояние (зелёная/красная точка + локализованный лейбл
     on/off) для 4 chip'ов в widget-statusbar. Вызывается после каждого
     обновления _settings (initial load, save) и после applyI18N (смена
     языка, чтобы локализованный «on/off» подхватился). */
  function _refreshFeatureStatusBar() {
    var bar = document.getElementById('widgetStatusBar');
    if (!bar) return;
    /* Если _settings ещё не загружено (init не закончен) — оставляем все
       chip'ы в нейтральном состоянии. */
    var s = _settings || {};
    var modules = [
      { id: 'ssbInline',   on: !!s.dynEditEnabled },
      { id: 'ssbPersonal', on: !!s.personalPlanningEnabled },
      { id: 'ssbDta',         on: !!s.dtaEnabled },
      { id: 'ssbCascade',     on: !!s.cascadeAggregationEnabled },
      { id: 'ssbStateRollup', on: !!s.stateRollupEnabled }, /* v1.7.0 D128 */
      { id: 'ssbOverlimit', on: !!s.allowOverlimitPlanning } /* #38 */
    ];
    modules.forEach(function(m) {
      var el = document.getElementById(m.id);
      if (!el) return;
      el.classList.toggle('ssb-on',  m.on);
      el.classList.toggle('ssb-off', !m.on);
      var stateEl = el.querySelector('.ssb-chip__state');
      if (stateEl) {
        var key = m.on ? 'ssbOn' : 'ssbOff';
        stateEl.setAttribute('data-i18n', key);
        stateEl.textContent = T(key);
      }
    });
  }

  function loadAllData() {
    return apiGet('sprint-data').then(function(r) {
      if (r && r.success) {
        _settings = r.settings || null;
        /* v1.1.0 — после загрузки _settings подтянуть project-default язык в loader.
           Если localStorage.ssp_lang уже есть, project-default сработает только для
           НОВЫХ пользователей через цепочку getCurrentLang(). */
        _syncProjectDefaultLang();
        /* v1.3.1 — обновить status-bar активных модулей сразу после load. */
        _refreshFeatureStatusBar();
        _sprint   = r.sprint   || null;
        // roleItems хранится в r.roleItems (новый формат)
        if (r.roleItems) {
          _roleItems = r.roleItems;
        } else if (r.items && Array.isArray(r.items)) {
          // Обратная совместимость: все items попадают в 'analysis' (первая роль)
          _roleItems = { analysis: r.items };
        } else {
          _roleItems = {};
        }
        /* v5.0.3 диагностика — структура _roleItems после load */
        try {
          var rkSummary = Object.keys(_roleItems).map(function(rk){
            return rk+'='+(_roleItems[rk] ? _roleItems[rk].length : 'null');
          }).join(', ');
          diag('loadAllData: _sprint='+(_sprint?_sprint.sprintId:'null')+' _roleItems={'+rkSummary+'}', 'info');
        } catch(_){}
        if (!_sprint) {
          _sprint = { sprintId: uid(), dateStart: null, dateEnd: null, status: STATUS.PLANNING };
        }
        // v5.0 — defensive миграция статусов и inclusion-статусов:
        // backend нормализует на чтении, но мы дублируем как защиту от стэйла кэшей.
        if (_sprint.status) _sprint.status = migrateStatus(_sprint.status);
        ALL_ROLES.forEach(function(role) {
          var items = _roleItems[role.key] || [];
          items.forEach(function(item) {
            if (item.inclusionStatus) item.inclusionStatus = migrateInc(item.inclusionStatus);
            if (!item.url || item.url.indexOf('/null/') >= 0 || item.url.indexOf('/undefined/') >= 0) {
              item.url = _ytBase + '/issue/' + item.issueId;
            }
            /* v5.0.3 — defensive: strip sprintId, который раньше клиент клал на items.
               backend `ALLOWED_ITEM_KEYS` не содержит этот ключ → следующий POST бы валился.
               Удаляем тут, чтобы in-memory было чистое для записи. */
            if (item.sprintId !== undefined) delete item.sprintId;
          });
        });
        _enableDebugLog = !!(r.enableDebugLog);
        /* v5.9.0 — D59: backend централизованно вычисляет orphan-задачи (legacy gantt.tasks
           без taskAssignments) и кладёт массив issueId в r.orphanGanttIssues. Frontend
           прокидывает на _sprint, баннер рендерится через _renderOrphanGanttBanner. */
        if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
          _sprint._orphanGanttIssues = r.orphanGanttIssues;
        }
        /* v5.0.3 — diag panel ВСЕГДА видна (collapsed по умолчанию). Пользователь
           сам разворачивает при необходимости. enableDebugLog по-прежнему влияет
           на server-side log verbosity, но не на видимость UI-панели. */
        var diagWrap = document.getElementById('diagWrap');
        if (diagWrap) diagWrap.style.display = '';
        try { _applyDiagLogVisibility(); } catch(_){}
        diag('Data loaded. settings='+(!!_settings)+' debugLog='+_enableDebugLog, 'ok');
      }
    }).then(function(){
      return apiGet('history').then(function(r){
        if(r&&r.success) {
          _history = (r.history || []).sort(function(a,b){ return (b.confirmedAt || 0) - (a.confirmedAt || 0); });
          // v5.0 — defensive миграция истории
          var ogMap = (r.orphanGanttBySprintId && typeof r.orphanGanttBySprintId === 'object')
                      ? r.orphanGanttBySprintId : null;
          _history.forEach(function(rec){
            if (rec.status) rec.status = migrateStatus(rec.status);
            if (Array.isArray(rec.items)) {
              rec.items.forEach(function(it){
                if (it.inclusionStatus) it.inclusionStatus = migrateInc(it.inclusionStatus);
              });
            }
            /* v5.9.0 — D59: per-snapshot orphan-флаг из backend response. */
            if (ogMap && rec && rec.sprintId && Array.isArray(ogMap[rec.sprintId]) && ogMap[rec.sprintId].length) {
              rec._orphanGanttIssues = ogMap[rec.sprintId];
            }
          });
        }
      });
    }).then(function(){
      /* v5.3.0 — параллельно с историей: working copies (immutable snapshots model). */
      return _workingDraftsLoadFromBackend().then(function(){
        /* После загрузки и _history, и _workingDrafts — выровнять флаги hasWorkingCopy
           и удалить orphan/stale (>30 дней) drafts. Идёт ДО миграции v5.2→v5.3. */
        try { reconcileHasWorkingCopyFlag(); } catch(e){ diag('reconcile failed: '+e,'err'); }
        try { gcWorkingDrafts(); }            catch(e){ diag('gc failed: '+e,'err'); }
        try { migrateEditingFromHistoryV52(); } catch(e){ diag('v5.2 migration failed: '+e,'err'); }
      });
    }).catch(function(e){ diag('loadAllData ERR: '+e,'err'); });
  }

  /* ═══ Диагностика ══════════════════════════════════════════ */
  /* v5.0.1 hotfix: элементы #diagToggle/#diagClearBtn были внутри удалённой
     вкладки настроек. Защищаем bind'ы, чтобы getElementById(null) не валил
     всю инициализацию IIFE. */
  (function () {
    var dt = document.getElementById('diagToggle');
    if (dt) {
      dt.addEventListener('click', function () {
        var log = document.getElementById('diagLog');
        var clearBtn = document.getElementById('diagClearBtn');
        if (!log) return;
        log.classList.toggle('open');
        var isOpen = log.classList.contains('open');
        this.textContent = isOpen ? '▼ ' + T('tabSettings').replace('⚙ ','') : '▶ ' + T('tabSettings').replace('⚙ ','');
        if (clearBtn) clearBtn.style.display = isOpen ? '' : 'none';
      });
    }
    var dc = document.getElementById('diagClearBtn');
    if (dc) {
      dc.addEventListener('click', function (e) {
        /* v5.0.3 — не даём клику всплыть в <summary>, иначе свернётся <details> */
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        _diagLines = [];
        var log = document.getElementById('diagLog');
        if (log) log.innerHTML = '';
        diag('Лог очищен', 'ok');
      });
    }
    /* v6.3.0 D110 — экспорт диагностического лога в TXT-файл (download через Blob). */
    var de = document.getElementById('diagExportBtn');
    if (de) {
      de.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        if (!_diagLines || !_diagLines.length) {
          try { toast(T('toastLogEmpty'), 'warn'); } catch(_){}
          return;
        }
        try {
          var ts = new Date();
          var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
          var stamp = ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate())
                    + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
          var header = 'Smart Sprint Planner diag log\n'
                     + 'version: ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?') + '\n'
                     + 'exported: ' + ts.toISOString() + '\n'
                     + 'lines: ' + _diagLines.length + '\n'
                     + '---\n';
          var body = _diagLines.map(function(line){
            return '[' + (line.type || 'info') + '] ' + (line.msg || '');
          }).join('\n');
          var blob = new Blob([header + body + '\n'], { type: 'text/plain;charset=utf-8' });
          var url  = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'ssp-diag-' + stamp + '.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
          try { toast(T('toastLogExported'), 'success'); } catch(_){}
        } catch (err) {
          diag('diag export err: ' + err, 'err');
        }
      });
    }
  })();

  /* v6.3.0 D110 — применить настройку hideDiagLogUi: при true прячет блок #diagWrap.
     Записи в _diagLines продолжают идти в память, доступны через экспорт TXT после
     снятия флага. */
  function _applyDiagLogVisibility() {
    var wrap = document.getElementById('diagWrap');
    if (!wrap) return;
    var hide = !!(_settings && _settings.hideDiagLogUi);
    wrap.style.display = hide ? 'none' : '';
  }

  /* v2.0.0 D6 — Ring Tabs visual driver поверх hidden tab-btn state-trackers.
     При смене языка / init собирает свежие T() лейблы, перерисовывает host.
     onSelect → programmatic click на скрытый .tab-btn — это запускает существующий
     handler ниже без изменений (toggle .active, show/hide panels, side-effects). */
  function _mountTabsAndSync() {
    var host = document.getElementById('sspTabsHost');
    if (!host) return;
    host.dataset.tabsJson = JSON.stringify([
      { id: 'planning', title: T('tabPlanning') || 'Планирование' },
      { id: 'gantt',    title: T('tabGantt')    || 'Диаграмма Ганта' },
      { id: 'history',  title: T('tabHistory')  || 'История спринтов' }
    ]);
    /* Sync selected from active tracker (если кто-то уже выбрал tab до mount). */
    var activeTracker = document.querySelector('.tab-btn.tab-state-tracker.active');
    if (activeTracker && activeTracker.dataset.tab) {
      host.dataset.selected = activeTracker.dataset.tab;
    }
    if (!host._sspTabsChangeBound) {
      host._sspTabsChangeBound = true;
      host.addEventListener('change', function() {
        var sel = host.dataset.selected;
        if (!sel) return;
        var tracker = document.querySelector('.tab-btn.tab-state-tracker[data-tab="' + sel + '"]');
        if (tracker) tracker.click();
      });
    }
    if (window.__SSP_TABS && typeof window.__SSP_TABS.mountAt === 'function') {
      window.__SSP_TABS.mountAt(host);
    }
  }

  /* ═══ Вкладки первого уровня ══════════════════════════════ */
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      /* v5.8.0 — A.5 (D56): скрыть все overlay'и до манипуляций с DOM, чтобы избежать
         leakage класса багов (открытый #reassignOverlay/#overlimitOverlay/etc. «всплывающий»
         позже на чужой вкладке). Settings-overlay управляется собственным flow. */
      if (typeof _hideAllOverlays === 'function') _hideAllOverlays();
      document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
      document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
      /* v5.6.0 — Этап 4: legacy planner/distrib физически удалены; planner-wide
         распространяется на planning/gantt/history/settings (всё что не settings overlay). */
      document.body.classList.toggle('planner-wide',
        btn.dataset.tab === 'planning' || btn.dataset.tab === 'gantt' ||
        btn.dataset.tab === 'history'  || btn.dataset.tab === 'settings');
      /* v5.0.3 — UI-state в localStorage (без debounce, мгновенно) */
      var ui = _draftGet('ui') || {}; ui.activeTab = btn.dataset.tab; _draftSet('ui', ui);
      var tabsHost = document.getElementById('sspTabsHost');
      if (tabsHost && tabsHost.dataset.selected !== btn.dataset.tab) { tabsHost.dataset.selected = btn.dataset.tab; }
      if (btn.dataset.tab === 'history') {
        apiGet('history').then(function(r){
          if(r && r.history) {
            _history = r.history;
            renderHistory();
            /* v5.4.0 — после reload _history переcинхронизировать шапку
               (новые non-FINAL записи могли появиться в селекторе) */
            if (typeof renderWidgetHeader === 'function') {
              try { renderWidgetHeader(); } catch(_){}
            }
          }
        }).catch(function(e){ diag('history reload err: '+String(e),'err'); });
      }
      /* v5.6.0 — Этап 4 (4c): legacy ветки 'distrib' и 'planner' удалены.
         Спринт-контекст для всех вкладок устанавливается через шапку виджета (.widget-header). */
      /* v5.5.0 — Этап 3: единая вкладка «Планирование» с уровнями детализации.
         Реальный рендер уровня будет заполнен в C2/C3/C4; здесь — диспетчер. */
      if (btn.dataset.tab === 'planning') {
        if (typeof _renderPlanningLevel === 'function') {
          try { _renderPlanningLevel(_planningLevel); }
          catch(e){ diag('planning render err: '+e,'err'); }
        }
      }
      /* v5.6.0 — Этап 4: Гант на верхнем уровне (D6/D41/D42).
         Per-role селектор #ganttRoleSel синхронизирован с localStorage.ssp_lastActiveRole.
         v6.1.0 D76 — populateGanttRoleSel() явно сначала, чтобы dropdown заполнился даже если
         refreshGanttForCurrentSprint бросит (баг #11 part 2: dropdown пустой до клика «Обновить»). */
      if (btn.dataset.tab === 'gantt') {
        try { if (typeof populateGanttRoleSel === 'function') populateGanttRoleSel(); }
        catch(e){ diag('populateGanttRoleSel on tab switch err: '+e,'err'); }
        try {
          var rkG = safeLs.get('ssp_lastActiveRole')
                 || ((typeof getActiveRoles === 'function' && getActiveRoles()[0]) ? getActiveRoles()[0].key : null);
          if (typeof refreshGanttForCurrentSprint === 'function') refreshGanttForCurrentSprint(rkG);
        } catch(e){ diag('gantt render on tab switch err: '+e,'err'); }
      }
      if (btn.dataset.tab === 'settings') {
        checkSettingsManager().then(function(canManage) {
          if (!canManage) {
            document.getElementById('tab-settings').innerHTML =
              '<div class="empty" style="color:var(--muted);padding:60px 20px;">'+T('noRightsSettings')+'</div>';
          }
        });
      }
    });
  });


  /* ═══ v5.5.0 — Этап 3 / v5.6.0 — Этап 4: segmented control «Роли / Люди» внутри tab-planning ═══
     В v5.6.0 сегмент «Гант» удалён — Гант переехал на отдельную верхнюю вкладку #tab-gantt
     (см. tab-btn handler ветка 'gantt' и refreshGanttForCurrentSprint). */
  function _renderPlanningLevel(level) {
    /* v2.0.0 R1 fix: 'standup' добавлен в whitelist. Pre-existing bug с v1.9.0 D132 —
       Stand-up button никогда не работал, level тихо сбрасывался на 'roles'. */
    if (level !== 'roles' && level !== 'people' && level !== 'standup') level = 'roles';
    _planningLevel = level;
    document.querySelectorAll('.planning-level-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.level === level);
    });
    document.querySelectorAll('.planning-level-pane').forEach(function(p){
      p.classList.add('hidden');
    });
    var pane = document.getElementById('planning-level-' + level);
    if (pane) pane.classList.remove('hidden');
    if (level === 'roles'   && typeof renderPlanningRoles                   === 'function') { try { renderPlanningRoles(); } catch(e){ diag('planning roles render err: '+e,'err'); } }
    if (level === 'people'  && typeof refreshPlanningPeopleForCurrentSprint === 'function') { try { refreshPlanningPeopleForCurrentSprint(); } catch(e){ diag('planning people render err: '+e,'err'); } }
    /* v1.9.0 D132 — Stand-up assist view. */
    if (level === 'standup') {
      _populateStandupRoleSel();
      try { renderStandupView(); } catch(e){ diag('standup render err: '+e,'err'); }
    }
  }

  document.querySelectorAll('.planning-level-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var lvl = btn.dataset.level || 'roles';
      /* v6.3.0 D101 — при переходе на «Распределение по исполнителям»: если _currentSprintId
         НЕ установлен — подтянуть активный _sprint, чтобы saturatePeople увидел контекст.
         #25 Ф2 fix: НЕ перетираем осознанно выбранный в пикере спринт (раньше условие было
         `_currentSprintId !== _sprint.sprintId` → навигация по дереву прыгала на активный/
         черновой спринт, игнорируя выбор пользователя). */
      if (lvl === 'people' && _sprint && _sprint.sprintId && !_currentSprintId) {
        try { setCurrentSprintId(_sprint.sprintId, { confirmed: true }); } catch(_){}
      }
      _renderPlanningLevel(lvl);
      var ui = _draftGet('ui') || {}; ui.planningLevel = lvl; _draftSet('ui', ui);
    });
  });

  /* ═══ Проверка прав ════════════════════════════════════════ */
  /* Вынесено в permissions.js (Фаза 5 слайс 2, коммит Б) за мост
     window.__SSP_PERMISSIONS; golden-контракты — permissions-share.golden.test.js
     (идут через эти делегаторы). Deps-фабрика per-call: флаги прав и кэш
     промиса остаются в стейт-ядре монолита (их читают guard'ы контроллеров
     и deps-фабрики других модулей; сброс — _resetProjectStateCaches). */
  var PERMISSIONS = (typeof window !== 'undefined' && window.__SSP_PERMISSIONS) || {};
  function _permsDeps() {
    return {
      T: T, diag: diag,
      backendCall: _backendCall,
      state: {
        getIsEditor: function () { return _isEditor; },
        setIsEditor: function (v) { _isEditor = v; },
        getIsValidator: function () { return _isValidator; },
        setIsValidator: function (v) { _isValidator = v; },
        getIsAssigner: function () { return _isAssigner; },
        setIsAssigner: function (v) { _isAssigner = v; },
        getPermissionsCheckPromise: function () { return _permissionsCheckPromise; },
        setPermissionsCheckPromise: function (p) { _permissionsCheckPromise = p; },
        getActiveSubtab: function () { return _activeSubtab; },
      },
    };
  }
  function checkValidatorNow() { return PERMISSIONS.checkValidatorNow(_permsDeps()); }
  function checkSettingsManager() { return PERMISSIONS.checkSettingsManager(_permsDeps()); }
  function checkValidator() { return PERMISSIONS.checkValidator(_permsDeps()); }
  function checkEditorRights() { return PERMISSIONS.checkEditorRights(_permsDeps()); }
  function checkAssignerRights() { return PERMISSIONS.checkAssignerRights(_permsDeps()); }
  function _startPermissionsCheck() { return PERMISSIONS._startPermissionsCheck(_permsDeps()); }
  function applyEditorRightsToUI() { return PERMISSIONS.applyEditorRightsToUI(_permsDeps()); }

  /* ═══════════════════════════════════════════════════════════
     v5.0.1 — SETTINGS OVERLAY (внутри ssp-main).
     Источник правды для авторизации — backend GET /check-settings-manager.
     UI-элементы: кнопка #openSettingsBtn в шапке, оверлей #settingsOverlay,
     форма #settingsForm с 7 collapsible-карточками.
     ИБ: при canManage:false форма не рендерится; повторная проверка выполняется
     каждый раз при открытии overlay.
  ═══════════════════════════════════════════════════════════ */

  /* v5.0.1 — переменные _valGroupsState/_editGroupsState/_settingsLoaded
     перенесены в основную state-секцию (см. ~стр. 779). Здесь они НЕ объявляются,
     чтобы избежать тонких эффектов hoisting'а в YouTrack-runtime. */

  /* ── Рендер 9 чек-боксов ролей ── */
  function renderRolesGrid() {
    var grid = document.getElementById('rolesGrid');
    if (!grid) return;
    var active = (_settings && _settings.activeRoles) || [];
    var html = '';
    ALL_ROLES.forEach(function (role) {
      var isActive = active.indexOf(role.key) >= 0;
      html += '<div class="role-check' + (isActive ? ' active' : '') + '" data-role="' + esc(role.key) + '">'
            + '<span class="role-check__cb"></span>'
            + '<span class="role-check__label">' + esc(roleLabel(role)) + '</span>'
            + '</div>';
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.role-check').forEach(function (el) {
      el.addEventListener('click', function () {
        el.classList.toggle('active');
        renderDynamicRoleFields();
      });
    });
  }

  /* ── Заполнить один select полями проекта по типу ── */
  function fillFieldSelect(selectEl, allowedTypes, currentValue) {
    if (!selectEl) return;
    var typesArr = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    var opts = '<option value="">' + esc(T('phNotSelected')) + '</option>';
    var has = false;
    _projectFields.forEach(function (f) {
      var t = (f.type || '').toLowerCase();
      var ok = typesArr.some(function (at) { return t.indexOf((at || '').toLowerCase()) >= 0; });
      if (!ok) return;
      var sel = (f.name === currentValue) ? ' selected' : '';
      opts += '<option value="' + esc(f.name) + '"' + sel + '>' + esc(f.name) + '</option>';
      has = true;
    });
    if (!has && currentValue) {
      // Поле было сохранено, но удалено/изменён тип — оставляем placeholder и помечаем для bannerCfg
      opts += '<option value="' + esc(currentValue) + '" selected>' + esc(currentValue) + ' ⚠</option>';
    }
    selectEl.innerHTML = opts;
  }

  /* ── Перерендер динамических секций по активным ролям ── */
  function renderDynamicRoleFields() {
    var activeKeys = [];
    document.querySelectorAll('#rolesGrid .role-check.active').forEach(function (el) {
      activeKeys.push(el.getAttribute('data-role'));
    });
    var active = ALL_ROLES.filter(function (r) { return activeKeys.indexOf(r.key) >= 0; });

    function renderBlock(gridId, idPrefix) {
      var grid = document.getElementById(gridId);
      if (!grid) return;
      var html = '';
      active.forEach(function (role) {
        var fieldId = 's_' + idPrefix + '_' + role.key;
        html += '<div class="field">'
              + '<label for="' + esc(fieldId) + '">' + esc(roleLabel(role)) + '</label>'
              + '<select id="' + esc(fieldId) + '"></select>'
              + '</div>';
      });
      grid.innerHTML = html;
    }
    renderBlock('gridFieldEst',  'est');
    renderBlock('gridFieldFact', 'fact');
    renderBlock('gridUserFields','user');

    active.forEach(function (role) {
      fillFieldSelect(document.getElementById('s_est_'  + role.key), 'period',  _settings && _settings[role.fieldEst]);
      fillFieldSelect(document.getElementById('s_fact_' + role.key), 'period',  _settings && _settings[role.fieldFact]);
      fillFieldSelect(document.getElementById('s_user_' + role.key), 'user',    _settings && _settings[role.userField]);
    });
    /* v1.3.1 fool-proof: после рендера селектов пересчитать дубли + bind
       change-listener'ов один раз через delegation на grid-контейнерах. */
    ['gridFieldEst','gridFieldFact'].forEach(function(gid) {
      var grid = document.getElementById(gid);
      if (grid && !grid._sspFieldDupBound) {
        grid._sspFieldDupBound = true;
        grid.addEventListener('change', _recomputeSaveBtnState);
      }
    });
    _recomputeSaveBtnState();
  }

  /* ── v1.2.0 DTA mapping table: type-name (text) → role (select из активных) ── */
  /* Локальный state — массив строк { type: string, role: string }. Сохраняется
     отдельно от _settings.workItemTypeMapping чтобы UI мог отображать пустые
     строки и дубликаты во время редактирования. Канонический объект для save
     собирается в collectSettings из этого state'а. */
  var _dtaRows = [];

  /* v2.1.0 E2 — Ring Table for DTA mapping. Hybrid controlled-mode:
     Ring renders visual layer; IIFE owns _dtaRows state and all handlers.
     Cell renderers return native HTML via { __html } for input/select;
     delete button gets DOM Level 0 .onclick attached after each render via
     MutationObserver (same pattern as E1 — Ring's row-selection swallows
     click events at cell level in both bubble and capture phases). */

  /* Помечает дубликаты type-name красным border'ом и показывает hint.
     v1.3.1: больше не трогает saveBtn.disabled напрямую — это координирует
     _recomputeSaveBtnState (см. ниже). */

  /* v1.3.1 fool-proof: дубликат настроек fieldFact-X / fieldX между ролями
     означает что одно и то же YouTrack-поле выбрано для двух разных ролей —
     агрегация и каскад начнут затирать друг друга. Подсвечиваем красным
     border'ом проблемные select'ы и показываем hint. */
  function _validateRoleFieldsUniqueness() {
    if (!Array.isArray(ALL_ROLES)) return true;
    /* Только активные роли — выбранные пользователем в rolesGrid. */
    var activeKeys = [];
    document.querySelectorAll('#rolesGrid .role-check.active').forEach(function (el) {
      var k = el.getAttribute('data-role');
      if (k) activeKeys.push(k);
    });
    var seenEst  = {};
    var seenFact = {};
    var dupEst   = {};
    var dupFact  = {};
    activeKeys.forEach(function(roleKey) {
      var estEl  = document.getElementById('s_est_'  + roleKey);
      var factEl = document.getElementById('s_fact_' + roleKey);
      var ev = estEl  ? (estEl.value  || '') : '';
      var fv = factEl ? (factEl.value || '') : '';
      if (ev) { if (seenEst[ev])  dupEst[ev]  = true; else seenEst[ev]  = roleKey; }
      if (fv) { if (seenFact[fv]) dupFact[fv] = true; else seenFact[fv] = roleKey; }
    });
    /* Подсветка только активных селектов; неактивные не рендерятся. */
    var hasDupEst = false, hasDupFact = false;
    activeKeys.forEach(function(roleKey) {
      var estEl  = document.getElementById('s_est_'  + roleKey);
      var factEl = document.getElementById('s_fact_' + roleKey);
      if (estEl) {
        var dupE = !!(estEl.value && dupEst[estEl.value]);
        estEl.style.borderColor = dupE ? 'var(--error)' : '';
        if (dupE) hasDupEst = true;
      }
      if (factEl) {
        var dupF = !!(factEl.value && dupFact[factEl.value]);
        factEl.style.borderColor = dupF ? 'var(--error)' : '';
        if (dupF) hasDupFact = true;
      }
    });
    var hintEst  = document.getElementById('errDuplicateEstFieldHint');
    var hintFact = document.getElementById('errDuplicateFactFieldHint');
    if (hintEst)  hintEst.style.display  = hasDupEst  ? 'block' : 'none';
    if (hintFact) hintFact.style.display = hasDupFact ? 'block' : 'none';
    return !hasDupEst && !hasDupFact;
  }

  /* Координирует disabled-состояние кнопки save через все валидаторы.
     ИСТОЧНИК ПРАВДЫ для disabled: hasDup в любом из валидаторов. */
  function _recomputeSaveBtnState() {
    var saveBtn = document.getElementById('saveSettingsBtn');
    if (!saveBtn) return;
    var dtaOk    = _validateDtaMappingFlag();
    var fieldsOk = _validateRoleFieldsUniqueness();
    saveBtn.disabled = !(dtaOk && fieldsOk);
  }
  /* helper-flavour: возвращает только bool без рекурсивного вызова recompute. */
  function _validateDtaMappingFlag() {
    var counts = {};
    (_dtaRows || []).forEach(function(r) {
      var t = (r && r.type || '').trim();
      if (!t) return;
      counts[t] = (counts[t] || 0) + 1;
    });
    for (var k in counts) { if (counts[k] > 1) return false; }
    return true;
  }


  /* v1.3.0 Cascade — helpers для UI.
     kind-field — single-select по полям enum-типа из _projectFields;
     level-2 / level-3 — multi-select из bundle-values текущего kind-field
     (загружается через loadFieldBundle с кэшем _fieldValuesCache).
     Хранение в settings: array<string ≤200>, max 50 (backend whitelist). */
  /* Сбор selected options из multi-select. Trim, dedupe, cap 50 / 200. */
  /* Заполнить multi-select bundle-значениями выбранного kind-field.
     selectedSet — array значений, которые должны быть pre-selected. */
  /* Live warnings:
     - cascade=on && forbid=off → опасная комбинация (warnCascadeWithoutForbid);
     - level2 ∩ level3 непуст → warnCascadeLevelsOverlap. */

  /* v1.7.0 D128 — State rollup UI helpers. */




  /* ═══ Stand-up view ════════════════════════════════════════
     Рендер-семейство и контроллеры Stand-up вынесены в
     widgets/main/src/standup-view.js (window.__SSP_STANDUP_VIEW) —
     Тир D слайс 1, ступень 1. Делегаторы; контекст собирается в
     _standupDeps на вызове, стейт модуль читает через аксессоры
     deps.state в момент обращения. Шаренные сервисы (роли, канон-чтение
     PP, персист, лоадер, тосты) остаются здесь и идут через deps. */
  var STANDUP_VIEW = (typeof window !== 'undefined' && window.__SSP_STANDUP_VIEW) || {};
  function _standupDeps() {
    return {
      T: T, esc: esc, fmtHours: fmtHours,
      toast: toast, diag: diag, withLoader: withLoader,
      ALL_ROLES: ALL_ROLES, ACTIVE_INC: ACTIVE_INC,
      getActiveRoles: getActiveRoles,
      getPersonalPlanningForCurrent: _getPersonalPlanningForCurrent,
      saveCurrentRoleState: saveCurrentRoleState,
      markDirty: _markDirty,
      apiPost: apiPost,
      state: {
        getSettings: function () { return _settings; },
        getSprint: function () { return _sprint; },
        getRoleItems: function () { return _roleItems; },
        getActiveSubtab: function () { return _activeSubtab; },
        getCurrentRolePP: function () { return _currentRolePP; },
        setCurrentRolePP: function (pp) { _currentRolePP = pp; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
      },
    };
  }
  function renderStandupView() { return STANDUP_VIEW.renderStandupView(_standupDeps()); }
  function doStandupRefresh() { return STANDUP_VIEW.doStandupRefresh(_standupDeps()); }
  function _populateStandupRoleSel() { return STANDUP_VIEW._populateStandupRoleSel(_standupDeps()); }







  /* ── Применить значения _settings к форме ── */

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = (v === null || v === undefined) ? '' : v;
  }

  /**
   * v5.0.1 (hotfix #2) — Multi-select групп (валидация / редактирование).
   * Использует существующие CSS-классы из widgets/main/index.html:
   *   .grp-ms__dropdown.open                  — открытое состояние dropdown
   *   .grp-ms__item.grp-ms__item--checked     — отмеченный пункт
   *   .grp-ms__tag-rm                         — кнопка удаления tag
   *   .grp-ms__item-cb / __item-icon / __item-name — структура внутри item
   *   .grp-ms__empty                          — текст при пустом списке
   */


  /* ── Сборка settings-объекта из формы ── */


  /* ═══ ПЛАНИРОВАНИЕ ══════════════════════════════════════════ */

  /* Форматирование заголовка колонки */
  function fmtThLabel(label) {
    if (!label) return T('resColLabel');
    var m = label.match(/^(Разработка)\s+(.+)$/);
    if (m) return T('resColLabel')+'<br>'+esc(m[1])+'<br>' + esc(m[2]);
    return T('resColLabel')+'<br>' + esc(label);
  }

  /* ── Рендер подвкладок по ролям ── */
  /* v5.6.0 — Этап 4 (4d): legacy renderPlannerRoles (роле-subtabs внутри удалённого
     #tab-planner) заменён на alias renderPlanningRoles (accordion-карточки в #tab-planning).
     Renderer accordion поддерживает full editable expanded-state через _mountExpandedRoleBodies. */
  function renderPlannerRoles() {
    /* Шапка вводных — пустые поля Спринт/Версия (зависит от настроек) */
    if (typeof renderSprintIntroExtras === 'function') {
      try { renderSprintIntroExtras(); } catch(_){}
    }
    if (typeof renderPlanningRoles === 'function') {
      try { renderPlanningRoles(); } catch(e){ diag('renderPlanningRoles err: '+e,'err'); }
    }
    /* v2.0.0 Phase D3 — Async checks через singleton (раньше 3 отдельных then'а).
       _startPermissionsCheck() кэширует Promise и применяет applyEditorRightsToUI
       единожды по завершении всего батча. Race-protected для D4-D7 яруса 3. */
    _startPermissionsCheck();
  }

  /* ═══ v5.5.0 — Этап 3b: accordion для уровня «Роли» в единой вкладке «Планирование» ═══
     Карточка роли = свёрнутая мини-сводка (ресурс / Σ alloc / count tasks / overlimit)
     или раскрытая read-only-превью с кнопками «Открыть в старой вкладке» / «→ Открыть в Людях».
     Editable рендер внутри карточки появится в 3e после удаления старой tab-planner.
     Состояние раскрытия персистится в ui.expandedRoles[] (массив roleKey). */
  var _uiExpandedRoles = Object.create(null);

  /* ═══ Planning-core view ═══════════════════════════════════
     Уровень «Роли»: accordion-карточки (quick-stats) и таблица состава роли
     вынесены в widgets/main/src/rolecomposition-view.js
     (window.__SSP_ROLECOMP_VIEW) — Тир D слайс 3, ступень 1.
     Делегаторы; контекст собирается в _roleCompDeps на вызове, стейт модуль
     читает через аксессоры deps.state в момент обращения. Стейт раскрытия
     _uiExpandedRoles остаётся здесь (init-restore пишет его до модуля,
     _rerenderAllSortableTables/applyI18N читают) — модуль мутирует его поля
     по ссылке через get-аксессор. deps.renderRoleComposition отдаёт wrapped-
     версию (рендер + updateAllocOverlimitUI) — самовызовы модуля обязаны
     проходить пост-обработку перелимита, как в оригинале. */
  var ROLECOMP_VIEW = (typeof window !== 'undefined' && window.__SSP_ROLECOMP_VIEW) || {};
  function _roleCompDeps() {
    return {
      T: T, esc: esc, safeUrl: safeUrl, diag: diag,
      icon: icon, applyIcons: applyIcons,
      roleLabel: roleLabel, incLabel: incLabel, dispEnum: dispEnum,
      fmtThLabel: fmtThLabel, localizeEnumVal: localizeEnumVal,
      fmtPeriod: fmtPeriod, parsePeriod: parsePeriod, fmtHoursOnly: fmtHoursOnly,
      formatHoursLight: _formatHoursLight,
      multiKeySort: multiKeySort, getSortKey: getSortKey, setSortKey: setSortKey,
      rerenderAllSortableTables: _rerenderAllSortableTables,
      getRoleItemsArr: getRoleItemsArr,
      markDirty: _markDirty, draftSaveDebounced: _draftSaveDebounced,
      apiPost: apiPost,
      loadEnumBundle: loadEnumBundle, updateIssueField: updateIssueField,
      showDynFieldConfirm: showDynFieldConfirm,
      updateRoleRemaining: updateRoleRemaining,
      renderRoleComposition: renderRoleComposition,
      toast: toast, openModal: openModal, statusLabel: statusLabel,
      getActiveRoles: getActiveRoles, safeLs: safeLs,
      draftGet: _draftGet, draftSet: _draftSet,
      renderRolePlannerHeader: renderRolePlannerHeader,
      applyEditorRightsToUI: applyEditorRightsToUI,
      populatePlanningRoleSel: populatePlanningRoleSel,
      refreshPlanningPeopleForCurrentSprint: refreshPlanningPeopleForCurrentSprint,
      openPickModal: openPickModal, refreshFromYouTrack: refreshFromYouTrack,
      doValidateRole: doValidateRole, doNewSprint: doNewSprint,
      doSaveRoleHeader: doSaveRoleHeader,
      PAGE_SIZE: PAGE_SIZE, INC: INC, STATUS: STATUS, ALL_ROLES: ALL_ROLES,
      state: {
        getSettings: function () { return _settings; },
        getSprint: function () { return _sprint; },
        getHistory: function () { return _history; },
        getCurrentSprintId: function () { return _currentSprintId; },
        getServerSnapshotRoleItems: function () { return _serverSnapshotRoleItems; },
        getRoleItems: function () { return _roleItems; },
        getUiExpandedRoles: function () { return _uiExpandedRoles; },
        setActiveSubtab: function (rk) { _activeSubtab = rk; },
        getIsEditor: function () { return _isEditor; },
        getIsValidator: function () { return _isValidator; },
      },
    };
  }

  function _formatHoursLight(n) { return UTIL_PURE.formatHoursLight(n); }

  /* Делегатор-точка входа calc-голденов (как calcAssigneeUsed в слайсе 2);
     прод-callers — внутри модуля. */
  function computeRoleQuickStats(rk) { return ROLECOMP_VIEW.computeRoleQuickStats(rk, _roleCompDeps()); }

  function renderRoleAccordion(rk) { return ROLECOMP_VIEW.renderRoleAccordion(rk, _roleCompDeps()); }

  function _updateRoleAccordionStats(rk) { return ROLECOMP_VIEW.updateRoleAccordionStats(rk, _roleCompDeps()); }

  /* Уровень «Роли» (карточки + аккордеон-обвязка) — в rolecomposition-view.js
     (Тир D слайс 3, коммит Б). Делегатор: 5 внешних callers (applyI18N, WC-deps,
     level-switch, renderPlannerRoles, refresh) не трогаются. */
  function renderPlanningRoles() { return ROLECOMP_VIEW.renderPlanningRoles(_roleCompDeps()); }



  /* ═══ v5.5.0 — Этап 3c: уровень «Люди» ═══
     Селектор роли + empty-state + summary card. Editable работа с _currentRolePP остаётся
     через старую вкладку tab-distrib до подэтапа 3e. */
  function populatePlanningRoleSel() {
    var sel = document.getElementById('planningRoleSel');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '';
    var activeRoles = (typeof getActiveRoles === 'function') ? getActiveRoles() : [];
    activeRoles.forEach(function(role){
      var opt = document.createElement('option');
      opt.value = role.key;
      opt.textContent = (typeof roleLabel === 'function') ? roleLabel(role) : (role.label || role.key);
      sel.appendChild(opt);
    });
    var lastRole = safeLs.get('ssp_lastActiveRole') || '';
    var pick = (prev && activeRoles.some(function(r){return r.key===prev;})) ? prev
             : (lastRole && activeRoles.some(function(r){return r.key===lastRole;})) ? lastRole
             : (activeRoles[0] && activeRoles[0].key) || '';
    if (pick) sel.value = pick;
  }

  function _findHistRecForCurrent(rk) {
    if (!_currentSprintId || !rk) return null;
    var key = _currentSprintId + '_' + rk;
    return _history.find(function(r){ return r && r.sprintId === key; }) || null;
  }

  function _getPersonalPlanningForCurrent(rk) {
    if (!_currentSprintId || !rk) return null;
    var rec = _findHistRecForCurrent(rk);
    if (rec && rec.personalPlanning) return rec.personalPlanning;
    if (_sprint && _sprint.sprintId === _currentSprintId && _sprint.personalPlanning && _sprint.personalPlanning[rk]) {
      return _sprint.personalPlanning[rk];
    }
    return null;
  }

  function _renderResourceModeIndicator(rk, pp) {
    var el = document.getElementById('planningResModeIndicator');
    if (!el) return;
    var manualMode = !(_settings && _settings.usePersonalForResource);
    if (!manualMode) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    /* v6.2.1 D95 — _sprint[role.resKey] хранится в минутах (parsePeriod), а
       _formatHoursLight ожидает часы. Делим на 60. */
    var roleResMin = (role && _sprint && _sprint[role.resKey]) ? (_sprint[role.resKey] || 0) : 0;
    var roleRes = roleResMin / 60;
    var peopleSum = 0;
    if (pp && pp.resourcesByAssignee) {
      Object.keys(pp.resourcesByAssignee).forEach(function(login){
        var r = pp.resourcesByAssignee[login] && pp.resourcesByAssignee[login].resource;
        if (typeof r === 'number' && !isNaN(r)) peopleSum += r;
      });
    }
    var diff = +(roleRes - peopleSum).toFixed(2);
    var statusCls, statusTxt;
    if (Math.abs(diff) < 0.01) { statusCls = 'ok'; statusTxt = T('resStatusOk'); }
    else if (diff > 0)         { statusCls = 'under'; statusTxt = T('resStatusUnderTpl').replace('{n}', _formatHoursLight(diff)); }
    else                       { statusCls = 'over';  statusTxt = T('resStatusOverTpl').replace('{n}', _formatHoursLight(-diff)); }
    el.classList.remove('hidden');
    el.innerHTML = ''
      + '<div class="resource-indicator__row"><span>' + esc(T('lblRoleResourceManual')) + '</span><span>' + esc(_formatHoursLight(roleRes)) + ' ' + esc(T('planningRoleStatHourSuffix')) + '</span></div>'
      + '<div class="resource-indicator__row"><span>' + esc(T('lblPeopleSum'))          + '</span><span>' + esc(_formatHoursLight(peopleSum)) + ' ' + esc(T('planningRoleStatHourSuffix')) + '</span></div>'
      + '<div class="resource-indicator__status resource-indicator__status--' + statusCls + '">' + esc(statusTxt) + '</div>';
  }

  /* v5.7.0 — Этап 5: bind кнопки «Скрыть» баннера orphan-цветов.
     Прячет баннер на текущей сессии, не очищает _orphanGanttIssues — при reload снова покажется. */
  (function bindOrphanGanttDismiss(){
    function bind(){
      var btn = document.getElementById('bannerOrphanGanttDismissBtn');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', function(){
          var b = document.getElementById('bannerOrphanGanttColors');
          if (b) b.classList.add('hidden');
        });
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  })();

  /* v5.7.0 — Этап 5: показ/скрытие баннера «orphan gantt-цвета» в #tab-planning.
     Срабатывает при загрузке записи; _orphanGanttIssues заполняется backend D59 v5.9.0. */
  function _renderOrphanGanttBanner(sprintRec) {
    var banner = document.getElementById('bannerOrphanGanttColors');
    var listEl = document.getElementById('bannerOrphanGanttList');
    if (!banner) return;
    var orphans = (sprintRec && Array.isArray(sprintRec._orphanGanttIssues)) ? sprintRec._orphanGanttIssues : [];
    if (!orphans.length) {
      banner.classList.add('hidden');
      if (listEl) listEl.textContent = '';
      return;
    }
    var preview = orphans.slice(0, 5);
    var rest = orphans.length - preview.length;
    var text = preview.join(', ') + (rest > 0 ? (' (+' + rest + ')') : '');
    if (listEl) listEl.textContent = text;
    banner.classList.remove('hidden');
  }

  /* v5.6.0 — Этап 4 (4d): full inline editor вместо v5.5.0 read-only summary-card.
     При наличии PP — устанавливаем _currentSprintRoleRec/_currentRolePP/_currentRoleGantt из истории,
     показываем #planningPeopleContent (с реальными #currentRoleAssigneeBody/#currentRoleTaskBody),
     рендерим renderCurrentRoleAssigneeTable/renderCurrentRoleTaskTable + updateCurrentRoleTotals
     + _renderResourceModeIndicator. При отсутствии PP — empty-state с CTA. */
  /* Context-loader вкладки «Люди» — вынесен в sprint-controller.js (Фаза 5 слайс 6)
     за __SSP_SPRINT_CTRL; делегатор (callers: rolecomposition-view ×2 / currentrole-view ×2
     / монолит ×3). Стейт зоны (_currentSprintRoleRec/_currentRolePP/_currentRoleGantt/
     _currentRoleNkcKey/_activeSubtab) пишется через сеттеры _sprintDeps().state. */
  function refreshPlanningPeopleForCurrentSprint(roleKey) { return SPRINT_CTRL.refreshPlanningPeopleForCurrentSprint(roleKey, _sprintDeps()); }

  /* Handler селектора роли + handler кнопок empty-state CTA / open-in-legacy.
     Привязываем один раз — defensive pattern: если DOM уже готов — сразу,
     иначе подписываемся на DOMContentLoaded. */
  (function bindPlanningPeopleHandlers(){
    function bind() {
      var sel = document.getElementById('planningRoleSel');
      if (sel && !sel.dataset.bound) {
        sel.dataset.bound = '1';
        sel.addEventListener('change', function(){
          var newRk = sel.value;
          var prevRk = safeLs.get('ssp_lastActiveRole') || '';
          if (prevRk && prevRk !== newRk && _dirtyRoleKeys[prevRk]) {
            var role = ALL_ROLES.find(function(r){ return r.key === prevRk; });
            var roleName = role ? ((typeof roleLabel === 'function') ? roleLabel(role) : (role.label || prevRk)) : prevRk;
            var ok = window.confirm(T('roleSwitchDirtyText').replace('{role}', roleName));
            if (!ok) { sel.value = prevRk; return; }
            delete _dirtyRoleKeys[prevRk];
          }
          safeLs.set('ssp_lastActiveRole', newRk);
          refreshPlanningPeopleForCurrentSprint(newRk);
        });
      }
      var ctaBtn = document.getElementById('planningPeopleEmptyCta');
      if (ctaBtn && !ctaBtn.dataset.bound) {
        ctaBtn.dataset.bound = '1';
        ctaBtn.addEventListener('click', function(){
          /* v5.6.0 — Этап 4 (4c): legacy переключение на tabBtnDistrib + клик currentRolePickBtn
             заменено на прямой вызов doCurrentRoleCalc() для текущей роли (full editable inline). */
          var sel2 = document.getElementById('planningRoleSel');
          var rk = sel2 ? sel2.value : '';
          if (!rk) return;
          safeLs.set('ssp_lastActiveRole', rk);
          _activeSubtab = rk;
          var pickBtn = document.getElementById('currentRolePickBtn');
          if (pickBtn) {
            pickBtn.click();
          } else if (typeof doCurrentRoleCalc === 'function') {
            try { doCurrentRoleCalc(); } catch(e){ diag('doCurrentRoleCalc from CTA err: '+e,'err'); }
          }
        });
      }
      /* v5.6.0 — Этап 4 (4c): #planningPeopleOpenLegacyBtn физически удалён в C2;
         handler удалён здесь. Полный editable редактор теперь работает inline
         в #planning-level-people > #planningPeopleContent (рендер в C4 4d). */
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  })();

  /* ═══ v5.6.0 — Этап 4: Гант на верхнем уровне (#tab-gantt, D6/D41/D42) ═══
     Per-role timeline; селектор #ganttRoleSel синхронизирован с localStorage.ssp_lastActiveRole
     (общий с уровнем «Люди» через D42). В 4a — заглушка-каркас; полный рендер активируется
     в 4d вместе с rewire renderGanttChart на чтение per-role контекста. */
  function populateGanttRoleSel() {
    var sel = document.getElementById('ganttRoleSel');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '';
    var roles = (typeof getActiveRoles === 'function') ? getActiveRoles() : [];
    roles.forEach(function(role){
      var opt = document.createElement('option');
      opt.value = role.key;
      opt.textContent = (typeof roleLabel === 'function') ? roleLabel(role) : (role.label || role.key);
      sel.appendChild(opt);
    });
    var last = safeLs.get('ssp_lastActiveRole') || '';
    var pick = (prev && roles.some(function(r){return r.key===prev;})) ? prev
            : (last && roles.some(function(r){return r.key===last;})) ? last
            : ((roles[0] || {}).key || '');
    if (pick) sel.value = pick;
  }
  /* v5.6.0 — Этап 4 (4d): full Gantt render на верхнем уровне (#tab-gantt).
     Per-role timeline. Устанавливаем _currentSprintRoleRec/_currentRolePP/_currentRoleGantt из
     записи истории по ключу <_currentSprintId>_<roleKey>, затем вызываем
     renderGanttChart() (который читает из глобального _currentSprintRoleRec/_currentRoleGantt
     без правок внутренней логики). */
  function refreshGanttForCurrentSprint(roleKey) {
    populateGanttRoleSel();
    var sel = document.getElementById('ganttRoleSel');
    var rk = roleKey || (sel && sel.value) || null;
    if (!rk && typeof getActiveRoles === 'function') {
      var ar = getActiveRoles();
      rk = (ar[0] && ar[0].key) || null;
    }
    if (sel && rk) sel.value = rk;
    if (rk) safeLs.set('ssp_lastActiveRole', rk);
    var emptyEl  = document.getElementById('ganttEmpty');
    var c        = document.getElementById('ganttContainer');
    if (!_currentSprintId || !rk) {
      if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.textContent = T('emptyGantt'); }
      if (c) c.innerHTML = '';
      _currentSprintRoleRec = null; _currentRolePP = null; _currentRoleGantt = null;
      return;
    }
    /* Контекст для renderGanttChart: ищем запись в _history по ключу */
    var rec = _findHistRecForCurrent(rk);
    if (!rec) {
      if (emptyEl) { emptyEl.classList.remove('hidden'); emptyEl.textContent = T('emptyGantt'); }
      if (c) c.innerHTML = '';
      _currentSprintRoleRec = null; _currentRolePP = null; _currentRoleGantt = null;
      return;
    }
    _currentSprintRoleRec = rec;
    _currentRolePP    = (rec.personalPlanning) ? deepClone(rec.personalPlanning) : (typeof emptyPP === 'function' ? emptyPP() : { resourcesByAssignee:{}, taskAssignments:{} });
    _currentRoleGantt = (rec.gantt) ? deepClone(rec.gantt) : { tasks:{}, updatedAt:null };
    _activeSubtab = rk;
    if (emptyEl) emptyEl.classList.add('hidden');
    _renderOrphanGanttBanner(rec); /* v5.7.0 — Этап 5 */
    if (typeof renderGanttChart === 'function') {
      try { renderGanttChart(); } catch(e){ diag('renderGanttChart err: '+e,'err'); }
    }
    if (typeof applyEditorRightsToUI === 'function') {
      try { applyEditorRightsToUI(); } catch(_){}
    }
  }

  /* v5.6.0 — Этап 4 (4d): handler для #ganttRoleSel и #ganttUpdateBtn.
     Soft-warn confirm при смене роли с dirty-данными (_dirtyRoleKeys[rk + ':gantt']). */
  (function bindGanttHandlers(){
    function bind() {
      var sel = document.getElementById('ganttRoleSel');
      if (sel && !sel.dataset.bound) {
        sel.dataset.bound = '1';
        sel.addEventListener('change', function(){
          var newRk = sel.value;
          var prevRk = safeLs.get('ssp_lastActiveRole') || '';
          if (prevRk && prevRk !== newRk && _dirtyRoleKeys[prevRk + ':gantt']) {
            var ok = window.confirm(T('ganttRoleSwitchDirtyText'));
            if (!ok) { sel.value = prevRk; return; }
            delete _dirtyRoleKeys[prevRk + ':gantt'];
          }
          refreshGanttForCurrentSprint(newRk);
        });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  })();

  /* D34 — Hybrid поведение для исторических спринтов (read-only/editable по
     наличию своей WC) — вынесено в header-view.js (Тир D слайс 5, ступень 1,
     коммит В). Делегатор только у _applyHybridSprintMode (единственная
     внешне-вызываемая точка — setCurrentSprintId); внутренние проверка моей WC
     и аппликатор readonly-класса живут в модуле. */
  function _applyHybridSprintMode(newId) { return HEADER_VIEW._applyHybridSprintMode(newId, _headerDeps()); }

  /* D37 — Cross-tab storage events: при изменении WC из другой вкладки браузера
     обновляем индикатор шапки виджета и текущий уровень планирования. */
  function _onCrossTabWcEvent(e) {
    if (!e || !e.key) return;
    if (e.key.indexOf('ssp:wc-touched:') !== 0) return;
    try {
      if (typeof renderWidgetHeader === 'function') renderWidgetHeader();
      /* v5.6.0 — Этап 4: re-render активной вкладки. Для tab-planning — через диспетчер
         _renderPlanningLevel; для tab-gantt — через refreshGanttForCurrentSprint. */
      if (_planningLevel === 'people') {
        _renderPlanningLevel('people');
      }
      var ganttBtn = document.querySelector('.tab-btn[data-tab="gantt"].active');
      if (ganttBtn && typeof refreshGanttForCurrentSprint === 'function') {
        var rk = safeLs.get('ssp_lastActiveRole');
        refreshGanttForCurrentSprint(rk);
      }
    } catch (err) { diag('cross-tab WC event err: '+err, 'err'); }
  }
  try { window.addEventListener('storage', _onCrossTabWcEvent); } catch(_){}

  /* D36 — При personalPlanningEnabled=false скрываем уровень «Люди».
     Если активным был «people» — fallback на «roles». */
  function _applyPersonalPlanningToSegmentedControl() {
    var on = !!(_settings && _settings.personalPlanningEnabled);
    var btn = document.querySelector('.planning-level-btn[data-level="people"]');
    if (!btn) return;
    btn.classList.toggle('hidden', !on);
    if (!on && _planningLevel === 'people') {
      _renderPlanningLevel('roles');
      var ui = _draftGet('ui') || {}; ui.planningLevel = 'roles'; _draftSet('ui', ui);
    }
  }

  function renderSprintIntroExtras() {
    var hasSprint  = _settings && _settings.fieldSprint;
    var hasVersion = _settings && _settings.fieldVersion;
    var extrasEl   = document.getElementById('sprintExtraFields');
    var sprintEl   = document.getElementById('fieldSprintVal');
    var versionEl  = document.getElementById('fieldVersionVal');

    if (!hasSprint && !hasVersion) {
      extrasEl.style.display = 'none';
      return;
    }
    extrasEl.style.display = '';
    /* v5.0.3 (итерация 5) — Bundle async; ждём загрузку options ПЕРЕД setVal,
       иначе persisted значение из _sprint.sprintFieldVal/versionFieldVal не
       находит matching <option> и select остаётся пустым. */
    var loaders = [];
    if (hasSprint) {
      sprintEl.style.display = '';
      loaders.push(loadFieldBundle(_settings.fieldSprint, 'sprintFieldVal'));
    } else {
      sprintEl.style.display = 'none';
    }
    if (hasVersion) {
      versionEl.style.display = '';
      loaders.push(loadFieldBundle(_settings.fieldVersion, 'versionFieldVal'));
    } else {
      versionEl.style.display = 'none';
    }
    Promise.all(loaders).then(function(){
      if (!_sprint) return;
      [
        { v: _sprint.sprintFieldVal,  id: 'sprintFieldVal'  },
        { v: _sprint.versionFieldVal, id: 'versionFieldVal' }
      ].forEach(function(spec){
        if (!spec.v) return;
        var sel = document.getElementById(spec.id);
        if (!sel) return;
        /* Если matching option уже есть — выставляем; иначе добавляем «зомби»-option,
           чтобы сохранённое значение не терялось (например, оригинальный bundle
           изменился после сохранения снимка). */
        if (!sel.querySelector('option[value="'+CSS.escape(spec.v)+'"]')) {
          var o = document.createElement('option');
          o.value = spec.v;
          o.textContent = spec.v + ' *';
          o.title = 'Значение сохранено, но отсутствует в текущем бандле';
          sel.appendChild(o);
        }
        sel.value = spec.v;
      });
    }).catch(function(e){ diag('renderSprintIntroExtras setVal err: '+e,'err'); });
  }

  /* v5.0.3 (итерация 5b) — кэш для field-values, чтобы избежать 4× redundant fetches
     на cold start. Раньше renderSprintIntroExtras() вызывался для каждой роли
     (init + buildRolePanel × N ролей) → каждый раз GET /field-values по обоим полям.
     Теперь:
       - запрос летит ОДИН раз за время жизни виджета,
       - последующие вызовы используют кэшированный response,
       - DOM-наполнение выполняется в каждом вызове (для нужного селектора). */
  var _fieldValuesCache = {};         // fieldName → resolved response object
  var _fieldValuesInflight = {};      // fieldName → Promise (in-flight request)

  function loadFieldBundle(fieldName, selId) {
    var sel = document.getElementById(selId);
    if (!sel || !fieldName) return Promise.resolve();
    function applyToSel(r) {
      if (!r || !r.success || !r.values || !r.values.length) return;
      var prev = sel.value;
      sel.innerHTML = '<option value="">'+T('phNotSelected')+'</option>';
      r.values.forEach(function(name) {
        var o = document.createElement('option');
        o.value = name; o.textContent = name;
        sel.appendChild(o);
      });
      if (prev) sel.value = prev;
    }
    /* Hit cache — наполнить selector синхронно */
    if (_fieldValuesCache[fieldName]) {
      applyToSel(_fieldValuesCache[fieldName]);
      return Promise.resolve();
    }
    /* In-flight — присоединиться к текущему запросу, потом наполнить selector */
    if (_fieldValuesInflight[fieldName]) {
      return _fieldValuesInflight[fieldName].then(function(r){ applyToSel(r); });
    }
    /* Cold — летит первый запрос */
    var p = apiGet('field-values?fieldName=' + encodeURIComponent(fieldName))
      .catch(function (e) {
        diag('field-values ['+fieldName+'] FETCH ERR: '+(e&&e.message?e.message:String(e)),'err');
        return null;
      })
      .then(function(r) {
        var dbg = r && r.debug;
        var diagMsg = 'field-values ['+fieldName+']: success='+(!!(r&&r.success))+
          ' count='+(r&&r.values?r.values.length:0)+
          ' typeName='+(dbg&&dbg.typeName||'?')+
          ' method='+(dbg&&dbg.method||'?')+
          (dbg&&dbg.error?' ERR='+dbg.error:'')+
          (dbg&&dbg.findFieldError?' findErr='+dbg.findFieldError:'')+
          (dbg&&dbg.allFieldNames?' fields=['+dbg.allFieldNames.slice(0,5).join(',')+('...'+(dbg.allFieldNames.length-5)+' more')+'  searched='+fieldName+']':'');
        diag(diagMsg, r&&r.success&&r.values&&r.values.length?'ok':'warn');
        if (r && r.success && r.values) _fieldValuesCache[fieldName] = r;
        delete _fieldValuesInflight[fieldName];
        applyToSel(r);
        return r;
      })
      .catch(function(e) {
        delete _fieldValuesInflight[fieldName];
        diag('field-values ['+fieldName+'] ERR: '+String(e&&e.message?e.message:e), 'err');
      });
    _fieldValuesInflight[fieldName] = p;
    return p;
  }

  /* Сброс кэша — нужен при смене настроек поля (settingsManager переключил fieldSprint)
     или после refresh-кнопки. Не используется по умолчанию. */
  function invalidateFieldValuesCache(fieldName) {
    if (fieldName) {
      delete _fieldValuesCache[fieldName];
      delete _fieldValuesInflight[fieldName];
    } else {
      _fieldValuesCache = {};
      _fieldValuesInflight = {};
    }
  }

  /* Панель роли (buildRolePanel/wireRolePanel) — в rolecomposition-view.js
     (Тир D слайс 3, коммит Б); монтируется модульным _mountExpandedRoleBodies. */



  /* #25 Ф2 fix — источник intro-полей (Название/Даты/Цель) = выбранный спринт:
     активный _sprint, если он и есть _currentSprintId; иначе снапшот истории.
     Раньше renderRolePlannerHeader безусловно писал _sprint (активный) → при выборе
     исторического спринта «Параметры спринта» показывали данные активного. */
  function _introSourceForCurrent() {
    if (_sprint && (!_currentSprintId || _sprint.sprintId === _currentSprintId)) return _sprint;
    if (Array.isArray(_history)) {
      var rec = _history.find(function(r){ return r && r.sprintId && String(r.sprintId).split('_')[0] === _currentSprintId; });
      if (rec) return rec;
    }
    return _sprint;
  }

  /* ── Рендер шапки планировщика для роли ── */
  function renderRolePlannerHeader(rk) {
    var ok = _settings && getActiveRoles().some(function(r){ return r.key === rk && _settings[r.fieldEst]; });
    document.getElementById('bannerPlanner').classList.toggle('hidden', !!ok || !_settings);
    if (!_sprint) return;
    // Название, даты, цель — общие; источник = выбранный спринт (активный или исторический снапшот)
    var _intro = _introSourceForCurrent() || _sprint;
    document.getElementById('sprintName').value = _intro.name || '';
    document.getElementById('dateStart').value  = toDateIn(_intro.dateStart);
    document.getElementById('dateEnd').value    = toDateIn(_intro.dateEnd);
    /* v1.9.0 D132 — Заполнить sprint goal textarea при переключении спринта. */
    var goalEl = document.getElementById('sprintGoal');
    if (goalEl) goalEl.value = _intro.sprintGoal || '';

    var resEl = document.getElementById('res_'+rk);
    var role  = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (resEl && role) {
      if (_settings && _settings.usePersonalForResource) {
        // В режиме personalForResource — заполнить из personalPlanning и заблокировать
        var totalH5 = (typeof getPersonalPlanningResourceForRole === 'function') ? getPersonalPlanningResourceForRole(rk) : 0;
        if (_sprint) _sprint[role.resKey] = Math.round(totalH5 * 60);
        resEl.value = fmtPeriod(Math.round(totalH5 * 60));
        resEl.readOnly = true;
        resEl.style.opacity = '0.6';
        resEl.title = T('resManagedByCurrentRole');
      } else {
        resEl.value = _sprint[role.resKey] ? fmtPeriod(_sprint[role.resKey]) : '';
        resEl.readOnly = false;
        resEl.style.opacity = '';
        resEl.title = '';
      }
      /* v5.0.3 — live draft listener для res_<rk> */
      bindResInputDraftListener(rk);
    }
    /* v5.0.3 — на случай первого рендера: bind стабильных инпутов шапки */
    bindSprintHeaderDraftListeners();

    var ss = document.getElementById('sprintStatus_'+rk);
    var newBtn = document.getElementById('newSprintBtn_'+rk);
    if (_sprint.status === STATUS.CONFIRMED || _sprint.status === STATUS.ALLOCATED) {
      if (ss) ss.style.display = 'none';
      if (newBtn) newBtn.style.display = '';
    } else {
      if (ss) { ss.style.display = ''; ss.value = _sprint.status || STATUS.PLANNING; }
      if (newBtn) newBtn.style.display = 'none';
    }
    renderRoleStatusBadge(rk);
    renderSprintIntroExtras();
  }

  function renderRoleStatusBadge(rk) {
    var b = document.getElementById('statusBadge_'+rk);
    if (!b) return;
    /* v1.8.1 — статус берётся per-role из _history (не из глобального _sprint.status).
       Раньше использовали _sprint.status, что приводило к синхронизации статусов между
       всеми ролями: валидация одной роли → у всех карточек ставится её статус. */
    var s = STATUS.PLANNING;
    if (_sprint && _sprint.sprintId) {
      var roleSnapId = _sprint.sprintId + '_' + rk;
      var rec = _history && _history.find(function(r){ return r && r.sprintId === roleSnapId; });
      if (rec && rec.status) s = rec.status;
    }
    b.textContent = statusLabel(s); b.className = 's-badge';
    b.removeAttribute('title');
    if(s===STATUS.ALLOCATED) { b.classList.add('s-badge--allocated'); b.setAttribute('title', T('tooltipStatusAllocated')); }
    else if(s===STATUS.CONFIRMED) b.classList.add('s-badge--confirmed');
    else if(s===STATUS.FINISHED) b.classList.add('s-badge--finished');
    else b.classList.add('s-badge--planning');
  }

  /* ── Обновить остаток для роли ── */
  function updateRoleRemaining(rk) {
    var rem = calcRemForRole(rk);
    var card = document.getElementById('rc_'+rk);
    var val  = document.getElementById('rem_'+rk);
    if (!card || !val) return;
    card.classList.toggle('remain-card--over', rem < 0);
    val.textContent = fmtHours(rem);
  }

  /* ── Сохранить параметры спринта для роли ── (вынесен в sprint-controller.js,
     Фаза 5 слайс 6; делегатор — caller rolecomposition-view). */
  function doSaveRoleHeader(rk) { return SPRINT_CTRL.doSaveRoleHeader(rk, _sprintDeps()); }

  /* v1.8.5 D130 — Сохранить общие поля «Вводных данных по спринту» без role-resource части.
     Отдельная кнопка #saveSprintIntroBtn в карточке card-sprint-intro: общие поля живут наверху,
     раньше save-кнопка находилась только внутри per-role аккордеона (#saveHeaderBtn_<rk>), что
     противоречило principle of least surprise. Per-role кнопка продолжает сохранять и общие поля,
     и role-specific resource — изменений в doSaveRoleHeader нет. */
  function doSaveSprintIntro() { return SPRINT_CTRL.doSaveSprintIntro(_sprintDeps()); }

  /* v1.9.1 D133 — Диалог подтверждения результата спринта при завершении (Finish sprint).
     sprintGoalText — текст цели из history-записи (rec.sprintGoal).
     existingOutcome — pre-select radio если outcome уже был записан ранее (re-finish flow).
     Возвращает Promise<{goalOutcome, goalRetroNote}|null>.
     null — пользователь нажал Отмена (спринт не завершается). */
  /* Phase 2 #32 — мигрировано на openModal(); Тир B — тело в modal-specs.js.
     Promise-контракт сохранён: resolve({goalOutcome, goalRetroNote}) на confirm,
     resolve(null) на cancel/Escape. Defensive-fallback если Ring недоступен. */
  function openConfirmGoalDialog(sprintGoalText, existingOutcome) {
    return MODAL_SPECS.openConfirmGoalDialog(sprintGoalText, existingOutcome, { t: T, openModal: openModal });
  }

  /* v1.9.0 D132 — bind Stand-up refresh button. */
  (function bindStandupRefreshHandler(){
    function bind() {
      var btn = document.getElementById('standupRefreshBtn');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', function(){ doStandupRefresh(); });
      }
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bind); } else { bind(); }
  })();

  /* v1.8.5 D130 — bind handler один раз; defensive pattern с DOMContentLoaded. */
  (function bindSaveSprintIntroHandler(){
    function bind() {
      var btn = document.getElementById('saveSprintIntroBtn');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', function(){ doSaveSprintIntro(); });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  })();

  /* ── Новый спринт ──
     v1.6.2 D126: переиспользуем единственный черновик с читаемым именем
     "Новый спринт (не сохранён)" вместо генерации новых uid()-имён при каждом клике.
     При повторном клике без сохранения — перезаписываем тот же черновик, не плодим entries.
     После создания/переиспользования — переключаемся на вкладку Планирование уровень Роли
     (нажатие кнопки на любой вкладке должно приводить к планированию). */
  function doNewSprint(rk) { return SPRINT_CTRL.doNewSprint(rk, _sprintDeps()); }

  /* ── Таблица состава для роли ── */
  function getRoleItemsArr(rk) {
    if (!_roleItems[rk]) _roleItems[rk] = [];
    return _roleItems[rk];
  }

  /* Состав роли (Ring Table, event-делегаты, пагинация) — в rolecomposition-view.js
     (Тир D слайс 3). Делегатор сохраняет hoisting и 18 call-sites; переопределение
     ниже (v2.1.0 E4) оборачивает его пост-обработкой updateAllocOverlimitUI. */
  function renderRoleComposition(rk) { return ROLECOMP_VIEW.renderRoleComposition(rk, _roleCompDeps()); }

  /* ── Динамическое модальное окно ──
     Phase 3 #32 — мигрировано на openModal() (bespoke dynFieldForm, настоящий React).
     Контракт сохранён: callback(true, val) / callback(false, null). Для enum val = выбранное
     значение; для текстового ввода val = parsePeriod(ввод) (как в legacy). form-тип:
     backdrop ✅ / escape ✅ / close-X ✅; Escape/backdrop = отмена (callback(false,null)). */
  /* Тир B — тело в modal-specs.js; enum/text-режимы и done-гард сохранены. */
  function showDynFieldConfirm(title, desc, enumValues, currentVal, callback) {
    return MODAL_SPECS.showDynFieldConfirm(title, desc, enumValues, currentVal, callback,
      { t: T, openModal: openModal, localizeEnumVal: localizeEnumVal, fmtPeriod: fmtPeriod, parsePeriod: parsePeriod });
  }

  function loadEnumBundle(fieldName, cb) {
    if (!fieldName) { cb([]); return; }
    apiGet('field-values?fieldName=' + encodeURIComponent(fieldName)).then(function(r) {
      var edbg = r && r.debug;
      diag('enum-bundle ['+fieldName+']: success='+(!!(r&&r.success))+' count='+(r&&r.values?r.values.length:0)+
        ' typeName='+(edbg&&edbg.typeName||'?')+
        (edbg&&edbg.error?' ERR='+edbg.error:'')+
        (edbg&&edbg.method?' method='+edbg.method:'')+
        (edbg&&edbg.allFieldNames?' fields='+edbg.allFieldNames.length:'')+
        (edbg&&!edbg.found&&edbg.allFieldNames?' NOT in ['+edbg.allFieldNames.slice(0,3).join(',')+']':''),
        r&&r.success&&r.values&&r.values.length?'ok':'warn');
      if (r && r.success && r.values && r.values.length) {
        cb(r.values);
      } else {
        cb([]);
      }
    }).catch(function(e) { diag('enum-bundle ['+fieldName+'] ERR: '+String(e&&e.message?e.message:e), 'err'); cb([]); });
  }

  function updateIssueField(issueId, fieldName, value, type) {
    // Fix 5: используем backend endpoint update-issue-field вместо fetchYouTrack
    apiPost('update-issue-field', { issueId: issueId, fieldName: fieldName, value: value, type: type || 'enum' })
      .then(function(r) {
        if (!r || !r.success) diag('updateIssueField WARN: '+(r&&r.error?r.error:'unknown'), 'err');
        else diag('updateIssueField OK: '+issueId+' '+fieldName+'='+value, 'ok');
      })
      .catch(function(e) { diag('updateIssueField ERR: '+String(e&&e.message?e.message:e), 'err'); });
  }

  /* ── Обновить оценки из YouTrack для роли — legacy per-role путь; вынесен в
     refresh-controller.js (Фаза 5 слайс 5) вместе с обвязкой #35, делегатор.
     Мост и deps-фабрика _refreshDeps — внизу файла, в прежней зоне refresh. ── */
  function refreshRoleEstimates(rk) { return REFRESH_CTRL.refreshRoleEstimates(rk, _refreshDeps()); }

  /* ── Валидация роли ── */
  /* ═══ Validation-контроллер — вынесен в validation-controller.js (Фаза 5
     слайс 4, коммит Б) за мост window.__SSP_VALIDATION_CTRL; golden-контракты —
     validation.golden.test.js (идут через эти делегаторы). Deps-фабрика
     per-call: стейт зоны (_sprint/_settings/_history/_roleItems, _isValidator,
     _activeWorkingDraftKey, guard _overlimitModalShownFor) остаётся в
     стейт-ядре (его трогают другие контроллеры, ресет per-project и gm-хук
     голденов); showOverlimitModal приватна модулю; document-листенеры зоны
     регистрирует VALIDATION_CTRL.install из прежней точки init (ниже,
     после wrapper'а renderRoleComposition). ═══ */
  var VALIDATION_CTRL = (typeof window !== 'undefined' && window.__SSP_VALIDATION_CTRL) || {};
  function _validationDeps() {
    return {
      T: T, toast: toast, diag: diag,
      withLoader: withLoader, roleLabel: roleLabel,
      getRoleItemsArr: getRoleItemsArr,
      checkValidatorNow: checkValidatorNow,
      apiPost: apiPost,
      saveRoleHistorySnapshot: saveRoleHistorySnapshot,
      hideWorkingCopyBanner: hideWorkingCopyBanner,
      renderWidgetHeader: renderWidgetHeader,
      renderRoleStatusBadge: renderRoleStatusBadge,
      checkAllocOverlimit: checkAllocOverlimit,
      calcRemForRole: calcRemForRole,
      openModal: openModal,
      markDirty: _markDirty,
      draftSaveDebounced: _draftSaveDebounced,
      safeLs: safeLs,
      ALL_ROLES: ALL_ROLES, ACTIVE_INC: ACTIVE_INC, STATUS: STATUS,
      state: {
        getSettings: function () { return _settings; },
        getSprint: function () { return _sprint; },
        getRoleItems: function () { return _roleItems; },
        getHistory: function () { return _history; },
        setIsValidator: function (v) { _isValidator = v; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        setActiveWorkingDraftKey: function (v) { _activeWorkingDraftKey = v; },
        getOverlimitModalShownFor: function () { return _overlimitModalShownFor; },
      },
    };
  }
  function doValidateRole(rk) { return VALIDATION_CTRL.doValidateRole(rk, _validationDeps()); }

  function saveRoleHistorySnapshot(rk, overrideIdx, goalFields, wasValidated) {
    return WC.saveRoleHistorySnapshot(rk, overrideIdx, goalFields, wasValidated, _wcDeps());
  }

  /* clearOverlay migrated to openModal() — clearNo/clearYes handlers removed (Phase 1 #32). */

  /* ═══ Подбор задач (Phase 4 #32 — bespoke React pickPicker, см. modal-bodies.jsx) ═══
     Кластер (query/scope/assist/meta/search/loadAll/add/модалка) вынесен в
     widgets/main/src/pick.js (window.__SSP_PICK) — Тир C. Делегаторы; контекст
     собирается в _pickDeps на вызове. Кэш-стейт подбора (_pickAllResults /
     _pickQueryFingerprint / _currentPickRole / _selectedIds / _pickAllInFlight)
     остаётся здесь — модуль ходит к нему через аксессоры deps.state. _mapIssueMeta
     включён в pick.js: его единственные потребители — _pickSearch/_pickLoadAll. */
  var PICK = (typeof window !== 'undefined' && window.__SSP_PICK) || {};
  function _pickDeps() {
    return {
      t: T, toast: toast, diag: diag,
      ctx: _ctx, settings: _settings, currentUser: _currentUser,
      host: _host, pickPage: PICK_PAGE, maxPickTotal: MAX_PICK_TOTAL,
      inc: INC, ytBase: _ytBase, draftVersion: DRAFT_VERSION, baseRevHash: _baseRevHash,
      sprint: _sprint, roleItems: _roleItems,
      getRoleItemsArr: getRoleItemsArr, apiPost: apiPost, openModal: openModal, roleLabel: roleLabel,
      markDirty: _markDirty, draftSet: _draftSet,
      renderRoleComposition: renderRoleComposition,
      updateRoleRemaining: updateRoleRemaining,
      refreshRoleEstimates: refreshRoleEstimates,
      pickAssist: _pickAssist, pickSearch: _pickSearch,
      pickLoadAll: _pickLoadAll, pickAddSelected: _pickAddSelected,
      state: {
        getCache: function(){ return _pickAllResults; },
        setCache: function(m){ _pickAllResults = m; },
        getFingerprint: function(){ return _pickQueryFingerprint; },
        setFingerprint: function(s){ _pickQueryFingerprint = s; },
        getCurrentRole: function(){ return _currentPickRole; },
        setCurrentRole: function(rk){ _currentPickRole = rk; },
        setSelectedIds: function(s){ _selectedIds = s; },
        setAllInFlight: function(b){ _pickAllInFlight = b; },
      },
    };
  }
  function _buildPickQuery(rawQ) { return PICK._buildPickQuery(rawQ, _pickDeps()); }
  function _buildPickScope() { return PICK._buildPickScope(_pickDeps()); }
  function _pickAssist(req) { return PICK._pickAssist(req, _pickDeps()); }
  function _mapIssueMeta(iss) { return PICK._mapIssueMeta(iss, _pickDeps()); }
  function _pickSearch(rawQ, page) { return PICK._pickSearch(rawQ, page, _pickDeps()); }
  function _pickLoadAll(rawQ) { return PICK._pickLoadAll(rawQ, _pickDeps()); }
  function _pickAddSelected(rk, selectedIds) { return PICK._pickAddSelected(rk, selectedIds, _pickDeps()); }
  function openPickModal(rk, role) { return PICK.openPickModal(rk, role, _pickDeps()); }

  /* ═══ ИСТОРИЯ ═══════════════════════════════════════════════ */
  /* ── История спринтов: view вынесен в history-view.js
     (window.__SSP_HISTORY_VIEW) — Тир D слайс 4, ступень 1.
     Делегаторы; контекст собирается в _historyDeps() на вызове, стейт модуль
     читает get-аксессорами в момент обращения. WC-механика, контроллеры
     экспорта/правки/завершения и пагинация-листенеры остаются в монолите. */
  var HISTORY_VIEW = (typeof window !== 'undefined' && window.__SSP_HISTORY_VIEW) || {};
  function _historyDeps() {
    return {
      T: T, esc: esc, safeUrl: safeUrl, icon: icon, diag: diag,
      fmtDate: fmtDate, fmtDT: fmtDT, fmtHours: fmtHours, fmtHoursOnly: fmtHoursOnly,
      fmtPeriod: fmtPeriod, fmtThLabel: fmtThLabel,
      statusLabel: statusLabel, incLabel: incLabel, dispEnum: dispEnum,
      toast: toast, openModal: openModal, apiPost: apiPost,
      exportSprintToExcel: exportSprintToExcel, exportPerSprintJson: exportPerSprintJson,
      editHistorySprint: editHistorySprint, finishHistorySprint: finishHistorySprint,
      discardWorkingDraft: discardWorkingDraft,
      getLogicalSprintIds: getLogicalSprintIds, setCurrentSprintId: setCurrentSprintId,
      renderWidgetHeader: renderWidgetHeader,
      renderHistory: renderHistory,
      ALL_ROLES: ALL_ROLES, STATUS: STATUS, ACTIVE_INC: ACTIVE_INC, HIST_PAGE: HIST_PAGE,
      state: {
        getHistory: function () { return _history; },
        getHistPage: function () { return _histPage; },
        setHistPage: function (p) { _histPage = p; },
        getWorkingDrafts: function () { return _workingDrafts; },
        getSettings: function () { return _settings; },
        getCurrentUser: function () { return _currentUser; },
        getIsValidator: function () { return _isValidator; },
        getCurrentSprintId: function () { return _currentSprintId; },
        getSprint: function () { return _sprint; },
      },
    };
  }
  function renderHistory() { return HISTORY_VIEW.renderHistory(_historyDeps()); }
  /* Делегатор-точка входа golden'ов render-history (gm.call) — прод-caller
     один: внутри модуля. */
  function buildSpoiler(rec, idx) { return HISTORY_VIEW.buildSpoiler(rec, idx, _historyDeps()); }

  document.getElementById('histPrev').addEventListener('click', function() { _histPage--; renderHistory(); });
  document.getElementById('histNext').addEventListener('click', function() { _histPage++; renderHistory(); });

  /* ── v5.3.0 — Открыть на правку: working copies (immutable snapshots, D3/b) ──
     Не разрушаем _history[idx]. Создаём/возобновляем working copy в _workingDrafts.
     Multi-tab: same-user в новой вкладке → soft-warn; cross-user — disabled-кнопка
     отфильтровала, но защищаемся ещё раз. */
  function editHistorySprint(rec, idx) {
    checkValidatorNow().then(function(ok) {
      if (!ok) { toast(T('toastNoEditRights')); return; }
      if (!rec || !rec.sprintId) return;
      if (rec.status === STATUS.FINISHED) {
        try { toast(T('cannotEditFinished'), 'warn'); } catch(_){}
        return;
      }
      var role = ALL_ROLES.find(function(r){ return r.key === rec.roleKey; });
      if (!role) return;
      var key = rec.sprintId;
      var existing = _workingDrafts[key];
      var login = (_currentUser && _currentUser.login) || '';

      if (existing) {
        /* Чужая working copy — должна быть отфильтрована disabled-кнопкой,
           но защита defense-in-depth. */
        if (existing.editorLogin && existing.editorLogin !== login) {
          try { toast(T('wcLockedByOther').replace('{who}', existing.editorLogin), 'warn'); } catch(_){}
          return;
        }
        /* Same user, другая вкладка → soft-warn модал */
        if (existing.editorTabToken && existing.editorTabToken !== _thisTabToken) {
          if (typeof showMultiTabConflictModal === 'function') {
            showMultiTabConflictModal(key, function(takeOver){
              if (takeOver) {
                existing.editorTabToken = _thisTabToken;
                existing.updatedAt = Date.now();
                _workingDraftsScheduleFlush();
                resumeWorkingDraft(key, idx);
              }
              /* takeOver=false → ничего не делаем, остаёмся на вкладке истории */
            });
            return;
          }
          /* Fallback если модала нет ещё (race на boot) — take-over автоматом */
          existing.editorTabToken = _thisTabToken;
          existing.updatedAt = Date.now();
          _workingDraftsScheduleFlush();
        }
        resumeWorkingDraft(key, idx);
        return;
      }
      /* Working copy не существует — создаём и возобновляем */
      createWorkingDraftFromSnapshot(rec, idx);
      resumeWorkingDraft(key, idx);
    });
  }

  /* ── Завершить спринт ── */
  function finishHistorySprint(rec, idx) {
    openModal({
      id: 'finishHist',
      type: 'confirm',
      title: T('confirmFinishSprint'),
      body: { kind: 'text', text: T('confirmFinishSprint') },
      buttons: [
        { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function(h) { h.close(); } },
        { id: 'confirm', text: T('btnYesFinish'), variant: 'primary', onClick: function(h) {
          h.close();
          if (!_isValidator) { toast(T('toastNoValidRights'), 'warn'); return; }
          if (!_history[idx]) return;
          var histRec = _history[idx];
          openConfirmGoalDialog(histRec.sprintGoal, histRec.goalOutcome).then(function(goalFields) {
            if (!goalFields) return;
            histRec.status = STATUS.FINISHED;
            histRec.finishedAt = Date.now();
            if (goalFields.goalOutcome)   histRec.goalOutcome   = goalFields.goalOutcome;
            if (goalFields.goalRetroNote) histRec.goalRetroNote = goalFields.goalRetroNote;
            apiPost('history', { history: _history }).then(function() {
              renderHistory();
              toast(T('toastSprintFinished'), 'success');
            });
          });
        }},
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }

  /* overlimitOverlay migrated to openModal() — button bindings removed (Phase 1 #32). */

  /* finishHistOverlay migrated to openModal() — finishHistNo/finishHistYes handlers removed (Phase 1 #32). */

  /* delHistOverlay migrated to openModal() — delHistNo/delHistYes handlers removed (Phase 1 #32). */

  /* ── Очистить всю историю — v5.0.1: отдельная роль historyManager ── */
  (function () {
    var btn = document.getElementById('clearAllHistoryBtn');
    if (btn) btn.addEventListener('click', function () {
      openModal({
        id: 'clearAllHist',
        type: 'destructive',
        title: T('clearAllHistTitle'),
        body: { kind: 'lines', lines: [
          { html: T('clearAllHistWarn'), style: { color: 'var(--error)' } },
          { text: T('clearAllHistInfo'), style: { marginTop: '8px', fontSize: '13px', color: 'var(--muted)' } },
        ]},
        buttons: [
          { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); } },
          { id: 'confirm', text: T('btnYesClearAll'), variant: 'danger', onClick: function(h) {
            h.close();
            apiPost('history', null, { action: 'clear' })
              .then(function (r) {
                if (!r || !r.success) {
                  var reason = (r && r.reason) || 'unknown';
                  if (reason === 'history_manager_rights_required') {
                    toast(T('toastNoHistClearRights'), 'err');
                    return;
                  }
                  throw new Error(reason);
                }
                _history = [];
                renderHistory();
                try {
                  var isActiveAfterClear = _sprint && _sprint.sprintId === _currentSprintId;
                  if (!isActiveAfterClear) {
                    setCurrentSprintId(_sprint && _sprint.sprintId ? _sprint.sprintId : null, { confirmed: true });
                  } else if (typeof renderWidgetHeader === 'function') {
                    renderWidgetHeader();
                  }
                } catch(e){ diag('clearAll sync header err: '+e,'err'); }
                toast(T('toastHistoryCleared'), 'success');
              })
              .catch(function (e) {
                var msg = (e && e.message) ? e.message : String(e);
                if (msg.indexOf('history_manager_rights_required') >= 0 || msg.indexOf('403') >= 0) {
                  toast(T('toastNoHistClearRights'), 'err');
                } else {
                  toast(T('toastHistoryClearErr') + ': ' + msg, 'err');
                }
              });
          }},
        ],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: false,
      });
    });
  })();

  /**
   * v5.0.1 — управление видимостью кнопки «Очистить всю историю».
   * Видна только участникам группы historyClearGroups (серверная проверка check-history-manager).
   */
  function refreshClearHistoryBtn() {
    var btn = document.getElementById('clearAllHistoryBtn');
    if (!btn) return;
    apiGet('check-history-manager')
      .then(function (r) {
        var ok = !!(r && r.isHistoryManager);
        btn.style.display = ok ? '' : 'none';
        diag('check-history-manager: isHistoryManager=' + ok, 'info');
      })
      .catch(function () { btn.style.display = 'none'; });
  }

  /* ═══ Экспорт в Excel ═══════════════════════════════════════ */
  /* v1.4.2 D129 — SheetJS теперь поставляется в составе app-zip'а
     (widgets/main/lib/xlsx.mini.min.js, ~280 KB Apache-2.0 build), а не
     загружается с cdn.sheetjs.com. Это убирает внешнюю зависимость
     (важно для air-gapped self-hosted YT instances), исключает CDN
     availability как точку отказа экспорта, а также упрощает security
     review плагина. Mini-build покрывает наш use-case полностью —
     XLSX write-only (book_new, aoa_to_sheet, book_append_sheet,
     writeFile). v5.0.3 lazy-load logic сохранена: первый клик
     «Экспорт в Excel» подгружает скрипт, последующие используют
     загруженный XLSX напрямую. */
  var _xlsxLoadPromise = null;
  function loadXLSXLib() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (_xlsxLoadPromise) return _xlsxLoadPromise;
    _xlsxLoadPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      /* Relative path внутри widget iframe → YT отдаёт файл из app-zip'а
         (тот же скоп, что index.html, settings.json и i18n/*.json). */
      s.src = 'lib/xlsx.mini.min.js';
      s.onload  = function(){ diag('XLSX lib loaded (bundled)','ok'); resolve(); };
      s.onerror = function(e){ _xlsxLoadPromise = null; reject(new Error('XLSX bundled load failed')); };
      document.head.appendChild(s);
    });
    return _xlsxLoadPromise;
  }
  /* Тир B — тело в excel-export.js; lazy-load XLSX и AOA-сборка 1:1. */
  function exportSprintToExcel(rec) {
    return EXCEL_EXPORT.exportSprintToExcel(rec, _excelDeps());
  }

  /* ═══ v2.1.13 — Экспорт/импорт истории в JSON (#27) ══════════════ */

  var HIST_EXPORT_FORMAT     = 'ssp-sprint-history';
  var HIST_EXPORT_FORMAT_VER = 1;
  var HIST_ACCEPTED_FORMATS  = ['scbt-sprint-history', 'ssp-sprint-history'];

  /* Кластер экспорта/импорта истории (anonymize, конверт, preflight, файл-стем,
     импорт-диалог) вынесен в widgets/main/src/history-io.js (window.__SSP_HISTORY_IO)
     — Тир C. Делегаторы; контекст собирается в _histIoDeps на вызове. Формат-маркеры
     HIST_* остаются здесь: значения намеренно различаются между форками (cross-fork
     приём). _triggerJsonDownload / exportPerSprintJson / _importHistPending — тоже здесь. */
  var HISTORY_IO = (typeof window !== 'undefined' && window.__SSP_HISTORY_IO) || {};
  function _histIoDeps() {
    return {
      t: T, toast: toast, diag: diag, fmtDate: fmtDate, fmtDT: fmtDT,
      histExportFormat: HIST_EXPORT_FORMAT, histExportFormatVer: HIST_EXPORT_FORMAT_VER,
      histAcceptedFormats: HIST_ACCEPTED_FORMATS, appVersion: APP_VERSION,
      projectDisplayName: _projectDisplayName, ctx: _ctx, currentUser: _currentUser,
      history: _history, openModal: openModal,
      triggerJsonDownload: _triggerJsonDownload,
      submitHistImport: _submitHistImport,
      openImportReplaceConfirm: _openImportReplaceConfirm,
      setImportHistPending: function (v) { _importHistPending = v; },
    };
  }
  function _anonymizeHistRecords(records) {
    return HISTORY_IO._anonymizeHistRecords(records);
  }
  function _buildHistEnvelope(records, anonymize) {
    return HISTORY_IO._buildHistEnvelope(records, anonymize, _histIoDeps());
  }

  function _triggerJsonDownload(obj, fileName) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a'); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  function _histFileStem() {
    return HISTORY_IO._histFileStem(_histIoDeps());
  }

  /* Экспорт всей истории */
  function exportAllHistoryToJson(anonymize) {
    return HISTORY_IO.exportAllHistoryToJson(anonymize, _histIoDeps());
  }

  /* Экспорт одного спринта (все роли) по базовому sprintId */
  function exportPerSprintJson(rec) {
    var baseId   = String(rec.sprintId).split('_')[0];
    var sprintRecs = _history.filter(function(h){ return h && String(h.sprintId).split('_')[0] === baseId; });
    var env = _buildHistEnvelope(sprintRecs, false);
    var safeName = (rec.name || 'sprint').replace(/[\\/:*?"<>|]/g, '_');
    var d   = rec.dateStart ? fmtDate(rec.dateStart).replace(/\./g, '-') : 'nodate';
    _triggerJsonDownload(env, 'ssp-sprint-' + safeName + '_' + d + '.json');
    toast(T('toastHistExported') || 'Спринт экспортирован', 'success');
  }

  /* ── Экспорт-кнопки в header вкладки «История» ── */
  (function() {
    var expBtn = document.getElementById('exportAllHistoryBtn');
    var impBtn = document.getElementById('importHistoryBtn');
    var fileInput = document.getElementById('histImportFileInput');
    if (expBtn) {
      expBtn.title = T('btnExportHistoryTitle') || 'Скачать всю историю в JSON';
      expBtn.addEventListener('click', function() { exportAllHistoryToJson(false); });
    }
    if (impBtn && fileInput) {
      impBtn.title = T('btnImportHistoryTitle') || 'Загрузить историю из JSON-файла';
      impBtn.addEventListener('click', function() { fileInput.value = ''; fileInput.click(); });
      fileInput.addEventListener('change', function() {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            var data = JSON.parse(ev.target.result);
            openImportHistDialog(data).catch(function(){});
          } catch(e) {
            toast((T('toastHistImportErr') || 'Ошибка импорта: ') + 'JSON parse error', 'err');
          }
        };
        reader.readAsText(f);
      });
    }
  })();

  /* ── Preflight-валидация конверта ── */
  function _preflightHistFile(data) {
    return HISTORY_IO._preflightHistFile(data, _histIoDeps());
  }

  /* ── Диалог импорта (Promise-based) ── */
  var _importHistPending = null; // { records, mode, selectedBaseIds }

  function openImportHistDialog(data) {
    return HISTORY_IO.openImportHistDialog(data, _histIoDeps());
  }

  function _submitHistImport(selectedBaseIds, mode, fileRecords) {
    var current = (_history || []).slice();
    var toAdd   = fileRecords.filter(function(r){ return r && r.sprintId && selectedBaseIds.indexOf(String(r.sprintId).split('_')[0]) >= 0; });
    if (mode === 'overwrite') {
      var removeSet = {};
      toAdd.forEach(function(r){ removeSet[r.sprintId] = true; });
      current = current.filter(function(h){ return !removeSet[h.sprintId]; });
    } else {
      // skip: убираем из toAdd то, что уже есть (по полному sprintId)
      var existingIds = {}; current.forEach(function(h){ if (h) existingIds[h.sprintId] = true; });
      toAdd = toAdd.filter(function(r){ return !existingIds[r.sprintId]; });
    }
    var merged = current.concat(toAdd);
    return apiPost('history', { history: merged }).then(function() {
      _history = merged;
      renderHistory();
      toast((T('toastHistImported') || 'Импортировано: {n}').replace('{n}', toAdd.length), 'success');
      diag('history import merged: ' + toAdd.length + ' records (mode=' + mode + ')', 'ok');
    }).catch(function(e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (msg.indexOf('history_data_too_large') >= 0) toast(T('toastHistImportTooLarge') || 'Файл превышает допустимый размер', 'err');
      else toast((T('toastHistImportErr') || 'Ошибка импорта: ') + msg, 'err');
    });
  }

  /* ── Полное восстановление (replace-all) ──
     Phase 3 #32 — importReplaceHist мигрирован на openModal() (generic lines-confirm,
     destructive-тип: backdrop ❌ / escape ✅ / close-X ❌). Escape/отмена очищает pending. */
  /* Тир B — тело в modal-specs.js; downstream-стейт инъектируется колбэками:
     yes → _doImportReplaceAll (сам чистит pending), отмена/escape → сброс pending. */
  function _openImportReplaceConfirm() {
    return MODAL_SPECS.openImportReplaceConfirm({
      t: T, openModal: openModal,
      onReplace: function(){ _doImportReplaceAll(); },
      onAbandon: function(){ _importHistPending = null; },
    });
  }
  function _doImportReplaceAll() {
    if (!_importHistPending || !_importHistPending.records) { _importHistPending = null; return; }
    var records = _importHistPending.records; _importHistPending = null;
    apiPost('history', { history: records }, { action: 'import-replace' })
      .then(function(r) {
        if (!r || !r.success) throw new Error((r && r.reason) || 'unknown');
        _history = records.slice();
        renderHistory();
        toast(T('toastHistReplaced') || 'История восстановлена из файла', 'success');
        diag('history replaced: ' + records.length + ' records', 'ok');
      })
      .catch(function(e) {
        var msg = (e && e.message) ? e.message : String(e);
        if (msg.indexOf('history_manager_rights_required') >= 0 || msg.indexOf('403') >= 0) toast(T('toastNoHistReplaceRights') || 'Нет прав', 'err');
        else toast((T('toastHistReplaceErr') || 'Ошибка: ') + msg, 'err');
      });
  }

  /* ═══════════════════════════════════════════════════════════
     v4.0.0 — АЛЛОКАЦИЯ: валидация превышения лимита по задачам
     ═══════════════════════════════════════════════════════════ */

  /**
   * Проверяет превышение аллокации у задач vs. ресурс роли.
   * Возвращает массив индексов задач с превышением.
   * Тело — в widgets/main/src/revalidation.js (Тир C), см. _revalDeps выше.
   */
  function checkAllocOverlimit(rk) {
    return REVALIDATION.checkAllocOverlimit(rk, _revalDeps());
  }

  /* Детектор перелимита + блокировка кнопки валидации (вкл. B13-агрегат,
     #38 и overlimit-модалку) — вынесен в validation-controller.js. Делегатор
     нужен wrapper'у renderRoleComposition (ниже) и голденам. */
  function updateAllocOverlimitUI(rk) { return VALIDATION_CTRL.updateAllocOverlimitUI(rk, _validationDeps()); }

  /* v5.2.0 — Overlimit-модал (showOverlimitModal) ПРИВАТЕН validation-controller.js:
     единственный вход — updateAllocOverlimitUI. Объявление _overlimitModalShownFor —
     выше, среди стейт-var'ов ядра (его трогает gm-хук голденов; per-project ресет
     его и раньше не сбрасывал — ключ включает sprintId). */

  /* v5.2.0 — onboarding-подсказка ALLOCATED-lock — вынесена в validation-controller.js.
     Делегатор нужен init-флоу загрузки проекта (см. _loadAndRenderProject-цепочку). */
  function maybeShowAllocatedLockHint() { return VALIDATION_CTRL.maybeShowAllocatedLockHint(_validationDeps()); }

  /* v2.1.0 E4 — Ring Table owns row DOM; data-alloc-gi tagging is gone.
     Post-render hook now only triggers overlimit check (input border + validate
     button + modal). */
  var _origRenderRoleComposition = renderRoleComposition;
  renderRoleComposition = function(rk) {
    _origRenderRoleComposition(rk);
    updateAllocOverlimitUI(rk);
  };

  /* Document-листенеры зоны (blur alloc-input / change inc-sel → отложенный
     пересчёт перелимита 50мс) регистрирует модуль — из той же точки init,
     где зона регистрировала их раньше (порядок регистрации сохранён;
     install-once паттерн мостов E3). Deps — фабрикой в момент выстрела. */
  if (VALIDATION_CTRL.install) VALIDATION_CTRL.install(_validationDeps);


  /* v4.0.0-патч спойлера истории снесён как мёртвый код (Тир D слайс 4):
     обе его ветки давно no-op — кнопка правки для FINISHED-записей не создаётся
     самим рендером (гейт прав/статуса), а native-таблица items заменена Ring Table
     (v2.0.0 D128) — синхронный DOM-запрос патча не находил целей. Утрата колонок
     «Аллокация»/«Исполнитель» в таблице истории — pre-existing с v2.0.0, в бэклоге.
     (editHistorySprint патчнут выше — для восстановления alloc и v4-блоков, жив.) */


  /* ═══════════════════════════════════════════════════════════
     v5.4.0 — ОБЩИЙ КОНТЕКСТ СПРИНТА (Этап 2)
     Журнал решений: D25 (empty-state без авто-создания), D26 (per-project,
     не per-role в селекторе), D27 (минимальный статус по ролям + tooltip),
     D28 (soft-warn при смене с активной WC), D29 (silent миграция).
     ── Шапка виджета: view вынесен в header-view.js
     (window.__SSP_HEADER_VIEW) — Тир D слайс 5, ступень 1.
     Делегаторы; контекст собирается в _headerDeps() на вызове, стейт модуль
     читает get/set-аксессорами в момент обращения (raw-сеттер _currentSprintId —
     для D72-сброса и fallback'а рендера, НЕ контроллер setCurrentSprintId).
     Хелперы getSprintRolesEntries/getSprintMeta/hasWorkingCopyForSprint и
     STATUS_RANK живут в модуле (внешних callers в монолите нет). Контроллер
     setCurrentSprintId и init-бинды (bindWidgetHeader) остаются в монолите. */
  var HEADER_VIEW = (typeof window !== 'undefined' && window.__SSP_HEADER_VIEW) || {};
  function _headerDeps() {
    return {
      T: T, esc: esc, diag: diag, fmtDate: fmtDate,
      statusLabel: statusLabel, roleLabel: roleLabel,
      getActiveRoles: getActiveRoles,
      computeRequiredRevalidationLevel: computeRequiredRevalidationLevel,
      hideReassignModal: hideReassignModal,
      navAvailable: _navAvailable,
      ALL_ROLES: ALL_ROLES, STATUS: STATUS,
      draft: { get: _draftGet, set: _draftSet },
      state: {
        getSprint: function () { return _sprint; },
        getHistory: function () { return _history; },
        getWorkingDrafts: function () { return _workingDrafts; },
        getCurrentSprintId: function () { return _currentSprintId; },
        setCurrentSprintId: function (v) { _currentSprintId = v; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        getCurrentUser: function () { return _currentUser; },
        getMode: function () { return _mode; },
      },
    };
  }
  function getLogicalSprintIds() { return HEADER_VIEW.getLogicalSprintIds(_headerDeps()); }

  /* Единая точка изменения _currentSprintId. Возвращает true если switch произошёл,
     false если был отменён (модал «Закрыть рабочую копию?» — D28). */
  /* D28-флоу смены спринта — вынесен в sprint-controller.js (Фаза 5 слайс 6) за
     __SSP_SPRINT_CTRL; делегатор (callers: монолит share-apply/init-бинды + history-view).
     ⚠️ Это контроллер (зовёт рендер + WC-protection), НЕ raw-сеттер _currentSprintId
     header-вью/draft-store (те пишут id через deps.state.setCurrentSprintId). */
  function setCurrentSprintId(newId, opts) { return SPRINT_CTRL.setCurrentSprintId(newId, opts, _sprintDeps()); }

  /* v5.6.0 — Этап 4 (4c): refreshPlannerForCurrentSprint удалена.
     Баннер #plannerHistoricalNotice физически удалён в C2 (4b). Hybrid режим v5.5.0 (D34)
     через _setHistoricalReadOnly + _applyHybridSprintMode заменил функционально. */

  /* Soft-warn модал перед сменой спринта при активной WC (D28). */
  /* Тир B — тело в modal-specs.js; cb только по явному клику (confirm/cancel). */
  function showCloseWorkingCopyModal(cb) {
    return MODAL_SPECS.showCloseWorkingCopyModal(cb, { t: T, openModal: openModal });
  }

  /* Идемпотентный рендер шапки виджета — вынесен в header-view.js (делегатор;
     16 callers по всему монолиту + _wcDeps/_historyDeps + golden gm.call). */
  function renderWidgetHeader() { return HEADER_VIEW.renderWidgetHeader(_headerDeps()); }

  /* Bind listeners шапки виджета (idempotent) */
  (function bindWidgetHeader() {
    var sel = document.getElementById('widgetSprintSel');
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.addEventListener('change', function() {
        var newId = this.value;
        var ok = setCurrentSprintId(newId);
        if (ok === false) {
          /* модал отменил — откатываем select */
          this.value = _currentSprintId || '';
        }
      });
    }
    var wcInd = document.getElementById('widgetWcIndicator');
    if (wcInd && !wcInd.dataset.bound) {
      wcInd.dataset.bound = '1';
      var goPlanner = function() {
        /* v5.6.0 — Этап 4 (4c): переключение на tab-planning > Роли вместо legacy tab-planner. */
        var plannerBtn = document.querySelector('.tab-btn[data-tab="planning"]');
        if (plannerBtn && !plannerBtn.classList.contains('active')) plannerBtn.click();
        var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
        if (rolesBtn) rolesBtn.click();
        var b = document.getElementById('wcBanner');
        if (b && b.scrollIntoView) {
          try { b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          catch(_){ b.scrollIntoView(); }
        }
      };
      wcInd.addEventListener('click', goPlanner);
      wcInd.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goPlanner(); }
      });
    }
    var newBtn = document.getElementById('widgetNewSprintBtn');
    if (newBtn && !newBtn.dataset.bound) {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', function() {
        var roles = (typeof getActiveRoles === 'function') ? getActiveRoles() : [];
        if (!roles.length) {
          if (typeof toast === 'function') toast(T('toastSelectRole') || 'Select a role', 'warn');
          return;
        }
        if (typeof doNewSprint === 'function') doNewSprint(roles[0].key);
        /* #25 Ф2 — после создания нового спринта в global-режиме перекидываем на узел
           дерева «Параметры спринта», чтобы пользователь сразу заполнил вводные. */
        if (_mode === 'global' && typeof _setDashNode === 'function') {
          try { _setDashNode('sprint-params'); } catch(_){}
        }
      });
    }
  })();

  /* ═══════════════════════════════════════════════════════════
     v4.0.0 — ВКЛАДКА «РАСПРЕДЕЛЕНИЕ ЗАДАЧ»
     ═══════════════════════════════════════════════════════════ */

  /* ── Состояние вкладки ── */
  var _currentSprintRoleRec = null;   // выбранная запись (из истории или текущий)
  var _currentRolePP = null;          // personalPlanning block
  var _currentRoleGantt = null;       // gantt block
  var _currentRoleNkcKey = 'other';   // выбранный ключ НКЧ

  /* v5.6.0 — Этап 4 (4c): удалены legacy функции:
     - .dst-subtab-btn click handler (subtabs больше нет — Гант на верхнем уровне);
     - refreshDistribForCurrentSprint и populateDistribSprintSel (логика рендера
       переехала в refreshPlanningPeopleForCurrentSprint и refreshGanttForCurrentSprint).
     После C4 4d полный inline editor работает прямо в #planning-level-people / #tab-gantt. */

  /* v5.6.0 — Этап 4 (D43, KL#4 v5.4.0): явные helpers вместо legacy _isActiveSprintEntry.
     - isActiveSprintRecord(rec): запись принадлежит активному _sprint (prefix-match по _sprint.sprintId).
       Используется в save-ветках saveRoleHistorySnapshot / saveCurrentRoleState / distribValidate / gantt cell handler.
     - isCurrentSprintRoleEntry(rec, rk): запись соответствует выбранному в шапке спринту И роли rk.
       Полезно для render-веток, где rk доступен из контекста цикла. */
  function isActiveSprintRecord(rec) {
    if (!rec || !rec.sprintId || !_sprint || !_sprint.sprintId) return false;
    return rec.sprintId.indexOf(_sprint.sprintId + '_') === 0;
  }
  function isCurrentSprintRoleEntry(rec, rk) {
    if (!rec || !rec.sprintId || !_currentSprintId || !rk) return false;
    return rec.sprintId === (_currentSprintId + '_' + rk);
  }
  /* v5.6.0 — Этап 4 (4c): удалены legacy функции _isActiveSprintEntry (заменена isActiveSprintRecord),
     onDistribSprintSelect (логика инициализации _currentSprintRoleRec/_currentRolePP/_currentRoleGantt
     переехала в refreshPlanningPeopleForCurrentSprint и refreshGanttForCurrentSprint в C4 4d). */

  /**
   * v5.0 — выбор НКЧ по преобладающему месяцу длительности спринта.
   * Возвращает { key: 'january'|'may'|'other', crossMonth: boolean }.
   * crossMonth=true если спринт затрагивает >1 месяц (повод для UI-warning).
   */
  // legacy compat: старая сигнатура (1 аргумент) → возвращает только key

  /* ── НКЧ изменён вручную ── */
  document.getElementById('currentRoleNkcSel').addEventListener('change', function() {
    _currentRoleNkcKey = this.value;
    if (_currentRolePP) { _currentRolePP.nkcKey = _currentRoleNkcKey; saveCurrentRoleState(); }
    updateCurrentRoleTotals();
    renderCurrentRoleAssigneeTable();
    /* v5.0.3 — UI-state + draft mark */
    var ui = _draftGet('ui') || {}; ui.currentRoleNkcKey = _currentRoleNkcKey; _draftSet('ui', ui);
    _markDirty('currentRole');
    _draftSaveDebounced('currentRole', function(){
      return { pp: _currentRolePP, gantt: _currentRoleGantt, nkcKey: _currentRoleNkcKey,
               sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null };
    });
  });

  /* v5.0.3 (итерация 5) — Реализация ранее НЕ определённых функций.
     До этого были только typeof-гарды, которые всегда возвращали false →
     ресурсы в режиме usePersonalForResource не пересчитывались автоматически. */

  /* Сумма персональных ресурсов исполнителей для роли rk (в часах).
     Источник данных:
       1) Если активный _currentRolePP относится к этой роли — берём из него (live).
       2) Иначе — ищем запись истории с sprintId = _sprint.sprintId + '_' + rk
          и берём её personalPlanning.resourcesByAssignee. */
  function getPersonalPlanningResourceForRole(rk) {
    if (!_sprint || !_sprint.sprintId) return 0;
    var histId = _sprint.sprintId + '_' + rk;
    var pp = null;
    /* приоритет: live _currentRolePP, если он относится к этой роли */
    if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId === histId && _currentRolePP) {
      pp = _currentRolePP;
    } else if (Array.isArray(_history)) {
      var rec = _history.find(function(h){ return h.sprintId === histId; });
      pp = rec && rec.personalPlanning ? rec.personalPlanning : null;
    }
    if (!pp || !pp.resourcesByAssignee) return 0;
    var sum = 0;
    Object.keys(pp.resourcesByAssignee).forEach(function(login){
      var r = pp.resourcesByAssignee[login] && pp.resourcesByAssignee[login].resource;
      if (typeof r === 'number' && isFinite(r)) sum += r;
    });
    return sum;
  }

  /* Пересчитать res_<rk> input для всех активных ролей и записать в _sprint[role.resKey].
     Вызывается из:
       - init после loadAllData/restoreDraftIfAny;
       - saveCurrentRoleState после успешного apiPost (если активная запись);
       - смены grade/состава исполнителей (через doRecalcResource → saveCurrentRoleState). */
  function applyPersonalResourceToInputs() {
    if (!_sprint || !_settings || !_settings.usePersonalForResource) return;
    var activeRoles = getActiveRoles();
    activeRoles.forEach(function(role) {
      var totalH = getPersonalPlanningResourceForRole(role.key);
      var totalMin = Math.round(totalH * 60);
      _sprint[role.resKey] = totalMin;
      var resEl = document.getElementById('res_'+role.key);
      if (resEl) {
        resEl.value = fmtPeriod(totalMin);
        resEl.readOnly = true;
        resEl.style.opacity = '0.6';
        resEl.title = T('resManagedByCurrentRole');
      }
      /* Обновить остаток для роли (зависит от resKey) */
      if (typeof updateRoleRemaining === 'function') {
        try { updateRoleRemaining(role.key); } catch(_){}
      }
    });
    /* Также пометить sprint как изменённый для backend draft, чтобы при F5
       значение _sprint[role.resKey] восстановилось. */
    if (typeof _markDirty === 'function') {
      try { _markDirty('sprint'); } catch(_){}
    }
    if (typeof _draftSaveDebounced === 'function') {
      try { _draftSaveDebounced('sprint', function(){ return _sprint; }); } catch(_){}
    }
  }

  /* ── Рассчитать ресурс исполнителей ── */
  /* ─── «Рассчитать ресурс» — пересчитать часы для ТЕКУЩЕГО списка исполнителей ─── */
  document.getElementById('currentRoleCalcBtn').addEventListener('click', function() {
    if (!_currentSprintRoleRec) { toast(T('toastSelectSprint')); return; }
    if (!_settings) { toast(T('toastFillSettings')); return; }
    doRecalcResource();
  });

  /* v5.0.3 — кнопка «💾 Сохранить параметры» на вкладке распределения.
     Аналог saveHeaderBtn на planner-вкладке: принудительный flush PP/Gantt
     в backend (история + при необходимости _sprint), без debounce-задержки. */
  (function bindCurrentRoleSaveParamsBtn() {
    var btn = document.getElementById('currentRoleSaveParamsBtn');
    if (!btn || btn._sspBound) return;
    btn._sspBound = true;
    btn.addEventListener('click', function() {
      if (!_currentSprintRoleRec) { toast(T('toastSelectSprint')); return; }
      if (!_isEditor) { toast(T('toastNoEditRights'), 'warn'); return; }
      btn.disabled = true;
      var origText = btn.textContent;
      btn.textContent = T('toastSaving');
      /* Сразу пишем в backend draft (минуя debounce) */
      _markDirty('currentRole');
      _draftSet('currentRole', { pp: _currentRolePP, gantt: _currentRoleGantt, nkcKey: _currentRoleNkcKey,
                              sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null });
      _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      _draftFlushNow();
      /* saveCurrentRoleState уже умеет: пишет в _history (apiPost('history')),
         и если активный спринт — также в _sprint (apiPost('sprint-data')).
         Каждый успех вызывает markSavedAndCleanup → снимает dirty. */
      saveCurrentRoleState();
      /* Восстановить кнопку через таймаут (apiPost-ы — fire-and-forget) */
      setTimeout(function(){
        btn.disabled = false;
        btn.textContent = origText;
        toast(T('toastCurrentRoleParamsSaved'), 'success');
      }, 600);
    });
  })();

  function doRecalcResource() { return CURRENTROLE_VIEW.doRecalcResource(_currentRoleDeps()); }

  /* ─── «Подобрать исполнителей» — загрузить актуальный список из бандла поля ─── */
  function doCurrentRoleCalc() { return CURRENTROLE_VIEW.doCurrentRoleCalc(_currentRoleDeps()); }

  /* ── Вспомогательные функции ── */
  function deepClone(obj) { return UTIL_PURE.deepClone(obj); }
  /* v5.7.0 — Этап 5 (D45): структура `taskAssignments[issueId]`:
       { assignee: 'login', assigneeName: 'Display Name',
         dateStart: <ts>, dateEnd: <ts>,
         ganttColor?: '#abcdef'  // опциональный кеш, инвалидируется на любой write через delete entry.ganttColor;
                                // primary источник цвета бара — родной stateColor задачи (v2.1.14). }
     Старая модель `_currentRoleGantt.tasks[id].color` (blue/red) — устранена в v5.7.0;
     поле остаётся на чтение для backward-compat (orphan detection — backend D59 v5.9.0). */
  function emptyPP() {
    return { nkcKey:'other', resourcesByAssignee:{}, taskAssignments:{}, calculatedAt:null, validatedAt:null, validatedBy:null };
  }

  /* v1.4.1 D128 — canonical grade keys flipped from Cyrillic to English. The
     storage layer (kpe object in settings, entry.grade in working drafts and
     confirmed snapshots) now uses 'Intern' / 'Junior' / 'Middle' / 'Senior'.
     Display in the assignee table dropdown is localised via T('gradeIntern'),
     T('gradeJunior'), T('gradeMiddle'), T('gradeSenior') — those keys are
     defined in all 15 locale dictionaries. Migration helper below translates
     legacy Cyrillic-keyed data on read so existing installs do not lose their
     KPE values or per-assignee grade selections. */
  /* _migrateGrade/_migrateKpeObject (+ legacy-мапа грейдов) вынесены в migrate-pure.js
     (window.__SSP_MIGRATE_PURE). Делегаторы; MIGRATE_PURE объявлен выше по файлу. */
  function _migrateGrade(g)       { return MIGRATE_PURE.migrateGrade(g); }
  function _migrateKpeObject(kpe) { return MIGRATE_PURE.migrateKpeObject(kpe); }

  /* ── Таблица исполнителей ── */
  /* _pendingDelAssigneeLogin removed — delAssigneeOverlay migrated to openModal() (Phase 1 #32). */

  /* ═══ Current-role tables view ═══════════════════════════════
     Таблицы текущей роли уровня «Люди» (исполнители + задачи), итоги и
     calc-хелперы вынесены в widgets/main/src/currentrole-view.js
     (window.__SSP_CURRENTROLE_VIEW) — Тир D слайс 2, ступень 1.
     Делегаторы; контекст собирается в _currentRoleDeps на вызове, стейт
     модуль читает через аксессоры deps.state в момент обращения. Шаренные
     сервисы (персист, сортировка, миграция грейдов, Гант-синк, поле
     исполнителя YT) остаются здесь и идут через deps. */
  var CURRENTROLE_VIEW = (typeof window !== 'undefined' && window.__SSP_CURRENTROLE_VIEW) || {};
  function _currentRoleDeps() {
    return {
      T: T, esc: esc, toast: toast, diag: diag,
      icon: icon, openModal: openModal,
      safeUrl: safeUrl, toDateIn: toDateIn, dispEnum: dispEnum,
      multiKeySort: multiKeySort, getSortKey: getSortKey, setSortKey: setSortKey,
      rerenderAllSortableTables: _rerenderAllSortableTables,
      renderGanttChart: renderGanttChart,
      migrateGrade: _migrateGrade, migrateKpeObject: _migrateKpeObject,
      ALL_ROLES: ALL_ROLES, ACTIVE_INC: ACTIVE_INC,
      getActiveRoles: getActiveRoles, getRoleItemsArr: getRoleItemsArr,
      isActiveSprintRecord: isActiveSprintRecord,
      saveCurrentRoleState: saveCurrentRoleState,
      updateIssueAssigneeField: updateIssueAssigneeField,
      apiGet: apiGet, safeLs: safeLs,
      refreshPlanningPeopleForCurrentSprint: refreshPlanningPeopleForCurrentSprint,
      state: {
        getSettings: function () { return _settings; },
        getSprint: function () { return _sprint; },
        getCurrentRolePP: function () { return _currentRolePP; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        getActiveSubtab: function () { return _activeSubtab; },
        getCurrentRoleNkcKey: function () { return _currentRoleNkcKey; },
      },
    };
  }
  function renderCurrentRoleAssigneeTable() { return CURRENTROLE_VIEW.renderCurrentRoleAssigneeTable(_currentRoleDeps()); }
  function renderCurrentRoleTaskTable() { return CURRENTROLE_VIEW.renderCurrentRoleTaskTable(_currentRoleDeps()); }
  function updateCurrentRoleTotals() { return CURRENTROLE_VIEW.updateCurrentRoleTotals(_currentRoleDeps()); }
  function calcAssigneeUsed(login) { return CURRENTROLE_VIEW.calcAssigneeUsed(login, _currentRoleDeps()); }

  /* ── Обновить поле исполнителя в YouTrack ── */
  function updateIssueAssigneeField(issueId, login, rk) {
    if (!issueId || !_settings) return;
    var roleForUpdate = ALL_ROLES.find(function(r){ return r.key === (rk || ''); });
    if (!roleForUpdate) return;
    var fieldName = _settings[roleForUpdate.userField];
    if (!fieldName) return;
    apiPost('update-issue-field', { issueId: issueId, fieldName: fieldName, value: login || null, type: 'user' })
      .catch(function(e){ diag('update-issue-field failed: '+e, 'err'); });
  }

  /* ── Сохранить состояние personalPlanning / gantt ── (вынесен в sprint-controller.js,
     Фаза 5 слайс 6; делегатор — МАКС callers всего проекта: currentrole-view ×7,
     standup-view, refresh-controller late-binding dep). */
  function saveCurrentRoleState() { return SPRINT_CTRL.saveCurrentRoleState(_sprintDeps()); }

  /* ── Валидировать распределение ── */
  document.getElementById('currentRoleValidateBtn').addEventListener('click', function() {
    if (!_currentSprintRoleRec) { toast(T('toastSelectSprint')); return; }
    if (!_currentRolePP) { toast(T('toastFillResource')); return; }
    checkValidatorNow().then(function(ok) {
      if (!ok) { toast(T('toastNoValidRights')); return; }
      _currentRolePP.validatedAt = Date.now();
      _currentRolePP.validatedBy = _currentUser ? (_currentUser.fullName || _currentUser.login) : null;
      /* v5.0.3 — _currentSprintRoleRec теперь всегда запись истории. Если она соответствует
         активному _sprint — поднимаем статус и в памяти _sprint, и в записи истории. */
      var _diagBeforeRec = _currentSprintRoleRec ? _currentSprintRoleRec.status : 'NULL';
      var _diagBeforeWc  = _activeWorkingDraftKey;
      if (_currentSprintRoleRec) _currentSprintRoleRec.status = STATUS.ALLOCATED;
      if (isActiveSprintRecord(_currentSprintRoleRec)) _sprint.status = STATUS.ALLOCATED;
      diag('[VALIDATE-PEOPLE] role='+(_currentSprintRoleRec?_currentSprintRoleRec.roleKey:'?')+' before='+_diagBeforeRec+' wc='+_diagBeforeWc+' set rec.status=ALLOCATED active='+isActiveSprintRecord(_currentSprintRoleRec), 'info');
      if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
      saveCurrentRoleState();

      // Обновить запись истории с актуальным personalPlanning/status
      // v6.1.0 D69 — `gantt` удалён из snap-whitelist (v5.9.0/D60); не пишем в history
      var histIdx = _history.findIndex(function(h){ return h.sprintId === _currentSprintRoleRec.sprintId; });
      if (histIdx >= 0) {
        _history[histIdx].personalPlanning = deepClone(_currentRolePP);
        _history[histIdx].status = STATUS.ALLOCATED;
        diag('[VALIDATE-PEOPLE] post-set _history['+histIdx+'].status='+_history[histIdx].status+' sprintId='+_history[histIdx].sprintId, 'info');
        apiPost('history', { history: _history })
          .then(function(){
            var _diagAfter = _history[histIdx] ? _history[histIdx].status : 'GONE';
            diag('[VALIDATE-PEOPLE] post-apiPost _history['+histIdx+'].status='+_diagAfter, 'info');
            renderHistory(); if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
          })
          .catch(function(e){ diag('currentRoleValidate history update failed: '+e,'err'); });
      }

      toast(T('toastCurrentRoleAllocated'), 'success');
    }).catch(function(){ toast(T('toastCheckError')); });
  });


  /* ═══════════════════════════════════════════════════════════
     v4.0.0 — ДИАГРАММА ГАНТА
     ═══════════════════════════════════════════════════════════ */

  /* Кеш истории переходов состояний для Ганта: { [issueId]: {sinceTs, prev, prevColor}, _sprintKey, _fetchedAt } */
  var _ganttStateHist = {};

  /* ═══ Gantt view ═══
     renderGanttChart + бейдж состояния (#20) + DOM-аппликатор history-строк
     вынесены в widgets/main/src/gantt-view.js (window.__SSP_GANTT_VIEW) —
     Тир D слайс 6, ступень 1. Делегатор; deps собираются на вызове, стейт
     модуль читает через аксессоры deps.state в момент обращения (настройки и
     права в click-хендлере реассайна — на момент клика). Кэш _ganttStateHist
     и его аксессоры остаются здесь (_ytApiDeps, Тир C); реассайн-модал,
     permissions-проверка и history-фетч — через deps. */
  var GANTT_VIEW = (typeof window !== 'undefined' && window.__SSP_GANTT_VIEW) || {};
  function _ganttDeps() {
    return {
      T: T, esc: esc, safeUrl: safeUrl, toast: toast,
      multiKeySort: multiKeySort,
      ALL_ROLES: ALL_ROLES, ACTIVE_INC: ACTIVE_INC,
      ASSIGNEE_FALLBACK_COLOR: ASSIGNEE_FALLBACK_COLOR,
      fmtGanttDate: _fmtGanttDate, ganttDaysAgo: _ganttDaysAgo,
      fetchGanttStateHistory: _fetchGanttStateHistory,
      getActiveRoles: getActiveRoles,
      getRoleItemsArr: getRoleItemsArr,
      isActiveSprintRecord: isActiveSprintRecord,
      startPermissionsCheck: _startPermissionsCheck,
      openReassignModal: openReassignModal,
      state: {
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        getCurrentRolePP: function () { return _currentRolePP; },
        getCurrentSprintId: function () { return _currentSprintId; },
        getSprint: function () { return _sprint; },
        getSettings: function () { return _settings; },
        getIsEditor: function () { return _isEditor; },
      },
    };
  }
  function renderGanttChart() { return GANTT_VIEW.renderGanttChart(_ganttDeps()); }

  /* v5.4.0 — Удалены: вторичный tab-btn handler инициализации distrib (его задача
     теперь в основном handler 2791-2818 через ветку refreshDistribForCurrentSprint())
     и change-listener #distribRoleSel (селектор роли удалён из HTML — роль
     выбирается через role-subtabs внутри distrib-card, рендерится refreshDistribForCurrentSprint). */

  /* ─── Подобрать исполнителей (загрузить из бандла поля) ─── */
  document.getElementById('currentRolePickBtn').addEventListener('click', function() {
    doCurrentRoleCalc();
  });

  /* ─── Очистить исполнителей — показ подтверждения ─── */
  document.getElementById('currentRoleClearAssigneesBtn').addEventListener('click', function() {
    openModal({
      id: 'clearAssignees',
      type: 'destructive',
      title: T('confirmClearAssignees'),
      body: { kind: 'text', text: T('confirmClearAssignees') },
      buttons: [
        { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); } },
        { id: 'confirm', text: T('btnYesClear'), variant: 'danger', onClick: function(h) {
          h.close();
          if (_currentRolePP) { _currentRolePP.resourcesByAssignee = {}; }
          renderCurrentRoleAssigneeTable();
          renderCurrentRoleTaskTable();
          updateCurrentRoleTotals();
          saveCurrentRoleState();
          toast(T('toastAssigneesCleared'), 'success');
        }},
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  });

  /* ─── Helpers: Гант state-история (#20) ─── */

  /* _fmtGanttDate/_ganttDaysAgo — делегаторы к DATE_PURE (объявлен выше, date-pure.js). */
  function _fmtGanttDate(ts) { return DATE_PURE._fmtGanttDate(ts); }
  function _ganttDaysAgo(ts) { return DATE_PURE._ganttDaysAgo(ts); }

  /* Бейдж состояния (#20) — данные в vm gantt-view.js, рендер — react/gantt-view.jsx.
     _updateGanttHistDOM — делегатор: его зовёт youtrack-api через _ytApiDeps
     по мере прихода чанков activities (#20). */
  function _updateGanttHistDOM(container, issueId, hist) {
    return GANTT_VIEW._updateGanttHistDOM(container, issueId, hist, _ganttDeps());
  }

  /* #20 — история переходов состояний вынесена в widgets/main/src/youtrack-api.js
     (window.__SSP_YOUTRACK_API) — Тир C. Кэш _ganttStateHist остаётся здесь —
     модуль ходит к нему через аксессоры deps.state (late binding: кэш может быть
     сброшен извне между чанками). DOM-апдейты — через _updateGanttHistDOM. */
  function _fetchGanttStateHistory(ids, sprintKey, force, curStates, fieldId) {
    return YT_API._fetchGanttStateHistory(ids, sprintKey, force, curStates, fieldId, _ytApiDeps());
  }

  /* v6.1.0 D80 (F3) — sync Assignee из YouTrack: source-of-truth = YT.
     Кнопки на «Люди» и Ганте → один общий handler. */
  /* ═══ Refresh-контроллер #35 «Обновить из задачи» — вынесен в
     refresh-controller.js (Фаза 5 слайс 5) за мост window.__SSP_REFRESH_CTRL;
     golden-контракты — refresh.golden.test.js (идут через эти делегаторы).
     Deps-фабрика per-call: стейт зоны (_currentSprintId/_sprint/_settings/
     _roleItems/_currentRolePP/_serverSnapshot-снимки/_ganttStateHist/_ytBase)
     остаётся в стейт-ядре (его трогают другие контроллеры, ресет per-project
     и gm-хук голденов); apply/busy/modal-хелперы S4/S5 приватны модулю;
     saveCurrentRoleState (sprint-домен) приходит модулю late-binding deps'ом;
     промис-чейн и коллбеки модалок замыкают deps снапшотом момента вызова. ═══ */
  var REFRESH_CTRL = (typeof window !== 'undefined' && window.__SSP_REFRESH_CTRL) || {};
  function _refreshDeps() {
    return {
      T: T, toast: toast, diag: diag, fmtPeriod: fmtPeriod, openModal: openModal,
      host: _host,
      getActiveRoles: getActiveRoles, getRoleItemsArr: getRoleItemsArr,
      markDirty: _markDirty, apiPost: apiPost,
      resolveRefreshMerge: REFRESH_MERGE_PURE.resolveRefreshMerge,
      renderPlanningRoles: renderPlanningRoles,
      renderRoleComposition: renderRoleComposition,
      renderCurrentRoleAssigneeTable: renderCurrentRoleAssigneeTable,
      renderCurrentRoleTaskTable: renderCurrentRoleTaskTable,
      updateCurrentRoleTotals: updateCurrentRoleTotals,
      renderGanttChart: renderGanttChart,
      updateRoleRemaining: updateRoleRemaining,
      saveCurrentRoleState: saveCurrentRoleState,
      ALL_ROLES: ALL_ROLES, ACTIVE_INC: ACTIVE_INC,
      state: {
        getCurrentSprintId: function () { return _currentSprintId; },
        getSprint: function () { return _sprint; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        getActiveSubtab: function () { return _activeSubtab; },
        getSettings: function () { return _settings; },
        getRoleItems: function () { return _roleItems; },
        getCurrentRolePP: function () { return _currentRolePP; },
        setCurrentRolePP: function (v) { _currentRolePP = v; },
        getServerSnapshotRoleItems: function () { return _serverSnapshotRoleItems; },
        getServerSnapshotCurrentRolePP: function () { return _serverSnapshotCurrentRolePP; },
        getGanttStateHist: function () { return _ganttStateHist; },
        getYtBase: function () { return _ytBase; },
      },
    };
  }
  function refreshFromYouTrack() { return REFRESH_CTRL.refreshFromYouTrack(_refreshDeps()); }

  /* ═══ Sprint-контроллер (спринт-CRUD) — вынесен в sprint-controller.js (Фаза 5 слайс 6,
     домен E1-sprint, ПОСЛЕДНИЙ подслайс E1) за мост window.__SSP_SPRINT_CTRL;
     golden-контракты — sprint.golden.test.js (идут через делегаторы выше: markSavedAndCleanup/
     saveCurrentRoleState/refreshPlanningPeopleForCurrentSprint/doSaveRoleHeader/doSaveSprintIntro/
     doNewSprint/setCurrentSprintId). Deps-фабрика per-call: стейт зоны (_currentSprintId/_sprint/
     _roleItems/_serverSnapshot-снимки/_currentRole-стейт/_activeSubtab/_activeWorkingDraftKey/
     _history/_baseRevHash) остаётся в стейт-ядре за get/set-аксессорами (его трогают gm-хук
     голденов, другие контроллеры и ресет per-project); рекурсия setCurrentSprintId (WC-коллбек)
     замыкается на делегатор модуля с теми же deps. ═══ */
  var SPRINT_CTRL = (typeof window !== 'undefined' && window.__SSP_SPRINT_CTRL) || {};
  function _sprintDeps() {
    return {
      T: T, toast: toast, diag: diag,
      deepClone: deepClone, computeRevHash: computeRevHash,
      fromDateIn: fromDateIn, toDateIn: toDateIn, parsePeriod: parsePeriod, uid: uid,
      markClean: _markClean, markDirty: _markDirty,
      draftSet: _draftSet, draftGet: _draftGet, draftSaveDebounced: _draftSaveDebounced,
      refreshDirtyIndicator: refreshDirtyIndicator,
      withLoader: withLoader, apiPost: apiPost,
      renderRoleComposition: renderRoleComposition, renderWidgetHeader: renderWidgetHeader,
      renderRolePlannerHeader: renderRolePlannerHeader, renderRoleStatusBadge: renderRoleStatusBadge,
      updateRoleRemaining: updateRoleRemaining, renderSprintIntroExtras: renderSprintIntroExtras,
      renderPlanningLevel: _renderPlanningLevel, refreshGanttForCurrentSprint: refreshGanttForCurrentSprint,
      renderHistory: renderHistory, applyHybridSprintMode: _applyHybridSprintMode,
      syncStateToUrl: _syncStateToUrl, updateShareBtnState: _updateShareBtnState,
      showCloseWorkingCopyModal: showCloseWorkingCopyModal,
      getActiveRoles: getActiveRoles, safeLs: safeLs, roleLabel: roleLabel, emptyPP: emptyPP,
      populatePlanningRoleSel: populatePlanningRoleSel,
      getPersonalPlanningForCurrent: _getPersonalPlanningForCurrent,
      findHistRecForCurrent: _findHistRecForCurrent,
      renderCurrentRoleAssigneeTable: renderCurrentRoleAssigneeTable,
      renderCurrentRoleTaskTable: renderCurrentRoleTaskTable,
      updateCurrentRoleTotals: updateCurrentRoleTotals,
      renderResourceModeIndicator: _renderResourceModeIndicator,
      renderOrphanGanttBanner: _renderOrphanGanttBanner,
      applyEditorRightsToUI: applyEditorRightsToUI,
      updateRoleAccordionStats: _updateRoleAccordionStats,
      isActiveSprintRecord: isActiveSprintRecord,
      applyPersonalResourceToInputs: applyPersonalResourceToInputs,
      STATUS: STATUS, ALL_ROLES: ALL_ROLES, DRAFT_VERSION: DRAFT_VERSION,
      state: {
        getCurrentSprintId: function () { return _currentSprintId; },
        setCurrentSprintId: function (v) { _currentSprintId = v; },
        getSprint: function () { return _sprint; },
        setSprint: function (v) { _sprint = v; },
        getRoleItems: function () { return _roleItems; },
        setRoleItems: function (v) { _roleItems = v; },
        getHistory: function () { return _history; },
        getSettings: function () { return _settings; },
        getCurrentUser: function () { return _currentUser; },
        getActiveWorkingDraftKey: function () { return _activeWorkingDraftKey; },
        setActiveWorkingDraftKey: function (v) { _activeWorkingDraftKey = v; },
        getCurrentSprintRoleRec: function () { return _currentSprintRoleRec; },
        setCurrentSprintRoleRec: function (v) { _currentSprintRoleRec = v; },
        getCurrentRolePP: function () { return _currentRolePP; },
        setCurrentRolePP: function (v) { _currentRolePP = v; },
        getCurrentRoleGantt: function () { return _currentRoleGantt; },
        setCurrentRoleGantt: function (v) { _currentRoleGantt = v; },
        getCurrentRoleNkcKey: function () { return _currentRoleNkcKey; },
        setCurrentRoleNkcKey: function (v) { _currentRoleNkcKey = v; },
        getActiveSubtab: function () { return _activeSubtab; },
        setActiveSubtab: function (v) { _activeSubtab = v; },
        setServerSnapshotSprint: function (v) { _serverSnapshotSprint = v; },
        setServerSnapshotRoleItems: function (v) { _serverSnapshotRoleItems = v; },
        setServerSnapshotCurrentRolePP: function (v) { _serverSnapshotCurrentRolePP = v; },
        setServerSnapshotCurrentRoleGantt: function (v) { _serverSnapshotCurrentRoleGantt = v; },
        getBaseRevHash: function () { return _baseRevHash; },
        setBaseRevHash: function (v) { _baseRevHash = v; },
        getIsEditor: function () { return _isEditor; },
        getIsAssigner: function () { return _isAssigner; },
        getPlanningLevel: function () { return _planningLevel; },
      },
    };
  }

  /* S6 #35 — syncAssigneesFromYouTrack удалён: assignee-логика поглощена единым
     refreshFromYouTrack (field-class merge). Все три кнопки (roles/people/Гант) → refreshFromYouTrack.
     Backend-эндпоинт refresh-assignees теперь без вызовов — снос отдельной задачей (whitelist+fixture). */
  var _peopleSyncBtn = document.getElementById('currentRoleSyncFromYtBtn');
  if (_peopleSyncBtn) _peopleSyncBtn.addEventListener('click', refreshFromYouTrack); /* #35 */
  var _ganttSyncBtn = document.getElementById('ganttSyncFromYtBtn');
  if (_ganttSyncBtn) _ganttSyncBtn.addEventListener('click', refreshFromYouTrack); /* #35 */

  /* delAssigneeOverlay + clearAssigneesOverlay migrated to openModal() (Phase 1 #32). */

  /* v5.0.1 — Переключатель языка теперь привязывается в init-цепочке (после YTApp.register).
     Старый IIFE-binding удалён, потому что мог срабатывать ДО полной отрисовки DOM
     YouTrack-хостом и приводить к неработающему change-event'у. См. функцию init выше. */

})();
