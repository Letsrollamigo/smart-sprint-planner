/* v2.0.0 D126 — Ring Radio bridge for Phase D5.
   Mounts Ring Radio (group) inside a host span, preserving change-event contract:
   - host.dataset.value = currently selected radio value (source of truth)
   - host.dataset.optionsJson = JSON array [{value, label, disabled?}, ...]
   - host.dataset.disabled = "0" | "1"  (optional, disables entire group)
   On user selection React writes dataset.value then dispatches a bubbling
   `change` Event from the host, so legacy listeners keep working.
   IIFE-bridge: window.__SSP_RADIO.mountGroupAt(host) / .unmountGroupAt(host) /
   .mountAllIn(container) / .unmountAllIn(container) / .setValue(host, value) / .getValue(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

function parseOptions(host) {
  try {
    const raw = host.dataset.optionsJson;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function SspRadioGroup({ host }) {
  const Radio = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Radio;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: ['data-value', 'data-options-json', 'data-disabled'],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Radio || !Radio.Item) return null;

  const value = host.dataset.value || '';
  const disabled = host.dataset.disabled === '1' || host.dataset.disabled === 'true';
  const options = parseOptions(host);

  const handleChange = (nextValue) => {
    host.dataset.value = nextValue == null ? '' : String(nextValue);
    try {
      host.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) { /* noop */ }
  };

  return React.createElement(
    Radio,
    { value, onChange: handleChange },
    options.map((opt) =>
      React.createElement(
        Radio.Item,
        {
          key: opt.value,
          value: opt.value,
          disabled: disabled || !!opt.disabled,
        },
        opt.label
      )
    )
  );
}

window.__SSP_RADIO = {
  mountGroupAt(host) {
    if (!host || _mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspRadioGroup, { host }));
    _mounted.set(host, root);
  },
  unmountGroupAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
  },
  mountAllIn(container) {
    const scope = container || document;
    scope.querySelectorAll('[data-ssp-radio-host]').forEach((h) => {
      window.__SSP_RADIO.mountGroupAt(h);
    });
  },
  unmountAllIn(container) {
    const scope = container || document;
    scope.querySelectorAll('[data-ssp-radio-host]').forEach((h) => {
      window.__SSP_RADIO.unmountGroupAt(h);
    });
  },
  /* Programmatic setter without firing change event. */
  setValue(host, value) {
    if (!host) return;
    host.dataset.value = value == null ? '' : String(value);
  },
  getValue(host) {
    return host ? (host.dataset.value || '') : '';
  },
};
