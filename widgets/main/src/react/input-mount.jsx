/* v2.1.0 F1 — Ring Input bridge for text/number/textarea fields outside
   Ring Table cells. Host pattern: <span data-ssp-input-host id="originalId">
   with dataset props: data-value / data-placeholder / data-multiline /
   data-disabled / data-maxlength / data-size / data-type / data-rows /
   data-readonly.

   Why host-span instead of inline Ring Input mount on the original <input>?
   Ring Input renders its own native <input> (or <textarea> when multiline);
   the outer host wraps this with styled border + clear button + error state.
   We forward the original element's `id` to the rendered native input so
   `document.getElementById(originalId).value` keeps working for legacy
   readers (Settings save / sprint params save / etc).

   Bridge API (window.__SSP_INPUT):
     mountAt(host, opts?)    — mount Ring Input, props from host dataset
     unmountAt(host)         — unmount and clean React root
     unmountAllIn(scope)     — sweep all hosts in a subtree
     setValue(host, val)     — update host data-value, triggers re-render
     getValue(host)          — read current value
     focus(host)             — focus the inner native input

   Events: when user types, the bridge writes to host.dataset.value and
   dispatches a bubbling `input` event on host, so legacy delegation on
   container/document continues to work. */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();
const _refsByHost = new WeakMap(); // host → ref to inner native input

function SspInputCmp({ host }) {
  const Input = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Input;
  const [, force] = React.useReducer((x) => x + 1, 0);
  const innerRef = React.useRef(null);

  React.useEffect(() => {
    /* Re-render only on prop attributes; NOT on data-value (uncontrolled mode —
       data-value is for initial-mount default, subsequent writes go via
       inner.value = X which bypasses React entirely). */
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: [
        'data-placeholder', 'data-multiline', 'data-disabled', 'placeholder',
        'data-maxlength', 'data-size', 'data-rows', 'data-readonly', 'data-error',
      ],
    });
    /* Expose inner ref for the bridge. */
    _refsByHost.set(host, innerRef);
    return () => {
      obs.disconnect();
      _refsByHost.delete(host);
    };
  }, [host]);

  if (!Input) return null;

  const ds = host.dataset || {};
  const initialValue = ds.value != null ? ds.value : '';
  /* applyI18N writes `placeholder` attribute on the host; fall back when
     callers don't pre-fill data-placeholder. */
  const placeholder = ds.placeholder || host.getAttribute('placeholder') || '';
  const multiline = ds.multiline === '1' || ds.multiline === 'true';
  const disabled = ds.disabled === '1' || ds.disabled === 'true';
  const readonly = ds.readonly === '1' || ds.readonly === 'true';
  const maxLength = ds.maxlength ? parseInt(ds.maxlength, 10) : undefined;
  const size = ds.size || 'M';
  const rows = ds.rows ? parseInt(ds.rows, 10) : undefined;
  const error = ds.error || null;
  /* Forward inner-input id via data-input-id (not host's own id) to avoid
     duplicate-id conflicts with document.getElementById(originalId). */
  const sourceId = ds.inputId || null;

  const handleChange = (ev) => {
    const newVal = ev && ev.target ? ev.target.value : '';
    if (host.dataset.value !== newVal) host.dataset.value = newVal;
    try {
      host.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) { /* noop */ }
  };

  /* Uncontrolled mode via defaultValue: legacy `el.value = X` writes work,
     React doesn't override on re-render. Bridge mirrors changes back to
     host.dataset.value via onChange for observability. */
  return React.createElement(Input, {
    inputRef: innerRef,
    id: sourceId || undefined,
    defaultValue: initialValue,
    placeholder,
    multiline,
    disabled,
    readOnly: readonly,
    maxLength,
    size,
    rows,
    error,
    onChange: handleChange,
  });
}

window.__SSP_INPUT = {
  mountAt(host, opts) {
    if (!host) return;
    if (opts && typeof opts === 'object') {
      Object.keys(opts).forEach((k) => {
        if (opts[k] != null) host.dataset[k] = String(opts[k]);
      });
    }
    if (_mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspInputCmp, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) {}
    _mounted.delete(host);
  },
  unmountAllIn(scope) {
    const sc = scope || document;
    sc.querySelectorAll('[data-ssp-input-host]').forEach((h) => window.__SSP_INPUT.unmountAt(h));
  },
  mountAllIn(scope) {
    const sc = scope || document;
    sc.querySelectorAll('[data-ssp-input-host]').forEach((h) => window.__SSP_INPUT.mountAt(h));
  },
  setValue(host, val) {
    if (!host) return;
    const ref = _refsByHost.get(host);
    const next = val == null ? '' : String(val);
    host.dataset.value = next;
    /* Update the inner native input directly (uncontrolled mode). */
    if (ref && ref.current) ref.current.value = next;
  },
  getValue(host) {
    if (!host) return '';
    const ref = _refsByHost.get(host);
    if (ref && ref.current) return ref.current.value || '';
    return host.dataset.value || '';
  },
  focus(host) {
    if (!host) return;
    const ref = _refsByHost.get(host);
    if (ref && ref.current && typeof ref.current.focus === 'function') ref.current.focus();
  },
};
