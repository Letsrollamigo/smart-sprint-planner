/* v2.0.0 R2 fix — Cross-origin sandbox iframe modal anchor tracker.
   YT widget iframe runs sandboxed без allow-same-origin: window.parent + frameElement
   полностью blocked, нельзя узнать visible portion outer viewport. Iframe auto-grow
   до 4000+ px → flex-center в этой height улетает за outer viewport.
   Решение: запоминаем координаты последнего клика (или keyboard activation focused
   элемента) — пользователь только что взаимодействовал с visible элементом, значит
   эти координаты гарантированно в visible portion outer viewport.
   Все modal positioning code path'и (Ring Dialog, legacy .overlay, .dyn-modal-overlay)
   используют window.__SSP_MODAL_ANCHOR.getCenterY() как Y-якорь. */
(function() {
  var lastY = null;
  var lastX = null;
  var lastT = 0;

  /* v2.1.6 — Bug #1 fix: НЕ обновлять lastX/Y если click внутри открытой модалки/dialog.
     Иначе dialog-mount.jsx setInterval(reposition, 100ms) поймает свежий lastY и
     перепрыгнет modal к месту click'а. Симптомы: pagination в pick modal съезжает,
     textarea в confirmGoal collapse'ит. Click outside (для open следующей modal) —
     OK, anchor обновляется как раньше. */
  function _isClickInsideOpenModal(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      '.ring-dialog-container, ' +              // Ring Dialog wrapper
      '.ssp-dialog-host, ' +                    // legacy overlay → Ring Dialog content host
      '.ssp-dialog-inner, ' +                   // inner content container
      '.overlay:not(.hidden):not(.ssp-dialog-host), ' +    // pure legacy overlay (pickOverlay/settingsOverlay)
      '.settings-overlay:not(.hidden):not(.ssp-dialog-host), ' +
      '.dyn-modal-overlay:not(.hidden):not(.ssp-dialog-host)'
    );
  }

  document.addEventListener('click', function(e) {
    if (_isClickInsideOpenModal(e.target)) return;  // ignore in-modal clicks
    lastY = e.pageY;
    lastX = e.pageX;
    lastT = Date.now();
  }, true);

  /* Keyboard activation: Enter/Space на focused кнопке тоже считается user-interaction,
     но click event может не возникнуть для custom компонентов. Берём bounds focused el. */
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = document.activeElement;
    if (!el || el === document.body || !el.getBoundingClientRect) return;
    if (_isClickInsideOpenModal(el)) return;  // ignore keyboard activation inside open modal
    try {
      var r = el.getBoundingClientRect();
      lastY = (window.scrollY || 0) + r.top + r.height / 2;
      lastX = (window.scrollX || 0) + r.left + r.width / 2;
      lastT = Date.now();
    } catch (_) {}
  }, true);

  window.__SSP_MODAL_ANCHOR = {
    /** Y in iframe document coords для вертикального центра модалки.
     *  Fallback chain:
     *  1. last click/keyboard activation pageY
     *  2. focused element center (если есть и не body)
     *  3. visualViewport scroll center (iframe own scroll)
     *  4. iframe innerHeight midpoint */
    getCenterY: function() {
      if (lastY !== null) return lastY;
      try {
        var el = document.activeElement;
        if (el && el !== document.body && el.getBoundingClientRect) {
          var r = el.getBoundingClientRect();
          return (window.scrollY || 0) + r.top + r.height / 2;
        }
      } catch (_) {}
      try {
        if (window.visualViewport) {
          return window.visualViewport.pageTop + (window.visualViewport.height / 2);
        }
      } catch (_) {}
      return (window.innerHeight || 800) / 2;
    },
    /** X в iframe document coords (для horizontal centering — обычно не используется,
     *  модалки сейчас full-width centered, но api зарезервировано). */
    getCenterX: function() {
      if (lastX !== null) return lastX;
      return (window.innerWidth || 1200) / 2;
    },
    /** Diagnostic для отладки в console: returns текущее состояние tracker. */
    _debug: function() {
      return { lastY: lastY, lastX: lastX, lastT: lastT, ageMs: lastT ? Date.now() - lastT : null };
    }
  };
})();
