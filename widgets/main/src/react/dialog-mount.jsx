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

    /* Iframe-aware repositioning: Ring Dialog uses position:fixed which centers within
       the IFRAME viewport (potentially 3000px+ tall in YT context).
       Poll-based for reliability — parent-doc scroll events are cross-origin blocked,
       and React may re-apply Ring Dialog styles. 100ms interval is cheap and bullet-proof. */
    const reposition = () => {
      const ringContainer = document.querySelector('.ring-dialog-container');
      if (!ringContainer) return;
      let visibleTop = 0;
      let visibleHeight = window.innerHeight;
      try {
        if (window.parent && window.parent !== window && window.frameElement) {
          const iframeRect = window.frameElement.getBoundingClientRect();
          const parentVH = window.parent.innerHeight || document.documentElement.clientHeight;
          visibleTop = Math.max(0, -iframeRect.top);
          const visibleBottom = Math.min(iframeRect.height, parentVH - iframeRect.top);
          visibleHeight = Math.max(300, visibleBottom - visibleTop);
        }
      } catch (_) { /* cross-origin — fallback */ }
      ringContainer.style.position = 'absolute';
      ringContainer.style.top = visibleTop + 'px';
      ringContainer.style.bottom = 'auto';
      ringContainer.style.height = visibleHeight + 'px';
    };
    requestAnimationFrame(reposition);
    const pollInterval = setInterval(reposition, 100);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
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
      trapFocus={true}
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
