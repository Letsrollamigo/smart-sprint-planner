/* Кастомный локализованный датапикер (v1.4.1 D127) — поп-ап для инпутов
   с маркером [data-ssp-datepicker].
   Chromium's native <input type="date"> popup ignores the lang attribute and
   <html lang>, always rendering month/weekday names + Clear/Today buttons in
   the OS locale. We replace it with a small custom popup attached to inputs
   marked [data-ssp-datepicker]. Month and weekday names come from
   Intl.DateTimeFormat(<lang>, ...) — 0 i18n keys for those across 15 locales.
   Buttons via T('btnClear') + T('btnToday'). Value stays YYYY-MM-DD so all
   existing min/max constraints + toDateIn/fromDateIn helpers keep working.
   One shared popup at document.body level, repositioned on each open. Commits
   dispatch a synthetic 'change' event so existing 'change' listeners (sprint
   header drafts, currentRole-task-date row handlers) run unchanged.

   Вынесено из core.js (Фаза 5 слайс E3) за мост
   window.__SSP_DP_BRIDGE (НЕ путать с __SSP_DATEPICKER — React-мостом
   Ring DatePicker'ов таблиц). Внешних вызовов у кластера нет — интерфейс
   чисто DOM-овый (document-level capture-листенеры + синтетические события),
   делегаторы в монолите не нужны. install(deps) зовётся монолитом один раз
   на init (та же точка, где зона регистрировала листенеры); deps —
   late-binding обёртки над замыканием монолита: { T, esc, getLang }
   (язык читается В МОМЕНТ рендера — смена языка подхватывается без
   пере-install). Golden-характеризация — tests/golden/bridges.golden.test.js
   (реальные DOM-события). */
'use strict';

(function () {
  function install(deps) {
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
      var title = new Intl.DateTimeFormat(deps.getLang(), { month: 'long', year: 'numeric' }).format(new Date(y, mo, 1));
      /* Weekday short headers, Monday-first (ISO 8601). 2024-01-01 was Monday so
         we use it as the seed for each iteration. */
      var weekdays = [];
      for (var w = 0; w < 7; w++) {
        weekdays.push(new Intl.DateTimeFormat(deps.getLang(), { weekday: 'short' }).format(new Date(2024, 0, 1 + w)));
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
        '<span class="ssp-dp-title" style="font-weight:600;text-transform:capitalize">' + deps.esc(title) + '</span>' +
        '<button type="button" class="ssp-dp-nav ssp-dp-next" aria-label="next month" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 10px;color:inherit">›</button>' +
        '</div>' +
        '<div class="ssp-dp-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-top:6px">';
      for (var ww = 0; ww < 7; ww++) {
        h += '<div style="text-align:center;color:var(--muted,#999);font-size:11px;padding:2px 0;text-transform:capitalize">' + deps.esc(weekdays[ww]) + '</div>';
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
        '<button type="button" class="ssp-dp-clear" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + deps.esc(deps.T('btnClear')) + '</button>' +
        '<button type="button" class="ssp-dp-today" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + deps.esc(deps.T('btnToday')) + '</button>' +
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
  }

  if (typeof window !== 'undefined') {
    window.__SSP_DP_BRIDGE = { install: install };
  }
})();
