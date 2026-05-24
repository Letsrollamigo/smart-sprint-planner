/* v2.0.0 D127 — Ring Tabs bridge for Phase D6.
   Mounts Ring Tabs inside a host span, controlled by IIFE state through dataset:
   - host.dataset.selected = currently selected tab id
   - host.dataset.tabsJson = JSON array [{id, title}, ...]
   On user selection React writes dataset.selected then dispatches a bubbling
   `change` Event from the host so legacy listeners can react. The IIFE wires
   onSelect to programmatic .click() on the hidden .tab-btn[data-tab=newId]
   state-tracker — that fires the existing tab handler block unchanged.
   IIFE-bridge: window.__SSP_TABS.mountAt(host) / .unmountAt(host) /
   .setSelected(host, id) / .getSelected(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

function parseTabs(host) {
  try {
    const raw = host.dataset.tabsJson;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function SspTabs({ host }) {
  const Tabs = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Tabs;
  const Tab = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Tab;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: ['data-selected', 'data-tabs-json'],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Tabs || !Tab) return null;

  const selected = host.dataset.selected || '';
  const tabs = parseTabs(host);

  const handleSelect = (key) => {
    host.dataset.selected = key;
    try {
      host.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) { /* noop */ }
  };

  return React.createElement(
    Tabs,
    { selected, onSelect: handleSelect },
    tabs.map((t) =>
      React.createElement(Tab, { key: t.id, id: t.id, title: t.title })
    )
  );
}

window.__SSP_TABS = {
  mountAt(host) {
    if (!host || _mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspTabs, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
  },
  setSelected(host, id) {
    if (!host) return;
    host.dataset.selected = id == null ? '' : String(id);
  },
  getSelected(host) {
    return host ? (host.dataset.selected || '') : '';
  },
};
