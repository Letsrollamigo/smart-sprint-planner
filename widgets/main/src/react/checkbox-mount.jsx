/* v2.0.0 D126 — Ring Checkbox bridge for Phase D5.
   Mounts Ring Checkbox inside a host span, preserving change-event contract
   compatible with native <input type="checkbox">:
   - host.dataset.checked = "0" | "1"  (source of truth, written by React on change)
   - host.dataset.indeterminate = "0" | "1"  (optional, for master-select states)
   - host.dataset.label = string  (rendered next to checkbox; optional)
   - host.dataset.disabled = "0" | "1"  (optional)
   On user toggle React writes dataset.checked then dispatches a bubbling
   `change` Event from the host, so legacy listeners attached via
   addEventListener('change', ...) keep working.
   IIFE-bridge: window.__SSP_CHECKBOX.mountAt(host) / .unmountAt(host) /
   .mountAllIn(container) / .unmountAllIn(container) / .setChecked(host, bool, indeterminate). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

function readBool(host, key) {
  return host.dataset[key] === '1' || host.dataset[key] === 'true';
}

function SspCheckbox({ host }) {
  const Checkbox = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Checkbox;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: ['data-checked', 'data-indeterminate', 'data-label', 'data-disabled'],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Checkbox) return null;

  const checked = readBool(host, 'checked');
  const indeterminate = readBool(host, 'indeterminate');
  const disabled = readBool(host, 'disabled');
  const label = host.dataset.label || '';

  const handleChange = (e) => {
    const next = !!e.target.checked;
    host.dataset.checked = next ? '1' : '0';
    /* Clear indeterminate on user interaction — matches native semantics. */
    if (indeterminate) host.dataset.indeterminate = '0';
    try {
      host.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) { /* noop */ }
  };

  return React.createElement(Checkbox, {
    checked,
    indeterminate,
    disabled,
    label: label || undefined,
    onChange: handleChange,
  });
}

window.__SSP_CHECKBOX = {
  mountAt(host) {
    if (!host || _mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspCheckbox, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
  },
  mountAllIn(container) {
    const scope = container || document;
    scope.querySelectorAll('[data-ssp-checkbox-host]').forEach((h) => {
      window.__SSP_CHECKBOX.mountAt(h);
    });
  },
  unmountAllIn(container) {
    const scope = container || document;
    scope.querySelectorAll('[data-ssp-checkbox-host]').forEach((h) => {
      window.__SSP_CHECKBOX.unmountAt(h);
    });
  },
  /* Convenience setter — updates dataset without firing change event.
     Use for programmatic state sync (e.g. master select-all). */
  setChecked(host, checked, indeterminate) {
    if (!host) return;
    host.dataset.checked = checked ? '1' : '0';
    if (typeof indeterminate === 'boolean') {
      host.dataset.indeterminate = indeterminate ? '1' : '0';
    }
  },
  isChecked(host) {
    return host ? readBool(host, 'checked') : false;
  },
};
