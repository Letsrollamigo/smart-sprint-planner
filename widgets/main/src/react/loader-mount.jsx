/* v2.0.0 D125 — Ring LoaderInline bridge for Phase D3.
   Replaces ad-hoc SVG spinner inside async buttons with Ring LoaderInline.
   Preserves legacy `withLoader(btn, asyncFn)` semantics:
   - if button has .ssp-icon, swap it for the spinner and restore on detach;
   - otherwise append a space + spinner slot;
   - button.disabled toggled while spinner is mounted (double-click guard).
   IIFE-bridge: window.__SSP_LOADER.attach(btn) / .detach(btn). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

function getLoaderInline() {
  return globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.LoaderInline;
}

window.__SSP_LOADER = {
  attach(buttonEl) {
    if (!buttonEl || buttonEl.__sspLoaderRoot) return;
    const LoaderInline = getLoaderInline();
    if (!LoaderInline) return;

    const slot = document.createElement('span');
    slot.className = 'ssp-loader-slot';

    const origIcon = buttonEl.querySelector('.ssp-icon');
    let state;
    if (origIcon) {
      origIcon.replaceWith(slot);
      state = { mode: 'replace', icon: origIcon, spacer: null };
    } else {
      const spacer = document.createTextNode(' ');
      buttonEl.appendChild(spacer);
      buttonEl.appendChild(slot);
      state = { mode: 'append', icon: null, spacer };
    }

    const root = ReactDOMClient.createRoot(slot);
    root.render(React.createElement(LoaderInline));

    buttonEl.__sspLoaderRoot = root;
    buttonEl.__sspLoaderState = state;
    buttonEl.__sspLoaderSlot = slot;
    buttonEl.__sspLoaderOrigDisabled = buttonEl.disabled;
    buttonEl.disabled = true;
  },

  detach(buttonEl) {
    if (!buttonEl || !buttonEl.__sspLoaderRoot) return;
    try { buttonEl.__sspLoaderRoot.unmount(); } catch (_) { /* root already gone */ }
    const state = buttonEl.__sspLoaderState;
    const slot = buttonEl.__sspLoaderSlot;
    if (state && slot && slot.isConnected) {
      if (state.mode === 'replace' && state.icon) {
        slot.replaceWith(state.icon);
      } else {
        if (state.spacer && state.spacer.parentNode) state.spacer.remove();
        slot.remove();
      }
    }
    buttonEl.disabled = !!buttonEl.__sspLoaderOrigDisabled;
    delete buttonEl.__sspLoaderRoot;
    delete buttonEl.__sspLoaderState;
    delete buttonEl.__sspLoaderSlot;
    delete buttonEl.__sspLoaderOrigDisabled;
  },
};
