/* Тост-обвязка (v1.9.11 UX-нормализация, B-32; #32 Phase 6c Ring alertService):
   - Единое API: toastApi.{info,warn,error,success}(text, opts?). Backward-compat
     глобальный toast(msg, type) живёт делегатором в монолите (107+ call-sites).
   - Очередь до TOAST_LIMIT=3, FIFO-evict при переполнении (persistent error
     не выбрасывается).
   - Path A (parent/top doc host) сохранён для cross-origin-friendly сценариев,
     но переведён на тот же DOM-контракт (toast-stack + .toast__text + .toast__close).
   - Path B (local iframe) — click-anchored позиционирование от Y последнего
     mousedown (в auto-grow YT-iframe scroll живёт в parent doc, position:fixed
     улетает за видимую область).
   - ARIA: контейнер role="status" aria-live="polite" (один анонс per toast).
     Error переопределяет на role="alert" aria-live="assertive".
   - Основной путь — Ring alertService (#32 Phase 6c), legacy DOM-стак — fallback.

   Вынесено из legacy-monolith.js (Фаза 5 слайс E3) за мост
   window.__SSP_TOAST_RING; pure-хелперы — по-прежнему toast-pure.js
   (window.__SSP_TOAST_PURE, unit-тесты там). install(deps) зовётся монолитом
   один раз на init (та же точка, где жила зона), возвращает toastApi и
   публикует window.__SSP_TOAST (паттерн __SSP_ICONS — доступ из консоли).
   deps — late-binding обёртки над замыканием монолита: { T, diag } — читаются
   В МОМЕНТ вызова (gm.set/recording-стабы голденов подхватываются).
   Golden-характеризация — tests/golden/bridges.golden.test.js (через
   выживающие entry-points toast()/toastApi; Path A в jsdom недостижим). */
'use strict';

(function () {
  var _deps = {};

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
  var _lastClickY = 0;

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
    var closeAria = (typeof _deps.T === 'function') ? _deps.T('aria.btnClose') : 'Close';
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
      try { _deps.diag('toast evicted (queue>' + TOAST_LIMIT + '): [' + evT.type + '] ' + String(evT.text || '').slice(0, 80), 'info'); } catch(_) {}
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
      try { _deps.diag('toast evicted (queue>' + TOAST_LIMIT + '): [' + ev.type + '] ' + String(ev.msg || '').slice(0, 80), 'info'); } catch(_) {}
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

  function install(deps) {
    _deps = deps || {};

    /* Track последнего mousedown для click-anchor (D131). */
    try {
      document.addEventListener('mousedown', function(e) {
        if (typeof e.clientY === 'number' && !isNaN(e.clientY)) {
          _lastClickY = e.clientY;
        }
      }, true);
    } catch(_){}

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

    /* Public namespace (паттерн window.__SSP_ICONS): даёт доступ из консоли + других
       модулей без breaking change существующего глобального toast(). */
    try { window.__SSP_TOAST = toastApi; } catch(_) {}

    return toastApi;
  }

  if (typeof window !== 'undefined') {
    window.__SSP_TOAST_RING = { install: install };
  }
})();
