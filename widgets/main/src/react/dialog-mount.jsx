/* v2.0.0 D125 — Ring Dialog bridge for Phase D2.
   SspDialog: transplants .overlay children into Ring Dialog via useEffect DOM move.
   Cancel-button close path works without modifying button handlers:
   per-overlay MutationObserver detects classList.add('hidden') → closes Ring Dialog.
   window.__SSP_DIALOG: IIFE-callable bridge. */

import * as React from 'react';

const noop = () => {};

function SspDialog({ overlayId, label, dismissOnBackdrop, blockEscape, onClose }) {
  const Dialog = globalThis.SSP_VENDORED.Dialog;
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const overlayEl = document.getElementById(overlayId);
    const container = containerRef.current;
    if (!overlayEl || !container) return;

    while (overlayEl.firstChild) container.appendChild(overlayEl.firstChild);

    /* v2.0.0 R2 fix (D3-r6): manual focus с preventScroll вместо Ring trapFocus auto-focus.
       Ring trapFocus={false} (см. JSX ниже) — Ring не auto-focus'ит first focusable, мы делаем
       это сами с {preventScroll:true}. Без этого browser auto-scroll'ит iframe чтобы focused
       element был visible → таблица/Гант откидываются к верху. */
    const focusTimer = setTimeout(() => {
      const focusables = container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const target = focusables[0] || container;
      try { target.focus({ preventScroll: true }); } catch (_) {
        try { target.focus(); } catch (__) {}
      }
    }, 0);

    /* v2.0.0 R2 fix (D3-r5) — Click-anchored positioning через padding-top на
       container, БЕЗ override position/height. Это сохраняет:
       - Container `position: fixed; inset: 0` (Ring default) → backdrop покрывает
         весь iframe (4000+ px) с semi-transparent overlay
       - Dialog box (Ring Island) внутри container — flex-positioned через
         alignItems:flex-start + paddingTop. Y = anchorY - dialogH/2.
       Polling сохранён — Ring может re-apply container styles после React updates,
       и dialog height может меняться (lazy load content). */
    const reposition = () => {
      const ringContainer = document.querySelector('.ring-dialog-container');
      if (!ringContainer) return;
      /* Найти actual dialog box (Ring Island) чтобы измерить высоту */
      const island = ringContainer.querySelector('.ring-island-island');
      const dialogH = island ? island.offsetHeight : (ringContainer.offsetHeight || 300);
      const anchorY = (window.__SSP_MODAL_ANCHOR && window.__SSP_MODAL_ANCHOR.getCenterY())
        || (window.innerHeight / 2);
      const padTop = Math.max(20, anchorY - dialogH / 2);
      /* НЕ трогать position/top/height/bottom — оставить Ring defaults для backdrop */
      ringContainer.style.alignItems = 'flex-start';
      ringContainer.style.paddingTop = padTop + 'px';
    };
    requestAnimationFrame(reposition);
    const pollInterval = setInterval(reposition, 100);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      clearTimeout(focusTimer);
      clearInterval(pollInterval);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      /* v2.0.0 R2 D3-r5: cleanup click-anchored container styles (Ring может reuse container) */
      const rc = document.querySelector('.ring-dialog-container');
      if (rc) { rc.style.alignItems = ''; rc.style.paddingTop = ''; }
      const el2 = document.getElementById(overlayId);
      if (!el2) return;
      while (container.firstChild) el2.appendChild(container.firstChild);
    };
  }, [overlayId]);

  if (!Dialog) return null;

  return (
    <Dialog
      show={true}
      label={label}
      onCloseAttempt={blockEscape ? noop : onClose}
      trapFocus={false}
      showCloseButton={false}
      preventBodyScroll={false}
      onOverlayClick={dismissOnBackdrop ? onClose : noop}
    >
      <div ref={containerRef} className="ssp-dialog-inner" data-overlay-id={overlayId} />
    </Dialog>
  );
}

window.__SSP_DIALOG = {
  open(overlayId, { label, dismissOnBackdrop, blockEscape, onClose }) {
    const React = globalThis.SSP_VENDORED.React;
    window.__SSP_REACT.mount(
      'dialog-' + overlayId,
      React.createElement(SspDialog, {
        overlayId,
        label: label || overlayId,
        dismissOnBackdrop: !!dismissOnBackdrop,
        blockEscape: !!blockEscape,
        onClose: onClose || noop,
      })
    );
  },
  close(overlayId) {
    window.__SSP_REACT.unmount('dialog-' + overlayId);
  },
};
