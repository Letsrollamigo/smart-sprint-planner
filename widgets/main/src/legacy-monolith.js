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
  /* #36 — чистое ядро deep-link share-URL (share-url-pure.js): parse/build search ↔ state. */
  var SHARE_URL_PURE = (typeof window !== 'undefined' && window.__SSP_SHARE_URL_PURE) || {};
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

  /** Обходит все элементы с data-i18n и обновляет их текст/плейсхолдер.
   *  v1.9.6: сохраняет .ssp-icon дочерние узлы при обновлении textContent (смена языка). */
  function applyI18N() {
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
      el.placeholder = T(el.getAttribute('data-i18n-ph'));
    });
    /* v5.1.0 — i18n для tooltip-атрибута (data-tooltip → ::after) */
    document.querySelectorAll('[data-i18n-tooltip]').forEach(function(el) {
      el.setAttribute('data-tooltip', T(el.getAttribute('data-i18n-tooltip')));
    });
    /* v2.0.0 D5-B — i18n для Ring Checkbox/Radio host-spans: пишет в dataset.label,
       MutationObserver в checkbox-mount.jsx подхватит и перерендерит метку. */
    document.querySelectorAll('[data-i18n-label]').forEach(function(el) {
      el.dataset.label = T(el.getAttribute('data-i18n-label'));
    });
    /* v5.10.0 — удалён мёртвый guard на renderDistribPanel + tab-distrib (оба удалены в v5.6.0). */
  }

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

  /** Переключить язык. Если для языка нет inline-словаря (то есть это не EN/RU),
      сначала асинхронно подгружает JSON через loader, затем выполняет полный rerender. */
  function setLang(lang) {
    var prev = _lang;
    _lang = lang;
    safeLs.set('ssp_lang', lang);
    /* Обновить индикатор выбранного языка в переключателях (шапка + overlay-копия) */
    var sel = document.getElementById('langSel');
    if (sel) sel.value = lang;
    var sel2 = document.getElementById('langSelSettings');
    if (sel2) sel2.value = lang;

    /* Если словарь языка ещё не загружен — поднять его через loader, обновить I18N[lang],
       потом запустить rerender. Для EN/RU словарь уже inline'нут в I18N → rerender сразу. */
    if (!I18N[lang] && _i18nBridge && typeof _i18nBridge.loadDictionary === 'function') {
      _i18nBridge.loadDictionary(lang).then(function (dict) {
        I18N[lang] = dict || {};
        _doFullRerender();
      }).catch(function () {
        /* Не удалось загрузить → откатываемся на предыдущий язык, чтобы UI не остался полу-переведённым. */
        _lang = prev;
        safeLs.set('ssp_lang', prev);
        if (sel) sel.value = prev;
        if (sel2) sel2.value = prev;
      });
      return;
    }
    _doFullRerender();
  }

  /* v1.1.0 — заполняет <select> 15 языками из window.__SSP_I18N_LANGS__.
     Опции в формате `🇪🇸 Español (es)`. Сортировка приходит уже из bridge'а
     (EN → RU → rest by ISO). Если уже содержит >2 опций — считаем заполненным
     (повторно дёргаем безопасно — операция идемпотентна). */
  function _populateLangSelect(el) {
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

  /* v1.1.0 — заполняет defaultLangSel (settings overlay) 15 ISO-опциями + первая
     "inherit-from-user" (value=""). Идемпотентно. */

  /* v1.1.0 — после загрузки _settings — синхронизируем project-default в loader.
     Loader использует это значение в getCurrentLang() цепочке fallback'ов. */
  function _syncProjectDefaultLang() {
    if (!_i18nBridge || typeof _i18nBridge.setProjectDefault !== 'function') return;
    var v = (_settings && typeof _settings.defaultLang === 'string') ? _settings.defaultLang : '';
    _i18nBridge.setProjectDefault(v || null);
  }

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

  /* v1.4.1 D127 — Custom localized date picker.
     Chromium's native <input type="date"> popup ignores the lang attribute and
     <html lang>, always rendering month/weekday names + Clear/Today buttons in
     the OS locale. We replace it with a small custom popup attached to inputs
     marked [data-ssp-datepicker]. Month and weekday names come from
     Intl.DateTimeFormat(_lang, ...) — 0 i18n keys for those across 15 locales.
     Buttons via T('btnClear') + T('btnToday'). Value stays YYYY-MM-DD so all
     existing min/max constraints + toDateIn/fromDateIn helpers keep working.
     One shared popup at document.body level, repositioned on each open. Commits
     dispatch a synthetic 'change' event so existing 'change' listeners (sprint
     header drafts, currentRole-task-date row handlers) run unchanged. */
  var _sspDpPopup = null, _sspDpTarget = null, _sspDpView = null;

  function _sspDpParseIso(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  }
  function _sspDpFmtIso(y, mo, d) {
    var pm = (mo + 1) < 10 ? '0' + (mo + 1) : (mo + 1);
    var pd = d < 10 ? '0' + d : d;
    return y + '-' + pm + '-' + pd;
  }
  function _sspDpEnsurePopup() {
    if (_sspDpPopup && _sspDpPopup.isConnected) return _sspDpPopup;
    var p = document.createElement('div');
    p.className = 'ssp-dp-popup';
    p.style.cssText = 'position:absolute;z-index:10000;display:none;background:var(--surface,#fff);' +
      'border:1px solid var(--border,#ddd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);' +
      'padding:8px;font-size:12px;min-width:240px;color:var(--text,#222)';
    document.body.appendChild(p);
    _sspDpPopup = p;
    return p;
  }
  function _sspDpRender() {
    if (!_sspDpTarget || !_sspDpView) return;
    var p = _sspDpEnsurePopup();
    var minP = _sspDpParseIso(_sspDpTarget.getAttribute('min'));
    var maxP = _sspDpParseIso(_sspDpTarget.getAttribute('max'));
    var valP = _sspDpParseIso(_sspDpTarget.value);
    var y = _sspDpView.y, mo = _sspDpView.mo;
    var title = new Intl.DateTimeFormat(_lang, { month: 'long', year: 'numeric' }).format(new Date(y, mo, 1));
    /* Weekday short headers, Monday-first (ISO 8601). 2024-01-01 was Monday so
       we use it as the seed for each iteration. */
    var weekdays = [];
    for (var w = 0; w < 7; w++) {
      weekdays.push(new Intl.DateTimeFormat(_lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + w)));
    }
    var first = new Date(y, mo, 1);
    var firstDow = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var prevDays = new Date(y, mo, 0).getDate();
    var todayD = new Date();
    var todayIso = _sspDpFmtIso(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
    var minIso = minP ? _sspDpFmtIso(minP.y, minP.mo, minP.d) : null;
    var maxIso = maxP ? _sspDpFmtIso(maxP.y, maxP.mo, maxP.d) : null;
    var valIso = valP ? _sspDpFmtIso(valP.y, valP.mo, valP.d) : null;

    var h = '<div class="ssp-dp-hdr" style="display:flex;align-items:center;justify-content:space-between;padding:2px 0">' +
      '<button type="button" class="ssp-dp-nav ssp-dp-prev" aria-label="prev month" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 10px;color:inherit">‹</button>' +
      '<span class="ssp-dp-title" style="font-weight:600;text-transform:capitalize">' + esc(title) + '</span>' +
      '<button type="button" class="ssp-dp-nav ssp-dp-next" aria-label="next month" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 10px;color:inherit">›</button>' +
      '</div>' +
      '<div class="ssp-dp-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-top:6px">';
    for (var ww = 0; ww < 7; ww++) {
      h += '<div style="text-align:center;color:var(--muted,#999);font-size:11px;padding:2px 0;text-transform:capitalize">' + esc(weekdays[ww]) + '</div>';
    }
    for (var cell = 0; cell < 42; cell++) {
      var dayNum, cellY, cellMo;
      if (cell < firstDow) {
        dayNum = prevDays - firstDow + cell + 1;
        cellMo = mo - 1; cellY = y;
        if (cellMo < 0) { cellMo = 11; cellY--; }
      } else if (cell < firstDow + daysInMonth) {
        dayNum = cell - firstDow + 1;
        cellMo = mo; cellY = y;
      } else {
        dayNum = cell - firstDow - daysInMonth + 1;
        cellMo = mo + 1; cellY = y;
        if (cellMo > 11) { cellMo = 0; cellY++; }
      }
      var iso = _sspDpFmtIso(cellY, cellMo, dayNum);
      var isOther = cellMo !== mo;
      var disabled = (minIso && iso < minIso) || (maxIso && iso > maxIso);
      var selected = valIso === iso;
      var isToday = iso === todayIso;
      var st = 'text-align:center;padding:5px 0;border-radius:3px;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';user-select:none';
      if (isOther) st += ';color:var(--muted,#bbb)';
      if (disabled) st += ';opacity:.35;pointer-events:none';
      if (selected) st += ';background:var(--accent,#0d6efd);color:#fff';
      else if (isToday) st += ';border:1px solid var(--accent,#0d6efd)';
      h += '<div class="ssp-dp-day" data-iso="' + iso + '" style="' + st + '">' + dayNum + '</div>';
    }
    h += '</div>' +
      '<div class="ssp-dp-actions" style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid var(--border,#eee)">' +
      '<button type="button" class="ssp-dp-clear" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + esc(T('btnClear')) + '</button>' +
      '<button type="button" class="ssp-dp-today" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + esc(T('btnToday')) + '</button>' +
      '</div>';
    p.innerHTML = h;
  }
  function _sspDpOpen(input) {
    _sspDpTarget = input;
    var v = _sspDpParseIso(input.value);
    var now = new Date();
    _sspDpView = v ? { y: v.y, mo: v.mo } : { y: now.getFullYear(), mo: now.getMonth() };
    var p = _sspDpEnsurePopup();
    _sspDpRender();
    var r = input.getBoundingClientRect();
    p.style.left = (r.left + window.scrollX) + 'px';
    p.style.top = (r.bottom + window.scrollY + 2) + 'px';
    p.style.display = 'block';
  }
  function _sspDpClose() {
    if (_sspDpPopup) _sspDpPopup.style.display = 'none';
    _sspDpTarget = null;
    _sspDpView = null;
  }
  function _sspDpCommit(value) {
    if (!_sspDpTarget) return;
    _sspDpTarget.value = value;
    try {
      _sspDpTarget.dispatchEvent(new Event('input', { bubbles: true }));
      _sspDpTarget.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(_){}
    _sspDpClose();
  }
  /* Single delegated click handler covers all date inputs (static + dynamic
     re-rendered ones), popup controls, and outside-click close. Capture phase
     so prior handlers on the input itself don't preempt the open action. */
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('input[data-ssp-datepicker]')) {
      e.preventDefault();
      _sspDpOpen(t);
      return;
    }
    if (_sspDpPopup && _sspDpPopup.contains(t)) {
      if (t.classList.contains('ssp-dp-prev')) {
        _sspDpView.mo--;
        if (_sspDpView.mo < 0) { _sspDpView.mo = 11; _sspDpView.y--; }
        _sspDpRender();
      } else if (t.classList.contains('ssp-dp-next')) {
        _sspDpView.mo++;
        if (_sspDpView.mo > 11) { _sspDpView.mo = 0; _sspDpView.y++; }
        _sspDpRender();
      } else if (t.classList.contains('ssp-dp-today')) {
        var n = new Date();
        _sspDpCommit(_sspDpFmtIso(n.getFullYear(), n.getMonth(), n.getDate()));
      } else if (t.classList.contains('ssp-dp-clear')) {
        _sspDpCommit('');
      } else if (t.classList.contains('ssp-dp-day') && t.hasAttribute('data-iso')) {
        _sspDpCommit(t.getAttribute('data-iso'));
      }
      return;
    }
    if (_sspDpPopup && _sspDpPopup.style.display === 'block') _sspDpClose();
  }, true);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _sspDpPopup && _sspDpPopup.style.display === 'block') _sspDpClose();
  });

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
  var _workingDraftsFlushTimer  = null;
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
  var _permissionsReady = false;
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
     (window.__SSP_PERIOD_PURE) — паттерн как TOAST_PURE/MODAL_PURE/sort-pure.
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

  /* Date-хелперы вынесены в widgets/main/src/date-pure.js (window.__SSP_DATE_PURE) —
     паттерн как PERIOD_PURE. Делегаторы; все чистые (fmtDate/fmtDT — локаль ru-RU).
     toDateIn — локальное время (прежний UTC-дубль удалён). */
  var DATE_PURE = (typeof window !== 'undefined' && window.__SSP_DATE_PURE) || {};
  function toDateIn(ts)  { return DATE_PURE.toDateIn(ts); }
  function fromDateIn(s) { return DATE_PURE.fromDateIn(s); }
  function fmtDate(ts)   { return DATE_PURE.fmtDate(ts); }
  function fmtDT(ts)     { return DATE_PURE.fmtDT(ts); }

  /* v1.9.11 — UX-нормализация toast'ов (UX-сессия B-32):
     - Единое API: toastApi.{info,warn,error,success}(text, opts?). Backward-compat
       глобальный toast(msg, type) сохранён для 107 существующих call-sites.
     - Очередь до TOAST_LIMIT=3, FIFO-evict при переполнении (persistent error
       не выбрасывается).
     - Path A (parent/top doc host) сохранён для cross-origin-friendly сценариев,
       но переведён на тот же DOM-контракт (toast-stack + .toast__text + .toast__close).
     - Path B (local iframe) — теперь не click-anchored, а bottom-right fixed
       через #toastStack контейнер в index.html. _lastClickX/_lastClickY удалены.
     - ARIA: контейнер role="status" aria-live="polite" (один анонс per toast).
       Error переопределяет на role="alert" aria-live="assertive" на самом toast'е.
     - prefers-reduced-motion: убираем translateX, только opacity (CSS-level). */

  /* Pure helpers live in widgets/main/src/toast-pure.js — unit-tested там, бридж
     через window.__SSP_TOAST_PURE (паттерн как window.__SSP_ICONS). */
  var TOAST_PURE = (typeof window !== 'undefined' && window.__SSP_TOAST_PURE) || {};
  var computeToastDuration = TOAST_PURE.computeToastDuration || function(t, c){ return typeof c === 'number' ? c : 4000; };
  var selectToastToEvict   = TOAST_PURE.selectToastToEvict   || function(){ return -1; };
  var TOAST_LIMIT = TOAST_PURE.TOAST_LIMIT || 3;
  var _toastQueue = [];
  var _toastSeq = 0;

  /* Best-effort попытка прицепить toast-stack к window.top или window.parent document
     (если YT не блокирует cross-origin). На production YT обычно блокируется —
     тогда возвращаем null и используем local #toastStack в widget iframe. */
  function _ensureParentToastHost() {
    var candidates = [];
    try { if (window.top    && window.top    !== window) candidates.push(window.top); } catch(_){}
    try { if (window.parent && window.parent !== window && candidates.indexOf(window.parent) < 0) candidates.push(window.parent); } catch(_){}
    for (var ci = 0; ci < candidates.length; ci++) {
      var w = candidates[ci];
      try {
        var d = w.document;
        if (!d || !d.body) continue;
        var existing = d.getElementById('ssp-parent-toast-host');
        if (existing) return existing;
        var host = d.createElement('div');
        host.id = 'ssp-parent-toast-host';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'false');
        host.style.cssText = [
          'position:fixed', 'bottom:16px', 'right:16px',
          'z-index:2147483647',
          'pointer-events:none',
          'display:flex', 'flex-direction:column-reverse', 'gap:8px',
          'max-width:min(480px,calc(100vw - 32px))',
          'max-height:calc(100vh - 32px)',
          'overflow-y:auto', 'overflow-x:hidden',
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
          'font-size:13px', 'line-height:1.4'
        ].join(';');
        d.body.appendChild(host);
        return host;
      } catch(_) { /* cross-origin — пробуем следующий */ }
    }
    return null;
  }

  /* v1.9.11 post-smoke fix v2 — click-anchored positioning (возврат D131-логики
     из v1.8.5, поверх нового stack). Причина: в YT widget iframe `window.scrollY`
     всегда 0 (iframe не имеет собственного scroll'а — scroll живёт в parent doc),
     `window.innerHeight` == content-height iframe'а (растянутого на весь content).
     Поэтому scroll-aware positioning не работает в iframe.
     Решение: track последний mousedown через capture-listener (D131); при показе
     toast'а ставить top = max(8, _lastClickY - stackH - 24) — стак растёт ВВЕРХ
     от точки клика, гарантированно в visible region (т.к. user только что туда
     кликнул и нажатие было в visible viewport).
     Fallback: если кликов ещё не было — 50% высоты iframe (приблизительный центр). */
  var _lastClickX = 0, _lastClickY = 0;
  try {
    document.addEventListener('mousedown', function(e) {
      if (typeof e.clientY === 'number' && !isNaN(e.clientY)) {
        _lastClickX = e.clientX;
        _lastClickY = e.clientY;
      }
    }, true);
  } catch(_){}

  function _positionToastStack() {
    /* #32 Phase 6c — приоритет Ring alertService-контейнеру (portal в document.body,
       position:fixed по дефолту Ring → переопределён на absolute в index.html);
       fallback — legacy #toastStack. Оба позиционируются click-anchor'ом, т.к. в
       auto-grow YT-iframe position:fixed улетает в Y=2000+ за пределы видимой части. */
    var ringStack = (document.body && typeof document.body.querySelector === 'function')
      ? document.body.querySelector('[data-test="alert-container"]') : null;
    /* #43 W1 (C-2/H-1) — error-тост обязан прерывать screen-reader (aria-live=assertive);
       Ring alertService-контейнер по дефолту polite для всех типов. Держим assertive,
       пока в очереди есть error-тост, иначе polite. Применяется в settle-проходах
       _repositionToastSoon (RAF²/+140мс после addAlert) и на resize. */
    if (ringStack) {
      var _hasErrToast = false;
      for (var _ti = 0; _ti < _ringToastKeys.length; _ti++) {
        if (_ringToastKeys[_ti].type === 'error') { _hasErrToast = true; break; }
      }
      ringStack.setAttribute('aria-live', _hasErrToast ? 'assertive' : 'polite');
      ringStack.setAttribute('role', _hasErrToast ? 'alert' : 'status');
    }
    var stack = ringStack || document.getElementById('toastStack');
    if (!stack || stack.children.length === 0) return;
    try {
      var stackH = stack.offsetHeight || 100;
      var iframeH = window.innerHeight || document.documentElement.clientHeight || 600;
      var anchorY = _lastClickY > 0 ? _lastClickY : Math.floor(iframeH * 0.5);
      var pageOff = window.pageYOffset || 0;
      /* anchorY — координата клика в iframe-doc. Toast рисуем ~24px выше клика,
         стак растёт вверх (column-reverse в CSS). Гарантия visible region. */
      var top = Math.max(8, anchorY + pageOff - stackH - 24);
      stack.style.top = top + 'px';
    } catch(_) {}
  }
  /* Ring alertService рендерит контейнер асинхронно (React commit). Многопроходный
     settle: RAF, RAF², +140мс — гарантирует репозиционирование после монтирования. */
  function _repositionToastSoon() {
    var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function(cb){ setTimeout(cb, 16); };
    raf(function(){ _positionToastStack(); raf(function(){ _positionToastStack(); }); });
    setTimeout(_positionToastStack, 140);
  }
  var _toastReposScheduled = false;
  function _scheduleToastReposition() {
    if (_toastReposScheduled) return;
    _toastReposScheduled = true;
    var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function(cb){ setTimeout(cb, 16); };
    raf(function() {
      _toastReposScheduled = false;
      _positionToastStack();
    });
  }
  /* resize слушаем — при изменении viewport стак повторно позиционируется
     относительно нового anchor (last click). scroll listener бесполезен в iframe
     где scrollY всегда 0, но добавляем на всякий случай (parent doc может его
     прокинуть в будущем). */
  try {
    window.addEventListener('resize', _scheduleToastReposition, { passive: true });
    window.addEventListener('scroll', _scheduleToastReposition, { passive: true });
  } catch(_) {
    try {
      window.addEventListener('resize', _scheduleToastReposition);
      window.addEventListener('scroll', _scheduleToastReposition);
    } catch(__){}
  }

  /* Возвращает { stackEl, ownerDoc } для DOM-операций.
     Path A: parent doc host (cross-origin позволил).
     Path B: local widget iframe #toastStack. */
  function _resolveToastStack() {
    var parentHost = _ensureParentToastHost();
    if (parentHost) {
      var pDoc = parentHost.ownerDocument || (parentHost.parentNode && parentHost.parentNode.ownerDocument);
      if (pDoc) return { stackEl: parentHost, ownerDoc: pDoc, isParent: true };
    }
    var localEl = document.getElementById('toastStack');
    if (localEl) return { stackEl: localEl, ownerDoc: document, isParent: false };
    return null;
  }

  /* Строит toast DOM-элемент. Inline-styles только для Path A (parent doc не имеет
     наших CSS-классов); для Path B используем CSS из index.html. */
  function _buildToastEl(spec, owner) {
    var doc = owner.ownerDoc;
    var isParent = owner.isParent;
    var el = doc.createElement('div');
    el.className = 'toast toast--' + spec.type;
    if (spec.type === 'error') {
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'assertive');
    } else {
      el.setAttribute('role', 'status');
    }
    var textEl = doc.createElement('div');
    textEl.className = 'toast__text';
    textEl.textContent = spec.text;
    var closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast__close';
    /* Локализуем через T() если доступен; в Path A (parent doc) T() может вернуть
       ключ как fallback — это OK, screen reader всё равно будет читать. */
    var closeAria = (typeof T === 'function') ? T('aria.btnClose') : 'Close';
    closeBtn.setAttribute('aria-label', closeAria);
    closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M12.5 3.5L8 8l4.5 4.5-.5.5L7.5 8.5 3 13l-.5-.5L7 8 2.5 3.5l.5-.5L7.5 7.5 12 3z"/></svg>';
    el.appendChild(textEl);
    el.appendChild(closeBtn);

    if (isParent) {
      /* Path A — parent doc, наших CSS-классов нет, применяем inline-стили. */
      var colors = {
        error:   { border: '#e05a6a' },
        success: { border: '#5cb368' },
        warn:    { border: '#e09a3a' },
        info:    { border: '#5b7cfa' }
      };
      var c = colors[spec.type] || colors.info;
      el.style.cssText = [
        'pointer-events:auto',
        'min-width:240px', 'max-width:100%', 'max-height:30vh', 'overflow-y:auto',
        'padding:10px 12px',
        'border-radius:6px',
        'background:#fff', 'color:#1f2326',
        'border:1px solid #dbe2e7',
        'border-left:3px solid '+c.border,
        'box-shadow:0 2px 8px rgba(0,0,0,0.08)',
        'display:flex', 'align-items:flex-start', 'gap:8px',
        'font-size:13px', 'line-height:1.4',
        'opacity:0', 'transform:translateX(120%)',
        'transition:transform 200ms ease,opacity 200ms ease'
      ].join(';');
      textEl.style.cssText = 'flex:1;min-width:0;word-break:break-word;white-space:pre-wrap';
      closeBtn.style.cssText = 'flex:0 0 auto;background:none;border:none;color:#6e7682;cursor:pointer;padding:2px;margin:-2px;display:inline-flex;align-items:center;border-radius:4px';
    }
    return el;
  }

  function _dismissToast(t) {
    if (t._dismissed) return;
    t._dismissed = true;
    if (t._timeout) { clearTimeout(t._timeout); t._timeout = null; }
    if (t.el && t.el.parentNode) {
      t.el.classList.remove('toast--in');
      t.el.classList.add('toast--out');
      if (t._isParent) {
        t.el.style.transform = 'translateX(120%)';
        t.el.style.opacity = '0';
      }
      setTimeout(function(){
        if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
        /* После remove — стак стал короче, перепозиционировать. */
        if (!t._isParent) _positionToastStack();
      }, 250);
    }
    var idx = _toastQueue.indexOf(t);
    if (idx >= 0) _toastQueue.splice(idx, 1);
  }

  function _enqueueToast(spec) {
    var owner = _resolveToastStack();
    if (!owner) return null; // нет ни parent host, ни local #toastStack — невозможно показать
    var t = { id: ++_toastSeq, type: spec.type, text: spec.text };
    t.el = _buildToastEl(spec, owner);
    t._isParent = owner.isParent;
    owner.stackEl.appendChild(t.el);

    /* Evict до push'а — иначе превысим лимит на 1 toast на время transition'а.
       #43 W4 (H-2) — вытеснение не молчит: след в диагностическом логе. */
    var evictIdx = selectToastToEvict(_toastQueue, TOAST_LIMIT);
    if (evictIdx >= 0) {
      var evT = _toastQueue[evictIdx];
      try { diag('toast evicted (queue>' + TOAST_LIMIT + '): [' + evT.type + '] ' + String(evT.text || '').slice(0, 80), 'info'); } catch(_) {}
      _dismissToast(evT);
    }

    _toastQueue.push(t);

    /* Click на toast — dismiss (но клик по close-кнопке также dismiss'ит через bubble). */
    t.el.addEventListener('click', function(e) {
      _dismissToast(t);
      e.stopPropagation();
    });

    /* Repos сначала, чтобы при первом показе стак уже был на правильной высоте
       (Path B; для Path A position:fixed работает в parent doc — пропускаем). */
    if (!t._isParent) _positionToastStack();

    /* Trigger animation in next frame. */
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function(){
        t.el.classList.add('toast--in');
        if (t._isParent) {
          t.el.style.transform = 'translateX(0)';
          t.el.style.opacity = '1';
        }
        if (!t._isParent) _positionToastStack(); // повторная попытка после layout
      });
    } else {
      setTimeout(function(){
        t.el.classList.add('toast--in');
        if (!t._isParent) _positionToastStack();
      }, 10);
    }

    var duration = computeToastDuration(spec.type, spec.duration);
    if (duration > 0) {
      t._timeout = setTimeout(function(){ _dismissToast(t); }, duration);
    }
    return t.id;
  }

  var _toastText = TOAST_PURE.normaliseToastText || function(msg) {
    return String(msg == null ? '' : msg).replace(/\n+/g, ' · ');
  };

  /* #32 Phase 6c — Ring alertService bridge. Тосты рендерятся настоящим Ring Alert
     (Alert + Container из vendor), а не custom DOM. Контракт toast(msg,type) и
     toastApi.{info,warn,error,success,dismissAll} сохранён 1:1.
     - Маппинг типов → Ring AlertType (строковые значения enum'а).
     - Длительности из toast-pure (info/success 4000, warn 6000, error 0=persistent).
     - Очередь ≤3 — ручной evict oldest-non-error (alertService стекует без лимита).
     - Позиционирование — _positionToastStack ретаргетится на Ring-контейнер.
     Legacy DOM-стак (_enqueueToast) сохранён как fallback, если vendor недоступен. */
  var _RING_TOAST_TYPE = { info: 'message', warn: 'warning', error: 'error', success: 'success' };
  var _ringToastKeys = []; // [{key,type}] в порядке появления (oldest first) для очереди ≤3
  function _ringAlertService() {
    try { var v = window.SSP_VENDORED; return (v && v.alertService) || null; } catch(_) { return null; }
  }
  function _ringToast(type, text, duration) {
    var svc = _ringAlertService();
    if (!svc || typeof svc.addAlert !== 'function') return null; // нет Ring → caller уходит в legacy
    var ringType = _RING_TOAST_TYPE[type] || 'message';
    var timeout = computeToastDuration(type, duration);
    var entry = { key: null, type: type, msg: String(text || '') }; /* msg — для H-2 diag-следа при evict */
    try {
      entry.key = svc.addAlert(text, ringType, timeout, {
        onClose: function() {
          var i = _ringToastKeys.indexOf(entry);
          if (i >= 0) _ringToastKeys.splice(i, 1);
        }
      });
    } catch(_) { return null; }
    _ringToastKeys.push(entry);
    /* Очередь ≤3 — evict oldest non-error (persistent error не выбрасывается). */
    while (_ringToastKeys.length > TOAST_LIMIT) {
      var evictIdx = selectToastToEvict(_ringToastKeys, TOAST_LIMIT);
      if (evictIdx < 0) break;
      var ev = _ringToastKeys[evictIdx];
      _ringToastKeys.splice(evictIdx, 1); // снимаем сразу, чтобы не зациклить (onClose async)
      try { svc.remove(ev.key); } catch(_) {}
      /* #43 W4 (H-2) — вытеснение из очереди не молчит: след в диагностическом логе. */
      try { diag('toast evicted (queue>' + TOAST_LIMIT + '): [' + ev.type + '] ' + String(ev.msg || '').slice(0, 80), 'info'); } catch(_) {}
    }
    _repositionToastSoon();
    return entry.key;
  }
  function _toastShow(type, text, opts) {
    var msg = _toastText(text);
    var dur = opts && opts.duration;
    var key = _ringToast(type, msg, dur);
    if (key != null) return key;
    return _enqueueToast({ text: msg, type: type, duration: dur }); // legacy fallback
  }

  var toastApi = {
    info:    function(text, opts) { return _toastShow('info',    text, opts); },
    warn:    function(text, opts) { return _toastShow('warn',    text, opts); },
    error:   function(text, opts) { return _toastShow('error',   text, opts); },
    success: function(text, opts) { return _toastShow('success', text, opts); },
    dismissAll: function() {
      var svc = _ringAlertService();
      if (svc) {
        var snap = _ringToastKeys.slice();
        for (var k = 0; k < snap.length; k++) { try { svc.remove(snap[k].key); } catch(_) {} }
        _ringToastKeys.length = 0;
      }
      var snapshot = _toastQueue.slice();
      for (var i = 0; i < snapshot.length; i++) _dismissToast(snapshot[i]);
    }
  };

  /* Backward-compat для 107 существующих call-sites toast(msg, type). */
  function toast(msg, type) {
    var t = (type || 'info');
    var fn = toastApi[t] || toastApi.info;
    return fn(msg);
  }

  /* Public namespace (паттерн window.__SSP_ICONS): даёт доступ из консоли + других
     модулей без breaking change существующего глобального toast(). */
  try { window.__SSP_TOAST = toastApi; } catch(_) {}

  /* ═══════════════════════════════════════════════════════════
     v1.9.11 — Modal stack, focus trap, scroll lock, backdrop (B-32)
     ═══════════════════════════════════════════════════════════
     Pure helpers — widgets/main/src/modal-pure.js (window.__SSP_MODAL_PURE).
     В IIFE — DOM-bound обёртки: _appModalOpen() / _appModalClose() / Escape handler.
     Backward-compat: _showOverlay() остаётся, _appModalOpen внутри вызывает его. */
  var MODAL_PURE = (typeof window !== 'undefined' && window.__SSP_MODAL_PURE) || {};
  var _modalStack = []; // массив overlay DOM-элементов, last = topmost
  var _bodyLockCount = 0;
  var CANCEL_SELECTOR = (MODAL_PURE.CANCEL_BUTTON_SELECTOR) ||
    'button[id$="Cancel"], button[id$="CancelBtn"], button[id$="No"], ' +
    'button[id$="CloseBtn"], button[id$="Close"], button[id^="close"]';

  /* Возвращает массив focusable элементов внутри container — visible и не disabled. */
  function _getFocusable(container) {
    if (!container) return [];
    var sel = 'a[href]:not([disabled]), button:not([disabled]), ' +
              'input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
              'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var nodes = container.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.hidden) continue;
      /* offsetParent === null означает display:none у self или предка
         (исключение: position:fixed элементы — у них offsetParent всегда null
         даже когда visible, поэтому проверяем computed display отдельно). */
      var visible = el.offsetParent !== null;
      if (!visible) {
        try {
          var cs = window.getComputedStyle(el);
          visible = cs && cs.display !== 'none' && cs.visibility !== 'hidden';
        } catch(_) {}
      }
      if (visible) out.push(el);
    }
    return out;
  }

  /* Создаёт focus trap для container. Возвращает { activate, deactivate }. */
  function _createFocusTrap(container) {
    var prevActive = (typeof document !== 'undefined') ? document.activeElement : null;

    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var focusable = _getFocusable(container);
      if (focusable.length === 0) { e.preventDefault(); return; }
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      var active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault(); first.focus();
      }
    }

    return {
      activate: function() {
        container.addEventListener('keydown', onKeydown);
        /* setTimeout(0) даёт браузеру отрендерить overlay перед focus() — иначе
           focus может уйти на скрытый элемент (display:none → flex transition).
           v2.0.0 R2 fix (D3-r6): {preventScroll:true} — БЕЗ него browser auto-scroll'ит
           iframe чтобы focused element был visible, что в cross-origin sandbox YT widget
           проявляется как «откидывание таблицы/Ганта к верху» при открытии любой модалки
           (modal mounted at default top, focus moves there, iframe scrolls to expose). */
        setTimeout(function() {
          var focusable = _getFocusable(container);
          var target = focusable[0] || container;
          try { target.focus({ preventScroll: true }); } catch(_) {
            try { target.focus(); } catch(__) {}   /* fallback для старых browsers */
          }
        }, 0);
        container.__sspReturnFocus = prevActive;
      },
      deactivate: function() {
        container.removeEventListener('keydown', onKeydown);
      }
    };
  }

  /* Body scroll lock — отключён в v1.9.11 post-smoke fix v2.
     В YT widget iframe-контексте body lock не имеет смысла: iframe не имеет
     собственного scroll'а (scroll живёт в parent doc, который мы не контролируем
     из-за cross-origin), iframe растянут на content. Любые попытки lock'а
     (position:fixed или overflow:hidden) либо no-op, либо потенциально интерферят
     с click handlers в iframe (наблюдалось в smoke v1.9.11 round 1+2 —
     «Очистить черновик» не запускал handler).
     Reference counting остаётся как защита от рекурсии — но action no-op. */
  function _bodyScrollLock(lock) {
    if (lock) _bodyLockCount++;
    else _bodyLockCount = Math.max(0, _bodyLockCount - 1);
    /* no-op в iframe-контексте — но оставляем функцию для contract'а и testability */
  }

  /* Backdrop click handler — закрывает overlay только если клик строго по backdrop'у. */
  function _onBackdropMousedown(e) {
    var isBackdrop = MODAL_PURE.isBackdropClick
      ? MODAL_PURE.isBackdropClick(e.target, e.currentTarget)
      : (e.target === e.currentTarget);
    if (!isBackdrop) return;
    var overlay = e.currentTarget;
    var cancelBtn = overlay.querySelector(CANCEL_SELECTOR);
    if (cancelBtn) {
      try { cancelBtn.click(); } catch(_) { _appModalClose(overlay); }
    } else {
      _appModalClose(overlay);
    }
  }

  /* Идемпотентная attach-логика — ставит ARIA, stack, scroll lock, focus trap, backdrop.
     Вызывается из _showOverlay() (после classList.remove('hidden')) автоматически — это
     позволяет существующим 100+ call-sites _showOverlay() / classList.remove('hidden')
     получить новую UX без переписывания каждого. */
  function _modalAutoAttach(el) {
    if (!el || el.__sspTrap) return;

    /* ARIA-defaults (если в HTML не выставлены явно). */
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');

    /* Idempotent stack push. */
    if (MODAL_PURE.pushUnique) MODAL_PURE.pushUnique(_modalStack, el);
    else if (_modalStack.indexOf(el) === -1) _modalStack.push(el);

    /* Body scroll lock — на момент первой модалки. */
    if (_modalStack.length === 1) _bodyScrollLock(true);

    /* Focus trap. */
    el.__sspTrap = _createFocusTrap(el);
    el.__sspTrap.activate();

    /* Backdrop click — opt-in через data-dismiss-on-backdrop="true". */
    var dataVal = el.getAttribute('data-dismiss-on-backdrop');
    var dismissOnBackdrop = MODAL_PURE.parseBackdropOptIn
      ? MODAL_PURE.parseBackdropOptIn(dataVal)
      : (dataVal === 'true');
    if (dismissOnBackdrop && !el.__sspBackdropBound) {
      el.addEventListener('mousedown', _onBackdropMousedown);
      el.__sspBackdropBound = true;
    }
  }

  /* Снимает focus trap, lock, listeners, восстанавливает фокус. Вызывается из
     MutationObserver при добавлении .hidden класса — т.е. автоматически при
     existing legacy `el.classList.add('hidden')` close-сайтах. */
  function _modalAutoDetach(el) {
    if (!el) return;
    /* v2.0.0 — cleanup iframe-aware positioner listeners + inline styles. */
    if (el.__sspPositioner) {
      try { window.removeEventListener('scroll', el.__sspPositioner, true); } catch(_){}
      try { window.removeEventListener('resize', el.__sspPositioner); } catch(_){}
      if (el.__sspPositionInterval) {
        clearInterval(el.__sspPositionInterval);
        el.__sspPositionInterval = null;
      }
      el.__sspPositioner = null;
      try {
        el.style.position = ''; el.style.top = ''; el.style.left = '';
        el.style.right = ''; el.style.minHeight = ''; el.style.height = '';
        el.style.alignItems = '';
        el.style.paddingTop = '';   /* v2.0.0 R2 D3-r5: cleanup click-anchored padding */
      } catch(_){}
    }
    if (!el.__sspTrap) return;

    el.__sspTrap.deactivate();
    el.__sspTrap = null;

    if (el.__sspBackdropBound) {
      el.removeEventListener('mousedown', _onBackdropMousedown);
      el.__sspBackdropBound = false;
    }

    if (MODAL_PURE.popItem) MODAL_PURE.popItem(_modalStack, el);
    else {
      var idx = _modalStack.indexOf(el);
      if (idx >= 0) _modalStack.splice(idx, 1);
    }

    if (_modalStack.length === 0) _bodyScrollLock(false);

    if (el.__sspReturnFocus && document.body.contains(el.__sspReturnFocus)) {
      /* v2.0.0 R2 fix (D3-r6): preventScroll чтобы close модала не скроллил iframe
         обратно к кнопке-открывателю (которая может быть вне visible portion). */
      try { el.__sspReturnFocus.focus({ preventScroll: true }); } catch(_) {
        try { el.__sspReturnFocus.focus(); } catch(__) {}
      }
      el.__sspReturnFocus = null;
    }
  }

  /* Phase 1 #32 — декларативный spec-API поверх __SSP_RING_MODAL.
     Возвращает { close(), update(partial) }. Fallback — no-op (Ring не подключён). */
  function openModal(spec) {
    if (window.__SSP_RING_MODAL) return window.__SSP_RING_MODAL.open(spec);
    return { close: function() {}, update: function() {} };
  }

  /* Открывает overlay (public API). v2.0.0: .overlay/.dyn-modal-overlay → Ring Dialog bridge.
     Legacy: .settings-overlay и не-overlay элементы идут через _showOverlay как раньше. */
  function _appModalOpen(idOrEl, opts) {
    opts = opts || {};
    var el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return null;

    /* Bridge __SSP_DIALOG демонтирован (Phase 6 — де-гибридизация #32). Все модалки переехали
       на __SSP_RING_MODAL (декларативный openModal). Остаётся только legacy-путь через _showOverlay
       для settingsOverlay / .overlay-элементов, открываемых старым API (__SSP_MODAL фасад). */
    _showOverlay(el);
    if (opts.dismissOnBackdrop === true && !el.__sspBackdropBound) {
      el.addEventListener('mousedown', _onBackdropMousedown);
      el.__sspBackdropBound = true;
    }
    return el;
  }

  /* Закрывает overlay (public API). v2.0.0: Ring Dialog path через per-overlay observer. */
  function _appModalClose(idOrEl) {
    var el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return;
    el.classList.add('hidden'); /* Legacy path — глобальный _modalObserver вызовет _modalAutoDetach. */
  }

  /* Глобальный observer — наблюдает за добавлением .hidden класса на overlay-элементы.
     Это даёт authokativnaya точку detach без необходимости менять 100+ legacy close-сайтов
     (el.classList.add('hidden')). Вызывается из init flow (см. ниже DOMContentLoaded path). */
  var _modalObserver = null;
  function _initModalCloseObserver() {
    if (_modalObserver || typeof MutationObserver !== 'function') return;
    _modalObserver = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        var el = m.target;
        if (!el) continue;
        var isHidden = el.classList.contains('hidden');
        if (isHidden && el.__sspTrap) {
          /* .hidden добавлен на видимую модалку — close path. */
          _modalAutoDetach(el);
        } else if (!isHidden && !el.__sspTrap) {
          /* .hidden снят с скрытой модалки — legacy open path (например, через
             o.classList.remove('hidden')). Auto-attach UX-helpers. */
          _modalAutoAttach(el);
        }
      }
    });
    /* Наблюдаем все известные типы overlay'ев. Idempotent — повторный init no-op. */
    var overlays = document.querySelectorAll('.overlay, .settings-overlay, .dyn-modal-overlay');
    for (var i = 0; i < overlays.length; i++) {
      _modalObserver.observe(overlays[i], { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* Public namespace для консоли + других модулей. */
  try {
    window.__SSP_MODAL = {
      open:  _appModalOpen,
      close: _appModalClose,
      stack: _modalStack,
      getFocusable: _getFocusable
    };
  } catch(_) {}

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

  /* v5.7.0 — Этап 5 (D47): фиксированная палитра 12 цветов для ассайни.
     Round-robin по индексу логина в отсортированном списке роли. Контролируемая
     контрастность; повторение цветов при >12 ассайни допустимо (визуальный hint, не unique-id).
     Hash→index fallback используется когда контекст ассайни роли недоступен. */
  var ASSIGNEE_PALETTE = [
    '#5b7de8', '#e05a6a', '#48b974', '#f0a23a',
    '#9c6ade', '#1ea7c4', '#d65a9b', '#7a8a99',
    '#c97a4a', '#5fa86d', '#8a6ad3', '#d9534f'
  ];
  var ASSIGNEE_FALLBACK_COLOR = '#9aa3ad'; /* серый — для нераспределённых задач */

  function assigneeColorOf(login, allLogins) {
    if (!login) return ASSIGNEE_FALLBACK_COLOR;
    if (!Array.isArray(allLogins) || !allLogins.length) {
      /* fallback: hash login → индекс палитры */
      var h = 0;
      for (var i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
      return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length];
    }
    var sorted = allLogins.slice().sort();
    var idx = sorted.indexOf(login);
    if (idx < 0) return assigneeColorOf(login, null);
    return ASSIGNEE_PALETTE[idx % ASSIGNEE_PALETTE.length];
  }

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
  var _draftSaveTimers = {};
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
  var _draftFlushTimer = null;
  var _draftLoaded = false; // true после первого GET /draft в init

  function _draftSet(suffix, value) {
    if (!_draft) _draft = {};
    _draft[suffix] = value;
    diag('draft SET '+suffix+' (in-memory)', 'ok');
    _draftScheduleFlush();
  }
  function _draftGet(suffix) {
    return _draft ? (_draft[suffix] !== undefined ? _draft[suffix] : null) : null;
  }
  function _draftDel(suffix) {
    if (_draft) delete _draft[suffix];
    _draftScheduleFlush();
  }
  function _draftScheduleFlush() {
    if (_draftRestoreInProgress) return;
    _draftPending = true;
    clearTimeout(_draftFlushTimer);
    /* Короткая задержка (300мс), чтобы аккумулировать несколько _draftSet
       в один POST (например, dirty + roleItems + meta пишутся подряд). */
    _draftFlushTimer = setTimeout(_draftFlushNow, 300);
  }
  function _draftFlushNow() {
    if (!_draftPending) return;
    var sz = JSON.stringify(_draft || {}).length;
    if (sz > 200 * 1024) {
      try { toast(T('toastDraftTooLarge'), 'warn'); } catch(_){}
      return;
    }
    _draftPending = false;
    diag('draft FLUSH → backend (size='+sz+'B)', 'info');
    apiPost('draft', { data: _draft })
      .catch(function(e){ diag('draft flush failed: '+(e&&e.message?e.message:e),'err'); });
  }
  function _draftLoadFromBackend() {
    return apiGet('draft').then(function(r){
      var slot = (r && r.data) || null;
      if (slot && typeof slot === 'object') {
        _draft = {
          meta:      slot.meta      || null,
          ui:        slot.ui        || null,
          sprint:    slot.sprint    || null,
          roleItems: slot.roleItems || null,
          currentRole: slot.currentRole || null,
          dirty:     slot.dirty     || null
        };
        diag('draft loaded from backend (meta='+(slot.meta?'yes':'no')+')', 'ok');
      } else {
        _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
        diag('draft: no data on backend','info');
      }
      _draftLoaded = true;
    }).catch(function(e){
      diag('draft load failed: '+(e&&e.message?e.message:e),'err');
      _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
      _draftLoaded = true;
    });
  }
  function _draftClearOnBackend() {
    /* Полная очистка: POST /draft?action=clear */
    return apiPost('draft', {}, { action: 'clear' }).then(function(){
      _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
    });
  }

  /* ═══════════════════════════════════════════════════════════
     v5.3.0 — Working copies persistence (immutable snapshots, D3/b)
     ═══════════════════════════════════════════════════════════
     Аналогично _draft, но:
     • Multi-user видимость (карта общая по проекту, не per-login).
     • Backend (`ssp_workdrafts`): viewer GET, validator POST, владелец/settingsManager DELETE.
     • Дроссель flush 300мс. */
  function _workingDraftsLoadFromBackend() {
    return apiGet('working-drafts').then(function(r){
      var data = (r && r.data) || {};
      _workingDrafts = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
      _workingDraftsLoaded = true;
      var n = Object.keys(_workingDrafts).length;
      diag('working-drafts loaded ('+n+' entries)', 'ok');
    }).catch(function(e){
      diag('working-drafts load failed: '+(e&&e.message?e.message:e), 'err');
      _workingDrafts = {};
      _workingDraftsLoaded = true;
    });
  }
  function _workingDraftsScheduleFlush() {
    _workingDraftsDirty = true;
    if (_workingDraftsFlushTimer) clearTimeout(_workingDraftsFlushTimer);
    _workingDraftsFlushTimer = setTimeout(_workingDraftsFlushNow, 300);
  }
  function _workingDraftsFlushNow() {
    if (!_workingDraftsDirty) return;
    _workingDraftsDirty = false;
    return apiPost('working-drafts', { data: _workingDrafts }).then(function(){
      /* v5.4.0 — синхронизировать индикатор WC в шапке виджета */
      if (typeof renderWidgetHeader === 'function') {
        try { renderWidgetHeader(); } catch(_){}
      }
      /* v5.5.0 — D37: cross-tab signal через localStorage. Вторая вкладка той же
         страницы получит storage-event и обновит свой индикатор без F5. */
      Object.keys(_workingDrafts || {}).forEach(function(k){
        safeLs.set('ssp:wc-touched:' + k, String(Date.now()));
      });
    }).catch(function(e){
      var reason = (e && e.reason) || (e && e.error) || '';
      if (String(reason).indexOf('working_drafts_too_large') >= 0
          || String(reason).indexOf('working_draft_too_large') >= 0) {
        try { toast(T('wcStorageQuotaExceeded'), 'warn'); } catch(_){}
      } else {
        diag('working-drafts flush failed: '+(e&&e.message?e.message:e), 'err');
      }
      /* Не теряем dirty — следующий debounced flush попробует снова */
      _workingDraftsDirty = true;
    });
  }
  function _workingDraftsDeleteOnBackend(key) {
    if (!key) return Promise.resolve();
    return apiPost('working-drafts', null, { action: 'delete', key: key })
      .catch(function(e){
        diag('working-drafts delete failed for '+key+': '+(e&&e.message?e.message:e), 'err');
      });
  }
  /* Двусторонний sync hasWorkingCopy на снимках ↔ Object.keys(_workingDrafts).
     Удаляет orphan working copies (без базового снимка); выравнивает флаг
     hasWorkingCopy на снимках. Вызывается один раз после init. */
  function reconcileHasWorkingCopyFlag() {
    if (!_workingDraftsLoaded) return;
    var historyChanged = false, draftsChanged = false;
    /* 1) Drafts без snap → orphan, удалить */
    Object.keys(_workingDrafts).forEach(function(key){
      var found = _history.some(function(snap){ return snap && snap.sprintId === key; });
      if (!found) {
        diag('working-drafts: orphan removed: '+key, 'warn');
        delete _workingDrafts[key];
        draftsChanged = true;
      }
    });
    /* 2) Snap.hasWorkingCopy выровнять */
    _history.forEach(function(snap){
      if (!snap) return;
      var actual = !!_workingDrafts[snap.sprintId];
      if (!!snap.hasWorkingCopy !== actual) {
        snap.hasWorkingCopy = actual;
        historyChanged = true;
      }
    });
    if (draftsChanged) _workingDraftsScheduleFlush();
    if (historyChanged) {
      apiPost('history', { history: _history }).catch(function(e){
        diag('history flush after reconcile failed: '+(e&&e.message?e.message:e), 'err');
      });
    }
  }
  /* Lazy purge: удаляет working copies со updatedAt > 30 дней назад.
     Без фоновых таймеров — один проход на init. Сводный toast. */
  function gcWorkingDrafts() {
    if (!_workingDraftsLoaded) return;
    var now = Date.now();
    var TTL = 30 * 24 * 3600 * 1000;
    var removed = [];
    Object.keys(_workingDrafts).forEach(function(key){
      var d = _workingDrafts[key];
      if (!d) { delete _workingDrafts[key]; removed.push(key); return; }
      if ((now - (d.updatedAt || 0)) > TTL) {
        delete _workingDrafts[key];
        removed.push(key);
      }
    });
    if (removed.length) {
      diag('working-drafts GC: removed '+removed.length+' stale entries', 'info');
      _workingDraftsScheduleFlush();
      /* Снять hasWorkingCopy с соответствующих снимков */
      var historyChanged = false;
      _history.forEach(function(snap){
        if (snap && removed.indexOf(snap.sprintId) >= 0 && snap.hasWorkingCopy) {
          snap.hasWorkingCopy = false;
          historyChanged = true;
        }
      });
      if (historyChanged) {
        apiPost('history', { history: _history }).catch(function(){});
      }
      try { toast(T('wcGcDiscarded').replace('{n}', removed.length), 'info'); } catch(_){}
    }
  }
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
  /* Уровни ре-валидации working copy. Чем глубже правка — тем ниже падает статус. */
  function computeRequiredRevalidationLevel(snap, work) {
    if (!snap || !work) return 'CONFIRMED_REVAL';
    var rk   = snap.roleKey;
    if (!rk) return 'NONE';
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    var resK = role ? role.resKey : '';
    var estK = 'estimate_' + rk;
    var allK = 'alloc_'    + rk;

    var sMap = _mapById(snap.items || []);
    var wMap = _mapById(work.items || []);
    var sIds = Object.keys(sMap), wIds = Object.keys(wMap);
    var added = wIds.filter(function(id){ return !sMap[id]; });
    var removed = sIds.filter(function(id){ return !wMap[id]; });
    if (added.length || removed.length) return 'CONFIRMED_REVAL';

    var allocChanged = false;
    for (var i = 0; i < wIds.length; i++) {
      var id = wIds[i], s = sMap[id], w = wMap[id];
      if (s.inclusionStatus !== w.inclusionStatus) return 'CONFIRMED_REVAL';
      if (!_numEq(s[estK], w[estK]))               return 'CONFIRMED_REVAL';
      if (!_numEq(s[allK], w[allK]))               allocChanged = true;
    }
    var sRes = (resK && snap[resK] != null) ? snap[resK] : 0;
    var wRes = (work.sprint && resK && work.sprint[resK] != null) ? work.sprint[resK] : 0;
    if (!_numEq(sRes, wRes)) allocChanged = true;

    var ws = work.sprint || {};
    var metaChanged =
         (snap.name             || null) !== (ws.name             || null)
      || (snap.dateStart        || null) !== (ws.dateStart        || null)
      || (snap.dateEnd          || null) !== (ws.dateEnd          || null)
      || (snap.sprintFieldVal   || null) !== (ws.sprintFieldVal   || null)
      || (snap.versionFieldVal  || null) !== (ws.versionFieldVal  || null)
      || !_blockEq(snap.personalPlanning, work.personalPlanning)
      || !_blockEq(snap.gantt,            work.gantt);

    if (allocChanged) return 'ALLOCATED_REVAL';
    if (metaChanged)  return 'META_ONLY';
    return 'NONE';
  }
  function applyRevalidationLevel(currentStatus, level) {
    if (level === 'CONFIRMED_REVAL') return STATUS.PLANNING;
    if (level === 'ALLOCATED_REVAL') {
      return (currentStatus === STATUS.ALLOCATED) ? STATUS.CONFIRMED : currentStatus;
    }
    return currentStatus;
  }

  /* Стабильный хэш базового снимка по полям, релевантным для diff.
     НЕ включает confirmedAt/By/revisions/personalPlanning/gantt — изменения этих
     полей не должны провоцировать conflict-модал. */
  function computeBaseSnapshotHash(snap) {
    if (!snap) return '';
    var rk = snap.roleKey;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    var resK = role ? role.resKey : '';
    var estK = 'estimate_' + rk;
    var allK = 'alloc_' + rk;
    var items = (snap.items || []).slice()
      .sort(function(a, b){ return String(a.issueId||'').localeCompare(String(b.issueId||'')); })
      .map(function(it){
        return [it.issueId, it.inclusionStatus || '', (it[estK] != null ? it[estK] : ''), (it[allK] != null ? it[allK] : '')].join('|');
      })
      .join(';');
    var head = [
      snap.sprintId || '', snap.status || '',
      snap.name || '', snap.dateStart || 0, snap.dateEnd || 0,
      (resK && snap[resK] != null ? snap[resK] : 0),
      snap.sprintFieldVal || '', snap.versionFieldVal || ''
    ].join('|');
    return _wcSha1Light(head + '##' + items);
  }

  /* ═══ v5.3.0 — Working copy lifecycle ═══ */
  function createWorkingDraftFromSnapshot(snap, idx) {
    if (!snap || !snap.sprintId) return null;
    var key = snap.sprintId;
    var rk  = snap.roleKey;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return null;
    var login = (_currentUser && _currentUser.login) || '';
    var draft = {
      schemaVersion:    1,
      key:              key,
      baseSnapshotHash: computeBaseSnapshotHash(snap),
      baseStatusAtOpen: snap.status || STATUS.PLANNING,
      createdAt:        Date.now(),
      updatedAt:        Date.now(),
      editorLogin:      login,
      editorTabToken:   _thisTabToken,
      sprint: {
        sprintId:        snap.sprintId,
        name:            snap.name || null,
        dateStart:       snap.dateStart || null,
        dateEnd:         snap.dateEnd || null,
        sprintFieldVal:  snap.sprintFieldVal || null,
        versionFieldVal: snap.versionFieldVal || null
      },
      items: (snap.items || []).map(function(it){
        var copy = {};
        Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
        return copy;
      }),
      personalPlanning: snap.personalPlanning ? deepClone(snap.personalPlanning) : null,
      gantt:            snap.gantt            ? deepClone(snap.gantt)            : null,
      revisions:        (snap.revisions || []).slice()
    };
    /* Скопировать ёмкость роли (resource<Role>) */
    if (role.resKey) draft.sprint[role.resKey] = (snap[role.resKey] != null ? snap[role.resKey] : 0);

    _workingDrafts[key] = draft;
    if (idx != null && _history[idx]) {
      _history[idx].hasWorkingCopy = true;
      apiPost('history', { history: _history }).catch(function(){});
    }
    _workingDraftsScheduleFlush();
    return draft;
  }

  function resumeWorkingDraft(key, idx) {
    var draft = _workingDrafts[key];
    if (!draft) return;
    var rk = (draft.items && draft.items.length) ? null : null;
    /* Извлекаем roleKey из ключа: '<sprintId>_<roleKey>'. */
    var snap = _history.find(function(s){ return s && s.sprintId === key; });
    if (!snap) {
      diag('resumeWorkingDraft: base snap not found for key='+key, 'err');
      return;
    }
    rk = snap.roleKey;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return;

    _activeWorkingDraftKey = key;

    /* Загрузить данные working copy в активный _sprint и _roleItems[rk]. */
    _sprint = _sprint || {};
    _sprint.sprintId        = key.replace('_' + rk, '');
    _sprint.name            = draft.sprint.name;
    _sprint.dateStart       = draft.sprint.dateStart;
    _sprint.dateEnd         = draft.sprint.dateEnd;
    _sprint.sprintFieldVal  = draft.sprint.sprintFieldVal;
    _sprint.versionFieldVal = draft.sprint.versionFieldVal;
    _sprint.status          = STATUS.PLANNING;  /* в working copy всегда PLANNING (lock-bypass) */
    /* Все resource<Role> копируются */
    ALL_ROLES.forEach(function(r){
      if (draft.sprint[r.resKey] != null) _sprint[r.resKey] = draft.sprint[r.resKey];
    });
    /* Legacy флаги стираем — больше не нужны */
    delete _sprint.editingFromHistory;
    delete _sprint.historyIdx;

    _roleItems[rk] = (draft.items || []).map(function(it){
      var copy = {};
      Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
      return copy;
    });
    /* v1.9.3 D134 — Etap О.2/П.2 fix: контаминация составов других ролей.
       До v1.9.3 _roleItems[otherRk] оставался от предыдущего контекста (другой
       спринт / роль), потому что resumeWorkingDraft грузил из draft только
       активную rk. Симптом: открываешь на правку спринт А роль X → состав X
       корректный (из draft), но спойлеры ролей Y и Z в Planning показывали
       составы из спринта Б (что было активно до).

       Источник истины для других ролей при открытии исторического спринта на
       правку — последний history snapshot этого же sprintId для каждой роли.
       Если snapshot отсутствует (роль никогда не редактировалась в спринте) —
       пустой массив (а не stale данные предыдущего контекста).

       Cherry-pick из proprietary v7.3.2 Этап П.2. */
    var _sprintIdForOthers = _sprint.sprintId;
    ALL_ROLES.forEach(function(r) {
      if (r.key === rk) return; // активную роль уже загрузили выше из draft
      var otherSnapId = _sprintIdForOthers + '_' + r.key;
      var otherSnap = Array.isArray(_history)
        ? _history.find(function(h){ return h && h.sprintId === otherSnapId; })
        : null;
      if (otherSnap && Array.isArray(otherSnap.items)) {
        _roleItems[r.key] = otherSnap.items.map(function(it){
          var copy = {};
          Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
          return copy;
        });
      } else {
        _roleItems[r.key] = [];
      }
    });
    if (draft.personalPlanning) _sprint.personalPlanning = deepClone(draft.personalPlanning);
    if (draft.gantt)            _sprint.gantt            = deepClone(draft.gantt);

    /* Sync на бэкенд _sprint+_roleItems */
    apiPost('sprint-data', { sprint: _sprint, roleItems: _roleItems })
      .catch(function(e){ diag('resumeWorkingDraft: sprint-data sync failed: '+(e&&e.message?e.message:e),'err'); });

    /* v5.6.0 — Этап 4 (4c): переключение на tab-planning > Роли + раскрытие accordion-карточки.
       Legacy tab-planner и subtabs физически удалены. */
    var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
    if (planBtn) planBtn.click();
    var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
    if (rolesBtn) rolesBtn.click();
    if (typeof _uiExpandedRoles !== 'undefined') {
      _uiExpandedRoles[rk] = true;
      var ui = _draftGet('ui') || {};
      ui.expandedRoles = Object.keys(_uiExpandedRoles).filter(function(k){ return _uiExpandedRoles[k]; });
      _draftSet('ui', ui);
    }
    if (typeof renderPlanningRoles === 'function') {
      try { renderPlanningRoles(); } catch(e){ diag('renderPlanningRoles err: '+e,'err'); }
    }

    if (typeof renderWorkingCopyBanner === 'function') renderWorkingCopyBanner();
    if (typeof renderRolePlannerHeader === 'function') renderRolePlannerHeader(rk);
    if (typeof renderRoleComposition  === 'function') renderRoleComposition(rk);
    if (typeof updateRoleRemaining    === 'function') updateRoleRemaining(rk);
    if (typeof renderHistory          === 'function') renderHistory();
  }

  function discardWorkingDraft(key) {
    if (typeof showDiscardConfirmModal === 'function') {
      showDiscardConfirmModal(key, function(confirmed){
        if (!confirmed) return;
        _doDiscardWorkingDraft(key);
      });
    } else {
      _doDiscardWorkingDraft(key);
    }
  }
  function _doDiscardWorkingDraft(key) {
    delete _workingDrafts[key];
    var idx = _history.findIndex(function(s){ return s && s.sprintId === key; });
    if (idx >= 0) {
      _history[idx].hasWorkingCopy = false;
      apiPost('history', { history: _history }).catch(function(){});
    }
    _workingDraftsDeleteOnBackend(key);
    if (_activeWorkingDraftKey === key) {
      _activeWorkingDraftKey = null;
      if (typeof hideWorkingCopyBanner === 'function') hideWorkingCopyBanner();
      /* Перезагрузить активный спринт */
      apiGet('sprint-data').then(function(r){
        if (r && r.success) {
          _sprint    = r.sprint    || null;
          _roleItems = r.roleItems || {};
          /* v5.9.0 — D59: orphans из backend. */
          if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
            _sprint._orphanGanttIssues = r.orphanGanttIssues;
          }
          if (typeof renderPlannerRoles === 'function') renderPlannerRoles();
        }
      }).catch(function(){});
    }
    if (typeof renderHistory === 'function') renderHistory();
    try { toast(T('wcDiscardedToast'), 'info'); } catch(_){}
  }

  function syncWorkingDraftFromMemory(rk) {
    if (!_activeWorkingDraftKey) return;
    var draft = _workingDrafts[_activeWorkingDraftKey];
    if (!draft) return;
    draft.updatedAt = Date.now();
    draft.editorTabToken = _thisTabToken;
    if (_sprint) {
      draft.sprint.name            = _sprint.name || null;
      draft.sprint.dateStart       = _sprint.dateStart || null;
      draft.sprint.dateEnd         = _sprint.dateEnd || null;
      draft.sprint.sprintFieldVal  = _sprint.sprintFieldVal || null;
      draft.sprint.versionFieldVal = _sprint.versionFieldVal || null;
      ALL_ROLES.forEach(function(r){
        if (_sprint[r.resKey] != null) draft.sprint[r.resKey] = _sprint[r.resKey];
      });
      if (_sprint.personalPlanning) draft.personalPlanning = deepClone(_sprint.personalPlanning);
      if (_sprint.gantt)            draft.gantt            = deepClone(_sprint.gantt);
    }
    if (rk && _roleItems[rk]) {
      draft.items = _roleItems[rk].map(function(it){
        var copy = {};
        Object.keys(it).forEach(function(k){ copy[k] = it[k]; });
        return copy;
      });
    }
    _workingDraftsScheduleFlush();
    if (typeof renderWorkingCopyBanner === 'function') renderWorkingCopyBanner();
  }

  /* Commit working copy → overwrite базового snap + revisions[].
     Уровень ре-валидации применяется к статусу. */
  function _commitWorkingCopy(rk, idx, draft, snapFromCurrent) {
    var baseSnap = _history[idx];
    if (!baseSnap) return;
    var level = computeRequiredRevalidationLevel(baseSnap, draft);
    var newStatus = applyRevalidationLevel(baseSnap.status, level);
    diag('[COMMIT-WC] role='+rk+' baseStatus='+baseSnap.status+' level='+level+' newStatus='+newStatus+' snapFromStatus='+(snapFromCurrent&&snapFromCurrent.status), 'info');
    var finalSnap = snapFromCurrent;
    finalSnap.status = newStatus;
    if (level !== 'NONE' && level !== 'META_ONLY') {
      finalSnap.confirmedAt = Date.now();
      finalSnap.confirmedBy = (_currentUser && (_currentUser.fullName || _currentUser.login)) || baseSnap.confirmedBy || '';
    } else {
      finalSnap.confirmedAt = baseSnap.confirmedAt;
      finalSnap.confirmedBy = baseSnap.confirmedBy;
    }
    /* v1.8.1 — не записывать revision с level='NONE' (no-op commit без реальных изменений).
       Ранее: при closing working copy без правок level='NONE' приводил к invalid_history_structure
       (backend whitelist его отвергал). Теперь добавляем revision ТОЛЬКО для значимых уровней. */
    var newRevisions = (baseSnap.revisions || []).slice();
    if (level !== 'NONE') {
      newRevisions.push({
        at:    Date.now(),
        by:    (_currentUser && _currentUser.login) || '',
        level: level
      });
    }
    finalSnap.revisions = newRevisions.slice(-200);  /* лимит 200 ревизий — защита от runaway */
    finalSnap.hasWorkingCopy = false;
    if (baseSnap.finishedAt) finalSnap.finishedAt = baseSnap.finishedAt;
    if (baseSnap.finishedBy) finalSnap.finishedBy = baseSnap.finishedBy;

    _history[idx] = finalSnap;
    delete _workingDrafts[draft.key];
    _workingDraftsScheduleFlush();
    _workingDraftsDeleteOnBackend(draft.key);
    _activeWorkingDraftKey = null;

    if (typeof hideWorkingCopyBanner === 'function') hideWorkingCopyBanner();

    return apiPost('history', { history: _history }).then(function(){
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof renderRoleComposition === 'function') renderRoleComposition(rk);
      /* v1.8.1 — после commit working copy шапка должна пересчитаться, иначе
         бейдж в main-виджете висит на старом статусе (например "Черновик"), даже
         когда таблица истории уже показывает новый (CONFIRMED/ALLOCATED). */
      if (typeof renderWidgetHeader === 'function') {
        try { renderWidgetHeader(); } catch(_){}
      }
      try {
        var statusLabelKey = 'status_' + newStatus;
        var levelKey       = 'wcLevel_' + level;
        toast(T('wcRevalidatedToast').replace('{status}', T(statusLabelKey)).replace('{level}', T(levelKey)),
              level === 'CONFIRMED_REVAL' ? 'warn' : 'info');
      } catch(_){}
    });
  }

  /* ═══ v5.3.0 — UI: working copy banner ═══ */
  function renderWorkingCopyBanner() {
    var banner = document.getElementById('wcBanner');
    if (!banner) return;
    if (!_activeWorkingDraftKey) { banner.classList.add('hidden'); return; }
    var draft = _workingDrafts[_activeWorkingDraftKey];
    if (!draft) { banner.classList.add('hidden'); return; }
    var snap = _history.find(function(s){ return s && s.sprintId === _activeWorkingDraftKey; });
    if (!snap) { banner.classList.add('hidden'); return; }

    var role = ALL_ROLES.find(function(r){ return r.key === snap.roleKey; });
    var rl   = role ? roleLabel(role) : (snap.roleKey || '');
    var sn   = snap.name || (draft.sprint && draft.sprint.name) || T('unnamedSprint');
    var dt   = fmtDate(snap.confirmedAt);
    var txt  = T('wcBannerTextTpl').replace('{sprint}', sn).replace('{role}', rl).replace('{date}', dt);
    var textEl = document.getElementById('wcBannerText');
    if (textEl) textEl.textContent = txt;

    var level = computeRequiredRevalidationLevel(snap, draft);
    var pill = document.getElementById('wcBannerLevelPill');
    if (pill) {
      pill.classList.remove('wc-banner__pill--meta','wc-banner__pill--allocated','wc-banner__pill--confirmed');
      if (level === 'CONFIRMED_REVAL') {
        pill.classList.add('wc-banner__pill--confirmed');
        pill.textContent = T('wcLevelConfirmedShort');
      } else if (level === 'ALLOCATED_REVAL') {
        pill.classList.add('wc-banner__pill--allocated');
        pill.textContent = T('wcLevelAllocatedShort');
      } else {
        pill.classList.add('wc-banner__pill--meta');
        pill.textContent = T('wcLevelMetaOnlyShort');
      }
      pill.title = T('wcLevel_' + level);
    }
    banner.classList.remove('hidden');
  }
  function hideWorkingCopyBanner() {
    var b = document.getElementById('wcBanner');
    if (b) b.classList.add('hidden');
  }

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

  /* Phase 2 #32 — WC-семейство мигрировано на openModal() (настоящий React в Ring Dialog).
     Callback-контракты сохранены: conflict → 'overwrite'|'export'|'cancel'; multiTab/discard → boolean.
     onClose гарантирует ровно один вызов callback на любом закрытии (кнопка/Escape). */
  function showWorkingCopyConflictModal(key, baseSnap, mySnap, callback) {
    var cb = callback || function(){};
    var who = (baseSnap && baseSnap.confirmedBy) || '?';
    var decided = null;
    openModal({
      id: 'wcConflict',
      type: 'confirm',
      title: T('wcConflictTitle'),
      body: { kind: 'text', text: T('wcConflictBody').replace('{who}', who) },
      buttons: [
        { id: 'overwrite', text: T('wcConflictOverwrite'), variant: 'danger',    onClick: function(h){ decided = 'overwrite'; h.close(); } },
        { id: 'export',    text: T('wcConflictExportBoth'), variant: 'secondary', onClick: function(h){ decided = 'export';    h.close(); } },
        { id: 'cancel',    text: T('wcConflictCancel'),     variant: 'primary',   onClick: function(h){ decided = 'cancel';    h.close(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function(){ cb(decided || 'cancel'); },   /* Escape/backdrop → безопасный 'cancel' */
    });
  }

  function showMultiTabConflictModal(key, callback) {
    var cb = callback || function(){};
    var decided = null;
    openModal({
      id: 'wcMultiTab',
      type: 'informational',
      title: T('wcMultiTabTitle'),
      body: { kind: 'text', text: T('wcMultiTabBody') },
      buttons: [
        { id: 'continue', text: T('wcMultiTabContinue'), variant: 'primary',   onClick: function(h){ decided = true;  h.close(); } },
        { id: 'readonly', text: T('wcMultiTabReadonly'), variant: 'secondary', onClick: function(h){ decided = false; h.close(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: true,                                  /* no-escape: системно-блокирующая */
      showCloseButton: false,
      onClose: function(){ if (decided !== null) cb(decided); },  /* только явный выбор */
    });
  }

  function showDiscardConfirmModal(key, callback) {
    var cb = callback || function(){};
    var confirmed = false;
    openModal({
      id: 'wcDiscard',
      type: 'destructive',
      title: T('wcDiscardConfirmTitle'),
      body: { kind: 'text', text: T('wcDiscardConfirmBody') },
      buttons: [
        { id: 'confirm', text: T('wcDiscard'), variant: 'danger',  onClick: function(h){ confirmed = true;  h.close(); } },
        { id: 'cancel',  text: T('btnNo'),     variant: 'primary', onClick: function(h){ confirmed = false; h.close(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function(){ cb(confirmed); },              /* Escape/backdrop → false (отмена, безопасно) */
    });
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

  /* v5.7.0 — Этап 5 (D46): модал переназначения задачи в Ганте.
     openReassignModal(issueId) собирает <select> из _currentRolePP.resourcesByAssignee + опция «Не назначен»;
     «Применить» обновляет _currentRolePP.taskAssignments[issueId].assignee, инвалидирует ganttColor cache,
     ставит dirty-флаг, зовёт saveCurrentRoleState() и ре-рендерит Гант (+ опционально таблицу Людей). */
  /* Phase 2 #32 — reassign мигрирован на openModal() (bespoke reassignForm).
     hideReassignModal закрывает Ring-модалку через stored handle (паттерн _overlimitModalHandle). */
  var _reassignModalHandle = null;
  function hideReassignModal() {
    if (_reassignModalHandle) { try { _reassignModalHandle.close(); } catch(_){} }
  }
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
  /* v6.3.0 D102/D104/D107 — overlay viewport реальный фикс.
     Корень: YT widget iframe растянут по контенту → внутреннего scroll нет, `position:fixed`
     overlay позиционируется относительно iframe document. Когда outer YT page scroll'нул iframe,
     `position:fixed` overlay уходит выше outer viewport.
     v6.2.1 D97 (scrollIntoView внутри iframe) + v6.2.2 D100 (window.frameElement.scrollIntoView)
     не работают: первый scroll'ит iframe document (где prokrutki нет), второй — `frameElement`
     может быть undefined (cross-origin sandbox YT).
     Реальное решение: `document.documentElement.getBoundingClientRect().top` внутри same-origin
     iframe равен -outerScrollY (отрицательный, если iframe scrolled вниз outer'ом). На основе
     этого вычисляем abs. позицию overlay'я в текущей видимой части outer viewport и
     перекрываем CSS-fixed через inline absolute. Fallback chain: frameElement → scrollIntoView.
   */
  /* v6.3.1 D113 — overlay/toast viewport: CSS-only позиционирование (overlay
     `position:absolute top:0` крепится к верху body iframe = верху main виджета),
     плюс трёхуровневый scroll outer page чтобы iframe top попал в outer viewport.
     Был баг v6.3.0 D102: inline-style `_positionOverlayInView` пытался вычислить
     visibleTopInDoc через getBoundingClientRect, но в растянутом iframe это даёт
     неконсистентные значения (rect.top бывает 0 если iframe не имеет outer-scroll
     контекста), и overlay перекрывал CSS неправильным top → виден частично/невиден. */
  function _scrollFrameIntoView() {
    var any = false;
    /* (1) Scroll iframe document к началу (на случай internal scroll). */
    try { window.scrollTo({ top: 0, behavior: 'auto' }); any = true; }
    catch(_){
      try { window.scrollTo(0, 0); any = true; } catch(__){}
    }
    /* (2) Scroll outer YT page через iframe element (same-origin). */
    try {
      if (window.frameElement && typeof window.frameElement.scrollIntoView === 'function') {
        window.frameElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
        any = true;
      }
    } catch(_){}
    /* v6.3.2 D122 — (3) Дополнительный fallback: если frameElement доступен,
       но scrollIntoView не сработал (некоторые YT окружения возвращают true,
       но реально не scrollят) — явно вычисляем absolute Y координату iframe
       в parent document и делаем window.parent.scrollTo. Same-origin only. */
    try {
      if (window.parent && window.parent !== window && window.frameElement) {
        var iframeRect = window.frameElement.getBoundingClientRect();
        var parentScrollY = (window.parent.pageYOffset
          || (window.parent.document && window.parent.document.documentElement && window.parent.document.documentElement.scrollTop)
          || 0);
        /* Цель: iframe top = top outer viewport (с небольшим запасом 16px). */
        var targetY = parentScrollY + iframeRect.top - 16;
        if (targetY < 0) targetY = 0;
        if (typeof window.parent.scrollTo === 'function') {
          try { window.parent.scrollTo({ top: targetY, behavior: 'smooth' }); }
          catch(_){ window.parent.scrollTo(0, targetY); }
          any = true;
        }
      }
    } catch(_){}
    return any;
  }
  function _showOverlay(idOrEl) {
    var el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return;
    /* Очищаем inline-style остатки от старого _positionOverlayInView (D102 v6.3.0). */
    try {
      el.style.position = ''; el.style.top = ''; el.style.left = '';
      el.style.right = ''; el.style.bottom = ''; el.style.minHeight = '';
      el.style.height = '';
    } catch(_){}
    el.classList.remove('hidden');
    /* v2.0.0 R2 fix (D3-r5) — _scrollFrameIntoView убран: см. _appModalOpen для деталей. */
    /* v1.9.11 (B-32) — auto-attach UX-helpers (focus trap / scroll lock / backdrop / ARIA).
       Idempotent: повторный show уже visible overlay не дублирует state. */
    if (typeof _modalAutoAttach === 'function') {
      try { _modalAutoAttach(el); } catch(_){}
    }
    /* v2.0.0 R2 fix (D3-r5) — Click-anchored overlay positioning через padding-top.
       Сохраняет overlay в native size (CSS: position fixed; inset:0; backdrop) → backdrop
       покрывает весь iframe. Content (.modal/.confirm-box/.dyn-modal-box) сдвигается через
       align-items:flex-start + paddingTop = anchorY - contentH/2.
       Old D2 logic читало parent + frameElement (BLOCKED в cross-origin sandbox YT iframe) и
       fallback'ился на iframe auto-grow 4000+ px → overlay min-height=4000px → content в Y=2000+. */
    if (el.classList.contains('overlay') || el.classList.contains('dyn-modal-overlay') || el.classList.contains('settings-overlay')) {
      var positionOverlay = function() {
        /* Найти actual content (modal/confirm-box/dyn-modal-box) внутри overlay для measure */
        var content = el.querySelector('.modal, .confirm-box, .dyn-modal-box');
        var contentH = content ? content.offsetHeight : (el.offsetHeight || 300);
        var anchorY = (window.__SSP_MODAL_ANCHOR && window.__SSP_MODAL_ANCHOR.getCenterY())
          || (window.innerHeight / 2);
        var padTop = Math.max(20, anchorY - contentH / 2);
        /* НЕ трогать position/top/height/inset overlay — оставить CSS defaults для backdrop */
        el.style.alignItems = 'flex-start';
        el.style.paddingTop = padTop + 'px';
      };
      requestAnimationFrame(positionOverlay);
      var positionInterval = setInterval(positionOverlay, 100);
      el.__sspPositioner = positionOverlay;
      el.__sspPositionInterval = positionInterval;
      window.addEventListener('scroll', positionOverlay, true);
      window.addEventListener('resize', positionOverlay);
    }
  }
  function openReassignModal(issueId) {
    if (!_currentRolePP) {
      diag('openReassignModal: no _currentRolePP', 'warn');
      return;
    }
    var ra = _currentRolePP.resourcesByAssignee || {};
    var ta = _currentRolePP.taskAssignments || {};
    var current = (ta[issueId] && ta[issueId].assignee) || '';
    /* Опции <select>: «Не назначен» + ассайни роли (sorted) */
    var options = [{ value: '', label: T('reassignOptionUnassigned') }];
    Object.keys(ra).sort().forEach(function(login){
      var nm = (ra[login] && ra[login].assigneeName) ? ra[login].assigneeName : login;
      options.push({ value: login, label: nm + ' (' + login + ')' });
    });
    _reassignModalHandle = openModal({
      id: 'reassign',
      type: 'confirm',
      title: T('modalReassignTitle'),
      body: { kind: 'component', name: 'reassignForm', props: {
        issueId: issueId,
        bodyText: T('modalReassignBody'),
        options: options,
        current: current,
        applyText: T('btnApply'),
        cancelText: T('btnCancel'),
        onApply: function(login){ if (_reassignModalHandle) _reassignModalHandle.close(); _applyReassign(issueId, login); },
        onCancel: function(){ if (_reassignModalHandle) _reassignModalHandle.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function(){ _reassignModalHandle = null; },
    });
  }
  /* Применение переназначения (логика дословно из v5.7.0/v6.3.0 D105 — мутация
     _currentRolePP + запись assignee в YouTrack + ре-рендер Ганта/Людей). login — '' = «Не назначен». */
  function _applyReassign(issueId, login) {
    if (!issueId || !_currentRolePP) return;
    login = login || '';
    var ra = _currentRolePP.resourcesByAssignee || {};
    if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
    var entry = _currentRolePP.taskAssignments[issueId] || {};
    entry.assignee     = login || '';
    entry.assigneeName = login ? ((ra[login] && ra[login].assigneeName) ? ra[login].assigneeName : login) : '';
    /* Инвалидация cache — цвет пересчитается через assigneeColorOf */
    delete entry.ganttColor;
    _currentRolePP.taskAssignments[issueId] = entry;
    /* Прокидываем _currentRolePP обратно в personalPlanning записи и в _sprint.personalPlanning
       если запись соответствует активному спринту (паттерн из renderCurrentRoleTaskTable). */
    if (_currentSprintRoleRec) {
      if (!_currentSprintRoleRec.personalPlanning) _currentSprintRoleRec.personalPlanning = {};
      var rk = _activeSubtab || _currentSprintRoleRec.roleKey || null;
      if (!rk && _currentSprintRoleRec.sprintId && _currentSprintId) {
        rk = _currentSprintRoleRec.sprintId.replace(_currentSprintId + '_', '') || null;
      }
      if (rk) _currentSprintRoleRec.personalPlanning[rk] = _currentRolePP;
      if (typeof isActiveSprintRecord === 'function' && isActiveSprintRecord(_currentSprintRoleRec)) {
        if (!_sprint.personalPlanning) _sprint.personalPlanning = {};
        if (rk) _sprint.personalPlanning[rk] = _currentRolePP;
      }
    }
    /* Dirty-tracking для confirm при смене роли */
    if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && _currentSprintId) {
      var rkDirty = _currentSprintRoleRec.sprintId.replace(_currentSprintId + '_', '');
      if (rkDirty) _dirtyRoleKeys[rkDirty] = true;
    }
    if (typeof saveCurrentRoleState === 'function') {
      try { saveCurrentRoleState(); } catch(e){ diag('saveCurrentRoleState reassign err: '+e,'err'); }
    }
    /* v6.3.0 D105 — после reassign в Ганте писать assignee в YouTrack
       через update-issue-field (как делает change-handler на «Распределение»).
       Раньше изменения assignee из Ганта оставались только в personalPlanning. */
    try {
      var rkForYt = (_currentSprintRoleRec && _currentSprintRoleRec.roleKey) || _activeSubtab;
      if (rkForYt && typeof updateIssueAssigneeField === 'function') {
        updateIssueAssigneeField(issueId, login || null, rkForYt);
      }
    } catch(e){ diag('updateIssueAssigneeField reassign err: '+e,'err'); }
    /* Ре-рендер Ганта (visible) */
    if (typeof renderGanttChart === 'function') {
      try { renderGanttChart(); } catch(e){ diag('renderGanttChart reassign err: '+e,'err'); }
    }
    /* Двусторонняя синхронизация: если уровень «Люди» рендерил таблицу — обновим её */
    var peopleEl = document.getElementById('planning-level-people');
    if (peopleEl && !peopleEl.classList.contains('hidden')
        && typeof renderCurrentRoleTaskTable === 'function') {
      try { renderCurrentRoleTaskTable(); } catch(e){ diag('renderCurrentRoleTaskTable reassign err: '+e,'err'); }
    }
    /* Снимаем dirty в следующем event-loop — saveCurrentRoleState уже flush'ит draft */
    setTimeout(function(){
      if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && _currentSprintId) {
        var rkClean = _currentSprintRoleRec.sprintId.replace(_currentSprintId + '_', '');
        if (rkClean) delete _dirtyRoleKeys[rkClean];
      }
    }, 0);
  }

  /* v5.7.0 — KL#5 v5.3.0 (D48 уточнённый): один xlsx с двумя листами «Текущий снимок» /
     «Ваша рабочая копия» + diff-маркер в отдельной колонке. Background-fill в SheetJS
     community edition не поддерживается на запись (требует xlsx-js-style fork),
     поэтому используем текстовый маркер «Δ» в первой колонке и легенду в meta. */
  function _buildConflictAOA(snap, otherSnap) {
    var rk = snap && snap.roleKey;
    var role = rk ? ALL_ROLES.find(function(r){ return r.key === rk; }) : null;
    var roleName = role ? roleLabel(role) : (rk || '—');
    var pp = (snap && snap.personalPlanning) || null;
    var ppRole = (pp && rk && pp[rk]) ? pp[rk] : null;
    var ta = (ppRole && ppRole.taskAssignments) || {};
    /* Зеркальные данные другой стороны для diff-сравнения */
    var otherPP = (otherSnap && otherSnap.personalPlanning) || null;
    var otherPPRole = (otherPP && rk && otherPP[rk]) ? otherPP[rk] : null;
    var otherTA = (otherPPRole && otherPPRole.taskAssignments) || {};

    var meta = [
      [T('excelSprintName'),      snap && snap.name || '—'],
      [T('excelRole'),            roleName],
      [T('excelPeriod'),          (snap && snap.dateStart ? fmtDate(snap.dateStart) : '—') + ' — ' + (snap && snap.dateEnd ? fmtDate(snap.dateEnd) : '—')],
      [T('excelStatus'),          (snap && snap.status) ? statusLabel(snap.status) : '—'],
      [T('excelDiffHighlightLegend')], /* строка-легенда */
      []
    ];
    /* v6.1.0 D78 (F1, OQ76 default) — добавлены Факт и Ресурс для consistency с основным экспортом. */
    var header = ['Δ', T('excelColId'), T('excelColTitle'), T('excelColInclusion'),
                  T('excelColEstimate'), T('excelColFact'), T('excelColResource'), T('excelColAlloc'),
                  T('excelColAssignee'), T('excelColStartDate') || 'Старт', T('excelColEndDate') || 'Финиш'];
    function minToH(m){ return m != null ? Math.round(m/60*100)/100 : ''; }
    function tsToD(ts){ return ts ? fmtDate(ts) : ''; }
    var items = (snap && snap.items) || [];
    var rows = items.map(function(item) {
      var iid = item.issueId || '';
      var taE = ta[iid] || {};
      var oE  = otherTA[iid] || {};
      /* Сравниваем ключевые поля: estimate, alloc, inclusion, assignee, dates.
         Если хоть одно отличается — Δ. Также сравниваем сам факт наличия item у второй стороны. */
      var otherItem = (otherSnap && otherSnap.items) ? otherSnap.items.find(function(x){ return x && x.issueId === iid; }) : null;
      var diffParts = [];
      if (!otherItem) diffParts.push('item');
      else {
        if ((item['estimate_'+rk]||0) !== (otherItem['estimate_'+rk]||0)) diffParts.push('est');
        if ((item['alloc_'+rk]) !== (otherItem['alloc_'+rk])) diffParts.push('alloc');
        if ((item.inclusionStatus||'') !== (otherItem.inclusionStatus||'')) diffParts.push('incl');
      }
      if ((taE.assignee||'') !== (oE.assignee||'')) diffParts.push('assignee');
      if ((taE.dateStart||0) !== (oE.dateStart||0)) diffParts.push('start');
      if ((taE.dateEnd||0)   !== (oE.dateEnd||0))   diffParts.push('end');
      var diff = diffParts.length ? ('Δ ' + diffParts.join(',')) : '';
      var resourceMin = Math.max(0, (item['estimate_'+rk]||0) - (item['fact_'+rk]||0));
      var allocRaw = item['alloc_'+rk];
      var allocMin = (allocRaw !== null && allocRaw !== undefined) ? allocRaw : resourceMin;
      return [
        diff,
        iid,
        item.title || '',
        item.inclusionStatus ? incLabel(item.inclusionStatus) : '',
        minToH(item['estimate_'+rk]),
        minToH(item['fact_'+rk]),
        minToH(resourceMin),
        minToH(allocMin),
        taE.assigneeName || taE.assignee || '',
        tsToD(taE.dateStart),
        tsToD(taE.dateEnd)
      ];
    });
    /* Также добавим строки для items, которые есть только в other (orphan на этой стороне) */
    var ourIds = {};
    items.forEach(function(it){ if (it && it.issueId) ourIds[it.issueId] = true; });
    var otherItems = (otherSnap && otherSnap.items) || [];
    otherItems.forEach(function(it){
      if (!it || !it.issueId) return;
      if (ourIds[it.issueId]) return;
      rows.push(['Δ missing', it.issueId, it.title || '', '', '', '', '', '', '', '', '']);
    });
    return meta.concat([header]).concat(rows);
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

  function _draftSaveDebounced(suffix, valueGetter, delayMs) {
    if (_draftRestoreInProgress) return;
    clearTimeout(_draftSaveTimers[suffix]);
    _draftSaveTimers[suffix] = setTimeout(function(){
      _draftSet(suffix, valueGetter());
      _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
    }, delayMs || 800);
  }
  function _markDirty(section) {
    if (_draftRestoreInProgress) return;
    var d = _draftGet('dirty') || {};
    d[section] = true;
    _draftSet('dirty', d);
    refreshDirtyIndicator();
    /* v5.3.0 — если активна working copy, любое dirty-событие синхронизирует
       in-memory _sprint/_roleItems в _workingDrafts[key]. Roleкей берём из активной
       подвкладки или из ключа working copy. Защищаемся try/catch чтобы не сорвать flow. */
    if (_activeWorkingDraftKey) {
      try {
        var rk = _activeSubtab;
        if (!rk) {
          var draft = _workingDrafts[_activeWorkingDraftKey];
          if (draft) {
            var snap = _history.find(function(s){ return s && s.sprintId === _activeWorkingDraftKey; });
            if (snap) rk = snap.roleKey;
          }
        }
        if (rk) syncWorkingDraftFromMemory(rk);
      } catch(e) {
        diag('syncWorkingDraftFromMemory failed: '+(e&&e.message?e.message:e), 'err');
      }
    }
  }
  function _markClean(section) {
    var d = _draftGet('dirty') || {};
    d[section] = false;
    _draftSet('dirty', d);
    refreshDirtyIndicator();
  }
  function _draftIsDirty() {
    var d = _draftGet('dirty') || {};
    return !!(d.sprint || d.roleItems || d.currentRole);
  }
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
  function clearDraftStorage() {
    ['meta','ui','sprint','roleItems','currentRole','dirty'].forEach(function(suf){ _draftDel(suf); });
    /* v6.1.0 D72 — сбросить in-memory state виджета. Иначе после ручной очистки истории
       в backend (через storage props) + click «Очистить черновик» в widget-header'е
       оставался артефакт удалённого спринта (_currentSprintId указывал в пустоту,
       селектор не перерисовывался). */
    _currentSprintId = null;
    if (typeof renderWidgetHeader === 'function') {
      try { renderWidgetHeader(); } catch (_) {}
    }
  }

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
  function restoreDraftIfAny() {
    var meta = _draftGet('meta');
    if (!meta) { diag('draft: no meta in localStorage','info'); return; }
    diag('draft: meta found, savedAt='+meta.savedAt+' version='+meta.version+' baseRevHash='+meta.baseRevHash, 'info');
    if (meta.version !== DRAFT_VERSION) {
      diag('draft: schema version mismatch, ignoring', 'info');
      return;
    }
    var dirty = _draftGet('dirty') || {};
    var hasAny = !!(dirty.sprint || dirty.roleItems || dirty.currentRole);
    diag('draft: dirty='+JSON.stringify(dirty)+' hasAny='+hasAny, 'info');
    if (!hasAny) return;
    /* Конфликт: серверная версия изменилась — не накатываем черновик, чтобы не затереть чужие правки */
    if (meta.baseRevHash && meta.baseRevHash !== _baseRevHash) {
      try { toast(T('toastDraftStale'), 'warn'); } catch(_){}
      _markClean('sprint'); _markClean('roleItems'); _markClean('currentRole');
      diag('draft: stale, skipping restore (serverHash='+_baseRevHash+', draftBase='+meta.baseRevHash+')', 'info');
      return;
    }
    _draftRestoreInProgress = true;
    try {
      if (dirty.sprint) {
        var d = _draftGet('sprint');
        if (d && typeof d === 'object') _sprint = d;
      }
      if (dirty.roleItems) {
        var dr = _draftGet('roleItems');
        if (dr && typeof dr === 'object') _roleItems = dr;
      }
      if (dirty.currentRole) {
        var dd = _draftGet('currentRole');
        if (dd && typeof dd === 'object') {
          _currentRolePP    = dd.pp    || null;
          _currentRoleGantt = dd.gantt || null;
          if (dd.nkcKey) _currentRoleNkcKey = dd.nkcKey;
          /* _currentSprintRoleRec восстанавливается через ui.distribSprintId в restoreUiState */
        }
      }
      var ts;
      try { ts = new Date(meta.savedAt).toLocaleString(_lang === 'en' ? 'en-US' : 'ru-RU'); }
      catch(_) { ts = String(meta.savedAt); }
      try { toast(T('toastDraftRestored').replace('{ts}', ts), 'info'); } catch(_){}
      diag('draft: restored sections '+JSON.stringify(dirty), 'ok');
    } finally {
      _draftRestoreInProgress = false;
    }
  }

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
  /* #25 Ф2 п.6 — полное имя текущего спринта под селектором (нативный <select> обрезает;
     показываем выбранный текст отдельной подписью с переносом до 4 строк). Только global-рельс. */
  function _updateRailSprintName() {
    var el = document.getElementById('sspRailSprintName');
    if (!el) return;
    var sel = document.getElementById('widgetSprintSel');
    var txt = '';
    if (sel && sel.value && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
      txt = (sel.options[sel.selectedIndex].textContent || '').trim();
    }
    el.textContent = txt;
  }
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
  /* Снять dirty + обновить snapshot + обновить кэш черновика — после успешного apiPost */
  function markSavedAndCleanup(section) {
    _markClean(section);
    if (section === 'sprint')    { _serverSnapshotSprint    = _sprint    ? deepClone(_sprint)    : null; _draftSet('sprint',    _sprint);    }
    if (section === 'roleItems') { _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null; _draftSet('roleItems', _roleItems); }
    if (section === 'currentRole')   {
      _serverSnapshotCurrentRolePP    = _currentRolePP    ? deepClone(_currentRolePP)    : null;
      _serverSnapshotCurrentRoleGantt = _currentRoleGantt ? deepClone(_currentRoleGantt) : null;
      _draftSet('currentRole', { pp: _currentRolePP, gantt: _currentRoleGantt, nkcKey: _currentRoleNkcKey,
                              sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null });
    }
    _baseRevHash = computeRevHash(_sprint, _roleItems);
    _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
    refreshDirtyIndicator();
    /* Перерисовать активную таблицу состава, чтобы снять подсветку tr--dirty-row */
    if (_activeSubtab && typeof renderRoleComposition === 'function') {
      try { renderRoleComposition(_activeSubtab); } catch(_){}
    }
  }
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

  /* ═══ Backend API ══════════════════════════════════════════ */
  /* #25 Ф1 — роутинг по режиму. project → backend-project (scope:true). global →
     backend-global + projectKey (query нормализуется: путь может нести встроенный
     '?a=b', раскладываем в единый объект query — без двойного '?'). */
  function _backendCall(path, baseOpts) {
    baseOpts = baseOpts || {};
    if (_mode !== 'global') {
      baseOpts.scope = true;
      return _host.fetchApp('backend-project/' + path, baseOpts);
    }
    var q = {};
    var qi = path.indexOf('?');
    var cleanPath = path;
    if (qi >= 0) {
      cleanPath = path.slice(0, qi);
      path.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    if (baseOpts.query) {
      Object.keys(baseOpts.query).forEach(function (k) { q[k] = baseOpts.query[k]; });
    }
    q.projectKey = _activeProjectKey;
    baseOpts.query = q;
    return _host.fetchApp('backend-global/' + cleanPath, baseOpts);
  }

  function apiGet(path) {
    diag('GET ' + path + ' [' + _mode + ']');
    return _backendCall(path, {})
      .then(function(r){ diag('OK ' + path, 'ok'); return r; })
      .catch(function(e){ diag('ERR ' + path + ': ' + (e&&e.message?e.message:e), 'err'); throw e; });
  }

  function apiPost(path, body, query) {
    diag('POST ' + path + ' [' + _mode + ']');
    var opts = { method: 'POST', body: body };
    if (query && typeof query === 'object') opts.query = query;
    return _backendCall(path, opts)
      .then(function(r){
        /* v5.0.3 — backend всегда отвечает JSON-ом с полем success.
           Если success=false — это валидационная ошибка (status 400) или auth_required.
           fetchApp может resolve-ить в обоих случаях, поэтому проверяем явно
           и пробрасываем как rejected promise, чтобы wrapper НЕ помечал save успешным
           (раньше markSavedAndCleanup вызывался на 400 → sprint-данные считались
           сохранёнными, хотя сервер их отверг). */
        if (r && r.success === false) {
          var reason = (r && (r.reason || r.error)) || 'unknown_error';
          diag('ERR ' + path + ': server returned success=false reason='+reason, 'err');
          throw new Error(reason);
        }
        diag('OK ' + path, 'ok');
        /* v5.0.3 — после успешного сохранения снять dirty + обновить snapshot/baseRevHash */
        try {
          if (path === 'sprint-data' && body) {
            if (body.sprint    !== undefined) markSavedAndCleanup('sprint');
            if (body.roleItems !== undefined) markSavedAndCleanup('roleItems');
            /* v5.0.3 — динамический upsert в историю даже при PLANNING/PLANNED.
               Пропускаем для:
               - action=validate (там есть свой явный saveRoleHistorySnapshot после валидации)
               - settings save (это конфигурация, не данные спринта)
               - FINISHED-спринтов (исторические записи неизменны)
               - отсутствия активной подвкладки/спринта
               - активной рабочей копии (B-fix): при активном _activeWorkingDraftKey
                 пассивный auto-снапшот зовёт saveRoleHistorySnapshot, который видит
                 _activeWorkingDraftKey===snapKey и НЕМЕДЛЕННО коммитит+удаляет только что
                 созданную рабочую копию (resumeWorkingDraft постит sprint-data при открытии).
                 Правки рабочей копии и так персистятся в черновик через
                 _markDirty→syncWorkingDraftFromMemory; commit рабочей копии — только явный
                 (Validate/Save → прямой saveRoleHistorySnapshot/_commitWorkingCopy). */
            var isValidate    = query && query.action === 'validate';
            var hasSprintData = body.sprint !== undefined || body.roleItems !== undefined;
            if (hasSprintData && !isValidate
                && _sprint && _sprint.sprintId
                && _sprint.status !== STATUS.FINISHED
                && !_activeWorkingDraftKey
                && _activeSubtab) {
              try {
                /* fire-and-forget — игнорируем ошибки, не блокируем основной save */
                saveRoleHistorySnapshot(_activeSubtab).catch(function(e){
                  diag('auto-snapshot history failed: '+(e&&e.message?e.message:e),'err');
                });
              } catch(_){}
            }
          } else if (path === 'history') {
            markSavedAndCleanup('currentRole');
            /* v5.0.3 (итерация 5) — после успешного POST history (обычно auto-snapshot)
               обновлённая запись в _history имеет ту же sprintId, что и _currentSprintRoleRec.
               Перепривязываем _currentSprintRoleRec на новую ссылку, чтобы distrib-таблица
               видела свежие items/personalPlanning. */
            try {
              if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && Array.isArray(_history)) {
                var freshRec = _history.find(function(h){ return h.sprintId === _currentSprintRoleRec.sprintId; });
                if (freshRec && freshRec !== _currentSprintRoleRec) _currentSprintRoleRec = freshRec;
              }
            } catch(_){}
          }
        } catch(_){}
        return r;
      })
      .catch(function(e){ diag('ERR ' + path + ': ' + (e&&e.message?e.message:e), 'err'); throw e; });
  }

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
    _initModalCloseObserver(); // v1.9.11 (B-32) — auto-detach focus trap / scroll lock при classList.add('hidden')
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
    /* v5.0.1 — Esc для закрытия overlay
       v1.9.9 — расширено: ловит любой visible .overlay, не только settingsOverlay.
       v1.9.11 (B-32) — переписано на _modalStack-aware: предпочитаем стак (надёжнее
       чем DOM-order assumption), fallback на querySelectorAll если в стаке пусто
       (например, overlay открыт legacy-путём без _appModalOpen). Уважаем
       data-no-escape="true" для блокирующих модалок (wcMultiTab). */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;

      /* 1) Прежде всего смотрим в _modalStack — он содержит модалки, открытые
            через _appModalOpen(). Top = последняя пушнутая. */
      var topOv = null;
      if (_modalStack && _modalStack.length) {
        topOv = _modalStack[_modalStack.length - 1];
        /* Если top уже скрыта (что-то закрыло иначе) — пропадает из стака на следующий цикл. */
        if (topOv && topOv.classList.contains('hidden')) topOv = null;
      }
      /* 2) Fallback на DOM-обход — для overlay'ев, открытых старым путём. */
      if (!topOv) {
        var overlays = document.querySelectorAll('.overlay:not(.hidden)');
        if (!overlays.length) return;
        topOv = overlays[overlays.length - 1];
      }

      /* Блокирующие модалки (например, wcMultiTab) — пропускаем Escape. */
      if (topOv.dataset && topOv.dataset.noEscape === 'true') return;

      var cancelBtn = topOv.querySelector(CANCEL_SELECTOR);
      if (cancelBtn) {
        try { cancelBtn.click(); } catch(_) { _appModalClose(topOv); }
      } else {
        _appModalClose(topOv);
      }
    });

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
     host.navigation доступен только в global-режиме (MAIN_MENU_ITEM). getAppLocation()
     АСИНХРОНЕН (Promise) — проверено V0-A 2026-06-09. YT добавляет app_-префикс к ключам
     в видимой строке, но get/replaceAppLocation работают с чистыми ключами симметрично. */

  function _navAvailable() {
    return !!(_host && _host.navigation && typeof _host.navigation.getAppLocation === 'function');
  }

  /* URL → state: читает search один раз на init. Возвращает Promise<{projectKey,sprintId,node,focus}>. */
  function _readShareParams() {
    if (typeof SHARE_URL_PURE.parseShareSearch !== 'function' || !_navAvailable()) return Promise.resolve({});
    try {
      return Promise.resolve(_host.navigation.getAppLocation())
        .then(function (loc) { return SHARE_URL_PURE.parseShareSearch(loc && loc.search) || {}; })
        .catch(function () { return {}; });
    } catch (_) { return Promise.resolve({}); }
  }

  /* Внутренний id активного узла дерева (для билда URL). */
  function _currentDashNode() {
    try {
      var act = document.querySelector('.ssp-tree [data-node].active');
      if (act && act.dataset && act.dataset.node) return act.dataset.node;
    } catch (_) {}
    return null;
  }

  /* state → URL: replaceAppLocation (без записи в history). No-op до _urlSyncEnabled / вне global. */
  function _syncStateToUrl() {
    if (!_urlSyncEnabled || _mode !== 'global' || !_navAvailable()) return;
    if (typeof _host.navigation.replaceAppLocation !== 'function') return;
    if (typeof SHARE_URL_PURE.buildShareSearch !== 'function') return;
    try {
      var search = SHARE_URL_PURE.buildShareSearch({
        projectKey: _activeProjectKey,
        sprintId:   _currentSprintId,
        node:       _currentDashNode()
      });
      _host.navigation.replaceAppLocation({ search: search });
    } catch (_) {}
  }

  /* Валиден ли sprintId (base-UUID) среди доступных: активный спринт или запись истории. */
  function _validSprintId(id) {
    if (!id) return false;
    if (_sprint && _sprint.sprintId === id) return true;
    if (Array.isArray(_history)) {
      return _history.some(function (rec) {
        return rec && rec.sprintId && String(rec.sprintId).split('_')[0] === id;
      });
    }
    return false;
  }

  /* Применить focus=role:K / user:L — прокрутка + кратковременная подсветка. Невалид → no-op (R3). */
  function _applyShareFocus(focus) {
    if (typeof SHARE_URL_PURE.parseFocus !== 'function') return;
    var f = SHARE_URL_PURE.parseFocus(focus);
    if (!f) return;
    setTimeout(function () {
      try {
        var el = null;
        if (f.kind === 'role') {
          el = document.querySelector('.planning-role-card[data-role-key="' + f.value + '"]');
        } else if (f.kind === 'user') {
          /* people-таблица не имеет стабильного data-login — best-effort, no-op если нет (R3). */
          el = document.querySelector('[data-login="' + f.value + '"], [data-assignee="' + f.value + '"], [data-user="' + f.value + '"]');
        }
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ssp-focus-flash');
        setTimeout(function () { try { el.classList.remove('ssp-focus-flash'); } catch (_) {} }, 1600);
      } catch (_) {}
    }, 200);
  }

  /* Состояние кнопки «Поделиться» в рельсе: enabled только при выбранном спринте. */
  function _updateShareBtnState() {
    var btn = document.querySelector('.ssp-tree__item--share');
    if (!btn) return;
    /* #36 v2.5.2 — host.navigation присутствует только в YT ≥ 2026.1; на старых серверах
       (прод 2025.3) deep-link не работает (ни синк, ни приём, ни корректная ссылка) →
       ПРЯЧЕМ кнопку целиком, чтобы не висела мёртвой. Появится сама, когда сервер
       апнут до 2026.1 (nav станет доступен) — без отдельного релиза. */
    if (_mode !== 'global' || !_navAvailable()) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    var ok = !!_currentSprintId;
    btn.classList.toggle('ssp-tree__item--disabled', !ok);
    btn.setAttribute('title', ok ? T('shareHandoffHint') : T('shareDisabledNoSprint'));
  }

  /* Клик по «Поделиться»: копирует текущий deep-link URL + toast. Без модалки/dropdown (D4).
     ВАЖНО (V0-смоук 2026-06-09): iframe виджета YT идёт без allow="clipboard-write" в
     Permissions-Policy → navigator.clipboard.writeText БЛОКИРУЕТСЯ (и в проде, не только в
     автоматизации). Поэтому primary-путь — синхронный execCommand('copy') в gesture'е (он
     не гейтится clipboard-write policy); async Clipboard API — лишь enhancement-fallback. */
  function _execCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (_) {}
      var done = false;
      try { done = document.execCommand('copy'); } catch (_) { done = false; }
      document.body.removeChild(ta);
      return !!done;
    } catch (_) { return false; }
  }
  /* #36 v2.5.2 — shareable URL РЕКОНСТРУИРУЕМ из состояния, НЕ из window.location.href:
     виджет живёт в sandboxed about:srcdoc-iframe → window.location.href = "about:srcdoc#…"
     (адрес iframe, не родительский YT-URL). Собираем: ytBase + путь app/widget +
     app_-префиксные параметры (YT в реальном URL префиксует ключи app_; getAppLocation
     читает их обратно без префикса — V0-A 2026-06-09). */
  var _SHARE_APP_PATH = '/app/smart-sprint-planner/ssp-main-global/';
  function _buildShareHref() {
    var base = String(_ytBase || '').replace(/\/+$/, '');
    var raw = (typeof SHARE_URL_PURE.buildShareSearch === 'function')
      ? SHARE_URL_PURE.buildShareSearch({ projectKey: _activeProjectKey, sprintId: _currentSprintId, node: _currentDashNode() })
      : '';
    var prefixed = raw ? raw.split('&').map(function (p) { return 'app_' + p; }).join('&') : '';
    return base + _SHARE_APP_PATH + (prefixed ? '?' + prefixed : '');
  }
  function _onShareClick() {
    var href = _buildShareHref();
    try { diag('share copy: ' + href, 'info'); } catch (_) {}
    function ok()  { try { toast(T('shareCopyOk')); } catch (_) {} }
    function err() { try { toast(T('shareCopyErr')); } catch (_) {} }
    /* 1) синхронный execCommand в gesture'е (работает в sandboxed iframe без clipboard-write) */
    if (_execCopy(href)) { ok(); return; }
    /* 2) fallback — async Clipboard API (если вдруг доступен) */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(href).then(ok, err);
      } else {
        err();
      }
    } catch (_) { err(); }
  }

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
    _draftLoaded = false;
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
    _permissionsReady = false;
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

  function _populateStandupRoleSel() {
    var sel = document.getElementById('standupRoleSel');
    if (!sel) return;
    var activeRoles = getActiveRoles();
    sel.innerHTML = '';
    activeRoles.forEach(function(r) {
      var o = document.createElement('option');
      o.value = r.key; o.textContent = r.label;
      sel.appendChild(o);
    });
    if (_activeSubtab && activeRoles.some(function(r){ return r.key === _activeSubtab; })) {
      sel.value = _activeSubtab;
    }
    sel.onchange = function() { try { renderStandupView(); } catch(_){} };
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
  /**
   * [P1-1] Проверка прав валидатора — исключительно через backend GET /check-validator.
   * Сервер читает группы из сохранённых настроек (ctx.project.extensionProperties),
   * клиент не передаёт список групп — их нельзя подменить.
   */
  function checkValidatorNow() {
    return _backendCall('check-validator', { method: 'GET' })
      .then(function(r){ return !!(r && r.isValidator); })
      .catch(function(){ return false; });
  }

  /**
   * [P1-1] Проверка прав редактора — исключительно через backend GET /check-editor.
   * Сервер сверяет ctx.currentUser.groups с настроенными группами редактирования.
   */
  function checkEditorRightsNow() {
    return _backendCall('check-editor', { method: 'GET' })
      .then(function(r){ return !!(r && r.isEditor); })
      .catch(function(){ return false; });
  }

  function checkSettingsManager() {
    diag('checkSettingsManager: запрос...', 'info');
    return _backendCall('check-settings-manager', { method: 'GET' })
      .then(function(r) {
      var msg = 'checkSettingsManager: canManage=' + (r && r.canManage) +
        ' group="' + (r && r.groupName || '') + '"';
      diag(msg, (r && r.canManage) ? 'ok' : 'err');
      return !!(r && r.canManage);
    }).catch(function(e) {
      diag('checkSettingsManager ERR: ' + String(e) + ' — фоллбек: запрещаем', 'err');
      return false;
    });
  }

  function checkValidator() {
    checkValidatorNow().then(function(ok){
      _isValidator = ok;
      diag('checkValidator: isValidator='+ok, ok?'ok':'err');
    });
  }

  function checkEditorRights() {
    checkEditorRightsNow().then(function(ok){
      _isEditor = ok;
      diag('checkEditorRights: isEditor='+ok, ok?'ok':'err');
      applyEditorRightsToUI();
    });
  }

  /* v6.1.0 D82 (F5) — assigner-роль. Иерархия editor⊃assigner⊃viewer.
     Backend GET /check-assigner возвращает { isAssigner }, наследование на frontend
     учитывается в applyEditorRightsToUI (assigner-btn enabled if editor OR assigner). */
  function checkAssignerRightsNow() {
    return _backendCall('check-assigner', { method: 'GET' })
      .then(function (r) {
      return !!(r && r.isAssigner);
    }).catch(function () { return false; });
  }
  function checkAssignerRights() {
    checkAssignerRightsNow().then(function (ok) {
      _isAssigner = ok;
      diag('checkAssignerRights: isAssigner=' + ok, ok ? 'ok' : 'info');
      try { document.body.classList.toggle('has-assigner-rights', !!(_isEditor || _isAssigner)); } catch (_) {}
      applyEditorRightsToUI();
    });
  }

  /* v2.0.0 Phase D3 — Singleton permission check.
     Запускает все 3 async permission checks одним батчем, кэширует Promise.
     Повторные вызовы возвращают тот же Promise (no duplicate API calls).
     Critical click-handlers могут .then() для guard'ов без race. */
  function _startPermissionsCheck() {
    if (_permissionsCheckPromise) return _permissionsCheckPromise;
    var validator = (typeof checkValidatorNow === 'function')
      ? checkValidatorNow().then(function(ok){ _isValidator = ok; })
      : Promise.resolve();
    var editor = (typeof checkEditorRightsNow === 'function')
      ? checkEditorRightsNow().then(function(ok){ _isEditor = ok; })
      : Promise.resolve();
    var assigner = (typeof checkAssignerRightsNow === 'function')
      ? checkAssignerRightsNow().then(function(ok){ _isAssigner = ok; })
      : Promise.resolve();
    _permissionsCheckPromise = Promise.all([validator, editor, assigner]).then(function() {
      _permissionsReady = true;
      try { document.body.classList.toggle('has-assigner-rights', !!(_isEditor || _isAssigner)); } catch(_){}
      if (typeof applyEditorRightsToUI === 'function') { try { applyEditorRightsToUI(); } catch(_){} }
    });
    return _permissionsCheckPromise;
  }

  /* Применить права редактора к кнопкам активной подвкладки.
     v5.6.0 — Этап 4 (4d): legacy #subtab-panel-<rk> удалён, panel теперь — раскрытая
     accordion-карточка `.planning-role-card.expanded[data-role-key=<rk>] .planning-role-body`
     (для уровня «Роли») или `#planningPeopleContent` (для уровня «Люди»). Если ничего
     из этого не активно — применяем ко всему #tab-planning + #tab-gantt (например, после
     reload прав). */
  function applyEditorRightsToUI() {
    var roleKey = _activeSubtab;
    var panel = null;
    if (roleKey) {
      panel = document.querySelector('.planning-role-card.expanded[data-role-key="'+roleKey+'"] .planning-role-body');
    }
    if (!panel) {
      panel = document.getElementById('planningPeopleContent');
    }
    if (!panel) {
      /* Fallback — применяем ко всем editor-btn в #tab-planning и #tab-gantt */
      var roots = [];
      var p1 = document.getElementById('tab-planning'); if (p1) roots.push(p1);
      var p2 = document.getElementById('tab-gantt');    if (p2) roots.push(p2);
      roots.forEach(_applyEditorRightsTo);
    } else {
      _applyEditorRightsTo(panel);
    }
    /* v5.9.0 — расширение на overlay'и: editor-кнопки в #reassignOverlay/#clearAssigneesOverlay/etc.
       должны дизейблиться так же, как в основных вкладках. Settings-overlay (отдельный класс
       .settings-overlay без `.overlay`) НЕ затрагивается — управляется собственным flow check'ов. */
    var ovs = document.querySelectorAll('.overlay:not(.settings-overlay)');
    for (var i = 0; i < ovs.length; i++) _applyEditorRightsTo(ovs[i]);
  }
  function _applyEditorRightsTo(panel) {
    if (!panel) return;
    var editorBtns = panel.querySelectorAll('.editor-btn');
    editorBtns.forEach(function(btn) {
      if (_isEditor) {
        btn.classList.remove('btn--disabled-rights');
        btn.removeAttribute('data-tooltip');
        btn.disabled = false;
      } else {
        btn.classList.add('btn--disabled-rights');
        btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
        // НЕ ставим btn.disabled = true, чтобы показывался тултип
      }
    });
    var validateBtns = panel.querySelectorAll('.validate-btn');
    validateBtns.forEach(function(btn) {
      if (_isValidator) {
        btn.classList.remove('btn--disabled-rights');
        btn.removeAttribute('data-tooltip');
      } else {
        btn.classList.add('btn--disabled-rights');
        btn.setAttribute('data-tooltip', T('tooltipNoRightsVal'));
      }
    });
    var newSprintBtns = panel.querySelectorAll('.new-sprint-btn');
    newSprintBtns.forEach(function(btn) {
      if (_isEditor) {
        btn.classList.remove('btn--disabled-rights');
        btn.removeAttribute('data-tooltip');
      } else {
        btn.classList.add('btn--disabled-rights');
        btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
      }
    });
    var saveHeaderBtns = panel.querySelectorAll('.save-header-btn');
    saveHeaderBtns.forEach(function(btn) {
      if (_isEditor) {
        btn.classList.remove('btn--disabled-rights');
        btn.removeAttribute('data-tooltip');
      } else {
        btn.classList.add('btn--disabled-rights');
        btn.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
      }
    });
    /* v6.1.0 D82 (F5) — assigner-btn включён если editor OR assigner. */
    var assignerBtns = panel.querySelectorAll('.assigner-btn');
    assignerBtns.forEach(function (el) {
      if (_isEditor || _isAssigner) {
        el.classList.remove('btn--disabled-rights');
        el.removeAttribute('data-tooltip');
        el.disabled = false;
        try { el.readOnly = false; } catch (_) {}
      } else {
        el.classList.add('btn--disabled-rights');
        el.setAttribute('data-tooltip', T('tooltipNoRightsEdit'));
        try { el.readOnly = true; } catch (_) {}
      }
    });
  }

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




  /* v1.9.0 D132 — Stand-up assist: helpers + render. */


  function _stateRollupFallbackDone() {
    var order = (_settings && Array.isArray(_settings.stateRollupOrder)) ? _settings.stateRollupOrder : [];
    return order.length >= 2 ? order.slice(-2) : (order.length === 1 ? order.slice(-1) : []);
  }

  function _classifyStandupBuckets(taskAssignmentsMap, doneStates) {
    var done = [], inflight = [], notStarted = [];
    Object.keys(taskAssignmentsMap || {}).forEach(function(issueId) {
      var a = taskAssignmentsMap[issueId];
      if (!a) return;
      var state = (a.state || '').trim();
      var isDone = doneStates.length > 0 && doneStates.indexOf(state) >= 0;
      if (isDone) { done.push(issueId); return; }
      var factSum = 0;
      Object.keys(a).forEach(function(k){ if (/^fact_/.test(k)) factSum += (a[k] || 0); });
      if (factSum > 0 || a.inclusionStatus === 'IN_PROGRESS') {
        inflight.push(issueId);
      } else {
        notStarted.push(issueId);
      }
    });
    return { done: done, inflight: inflight, notStarted: notStarted };
  }

  /* Канон-источник personalPlanning роли для Stand-up (фикс tangled keyed-vs-single модели,
     v2.2.4): текущая роль → live _currentRolePP; иначе → _getPersonalPlanningForCurrent (histRec
     first, кэш _sprint.personalPlanning[rk] лишь fallback). Раньше Stand-up читал сырой кэш
     напрямую — а saveCurrentRoleState затирает его single-объектом одной роли → assignee пропадал. */
  function _standupPP(rk) {
    if (_currentRolePP && _currentSprintRoleRec
        && (_currentSprintRoleRec.roleKey || _activeSubtab) === rk) return _currentRolePP;
    return (typeof _getPersonalPlanningForCurrent === 'function') ? _getPersonalPlanningForCurrent(rk) : null;
  }

  function _renderStandupBucket(containerId, titleKey, issueIds, rk) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var pp = _standupPP(rk);
    var assignments = (pp && pp.taskAssignments) || {};
    var roleItems   = (_roleItems && _roleItems[rk]) || [];
    el.innerHTML = '';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border,#e0e0e0)';
    hdr.textContent = T(titleKey) + ' (' + issueIds.length + ')';
    el.appendChild(hdr);
    if (!issueIds.length) {
      var emp = document.createElement('div');
      emp.style.cssText = 'font-size:11px;color:var(--muted,#888);text-align:center;padding:12px 0';
      emp.textContent = '—';
      el.appendChild(emp);
      return;
    }
    issueIds.forEach(function(issueId) {
      var a = assignments[issueId] || {};
      var item = roleItems.find(function(i){ return i.issueId === issueId; });
      var title = (item && item.title) || issueId;
      var url   = (item && item.url)   || '';
      var factSum = 0;
      Object.keys(a).forEach(function(k){ if (/^fact_/.test(k)) factSum += (a[k] || 0); });
      var planH = a['estimate_'+rk] || (item && item['estimate_'+rk]) || 0;
      var row = document.createElement('div');
      row.style.cssText = 'padding:5px 0;border-bottom:1px solid var(--border,#e0e0e0);font-size:12px;';
      var idHtml = url
        ? '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:var(--primary)">' + esc(issueId) + '</a>'
        : '<span style="font-weight:600">' + esc(issueId) + '</span>';
      var titleTrunc = title.length > 60 ? title.substring(0, 57) + '…' : title;
      var hoursHtml = planH
        ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + '/' + fmtHours(planH) + '</span>'
        : (factSum ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + '</span>' : '');
      var assignee = a.assignee || (item && item.assignee) || '';
      var assigneeHtml = assignee ? '<div style="font-size:11px;color:var(--muted,#888);margin-top:2px">@' + esc(assignee) + '</div>' : '';
      row.innerHTML = hoursHtml + idHtml + ' <span title="'+esc(title)+'" style="color:var(--text)">'+esc(titleTrunc)+'</span>' + assigneeHtml;
      el.appendChild(row);
    });
  }

  function renderStandupView() {
    var noSprint   = document.getElementById('standupNoSprint');
    var emptyRole  = document.getElementById('standupEmptyRole');
    var buckets    = document.getElementById('standupBuckets');
    var noDoneHint = document.getElementById('standupNoDoneStatesHint');
    var goalBanner = document.getElementById('standupGoalBanner');
    var goalMissing= document.getElementById('standupGoalMissingHint');
    var goalText   = document.getElementById('standupGoalText');
    // Empty state: no sprint
    if (!_sprint) {
      if (noSprint)   noSprint.classList.remove('hidden');
      if (emptyRole)  emptyRole.classList.add('hidden');
      if (buckets)    buckets.style.display = 'none';
      if (noDoneHint) noDoneHint.style.display = 'none';
      if (goalBanner) goalBanner.style.display = 'none';
      if (goalMissing)goalMissing.style.display = 'none';
      return;
    }
    if (noSprint) noSprint.classList.add('hidden');
    // Role selector
    var sel = document.getElementById('standupRoleSel');
    var rk = sel ? sel.value : (_activeSubtab || '');
    if (!rk) {
      var activeRoles = getActiveRoles();
      rk = activeRoles.length ? activeRoles[0].key : '';
    }
    // Sprint goal banner
    if (_sprint.sprintGoal) {
      if (goalBanner) { goalBanner.style.display = ''; if (goalText) goalText.textContent = _sprint.sprintGoal; }
      if (goalMissing) goalMissing.style.display = 'none';
    } else {
      if (goalBanner) goalBanner.style.display = 'none';
      if (goalMissing) goalMissing.style.display = '';
    }
    // Empty state: no tasks in role
    var pp = _standupPP(rk);  /* канон-источник (v2.2.4 фикс) — не сырой кэш _sprint.personalPlanning[rk] */
    var assignments = (pp && pp.taskAssignments) || {};
    var hasItems = Object.keys(assignments).length > 0;
    var roleItems = (_roleItems && _roleItems[rk]) || [];
    if (!hasItems && !roleItems.length) {
      if (emptyRole)  emptyRole.classList.remove('hidden');
      if (buckets)    buckets.style.display = 'none';
      if (noDoneHint) noDoneHint.style.display = 'none';
      return;
    }
    if (emptyRole) emptyRole.classList.add('hidden');
    if (buckets)   buckets.style.display = '';
    // Done states resolution
    var doneStates = (_settings && Array.isArray(_settings.standupDoneStates) && _settings.standupDoneStates.length)
      ? _settings.standupDoneStates
      : _stateRollupFallbackDone();
    if (noDoneHint) noDoneHint.style.display = doneStates.length ? 'none' : '';
    // Build a unified map: combine personalPlanning.taskAssignments + roleItems for state
    var unifiedMap = {};
    roleItems.forEach(function(item) {
      unifiedMap[item.issueId] = { state: item.state, inclusionStatus: item.inclusionStatus };
      Object.keys(item).forEach(function(k){ if (/^(fact_|estimate_|alloc_)/.test(k)) unifiedMap[item.issueId][k] = item[k]; });
    });
    Object.keys(assignments).forEach(function(id) {
      if (!unifiedMap[id]) return;  /* v2.2.5 — только обогащаем задачи состава роли исполнителем/состоянием;
        «осиротевшие» назначения (issueId есть в taskAssignments, но нет в _roleItems[rk] — задача убрана
        из состава, запись назначенца осталась) НЕ добавляем как title-less строки. До v2.2.4 баг был скрыт
        пустым кэшем _sprint.personalPlanning[rk]; read-fix v2.2.4 вскрыл сирот. */
      var a = assignments[id];
      if (a.state) unifiedMap[id].state = a.state;
      if (a.assignee) unifiedMap[id].assignee = a.assignee;
    });
    var classified = _classifyStandupBuckets(unifiedMap, doneStates);
    _renderStandupBucket('standupBucketDone',       'standupBucketDone',       classified.done,       rk);
    _renderStandupBucket('standupBucketInflight',   'standupBucketInflight',   classified.inflight,   rk);
    _renderStandupBucket('standupBucketNotStarted', 'standupBucketNotStarted', classified.notStarted, rk);
  }

  /* v2.2.4 — фикс: раньше слался { sprintId } на /refresh-assignees, а handler ждёт
     { issueIds, fieldName, stateFieldName } и отдаёт { assignees } → запрос всегда падал
     (стендап-refresh не работал с full-rebuild v2.1.0). Теперь корректный контракт:
       • state (ось бакетов done/inflight/notStarted) — для выбранной роли rk в _roleItems[rk]
         (чистая keyed-модель, персист sprint-data) — работает для любой роли селектора;
       • assignee — только для текущей роли через _currentRolePP + saveCurrentRoleState
         (канон-персист). Для не-текущей роли assignee не мутируем (избегаем tangled
         personalPlanning-персиста — техдолг в COMMON_ROADMAP); бакетинг идёт по state. */
  function doStandupRefresh() {
    if (!_sprint) return Promise.resolve();
    var sel = document.getElementById('standupRoleSel');
    var rk = (sel && sel.value) || _activeSubtab || '';
    if (!rk) { var ar = getActiveRoles(); rk = ar.length ? ar[0].key : ''; }
    var role = ALL_ROLES.find(function (r) { return r.key === rk; });
    if (!role) return Promise.resolve();
    var fieldName = _settings && _settings[role.userField];
    if (!fieldName) { toast(T('toastSyncFromYtNoField'), 'warn'); return Promise.resolve(); }
    var roleItems = (_roleItems && _roleItems[rk]) || [];
    var ids = roleItems
      .filter(function (i) { return i && i.issueId && ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; })
      .map(function (i) { return i.issueId; });
    if (!ids.length) { renderStandupView(); return Promise.resolve(); }
    var stateField = (_settings && _settings.fieldState) || '';
    var isCur = !!(_currentSprintRoleRec && (_currentSprintRoleRec.roleKey || _activeSubtab) === rk);
    var btn = document.getElementById('standupRefreshBtn');
    return withLoader(btn, function () {
      return apiPost('refresh-assignees', { issueIds: ids, fieldName: fieldName, stateFieldName: stateField })
        .then(function (res) {
          if (!res || !res.success) { toast(T('toastSyncFromYtErr')); return; }
          var assignees = res.assignees || {};
          var pp = isCur ? _currentRolePP : null;
          if (isCur && !pp) { _currentRolePP = pp = { resourcesByAssignee: {}, taskAssignments: {} }; }
          if (pp && !pp.taskAssignments) pp.taskAssignments = {};
          var byId = {};
          roleItems.forEach(function (it) { if (it && it.issueId) byId[it.issueId] = it; });
          var changed = 0;
          Object.keys(assignees).forEach(function (id) {
            var e = assignees[id];
            if (pp) { /* assignee — только текущая роль (канон-персист) */
              var login = (e && e.login) || null;
              var ta = pp.taskAssignments[id] || (pp.taskAssignments[id] = {});
              if ((ta.assignee || null) !== login) {
                ta.assignee = login;
                ta.assigneeName = login ? ((e && (e.fullName || e.login)) || login) : '';
                delete ta.ganttColor;
                changed++;
              }
            }
            if (stateField && e && e.state && byId[id]) { /* state — любая роль */
              var ns = e.state.localizedName || e.state.name || '';
              if (ns && ns !== (byId[id].state || '')) {
                byId[id].state = ns;
                byId[id].stateLocalized = ns;
                var sc = e.state.color;
                byId[id].stateColor = (sc && (sc.background || sc.foreground))
                  ? { background: sc.background || null, foreground: sc.foreground || null } : null;
                changed++;
              }
            }
          });
          if (!changed) { renderStandupView(); toast(T('toastSyncFromYtNoChange'), 'info'); return; }
          _markDirty('roleItems');
          apiPost('sprint-data', { roleItems: _roleItems }).catch(function () {});
          if (isCur) saveCurrentRoleState();
          renderStandupView();
          toast(T('toastStandupRefreshed'), 'success');
        })
        .catch(function (e) { diag('standup refresh err: ' + e, 'err'); toast(T('toastSyncFromYtErr')); });
    });
  }






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

  function computeRoleQuickStats(rk) {
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    /* v6.3.1 D115 — если выбран исторический спринт в widget-header (т.е.
       _currentSprintId !== _sprint.sprintId), читаем данные из соответствующего
       snapshot _history[i] вместо live _sprint/_roleItems. Иначе пользователь
       видит данные активного спринта вместо выбранного. */
    var isHistoricalView = _currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId;
    if (isHistoricalView) {
      var histSnap = (Array.isArray(_history) ? _history : []).find(function(h){
        return h && h.sprintId === _currentSprintId + '_' + rk;
      });
      if (histSnap) {
        var resH = (role && histSnap[role.resKey] != null) ? Number(histSnap[role.resKey]) / 60 : 0;
        if (!isFinite(resH)) resH = 0;
        var itemsH = Array.isArray(histSnap.items) ? histSnap.items : [];
        var totH = 0;
        itemsH.forEach(function(it){
          var alloc = it && it['alloc_'+rk];
          var a = (alloc !== null && alloc !== undefined)
            ? alloc / 60
            : Math.max(0, (it['estimate_'+rk] || 0) - (it['fact_'+rk] || 0)) / 60;
          if (isFinite(a)) totH += a;
        });
        return { resource: resH, totalAlloc: totH, taskCount: itemsH.length, overlimit: (resH > 0) && (totH > resH + 0.001) };
      }
      /* нет снапшота для этой роли в выбранном спринте — пустой stat */
      return { resource: 0, totalAlloc: 0, taskCount: 0, overlimit: false };
    }
    var resource = 0;
    if (role && _sprint && _sprint[role.resKey] != null) {
      resource = Number(_sprint[role.resKey]) / 60;
      if (!isFinite(resource)) resource = 0;
    }
    var items = (typeof getRoleItemsArr === 'function') ? (getRoleItemsArr(rk) || []) : [];
    var totalAlloc = 0;
    items.forEach(function(it){
      var alloc = it && it['alloc_'+rk];
      var a = (alloc !== null && alloc !== undefined)
        ? alloc / 60
        : Math.max(0, (it['estimate_'+rk] || 0) - (it['fact_'+rk] || 0)) / 60;
      if (isFinite(a)) totalAlloc += a;
    });
    var overlimit = (resource > 0) && (totalAlloc > resource + 0.001);
    return { resource: resource, totalAlloc: totalAlloc, taskCount: items.length, overlimit: overlimit };
  }

  function _formatHoursLight(n) { return UTIL_PURE.formatHoursLight(n); }

  function renderRoleAccordion(rk) {
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return '';
    var stats = computeRoleQuickStats(rk);
    var expanded = !!_uiExpandedRoles[rk];
    var label = (typeof roleLabel === 'function') ? roleLabel(role) : role.label || rk;
    var resStr   = _formatHoursLight(stats.resource);
    var allocStr = _formatHoursLight(stats.totalAlloc);
    var html = ''
      + '<div class="planning-role-card' + (expanded ? ' expanded' : '') + '" data-role-key="' + rk + '">'
      +   '<button class="planning-role-toggle" type="button" data-role-key="' + rk + '">'
      +     '<span class="planning-role-chevron">' + (expanded ? '▼' : '▶') + '</span>'
      +     '<span class="planning-role-name">' + esc(label) + '</span>'
      +     '<span class="planning-role-stat">' + esc(T('planningRoleStatResource')) + ': <span class="planning-role-stat__num">' + esc(resStr) + '</span> ' + esc(T('planningRoleStatHourSuffix')) + '</span>'
      +     '<span class="planning-role-stat">' + esc(T('planningRoleStatAlloc')) + ': <span class="planning-role-stat__num">' + esc(allocStr) + ' / ' + esc(resStr) + '</span> ' + esc(T('planningRoleStatHourSuffix')) + '</span>'
      +     '<span class="planning-role-stat"><span class="planning-role-stat__num">' + stats.taskCount + '</span> ' + esc(T('planningRoleStatTasks')) + '</span>'
      +     (stats.overlimit ? '<span class="planning-role-warn">' + esc(T('planningRoleStatOverlimit')) + '</span>' : '')
      +   '</button>'
      +   '<div class="planning-role-body" data-role-body="' + rk + '">'
      /* v5.6.0 — Этап 4 (4c): hint и кнопка «Открыть в legacy» удалены.
         В C4 (4d) сюда монтируется полный editable buildRolePanel(role). */
      +     '<div class="planning-role-body__actions">'
      +       '<button class="ring-button-button ring-button-block ring-button-heightS ring-button-primaryBlock ring-button-flat ring-button-whiteText planning-role-jumpPeople" data-role-key="' + rk + '">' + esc(T('btnJumpToPeople')) + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    return html;
  }

  function _updateRoleAccordionStats(rk) {
    var card = document.querySelector('.planning-role-card[data-role-key="' + rk + '"]');
    if (!card) return;
    var stats = computeRoleQuickStats(rk);
    var resStr   = _formatHoursLight(stats.resource);
    var allocStr = _formatHoursLight(stats.totalAlloc);
    var nums = card.querySelectorAll('.planning-role-toggle .planning-role-stat__num');
    if (nums[0]) nums[0].textContent = resStr;
    if (nums[1]) nums[1].textContent = allocStr + ' / ' + resStr;
    if (nums[2]) nums[2].textContent = String(stats.taskCount);
    var warn = card.querySelector('.planning-role-toggle .planning-role-warn');
    if (stats.overlimit) {
      if (!warn) {
        warn = document.createElement('span');
        warn.className = 'planning-role-warn';
        warn.textContent = T('planningRoleStatOverlimit');
        card.querySelector('.planning-role-toggle').appendChild(warn);
      }
    } else if (warn) {
      warn.parentNode.removeChild(warn);
    }
  }

  function renderPlanningRoles() {
    var container = document.getElementById('roleAccordions');
    var noSprintEl = document.getElementById('planningRolesNoSprint');
    var noActiveEl = document.getElementById('planningRolesNoActive');
    if (!container) return;
    var activeRoles = (typeof getActiveRoles === 'function') ? getActiveRoles() : [];
    if (!activeRoles.length) {
      container.innerHTML = '';
      if (noActiveEl) {
        noActiveEl.classList.remove('hidden');
        /* #43 W2 — CTA «Открыть настройки» только тем, кому виден #openSettingsBtn
           (серверная проверка check-settings-manager, см. refreshOpenSettingsBtn). */
        var ctaEl = document.getElementById('planningRolesNoActiveCta');
        var sBtn  = document.getElementById('openSettingsBtn');
        if (ctaEl) ctaEl.style.display = (sBtn && sBtn.style.display !== 'none') ? '' : 'none';
      }
      if (noSprintEl) noSprintEl.classList.add('hidden');
      return;
    }
    if (noActiveEl) noActiveEl.classList.add('hidden');
    if (!_currentSprintId) {
      container.innerHTML = '';
      if (noSprintEl) noSprintEl.classList.remove('hidden');
      return;
    }
    if (noSprintEl) noSprintEl.classList.add('hidden');
    var html = activeRoles.map(function(role){ return renderRoleAccordion(role.key); }).join('');
    container.innerHTML = html;
    _bindAccordionHandlers();
  }

  function _bindAccordionHandlers() {
    document.querySelectorAll('#roleAccordions .planning-role-toggle').forEach(function(btn){
      btn.addEventListener('click', function(e){
        if (e && e.preventDefault) e.preventDefault();
        var rk = btn.dataset.roleKey;
        if (!rk) return;
        _uiExpandedRoles[rk] = !_uiExpandedRoles[rk];
        var expandedList = Object.keys(_uiExpandedRoles).filter(function(k){ return _uiExpandedRoles[k]; });
        var ui = _draftGet('ui') || {}; ui.expandedRoles = expandedList; _draftSet('ui', ui);
        var card = btn.closest('.planning-role-card');
        if (card) {
          card.classList.toggle('expanded', !!_uiExpandedRoles[rk]);
          var chev = card.querySelector('.planning-role-chevron');
          if (chev) chev.textContent = _uiExpandedRoles[rk] ? '▼' : '▶';
          /* v5.6.0 — Этап 4 (4d): создаём slot для buildRolePanel при первом раскрытии,
             если его ещё нет (template создаёт slot только при initial expanded=true). */
          if (_uiExpandedRoles[rk]) {
            var bodyEl = card.querySelector('.planning-role-body');
            if (!bodyEl) {
              bodyEl = document.createElement('div');
              bodyEl.className = 'planning-role-body';
              bodyEl.setAttribute('data-role-body', rk);
              card.appendChild(bodyEl);
            }
          }
        }
        /* v5.6.0 — Этап 4 (4d): монтаж/демонтаж editable body после toggle */
        if (typeof _mountExpandedRoleBodies === 'function') {
          try { _mountExpandedRoleBodies(); } catch(err){ diag('mount role bodies on toggle err: '+err,'err'); }
        }
      });
    });
    /* v5.6.0 — Этап 4 (4c): handler .planning-role-openOld удалён вместе с кнопкой. */
    document.querySelectorAll('#roleAccordions .planning-role-jumpPeople').forEach(function(btn){
      btn.addEventListener('click', function(e){
        if (e && e.stopPropagation) e.stopPropagation();
        var rk = btn.dataset.roleKey;
        /* v1.8.1 — явно зафиксировать целевую роль ДО переключения уровня, иначе
           refreshPlanningPeopleForCurrentSprint берёт rk из sel.value/_activeSubtab,
           а они хранят последнюю использованную роль (баг #3 из v1.8.1 acceptance). */
        safeLs.set('ssp_lastActiveRole', rk);
        _activeSubtab = rk;
        var peopleSel = document.getElementById('planningRoleSel');
        if (peopleSel) {
          if (!peopleSel.options.length && typeof populatePlanningRoleSel === 'function') {
            try { populatePlanningRoleSel(); } catch(_){}
          }
          if (peopleSel.querySelector('option[value="'+rk+'"]')) peopleSel.value = rk;
        }
        var lvlBtn = document.querySelector('.planning-level-btn[data-level="people"]');
        if (lvlBtn && lvlBtn.style.display !== 'none' && !lvlBtn.classList.contains('hidden')) lvlBtn.click();
        /* Явный refresh с переданным rk — на случай если levelBtn.click() не вызвал refresh. */
        if (typeof refreshPlanningPeopleForCurrentSprint === 'function') {
          try { refreshPlanningPeopleForCurrentSprint(rk); } catch(_){}
        }
      });
    });
    /* v5.6.0 — Этап 4 (4d): после рендера accordion — монтируем full editable buildRolePanel
       в раскрытые карточки. Свёрнутые карточки очищают тело (для экономии DOM). */
    if (typeof _mountExpandedRoleBodies === 'function') {
      try { _mountExpandedRoleBodies(); } catch(e){ diag('mount role bodies err: '+e,'err'); }
    }
  }

  /* v5.6.0 — Этап 4 (4d): монтаж полного editable buildRolePanel(role) в раскрытые
     accordion-карточки. Каждая карточка с .expanded получает уникальный buildRolePanel
     (id внутри функции содержат roleKey, поэтому коллизий нет даже при одновременном
     раскрытии нескольких ролей). После монтажа — устанавливаем _activeSubtab и
     applyEditorRightsToUI для применения прав редактора. */
  function _mountExpandedRoleBodies() {
    document.querySelectorAll('.planning-role-card.expanded .planning-role-body').forEach(function(host){
      var rk = host.getAttribute('data-role-body');
      if (!rk) return;
      /* Идемпотентность: если уже примонтирован — пропускаем (не пере-рендерим).
         Mark через data-mounted=1. */
      if (host.dataset.mounted === '1') return;
      var role = ALL_ROLES.find(function(r){ return r.key === rk; });
      if (!role) return;
      try {
        /* Сохраняем кнопку «Перейти в Люди» (data-keep="actions") если она есть */
        var keepActions = host.querySelector('.planning-role-body__actions');
        host.innerHTML = '';
        host.appendChild(buildRolePanel(role));
        if (keepActions) host.appendChild(keepActions);
        host.dataset.mounted = '1';
        _activeSubtab = rk;
        if (typeof applyEditorRightsToUI === 'function') applyEditorRightsToUI();
      } catch(e) { diag('_mountExpandedRoleBodies err for rk='+rk+': '+e, 'err'); }
    });
    /* Свёрнутые карточки — сброс mounted флага (на случай повторного раскрытия — пере-рендер свежим состоянием) */
    document.querySelectorAll('.planning-role-card:not(.expanded) .planning-role-body').forEach(function(host){
      if (host.dataset.mounted === '1') {
        host.dataset.mounted = '';
        host.innerHTML = '';
      }
    });
  }

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
  function refreshPlanningPeopleForCurrentSprint(roleKey) {
    var sel = document.getElementById('planningRoleSel');
    if (!sel) return;
    if (!sel.options.length) populatePlanningRoleSel();
    /* v6.1.0 D73 — fallback на активную роль из «Ролей» / последнюю активную, чтобы
       при переключении уровня «Роли» → «Люди» dropdown #planningRoleSel автоматически
       подтягивал текущую роль и _currentSprintRoleRec не оставался пустым (баг #8). */
    var rk = roleKey || sel.value || _activeSubtab || safeLs.get('ssp_lastActiveRole') || '';
    if (rk && sel.value !== rk) sel.value = rk;
    if (!rk) return;
    safeLs.set('ssp_lastActiveRole', rk);
    var noSprintEl = document.getElementById('planningPeopleNoSprint');
    var emptyEl    = document.getElementById('planningPeopleEmpty');
    var contentEl  = document.getElementById('planningPeopleContent');
    if (!_currentSprintId) {
      if (noSprintEl) noSprintEl.classList.remove('hidden');
      if (emptyEl)    emptyEl.classList.add('hidden');
      if (contentEl)  contentEl.classList.add('hidden');
      _currentSprintRoleRec = null; _currentRolePP = null; _currentRoleGantt = null;
      return;
    }
    if (noSprintEl) noSprintEl.classList.add('hidden');
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    var roleName = role ? ((typeof roleLabel === 'function') ? roleLabel(role) : (role.label || rk)) : rk;
    var pp = _getPersonalPlanningForCurrent(rk);
    var hasPP = pp && pp.resourcesByAssignee && Object.keys(pp.resourcesByAssignee).length > 0;
    if (!hasPP) {
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        var titleEl = document.getElementById('planningPeopleEmptyTitle');
        if (titleEl) titleEl.textContent = T('planningPeopleEmptyTitleTpl').replace('{role}', roleName);
      }
      if (contentEl) contentEl.classList.add('hidden');
      /* НЕ сбрасываем _currentSprintRoleRec — пользователь может ткнуть CTA, который вызовет doCurrentRoleCalc.
         doCurrentRoleCalc проверяет _currentSprintRoleRec на null и берёт его из _findHistRecForCurrent(rk). */
      _currentSprintRoleRec = _findHistRecForCurrent(rk);
      _currentRolePP    = (_currentSprintRoleRec && _currentSprintRoleRec.personalPlanning) ? deepClone(_currentSprintRoleRec.personalPlanning) : (typeof emptyPP === 'function' ? emptyPP() : { resourcesByAssignee:{}, taskAssignments:{} });
      _currentRoleGantt = (_currentSprintRoleRec && _currentSprintRoleRec.gantt) ? deepClone(_currentSprintRoleRec.gantt) : { tasks:{}, updatedAt:null };
      _activeSubtab = rk;
      _renderOrphanGanttBanner(_currentSprintRoleRec); /* v5.7.0 — Этап 5 */
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    /* Контекст для render-функций (читают из _currentRole*; v5.10.0 — ранее _distrib*) */
    _currentSprintRoleRec = _findHistRecForCurrent(rk);
    _currentRolePP    = deepClone(pp);
    _currentRoleGantt = (_currentSprintRoleRec && _currentSprintRoleRec.gantt) ? deepClone(_currentSprintRoleRec.gantt) : { tasks:{}, updatedAt:null };
    _currentRoleNkcKey = (_currentRolePP.nkcKey) || _currentRoleNkcKey || 'other';
    var nkcSel = document.getElementById('currentRoleNkcSel');
    if (nkcSel && nkcSel.querySelector('option[value="'+_currentRoleNkcKey+'"]')) {
      nkcSel.value = _currentRoleNkcKey;
    }
    _activeSubtab = rk;
    if (typeof renderCurrentRoleAssigneeTable === 'function') {
      try { renderCurrentRoleAssigneeTable(); } catch(e){ diag('renderCurrentRoleAssigneeTable err: '+e,'err'); }
    }
    if (typeof renderCurrentRoleTaskTable === 'function') {
      try { renderCurrentRoleTaskTable(); } catch(e){ diag('renderCurrentRoleTaskTable err: '+e,'err'); }
    }
    if (typeof updateCurrentRoleTotals === 'function') {
      try { updateCurrentRoleTotals(); } catch(e){ diag('updateCurrentRoleTotals err: '+e,'err'); }
    }
    _renderResourceModeIndicator(rk, _currentRolePP);
    _renderOrphanGanttBanner(_currentSprintRoleRec); /* v5.7.0 — Этап 5 */
    if (typeof applyEditorRightsToUI === 'function') {
      try { applyEditorRightsToUI(); } catch(_){}
    }
  }

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

  /* D34 — Hybrid поведение для исторических спринтов на уровне tab-planning.
     При _currentSprintId !== _sprint.sprintId без своей WC — read-only.
     При наличии собственной WC — automatic load + editable (логика v5.3.0).
     Реальная подгрузка WC в _sprint остаётся через editHistorySprint в legacy tab-planner;
     здесь применяется только UI-режим (классы readonly + видимость кнопок). */
  function _hasMyActiveWcForSprint(sprintId) {
    if (!sprintId) return false;
    if (typeof _workingDrafts !== 'object' || _workingDrafts === null) return false;
    /* v6.3.1 D121 — было `_me` (undefined), правильное имя — `_currentUser`.
       Корень: `ReferenceError: _me is not defined` ловился try/catch в setCurrentSprintId,
       но _applyHybridSprintMode прерывался → readonly-mode не применялся правильно при
       переходе на исторические спринты. Найдено в diag-логе testbench v6.3.0 2026-05-08. */
    var myLogin = (_currentUser && _currentUser.login) ? _currentUser.login : null;
    var roles = (typeof getActiveRoles === 'function') ? getActiveRoles() : [];
    for (var i = 0; i < roles.length; i++) {
      var k = sprintId + '_' + roles[i].key;
      var wd = _workingDrafts[k];
      if (wd && (!myLogin || wd.editorLogin === myLogin)) return true;
    }
    return false;
  }
  /* v5.6.0 — Этап 4 (4d): класс .readonly-mode применяется к обеим editable-вкладкам:
     #tab-planning (уровни Роли/Люди) И #tab-gantt (на верхнем уровне после Этапа 4).
     CSS правило `.readonly-mode .gantt-cell { pointer-events: none; }` отключает dblclick;
     `.readonly-mode #ganttUpdateBtn { display: none; }` скрывает кнопку обновления. */
  function _setHistoricalReadOnly(on) {
    var p1 = document.getElementById('tab-planning');
    if (p1) p1.classList.toggle('readonly-mode', !!on);
    var p2 = document.getElementById('tab-gantt');
    if (p2) p2.classList.toggle('readonly-mode', !!on);
    /* v5.7.0 — Этап 5: при переходе в read-only закрываем reassign-модал, если открыт */
    if (on && typeof hideReassignModal === 'function') {
      try { hideReassignModal(); } catch(_){}
    }
  }
  function _applyHybridSprintMode(newId) {
    var isHistorical = !!(newId && _sprint && _sprint.sprintId && newId !== _sprint.sprintId);
    if (!isHistorical) { _setHistoricalReadOnly(false); return; }
    var hasMyWc = _hasMyActiveWcForSprint(newId);
    _setHistoricalReadOnly(!hasMyWc);
  }

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

  /* ── Построить панель для одной роли ── */
  function buildRolePanel(role) {
    var dynEdit = _settings && _settings.dynEditEnabled;
    var frag = document.createDocumentFragment();

    /* === Блок: трёхколоночный layout === */
    var cols = document.createElement('div');
    cols.className = 'planner-cols';

    /* Колонка 1: Статус планирования */
    var colStatus = document.createElement('div');
    colStatus.className = 'card';
    colStatus.style.marginBottom = '0';
    colStatus.innerHTML = '<div class="card-title">'+T('cardStatusPlanning')+'</div>';
    var statusRow = document.createElement('div');
    statusRow.className = 'status-row';
    statusRow.style.flexDirection = 'column';
    statusRow.style.alignItems = 'flex-start';
    statusRow.style.gap = '10px';

    /* v5.2.0 — селектор статуса упразднён: после удаления PLANNED у него осталась
       одна опция, теряет смысл. Переход PLANNING→CONFIRMED идёт только через
       кнопку «Валидировать». Текущий статус показывается через statusBadge. */

    var statusBadge = document.createElement('span');
    statusBadge.id = 'statusBadge_'+role.key;
    statusBadge.className = 's-badge s-badge--planning';
    statusBadge.textContent = statusLabel(STATUS.PLANNING);

    var newSprintBtn = document.createElement('button');
    newSprintBtn.className = 'ring-button-button ring-button-block ring-button-heightS new-sprint-btn';
    newSprintBtn.id = 'newSprintBtn_'+role.key;
    newSprintBtn.style.display = 'none';
    newSprintBtn.textContent = T('btnNewSprint');

    var saveHeaderBtn = document.createElement('button');
    saveHeaderBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText save-header-btn';
    saveHeaderBtn.id = 'saveHeaderBtn_'+role.key;
    saveHeaderBtn.textContent = T('btnSaveParams');

    statusRow.appendChild(statusBadge);
    statusRow.appendChild(newSprintBtn);
    statusRow.appendChild(saveHeaderBtn);
    colStatus.appendChild(statusRow);

    /* Колонка 2: Доступные ресурсы */
    var colRes = document.createElement('div');
    colRes.className = 'card';
    colRes.style.marginBottom = '0';
    colRes.innerHTML = '<div class="card-title">'+T('cardAvailRes')+'</div>';
    var resField = document.createElement('div');
    resField.className = 'field';
    resField.innerHTML = '<label for="res_'+role.key+'">'+esc(roleLabel(role))+'</label>'+
      '<input type="text" id="res_'+role.key+'" placeholder="'+T('phPeriod')+'"/>';
    colRes.appendChild(resField);

    /* Колонка 3: Остатки ресурсов */
    var colRem = document.createElement('div');
    colRem.className = 'card';
    colRem.style.marginBottom = '0';
    colRem.innerHTML = '<div class="card-title">'+T('cardRemRes')+'</div>';
    var remCard = document.createElement('div');
    remCard.className = 'remain-card';
    remCard.id = 'rc_'+role.key;
    remCard.innerHTML = '<div class="remain-card__label">'+esc(roleLabel(role))+'</div>'+
      '<div class="remain-card__val" id="rem_'+role.key+'">—</div>';
    colRem.appendChild(remCard);

    cols.appendChild(colStatus);
    cols.appendChild(colRes);
    cols.appendChild(colRem);
    frag.appendChild(cols);

    /* === Блок: Состав спринта === */
    var compCard = document.createElement('div');
    compCard.className = 'card';
    var compTitle = document.createElement('div');
    compTitle.className = 'card-title';
    compTitle.textContent = T('cardComposition') + ' — ' + roleLabel(role);
    compCard.appendChild(compTitle);

    var toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.style.marginBottom = '14px';

    var pickBtn = document.createElement('button');
    pickBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText editor-btn';
    pickBtn.id = 'pickBtn_'+role.key;
    pickBtn.textContent = T('btnPickTasks');

    /* S6 #35 — кнопка «Обновить из задачи» теперь в обоих режимах (inline и обычный):
       единый refreshFromYouTrack тянет полный срез и в inline безопасен (dirty-guard). */
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'ring-button-button ring-button-block ring-button-heightS editor-btn';
    refreshBtn.id = 'refreshBtn_'+role.key;
    refreshBtn.disabled = true;
    refreshBtn.textContent = T('btnRefreshFromTask');

    var recalcBtn = document.createElement('button');
    recalcBtn.className = 'ring-button-button ring-button-block ring-button-heightS editor-btn';
    recalcBtn.id = 'recalcBtn_'+role.key;
    recalcBtn.disabled = true;
    recalcBtn.textContent = T('btnRecalc');

    var clearBtn = document.createElement('button');
    clearBtn.className = 'ring-button-button ring-button-block ring-button-heightS ring-button-danger editor-btn';
    clearBtn.id = 'clearBtn_'+role.key;
    clearBtn.disabled = true;
    clearBtn.textContent = T('btnClear');

    var spacer = document.createElement('div');
    spacer.style.flex = '1';

    var validateBtn = document.createElement('button');
    validateBtn.className = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText validate-btn';
    validateBtn.id = 'validateBtn_'+role.key;
    validateBtn.textContent = T('btnValidate');

    toolbar.appendChild(pickBtn);
    if (refreshBtn) toolbar.appendChild(refreshBtn);
    toolbar.appendChild(recalcBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(spacer);
    toolbar.appendChild(validateBtn);
    compCard.appendChild(toolbar);

    /* v2.1.0 E4 — Ring Table host (replaces native <table>/<thead>/<tbody>).
       renderRoleComposition() mounts Ring Table via window.__SSP_TABLE.mountAt
       with columns built from buildRoleCompositionColumns(role, dynEdit). */
    var tblWrap = document.createElement('div');
    tblWrap.className = 'tbl-wrap';
    var host = document.createElement('div');
    host.id = 'compHost_'+role.key;
    host.setAttribute('data-ssp-table-host', '');
    host.innerHTML = '<div class="empty">'+esc(T('compEmpty'))+'</div>';
    tblWrap.appendChild(host);
    compCard.appendChild(tblWrap);

    var pag = document.createElement('div');
    pag.className = 'pagination';
    pag.id = 'planPag_'+role.key;
    pag.style.display = 'none';
    pag.innerHTML = '<button class="ring-button-button ring-button-block ring-button-heightS" id="planPrev_'+role.key+'">‹</button>'+
      '<span id="planPageInfo_'+role.key+'"></span>'+
      '<button class="ring-button-button ring-button-block ring-button-heightS" id="planNext_'+role.key+'">›</button>';
    compCard.appendChild(pag);
    frag.appendChild(compCard);

    /* === Навесить события === */
    setTimeout(function() {
      wireRolePanel(role, dynEdit);
      renderRolePlannerHeader(role.key);
      renderRoleComposition(role.key);
      updateRoleRemaining(role.key);
    }, 0);

    return frag;
  }


  function wireRolePanel(role, dynEdit) {
    var rk = role.key;

    /* Кнопка Подобрать задачи */
    var pickBtn = document.getElementById('pickBtn_'+rk);
    if (pickBtn) {
      pickBtn.addEventListener('click', function() {
        if (!_isEditor) { toast(T('toastNoEditRights'), 'warn'); return; }
        openPickModal(rk, role);
      });
    }

    /* Кнопка Обновить данные */
    var refreshBtn = document.getElementById('refreshBtn_'+rk);
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        if (!_isEditor) { toast(T('toastNoRightsShort'), 'warn'); return; }
        refreshFromYouTrack(); /* #35 — единый путь: весь спринт, обе вкладки + Гант */
      });
    }

    /* Кнопка Пересчитать */
    var recalcBtn = document.getElementById('recalcBtn_'+rk);
    if (recalcBtn) {
      recalcBtn.addEventListener('click', function() {
        if (!_isEditor) { toast(T('toastNoRightsShort'), 'warn'); return; }
        updateRoleRemaining(rk);
        toast(T('toastRecalcDone'), 'success');
      });
    }

    /* Кнопка Очистить */
    var clearBtn = document.getElementById('clearBtn_'+rk);
    if (clearBtn) {
      clearBtn.addEventListener('click', (function(roleKey) { return function() {
        if (!_isEditor) { toast(T('toastNoRightsShort'), 'warn'); return; }
        openModal({
          id: 'clear',
          type: 'confirm',
          title: T('confirmClearTask'),
          body: { kind: 'text', text: T('confirmClearTask') },
          buttons: [
            { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function(h) { h.close(); } },
            { id: 'confirm', text: T('btnYesClear'), variant: 'danger', onClick: function(h) {
              h.close();
              _roleItems[roleKey] = [];
              apiPost('sprint-data', { roleItems: _roleItems }).then(function() {
                renderRoleComposition(roleKey);
                updateRoleRemaining(roleKey);
                toast(T('toastCleared'), 'success');
              });
            }},
          ],
          dismissOnBackdrop: false,
          blockEscape: false,
          showCloseButton: false,
        });
      }; })(rk));
    }

    /* Кнопка Валидировать */
    var validateBtn = document.getElementById('validateBtn_'+rk);
    if (validateBtn) {
      validateBtn.addEventListener('click', function() {
        if (!_isValidator) { toast(T('toastNoValidRights'), 'warn'); return; }
        doValidateRole(rk);
      });
    }

    /* Кнопка Новый спринт */
    var newSprintBtn = document.getElementById('newSprintBtn_'+rk);
    if (newSprintBtn) {
      newSprintBtn.addEventListener('click', function() {
        if (!_isEditor) { toast(T('toastNoRightsShort'), 'warn'); return; }
        doNewSprint(rk);
      });
    }

    /* Кнопка Сохранить параметры */
    var saveHeaderBtn = document.getElementById('saveHeaderBtn_'+rk);
    if (saveHeaderBtn) {
      saveHeaderBtn.addEventListener('click', function() {
        if (!_isEditor) { toast(T('toastNoRightsShort'), 'warn'); return; }
        doSaveRoleHeader(rk);
      });
    }

    /* Пагинация */
    var prevBtn = document.getElementById('planPrev_'+rk);
    var nextBtn = document.getElementById('planNext_'+rk);
    if (prevBtn) prevBtn.addEventListener('click', function() {
      var page = (_roleItems[rk] && _roleItems[rk]._page) || 1;
      if (!_roleItems[rk]) return;
      _roleItems[rk]._page = Math.max(1, page - 1);
      renderRoleComposition(rk);
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
      var page = (_roleItems[rk] && _roleItems[rk]._page) || 1;
      if (!_roleItems[rk]) return;
      _roleItems[rk]._page = page + 1;
      renderRoleComposition(rk);
    });
  }

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

  /* ── Сохранить параметры спринта для роли ── */
  function doSaveRoleHeader(rk) {
    /* v1.8.2 — inline-error helper. Глобальный toast при validation попадает в position:fixed
       которое в YT-iframe иногда уходит за viewport главного окна (особенно при 2+ ролях
       когда контент длинный). Inline-error всегда рядом с проблемным полем + scrollIntoView. */
    function _clearFieldErrors() {
      ['sprintName','dateStart','dateEnd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('field-err-input');
      });
      var en = document.getElementById('errName'); if (en) en.textContent = '';
      var ed = document.getElementById('errDate'); if (ed) ed.textContent = '';
    }
    function _showFieldError(fieldId, errSpanId, msgKey) {
      var fld = document.getElementById(fieldId);
      var err = document.getElementById(errSpanId);
      if (err) err.textContent = T(msgKey);
      if (fld) {
        fld.classList.add('field-err-input');
        try { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        try { fld.focus(); } catch(_){}
      }
      /* Toast оставляем как дублирующий сигнал — но основной visual cue теперь inline. */
      toast(T(msgKey), 'warn');
    }
    _clearFieldErrors();
    var s = document.getElementById('dateStart').value;
    var e = document.getElementById('dateEnd').value;
    /* v1.6.2 D126 — обязательные поля: название + даты начала/окончания. */
    var nameVal = (document.getElementById('sprintName').value || '').trim();
    var draftName = T('newSprintDraftName');
    if (!nameVal || nameVal === draftName) {
      _showFieldError('sprintName', 'errName', 'toastSprintNameRequired');
      return;
    }
    if (!s) {
      _showFieldError('dateStart', 'errDate', 'toastSprintDateStartRequired');
      return;
    }
    if (!e) {
      _showFieldError('dateEnd', 'errDate', 'toastSprintDateEndRequired');
      return;
    }
    if (s && e && fromDateIn(e) < fromDateIn(s)) {
      _showFieldError('dateEnd', 'errDate', 'toastDateError');
      return;
    }
    _clearFieldErrors();
    _sprint.name      = nameVal.substring(0,60);
    _sprint.dateStart = fromDateIn(s);
    _sprint.dateEnd   = fromDateIn(e);
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (role) {
      var resEl = document.getElementById('res_'+rk);
      if (resEl) _sprint[role.resKey] = parsePeriod(resEl.value);
    }
    var ss = document.getElementById('sprintStatus_'+rk);
    if (_sprint.status !== STATUS.CONFIRMED && _sprint.status !== STATUS.ALLOCATED && ss) _sprint.status = ss.value;
    // Сохранить поля Спринт / Версия
    var sprintFv = document.getElementById('sprintFieldVal');
    var versionFv = document.getElementById('versionFieldVal');
    if (sprintFv) _sprint.sprintFieldVal = sprintFv.value || null;
    if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
    /* v1.9.0 D132 — Сохранить sprint goal (shared field, same for all roles). */
    var _goalEl = document.getElementById('sprintGoal');
    var _goalVal = _goalEl ? (_goalEl.value || '').trim() : '';
    _sprint.sprintGoal = _goalVal || undefined;
    _sprint.updatedAt = Date.now();
    _sprint.updatedBy = _currentUser ? _currentUser.login : null;

    var btn = document.getElementById('saveHeaderBtn_'+rk);
    /* v5.0.3 — пометить dirty + записать в localStorage. apiPost-успех снимет dirty. */
    _markDirty('sprint');
    _draftSet('sprint', _sprint);
    _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
    return withLoader(btn, function() {
      return apiPost('sprint-data', { sprint: _sprint }).then(function() {
        updateRoleRemaining(rk);
        renderRoleStatusBadge(rk);
        toast(T('toastSprintSaved'), 'success');
        /* v1.8.1 — селектор шапки виджета и бейдж статуса должны отразить новое имя/даты
           сразу после сохранения параметров. Раньше изменения подхватывались только после
           перезахода на вкладку. Дополнительно: убеждаемся что _currentSprintId указывает
           на _sprint.sprintId (для свежесозданного спринта). */
        if (_sprint && _sprint.sprintId && _currentSprintId !== _sprint.sprintId) {
          _currentSprintId = _sprint.sprintId;
          var _uiNew = _draftGet('ui') || {}; _uiNew.currentSprintId = _currentSprintId; _draftSet('ui', _uiNew);
        }
        if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
      }).catch(function(e) {
        toast(T('toastSaveError')+': '+(e&&e.message?e.message:e));
      });
    });
  }

  /* v1.8.5 D130 — Сохранить общие поля «Вводных данных по спринту» без role-resource части.
     Отдельная кнопка #saveSprintIntroBtn в карточке card-sprint-intro: общие поля живут наверху,
     раньше save-кнопка находилась только внутри per-role аккордеона (#saveHeaderBtn_<rk>), что
     противоречило principle of least surprise. Per-role кнопка продолжает сохранять и общие поля,
     и role-specific resource — изменений в doSaveRoleHeader нет. */
  function doSaveSprintIntro() {
    function _clearFieldErrors() {
      ['sprintName','dateStart','dateEnd'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('field-err-input');
      });
      var en = document.getElementById('errName'); if (en) en.textContent = '';
      var ed = document.getElementById('errDate'); if (ed) ed.textContent = '';
      var ei = document.getElementById('errSprintIntro'); if (ei) ei.textContent = '';
    }
    function _showFieldError(fieldId, errSpanId, msgKey) {
      var fld = document.getElementById(fieldId);
      var err = document.getElementById(errSpanId);
      if (err) err.textContent = T(msgKey);
      if (fld) {
        fld.classList.add('field-err-input');
        try { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_){}
        try { fld.focus(); } catch(_){}
      }
      toast(T(msgKey), 'warn');
    }
    _clearFieldErrors();
    var s = document.getElementById('dateStart').value;
    var e = document.getElementById('dateEnd').value;
    var nameVal = (document.getElementById('sprintName').value || '').trim();
    var draftName = T('newSprintDraftName');
    if (!nameVal || nameVal === draftName) {
      _showFieldError('sprintName', 'errName', 'toastSprintNameRequired');
      return;
    }
    if (!s) {
      _showFieldError('dateStart', 'errDate', 'toastSprintDateStartRequired');
      return;
    }
    if (!e) {
      _showFieldError('dateEnd', 'errDate', 'toastSprintDateEndRequired');
      return;
    }
    if (s && e && fromDateIn(e) < fromDateIn(s)) {
      _showFieldError('dateEnd', 'errDate', 'toastDateError');
      return;
    }
    _clearFieldErrors();
    _sprint.name      = nameVal.substring(0,60);
    _sprint.dateStart = fromDateIn(s);
    _sprint.dateEnd   = fromDateIn(e);
    var sprintFv  = document.getElementById('sprintFieldVal');
    var versionFv = document.getElementById('versionFieldVal');
    if (sprintFv)  _sprint.sprintFieldVal  = sprintFv.value  || null;
    if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
    /* v1.9.0 D132 — Sprint goal: read + soft-warn if empty. */
    var _goalElI = document.getElementById('sprintGoal');
    var _goalValI = _goalElI ? (_goalElI.value || '').trim() : '';
    _sprint.sprintGoal = _goalValI || undefined;
    _sprint.updatedAt = Date.now();
    _sprint.updatedBy = _currentUser ? _currentUser.login : null;

    var btn = document.getElementById('saveSprintIntroBtn');
    var origLabel = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = T('toastSaving'); }
    _markDirty('sprint');
    _draftSet('sprint', _sprint);
    _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
    apiPost('sprint-data', { sprint: _sprint }).then(function() {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || T('btnSaveSprintIntro'); }
      toast(T('toastSprintSaved'), 'success');
      /* v1.9.0 D132 — Soft-warn если sprint goal не задан. */
      if (!_goalValI) { setTimeout(function(){ toast(T('toastSprintGoalMissing'), 'warn'); }, 400); }
      /* Sync header + currentSprintId (как в doSaveRoleHeader при new-sprint flow). */
      if (_sprint && _sprint.sprintId && _currentSprintId !== _sprint.sprintId) {
        _currentSprintId = _sprint.sprintId;
        var _uiNew = _draftGet('ui') || {}; _uiNew.currentSprintId = _currentSprintId; _draftSet('ui', _uiNew);
      }
      if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
    }).catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = origLabel || T('btnSaveSprintIntro'); }
      toast(T('toastSaveError')+': '+(err&&err.message?err.message:err));
    });
  }

  /* v1.9.1 D133 — Диалог подтверждения результата спринта при завершении (Finish sprint).
     sprintGoalText — текст цели из history-записи (rec.sprintGoal).
     existingOutcome — pre-select radio если outcome уже был записан ранее (re-finish flow).
     Возвращает Promise<{goalOutcome, goalRetroNote}|null>.
     null — пользователь нажал Отмена (спринт не завершается). */
  function openConfirmGoalDialog(sprintGoalText, existingOutcome) {
    return new Promise(function(resolve) {
      /* Phase 2 #32 — мигрировано на openModal() (bespoke confirmGoalForm, настоящий React).
         Promise-контракт сохранён: resolve({goalOutcome, goalRetroNote}) на confirm,
         resolve(null) на cancel/Escape. Defensive-fallback если Ring недоступен. */
      if (!window.__SSP_RING_MODAL) { resolve({ goalOutcome: 'achieved', goalRetroNote: '' }); return; }
      var result = null;   /* null = отмена/escape; объект = подтверждение */
      var h = openModal({
        id: 'confirmGoal',
        type: 'form',
        title: T('dialogConfirmGoalTitle'),
        body: { kind: 'component', name: 'confirmGoalForm', props: {
          goalText: sprintGoalText || '',
          goalLabel: T('histGoalLabel'),
          goalNotSetText: T('histGoalNotSet'),
          outcomeLabel: T('lblGoalOutcome'),
          options: [
            { value: 'achieved', label: T('optGoalAchieved') || '✅ Достигнута' },
            { value: 'partial',  label: T('optGoalPartial')  || '⚖ Частично' },
            { value: 'missed',   label: T('optGoalMissed')   || '❌ Не достигнута' },
          ],
          existingOutcome: existingOutcome || '',
          retroLabel: T('lblGoalRetroNote'),
          retroPlaceholder: T('phGoalRetroNote'),
          cancelText: T('btnCancelGoal'),
          confirmText: T('btnConfirmGoal'),
          onConfirm: function(vals){ result = vals; h.close(); },
          onCancel: function(){ result = null; h.close(); },
        }},
        buttons: [],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: false,
        onClose: function(){ resolve(result); },   /* единственная точка resolve (foundation-guarded) */
      });
    });
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
  function doNewSprint(rk) {
    var draftName = T('newSprintDraftName');
    var isActiveDraft = _sprint &&
      _sprint.status === STATUS.PLANNING &&
      (!_sprint.name || _sprint.name === draftName);

    if (isActiveDraft) {
      // Переиспользуем тот же sprintId, обнуляем поля черновика.
      _sprint.name = draftName;
      _sprint.dateStart = null;
      _sprint.dateEnd = null;
      ALL_ROLES.forEach(function(r) { _sprint[r.resKey] = 0; });
    } else {
      _sprint = {
        sprintId: uid(),
        name: draftName,
        dateStart: null, dateEnd: null,
        status: STATUS.PLANNING
      };
      ALL_ROLES.forEach(function(r) { _sprint[r.resKey] = 0; });
    }
    _roleItems = {};
    var editBanner = document.getElementById('editHistBanner');
    if (editBanner) { editBanner.style.display = 'none'; editBanner.textContent = ''; }

    /* v1.8.1 — синхронизируем _currentSprintId на свежесозданный спринт, иначе
       селектор «Текущий спринт» в шапке виджета остаётся на предыдущем редактируемом. */
    if (_sprint && _sprint.sprintId) {
      _currentSprintId = _sprint.sprintId;
      var _uiNS = _draftGet('ui') || {}; _uiNS.currentSprintId = _currentSprintId; _draftSet('ui', _uiNS);
    }

    /* Переключаемся на Планирование → Роли (с любой вкладки). */
    var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
    if (planBtn && !planBtn.classList.contains('active')) planBtn.click();
    var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
    if (rolesBtn) rolesBtn.click();

    var postData = { sprint: _sprint, roleItems: _roleItems };
    apiPost('sprint-data', postData).then(function() {
      getActiveRoles().forEach(function(r) {
        renderRolePlannerHeader(r.key);
        renderRoleComposition(r.key);
        updateRoleRemaining(r.key);
      });
      if (typeof renderWidgetHeader === 'function') {
        try { renderWidgetHeader(); } catch(_){}
      }
      toast(T('toastSprintCreated'), 'success');
      /* Фокус на поле названия — пользователь сразу видит, что нужно ввести. */
      setTimeout(function() {
        var nameEl = document.getElementById('sprintName');
        if (nameEl) { try { nameEl.focus(); nameEl.select(); } catch(_){} }
      }, 50);
    });
  }

  /* ── v1.8.0 D130 — Etap В.2 — External ticket ID cell renderer (module-level).
     Used in role composition, assignee view, and history tables.
     - empty/undefined → muted '—'
     - http(s) URL     → clickable <a> (target=_blank, rel=noopener)
     - plain string    → truncated text with full value in title tooltip
     esc() is mandatory on every path — this is a user-controlled string from a YT custom field. */
  /* v2.1.0 E4 — inner-only variant for Ring Table cell (without <td> wrapper). */
  function _renderExternalTicketInnerHtml(val) {
    if (!val) return '<span style="color:var(--muted)">—</span>';
    var safe = esc(String(val));
    var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
    if (/^https?:\/\//i.test(val)) {
      return '<span '+style+' title="'+safe+'"><a href="'+safeUrl(val)+'" target="_blank" rel="noopener noreferrer" class="link">'+safe+'</a></span>';
    }
    return '<span '+style+' title="'+safe+'">'+safe+'</span>';
  }

  /* ── Таблица состава для роли ── */
  function getRoleItemsArr(rk) {
    if (!_roleItems[rk]) _roleItems[rk] = [];
    return _roleItems[rk];
  }

  /* v2.1.0 E4 — Hybrid controlled-mode Ring Table for renderRoleComposition.
     Ring renders 8-13 dynamic cols (base + optional externalTicketId / system
     / xpriority). IIFE owns sort state (getSortKey / multiKeySort) and all
     edit handlers. Cell renderers return { __html } for native HTML; per-row
     delete buttons and dyn-enum cells wired via DOM Level 0 .onclick after
     each Ring re-render (MutationObserver — lesson #27).
     Sort: Ring header click → onSort callback → setSortKey → _rerenderAllSortableTables.
     Pagination: external #planPag_<rk> div (sibling of host), unchanged. */
  function renderRoleComposition(rk) {
    var host = document.getElementById('compHost_'+rk);
    if (!host) { diag('renderRoleComposition('+rk+'): host NOT FOUND','err'); return; }
    /* #25 Ф2 fix — в «историческом виде» (выбран не активный _sprint, без рабочей копии)
       состав читаем из снапшота истории (read-only display), а не из _roleItems активного
       спринта. Иначе шапка показывала счёт снапшота (computeRoleQuickStats), а таблица —
       пустой _roleItems → «Состав спринта пуст». Архитектура не меняется: редактирование
       не-активного спринта по-прежнему только через рабочую копию (read-only снимается там).
       .slice() — чтобы не мутировать _history (items._page ставится ниже). */
    var isHistoricalView = _currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId;
    var items;
    if (isHistoricalView) {
      var _hsnap = (Array.isArray(_history) ? _history : []).find(function(h){
        return h && h.sprintId === _currentSprintId + '_' + rk;
      });
      items = (_hsnap && Array.isArray(_hsnap.items)) ? _hsnap.items.slice() : [];
    } else {
      items = getRoleItemsArr(rk);
    }
    var has = items.length > 0;
    diag('renderRoleComposition('+rk+'): items.length='+items.length+' host=yes has='+has, 'info');
    var clearBtn  = document.getElementById('clearBtn_'+rk);
    var recalcBtn = document.getElementById('recalcBtn_'+rk);
    var refreshBtn = document.getElementById('refreshBtn_'+rk);
    if (clearBtn)  clearBtn.disabled  = !has;
    if (recalcBtn) recalcBtn.disabled = !has;
    if (refreshBtn) refreshBtn.disabled = !has;

    if (!has) {
      if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch(_){} }
      /* #43 W2 (B-2/D-1) — структурный empty-state; CTA проксирует клик на
         тулбарный pickBtn_<rk> (единая точка входа подбора задач). */
      host.innerHTML = '<div class="ssp-empty">' +
        '<div class="ssp-empty__icon" data-icon="task" aria-hidden="true"></div>' +
        '<div class="ssp-empty__title">' + esc(T('compEmptyTitle')) + '</div>' +
        '<div class="ssp-empty__desc">' + esc(T('compEmptyDesc')) + '</div>' +
        '<button type="button" class="ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText editor-btn ssp-empty__cta">' + esc(T('btnPickTasks')) + '</button>' +
        '</div>';
      applyIcons();
      var emptyCtaEl = host.querySelector('.ssp-empty__cta');
      if (emptyCtaEl) emptyCtaEl.addEventListener('click', function() {
        var pb = document.getElementById('pickBtn_' + rk);
        if (pb) pb.click();
      });
      var pagElEmpty = document.getElementById('planPag_'+rk);
      if (pagElEmpty) pagElEmpty.style.display = 'none';
      return;
    }

    var pageNum = items._page || 1;
    var total = Math.ceil(items.length / PAGE_SIZE);
    pageNum = Math.min(pageNum, total);
    items._page = pageNum;
    /* v6.1.0 D81 (F4) — multi-key sort применяется поверх items до пагинации.
       Если sort выключен — порядок storage. Сортировка не мутирует _roleItems[rk]. */
    var sortedItems = (typeof multiKeySort === 'function') ? multiKeySort(items) : items;
    var start = (pageNum - 1) * PAGE_SIZE;
    var page  = sortedItems.slice(start, start + PAGE_SIZE);
    var dynEdit = _settings && _settings.dynEditEnabled;

    function fmtDelta(val) {
      if (val === null || val === undefined) return '<span style="color:var(--muted)">—</span>';
      var s = fmtHoursOnly(Math.abs(val));
      if (val < 0) return '<span class="delta-neg">−'+s+'</span>';
      return s;
    }

    /* v5.0.3 — серверный snapshot для сравнения и подсветки dirty rows.
       Ring Table per-row className via column.className isn't per-cell; we
       wrap each cell in a span carrying tr--dirty-row class for visual.
       Lock+dirty visual semantics moved to td-level span wrappers. */
    var snapItems = (_serverSnapshotRoleItems && _serverSnapshotRoleItems[rk]) || [];
    var snapByIssue = {};
    snapItems.forEach(function(it){ if (it && it.issueId) snapByIssue[it.issueId] = it; });
    /* v5.2.0 — после ALLOCATED таблица read-only. Для перехода в edit-режим
       пользователь жмёт «Открыть на правку» в истории (текущая логика сбрасывает
       статус в PLANNING → lock автоматически снимается). Полная working-copy логика — v5.3.0. */
    var isLocked = !!(_sprint && _sprint.status === STATUS.ALLOCATED);
    var roAttr = isLocked ? ' readonly="readonly" tabindex="-1"' : '';
    var dynStyle = 'cursor:pointer;text-decoration:underline dotted;color:var(--primary)';

    /* Pre-compute per-item derived data so cell renderers stay cheap. */
    var pageData = page.map(function(item) {
      var est  = item['estimate_'+rk];
      var fact = item['fact_'+rk];
      var delta = (est !== null && est !== undefined)
        ? ((fact !== null && fact !== undefined) ? ((est||0) - (fact||0)) : (est||0))
        : null;
      var alloc = item['alloc_'+rk];
      var allocDefault = (delta !== null && delta !== undefined) ? Math.max(0, delta) : null;
      var allocVal = (alloc !== null && alloc !== undefined) ? alloc : allocDefault;
      var allocDisplay = allocVal !== null && allocVal !== undefined ? fmtPeriod(allocVal) : '';
      var snap = snapByIssue[item.issueId];
      var isDirty = !snap || JSON.stringify({a:item['alloc_'+rk], i:item.inclusionStatus, e:item['estimate_'+rk], f:item['fact_'+rk]})
                          !== JSON.stringify({a:snap['alloc_'+rk], i:snap.inclusionStatus, e:snap['estimate_'+rk], f:snap['fact_'+rk]});
      return {
        item: item, est: est, fact: fact, delta: delta,
        allocDisplay: allocDisplay, isDirty: isDirty, iid: item.issueId,
      };
    });

    var columns = [];
    columns.push({
      id: 'id', title: T('thId'), sortable: true, className: 'td-id',
      getValue: function(row) {
        return { __html: '<a href="'+safeUrl(row.item.url)+'" target="_blank" class="link">'+esc(row.iid)+'</a>' };
      }
    });
    if (_settings && _settings.fieldExternalTicketId) {
      columns.push({
        id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true,
        getValue: function(row) { return { __html: _renderExternalTicketInnerHtml(row.item.externalTicketId) }; }
      });
    }
    if (_settings && _settings.fieldSystem) {
      columns.push({
        id: 'system', title: T('thSystem'), sortable: false,
        getValue: function(row) {
          if (dynEdit) {
            return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldSystem" style="'+dynStyle+'">'+esc(row.item.system||'—')+'</span>' };
          }
          return esc(row.item.system||'—');
        }
      });
    }
    columns.push({
      id: 'priority', title: T('thPriority'), sortable: true,
      getValue: function(row) {
        if (dynEdit && _settings && _settings.fieldPriority) {
          return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldPriority" style="'+dynStyle+'">'+esc(dispEnum(row.item.priority)||'—')+'</span>' };
        }
        return esc(dispEnum(row.item.priority)||'—');
      }
    });
    if (_settings && _settings.fieldXPriority) {
      columns.push({
        id: 'xpriority', title: T('thXpriority'), sortable: true,
        getValue: function(row) {
          if (dynEdit) {
            return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldXPriority" style="'+dynStyle+'">'+esc(dispEnum(row.item.xpriority)||'—')+'</span>' };
          }
          return esc(dispEnum(row.item.xpriority)||'—');
        }
      });
    }
    columns.push({
      id: 'state', title: T('thState'), sortable: false,
      getValue: function(row) {
        if (dynEdit && _settings && _settings.fieldState) {
          return { __html: '<span class="dyn-enum-cell" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" data-field="fieldState" style="'+dynStyle+'">'+esc(dispEnum(row.item.state)||'—')+'</span>' };
        }
        return esc(dispEnum(row.item.state)||'—');
      }
    });
    columns.push({
      id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title',
      getValue: function(row) { return esc(row.item.title||''); }
    });
    if (dynEdit) {
      columns.push({
        id: 'estimate', title: T('thEstimate'), sortable: false, className: 'td-num',
        getValue: function(row) {
          var estDisplay = row.est !== null && row.est !== undefined ? fmtPeriod(row.est) : '';
          /* v2.1.0 E4 — explicit background/color overrides: Ring Table cells
             have their own background and native inputs inherit it (looking
             black in dark theme). Force surface/text vars on inputs. */
          return { __html: '<input type="text" class="dyn-period-input" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" value="'+esc(estDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
        }
      });
      columns.push({
        id: 'fact', title: T('thFact'), sortable: false, className: 'td-num',
        getValue: function(row) {
          return { __html: row.fact !== null && row.fact !== undefined ? fmtHoursOnly(row.fact) : '<span style="color:var(--muted)">—</span>' };
        }
      });
      columns.push({
        id: 'resource', title: T('thResource'), sortable: false, className: 'td-num',
        getValue: function(row) { return { __html: fmtDelta(row.delta) }; }
      });
    } else {
      columns.push({
        id: 'resource', title: fmtThLabel(roleLabel(ALL_ROLES.find(function(r){return r.key===rk;}) || {key:rk,labelKey:rk})), sortable: false, className: 'td-num',
        getValue: function(row) { return { __html: fmtDelta(row.delta) }; }
      });
    }
    columns.push({
      id: 'allocation', title: T('thAllocation'), sortable: false, className: 'td-num',
      getValue: function(row) {
        return { __html: '<input type="text" class="alloc-input" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" value="'+esc(row.allocDisplay)+'" placeholder="'+esc(T('phHours'))+'" style="min-width:70px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 6px"'+roAttr+'/>' };
      }
    });
    columns.push({
      id: 'incStatus', title: T('thIncStatus'), sortable: false,
      getValue: function(row) {
        var html = '<select class="inc-sel" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'">'+
          Object.values(INC).map(function(v){return '<option value="'+v+'"'+(row.item.inclusionStatus===v?' selected':'')+'>'+esc(incLabel(v))+'</option>';}).join('')+
          '</select>';
        return { __html: html };
      }
    });
    columns.push({
      id: 'delete', title: '', sortable: false, className: 'ssp-col-action',
      getValue: function(row) {
        return { __html: '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly del-item-btn" data-iid="'+esc(row.iid)+'" data-rk="'+rk+'" title="'+esc(T('btnDeleteTitle'))+'" aria-label="'+esc(T('aria.btnDeleteRow'))+'">'+icon('trash',T('aria.btnDeleteRow')).outerHTML+'</button>' };
      }
    });

    if (window.__SSP_TABLE) {
      window.__SSP_TABLE.mountAt(host, {
        items: pageData,
        columns: columns,
        sortKey: (typeof getSortKey === 'function') ? getSortKey() : 'off',
        onSort: function(nextKey) {
          if (typeof setSortKey === 'function') setSortKey(nextKey);
          if (typeof _rerenderAllSortableTables === 'function') _rerenderAllSortableTables();
          else renderRoleComposition(rk);
        },
        getItemKey: function(row) { return row.iid; },
        stickyHeader: true,
        emptyText: T('compSprintEmpty'),
      });
    }

    /* v1.6.2 D127 — стабильный lookup по issueId; индекс в _roleItems[rk] не совпадает
       с позицией в DOM-таблице, когда применена сортировка через multiKeySort. */
    function _findIdxByIid(rkx, iidx) {
      var arr = getRoleItemsArr(rkx);
      for (var __i = 0; __i < arr.length; __i++) {
        if (arr[__i] && arr[__i].issueId === iidx) return __i;
      }
      return -1;
    }

    // Навесить события
    /* Event delegation on host (idempotent). Ring Table does not intercept
       change / focusout events — only clicks. Inputs/selects work via host
       delegation; delete buttons + dyn-enum spans use direct DOM Level 0
       .onclick via MutationObserver rebind (lesson #27). focusout bubbles
       (unlike blur) and gives us the same semantics as legacy blur handlers. */
    if (!host.__sspCompHandlersBound) {
      host.__sspCompHandlersBound = true;

      host.addEventListener('change', function(ev) {
        var t = ev.target;
        if (!t || !t.matches || !t.matches('select.inc-sel[data-iid]')) return;
        var rk2 = t.dataset.rk;
        var iid = t.dataset.iid;
        var idx = _findIdxByIid(rk2, iid);
        if (idx < 0) { diag('inc-sel change: item iid='+iid+' not found in role '+rk2,'warn'); return; }
        getRoleItemsArr(rk2)[idx].inclusionStatus = t.value;
        updateRoleRemaining(rk2);
        _markDirty('roleItems');
        _draftSaveDebounced('roleItems', function(){ return _roleItems; });
        apiPost('sprint-data', { roleItems: _roleItems });
      });

      host.addEventListener('focusout', function(ev) {
        var t = ev.target;
        if (!t || !t.matches) return;
        if (t.readOnly) return;
        /* Аллокация: blur-обработчик (оба режима) */
        if (t.matches('input.alloc-input[data-iid]')) {
          var rk2  = t.dataset.rk;
          var iid  = t.dataset.iid;
          var idx  = _findIdxByIid(rk2, iid);
          if (idx < 0) { diag('alloc-input focusout: item iid='+iid+' not found in role '+rk2,'warn'); return; }
          var item = getRoleItemsArr(rk2)[idx];
          if (!item) return;
          var newVal = parsePeriod(t.value);
          var oldVal = item['alloc_'+rk2];
          if (t.value.trim() === '') newVal = null;
          if (newVal === oldVal) return;
          item['alloc_'+rk2] = newVal;
          if (newVal === null) {
            var est  = item['estimate_'+rk2];
            var fact = item['fact_'+rk2];
            var delta = (est !== null && est !== undefined)
              ? Math.max(0, (est||0)-(fact||0))
              : null;
            t.value = delta !== null ? fmtPeriod(delta) : '';
          } else {
            t.value = fmtPeriod(newVal);
          }
          updateRoleRemaining(rk2);
          _markDirty('roleItems');
          _draftSaveDebounced('roleItems', function(){ return _roleItems; });
          apiPost('sprint-data', { roleItems: _roleItems });
          return;
        }
        /* dynEdit: оценка-period blur */
        if (t.matches('input.dyn-period-input[data-iid]')) {
          var rk3 = t.dataset.rk;
          var iid3 = t.dataset.iid;
          var idx3 = _findIdxByIid(rk3, iid3);
          if (idx3 < 0) { diag('dyn-period-input focusout: item iid='+iid3+' not found in role '+rk3,'warn'); return; }
          var newVal3 = parsePeriod(t.value);
          var item3 = getRoleItemsArr(rk3)[idx3];
          var oldVal3 = item3['estimate_'+rk3];
          if (newVal3 === oldVal3) return;
          var inpEl = t;
          showDynFieldConfirm(
            T('dynModalTitle'),
            T('dynConfirmEst') + ' ' + item3.issueId + ' ' + T('dynConfirmEstTo') + fmtPeriod(newVal3) + '»?',
            null, null,
            function(confirmed) {
              if (confirmed) {
                item3['estimate_'+rk3] = newVal3;
                updateIssueField(item3.issueId, _settings[ALL_ROLES.find(function(r){return r.key===rk3;}).fieldEst], newVal3, 'period');
                updateRoleRemaining(rk3);
                renderRoleComposition(rk3);
                apiPost('sprint-data', { roleItems: _roleItems }).then(function(){ renderRoleComposition(rk3); });
              } else {
                inpEl.value = oldVal3 !== null && oldVal3 !== undefined ? fmtPeriod(oldVal3) : '';
              }
            }
          );
          return;
        }
      });
    }

    /* v2.1.14 — Ring Table на mousedown по содержимому ячейки делает focus/re-render
       строки → кнопка пересоздаётся между mousedown и mouseup → браузер НЕ генерирует
       `click` на первом клике (mousedown/mouseup на разных DOM-элементах; доказано
       инструментально: mousedown✅ mouseup✅ click❌). Старый per-button .onclick и
       click-делегация срабатывали только со 2-го клика (pre-existing класс, как B11).
       Fix: слушаем MOUSEDOWN (приходит всегда, первым) в CAPTURE — данные уже доступны
       (data-iid/rk), действие выполняется сразу. preventDefault гасит Ring row-focus,
       stopPropagation — Ring синтетику. Делегация переживает re-render.
       Инпуты/селекты (alloc-input/inc-sel) НЕ трогаем — им нужен нативный фокус/change.
       Только левая кнопка (ev.button===0). */
    if (!host.__sspCompCaptureBound) {
      host.__sspCompCaptureBound = true;
      host.addEventListener('mousedown', function(ev) {
        if (ev.button !== 0) return;
        var tgt = ev.target;
        if (!tgt || typeof tgt.closest !== 'function') return;

        var delBtn = tgt.closest('button.del-item-btn[data-iid]');
        if (delBtn && host.contains(delBtn)) {
          ev.preventDefault(); ev.stopPropagation();
          var rk2 = delBtn.dataset.rk, iid = delBtn.dataset.iid;
          var idx = _findIdxByIid(rk2, iid);
          if (idx < 0) { diag('del-item-btn click: item iid='+iid+' not found in role '+rk2,'warn'); return; }
          getRoleItemsArr(rk2).splice(idx, 1);
          renderRoleComposition(rk2);
          updateRoleRemaining(rk2);
          _markDirty('roleItems');
          _draftSaveDebounced('roleItems', function(){ return _roleItems; });
          apiPost('sprint-data', { roleItems: _roleItems });
          return;
        }

        var cell = tgt.closest('span.dyn-enum-cell[data-iid]');
        if (cell && host.contains(cell)) {
          ev.preventDefault(); ev.stopPropagation();
          var rkc = cell.dataset.rk, iidc = cell.dataset.iid;
          var idxc = _findIdxByIid(rkc, iidc);
          if (idxc < 0) { diag('dyn-enum-cell click: item iid='+iidc+' not found in role '+rkc,'warn'); return; }
          var dataField = cell.dataset.field;
          var item     = getRoleItemsArr(rkc)[idxc];
          var fieldName = _settings && _settings[dataField];
          if (!fieldName) return;
          var fieldTitleMap = { fieldState: T('dynFieldState'), fieldPriority: T('dynFieldPriority'), fieldXPriority: T('dynFieldXpriority'), fieldSystem: T('dynFieldSystem') };
          var itemKeyMap  = { fieldState: 'state', fieldPriority: 'priority', fieldXPriority: 'xpriority', fieldSystem: 'system' };
          var fieldTitle  = fieldTitleMap[dataField] || dataField;
          var itemKey     = itemKeyMap[dataField] || dataField;
          var curVal      = item[itemKey];
          loadEnumBundle(fieldName, function(values) {
            showDynFieldConfirm(
              T('dynModalTitle') + ' «' + fieldTitle + '»',
              T('dynIssuePrefix') + item.issueId,
              values, curVal,
              function(confirmed, newVal) {
                if (confirmed && newVal !== null) {
                  item[itemKey] = newVal;
                  cell.textContent = localizeEnumVal(newVal) || newVal;
                  updateIssueField(item.issueId, fieldName, newVal, 'enum');
                  apiPost('sprint-data', { roleItems: _roleItems }).then(function(){ renderRoleComposition(rkc); });
                }
              }
            );
          });
          return;
        }
      }, true);
    }

    // Пагинация
    var pagEl = document.getElementById('planPag_'+rk);
    if (pagEl) {
      if (total > 1) {
        pagEl.style.display = 'flex';
        var infoEl = document.getElementById('planPageInfo_'+rk);
        if (infoEl) infoEl.textContent = T('pageOf') + pageNum + T('pageOfSep') + total;
        var prevEl = document.getElementById('planPrev_'+rk);
        var nextEl = document.getElementById('planNext_'+rk);
        if (prevEl) prevEl.disabled = pageNum <= 1;
        if (nextEl) nextEl.disabled = pageNum >= total;
      } else {
        pagEl.style.display = 'none';
      }
    }
    _updateRoleAccordionStats(rk);
  }

  /* ── Динамическое модальное окно ──
     Phase 3 #32 — мигрировано на openModal() (bespoke dynFieldForm, настоящий React).
     Контракт сохранён: callback(true, val) / callback(false, null). Для enum val = выбранное
     значение; для текстового ввода val = parsePeriod(ввод) (как в legacy). form-тип:
     backdrop ✅ / escape ✅ / close-X ✅; Escape/backdrop = отмена (callback(false,null)). */
  function showDynFieldConfirm(title, desc, enumValues, currentVal, callback) {
    var cb = callback || function(){};
    var isEnum = !!enumValues;
    var done = false;
    var h = openModal({
      id: 'dynField',
      type: 'form',
      title: title,
      body: { kind: 'component', name: 'dynFieldForm', props: {
        desc: desc,
        mode: isEnum ? 'enum' : 'text',
        options: isEnum ? enumValues.map(function(v){ return { value: v, label: localizeEnumVal(v) || v }; }) : [],
        initialValue: isEnum ? (currentVal || (enumValues[0] || '')) : (currentVal ? fmtPeriod(currentVal) : ''),
        placeholder: T('phPeriod'),
        applyText: T('btnYesUpdate'),
        cancelText: T('btnNo'),
        onApply: function(raw){
          done = true; h.close();
          cb(true, isEnum ? raw : parsePeriod(raw));
        },
        onCancel: function(){ done = true; h.close(); cb(false, null); },
      }},
      buttons: [],
      dismissOnBackdrop: true,
      blockEscape: false,
      showCloseButton: true,
      onClose: function(){ if (!done) cb(false, null); },
    });
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

  /* ── Обновить оценки из YouTrack для роли ── */
  function refreshRoleEstimates(rk) {
    var items = getRoleItemsArr(rk);
    if (!items.length) return;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return;
    var btn = document.getElementById('refreshBtn_'+rk);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> '+T('btnRefreshLoading'); }
    var p = Promise.resolve();
    items.forEach(function(item) {
      p = p.then(function() {
        return _host.fetchYouTrack('issues/' + item.issueId, {
          query: { fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,color(id,background,foreground),minutes,login))' }
        }).then(function(issue) {
          if (!issue) return;
          var cfs = issue.customFields || [];
          function findCf(fname) {
            return cfs.find(function(cf){
              var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
              return fn === fname;
            });
          }
          function getMin(fname) {
            var f = findCf(fname);
            return (f && f.value && f.value.minutes !== undefined) ? f.value.minutes : null;
          }
          function getStr(fname) {
            var f = findCf(fname);
            if (!f || f.value === null || f.value === undefined) return '';
            var v = f.value;
            if (typeof v === 'string') return v;
            return v.localizedName || v.presentation || v.name || '';
          }
          if (_settings && _settings[role.fieldEst])  item['estimate_'+rk] = getMin(_settings[role.fieldEst]);
          if (_settings && _settings[role.fieldFact]) item['fact_'+rk]     = getMin(_settings[role.fieldFact]);
          if (_settings && _settings.fieldPriority)         item.priority          = getStr(_settings.fieldPriority);
          if (_settings && _settings.fieldXPriority)        item.xpriority         = getStr(_settings.fieldXPriority);
          if (_settings && _settings.fieldState) {
            item.state = getStr(_settings.fieldState);
            var _stCf = findCf(_settings.fieldState);
            var _stV  = _stCf && _stCf.value;
            item.stateLocalized = _stV ? (_stV.localizedName || _stV.presentation || _stV.name || '') : '';
            var _stC  = _stV && _stV.color;
            item.stateColor = (_stC && (_stC.background || _stC.foreground))
              ? { background: _stC.background || null, foreground: _stC.foreground || null }
              : null;
            item.stateFieldId = (_stCf && _stCf.projectCustomField && _stCf.projectCustomField.field && _stCf.projectCustomField.field.id) || null;
          }
          if (_settings && _settings.fieldSystem)           item.system            = getStr(_settings.fieldSystem);
          /* v1.8.0 D130 — Etap В.2 — populate externalTicketId from YT string field. */
          if (_settings && _settings.fieldExternalTicketId) item.externalTicketId  = getStr(_settings.fieldExternalTicketId);
          if (!item.url || item.url.indexOf('/null/') >= 0) {
            item.url = _ytBase + '/issue/' + (issue.idReadable || item.issueId);
          }
          if (!item.title || item.title === item.issueId) {
            item.title = issue.summary || item.issueId;
          }
        }).catch(function(){});
      });
    });
    p.then(function(){ return apiPost('sprint-data', { roleItems: _roleItems }); })
     .then(function(){
       renderRoleComposition(rk);
       updateRoleRemaining(rk);
       toast(T('toastEstUpdated'), 'success');
     })
     .finally(function(){
       if (btn) { btn.disabled = items.length === 0; btn.textContent = T('btnRefreshFromTask'); } /* S6 #35 — единый label */
     });
  }

  /* ── Валидация роли ── */
  function doValidateRole(rk) {
    if (!_settings) { toast(T('toastFillSettings')); return Promise.resolve(); }
    if (!_sprint || !_sprint.dateStart || !_sprint.dateEnd) { toast(T('toastFillDates')); return Promise.resolve(); }
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role) return Promise.resolve();
    if (!(_sprint[role.resKey] > 0)) { toast(T('toastFillResource')); return Promise.resolve(); }
    var active = getRoleItemsArr(rk).filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    if (!active.length) { toast(T('toastNoActiveTasks')); return Promise.resolve(); }

    var btn = document.getElementById('validateBtn_'+rk);
    return withLoader(btn, function() {
      return checkValidatorNow().then(function(ok) {
        _isValidator = ok;
        if (!ok) { toast(T('toastNoValidRights')); return; }
        _sprint.status = STATUS.CONFIRMED;
        diag('[VALIDATE-COMPOSITION] role='+rk+' set _sprint.status='+_sprint.status+' wcKey='+_activeWorkingDraftKey, 'info');
        // v5.0 — отправляем с ?action=validate + полный sprint+roleItems,
        // чтобы сервер мог посчитать overlimit и вернуть warnings.
        return apiPost('sprint-data', { sprint: _sprint, roleItems: _roleItems }, { action: 'validate' })
          .then(function(resp) {
            // Server-side warn: показываем все полученные warnings (например, overlimit:devPlatform)
            if (resp && Array.isArray(resp.warnings) && resp.warnings.length) {
              resp.warnings.forEach(function(w) {
                if (typeof w === 'string' && w.indexOf('overlimit:') === 0) {
                  var rkw = w.split(':')[1] || '';
                  var roleW = ALL_ROLES.find(function(r){ return r.key === rkw; });
                  var label = roleW ? (roleW.label) : rkw;
                  toast(T('overlimitWarnSrv').replace('{role}', label), 'err');
                }
              });
            }
            /* v1.9.3 D134 — Etap О.1: передаём wasValidated=true чтобы snapshot
               получил CONFIRMED. Все остальные call-sites saveRoleHistorySnapshot
               (refresh, working-copy commit, manual save) — без флага → per-role
               preserve existing status или PLANNING для нового snap. */
            return saveRoleHistorySnapshot(rk, undefined, undefined, /* wasValidated */ true);
          }).then(function() {
            /* Диаг после snapshot: что в _history для этой роли? */
            var _diagSnap = _history.find(function(h){ return h && h.sprintId === _sprint.sprintId + '_' + rk; });
            diag('[VALIDATE-COMPOSITION] role='+rk+' after snap: _history.status='+(_diagSnap?_diagSnap.status:'NOT_FOUND')+' _sprint.status='+_sprint.status, 'info');
            /* v5.3.0: working copy commit очищает _activeWorkingDraftKey внутри _commitWorkingCopy.
               Здесь — общая очистка legacy-полей (на случай миграции из v5.2.0). */
            if (_sprint) {
              _sprint.editingFromHistory = false;
              delete _sprint.historyIdx;
            }
            _activeWorkingDraftKey = null;
            if (typeof hideWorkingCopyBanner === 'function') hideWorkingCopyBanner();
            var editBanner = document.getElementById('editHistBanner');
            if (editBanner) { editBanner.style.display = 'none'; editBanner.textContent = ''; }
            renderRoleStatusBadge(rk);
            if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
            var ss = document.getElementById('sprintStatus_'+rk);
            if (ss) ss.style.display = 'none';
            var newBtn = document.getElementById('newSprintBtn_'+rk);
            if (newBtn) newBtn.style.display = '';
            toast(T('toastSprintConfirmed').replace('{role}', roleLabel(role)), 'success');
          }).catch(function(e) {
            toast(T('toastSaveError')+': '+(e&&e.message?e.message:String(e)), 'error');
          });
      }).catch(function() {
        toast(T('toastCheckError'));
      });
    });
  }

  function saveRoleHistorySnapshot(rk, overrideIdx, goalFields, wasValidated) {
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    if (!role || !_sprint) return Promise.resolve();
    var items = getRoleItemsArr(rk);
    var activeItems = items.filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    var rem = calcRemForRole(rk);
    var isOverLimit = rem < 0;

    /* v1.9.3 D134 — Etap О.1 fix: per-role status в snapshot, не глобальный _sprint.status.
       До v1.9.3 snapshot ЛЮБОЙ роли получал status = _sprint.status. После
       doValidateRole(rk1) → _sprint.status = CONFIRMED, и при ближайшем save другой
       роли rk2 (refresh / save header / commit working copy / etc.) её snapshot
       получал status = CONFIRMED — хотя rk2 не валидировалась. Контаминация была
       визуально скрыта v1.8.1 фиксом renderRoleStatusBadge (читает per-role из
       _history), но снимок в _history оставался поражённым → History spoiler и
       Excel export показывали неверный статус.

       Cherry-pick из proprietary v7.3.1 Этап О.1: добавлен параметр wasValidated
       (true только при вызове из doValidateRole), статус резолвится per-role:
         - wasValidated=true → CONFIRMED (single source of truth для validate)
         - иначе → existing snap.status из _history (preserve) ИЛИ PLANNING для нового
       Архитектурно правильное решение (deep refactor на _sprint.statusByRole[rk])
       отложено; quick fix через explicit param достаточен для всех known call-sites. */
    var resolvedStatus;
    if (wasValidated === true) {
      resolvedStatus = STATUS.CONFIRMED;
    } else {
      var existingSnap = _history.find(function(s){ return s && s.sprintId === (_sprint.sprintId + '_' + rk); });
      resolvedStatus = (existingSnap && existingSnap.status) ? existingSnap.status : STATUS.PLANNING;
    }
    var snap = {
      sprintId:     _sprint.sprintId + '_' + rk,
      roleKey:      rk,
      roleLabel:    role.label,
      dateStart:    _sprint.dateStart,
      dateEnd:      _sprint.dateEnd,
      name:         _sprint.name || null,
      status:       resolvedStatus,
      confirmedAt:  Date.now(),
      confirmedBy:  _currentUser ? (_currentUser.fullName || _currentUser.login) : null,
      isOverLimit:  isOverLimit,
      settings:     _settings,
      sprintFieldVal:   _sprint.sprintFieldVal || null,
      versionFieldVal:  _sprint.versionFieldVal || null,
    };
    snap[role.resKey] = _sprint[role.resKey] || 0;
    snap[role.remKey] = rem;
    snap.items = items.map(function(i) {
      var obj = {
        issueId:  i.issueId,
        url:      i.url,
        title:    i.title,
        priority: i.priority,
        xpriority:i.xpriority,
        state:    i.state,
        system:   i.system,
        inclusionStatus: i.inclusionStatus,
      };
      /* v1.8.0 D130 — Etap В.2 — фиксируем externalTicketId в snapshot.
         Раньше поле не копировалось в snap.items, поэтому история не содержала
         значений нового поля даже когда оно было задано на live item. */
      if (i.externalTicketId !== undefined && i.externalTicketId !== null && i.externalTicketId !== '') {
        obj.externalTicketId = i.externalTicketId;
      }
      obj['estimate_'+rk] = i['estimate_'+rk];
      obj['fact_'+rk]     = i['fact_'+rk];
      obj['alloc_'+rk]    = i['alloc_'+rk] !== undefined ? i['alloc_'+rk] : null;
      return obj;
    });
    // v6.1.0 D69 — сохранять только personalPlanning. Поле `gantt` удалено из snap-whitelist
    // в v5.9.0 (D60); запись `snap.gantt` ломала validateHistory → invalid_history_structure
    // → каскад #4/#6/#7/#10 в v6.0.0 testbench. Источник истины для назначений и дат —
    // personalPlanning[*].taskAssignments[issueId].{assignee,startDate,endDate}.
    var ppToSnap    = (isActiveSprintRecord(_currentSprintRoleRec) && _currentRolePP)
      ? _currentRolePP
      : (_sprint.personalPlanning || null);
    snap.personalPlanning = deepClone(ppToSnap);
    /* v1.9.0 D132 — Freeze sprint goal + inject outcome/retro from confirm dialog. */
    if (_sprint.sprintGoal) snap.sprintGoal = _sprint.sprintGoal;
    if (goalFields) {
      if (goalFields.goalOutcome)  snap.goalOutcome  = goalFields.goalOutcome;
      if (goalFields.goalRetroNote) snap.goalRetroNote = goalFields.goalRetroNote;
    }

    /* v5.3.0 — Если активна working copy на этот ключ — commit-flow с ре-валидацией.
       Иначе — обычный insert/overwrite. Legacy ветка editingFromHistory удалена. */
    var snapKey = snap.sprintId;
    if (overrideIdx === undefined && _activeWorkingDraftKey === snapKey && _workingDrafts[snapKey]) {
      var draft = _workingDrafts[snapKey];
      var commitIdx = _history.findIndex(function(h){ return h.sprintId === snapKey; });
      if (commitIdx >= 0) {
        var baseSnap = _history[commitIdx];
        /* Conflict detection: hash базового снимка изменился? */
        var currentHash = computeBaseSnapshotHash(baseSnap);
        if (draft.baseSnapshotHash && currentHash !== draft.baseSnapshotHash) {
          if (typeof showWorkingCopyConflictModal === 'function') {
            showWorkingCopyConflictModal(snapKey, baseSnap, snap, function(decision){
              if (decision === 'overwrite') {
                _commitWorkingCopy(rk, commitIdx, draft, snap);
              } else if (decision === 'export' && typeof exportConflictToExcel === 'function') {
                /* v5.7.0 — KL#5: один xlsx с двумя листами + diff-маркер. */
                exportConflictToExcel(baseSnap, snap);
              }
              /* 'cancel' → ничего */
            });
            return Promise.resolve();
          }
        }
        return _commitWorkingCopy(rk, commitIdx, draft, snap);
      }
      /* Орфан: working copy без базового снимка — fallback на обычный insert */
      diag('saveRoleHistorySnapshot: working copy without base snap, fallback to insert', 'warn');
    }
    var idx = -1;
    if (overrideIdx !== undefined) {
      idx = overrideIdx;
    } else {
      idx = _history.findIndex(function(h){ return h.sprintId === snap.sprintId; });
    }
    if (idx >= 0) _history[idx] = snap; else _history.unshift(snap);
    return apiPost('history', { history: _history }).then(function() {
      renderHistory();
    });
  }

  /* clearOverlay migrated to openModal() — clearNo/clearYes handlers removed (Phase 1 #32). */

  /* ═══ Подбор задач (Phase 4 #32 — bespoke React pickPicker, см. modal-bodies.jsx) ═══
     openPickModal(rk, role) монтирует Ring-модалку; data-layer (_pickSearch / _pickLoadAll /
     _pickAddSelected) — Promise-колбэки в props. Старые DOM-listener'ы (close/cancel/search/
     keydown/prev/next/addPicked) и UI-функции (renderPickResults/updatePickAllIndicator)
     удалены вместе с #pickOverlay HTML — закрывает гибрид B10/B11. */

  /* v5.0.3 → Phase 4 — построение query + fingerprint; rawQ передаётся из React-компонента
     (DOM-инпут pickQuery удалён вместе с #pickOverlay). */
  function _buildPickQuery(rawQ) {
    var q = (rawQ || '').trim();
    var projectId = _ctx && _ctx.project ? (_ctx.project.shortName || _ctx.project.id) : null;
    var fullQuery = q;
    if (projectId && q.toLowerCase().indexOf('project:') < 0) {
      fullQuery = 'project: ' + projectId + (q ? ' ' + q : '');
    }
    return { fullQuery: fullQuery, fingerprint: fullQuery + '|' + (projectId || '') };
  }

  /* #33 — скоуп поиска. Два независимых канала (не пересекаются, не трогают каретку):
       folders   → контекст подсказок search/assist (значения статусов/полей под проект)
       projectId → префикс выборки issues (через _buildPickQuery)
     Сейчас оба производны от текущего проекта. Фундамент под кросс-проект: позже сюда
     подставляется набор проектов (folders:[p1..pn]) — data-слой не переписывается. */
  function _buildPickScope() {
    var p = (_ctx && _ctx.project) || null;
    return {
      /* $type:'Project' обязателен — search/assist без дискриминатора IssueFolder
         отвечает 500 InstantiationException (проверено live-probe на стенде, #33). */
      folders:   p && p.id ? [{ $type: 'Project', id: p.id }] : [],
      projectId: p ? (p.shortName || p.id) : null
    };
  }

  /* #33 — data-source подсказок для Ring QueryAssist. Мост к нативному YT endpoint
     POST /api/search/assist: на каждый ввод/движение каретки отдаёт подсказки с
     позициями достройки и диапазонами совпадений (автокомплит + подсветка + синтаксис
     YouTrack «из коробки»). Контракт возврата 1:1 с QueryAssistResponse Ring UI.
     folders — отдельным полем тела (скоуп подсказок под проект), query/caret не трогаем.
     Ошибка/недоступность assist → пустые подсказки (поле и список продолжают работать). */
  var ASSIST_FIELDS = '$type,id,suggestions($type,caret,completionStart,completionEnd,' +
                      'matchingStart,matchingEnd,description,group,icon,option,prefix,suffix)';
  function _pickAssist(req) {
    var query = (req && req.query) || '';
    var caret = (req && typeof req.caret === 'number') ? req.caret : query.length;
    var scope = _buildPickScope();
    var body = { query: query, caret: caret, ignoreUnresolvedSetting: true };
    if (scope.folders && scope.folders.length) body.folders = scope.folders;
    return _host.fetchYouTrack('search/assist', {
      method: 'POST',
      query: { fields: ASSIST_FIELDS },
      body: body,
      headers: { 'Content-Type': 'application/json' }
    }).then(function (res) {
      return { query: query, caret: caret, suggestions: (res && res.suggestions) || [] };
    }).catch(function (err) {
      diag('_pickAssist: search/assist failed — ' + (err && err.message ? err.message : err), 'warn');
      return { query: query, caret: caret, suggestions: [] };
    });
  }

  /* v5.0.3 — преобразование сырого issue из YouTrack-API в meta-объект для UI/кэша */
  function _mapIssueMeta(iss) {
    var cfs = iss.customFields || [];
    function cfValPres(names) {
      if (!names || !names.length) return null;
      for (var ni = 0; ni < names.length; ni++) {
        var target = names[ni]; if (!target) continue;
        var f = null;
        for (var ci = 0; ci < cfs.length; ci++) {
          var cf = cfs[ci];
          var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
          if (fn === target) { f = cf; break; }
        }
        if (f && f.value !== null && f.value !== undefined) {
          var v = f.value;
          if (typeof v === 'string') return v;
          if (v && v.localizedName) return v.localizedName;
          if (v && v.presentation)  return v.presentation;
          if (v && v.name)          return v.name;
        }
      }
      return null;
    }
    var stateField    = _settings && _settings.fieldState            || null;
    var priorityField = _settings && _settings.fieldPriority         || null;
    var xpField       = _settings && _settings.fieldXPriority        || null;
    var systemField   = _settings && _settings.fieldSystem           || null;
    /* v1.8.0 D130 — Etap В.2 — external ticket ID field. */
    var extTicketField = _settings && _settings.fieldExternalTicketId || null;
    return {
      id:               iss.id,
      idReadable:       iss.idReadable || iss.id,
      summary:          (iss.summary && iss.summary.trim()) || null,
      state:          { name: cfValPres(stateField ? [stateField, 'State','Состояние'] : ['State','Состояние']) || '—' },
      priority:       cfValPres(priorityField  ? [priorityField,'Priority','Приоритет'] : ['Priority','Приоритет']),
      xpriority:      cfValPres(xpField        ? [xpField,'Сквозной приоритет'] : ['Сквозной приоритет']),
      system:         systemField    ? cfValPres([systemField])    : null,
      externalTicketId: extTicketField ? cfValPres([extTicketField]) : null,
    };
  }

  /* Phase 4 — data-layer для pickPicker: одна страница → {items, hasMore}.
     Поиск НЕ переписан (#33 отдельно): тот же fetchYouTrack + _mapIssueMeta + кэш _pickAllResults.
     isAdded вычисляется здесь (роль знает существующий состав). Ошибка → reject (компонент ловит). */
  function _pickSearch(rawQ, page) {
    var qInfo = _buildPickQuery(rawQ);
    if (qInfo.fingerprint !== _pickQueryFingerprint) {
      _pickAllResults = new Map();
      _pickQueryFingerprint = qInfo.fingerprint;
    }
    var skip = (Math.max(1, page) - 1) * PICK_PAGE;
    return _host.fetchYouTrack('issues', {
      query: {
        fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))',
        query: qInfo.fullQuery,
        $skip: skip,
        $top: PICK_PAGE + 1
      }
    }).then(function(issues) {
      if (!Array.isArray(issues) || !issues.length) return { items: [], hasMore: false };
      var hasMore = issues.length > PICK_PAGE;
      if (hasMore) issues = issues.slice(0, PICK_PAGE);
      var mapped = issues.map(_mapIssueMeta);
      mapped.forEach(function(it){ _pickAllResults.set(it.idReadable, it); });
      var existing = new Set(getRoleItemsArr(_currentPickRole || '').map(function(i){ return i.issueId; }));
      var items = mapped.map(function(it){
        return {
          idReadable: it.idReadable,
          isAdded: existing.has(it.idReadable),
          state: (it.state && it.state.name) ? it.state.name : '—',
          summary: it.summary || it.idReadable || '',
          priority: it.priority || ''
        };
      });
      return { items: items, hasMore: hasMore };
    });
  }

  /* v5.0.3 → Phase 4 — подгрузка ВСЕХ страниц текущего запроса для master «Выбрать все».
     Возвращает addable id'ы (за вычетом уже добавленных в роль) + capped. Тосты loading/
     loaded/limit/err — здесь (компонент держит только busy-флаг). Прерывается на MAX_PICK_TOTAL. */
  function _pickLoadAll(rawQ) {
    var qInfo = _buildPickQuery(rawQ);
    if (qInfo.fingerprint !== _pickQueryFingerprint) {
      _pickAllResults = new Map();
      _pickQueryFingerprint = qInfo.fingerprint;
    }
    toast(T('toastPickAllLoading'), 'info');
    var pageIdx = Math.ceil(_pickAllResults.size / PICK_PAGE) || 0;
    var capped = false;
    function loop() {
      if (_pickAllResults.size >= MAX_PICK_TOTAL) {
        capped = true;
        return Promise.resolve();
      }
      return _host.fetchYouTrack('issues', {
        query: {
          fields: 'id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))',
          query: qInfo.fullQuery,
          $skip: pageIdx * PICK_PAGE,
          $top: PICK_PAGE + 1
        }
      }).then(function(issues){
        if (!Array.isArray(issues) || !issues.length) return;
        var hasMore = issues.length > PICK_PAGE;
        if (hasMore) issues = issues.slice(0, PICK_PAGE);
        issues.map(_mapIssueMeta).forEach(function(it){ _pickAllResults.set(it.idReadable, it); });
        pageIdx++;
        if (hasMore) return loop();
      });
    }
    return loop().then(function(){
      var existing = new Set(getRoleItemsArr(_currentPickRole || '').map(function(i){ return i.issueId; }));
      var ids = [];
      _pickAllResults.forEach(function(_, id){ if (!existing.has(id)) ids.push(id); });
      if (capped) toast(T('toastPickAllLimit').replace('{n}', String(MAX_PICK_TOTAL)), 'warn');
      else        toast(T('toastPickAllLoaded').replace('{n}', String(ids.length)), 'success');
      return { ids: ids, capped: capped };
    }).catch(function(err){
      toast(T('toastPickAllErr') + ': ' + (err && err.message ? err.message : err), 'error');
      throw err;
    });
  }

  /* updatePickAllIndicator + renderPickResults удалены (Phase 4 #32) — tri-state master
     и рендеринг результатов теперь в bespoke React-компоненте pickPicker (derived tri-state,
     нативные чекбоксы на React-стейте). Гибрид dataset-мост/MutationObserver/двойная
     делегация (корень B11) больше не существует. */

  /* renderPickResults удалён (Phase 4 #32) — рендеринг результатов + tri-state master
     теперь в bespoke React-компоненте pickPicker (modal-bodies.jsx). */

  /* Phase 4 — добавление выбранных задач в роль (рефактор бывшего addPickedBtn-листенера).
     selectedIds — массив issueId из компонента; мета берётся из кумулятивного кэша
     _pickAllResults (заполнен _pickSearch/_pickLoadAll). Закрытие модалки — у вызывающего. */
  function _pickAddSelected(rk, selectedIds) {
    if (!rk || !selectedIds || !selectedIds.length) { toast(T('toastPickAtLeastOne')); return; }
    var existing = new Set(getRoleItemsArr(rk).map(function(i){ return i.issueId; }));
    var newIds = selectedIds.filter(function(id){ return !existing.has(id); });
    newIds.forEach(function(issueId) {
      /* мета из кумулятивного кэша всех загруженных страниц */
      var issue = _pickAllResults.get(issueId);
      if (!issue) {
        diag('_pickAddSelected: missing meta for ' + issueId + ' — using stub', 'err');
        toast(T('toastPickPageMetaLost'), 'warn');
        issue = { idReadable: issueId, summary: issueId, priority: '', state: { name: '' }, xpriority: '', system: '' };
      }
      /* v5.0.3 — НЕ кладём sprintId на item: backend whitelist (ALLOWED_ITEM_KEYS) его не
         содержит, validateItem отвергнет item целиком.
         v5.0.3 (5c) — дефолт INC_PLANNED (не PENDING): иначе валидация «нет активных задач». */
      var newItem = {
        issueId:  issueId,
        url:      _ytBase + '/issue/' + issueId,
        title:    issue && issue.summary    ? issue.summary    : issueId,
        priority: issue && issue.priority   ? issue.priority   : '',
        xpriority:issue && issue.xpriority  ? issue.xpriority  : '',
        state:    issue && issue.state      ? issue.state.name : '',
        system:   issue && issue.system     ? issue.system     : '',
        inclusionStatus: INC.PLANNED,
        addedAt: Date.now(),
        addedBy: _currentUser ? _currentUser.login : null,
      };
      /* v1.8.0 D130 — Etap В.2 — externalTicketId если маппинг настроен. */
      if (_settings && _settings.fieldExternalTicketId && issue && issue.externalTicketId) {
        newItem.externalTicketId = issue.externalTicketId;
      }
      newItem['estimate_'+rk] = null;
      newItem['fact_'+rk]     = null;
      newItem['alloc_'+rk]    = null; // null → при рендере = дельта по умолчанию
      getRoleItemsArr(rk).push(newItem);
    });
    var skipped = selectedIds.length - newIds.length;
    _pickAllResults = new Map(); _pickQueryFingerprint = ''; _selectedIds = new Set();
    if (newIds.length) {
      _markDirty('roleItems');
      _draftSet('roleItems', _roleItems);
      _draftSet('meta', { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
    }
    /* v5.0.3 — сохраняем _sprint вместе с roleItems (на свежем проекте sprintId не перегенерится). */
    apiPost('sprint-data', { sprint: _sprint, roleItems: _roleItems }).then(function() {
      renderRoleComposition(rk);
      updateRoleRemaining(rk);
      toast(T('toastPickDone')+': '+newIds.length+(skipped ? ' ('+T('toastDuplicates')+': '+skipped+')' : ''), 'success');
      if (newIds.length) refreshRoleEstimates(rk);
    });
  }

  /* Phase 4 — открытие модалки подбора (bespoke React pickPicker через openModal). */
  function openPickModal(rk, role) {
    _currentPickRole = rk;
    _selectedIds = new Set();
    _pickAllResults = new Map(); _pickQueryFingerprint = ''; _pickAllInFlight = false;
    var h = openModal({
      id: 'pick',
      type: 'selection',
      dialogClass: 'ssp-ring-modal--wide',
      title: T('pickModalTitle') + ' — ' + roleLabel(role),
      body: { kind: 'component', name: 'pickPicker', props: {
        labels: {
          searchText:      T('btnFind'),
          placeholder:     T('phPickQuery'),
          emptyInitial:    T('emptyPickResults'),
          searching:       T('pickSearching'),
          notFound:        T('tasksNotFound'),
          errorPrefix:     T('pickError'),
          thState:         T('thState'),
          thTitle:         T('thTitle'),
          thPriority:      T('thPriority'),
          selectAllTitle:  T('titlePickAll'),
          alreadyInSprint: T('alreadyInSprint'),
          pageOf:          T('pageOf'),
          closeText:       T('btnClose'),
          addText:         T('btnAddPicked'),
        },
        onAssist:  function(req){ return _pickAssist(req); },
        onSearch:  function(q, page){ return _pickSearch(q, page); },
        onLoadAll: function(q){ return _pickLoadAll(q); },
        onAdd:     function(ids){ _pickAddSelected(rk, ids); h.close(); },
        onCancel:  function(){ h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: true,
      blockEscape: false,
      showCloseButton: true,
      onClose: function(){ _pickAllResults = new Map(); _pickQueryFingerprint = ''; _selectedIds = new Set(); },
    });
  }

  /* ═══ ИСТОРИЯ ═══════════════════════════════════════════════ */
  function renderHistory() {
    var container = document.getElementById('historyList');
    if (!_history.length) {
      container.innerHTML = '<div class="empty">'+T('emptyHistory')+'</div>';
      document.getElementById('histPag').style.display = 'none';
      return;
    }
    // Миграция: записи v2.x без roleKey получают первую роль из настроек (или 'analysis')
    _history.forEach(function(rec) {
      if (!rec.roleKey) {
        var fallbackRole = ALL_ROLES.find(function(r){ return r.key === ((_settings && _settings.activeRoles && _settings.activeRoles[0]) || 'analysis'); }) || ALL_ROLES[0];
        rec.roleKey   = rec.roleKey   || fallbackRole.key;
        rec.roleLabel = rec.roleLabel || fallbackRole.label;
      }
    });
    var sorted = _history.slice().sort(function(a,b){ return (b.confirmedAt||0)-(a.confirmedAt||0); });
    var total = Math.ceil(sorted.length / HIST_PAGE);
    _histPage = Math.min(_histPage, total);
    var start = (_histPage - 1) * HIST_PAGE;
    var page  = sorted.slice(start, start + HIST_PAGE);
    /* v2.0.0 D5-D — unmount Ring Radio roots внутри spoiler'ов перед innerHTML replace. */
    if (window.__SSP_RADIO && typeof window.__SSP_RADIO.unmountAllIn === 'function') {
      window.__SSP_RADIO.unmountAllIn(container);
    }
    container.innerHTML = '';
    page.forEach(function(rec, li) { container.appendChild(buildSpoiler(rec, start + li)); });
    var pag = document.getElementById('histPag');
    if (total > 1) {
      pag.style.display = 'flex';
      document.getElementById('histPageInfo').textContent = T('pageOf') + _histPage + T('pageOfSep') + total;
      document.getElementById('histPrev').disabled = _histPage <= 1;
      document.getElementById('histNext').disabled = _histPage >= total;
    } else {
      pag.style.display = 'none';
    }
  }

  function buildSpoiler(rec, idx) {
    var role = ALL_ROLES.find(function(r){ return r.key === rec.roleKey; });
    var wrap = document.createElement('div'); wrap.className = 'spoiler';
    var head = document.createElement('div'); head.className = 'spoiler__head';
    var meta = document.createElement('div'); meta.className = 'spoiler__meta';

    /* v5.0.3 — корректный класс бейджа по статусу записи. Раньше был
       hardcoded "confirmed" с переопределением только на FINISHED/ALLOCATED.
       v5.2.0 — статус PLANNED удалён, legacy-записи мигрируются на PLANNING на read. */
    var badgeClass = 's-badge--planning';
    if (rec.status === STATUS.CONFIRMED) badgeClass = 's-badge--confirmed';
    if (rec.status === STATUS.ALLOCATED) badgeClass = 's-badge--allocated';
    if (rec.isOverLimit) badgeClass = 's-badge--overlimit';
    if (rec.status === STATUS.FINISHED) badgeClass = 's-badge--finished';
    var badgeTitle = (rec.status === STATUS.ALLOCATED) ? T('tooltipStatusAllocated') : '';

    var remKey = role ? role.remKey : 'remainAnalysis';
    var remVal = rec[remKey];

    /* v5.3.0 — pill «Есть рабочая копия» с tooltip владелец/время */
    var wcPill = '';
    if (rec.hasWorkingCopy && _workingDrafts[rec.sprintId]) {
      var d = _workingDrafts[rec.sprintId];
      var pillTitle = T('wcEditedBy')
        .replace('{who}', d.editorLogin || '?')
        .replace('{when}', fmtDT(d.updatedAt));
      wcPill = '<span class="wc-has-copy-pill" title="'+esc(pillTitle)+'">'+esc(T('wcHasCopyPill'))+'</span>';
    }
    /* v1.8.1 — название спринта и роль теперь видны в свёрнутом виде (первые поля).
       Раньше rec.name был только в body (раскрытый вид), что затрудняло идентификацию. */
    var sprintNameInline = rec.name
      ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerName')+'</span><span class="spoiler__mv" style="font-weight:600">'+esc(rec.name)+'</span></div>'
      : '';
    var roleInline = rec.roleLabel
      ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerRole')+'</span><span class="spoiler__mv">'+esc(rec.roleLabel)+'</span></div>'
      : '';
    /* v1.9.0 D132 — Goal outcome badge + truncated goal in collapsed spoiler header. */
    var outcomeInline = '';
    if (rec.goalOutcome) {
      var _outMap = { achieved: T('optGoalAchieved'), partial: T('optGoalPartial'), missed: T('optGoalMissed') };
      outcomeInline = '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histOutcomeLabel')+'</span><span class="spoiler__mv">'+esc(_outMap[rec.goalOutcome]||rec.goalOutcome)+'</span></div>';
    }
    var goalHeadInline = '';
    if (rec.sprintGoal) {
      var _truncGoal = rec.sprintGoal.length > 80 ? rec.sprintGoal.substring(0,77)+'…' : rec.sprintGoal;
      goalHeadInline = '<div class="spoiler__mi" title="'+esc(rec.sprintGoal)+'"><span class="spoiler__ml">'+T('histGoalLabel')+'</span><span class="spoiler__mv" style="font-style:italic">'+esc(_truncGoal)+'</span></div>';
    }
    meta.innerHTML =
      sprintNameInline +
      roleInline +
      outcomeInline +
      goalHeadInline +
      '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStart')+'</span><span class="spoiler__mv">'+fmtDate(rec.dateStart)+'</span></div>'+
      '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerEnd')+'</span><span class="spoiler__mv">'+fmtDate(rec.dateEnd)+'</span></div>'+
      '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerStatus')+'</span><span class="spoiler__mv"><span class="s-badge '+badgeClass+'"'+(badgeTitle?' title="'+esc(badgeTitle)+'"':'')+'>'+esc(statusLabel(rec.status))+'</span>'+(rec.isOverLimit?'<span class="overlimit-tag">'+T('overlimitTag')+'</span>':'')+wcPill+'</span></div>'+
      '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerTasks')+'</span><span class="spoiler__mv">'+(rec.items?rec.items.length:0)+'</span></div>'+
      (remVal !== undefined && remVal !== null ? '<div class="spoiler__mi"><span class="spoiler__ml">'+T('histSpoilerRem')+'</span><span class="spoiler__mv" style="color:'+(remVal<0?'var(--error)':'var(--success)')+'">'+fmtHours(remVal)+'</span></div>' : '');

    var ctrl = document.createElement('div'); ctrl.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

    var xlsBtn = document.createElement('button');
    xlsBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--excel'; /* #43 W4 (E-1) — Ring-база + цветовой модификатор */ xlsBtn.title = T('btnExcelTitle');
    xlsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'+
      '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> Excel';
    xlsBtn.addEventListener('click', (function(r){ return function(e){ e.stopPropagation(); exportSprintToExcel(r); }; })(rec));

    var jsonBtn = document.createElement('button');
    jsonBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--excel'; jsonBtn.title = T('btnExportSprintJsonTitle') || 'Экспорт спринта в JSON';
    jsonBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'+
      '<line x1="8" y1="13" x2="16" y2="13"/></svg> JSON';
    jsonBtn.addEventListener('click', (function(r){ return function(e){ e.stopPropagation(); exportPerSprintJson(r); }; })(rec));

    if (_isValidator && rec.status !== STATUS.FINISHED) {
      /* v5.3.0 — disable/relabel «Открыть на правку» по ownership working copy */
      var wcDraft = (rec.hasWorkingCopy && _workingDrafts[rec.sprintId]) ? _workingDrafts[rec.sprintId] : null;
      var myLogin = (_currentUser && _currentUser.login) || '';
      var editBtn = document.createElement('button');
      editBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--edit-hist';
      if (wcDraft && wcDraft.editorLogin && wcDraft.editorLogin !== myLogin) {
        /* Чужая working copy — disabled */
        editBtn.disabled = true;
        editBtn.title = T('wcLockedByOther').replace('{who}', wcDraft.editorLogin);
        editBtn.textContent = T('btnEditHist');
      } else if (wcDraft) {
        editBtn.textContent = T('wcResume');
      } else {
        editBtn.textContent = T('btnEditHist');
      }
      editBtn.addEventListener('click', (function(r,i){ return function(e){ e.stopPropagation(); editHistorySprint(r, i); }; })(rec, idx));
      ctrl.appendChild(editBtn);
      /* v5.3.0 — кнопка «Отменить правку» (только владельцу working copy) */
      if (wcDraft && wcDraft.editorLogin === myLogin) {
        var discardBtn = document.createElement('button');
        discardBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--edit-hist';
        discardBtn.style.borderColor = 'var(--error,#e05a6a)';
        discardBtn.style.color = 'var(--error,#e05a6a)';
        discardBtn.textContent = T('wcDiscard');
        discardBtn.addEventListener('click', (function(k){ return function(e){ e.stopPropagation(); discardWorkingDraft(k); }; })(rec.sprintId));
        ctrl.appendChild(discardBtn);
      }
    }
    if (rec.status !== STATUS.FINISHED) {
      var finBtn = document.createElement('button');
      finBtn.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat editor-btn btn--finish-hist'; finBtn.textContent = T('btnFinishSprint');
      finBtn.addEventListener('click', (function(r,i){ return function(e){ e.stopPropagation(); finishHistorySprint(r, i); }; })(rec, idx));
      ctrl.appendChild(finBtn);
    }
    var del = document.createElement('button'); del.className = 'ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly'; del.title = T('btnDeleteTitle'); del.setAttribute('aria-label', T('aria.btnDeleteRow')); del.appendChild(icon('trash', T('aria.btnDeleteRow')));
    del.addEventListener('click', (function(histIdx){ return function(e){
      e.stopPropagation();
      openModal({
        id: 'delHist',
        type: 'destructive',
        title: T('confirmDelHist'),
        body: { kind: 'text', text: T('confirmDelHist') },
        buttons: [
          { id: 'cancel', text: T('btnNo'), variant: 'secondary', onClick: function(h) { h.close(); } },
          { id: 'confirm', text: T('btnYesDelete'), variant: 'danger', onClick: function(h) {
            h.close();
            if (!_isValidator) { toast(T('toastNoValidRights'), 'warn'); return; }
            _history.splice(histIdx, 1);
            apiPost('history', { history: _history }).then(function() {
              renderHistory();
              try {
                if (_currentSprintId) {
                  var stillHas = _history.some(function(hh){
                    return hh && typeof hh.sprintId === 'string' && hh.sprintId.indexOf(_currentSprintId + '_') === 0;
                  });
                  var isActive = _sprint && _sprint.sprintId === _currentSprintId;
                  if (!stillHas && !isActive) {
                    var ids = (typeof getLogicalSprintIds === 'function') ? getLogicalSprintIds() : [];
                    setCurrentSprintId(ids.length > 0 ? ids[0] : null, { confirmed: true });
                  } else if (typeof renderWidgetHeader === 'function') {
                    renderWidgetHeader();
                  }
                }
              } catch(e){ diag('delHist sync header err: '+e,'err'); }
              toast(T('toastHistDeleted'), 'success');
            });
          }},
        ],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: false,
      });
    }; })(idx));
    var arr = document.createElement('span'); arr.className = 'spoiler__arrow'; arr.textContent = '▶';
    ctrl.appendChild(xlsBtn); ctrl.appendChild(jsonBtn); ctrl.appendChild(del); ctrl.appendChild(arr);
    head.appendChild(meta); head.appendChild(ctrl);
    head.addEventListener('click', function(){ wrap.classList.toggle('open'); });

    var body = document.createElement('div'); body.className = 'spoiler__body';
    if (rec.name) {
      var nameDiv = document.createElement('div'); nameDiv.className = 'spoiler__name';
      nameDiv.textContent = rec.name;
      body.appendChild(nameDiv);
    }
    // Метка роли
    if (rec.roleLabel) {
      var roleLabel = document.createElement('div'); roleLabel.className = 'spoiler__role-label';
      roleLabel.textContent = rec.roleLabel;
      body.appendChild(roleLabel);
    }
    // Поля Спринт / Версия
    if (rec.sprintFieldVal || rec.versionFieldVal) {
      var sfDiv = document.createElement('div');
      sfDiv.style.cssText = 'padding:6px 16px 0;font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;';
      if (rec.sprintFieldVal) sfDiv.innerHTML += '<span><b>'+T('histSprintLabel')+':</b> '+esc(rec.sprintFieldVal)+'</span>';
      if (rec.versionFieldVal) sfDiv.innerHTML += '<span><b>'+T('histVersionLabel')+':</b> '+esc(rec.versionFieldVal)+'</span>';
      body.appendChild(sfDiv);
    }
    /* v1.9.0 D132 — Sprint goal + outcome + retro card in expanded body. */
    if (rec.sprintGoal || rec.goalOutcome) {
      var _goalCard = document.createElement('div');
      _goalCard.style.cssText = 'margin:10px 16px 0;padding:10px 12px;background:var(--surface-light,#f5f5f5);border-radius:6px;font-size:12px;line-height:1.5;';
      var _goalCardHtml = '';
      if (rec.sprintGoal) {
        _goalCardHtml += '<div style="margin-bottom:'+(rec.goalOutcome?'8px':'0')+'"><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histGoalLabel'))+'</span><span style="font-weight:500">'+esc(rec.sprintGoal)+'</span></div>';
      }
      if (rec.goalOutcome) {
        var _outMapB = { achieved: T('optGoalAchieved'), partial: T('optGoalPartial'), missed: T('optGoalMissed') };
        _goalCardHtml += '<div style="margin-bottom:'+(rec.goalRetroNote?'8px':'0')+'"><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histOutcomeLabel'))+'</span>'+esc(_outMapB[rec.goalOutcome]||rec.goalOutcome)+'</div>';
      }
      if (rec.goalRetroNote) {
        _goalCardHtml += '<div><span style="color:var(--muted,#888);font-size:11px;display:block">'+esc(T('histRetroLabel'))+'</span><span style="font-style:italic">'+esc(rec.goalRetroNote)+'</span></div>';
      }
      _goalCard.innerHTML = _goalCardHtml;
      body.appendChild(_goalCard);
    }
    var conf = document.createElement('div'); conf.className = 'spoiler__confirmed';
    conf.textContent = T('currentRoleConfirmedAt')+': '+(rec.confirmedBy||'—')+' · '+fmtDT(rec.confirmedAt);
    if (rec.finishedAt) conf.textContent += ' · '+T('histSpoilerEnd')+': '+fmtDT(rec.finishedAt);
    body.appendChild(conf);

    /* v5.4.0 (D30, KL#2 v5.3.0) — Toggle «Снимок ↔ Рабочая копия» для записей с активной WC.
       По умолчанию выбран «Снимок». При выборе «Рабочая копия» items списка
       перерисовываются из _workingDrafts[<sprintId>_<roleKey>].items. */
    var wcDraftForToggle = (rec.hasWorkingCopy && _workingDrafts && _workingDrafts[rec.sprintId])
      ? _workingDrafts[rec.sprintId] : null;
    var noticeEl = null;
    var itemsSlot = document.createElement('div');
    if (wcDraftForToggle) {
      /* v2.0.0 D5-D — Ring Radio host вместо 2 native radios. */
      var toggleWrap = document.createElement('div');
      toggleWrap.className = 'wc-spoiler-toggle';
      toggleWrap.style.cssText = 'display:flex;gap:14px;align-items:center;padding:6px 16px 0;font-size:12px;';
      var wcRadioOpts = [
        { value: 'snap', label: T('wcSourceSnapshot') },
        { value: 'wc',   label: T('wcSourceWorkingCopy') }
      ];
      var wcHost = document.createElement('span');
      wcHost.setAttribute('data-ssp-radio-host', '');
      wcHost.dataset.name = 'wc-source-' + rec.sprintId;
      wcHost.dataset.value = 'snap';
      wcHost.dataset.optionsJson = JSON.stringify(wcRadioOpts);
      wcHost.style.display = 'inline-flex';
      wcHost.style.gap = '14px';
      toggleWrap.appendChild(wcHost);
      body.appendChild(toggleWrap);
      noticeEl = document.createElement('div');
      noticeEl.className = 'wc-spoiler-notice hidden';
      noticeEl.style.cssText = 'margin:6px 16px 0;padding:6px 10px;border-radius:4px;background:rgba(255,200,80,.18);color:#8a6500;font-size:11px;';
      noticeEl.innerHTML = T('wcSpoilerNotice')
        .replace('{who}', esc(wcDraftForToggle.editorLogin || '?'))
        .replace('{when}', fmtDT(wcDraftForToggle.updatedAt));
      body.appendChild(noticeEl);
    }
    body.appendChild(itemsSlot);

    /* Локальный helper для рендера блока «summary + таблица задач».
       Используется как для базового снимка (rec.items), так и для working copy
       (draft.items). Принимает items+roleKey, рендерит в itemsSlot. */
    function __renderHistoryItemsBlock(items, rk) {
      /* v2.0.0 D128 D7 — read-only Ring Table replaces native <table>.
         Unmount prior Ring roots before clearing slot (lesson D5 #21). */
      if (window.__SSP_TABLE) {
        try { window.__SSP_TABLE.unmountAllIn(itemsSlot); } catch(_) {}
      }
      itemsSlot.innerHTML = '';
      if (items && items.length) {
        var sumDiv = document.createElement('div'); sumDiv.className = 'spoiler__summary';
        var sD = items.filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; }).reduce(function(s,i){ return s+(i['estimate_'+rk]||0); }, 0);
        sumDiv.innerHTML = '<span><b>'+esc(rec.roleLabel||rk)+':</b> '+fmtPeriod(sD)+'</span>';
        itemsSlot.appendChild(sumDiv);
      }
      var tw = document.createElement('div'); tw.className = 'tbl-wrap';
      if (!items || !items.length) {
        tw.innerHTML = '<div class="empty">'+esc(T('histNoTasks'))+'</div>';
        itemsSlot.appendChild(tw);
        return;
      }
      /* v1.8.0 D130 — externalTicketId column visible if setting configured.
         v1.8.1 — XPriority column в истории тоже опциональна. */
      var hasExtTicket = !!(_settings && _settings.fieldExternalTicketId);
      var hasXPri      = !!(_settings && _settings.fieldXPriority);

      function _renderExternalTicketInner(val) {
        if (!val) return '<span style="color:var(--muted)">—</span>';
        var safe = esc(String(val));
        var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
        if (/^https?:\/\//i.test(val)) {
          return '<span '+style+' title="'+safe+'"><a href="'+safeUrl(val)+'" target="_blank" rel="noopener noreferrer" class="link">'+safe+'</a></span>';
        }
        return '<span '+style+' title="'+safe+'">'+safe+'</span>';
      }
      function histDelta(v) {
        if (v === null || v === undefined) return '<span style="color:var(--muted)">—</span>';
        var s = fmtHoursOnly(Math.abs(v));
        return v < 0 ? '<span class="delta-neg">−'+s+'</span>' : s;
      }

      var cols = [];
      cols.push({
        id: 'id', title: T('histColNum'), sortable: false, className: 'td-id',
        getValue: function(item) {
          return { __html: '<a href="'+safeUrl(item.url)+'" target="_blank" rel="noopener noreferrer" class="link">'+esc(item.issueId)+'</a>' };
        }
      });
      if (hasExtTicket) {
        cols.push({
          id: 'externalTicketId', title: T('thExternalTicketId'), sortable: false, className: 'td-hist-ext',
          getValue: function(item) { return { __html: _renderExternalTicketInner(item.externalTicketId) }; }
        });
      }
      cols.push({
        id: 'title', title: T('histColTitle'), sortable: false, className: 'td-title ssp-col-title',
        getValue: function(item) { return esc(item.title || ''); }
      });
      cols.push({
        id: 'priority', title: T('histColPriority'), sortable: false, className: 'td-hist-narrow',
        getValue: function(item) { return esc(dispEnum(item.priority) || '—'); }
      });
      if (hasXPri) {
        cols.push({
          id: 'xpriority', title: T('histColXpriority'), sortable: false, className: 'td-hist-narrow',
          getValue: function(item) { return esc(dispEnum(item.xpriority) || '—'); }
        });
      }
      cols.push({
        id: 'state', title: T('histColState'), sortable: false, className: 'td-hist-narrow',
        getValue: function(item) { return esc(dispEnum(item.state) || '—'); }
      });
      cols.push({
        id: 'incStatus', title: T('histColIncStatus'), sortable: false, className: 'td-hist-inc',
        getValue: function(item) { return esc(item.inclusionStatus ? incLabel(item.inclusionStatus) : '—'); }
      });
      /* fmtThLabel returns 'Ресурс<br>{label}'. table-mount.jsx auto-detects
         <br> in column.title and generates getHeaderValue with React <br/>
         elements (lesson #26). */
      cols.push({
        id: 'delta',
        title: fmtThLabel(rec.roleLabel || rk),
        sortable: false,
        className: 'td-num',
        headerClassName: 'td-num',
        getValue: function(item) {
          var est  = item['estimate_'+rk];
          var fact = item['fact_'+rk];
          var delta = (est !== null && est !== undefined)
            ? (fact !== null && fact !== undefined ? (est||0)-(fact||0) : (est||0))
            : null;
          return { __html: histDelta(delta) };
        }
      });

      /* Internal host div для Ring Table. Уникальный (per spoiler instance). */
      var host = document.createElement('div');
      host.setAttribute('data-ssp-table-host', '');
      tw.appendChild(host);
      itemsSlot.appendChild(tw);

      if (window.__SSP_TABLE) {
        window.__SSP_TABLE.mountAt(host, {
          items: items.slice(),
          columns: cols,
          sortKey: 'off',
          onSort: function() { /* no-op — history is read-only, headers not sortable */ },
          getItemKey: function(item) { return item.issueId; },
          stickyHeader: false,
          emptyText: T('histNoTasks'),
        });
      } else {
        host.innerHTML = '<div class="empty">'+esc(T('histNoTasks'))+'</div>';
      }
    }

    /* Первичный рендер — снимок */
    __renderHistoryItemsBlock(rec.items, rec.roleKey);

    /* Listener тоггла — переключаем источник.
       v2.0.0 D5-D — change-event bubbles из Ring Radio host span (dataset.value updated). */
    if (wcDraftForToggle) {
      var wcHostEl = body.querySelector('[data-ssp-radio-host]');
      if (wcHostEl) {
        wcHostEl.addEventListener('change', function(ev) {
          ev.stopPropagation();
          var v = wcHostEl.dataset.value;
          if (v === 'wc') {
            __renderHistoryItemsBlock(wcDraftForToggle.items || [], rec.roleKey);
            if (noticeEl) noticeEl.classList.remove('hidden');
          } else if (v === 'snap') {
            __renderHistoryItemsBlock(rec.items, rec.roleKey);
            if (noticeEl) noticeEl.classList.add('hidden');
          }
        });
      }
      /* Клики по toggle не должны сворачивать спойлер */
      var ws = body.querySelector('.wc-spoiler-toggle');
      if (ws) ws.addEventListener('click', function(ev){ ev.stopPropagation(); });
    }

    wrap.appendChild(head); wrap.appendChild(body);
    /* v2.0.0 D5-D — mount Ring Radio для wc-toggle если есть. Делаем после append'а
       в body чтобы createRoot работал на attached node (React 19 best practice). */
    if (wcDraftForToggle && window.__SSP_RADIO && typeof window.__SSP_RADIO.mountAllIn === 'function') {
      window.__SSP_RADIO.mountAllIn(wrap);
    }
    return wrap;
  }

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
  function exportSprintToExcel(rec) {
    /* Lazy load — если ещё не загружен, грузим, потом рекурсивно вызываем себя */
    if (typeof XLSX === 'undefined') {
      toast(T('toastXlsxLoading') || 'Загружаем XLSX-библиотеку…', 'info');
      loadXLSXLib().then(function(){
        exportSprintToExcel(rec);
      }).catch(function(e){
        diag('XLSX load failed: '+(e&&e.message?e.message:e),'err');
        toast(T('toastXlsxErr'));
      });
      return;
    }
    var rk   = rec.roleKey;
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });

    var meta = [
      [T('excelSprintName'), rec.name || '—'],
      [T('excelRole'), rec.roleLabel || rk],
      [T('excelPeriod'), fmtDate(rec.dateStart) + ' — ' + fmtDate(rec.dateEnd)],
      [T('excelStatus'), rec.status ? statusLabel(rec.status) : '—'],
      [T('currentRoleConfirmedAt'), (rec.confirmedBy || '—') + ' · ' + fmtDT(rec.confirmedAt)],
      [T('excelQtyTasks'), rec.items ? rec.items.length : 0],
      []
    ];
    if (role) {
      meta.push([T('excelResource') + ' ' + roleLabel(role), fmtPeriod(rec[role.resKey] || 0), T('excelRemain'), fmtHours(rec[role.remKey] !== undefined ? rec[role.remKey] : 0)]);
    }
    if (rec.sprintFieldVal)  meta.push([T('excelSprint'), rec.sprintFieldVal]);
    if (rec.versionFieldVal) meta.push([T('excelVersion'), rec.versionFieldVal]);
    meta.push([]);

    var roleSuffixHdr = ' ' + (role ? roleLabel(role) : rk) + ' (ч)';
    /* v5.5.0 — Этап 3e: условная колонка «Ответственный по задаче» при наличии
       personal-распределения хотя бы по одной задаче этой роли. Multi-assignee — через запятую.
       Спринты без personal распределения экспортируются как раньше (regression-safe). */
    var ppTaskAssignments = (rec.personalPlanning && rec.personalPlanning.taskAssignments) || {};
    var hasAssignees = Object.keys(ppTaskAssignments).some(function(id){
      var ta = ppTaskAssignments[id];
      if (!ta) return false;
      if (Array.isArray(ta)) return ta.some(function(x){ return x && x.assignee; });
      return !!ta.assignee;
    });
    function _formatAssigneeCell(item) {
      var ta = ppTaskAssignments[item.issueId];
      if (!ta) return '';
      if (Array.isArray(ta)) {
        var names = ta.filter(function(x){ return x && x.assignee; })
                      .map(function(x){ return x.assigneeName || x.assignee; });
        return names.join(', ');
      }
      return ta.assigneeName || ta.assignee || '';
    }
    /* v6.1.0 D78 (F1) — добавлена колонка «Факт» между Estimate и Resource. */
    var header = [T('excelColId'), T('excelColTitle'), T('excelColSystem'), T('excelColPriority'), T('excelColXpriority'), T('excelColState'), T('excelColInclusion'),
      T('excelColEstimate') + roleSuffixHdr,
      T('excelColFact')     + roleSuffixHdr,
      T('excelColResource') + roleSuffixHdr,
      T('excelColAlloc')    + roleSuffixHdr];
    if (hasAssignees) header.push(T('excelColAssignee'));
    header.push(T('excelColLink'));

    function minToH(m) { return m != null ? Math.round(m / 60 * 100) / 100 : ''; }

    var rows = (rec.items || []).map(function(item) {
      var est  = item['estimate_' + rk] || 0;
      var fact = item['fact_'     + rk] || 0;
      var resourceMin = Math.max(0, est - fact);
      var allocRaw    = item['alloc_' + rk];
      var allocMin    = (allocRaw !== null && allocRaw !== undefined) ? allocRaw : resourceMin;
      var row = [
        item.issueId  || '',
        item.title    || '',
        item.system   || '',
        dispEnum(item.priority) || '',
        dispEnum(item.xpriority) || '',
        dispEnum(item.state)    || '',
        item.inclusionStatus ? incLabel(item.inclusionStatus) : '',
        minToH(item['estimate_' + rk]),
        minToH(item['fact_'     + rk]),
        minToH(resourceMin),
        minToH(allocMin)
      ];
      if (hasAssignees) row.push(_formatAssigneeCell(item));
      row.push(item.url || '');
      return row;
    });

    var _activeSnap = (rec.items || []).filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    var totalsBase = ['', T('excelTotal'), '', '', '', '', '',
      Math.round(_activeSnap.reduce(function(s, i) { return s + (i['estimate_' + rk] || 0); }, 0) / 60 * 100) / 100,
      /* v6.1.0 D78 (F1) — итог по колонке «Факт». */
      Math.round(_activeSnap.reduce(function(s, i) { return s + (i['fact_' + rk] || 0); }, 0) / 60 * 100) / 100,
      Math.round(_activeSnap.reduce(function(s, i) {
        var est  = i['estimate_' + rk] || 0;
        var fact = i['fact_'     + rk] || 0;
        return s + Math.max(0, est - fact);
      }, 0) / 60 * 100) / 100,
      Math.round(_activeSnap.reduce(function(s, i) {
        var est  = i['estimate_' + rk] || 0;
        var fact = i['fact_'     + rk] || 0;
        var raw  = i['alloc_'    + rk];
        var resMin = Math.max(0, est - fact);
        return s + ((raw !== null && raw !== undefined) ? raw : resMin);
      }, 0) / 60 * 100) / 100
    ];
    if (hasAssignees) totalsBase.push('');
    totalsBase.push('');
    var totals = totalsBase;

    var wsData = meta.concat([header]).concat(rows).concat([totals]);
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    /* v6.1.0 D78 (F1) — +1 колонка ширины (Факт). */
    var cols = [{wch:16},{wch:50},{wch:16},{wch:14},{wch:20},{wch:16},{wch:20},{wch:14},{wch:14},{wch:14},{wch:14}];
    if (hasAssignees) cols.push({wch:24});
    cols.push({wch:40});
    ws['!cols'] = cols;

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, T('excelSprint'));
    var roleSuffix = role ? ('_' + roleLabel(role).replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '')) : '';
    var fileName = (rec.name ? rec.name.replace(/[\\/:*?"<>|]/g, '_') : T('excelSprint').toLowerCase()) + roleSuffix + '_' + fmtDate(rec.dateStart).replace(/\./g, '-') + '.xlsx';
    XLSX.writeFile(wb, fileName);
    diag('Excel exported: ' + fileName, 'ok');
  }

  /* ═══ v2.1.13 — Экспорт/импорт истории в JSON (#27) ══════════════ */

  var HIST_EXPORT_FORMAT     = 'ssp-sprint-history';
  var HIST_EXPORT_FORMAT_VER = 1;
  var HIST_ACCEPTED_FORMATS  = ['scbt-sprint-history', 'ssp-sprint-history'];

  function _anonymizeHistRecords(records) {
    return records.map(function(rec) {
      var r = JSON.parse(JSON.stringify(rec));
      if (r.settings) {
        delete r.settings.kpe; delete r.settings.rate;
        ['analysis','development','testing','devops','analytics','management','design','qa','support'].forEach(function(rk){
          if (r.settings['rate_' + rk] !== undefined) delete r.settings['rate_' + rk];
          if (r.settings['kpe_'  + rk] !== undefined) delete r.settings['kpe_'  + rk];
        });
      }
      return r;
    });
  }

  function _buildHistEnvelope(records, anonymize) {
    var recs = anonymize ? _anonymizeHistRecords(records) : records;
    var su   = (typeof YTApp !== 'undefined' && YTApp.serverUrl) ? YTApp.serverUrl : '';
    var proj = _projectDisplayName || (_ctx && _ctx.project && (_ctx.project.shortName || _ctx.project.id)) || '';
    return {
      format:        HIST_EXPORT_FORMAT,
      formatVersion: HIST_EXPORT_FORMAT_VER,
      pluginVersion: APP_VERSION,
      exportedAt:    Date.now(),
      exportedBy:    (_currentUser && _currentUser.login) || '',
      sourceProject: proj,
      sourceInstance: su,
      anonymized:    !!anonymize,
      records:       recs
    };
  }

  function _triggerJsonDownload(obj, fileName) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a'); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  function _histFileStem() {
    var proj = (_projectDisplayName || 'project').replace(/[\\/:*?"<>|]/g, '_');
    var d    = new Date(); var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return 'ssp-history_' + proj + '_' + ds;
  }

  /* Экспорт всей истории */
  function exportAllHistoryToJson(anonymize) {
    if (!_history || !_history.length) { toast(T('emptyHistory') || 'Нет истории', 'warn'); return; }
    var env = _buildHistEnvelope(_history, anonymize);
    _triggerJsonDownload(env, _histFileStem() + '.json');
    toast(T('toastHistExported') || 'История экспортирована', 'success');
    diag('JSON history exported: ' + _history.length + ' records', 'ok');
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
    if (!data || typeof data !== 'object') return { ok: false, reason: 'not_object' };
    if (HIST_ACCEPTED_FORMATS.indexOf(data.format) < 0) return { ok: false, reason: 'wrong_format' };
    if (!data.formatVersion || data.formatVersion > HIST_EXPORT_FORMAT_VER) return { ok: false, reason: 'unsupported_version' };
    if (!Array.isArray(data.records)) return { ok: false, reason: 'no_records' };
    return { ok: true };
  }

  /* ── Диалог импорта (Promise-based) ── */
  var _importHistPending = null; // { records, mode, selectedBaseIds }

  function openImportHistDialog(data) {
    return new Promise(function(resolve) {
      var pf = _preflightHistFile(data);
      if (!pf.ok) {
        toast(T('toastHistImportInvalid') || 'Файл не является историей спринтов', 'err');
        resolve(null); return;
      }
      var records = data.records;
      if (!records.length) {
        toast(T('importHistEmpty') || 'Нет записей для импорта', 'warn');
        resolve(null); return;
      }

      // Существующие базовые sprintId
      var existingBaseIds = {};
      (_history || []).forEach(function(h){ if (h && h.sprintId) existingBaseIds[String(h.sprintId).split('_')[0]] = true; });

      // Группируем записи файла по базовому sprintId
      var groups = {}; // baseId → { baseId, name, dateStart, roleCount, hasCollision }
      records.forEach(function(r) {
        if (!r || !r.sprintId) return;
        var base = String(r.sprintId).split('_')[0];
        if (!groups[base]) groups[base] = { baseId: base, name: r.name || base, dateStart: r.dateStart, roleCount: 0, hasCollision: !!existingBaseIds[base] };
        groups[base].roleCount++;
      });
      var groupList = Object.keys(groups).map(function(k){ return groups[k]; });

      // Cross-fork и cross-instance флаги
      var isCrossFork     = data.format !== HIST_EXPORT_FORMAT;
      var su              = (typeof YTApp !== 'undefined' && YTApp.serverUrl) ? YTApp.serverUrl : '';
      var isCrossInstance = !!(data.sourceInstance && su && data.sourceInstance !== su);
      var isVersionNewer  = !!(data.pluginVersion && data.pluginVersion > APP_VERSION);

      if (!window.__SSP_RING_MODAL) { resolve(null); return; }

      // Info-строки (label/value) — рендерятся компонентом importHistForm
      var infoRows = [];
      if (data.sourceProject)  infoRows.push({ label: T('importHistProject'),    value: data.sourceProject, bold: true });
      if (data.sourceInstance) infoRows.push({ label: T('importHistInstance'),   value: data.sourceInstance });
      if (data.exportedAt)     infoRows.push({ label: T('importHistExportedAt'), value: fmtDT(data.exportedAt) });
      if (data.pluginVersion)  infoRows.push({ label: T('importHistPluginVer'),  value: data.pluginVersion });
      infoRows.push({ label: T('importHistSprintsLabel'), value: String(groupList.length) });

      // Предупреждения (cross-fork / cross-instance / более новая версия)
      var warnings = [];
      if (isCrossFork)     warnings.push({ text: (T('importHistCrossFork') || '').replace('{fork}', data.format), color: 'var(--primary,#0d6efd)' });
      if (isCrossInstance) warnings.push({ text: T('importHistCrossInstance') || '', color: 'var(--warn-text,#b36800)' });
      if (isVersionNewer)  warnings.push({ text: (T('importHistVersionWarn') || '').replace('{v}', data.pluginVersion), color: 'var(--warn-text,#b36800)' });

      /* Phase 3 #32 — мигрировано на openModal() (bespoke importHistForm, настоящий React).
         Чекбоксы выбора спринтов — обычный React-стейт (НЕ Ring Table → нет mousedown-проблемы
         B11/B12). Promise-контракт сохранён: {action:'merge'} / {action:'replace'} / null. */
      var decided = null;  // null=отмена; {action:'merge',sel,mode} / {action:'replace'}
      var h = openModal({
        id: 'importHist',
        type: 'form',
        title: T('importHistTitle'),
        body: { kind: 'component', name: 'importHistForm', props: {
          infoRows: infoRows,
          anonText: data.anonymized ? ('🔒 ' + (T('importHistAnonBadge') || '')) : '',
          warnings: warnings,
          groups: groupList.map(function(g){
            return { baseId: g.baseId, name: g.name, dateText: g.dateStart ? fmtDate(g.dateStart) : '', collision: !!g.hasCollision };
          }),
          labels: {
            collisionBadge: T('importHistCollisionBadge') || 'дубль',
            modeLabel:      T('importHistModeLabel')      || 'При совпадении sprintId:',
            modeSkip:       T('importHistModeSkip')       || 'Пропустить дубли',
            modeOverwrite:  T('importHistModeOverwrite')  || 'Перезаписать дубли',
            replaceText:    T('btnImportReplace')         || 'Полное восстановление…',
            replaceTitle:   T('btnImportReplaceTitle')    || '',
            cancelText:     T('btnCancel')                || 'Отмена',
            submitText:     T('btnImport')                || 'Импортировать',
          },
          onSubmit:  function(sel, mode){ decided = { action: 'merge', sel: sel, mode: mode }; h.close(); },
          onReplace: function(){ decided = { action: 'replace' }; h.close(); },
          onCancel:  function(){ decided = null; h.close(); },
        }},
        buttons: [],
        dismissOnBackdrop: true,
        blockEscape: false,
        showCloseButton: true,
        onClose: function(){
          if (!decided) { resolve(null); return; }
          if (decided.action === 'merge') {
            _submitHistImport(decided.sel, decided.mode, records)
              .then(function(){ resolve({ action: 'merge' }); })
              .catch(function(){ resolve({ action: 'merge' }); });
          } else {
            _importHistPending = { records: records };
            resolve({ action: 'replace' });
            _openImportReplaceConfirm();
          }
        },
      });
    });
  }

  /* ── Merge и запись истории ── */
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
  function _openImportReplaceConfirm() {
    var confirmed = false;
    openModal({
      id: 'importReplaceHist',
      type: 'destructive',
      title: T('importReplaceTitle'),
      body: { kind: 'lines', lines: [
        { html: T('importReplaceWarn'), style: { color: 'var(--error)' } },
        { text: T('importReplaceInfo'), style: { marginTop: '8px', fontSize: '13px', color: 'var(--muted)' } },
      ]},
      buttons: [
        { id: 'cancel', text: T('btnCancel'),     variant: 'secondary', onClick: function(hh){ confirmed = false; hh.close(); } },
        { id: 'yes',    text: T('btnYesReplace'), variant: 'danger',    onClick: function(hh){ confirmed = true;  hh.close(); _doImportReplaceAll(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
      onClose: function(){ if (!confirmed) _importHistPending = null; },
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
   */
  function checkAllocOverlimit(rk) {
    // Строка с задачей: превышение если аллокация задачи > дельта этой задачи (max(0, est-fact))
    // Ресурс задачи = дельта между оценкой и фактом трудозатрат — именно это значение
    // отображается в колонке «Ресурс Анализ» для каждой строки задачи.
    var items = getRoleItemsArr(rk);
    var overlimit = [];
    items.forEach(function(item, idx) {
      if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
      var alloc = item['alloc_'+rk];
      var est   = item['estimate_'+rk] || 0;
      var fact  = item['fact_'+rk] || 0;
      var delta    = Math.max(0, est - fact);  // ресурс строки задачи
      var allocVal = (alloc !== null && alloc !== undefined) ? alloc : delta;
      // Аллокация задачи превышает дельту этой задачи
      if (delta > 0 && allocVal > delta) overlimit.push(idx);
    });
    return overlimit;
  }

  /**
   * Обновляет visual-состояние строк с превышением и кнопки валидации.
   * Вызывается после каждого изменения аллокации.
   */
  function updateAllocOverlimitUI(rk) {
    /* v2.1.0 E4 — Ring Table owns DOM; per-row <tr data-alloc-gi> is gone.
       We look up alloc inputs directly by data-iid and apply the visual to
       the input border. Per-row overlimit badge on title cell is degraded
       (Ring Table cells have no stable per-row container we can append into
       without disturbing React reconciliation). Validate button disabling
       and the overlimit modal still work via checkAllocOverlimit(rk). */
    var host = document.getElementById('compHost_'+rk);
    var items = getRoleItemsArr(rk);
    var anyOverlimit = false;

    if (host) {
      var allocInputs = host.querySelectorAll('input.alloc-input[data-iid]');
      allocInputs.forEach(function(inp) {
        var iid = inp.getAttribute('data-iid');
        var item = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].issueId === iid) { item = items[i]; break; }
        }
        if (!item) return;
        if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) {
          inp.style.borderColor = '';
          return;
        }
        var alloc = item['alloc_'+rk];
        var est   = item['estimate_'+rk];
        var fact  = item['fact_'+rk];
        var delta    = Math.max(0, (est||0) - (fact||0));
        var allocVal = (alloc !== null && alloc !== undefined) ? alloc : delta;
        var isOver = delta > 0 && allocVal > delta;
        if (isOver) anyOverlimit = true;
        inp.style.borderColor = isOver ? 'var(--error)' : '';
      });
    }

    /* Fallback global check — host may not be visible yet (collapsed role
       card), but validate button state still needs to reflect overlimit. */
    if (!anyOverlimit) {
      /* B13 — per-task delta-проверка слепа при пустых est/fact (delta=0).
         Дополняем агрегатом: Σalloc активных задач > ресурс роли. Канон —
         calcRemForRole (та же формула, что красит карточку «Остатки» в red),
         поэтому детектор и индикатор остатка всегда согласованы. */
      anyOverlimit = checkAllocOverlimit(rk).length > 0 || calcRemForRole(rk) < 0;
    }

    // Блокировка валидации: аллокация задачи > ресурс роли
    /* #38 — если включено «разрешить планирование с превышением лимитов»,
       детекция остаётся (красные бордеры/карточка остатка выше — индикация),
       но валидацию НЕ блокируем и overlimit-модалку НЕ показываем. */
    var allowOver = !!(_settings && _settings.allowOverlimitPlanning);
    var validateBtn = document.getElementById('validateBtn_'+rk);
    if (validateBtn) {
      if (anyOverlimit && !allowOver) {
        validateBtn.disabled = true;
        validateBtn.title = T('overlimitTooltip');
        validateBtn.classList.add('btn--disabled-overlimit');
        /* v5.2.0 — для валидированных статусов вместо тихого revert показываем модал.
           Guard `_overlimitModalShownFor` предотвращает повторное открытие при каждом
           blur. Сбрасывается в else-ветке при устранении overlimit. */
        if (_sprint && (_sprint.status === STATUS.CONFIRMED || _sprint.status === STATUS.ALLOCATED)) {
          var modalKey = rk + ':' + (_sprint.sprintId || _sprint.dateStart || 'cur');
          if (!_overlimitModalShownFor[modalKey]) {
            showOverlimitModal(rk);
            _overlimitModalShownFor[modalKey] = true;
          }
        }
      } else {
        validateBtn.disabled = false;
        validateBtn.title = '';
        validateBtn.classList.remove('btn--disabled-overlimit');
        /* v5.2.0 — overlimit устранён, разрешаем модал показывать снова при следующем превышении */
        if (_sprint) {
          var modalKey2 = rk + ':' + (_sprint.sprintId || _sprint.dateStart || 'cur');
          delete _overlimitModalShownFor[modalKey2];
        }
      }
    }
  }

  /* ════════════════════════════════════════════════════════════
     v5.2.0 — Overlimit-модал (замена тихого status revert)
     Объявление _overlimitModalShownFor перенесено выше — рядом с
     инициализацией _sprint (см. ~878), чтобы быть доступным
     до первого вызова updateAllocOverlimitUI.
     ════════════════════════════════════════════════════════════ */

  var _overlimitModalHandle = null;

  function showOverlimitModal(rk) {
    var role = ALL_ROLES.find(function(r){ return r.key === rk; });
    var rl = role ? roleLabel(role) : rk;
    var bodyText = T('overlimitModalBodyTpl').replace('{role}', rl);
    _overlimitModalHandle = openModal({
      id: 'overlimit',
      type: 'confirm',
      title: bodyText,
      body: { kind: 'text', text: bodyText },
      buttons: [
        { id: 'downgrade', text: T('overlimitModalDowngrade'), variant: 'danger', onClick: function(h) {
          h.close(); _overlimitModalHandle = null;
          if (_sprint) {
            _sprint.status = STATUS.PLANNING;
            if (typeof _markDirty === 'function') _markDirty('sprint');
            if (typeof _draftSaveDebounced === 'function') {
              _draftSaveDebounced('sprint', function(){ return _sprint; });
            }
            ALL_ROLES.forEach(function(r) {
              var active = _settings && _settings.activeRoles && _settings.activeRoles[r.key];
              if (active && document.getElementById('statusBadge_'+r.key)) {
                renderRoleStatusBadge(r.key);
              }
            });
            if (typeof renderWidgetHeader === 'function') { try { renderWidgetHeader(); } catch(_){} }
            diag('Status downgraded to PLANNING by user (overlimit modal)', 'info');
            toast(T('toastOverlimitDowngraded'), 'warn');
          }
        }},
        { id: 'cancel', text: T('overlimitModalCancel'), variant: 'primary', onClick: function(h) {
          h.close(); _overlimitModalHandle = null;
        }},
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }


  /* v5.2.0 — единоразовый onboarding при первой встрече с ALLOCATED-спринтом
     (после релиза 5.2.0 поведение строк изменилось: lock + readonly).
     Хранится в localStorage по фиксированному ключу — повторно не показывается. */
  function maybeShowAllocatedLockHint() {
    if (safeLs.get('ssp_allocLockHintShown')) return;
    if (!_sprint || _sprint.status !== STATUS.ALLOCATED) return;
    toast(T('toastAllocatedLockHint'), 'info');
    safeLs.set('ssp_allocLockHintShown', '1');
  }

  /* v2.1.0 E4 — Ring Table owns row DOM; data-alloc-gi tagging is gone.
     Post-render hook now only triggers overlimit check (input border + validate
     button + modal). */
  var _origRenderRoleComposition = renderRoleComposition;
  renderRoleComposition = function(rk) {
    _origRenderRoleComposition(rk);
    updateAllocOverlimitUI(rk);
  };

  /* Патч: после изменения аллокации (blur на alloc-input) — тоже проверить */
  document.addEventListener('blur', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('alloc-input')) {
      var rk2 = e.target.dataset.rk;
      if (rk2) {
        // Небольшая задержка чтобы значение уже было сохранено в _roleItems
        setTimeout(function() { updateAllocOverlimitUI(rk2); }, 50);
      }
    }
  }, true);

  document.addEventListener('change', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('inc-sel')) {
      var rk2 = e.target.dataset.rk;
      if (rk2) setTimeout(function() { updateAllocOverlimitUI(rk2); }, 50);
    }
  }, true);


  /* ═══════════════════════════════════════════════════════════
     v4.0.0 — ИСТОРИЯ: Аллокация + Исполнитель + скрыть Edit
     ═══════════════════════════════════════════════════════════ */

  /* Патч buildSpoiler — переопределяем целиком для добавления колонок */
  var _origBuildSpoiler = buildSpoiler;
  buildSpoiler = function(rec, idx) {
    var wrap = _origBuildSpoiler(rec, idx);

    // Скрыть кнопку «Редактировать» для FINISHED спринтов
    if (rec.status === STATUS.FINISHED) {
      var editBtn = wrap.querySelector('.btn--edit-hist');
      if (editBtn) editBtn.style.display = 'none';
    }

    // Добавить колонки Аллокация и Исполнитель в таблицу задач
    var tbl = wrap.querySelector('table.tbl');
    if (!tbl) return wrap;
    var thead = tbl.querySelector('thead tr');
    if (thead) {
      var thAlloc = document.createElement('th');
      thAlloc.textContent = T('histColAlloc');
      thAlloc.style.cssText = 'min-width:90px';
      var thAssignee = document.createElement('th');
      thAssignee.textContent = T('histColAssignee');
      thAssignee.style.cssText = 'min-width:110px';
      thead.appendChild(thAlloc);
      thead.appendChild(thAssignee);
    }

    var rk = rec.roleKey;
    var pp = rec.personalPlanning || null;
    var taskAssignments = pp ? (pp.taskAssignments || {}) : {};

    var trs = tbl.querySelectorAll('tbody tr');
    trs.forEach(function(tr, i) {
      var item = rec.items ? rec.items[i] : null;
      var issueId = item ? item.issueId : null;

      // Аллокация
      var tdAlloc = document.createElement('td');
      tdAlloc.className = 'td-num';
      var allocVal = item ? item['alloc_'+rk] : null;
      tdAlloc.textContent = (allocVal !== null && allocVal !== undefined) ? fmtPeriod(allocVal) : '—';
      tr.appendChild(tdAlloc);

      // Исполнитель
      var tdAssignee = document.createElement('td');
      if (issueId && taskAssignments[issueId]) {
        tdAssignee.textContent = taskAssignments[issueId].assigneeName || taskAssignments[issueId].assignee || '—';
      } else {
        tdAssignee.textContent = '—';
        tdAssignee.style.color = 'var(--muted)';
      }
      tr.appendChild(tdAssignee);
    });

    return wrap;
  };

  /* editHistorySprint уже патчнут выше для восстановления alloc и v4-блоков */


  /* ═══════════════════════════════════════════════════════════
     v5.4.0 — ОБЩИЙ КОНТЕКСТ СПРИНТА (Этап 2)
     Helpers для шапки виджета и getter'ов «логического спринта».
     Журнал решений: D25 (empty-state без авто-создания), D26 (per-project,
     не per-role в селекторе), D27 (минимальный статус по ролям + tooltip),
     D28 (soft-warn при смене с активной WC), D29 (silent миграция).
     ═══════════════════════════════════════════════════════════ */

  /* Ранг статусов для агрегации бейджа (D27): чем меньше rank — тем «менее продвинут». */
  var STATUS_RANK = { PLANNING: 0, CONFIRMED: 1, ALLOCATED: 2, FINISHED: 3 };

  /* Уникальные id «логических спринтов» (без суффикса _<roleKey>),
     отсортированные по свежести (активный _sprint первым, далее по rec.confirmedAt). */
  function getLogicalSprintIds() {
    var seen = {};
    var entries = []; // {id, sortKey}
    if (_sprint && _sprint.sprintId) {
      seen[_sprint.sprintId] = true;
      entries.push({ id: _sprint.sprintId, sortKey: Date.now() });
    }
    if (Array.isArray(_history)) {
      _history.forEach(function(rec) {
        if (!rec || !rec.sprintId) return;
        var logical = String(rec.sprintId).split('_')[0];
        if (seen[logical]) return;
        seen[logical] = true;
        entries.push({ id: logical, sortKey: rec.confirmedAt || 0 });
      });
    }
    entries.sort(function(a, b) { return b.sortKey - a.sortKey; });
    return entries.map(function(e) { return e.id; });
  }

  /* Все per-role записи _history для логического id (rec.sprintId === <id>_<roleKey>). */
  function getSprintRolesEntries(logicalId) {
    if (!logicalId || !Array.isArray(_history)) return [];
    return _history.filter(function(rec) {
      return rec && rec.sprintId && String(rec.sprintId).indexOf(logicalId + '_') === 0;
    });
  }

  /* Метаданные «логического спринта» для шапки.
     status = минимальный по STATUS_RANK среди не-FINAL ролей (D27).
     Возвращает null, если все роли FINAL (такой спринт не показываем в селекторе). */
  function getSprintMeta(logicalId) {
    if (!logicalId) return null;
    var entries = getSprintRolesEntries(logicalId);
    var meta = { name: '', dateStart: null, dateEnd: null,
                 status: 'PLANNING', statusByRole: {} };
    if (_sprint && _sprint.sprintId === logicalId) {
      meta.name      = _sprint.name      || '';
      meta.dateStart = _sprint.dateStart || null;
      meta.dateEnd   = _sprint.dateEnd   || null;
    }
    var minRank = Infinity;
    entries.forEach(function(rec) {
      if (!rec.status || rec.status === STATUS.FINISHED) return;
      if (!meta.name      && rec.name)      meta.name      = rec.name;
      if (!meta.dateStart && rec.dateStart) meta.dateStart = rec.dateStart;
      if (!meta.dateEnd   && rec.dateEnd)   meta.dateEnd   = rec.dateEnd;
      var rank = STATUS_RANK[rec.status];
      if (rank != null && rank < minRank) { minRank = rank; meta.status = rec.status; }
      if (rec.roleKey) meta.statusByRole[rec.roleKey] = rec.status;
    });
    /* Особый случай: только активный _sprint без role-snapshot'ов в _history.
       Это первая загрузка только что созданного спринта — возвращаем PLANNING-meta
       по данным _sprint, чтобы строка появилась в селекторе. */
    if (minRank === Infinity) {
      if (_sprint && _sprint.sprintId === logicalId && meta.name) {
        meta.status = _sprint.status || 'PLANNING';
        return meta;
      }
      return null;
    }
    return meta;
  }

  /* Есть ли для данного логического спринта хотя бы одна working copy (любая роль). */
  function hasWorkingCopyForSprint(logicalId) {
    if (!logicalId || !_workingDrafts) return false;
    var keys = Object.keys(_workingDrafts);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf(logicalId + '_') === 0) return true;
    }
    return false;
  }

  /* Единая точка изменения _currentSprintId. Возвращает true если switch произошёл,
     false если был отменён (модал «Закрыть рабочую копию?» — D28). */
  function setCurrentSprintId(newId, opts) {
    opts = opts || {};
    if (newId === _currentSprintId) return true;
    if (_activeWorkingDraftKey && !opts.confirmed) {
      showCloseWorkingCopyModal(function(ok) {
        if (!ok) return; // селектор откатится в обработчике change
        _activeWorkingDraftKey = null;
        if (typeof updateWorkingCopyBanner === 'function') {
          try { updateWorkingCopyBanner(); } catch(_){}
        }
        setCurrentSprintId(newId, { confirmed: true });
      });
      return false;
    }
    _currentSprintId = newId || null;
    var ui = _draftGet('ui') || {}; ui.currentSprintId = _currentSprintId; _draftSet('ui', ui);
    if (typeof renderWidgetHeader === 'function') {
      try { renderWidgetHeader(); } catch(e){ diag('renderWidgetHeader err: '+e,'err'); }
    }
    /* Императивный re-render активной вкладки.
       v5.6.0 — Этап 4: legacy ветки 'planner' и 'distrib' удалены; добавлена 'gantt'. */
    var activeBtn = document.querySelector('.tab-btn.active');
    var activeTab = activeBtn ? activeBtn.dataset.tab : null;
    if (activeTab === 'planning') {
      try { _renderPlanningLevel(_planningLevel); } catch(e){ diag('planning re-render err: '+e,'err'); }
      /* B9 fix v2.1.10 — read intro from selected sprint, not stale _sprint global.
         _sprint = working sprint only; not updated on dropdown switch.
         1. newId === _sprint.sprintId → use _sprint (in-flight edits, B8 preserved).
         2. else → first _history record for newId (shares name/dates/goal). */
      var introSrc = null;
      if (_sprint && _sprint.sprintId === newId) {
        introSrc = _sprint;
      } else if (Array.isArray(_history) && newId) {
        introSrc = _history.find(function(rec) {
          return rec && rec.sprintId && String(rec.sprintId).split('_')[0] === newId;
        });
      }
      if (introSrc) {
        var nameEl = document.getElementById('sprintName');
        if (nameEl) nameEl.value = introSrc.name || '';
        var dsEl = document.getElementById('dateStart');
        if (dsEl) dsEl.value = toDateIn(introSrc.dateStart);
        var deEl = document.getElementById('dateEnd');
        if (deEl) deEl.value = toDateIn(introSrc.dateEnd);
        var goalEl = document.getElementById('sprintGoal');
        if (goalEl) goalEl.value = introSrc.sprintGoal || '';
        if (typeof renderSprintIntroExtras === 'function') { try { renderSprintIntroExtras(); } catch(_){} }
      }
    } else if (activeTab === 'gantt') {
      try {
        var rkG = safeLs.get('ssp_lastActiveRole')
               || ((typeof getActiveRoles === 'function' && getActiveRoles()[0]) ? getActiveRoles()[0].key : null);
        if (typeof refreshGanttForCurrentSprint === 'function') refreshGanttForCurrentSprint(rkG);
      } catch(e){ diag('gantt re-render err: '+e,'err'); }
    } else if (activeTab === 'history') {
      try { renderHistory(); } catch(e){ diag('renderHistory err: '+e,'err'); }
    }
    /* v5.5.0 — D34: применить hybrid-режим (read-only / editable) для нового _currentSprintId */
    try { _applyHybridSprintMode(_currentSprintId); } catch(e){ diag('hybrid sprint mode err: '+e,'err'); }
    /* #36 — синк sprintId в URL + обновить кнопку «Поделиться» (enabled при наличии спринта) */
    try { _syncStateToUrl(); } catch(_){}
    try { _updateShareBtnState(); } catch(_){}
    return true;
  }

  /* v5.6.0 — Этап 4 (4c): refreshPlannerForCurrentSprint удалена.
     Баннер #plannerHistoricalNotice физически удалён в C2 (4b). Hybrid режим v5.5.0 (D34)
     через _setHistoricalReadOnly + _applyHybridSprintMode заменил функционально. */

  /* Soft-warn модал перед сменой спринта при активной WC (D28). */
  function showCloseWorkingCopyModal(cb) {
    openModal({
      id: 'closeWc',
      type: 'confirm',
      title: T('wcCloseTitle'),
      body: { kind: 'text', text: T('wcCloseBody') },
      buttons: [
        { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); cb(false); } },
        { id: 'confirm', text: T('wcCloseConfirm'), variant: 'primary', onClick: function(h) { h.close(); cb(true); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }

  /* Идемпотентный рендер шапки виджета.
     Вызывается при init, после loadAllData, при смене селектора, после
     saveRoleHistorySnapshot/finishHistorySprint/_workingDraftsScheduleFlush. */
  function renderWidgetHeader() {
    var headerEl = document.getElementById('widgetHeader');
    if (!headerEl) return;
    var sel    = document.getElementById('widgetSprintSel');
    var badge  = document.getElementById('widgetSprintBadge');
    var wcInd  = document.getElementById('widgetWcIndicator');
    if (!sel || !badge || !wcInd) return;

    /* 1. Заполняем селектор */
    var ids = getLogicalSprintIds();
    /* Фильтруем id с meta=null (все роли FINAL) */
    var visibleIds = [];
    var metaCache = {};
    ids.forEach(function(id) {
      var m = getSprintMeta(id);
      if (m) { visibleIds.push(id); metaCache[id] = m; }
    });

    sel.innerHTML = '';
    if (!visibleIds.length) {
      /* v6.1.0 D72 — нет видимых спринтов → сбросить _currentSprintId, иначе он
         продолжает указывать на удалённую/невидимую запись и ломает рендер вкладок. */
      if (_currentSprintId) {
        _currentSprintId = null;
        var ui0 = _draftGet('ui') || {}; ui0.currentSprintId = null; _draftSet('ui', ui0);
      }
      var opt0 = document.createElement('option');
      opt0.value = ''; opt0.disabled = true; opt0.selected = true;
      opt0.textContent = T('phNoSprintsActive');
      sel.appendChild(opt0); sel.disabled = true;
    } else {
      sel.disabled = false;
      visibleIds.forEach(function(id) {
        var m = metaCache[id];
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = (m.name || id) +
          (m.dateStart ? ' · ' + fmtDate(m.dateStart) : '') +
          (m.dateEnd   ? ' — ' + fmtDate(m.dateEnd)   : '');
        sel.appendChild(opt);
      });
      /* Восстановить _currentSprintId, если он валиден; иначе взять первый */
      if (_currentSprintId && visibleIds.indexOf(_currentSprintId) >= 0) {
        sel.value = _currentSprintId;
      } else {
        sel.value = visibleIds[0];
        _currentSprintId = visibleIds[0];
        var ui = _draftGet('ui') || {}; ui.currentSprintId = _currentSprintId; _draftSet('ui', ui);
      }
    }

    /* 2. Бейджи статуса — список per-role (v1.8.1).
       Раньше — единый агрегированный бейдж с min(STATUS_RANK) среди ролей. Это
       вводило в заблуждение: при одной аллоцированной и одной черновой роли в шапке
       висел «Черновик». Теперь — explicit список «Роль: Статус».
       Источник статуса каждой роли:
         - запись в _history (per-role snapshot) — берём её status (включая FINISHED);
         - если записи нет — PLANNING (роль ещё не валидирована). */
    if (_currentSprintId) {
      var activeRoles = (typeof getActiveRoles === 'function' && getActiveRoles().length)
        ? getActiveRoles()
        : ALL_ROLES;
      var entries = (typeof getSprintRolesEntries === 'function')
        ? getSprintRolesEntries(_currentSprintId)
        : [];
      var statusByRole = {};
      entries.forEach(function(rec) {
        if (rec && rec.roleKey && rec.status) statusByRole[rec.roleKey] = rec.status;
      });
      badge.classList.remove('hidden');
      badge.classList.remove('widget-header__badge--planning',
        'widget-header__badge--confirmed',
        'widget-header__badge--allocated',
        'widget-header__badge--finished');
      badge.removeAttribute('title');
      /* v1.8.1 — inline-стили убраны, layout управляется через CSS .widget-header__badge
         (flex-wrap + flex-basis:100%). Inline-style раньше дублировал и конфликтовал с CSS,
         из-за чего при 4+ ролях бейджи наезжали на селектор спринта. */
      badge.removeAttribute('style');
      var _diagDump = activeRoles.map(function(role) {
        return role.key + '=' + (statusByRole[role.key] || 'PLANNING(default)');
      }).join(', ');
      diag('[RENDER-HEADER] sprintId='+_currentSprintId+' entries='+entries.length+' roles=['+_diagDump+']', 'info');
      badge.innerHTML = activeRoles.map(function(role) {
        var st = statusByRole[role.key] || 'PLANNING';
        var stLabel = (typeof statusLabel === 'function') ? statusLabel(st) : st;
        var rLabel  = (typeof roleLabel === 'function') ? roleLabel(role) : (role.label || role.key);
        var cls     = 's-badge s-badge--' + String(st).toLowerCase();
        return '<span class="'+cls+'" title="'+esc(rLabel + ': ' + stLabel)+'">'
             +    '<span style="opacity:.7">'+esc(rLabel)+':</span> '+esc(stLabel)
             + '</span>';
      }).join('');
    } else {
      badge.classList.add('hidden');
      badge.innerHTML = '';
    }

    /* 3. WC indicator */
    if (_currentSprintId && hasWorkingCopyForSprint(_currentSprintId)) {
      wcInd.classList.remove('hidden');
    } else {
      wcInd.classList.add('hidden');
    }
    /* Кнопка «+ Новый спринт» — visibility управляется .editor-btn classом
       через общую цепочку init (как остальные editor-кнопки виджета). */
    /* #25 Ф2 п.6 — синхронизировать подпись полного имени спринта в global-рельсе. */
    if (typeof _updateRailSprintName === 'function') { try { _updateRailSprintName(); } catch(_){} }
  }

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

  /* ── Получить НКЧ в часах из настроек ── */
  function getCurrentRoleNkcHours() {
    if (!_settings) return 145;
    if (_currentRoleNkcKey === 'january') return _settings.nkcJanuary || 105;
    if (_currentRoleNkcKey === 'may')     return _settings.nkcMay     || 119;
    return _settings.nkcOther || 145;
  }

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

  function doRecalcResource() {
    if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
      toast(T('toastAssigneesEmpty'));
      return;
    }
    var nkc = getCurrentRoleNkcHours();
    var kpeMap = _migrateKpeObject(_settings.kpe || {});
    var mm = !!(_settings && _settings.manualPersonalResource);
    Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
      if (mm) return;
      var entry = _currentRolePP.resourcesByAssignee[login];
      var g = _migrateGrade(entry.grade);
      var kpe   = (kpeMap[g] !== undefined) ? kpeMap[g] : (KPE_DEFAULTS_LOCAL[g] || 0.65);
      var rate  = _settings.rate         !== undefined ? _settings.rate         : 1;
      var parti = _settings.participation !== undefined ? _settings.participation : 1;
      entry.resource = nkc * kpe * rate * parti;
    });
    _currentRolePP.nkcKey = _currentRoleNkcKey;
    _currentRolePP.calculatedAt = Date.now();
    renderCurrentRoleAssigneeTable();
    updateCurrentRoleTotals();
    saveCurrentRoleState();
    toast(T('toastResourceRecalc'), 'success');
  }

  /* ─── «Подобрать исполнителей» — загрузить актуальный список из бандла поля ─── */
  function doCurrentRoleCalc() {
    if (!_currentSprintRoleRec) { toast(T('toastSelectSprint')); return; }
    if (!_settings) { toast(T('toastFillSettings')); return; }

    var rec = _currentSprintRoleRec;
    var nkc = getCurrentRoleNkcHours();

    // Сохраняем текущие грейды из снэпшота — они не должны теряться при перезагрузке
    var savedGrades = {};
    if (_currentRolePP && _currentRolePP.resourcesByAssignee) {
      Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
        savedGrades[login] = _migrateGrade(_currentRolePP.resourcesByAssignee[login].grade) || 'Middle';
      });
    }
    var manualMode = !!(_settings && _settings.manualPersonalResource);
    var savedResources = {};
    if (manualMode && _currentRolePP && _currentRolePP.resourcesByAssignee) {
      Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
        var e = _currentRolePP.resourcesByAssignee[login];
        savedResources[login] = { resource: e.resource, manualResource: e.manualResource };
      });
    }

    // Определить роли спринта
    var roles;
    if (rec.roleKey) {
      // Снэпшот из истории — одна конкретная роль
      var singleRole = ALL_ROLES.find(function(r){ return r.key === rec.roleKey; });
      roles = singleRole ? [singleRole] : [];
    } else {
      /* v5.6.0 — Этап 4 (4c): legacy #distribRoleSel удалён. Активная роль читается из
         _activeSubtab (текущий уровень «Люди» или раскрытая accordion-карточка) или
         localStorage.ssp_lastActiveRole. */
      var selectedRoleKey = _activeSubtab;
      if (!selectedRoleKey) {
        selectedRoleKey = safeLs.get('ssp_lastActiveRole') || '';
      }
      if (selectedRoleKey) {
        var selectedRole = ALL_ROLES.find(function(r){ return r.key === selectedRoleKey; });
        roles = selectedRole ? [selectedRole] : getActiveRoles();
      } else {
        toast(T('toastSelectRoleFirst'));
        return;
      }
    }

    // Сохранить выбранную роль в PP для восстановления при следующем открытии
    if (roles.length === 1 && _currentRolePP) {
      _currentRolePP.roleKey = roles[0].key;
    }

    // Уникальные поля пользователей по ролям
    var fieldNames = [];
    roles.forEach(function(role) {
      var fn = (_settings && role) ? (_settings[role.userField] || null) : null;
      if (fn && fieldNames.indexOf(fn) < 0) fieldNames.push(fn);
    });

    if (!fieldNames.length) {
      toast(T('toastNoUserField'));
      return;
    }

    var pickBtn = document.getElementById('currentRolePickBtn');
    var calcBtn = document.getElementById('currentRoleCalcBtn');
    if (pickBtn) { pickBtn.disabled = true; pickBtn.textContent = T('toastPickLoading'); }
    if (calcBtn) { calcBtn.disabled = true; }

    // Параллельные запросы по всем полям
    var promises = fieldNames.map(function(fn) {
      return apiGet('get-user-field-values?fieldName=' + encodeURIComponent(fn))
        .then(function(r) {
          diag('get-user-field-values [' + fn + ']: ' + ((r && r.users) ? r.users.length : 0) + ' users', (r && r.users && r.users.length) ? 'ok' : 'warn');
          return (r && r.users) ? r.users : [];
        }).catch(function(e) {
          diag('get-user-field-values [' + fn + '] ERR: ' + String(e), 'err');
          return [];
        });
    });

    Promise.all(promises).then(function(bundleResults) {
      var assigneeSet = {};

      // 1. Объединить пользователей из бандлов всех полей
      bundleResults.forEach(function(users) {
        users.forEach(function(u) {
          var login = u.login || '';
          if (!login || assigneeSet[login]) return;
          // Сохранить грейд из снэпшота если был, иначе Middle (canonical default)
          var grade = savedGrades[login] || 'Middle';
          var kpeMap = _migrateKpeObject(_settings.kpe || {});
          var kpe   = (kpeMap[grade] !== undefined) ? kpeMap[grade] : (KPE_DEFAULTS_LOCAL[grade] || 0.65);
          var rate  = _settings.rate         !== undefined ? _settings.rate         : 1;
          var parti = _settings.participation !== undefined ? _settings.participation : 1;
          var computedRes = nkc * kpe * rate * parti;
          var prevRes = manualMode ? savedResources[login] : null;
          assigneeSet[login] = {
            login:        login,
            assigneeName: u.fullName || login,
            grade:        grade,
            resource:     (prevRes && typeof prevRes.resource === 'number') ? prevRes.resource : computedRes,
          };
          if (prevRes && typeof prevRes.manualResource === 'number') {
            assigneeSet[login].manualResource = prevRes.manualResource;
          }
        });
      });

      // 2. Исполнители уже назначены в задачах, но не попали в бандл — добавить с пометкой
      if (_currentRolePP && _currentRolePP.taskAssignments) {
        Object.keys(_currentRolePP.taskAssignments).forEach(function(issueId) {
          var ta = _currentRolePP.taskAssignments[issueId];
          if (!ta || !ta.assignee || assigneeSet[ta.assignee]) return;
          var grade = savedGrades[ta.assignee] || 'Middle';
          var kpeMap = _migrateKpeObject(_settings.kpe || {});
          var kpe   = (kpeMap[grade] !== undefined) ? kpeMap[grade] : (KPE_DEFAULTS_LOCAL[grade] || 0.65);
          var rate  = _settings.rate !== undefined ? _settings.rate : 1;
          var parti = _settings.participation !== undefined ? _settings.participation : 1;
          var computedRes2 = nkc * kpe * rate * parti;
          var prevRes2 = manualMode ? savedResources[ta.assignee] : null;
          assigneeSet[ta.assignee] = {
            login:        ta.assignee,
            assigneeName: ta.assigneeName || ta.assignee,
            grade:        grade,
            resource:     (prevRes2 && typeof prevRes2.resource === 'number') ? prevRes2.resource : computedRes2,
          };
          if (prevRes2 && typeof prevRes2.manualResource === 'number') {
            assigneeSet[ta.assignee].manualResource = prevRes2.manualResource;
          }
        });
      }

      if (!Object.keys(assigneeSet).length) {
        toast(T('toastPickEmpty'));
      } else {
        toast(T('toastPickDone')+': ' + Object.keys(assigneeSet).length, 'success');
      }

      // 3. Обновить список — снэпшот полностью заменяется актуальным бандлом
      _currentRolePP.resourcesByAssignee = assigneeSet;
      _currentRolePP.nkcKey = _currentRoleNkcKey;
      _currentRolePP.calculatedAt = Date.now();

      renderCurrentRoleAssigneeTable();
      renderCurrentRoleTaskTable();   // dropdown исполнителей в задачах обновится
      updateCurrentRoleTotals();
      saveCurrentRoleState();
      var _rk = _currentSprintRoleRec ? _currentSprintRoleRec.roleKey : null;
      if (_rk && typeof refreshPlanningPeopleForCurrentSprint === 'function') {
        try { refreshPlanningPeopleForCurrentSprint(_rk); } catch(_){}
      }

    }).catch(function(e) {
      toast(T('toastPickErr') + ': ' + (e && e.message ? e.message : String(e)));
      diag('doCurrentRoleCalc ERR: ' + String(e), 'err');
    }).finally(function() {
      if (pickBtn) { pickBtn.disabled = false; pickBtn.textContent = T('btnPickAssignees'); }
      if (calcBtn) { calcBtn.disabled = false; }
    });
  }

  /* ── Вспомогательные функции ── */
  function deepClone(obj) { return UTIL_PURE.deepClone(obj); }
  /* v5.7.0 — Этап 5 (D45): структура `taskAssignments[issueId]`:
       { assignee: 'login', assigneeName: 'Display Name',
         dateStart: <ts>, dateEnd: <ts>,
         ganttColor?: '#abcdef'  // опциональный кеш, инвалидируется на любой write через delete entry.ganttColor;
                                // primary источник цвета — assignee через assigneeColorOf(login, allLogins). }
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
  var GRADES_LOCAL = ['Intern', 'Junior', 'Middle', 'Senior'];
  var KPE_DEFAULTS_LOCAL = { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 };
  /* _migrateGrade/_migrateKpeObject (+ legacy-мапа грейдов) вынесены в migrate-pure.js
     (window.__SSP_MIGRATE_PURE). Делегаторы; MIGRATE_PURE объявлен выше по файлу. */
  function _migrateGrade(g)       { return MIGRATE_PURE.migrateGrade(g); }
  function _migrateKpeObject(kpe) { return MIGRATE_PURE.migrateKpeObject(kpe); }

  /* ── Таблица исполнителей ── */
  /* _pendingDelAssigneeLogin removed — delAssigneeOverlay migrated to openModal() (Phase 1 #32). */

  /* v1.4.0 — Resource breakdown по системам для одного исполнителя.
     Активные items (PLANNED+UNPLANNED), отфильтрованные по taskAssignments[id].assignee===login,
     группируются по item.system (или '__none__'). Часы — alloc/60 либо max(0, est-fact)/60.
     Возвращает массив {system, hours, percent} sorted by hours desc. */
  function calcAssigneeAllocByProject(login) {
    if (!_currentSprintRoleRec || !_currentRolePP) return [];
    var rec = _currentSprintRoleRec;
    var rk = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (getActiveRoles()[0] || ALL_ROLES[0]).key;
    var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : (rec.items || []);
    var ta = _currentRolePP.taskAssignments || {};
    var byKey = {};
    items.forEach(function(item) {
      if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
      if (!ta[item.issueId] || ta[item.issueId].assignee !== login) return;
      var alloc = item['alloc_'+rk];
      var est   = item['estimate_'+rk];
      var fact  = item['fact_'+rk];
      var allocVal = (alloc !== null && alloc !== undefined)
        ? alloc / 60
        : Math.max(0, ((est||0) - (fact||0))) / 60;
      var key = item.system ? String(item.system) : '__none__';
      byKey[key] = (byKey[key] || 0) + allocVal;
    });
    var entry = _currentRolePP.resourcesByAssignee[login];
    var totalRes = (entry && typeof entry.resource === 'number') ? entry.resource : 0;
    var rows = Object.keys(byKey).map(function(k) {
      var hours = Math.round(byKey[k] * 100) / 100;
      var percent = totalRes > 0 ? Math.round((hours / totalRes) * 100) : null;
      return { system: k, hours: hours, percent: percent };
    });
    rows.sort(function(a, b){ return b.hours - a.hours; });
    return rows;
  }

  /* v2.1.0 E1 — Hybrid controlled-mode Ring Table.
     Ring Table renders inside host #currentRoleAssigneeHost. IIFE owns state
     (_currentRolePP.resourcesByAssignee, manualMode/showByProj flags, all
     change/click handlers); Ring Table is visual only. Cell renderers return
     HTML strings via { __html } so legacy CSS-classes and data-attrs
     (.currentRole-grade-sel, .currentRole-manual-res, .currentRole-del-assignee)
     are preserved. Cell handlers — single event-delegated listener on host,
     bound idempotently on first render. */
  function renderCurrentRoleAssigneeTable() {
    var host = document.getElementById('currentRoleAssigneeHost');
    if (!host) return;
    var manualMode = !!(_settings && _settings.manualPersonalResource);
    var showByProj = !!(_settings && _settings.fieldSystem && _settings.personalPlanningEnabled);

    if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
      if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch(_) {} }
      host.innerHTML = '<div class="empty">'+esc(T('emptyAssignees'))+'</div>';
      return;
    }

    /* Build items array — pre-computed derived values to keep cell renderers cheap. */
    var items = Object.keys(_currentRolePP.resourcesByAssignee).map(function(login) {
      var entry  = _currentRolePP.resourcesByAssignee[login];
      var used   = calcAssigneeUsed(login);
      var remain = Math.round((entry.resource - used) * 100) / 100;
      return {
        login: login,
        entry: entry,
        used: used,
        remain: remain,
      };
    });

    var columns = [];
    columns.push({
      id: 'assigneeName', title: T('thTeamMember'), sortable: false,
      getValue: function(item) { return esc(item.entry.assigneeName || item.login); }
    });
    columns.push({
      id: 'grade', title: T('thGrade'), sortable: false,
      getValue: function(item) {
        var currentGrade = _migrateGrade(item.entry.grade);
        var html = '<select class="currentRole-grade-sel" data-login="'+esc(item.login)+'" style="width:100%;font-size:12px">'+
          GRADES_LOCAL.map(function(g){
            return '<option value="'+g+'"'+(currentGrade===g?' selected':'')+'>'+esc(T('grade'+g))+'</option>';
          }).join('')+
          '</select>';
        return { __html: html };
      }
    });
    columns.push({
      id: 'resource', title: T('thResourceH'), sortable: false, className: 'td-num',
      getValue: function(item) {
        if (manualMode) {
          var manualVal = (typeof item.entry.manualResource === 'number') ? item.entry.manualResource
                         : (typeof item.entry.resource === 'number' ? item.entry.resource : 0);
          return { __html:
            '<input type="number" min="0" step="0.25" class="currentRole-manual-res" '+
              'data-login="'+esc(item.login)+'" '+
              'value="'+round2(manualVal)+'" '+
              'style="width:80px;font-size:12px;padding:2px 4px;text-align:right;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)"/>'
          };
        }
        return round2(item.entry.resource);
      }
    });
    if (showByProj) {
      columns.push({
        id: 'allocByProject', title: T('thAllocByProject'), sortable: false, className: 'td-alloc-by-sys',
        getValue: function(item) {
          var rows = calcAssigneeAllocByProject(item.login);
          if (!rows.length) return { __html: '<span style="color:var(--muted)">—</span>' };
          var hSuf = T('hourShort');
          var rowsHtml = rows.map(function(r) {
            var sysLabel = r.system === '__none__' ? T('allocBySysNoProject') : r.system;
            var pctStr = (r.percent === null) ? '' : (' · ' + r.percent + '%');
            var over = (r.percent !== null && r.percent > 100);
            var cls = 'alloc-by-sys-row' +
                      (over ? ' alloc-by-sys-row--over' : '') +
                      (r.system === '__none__' ? ' alloc-by-sys-row--nosys' : '');
            return '<div class="'+cls+'">'+esc(sysLabel)+' · '+round2(r.hours)+hSuf+pctStr+(over?' ⚠':'')+'</div>';
          }).join('');
          return { __html: rowsHtml };
        }
      });
    }
    columns.push({
      id: 'remain', title: T('thRemainH'), sortable: false, className: 'td-num',
      getValue: function(item) {
        var color = item.remain < 0 ? 'var(--error)' : 'var(--success)';
        return { __html: '<span style="color:'+color+'">'+round2(item.remain)+'</span>' };
      }
    });
    columns.push({
      id: 'delete', title: '', sortable: false, className: 'ssp-col-action',
      getValue: function(item) {
        return { __html:
          '<button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly currentRole-del-assignee" '+
            'data-login="'+esc(item.login)+'" '+
            'title="'+esc(T('confirmDelAssignee').replace('?',''))+'" '+
            'aria-label="'+esc(T('aria.btnDeleteRow'))+'">'+
            icon('trash', T('aria.btnDeleteRow')).outerHTML+
          '</button>'
        };
      }
    });

    if (window.__SSP_TABLE) {
      window.__SSP_TABLE.mountAt(host, {
        items: items,
        columns: columns,
        sortKey: 'off',
        onSort: function() {},
        getItemKey: function(item) { return item.login; },
        stickyHeader: true,
        emptyText: T('emptyAssignees'),
      });
    }

    /* Event delegation — idempotent. Bind ONCE on host for change events;
       bind ONCE on document for click events (Ring Table's row click handlers
       intercept bubbling, so host-level click delegation does not fire — same
       pattern as _bindSortHeaders / _bindCheckboxEvents). */
    if (!host.__sspAssigneeHandlersBound) {
      host.__sspAssigneeHandlersBound = true;

      host.addEventListener('change', function(ev) {
        var t = ev.target;
        if (!t || !t.matches) return;
        /* Grade select change */
        if (t.matches('select.currentRole-grade-sel[data-login]')) {
          var login = t.getAttribute('data-login');
          if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login]) return;
          _currentRolePP.resourcesByAssignee[login].grade = t.value;
          var mm = !!(_settings && _settings.manualPersonalResource);
          if (!mm) {
            var nkc2  = getCurrentRoleNkcHours();
            var kpeMap = _migrateKpeObject(_settings.kpe || {});
            var kpe   = (kpeMap[t.value] !== undefined) ? kpeMap[t.value] : (KPE_DEFAULTS_LOCAL[t.value] || 0.65);
            var rate  = _settings.rate !== undefined ? _settings.rate : 1;
            var parti = _settings.participation !== undefined ? _settings.participation : 1;
            _currentRolePP.resourcesByAssignee[login].resource = nkc2 * kpe * rate * parti;
            renderCurrentRoleAssigneeTable();
            updateCurrentRoleTotals();
          }
          saveCurrentRoleState();
          return;
        }
        /* Manual resource input change */
        if (t.matches('input.currentRole-manual-res[data-login]')) {
          var login2 = t.getAttribute('data-login');
          if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login2]) return;
          var v = parseFloat(t.value);
          if (!isFinite(v) || v < 0) v = 0;
          _currentRolePP.resourcesByAssignee[login2].manualResource = v;
          _currentRolePP.resourcesByAssignee[login2].resource = v;
          renderCurrentRoleAssigneeTable();
          updateCurrentRoleTotals();
          saveCurrentRoleState();
          return;
        }
      });
    }

    /* v2.1.14 — MOUSEDOWN-capture делегат (как в renderRoleComposition): Ring Table
       на mousedown пересоздаёт строку → первый `click` не генерируется браузером
       (доказано: mousedown✅ mouseup✅ click❌) → старый .onclick реагировал со 2-го
       клика. Слушаем mousedown (приходит первым, всегда), действие сразу. Переживает
       Ring re-render → per-button rebind + MutationObserver не нужны. Только ЛКМ. */
    if (!host.__sspDelCaptureBound) {
      host.__sspDelCaptureBound = true;
      host.addEventListener('mousedown', function(ev) {
        if (ev.button !== 0) return;
        var tgt = ev.target;
        if (!tgt || typeof tgt.closest !== 'function') return;
        var btn = tgt.closest('button.currentRole-del-assignee[data-login]');
        if (!btn || !host.contains(btn)) return;
        ev.preventDefault(); ev.stopPropagation();
        var login = btn.getAttribute('data-login');
        if (!_currentRolePP || !_currentRolePP.resourcesByAssignee[login]) return;
        openModal({
          id: 'delAssignee',
          type: 'destructive',
          title: T('confirmDelAssignee'),
          body: { kind: 'text', text: T('confirmDelAssignee') },
          buttons: [
            { id: 'cancel', text: T('btnCancel'), variant: 'secondary', onClick: function(h) { h.close(); } },
            { id: 'confirm', text: T('btnYesDelete'), variant: 'danger', onClick: function(h) {
              h.close();
              if (_currentRolePP && _currentRolePP.resourcesByAssignee) {
                delete _currentRolePP.resourcesByAssignee[login];
              }
              renderCurrentRoleAssigneeTable();
              renderCurrentRoleTaskTable();
              updateCurrentRoleTotals();
              saveCurrentRoleState();
              toast(T('toastAssigneeDeleted'), 'success');
            }},
          ],
          dismissOnBackdrop: false,
          blockEscape: false,
          showCloseButton: false,
        });
      }, true);
    }
  }


  /* Округление до 2 знаков как строка. v2.4.14 — ВОССТАНОВЛЕНА: ошибочно удалена
     dead-code аудитом (commit b1a39e1) рядом с calcAssigneeUsed при 6 живых вызовах
     в таблице «Распределение по исполнителям» (ресурс/остаток/итоги) → ReferenceError
     → ресурсы не заполнялись, подбор исполнителей не отображался. */
  function round2(v) { return (Math.round((v||0)*100)/100).toFixed(2); }

  /* Сумма «использовано» (часы) по исполнителю для текущей роли.
     v2.4.11 — ВОССТАНОВЛЕНА: ошибочно удалена dead-code аудитом (commit b1a39e1,
     2026-06-03) при живых вызовах в renderCurrentRoleAssigneeTable + updateCurrentRoleTotals
     → ReferenceError на уровне «Распределение по исполнителям» (баг в проде с v2.2.0). */
  function calcAssigneeUsed(login) {
    if (!_currentSprintRoleRec || !_currentRolePP) return 0;
    var rec = _currentSprintRoleRec;
    // Для активного спринта используем roleKey сохранённый в PP (выбранный пользователем)
    // Для снэпшота — roleKey из записи истории
    var rk = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (getActiveRoles()[0] || ALL_ROLES[0]).key;
    /* v5.0.3 — если запись соответствует активному _sprint, берём live items
       из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
    var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : (rec.items || []);
    var ta = _currentRolePP.taskAssignments || {};
    return items.reduce(function(sum, item) {
      if (!ta[item.issueId]) return sum;
      if (ta[item.issueId].assignee !== login) return sum;
      if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return sum;
      var alloc = item['alloc_'+rk];
      var est   = item['estimate_'+rk];
      var fact  = item['fact_'+rk];
      var allocVal = (alloc !== null && alloc !== undefined)
        ? alloc / 60  // в часы
        : Math.max(0, ((est||0) - (fact||0))) / 60;
      return sum + allocVal;
    }, 0);
  }

  /* ── Обновить итоги ── */
  function updateCurrentRoleTotals() {
    if (!_currentRolePP) {
      document.getElementById('currentRoleTotalResource').textContent = '—';
      document.getElementById('currentRoleTotalRemain').textContent = '—';
      return;
    }
    var totalRes = 0;
    Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function(login) {
      totalRes += _currentRolePP.resourcesByAssignee[login].resource || 0;
    });
    var totalUsed = 0;
    Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function(login) {
      var used = calcAssigneeUsed(login);
      totalUsed += used;
    });
    var totalRemain = totalRes - totalUsed;
    document.getElementById('currentRoleTotalResource').textContent = round2(totalRes);
    var remEl = document.getElementById('currentRoleTotalRemain');
    remEl.textContent = round2(totalRemain);
    remEl.style.color = totalRemain < 0 ? 'var(--error)' : 'var(--success)';
  }

  /* ── Таблица задач ── */
  /* v2.0.0 D128 D7 — Hybrid controlled-mode Ring Table.
     Ring Table renders inside host #currentRoleTaskHost. IIFE owns state
     (getSortKey, _currentRolePP, save handlers); Ring Table is visual only.
     Cell renderers return HTML strings via { __html } so legacy CSS-classes
     and data-attrs (.currentRole-task-assignee, data-ssp-datepicker-host)
     are preserved. Cell change handlers — single event-delegated listener
     on host, bound idempotently on first render. */
  function renderCurrentRoleTaskTable() {
    var host = document.getElementById('currentRoleTaskHost');
    if (!host) return;
    /* DatePicker mount/unmount lifecycle is owned by SspDatePickerCell (React
       useEffect cleanup). NO manual __SSP_DATEPICKER.unmountAll / mountAllIn
       calls here — that would double-mount or strip stable roots. */
    if (!_currentSprintRoleRec) {
      if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch(_) {} }
      host.innerHTML = '<div class="empty">'+esc(T('emptyTaskCurrentRole'))+'</div>';
      return;
    }
    var rec = _currentSprintRoleRec;
    var rk  = rec.roleKey || (_currentRolePP && _currentRolePP.roleKey) || (getActiveRoles()[0] || ALL_ROLES[0]).key;
    /* v5.0.3 — если запись соответствует активному _sprint, берём live items
       из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
    var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : (rec.items || []);
    var active = items.filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    /* ta defined before sort so multiKeySort can resolve assignee from task-assignments. */
    var ta  = (_currentRolePP && _currentRolePP.taskAssignments) ? _currentRolePP.taskAssignments : {};
    /* v6.1.0 D81 (F4) — multi-key sort на «Люди». Ring Table получает items
       уже отсортированными; sortKey/sortOrder только для header affordance. */
    if (typeof multiKeySort === 'function') active = multiKeySort(active, undefined, ta);
    if (!active.length) {
      if (window.__SSP_TABLE) { try { window.__SSP_TABLE.unmountAt(host); } catch(_) {} }
      host.innerHTML = '<div class="empty">'+esc(T('currentRoleNoTasks'))+'</div>';
      return;
    }
    var rba = (_currentRolePP && _currentRolePP.resourcesByAssignee) ? _currentRolePP.resourcesByAssignee : {};
    var assigneeOptions = Object.keys(rba);
    var sprintStart = rec.dateStart || (_sprint && _sprint.dateStart);
    var sprintEnd   = rec.dateEnd   || (_sprint && _sprint.dateEnd);
    var sprintStartDate = sprintStart ? toDateIn(sprintStart) : '';
    var sprintEndDate   = sprintEnd   ? toDateIn(sprintEnd)   : '';

    function _renderExternalTicketInner(val) {
      if (!val) return '<span style="color:var(--muted)">—</span>';
      var safe = esc(String(val));
      var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block"';
      if (/^https?:\/\//i.test(val)) {
        return '<span '+style+' title="'+safe+'"><a href="'+safeUrl(val)+'" target="_blank" rel="noopener noreferrer" class="link">'+safe+'</a></span>';
      }
      return '<span '+style+' title="'+safe+'">'+safe+'</span>';
    }

    var columns = [];
    columns.push({
      id: 'id', title: T('thId'), sortable: true, className: 'td-id',
      getValue: function(item) {
        return { __html: '<a href="'+safeUrl(item.url||'')+'" target="_blank" class="link">'+esc(item.issueId)+'</a>' };
      }
    });
    if (_settings && _settings.fieldExternalTicketId) {
      columns.push({
        id: 'externalTicketId', title: T('thExternalTicketId'), sortable: true,
        getValue: function(item) { return { __html: _renderExternalTicketInner(item.externalTicketId) }; }
      });
    }
    columns.push({
      /* min-width keeps task titles legible (default Ring cell collapses to text wrap on every word). */
      id: 'title', title: T('thTitle'), sortable: false, className: 'td-title ssp-col-title',
      getValue: function(item) {
        var taEntry = ta[item.issueId] || {};
        var ts = taEntry.dateStart || null;
        var te = taEntry.dateEnd   || null;
        var oor = (ts && sprintStart && ts < sprintStart) || (te && sprintEnd && te > sprintEnd);
        var warn = oor ? '<span style="color:var(--error);font-size:11px;margin-left:4px">⚠ '+esc(T('outOfRangeWarn') || 'вне диапазона')+'</span>' : '';
        return { __html: esc(item.title||'') + warn };
      }
    });
    columns.push({
      id: 'priority', title: T('thPriority'), sortable: true, className: 'td-priority',
      getValue: function(item) { return esc(dispEnum(item.priority) || '—'); }
    });
    if (_settings && _settings.fieldXPriority) {
      columns.push({
        id: 'xpriority', title: T('thXpriority'), sortable: true, className: 'td-xpriority',
        getValue: function(item) { return esc(dispEnum(item.xpriority) || '—'); }
      });
    }
    columns.push({
      id: 'allocH', title: T('thAllocH'), sortable: false, className: 'td-num',
      getValue: function(item) {
        var alloc = item['alloc_'+rk];
        var est = item['estimate_'+rk];
        var fact = item['fact_'+rk];
        var allocVal = (alloc !== null && alloc !== undefined) ? alloc : Math.max(0, (est||0) - (fact||0));
        return (allocVal / 60).toFixed(2);
      }
    });
    if (_settings && _settings.fieldSystem) {
      columns.push({
        id: 'system', title: T('thSystem'), sortable: true, className: 'td-system',
        getValue: function(item) { return esc(item.system || '—'); }
      });
    }
    /* v1.10.0 B-23 — assignee sortable. compareAssignee применён в multiKeySort
       выше; здесь sortable: true только для header affordance + onSort callback. */
    columns.push({
      id: 'assignee', title: T('thAssignee'), sortable: true,
      getValue: function(item) {
        var taEntry = ta[item.issueId] || {};
        var html = '<select class="currentRole-task-assignee assigner-btn" data-issue="'+esc(item.issueId)+'" style="width:100%;font-size:12px">'+
          '<option value="">'+esc(T('phNotAssigned'))+'</option>'+
          assigneeOptions.map(function(login){
            var entry = rba[login];
            return '<option value="'+esc(login)+'"'+(taEntry.assignee===login?' selected':'')+'>'+esc(entry.assigneeName||login)+'</option>';
          }).join('')+
          '</select>';
        return { __html: html };
      }
    });
    columns.push({
      id: 'dateStart', title: T('thStart'), sortable: false, className: 'td-date td-start',
      getValue: function(item) {
        var taEntry = ta[item.issueId] || {};
        var ts = taEntry.dateStart || null;
        /* __type: 'datepicker' marker → SspDatePickerCell preserves DatePicker
           React root across Ring Table row re-renders (focus changes). HTML
           string would tear the inner mount down — see D7 lesson #24. */
        return {
          __type: 'datepicker',
          issue: item.issueId,
          className: 'currentRole-task-date currentRole-task-start',
          dateValue: ts ? toDateIn(ts) : sprintStartDate,
          min: sprintStartDate,
          max: sprintEndDate,
        };
      }
    });
    columns.push({
      id: 'dateEnd', title: T('thFinish'), sortable: false, className: 'td-date td-end',
      getValue: function(item) {
        var taEntry = ta[item.issueId] || {};
        var te = taEntry.dateEnd || null;
        return {
          __type: 'datepicker',
          issue: item.issueId,
          className: 'currentRole-task-date currentRole-task-end',
          dateValue: te ? toDateIn(te) : sprintEndDate,
          min: sprintStartDate,
          max: sprintEndDate,
        };
      }
    });

    if (window.__SSP_TABLE) {
      window.__SSP_TABLE.mountAt(host, {
        items: active,
        columns: columns,
        sortKey: getSortKey(),
        onSort: function(nextKey) {
          /* IIFE owns sort state. nextKey is already cycled (off↔active) by table-mount. */
          setSortKey(nextKey);
          if (typeof _rerenderAllSortableTables === 'function') {
            _rerenderAllSortableTables();
          } else {
            renderCurrentRoleTaskTable();
          }
        },
        getItemKey: function(item) { return item.issueId; },
        stickyHeader: true,
        emptyText: T('currentRoleNoTasks'),
      });
    }

    /* Event delegation для cell handlers — idempotent. Bind ONCE per host.
       Survives Ring Table re-renders (rows might be recreated by React). */
    if (!host.__sspHandlersBound) {
      host.__sspHandlersBound = true;
      host.addEventListener('change', function(ev) {
        var t = ev.target;
        if (!t) return;
        /* Assignee select change */
        var sel = (t.matches && t.matches('select.currentRole-task-assignee[data-issue]')) ? t : null;
        if (sel) {
          var issueId = sel.getAttribute('data-issue');
          if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
          if (!_currentRolePP.taskAssignments[issueId]) _currentRolePP.taskAssignments[issueId] = {};
          var login = sel.value;
          var rba2 = (_currentRolePP.resourcesByAssignee) || {};
          _currentRolePP.taskAssignments[issueId].assignee = login;
          _currentRolePP.taskAssignments[issueId].assigneeName = login
            ? ((rba2[login] && rba2[login].assigneeName) || login)
            : '';
          /* v5.7.0 — cross-section sync — invalidate ganttColor cache */
          delete _currentRolePP.taskAssignments[issueId].ganttColor;
          var ganttTab = document.getElementById('tab-gantt');
          if (ganttTab && !ganttTab.classList.contains('hidden')
              && typeof renderGanttChart === 'function') {
            try { renderGanttChart(); } catch(e){ diag('renderGanttChart sync err: '+e,'err'); }
          }
          updateCurrentRoleTotals();
          updateCurrentRoleAssigneeRemain();
          if (_settings && _settings.fieldSystem && _settings.personalPlanningEnabled) {
            try { renderCurrentRoleAssigneeTable(); } catch(_){}
          }
          saveCurrentRoleState();
          var rkNow = _currentSprintRoleRec && _currentSprintRoleRec.roleKey;
          updateIssueAssigneeField(issueId, login, rkNow);
          return;
        }
        /* DatePicker host change — target is the host span itself (Ring DatePicker
           dispatches change на host через __SSP_DATEPICKER). */
        var dateHost = (t.closest) ? t.closest('span.currentRole-task-date[data-issue]') : null;
        if (dateHost) {
          var issueIdD = dateHost.getAttribute('data-issue');
          if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
          if (!_currentRolePP.taskAssignments[issueIdD]) _currentRolePP.taskAssignments[issueIdD] = {};
          var isStart = dateHost.classList.contains('currentRole-task-start');
          var raw = dateHost.dataset.value || '';
          var tsv = raw ? new Date(raw).getTime() : null;
          if (isStart) {
            _currentRolePP.taskAssignments[issueIdD].dateStart = tsv;
          } else {
            _currentRolePP.taskAssignments[issueIdD].dateEnd = tsv;
          }
          var ss = (_currentSprintRoleRec && _currentSprintRoleRec.dateStart) || (_sprint && _sprint.dateStart);
          var se = (_currentSprintRoleRec && _currentSprintRoleRec.dateEnd)   || (_sprint && _sprint.dateEnd);
          var oor = (tsv && isStart && ss && tsv < ss) || (tsv && !isStart && se && tsv > se);
          dateHost.style.outline = oor ? '1px solid var(--error)' : '';
          dateHost.style.borderRadius = oor ? '4px' : '';
          saveCurrentRoleState();
        }
      });
    }

    /* No manual DatePicker mount here — SspDatePickerCell handles its own
       lifecycle inside React (useEffect). */
  }

  /* v2.1.0 E1 — Ring Table is React-owned: per-row remain cells no longer have
     stable IDs to mutate directly. Re-render through Ring Table mountAt (cheap:
     items array rebuild + React reconciliation), then update totals. */
  function updateCurrentRoleAssigneeRemain() {
    if (!_currentRolePP) return;
    renderCurrentRoleAssigneeTable();
    updateCurrentRoleTotals();
  }

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

  /* ── Сохранить состояние personalPlanning / gantt ── */
  function saveCurrentRoleState() {
    if (!_currentSprintRoleRec) return;
    /* v5.0.3 — отметить dirty и запушить в backend draft debounce'ом */
    _markDirty('currentRole');
    _draftSaveDebounced('currentRole', function(){
      return { pp: _currentRolePP, gantt: _currentRoleGantt, nkcKey: _currentRoleNkcKey,
               sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null };
    });
    /* v6.3.0 D109 — после изменений на «Распределение по исполнителям» обновлять
       summary в шапке (currentRoleTotalResource/Remain) + accordion-карточку этой роли
       на подвкладке «Аллокация общего ресурса», чтобы цифры там не отставали. */
    try {
      if (typeof updateCurrentRoleTotals === 'function') updateCurrentRoleTotals();
      var _rkForStats = _currentSprintRoleRec && _currentSprintRoleRec.roleKey;
      if (_rkForStats && typeof _updateRoleAccordionStats === 'function') {
        _updateRoleAccordionStats(_rkForStats);
      }
    } catch(e){ diag('saveCurrentRoleState stats refresh err: '+e,'err'); }

    /* v6.1.0 D82 (F5) — assigner-роль (variant b): assigner НЕ имеет editor-прав, поэтому
       обычные POST /history и POST /sprint-data вернут 403. Используем action=assignerSync —
       backend перезапишет ТОЛЬКО personalPlanning в существующих записях. */
    var assignerOnly = !_isEditor && _isAssigner;

    /* v5.0.3 — теперь все варианты — записи истории. Обновляем запись в _history.
       Если запись соответствует активному _sprint — также обновляем _sprint.personalPlanning. */
    var histRec = _history.find(function(r){ return r.sprintId === _currentSprintRoleRec.sprintId; });
    if (histRec) {
      histRec.personalPlanning = deepClone(_currentRolePP);
    }
    if (assignerOnly) {
      var minimalHistory = histRec
        ? [{ sprintId: histRec.sprintId, personalPlanning: deepClone(_currentRolePP) }]
        : [];
      apiPost('history', { history: minimalHistory }, { action: 'assignerSync' })
        .catch(function (e) { diag('saveCurrentRoleState(history,assignerSync) failed: ' + e, 'err'); });
    } else {
      apiPost('history', { history: _history })
        .catch(function (e) { diag('saveCurrentRoleState(history) failed: ' + e, 'err'); });
    }

    if (isActiveSprintRecord(_currentSprintRoleRec)) {
      _sprint.personalPlanning = deepClone(_currentRolePP);
      if (assignerOnly) {
        apiPost('sprint-data', { sprint: { personalPlanning: deepClone(_currentRolePP) } }, { action: 'assignerSync' })
          .catch(function (e) { diag('saveCurrentRoleState(sprint,assignerSync) failed: ' + e, 'err'); });
      } else {
        apiPost('sprint-data', { sprint: _sprint })
          .then(function () {
            if (_settings && _settings.usePersonalForResource && typeof applyPersonalResourceToInputs === 'function') {
              applyPersonalResourceToInputs();
            }
          })
          .catch(function (e) { diag('saveCurrentRoleState(active-sync) failed: ' + e, 'err'); });
      }
    }
  }

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

  function renderGanttChart() {
    var container = document.getElementById('ganttContainer');
    var emptyEl   = document.getElementById('ganttEmpty');
    if (!_currentSprintRoleRec || !_currentRolePP) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    var rec = _currentSprintRoleRec;
    var rk  = rec.roleKey || (getActiveRoles()[0] || ALL_ROLES[0]).key;
    /* v5.0.3 — если запись соответствует активному _sprint, берём live items
       из _roleItems[rk] (могут быть свежее snapshot); иначе — items из истории. */
    var _isActiveSprint = isActiveSprintRecord(rec);
    var items = _isActiveSprint ? getRoleItemsArr(rk) : (rec.items || []);
    var active = items.filter(function(i){ return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0; });
    var ta  = (_currentRolePP.taskAssignments || {});
    /* v6.1.0 D81 (F4) — multi-key sort на Ганте. */
    if (typeof multiKeySort === 'function') active = multiKeySort(active, undefined, ta);
    var gt  = (_currentRoleGantt && _currentRoleGantt.tasks) ? _currentRoleGantt.tasks : {};
    /* v5.7.0 — Этап 5 (D47): allLogins для round-robin палитры цветов.
       Стабильная сортировка: тот же логин получает один и тот же цвет независимо от состава. */
    var ra  = (_currentRolePP.resourcesByAssignee) || {};
    var allLogins = Object.keys(ra);

    // Задачи с назначенными датами
    var ganttItems = active.map(function(item) {
      var issueId = item.issueId;
      var ta_entry = ta[issueId] || {};
      var sprintStart = rec.dateStart || (_sprint && _sprint.dateStart);
      var sprintEnd   = rec.dateEnd   || (_sprint && _sprint.dateEnd);
      var start = ta_entry.dateStart || sprintStart;
      var end   = ta_entry.dateEnd   || sprintEnd;
      /* v2.1.14 — цвет полосы = родной цвет состояния YT (item.stateColor).
         Fallback — нейтральный серый при отсутствии state или цвета. */
      var bg = (item.stateColor && item.stateColor.background)
        ? item.stateColor.background
        : ASSIGNEE_FALLBACK_COLOR;
      return {
        issueId:        issueId,
        title:          item.title || issueId,
        url:            item.url || '',
        assignee:       ta_entry.assigneeName || ta_entry.assignee || T('ganttBarTooltipUnassigned'),
        start:          start,
        end:            end,
        bg:             bg,
        state:          item.state || '',
        stateLocalized: item.stateLocalized || item.state || '',
        stateColor:     item.stateColor || null,
        stateFieldId:   item.stateFieldId || null,
      };
    }).filter(function(g){ return g.start && g.end; });

    if (!ganttItems.length) {
      if (emptyEl) emptyEl.style.display = '';
      container.innerHTML = '';
      container.appendChild(emptyEl || document.createTextNode(T('histNoDates')));
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Определить диапазон
    var minTs = Math.min.apply(null, ganttItems.map(function(g){ return g.start; }));
    var maxTs = Math.max.apply(null, ganttItems.map(function(g){ return g.end;   }));
    var dayMs = 86400000;
    var totalDays = Math.max(1, Math.ceil((maxTs - minTs) / dayMs)) + 1;

    // ── Цвета Ганта
    // v5.7.0 — Этап 5 (D47): hardcoded словарь GANTT_COLORS удалён.
    // Цвет полосы — per-assignee, вычислен в map выше через assigneeColorOf(login, allLogins).

    // Построить HTML-таблицу Ганта
    var html = '<table style="border-collapse:collapse;min-width:600px;font-size:12px">';

    // Шапка: дни
    html += '<thead><tr>';
    html += '<th style="min-width:180px;max-width:220px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);position:sticky;left:0;z-index:2;white-space:nowrap;font-weight:600;font-size:12px">'+T('ganttColTask')+'</th>';
    for (var d = 0; d < totalDays; d++) {
      var dayTs = minTs + d * dayMs;
      var dayDate = new Date(dayTs);
      var dayLabel = (dayDate.getDate()) + '.' + String(dayDate.getMonth()+1).padStart(2,'0');
      var isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      // Даты — чёрный читаемый шрифт; выходные чуть светлее
      var dateColor = isWeekend ? 'var(--muted)' : 'var(--text)';
      var dateBg    = isWeekend ? 'rgba(255,255,255,.03)' : 'var(--surface2)';
      html += '<th style="min-width:34px;padding:4px 3px;background:'+dateBg+';border:1px solid var(--border);font-weight:700;font-size:11px;color:'+dateColor+';text-align:center;white-space:nowrap">'+dayLabel+'</th>';
    }
    html += '</tr></thead><tbody>';

    ganttItems.forEach(function(g) {
      var startDay = Math.round((g.start - minTs) / dayMs);
      var endDay   = Math.round((g.end   - minTs) / dayMs);
      /* v5.7.0 — Этап 5: цвет уже вычислен в g.bg через assigneeColorOf */

      html += '<tr data-gantt-issue="'+esc(g.issueId)+'">';
      html += '<td style="padding:4px 8px;border:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:1;max-width:220px;overflow:hidden" title="'+esc(g.title)+'">' +
              '<a href="'+safeUrl(g.url)+'" target="_blank" class="link" style="font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(g.issueId)+'</a>' +
              '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(g.assignee)+'</div>' +
              _renderGanttStateBadge(g, _isActiveSprint) +
              '</td>';

      for (var d2 = 0; d2 < totalDays; d2++) {
        var inBar   = d2 >= startDay && d2 <= endDay;
        var isStart = d2 === startDay;
        var isEnd   = d2 === endDay;
        var isSingle = isStart && isEnd;

        // Стиль ячейки — нейтральный, без фона; полоса рисуется внутренним div-ом
        var cellStyle = 'padding:0;border:1px solid var(--border);min-width:34px;height:36px;cursor:'+(inBar?'pointer':'default')+';position:relative;overflow:hidden;';

        var innerDiv = '';
        if (inBar) {
          // Высота полосы — 60% высоты ячейки, центрируется через flex
          // border-radius: pill на торцах, прямая линия посередине
          var r = '999px';
          var br;
          if (isSingle) {
            br = r;                                  // полная пилюля
          } else if (isStart) {
            br = r+' 0 0 '+r;                        // скруглён только левый торец
          } else if (isEnd) {
            br = '0 '+r+' '+r+' 0';                  // скруглён только правый торец
          } else {
            br = '0';                                 // середина — без скругления
          }
          // Ячейка занимает полную ширину; start/end добавляют padding чтобы торец не упирался
          var pl = isStart  ? '4px' : '0';
          var pr = isEnd    ? '4px' : '0';
          // Между ячейками полосы нет горизонтального зазора — overflow:hidden обеспечивает ровный стык
          innerDiv = '<div style="'+
            'position:absolute;top:50%;left:'+pl+';right:'+pr+';'+
            'transform:translateY(-50%);'+
            'height:60%;'+
            'background:'+g.bg+';'+
            'border-radius:'+br+';'+
            'box-shadow:0 2px 6px rgba(0,0,0,.18);'+
            'pointer-events:none'+
          '"></div>';
        }

        html += '<td class="gantt-cell" data-issue="'+esc(g.issueId)+'" data-inbar="'+(inBar?'1':'0')+'" style="'+cellStyle+'">'+innerDiv+'</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';

    container.innerHTML = html;

    /* v5.7.0 — Этап 5 (D46): dblclick по бару открывает модал переназначения,
       а не toggle цвета. Старая модель _currentRoleGantt.tasks[].color на запись не используется
       (на чтение остаётся для backward-compat при rollback). */
    var _ganttCells = container.querySelectorAll('.gantt-cell[data-inbar="1"]');
    _ganttCells.forEach(function(cell) {
      var _clickTimer = null;
      cell.addEventListener('click', function() {
        if (_clickTimer) return;
        var issueId = cell.getAttribute('data-issue');
        _clickTimer = setTimeout(function() {
          _clickTimer = null;
          _startPermissionsCheck().then(function() {
            if (!(_settings && _settings.dynEditEnabled)) {
              try { toast(T('ganttReassignDisabledByInlineEdit'), 'warn'); } catch(_){}
              return;
            }
            if (typeof _isEditor !== 'undefined' && _isEditor === false) {
              try { toast(T('ganttReassignNoRights'), 'warn'); } catch(_){}
              return;
            }
            var ganttPanel = document.getElementById('tab-gantt');
            if (ganttPanel && ganttPanel.classList.contains('readonly-mode')) {
              try { toast(T('ganttReassignNoRights'), 'warn'); } catch(_){}
              return;
            }
            if (typeof openReassignModal === 'function') openReassignModal(issueId);
          });
        }, 250);
      });
    });
    if (_isActiveSprint && _settings && _settings.fieldState) {
      var _histIds = ganttItems.map(function(g){ return g.issueId; });
      var _histStates = {};
      var _stateFieldId = '';
      ganttItems.forEach(function(g){
        _histStates[g.issueId] = g.stateLocalized || g.state || '';
        if (!_stateFieldId && g.stateFieldId) _stateFieldId = g.stateFieldId;
      });
      var _histKey = (_currentSprintId || '') + ':' + rk;
      _fetchGanttStateHistory(_histIds, _histKey, false, _histStates, _stateFieldId);
    }
  }

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

  function _renderGanttStateBadge(g, activeSprint) {
    if (!g || (!g.state && !g.stateLocalized)) return '';
    var label  = g.stateLocalized || g.state;
    var pillBg = (g.stateColor && g.stateColor.background) ? g.stateColor.background : '#c8c8c8';
    var pillFg = (g.stateColor && g.stateColor.foreground) ? g.stateColor.foreground : '#1a1a1a';
    var pillHtml =
      '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:10px;' +
      'font-size:10px;line-height:1.4;background:' + pillBg + ';color:' + pillFg + ';' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' +
      '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + pillFg + ';flex-shrink:0"></span>' +
      esc(label) + '</span>';
    var sinceSpan = activeSprint
      ? '<span data-gantt-hist-since="' + esc(g.issueId) + '" style="color:var(--muted);font-size:10px;margin-left:4px"></span>'
      : '';
    var prevDiv = activeSprint
      ? '<div data-gantt-hist-prev="' + esc(g.issueId) + '" style="color:var(--muted);font-size:10px;margin-top:1px;white-space:normal">' + esc(T('ganttStateLoading')) + '</div>'
      : '';
    return '<div style="margin-top:2px;white-space:nowrap;overflow:hidden">' + pillHtml + sinceSpan + '</div>' + prevDiv;
  }

  function _updateGanttHistDOM(container, issueId, hist) {
    var sinceEl = container.querySelector('[data-gantt-hist-since="' + issueId + '"]');
    var prevEl  = container.querySelector('[data-gantt-hist-prev="'  + issueId + '"]');
    if (sinceEl) {
      sinceEl.textContent = hist.sinceTs ? T('ganttStateSince').replace('{date}', _fmtGanttDate(hist.sinceTs)) : '';
    }
    if (prevEl) {
      if (!hist.prev) {
        prevEl.textContent = T('ganttStateNoTransitions');
      } else {
        var dotBg  = (hist.prevColor && hist.prevColor.background) ? hist.prevColor.background : ASSIGNEE_FALLBACK_COLOR;
        var ago    = hist.sinceTs ? _ganttDaysAgo(hist.sinceTs) : null;
        var agoStr = ago !== null ? (' · ' + T('ganttStateAgo').replace('{n}', String(ago))) : '';
        prevEl.innerHTML =
          '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + dotBg + ';margin-right:3px;vertical-align:middle"></span>' +
          esc(T('ganttStateWas').replace('{state}', hist.prev)) + agoStr;
      }
    }
  }

  function _fetchGanttStateHistory(ids, sprintKey, force, curStates, fieldId) {
    if (!ids || !ids.length || !_settings || !_settings.fieldState) return;
    var now = Date.now();
    var TTL = 5 * 60 * 1000;
    if (!force &&
        _ganttStateHist._sprintKey === sprintKey &&
        _ganttStateHist._fetchedAt &&
        (now - _ganttStateHist._fetchedAt) < TTL) return;
    /* Сброс: очищаем все issueId-записи, иначе processChunk пропустит их как «уже загруженные». */
    _ganttStateHist = { _sprintKey: sprintKey, _fetchedAt: 0 };
    curStates = curStates || {};
    fieldId = fieldId || '';
    var CHUNK_SIZE = 25;

    function processChunk(chunkIds) {
      return _host.fetchYouTrack('activities', { query: {
        categories: 'CustomFieldCategory',
        issueQuery: 'issue id: ' + chunkIds.join(', '),
        fields: 'timestamp,target(idReadable),field(id,name,presentation),' +
                'added(name,localizedName,color(background,foreground)),' +
                'removed(name,localizedName,color(background,foreground))',
        reverse: 'true',
        $top: 300
      }}).then(function(activities) {
        var container = document.getElementById('ganttContainer');
        diag('_fetchGanttStateHistory chunk=' + chunkIds.length + ' activities=' + (Array.isArray(activities) ? activities.length : typeof activities), 'ok');
        if (!Array.isArray(activities)) {
          chunkIds.forEach(function(issueId) {
            if (!_ganttStateHist[issueId]) {
              _ganttStateHist[issueId] = { sinceTs: null, prev: null, prevColor: null };
              if (container) _updateGanttHistDOM(container, issueId, _ganttStateHist[issueId]);
            }
          });
          return;
        }
        /* Идентификация нужного поля состояния:
           1) ПРИОРИТЕТ — по id поля (`field.id`): не локализуется, не коллизит с другими
              полями, работает для ЛЮБОГО типа (State/enum/owned/version). Универсально.
           2) Fallback (если id поля не дошёл из Слоя 1): по совпадению нового значения
              (added[0]) с текущим состоянием (curStates), иначе — по $type StateBundleElement.
           В YouTrack Activities API added/removed — МАССИВЫ, field.name ЛОКАЛИЗОВАН.
           reverse:true → берём первую (свежайшую) подходящую запись. */
        activities.forEach(function(act) {
          if (!act || !act.target) return;
          var issueId = act.target.idReadable;
          if (!issueId || _ganttStateHist[issueId]) return;
          var addedArr   = Array.isArray(act.added)   ? act.added   : (act.added   ? [act.added]   : []);
          var removedArr = Array.isArray(act.removed) ? act.removed : (act.removed ? [act.removed] : []);
          var addedVal   = addedArr[0]   || null;
          var removedVal = removedArr[0] || null;
          var sample     = addedVal || removedVal;
          if (!sample) return;
          var addedName  = addedVal ? (addedVal.localizedName || addedVal.name || '') : '';
          var cur        = curStates[issueId] || '';
          var actFieldId = (act.field && act.field.id) || '';
          var isStateChange = fieldId
            ? (actFieldId === fieldId)
            : (cur ? (addedName === cur) : (sample.$type === 'StateBundleElement'));
          if (!isStateChange) return;
          var prevName = removedVal ? (removedVal.localizedName || removedVal.name || '') : '';
          var prevC    = removedVal && removedVal.color ? removedVal.color : null;
          _ganttStateHist[issueId] = {
            sinceTs:   act.timestamp || null,
            prev:      prevName,
            prevColor: prevC ? { background: prevC.background || null, foreground: prevC.foreground || null } : null
          };
          if (container) _updateGanttHistDOM(container, issueId, _ganttStateHist[issueId]);
        });
        chunkIds.forEach(function(issueId) {
          if (!_ganttStateHist[issueId]) {
            _ganttStateHist[issueId] = { sinceTs: null, prev: null, prevColor: null };
            if (container) _updateGanttHistDOM(container, issueId, _ganttStateHist[issueId]);
          }
        });
      }).catch(function(e) {
        diag('_fetchGanttStateHistory err: ' + String(e && e.message ? e.message : e), 'warn');
        var container2 = document.getElementById('ganttContainer');
        if (container2) chunkIds.forEach(function(issueId) {
          if (!_ganttStateHist[issueId]) {
            var prevEl = container2.querySelector('[data-gantt-hist-prev="' + issueId + '"]');
            if (prevEl) prevEl.textContent = '';
          }
        });
      });
    }

    var p = Promise.resolve();
    for (var ci = 0; ci < ids.length; ci += CHUNK_SIZE) {
      (function(chunk) { p = p.then(function() { return processChunk(chunk); }); })(ids.slice(ci, ci + CHUNK_SIZE));
    }
    p.then(function() { _ganttStateHist._fetchedAt = Date.now(); });
  }

  /* v6.1.0 D80 (F3) — sync Assignee из YouTrack: source-of-truth = YT.
     Кнопки на «Люди» и Ганте → один общий handler. */
  /* ── #35 — apply-хелперы универсального refresh ───────────────────────────── */
  /* updates приходят из резолвера с обобщёнными ключами estimate/fact; в item они
     хранятся per-role как estimate_<rk>/fact_<rk>. Зеркальные поля — как есть. */
  function _applyRefreshItemUpdates(item, updates, rk) {
    Object.keys(updates).forEach(function (k) {
      var target = (k === 'estimate') ? ('estimate_' + rk)
                 : (k === 'fact')     ? ('fact_' + rk)
                 : k;
      item[target] = updates[k];
    });
  }
  /* assignee живёт в taskAssignments текущей роли (personalPlanning). value = {login,fullName}|null. */
  function _applyRefreshAssignee(issueId, value) {
    if (!_currentRolePP) _currentRolePP = { resourcesByAssignee: {}, taskAssignments: {} };
    if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
    var ta = _currentRolePP.taskAssignments[issueId] = _currentRolePP.taskAssignments[issueId] || {};
    var login = value ? (value.login || null) : null;
    var full  = value ? (value.fullName || value.login) : '';
    ta.assignee = login;
    ta.assigneeName = login ? (full || login) : '';
    delete ta.ganttColor;
  }
  function _setRefreshBtnsBusy(busy) {
    try {
      var sel = '#currentRoleSyncFromYtBtn, #ganttSyncFromYtBtn, [id^="refreshBtn_"], [id^="refreshFromTaskBtn_"]';
      document.querySelectorAll(sel).forEach(function (btn) { btn.disabled = !!busy; });
    } catch (_) {}
  }
  function _persistAndRerenderRefresh(curRk) {
    _markDirty('roleItems');
    _markDirty('currentRole');
    apiPost('sprint-data', { roleItems: _roleItems }).catch(function () {});
    try { if (typeof renderPlanningRoles === 'function') renderPlanningRoles(); } catch (_) {}
    if (curRk) { try { if (typeof renderRoleComposition === 'function') renderRoleComposition(curRk); } catch (_) {} }
    try { renderCurrentRoleAssigneeTable(); } catch (_) {}
    try { renderCurrentRoleTaskTable(); } catch (_) {}
    try { if (typeof updateCurrentRoleTotals === 'function') updateCurrentRoleTotals(); } catch (_) {}
    _ganttStateHist._fetchedAt = 0;
    try { if (typeof renderGanttChart === 'function') renderGanttChart(); } catch (_) {}
    saveCurrentRoleState();
  }

  /* S7 #35 — открыт ли незакоммиченный редактор ячейки в таблицах планирования.
     Редактируемые ячейки состава роли: .dyn-period-input (inline-режим — прямая запись в YT
     по blur+confirm) и .alloc-input (локальная аллокация — blur-коммит). Пока такой input
     в фокусе, значение ещё не записано в item → refresh откладываем, чтобы не затереть ввод. */
  function _isInlineCellEditing() {
    try {
      var ae = document.activeElement;
      return !!(ae && ae.matches && ae.matches('input.dyn-period-input, input.alloc-input'));
    } catch (_) { return false; }
  }

  /* S5 #35 — представление конфликта в diff: подпись поля + форматирование значения.
     Конфликты возникают только на пограничных полях: estimate / fact (минуты) и assignee (login). */
  function _refreshConflictFieldLabel(field) {
    if (field === 'estimate') return T('refreshConflictFieldEstimate');
    if (field === 'fact')     return T('refreshConflictFieldFact');
    if (field === 'assignee') return T('refreshConflictFieldAssignee');
    return field;
  }
  function _refreshConflictVal(field, v) {
    if (v == null || v === '') return '—';
    if (field === 'assignee') return String(v);
    return fmtPeriod(v); /* estimate/fact — минуты */
  }

  /* S5 #35 — diff-просмотр конфликтов поверх wcDiffView (read-only, Phase 3 #32).
     Конфликты уже несут точные from/to (вкл. assignee) — группируем по задаче в changed[].
     reopen() — колбэк возврата в сводку-модалку (S4) после закрытия diff. */
  function _showRefreshDiffModal(conflicts, reopen) {
    var byItem = {};
    (conflicts || []).forEach(function (c) {
      var key = c.issueId || '';
      if (!byItem[key]) {
        var it = c._item || {};
        byItem[key] = { title: it.title || it.summary || c.issueId || '', fields: [] };
      }
      byItem[key].fields.push({
        name: _refreshConflictFieldLabel(c.field),
        from: _refreshConflictVal(c.field, c.from),
        to:   _refreshConflictVal(c.field, c.to),
      });
    });
    var changed = Object.keys(byItem).map(function (k) { return byItem[k]; });
    var h = openModal({
      id: 'refreshDiff',
      type: 'read-only',
      title: T('refreshDiffTitle'),
      body: { kind: 'component', name: 'wcDiffView', props: {
        added: [], removed: [], changed: changed,
        labels: {
          added: T('wcDiffAdded'), removed: T('wcDiffRemoved'), changed: T('wcDiffChanged'),
          noChanges: T('wcDiffNoChanges'), close: T('btnClose'),
        },
        onClose: function () { h.close(); },
      }},
      buttons: [],
      dismissOnBackdrop: true,
      blockEscape: false,
      showCloseButton: true,
      onClose: function () { if (typeof reopen === 'function') reopen(); },
    });
  }

  /* S4 #35 — модалка-сводка конфликтов «Обновить из задачи».
     spec = { total, conflictCount, conflicts, onAll, onSkip }.
       • [Обновить всё из YouTrack] → onAll (overwrite, вкл. конфликтные);
       • [Сохранить мои правки]     → onSkip (только бесконфликтные);
       • [Показать различия]        → diff-подмодалка → возврат в эту сводку.
     Escape/backdrop/close-X → отмена (ничего не применяем — безопасно). */
  function _showRefreshConflictModal(spec) {
    spec = spec || {};
    var decided = null; /* 'all' | 'skip' | 'diff' | null */
    function open() {
      decided = null;
      openModal({
        id: 'refreshConflict',
        type: 'confirm',
        title: T('refreshConflictTitle'),
        body: { kind: 'text', text: T('refreshConflictBody')
          .replace('{n}', String(spec.total || 0))
          .replace('{k}', String(spec.conflictCount || 0)) },
        buttons: [
          { id: 'all',  text: T('refreshConflictAll'),  variant: 'danger',    onClick: function (h) { decided = 'all';  h.close(); } },
          { id: 'skip', text: T('refreshConflictSkip'), variant: 'primary',   onClick: function (h) { decided = 'skip'; h.close(); } },
          { id: 'diff', text: T('refreshConflictDiff'), variant: 'secondary', onClick: function (h) { decided = 'diff'; h.close(); } },
        ],
        dismissOnBackdrop: false,
        blockEscape: false,
        showCloseButton: true,
        onClose: function () {
          if (decided === 'all') { if (spec.onAll) spec.onAll(); }
          else if (decided === 'skip') { if (spec.onSkip) spec.onSkip(); }
          else if (decided === 'diff') { _showRefreshDiffModal(spec.conflicts, open); }
          /* decided === null → отмена: ничего не применяем */
        },
      });
    }
    open();
  }

  /* ── #35 — универсальный refresh «Обновить из задачи» ───────────────────────
     Единый путь обновления данных задач из YouTrack для обеих вкладок планирования
     (Аллокация общего ресурса + Распределение по исполнителям) и Ганта.
       • item-поля (estimate/fact/state/priority/system/extId) — для ВСЕХ активных ролей;
       • assignee-распределение — только для текущей роли (там, где people-вкладка и где
         пользователь его правит; для прочих ролей подтянется при переключении).
     Слияние — через REFRESH_MERGE_PURE.resolveRefreshMerge (field-class + dirty-guard).
     Конфликты — эскалируются в _showRefreshConflictModal (S4). */
  function refreshFromYouTrack() {
    /* Гард v2.2.6: refresh доступен для редактируемого активного/планируемого спринта в ЛЮБОМ
       статусе (вкл. «Состав согласован»/ALLOCATED). Блокируем ТОЛЬКО исторический readonly-просмотр
       (§5) и редактирование working-copy истории. Критерий — тот же, что у UI readonly-режима
       (isHistoricalView, :4482), а НЕ isActiveSprintRecord: последний требует непустой working
       `_sprint` и ложно блокировал активный согласованный спринт, собранный из истории
       (_sprint === null → вид редактируемый, но refresh падал). */
    var _histView = !!(_currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId);
    if (!_currentSprintId || _histView || _activeWorkingDraftKey) {
      toast(T('toastRefreshNotActive'), 'info'); return;
    }
    if (typeof _isInlineCellEditing === 'function' && _isInlineCellEditing()) {
      toast(T('toastRefreshBusyEditing'), 'warn'); return; /* S7 */
    }
    var roles = getActiveRoles();
    if (!roles.length) { toast(T('toastSelectSprint')); return; }

    /* null-safe: _currentSprintRoleRec может быть null на вкладке «Состав ролей» или при _sprint===null. */
    var curRk = (_currentSprintRoleRec && _currentSprintRoleRec.roleKey) || _activeSubtab
              || (roles[0] && roles[0].key) || null;
    var curRole = ALL_ROLES.find(function (r) { return r.key === curRk; });

    var fState     = (_settings && _settings.fieldState) || '';
    var fPriority  = (_settings && _settings.fieldPriority) || '';
    var fXPriority = (_settings && _settings.fieldXPriority) || '';
    var fSystem    = (_settings && _settings.fieldSystem) || '';
    var fExtId     = (_settings && _settings.fieldExternalTicketId) || '';
    var curUserField = (curRole && _settings && _settings[curRole.userField]) || '';

    var roleData = [], idSet = {};
    roles.forEach(function (role) {
      var ytEst  = (_settings && _settings[role.fieldEst]) || null;
      var ytFact = (_settings && _settings[role.fieldFact]) || null;
      var arr = getRoleItemsArr(role.key).filter(function (i) {
        return i && i.issueId && ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      arr.forEach(function (i) { idSet[i.issueId] = 1; });
      roleData.push({ rk: role.key, items: arr, ytEst: ytEst, ytFact: ytFact });
    });

    var ids = Object.keys(idSet);
    if (!ids.length) { toast(T('toastSyncFromYtNoTasks'), 'info'); return; }

    /* Источник — фронтовый REST-батч. YouTrack REST отдаёт локализованные enum/state
       (localizedName/presentation); workflow entities-API на backend — нет (#35: на стенде
       priority приходил как name «Show-stopper» вместо «Неотложная»). Чанкуем по 100 id,
       чтобы не упереться в лимит длины URL-запроса. */
    var FIELDS = 'id,idReadable,summary,customFields(name,projectCustomField(field(name,id)),value(name,localizedName,presentation,color(id,background,foreground),minutes,login,fullName))';
    var CHUNK = 100, chunks = [];
    for (var ci = 0; ci < ids.length; ci += CHUNK) chunks.push(ids.slice(ci, ci + CHUNK));

    function cfOf(issue, fname) {
      var cfs = issue.customFields || [];
      return cfs.find(function (cf) {
        var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
        return fn === fname;
      });
    }
    function getMin(issue, fname) {
      var f = cfOf(issue, fname);
      return (f && f.value && f.value.minutes !== undefined) ? f.value.minutes : null;
    }
    function getStr(issue, fname) {
      var f = cfOf(issue, fname);
      if (!f || f.value === null || f.value === undefined) return '';
      var v = f.value;
      if (typeof v === 'string') return v;
      return v.localizedName || v.presentation || v.name || '';
    }
    function getUser(issue, fname) {
      var f = cfOf(issue, fname);
      var v = f && f.value;
      return (v && typeof v === 'object' && (v.login || v.fullName))
        ? { login: v.login || null, fullName: v.fullName || v.name || null }
        : null;
    }
    function getStateObj(issue, fname) {
      var f = cfOf(issue, fname);
      var v = f && f.value;
      if (!v || typeof v !== 'object') return null;
      var nm = v.localizedName || v.presentation || v.name || '';
      var c = v.color;
      return { name: nm, color: (c && (c.background || c.foreground)) ? { background: c.background || null, foreground: c.foreground || null } : null };
    }

    _setRefreshBtnsBusy(true);
    Promise.all(chunks.map(function (chunk) {
      return _host.fetchYouTrack('issues', { query: { fields: FIELDS, query: 'issue id: ' + chunk.join(', '), '$top': chunk.length } });
    })).then(function (results) {
      var issuesById = {};
      (results || []).forEach(function (arr) {
        (arr || []).forEach(function (issue) {
          if (issue.idReadable) issuesById[issue.idReadable] = issue;
          if (issue.id) issuesById[issue.id] = issue;
        });
      });

      var curTA  = (_currentRolePP && _currentRolePP.taskAssignments) || {};
      var snapTA = (_serverSnapshotCurrentRolePP && _serverSnapshotCurrentRolePP.taskAssignments) || {};
      function snapItem(rk, issueId) {
        var arr = (_serverSnapshotRoleItems && _serverSnapshotRoleItems[rk]) || [];
        for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].issueId === issueId) return arr[i];
        return null;
      }

      var pendingItemUpdates = [];  /* {item, updates, rk} */
      var pendingAssignee = [];     /* {issueId, value} */
      var conflicts = [];           /* {issueId, roleKey, field, from, to, _item, _rk, _assignee} */

      roleData.forEach(function (rd) {
        var rk = rd.rk, isCur = (rk === curRk);
        rd.items.forEach(function (item) {
          var issue = issuesById[item.issueId];
          if (!issue) return;
          var remote = {};
          if (rd.ytEst)  remote.estimate = getMin(issue, rd.ytEst);
          if (rd.ytFact) remote.fact     = getMin(issue, rd.ytFact);
          if (fState) {
            var stv = getStateObj(issue, fState);
            if (stv) { remote.state = stv.name; remote.stateLocalized = stv.name; remote.stateColor = stv.color; }
          }
          if (fPriority)  remote.priority         = getStr(issue, fPriority);
          if (fXPriority) remote.xpriority        = getStr(issue, fXPriority);
          if (fSystem)    remote.system           = getStr(issue, fSystem);
          if (fExtId)     remote.externalTicketId = getStr(issue, fExtId);
          if (isCur && curUserField) remote.assignee = getUser(issue, curUserField); /* {login,fullName}|null */

          var sItem = snapItem(rk, item.issueId);
          var local = {
            estimate: item['estimate_' + rk], fact: item['fact_' + rk],
            state: item.state, priority: item.priority, xpriority: item.xpriority,
            system: item.system, externalTicketId: item.externalTicketId,
          };
          var snapshot = {
            estimate: sItem ? sItem['estimate_' + rk] : null,
            fact: sItem ? sItem['fact_' + rk] : null,
          };
          if (isCur) {
            local.assignee = (curTA[item.issueId] || {}).assignee || null;
            snapshot.assignee = (snapTA[item.issueId] || {}).assignee || null;
          }

          var res = REFRESH_MERGE_PURE.resolveRefreshMerge({
            issueId: item.issueId, roleKey: rk, local: local, snapshot: snapshot, remote: remote,
          });

          if (res.updates && Object.keys(res.updates).length) pendingItemUpdates.push({ item: item, updates: res.updates, rk: rk });
          if (res.assigneeUpdate !== undefined) pendingAssignee.push({ issueId: item.issueId, value: res.assigneeUpdate });
          (res.conflicts || []).forEach(function (c) {
            var rich = { issueId: c.issueId, roleKey: c.roleKey, field: c.field, from: c.from, to: c.to, _item: item, _rk: rk };
            if (c.field === 'assignee') rich._assignee = remote.assignee;
            conflicts.push(rich);
          });
        });
      });

      /* mode: 'all' (вкл. конфликтные) | 'skip' (только бесконфликтные). */
      function applyAndFinish(mode) {
        pendingItemUpdates.forEach(function (u) { _applyRefreshItemUpdates(u.item, u.updates, u.rk); });
        pendingAssignee.forEach(function (a) { _applyRefreshAssignee(a.issueId, a.value); });
        if (mode === 'all') {
          conflicts.forEach(function (c) {
            if (c.field === 'assignee') { _applyRefreshAssignee(c.issueId, c._assignee); }
            else { var u = {}; u[c.field] = c.to; _applyRefreshItemUpdates(c._item, u, c._rk); }
          });
        }
        _persistAndRerenderRefresh(curRk);
        var applied = pendingItemUpdates.length + pendingAssignee.length + (mode === 'all' ? conflicts.length : 0);
        if (!applied) toast(T('toastSyncFromYtNoChange'), 'info');
        else toast(T('toastSyncFromYtUpdated').replace('{n}', String(applied)), 'success');
      }

      var totalAffected = pendingItemUpdates.length + pendingAssignee.length + conflicts.length;
      if (!conflicts.length) {
        if (!totalAffected) { toast(T('toastSyncFromYtNoChange'), 'info'); return; }
        applyAndFinish('skip');
        return;
      }
      /* Сводка считает ЗАДАЧИ (distinct issueId), не записи: одна задача может дать несколько
         field-изменений/конфликтов. N = затронутых задач, K = задач с несохранёнными правками. */
      var affTaskSet = {}, conflTaskSet = {};
      pendingItemUpdates.forEach(function (u) { if (u.item && u.item.issueId) affTaskSet[u.item.issueId] = 1; });
      pendingAssignee.forEach(function (a) { if (a.issueId) affTaskSet[a.issueId] = 1; });
      conflicts.forEach(function (c) { if (c.issueId) { affTaskSet[c.issueId] = 1; conflTaskSet[c.issueId] = 1; } });
      /* Эскалация: модалка-сводка (S4). */
      _showRefreshConflictModal({
        total: Object.keys(affTaskSet).length,
        conflictCount: Object.keys(conflTaskSet).length,
        conflicts: conflicts,
        onAll: function () { applyAndFinish('all'); },
        onSkip: function () { applyAndFinish('skip'); },
      });
    }).catch(function (e) {
      diag('refreshFromYouTrack failed: ' + (e && e.message ? e.message : e), 'err');
      toast(T('toastSyncFromYtErr'));
    }).finally(function () {
      _setRefreshBtnsBusy(false);
    });
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
