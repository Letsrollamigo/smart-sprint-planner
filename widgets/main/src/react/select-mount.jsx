/* v2.1.0 F2 — Ring Select bridge for top-level dropdowns outside Ring Table.
   Host pattern: <span data-ssp-select-host id="originalId"
                       data-value="..."           // selected option key
                       data-placeholder="..."     // when no selection
                       data-options='[{"key":"a","label":"Анализ"},...]'
                       data-multiple="1"          // optional
                       data-filter="1"            // optional — show search box
                       data-clear="1"             // optional — show clear button
                       data-disabled="1"          // optional
                       data-size="M">             // S/M/L

   Bridge API (window.__SSP_SELECT):
     mountAt(host, opts?)
     unmountAt(host)
     unmountAllIn(scope)
     mountAllIn(scope)
     setValue(host, val)
     getValue(host)
     setOptions(host, options)  // [{ key, label, description? }]

   Events: when user selects, bridge writes host.dataset.value and dispatches
   a bubbling `change` event so legacy delegation continues to work. */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

function parseOptions(dsOptions) {
  if (!dsOptions) return [];
  try {
    const arr = JSON.parse(dsOptions);
    if (!Array.isArray(arr)) return [];
    return arr.map((o) => ({
      key: String(o.key != null ? o.key : (o.value != null ? o.value : '')),
      label: String(o.label != null ? o.label : o.key || ''),
      description: o.description || undefined,
    }));
  } catch (_) {
    return [];
  }
}

function SspSelectCmp({ host }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: [
        'data-value', 'data-placeholder', 'data-options', 'data-multiple',
        'data-filter', 'data-clear', 'data-disabled', 'data-size',
      ],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Select) return null;

  const ds = host.dataset || {};
  const options = parseOptions(ds.options);
  const value = ds.value != null ? ds.value : '';
  const placeholder = ds.placeholder || '';
  const multiple = ds.multiple === '1' || ds.multiple === 'true';
  const filter = ds.filter === '1' || ds.filter === 'true';
  const clear = ds.clear === '1' || ds.clear === 'true';
  const disabled = ds.disabled === '1' || ds.disabled === 'true';
  const size = ds.size || 'M';

  /* Ring Select expects `data` array of objects with `key` + `label`. */
  const data = options;
  let selected = null;
  if (multiple) {
    const selectedKeys = value ? value.split(',').map((v) => v.trim()) : [];
    selected = options.filter((o) => selectedKeys.indexOf(o.key) >= 0);
  } else {
    selected = options.find((o) => o.key === value) || null;
  }

  const handleSelect = (item) => {
    let newVal = '';
    if (multiple) {
      const arr = Array.isArray(item) ? item : [];
      newVal = arr.map((x) => x.key).join(',');
    } else {
      newVal = item ? item.key : '';
    }
    if (host.dataset.value !== newVal) host.dataset.value = newVal;
    try {
      host.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {}
  };

  return React.createElement(Select, {
    data,
    selected: multiple ? selected || [] : selected,
    /* #101 — только onChange: крестик «очистить» зовёт его, а не onSelect; для
       одиночного выбора onChange — надмножество (Ring зовёт их парой). */
    onChange: handleSelect,
    filter,
    clear,
    disabled,
    multiple,
    size,
    label: placeholder || undefined,
    selectedLabel: placeholder || undefined,
  });
}

window.__SSP_SELECT = {
  mountAt(host, opts) {
    if (!host) return;
    if (opts && typeof opts === 'object') {
      if (opts.options != null) host.dataset.options = JSON.stringify(opts.options);
      ['value', 'placeholder', 'multiple', 'filter', 'clear', 'disabled', 'size'].forEach((k) => {
        if (opts[k] != null) host.dataset[k] = String(opts[k]);
      });
    }
    if (_mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspSelectCmp, { host }));
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
    sc.querySelectorAll('[data-ssp-select-host]').forEach((h) => window.__SSP_SELECT.unmountAt(h));
  },
  mountAllIn(scope) {
    const sc = scope || document;
    sc.querySelectorAll('[data-ssp-select-host]').forEach((h) => window.__SSP_SELECT.mountAt(h));
  },
  setValue(host, val) {
    if (!host) return;
    host.dataset.value = String(val == null ? '' : val);
  },
  getValue(host) {
    if (!host) return '';
    return host.dataset.value || '';
  },
  setOptions(host, options) {
    if (!host) return;
    try {
      host.dataset.options = JSON.stringify(Array.isArray(options) ? options : []);
    } catch (_) {}
  },
};
