/* v2.1.0 F3 — Ring Collapse bridge for Settings accordion sections.
   Host pattern: <div data-ssp-collapse-host data-title="..." data-open="0|1">
     <template data-ssp-collapse-body>...body html...</template>
   </div>

   Why <template>? Ring Collapse takes children as JSX; we transfer the
   body HTML through dangerouslySetInnerHTML inside CollapseContent. The
   <template> element keeps the body inert until React renders it.

   Bridge API (window.__SSP_COLLAPSE):
     mountAt(host, opts?)
     unmountAt(host)
     unmountAllIn(scope)
     mountAllIn(scope)
     setOpen(host, isOpen)
     isOpen(host)

   Events: bridge dispatches bubbling `toggle` event on host when state
   changes, mirroring the native <details> event for legacy compat. */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();
const _bodyCache = new WeakMap();

function SspCollapseCmp({ host }) {
  const Collapse = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Collapse;
  const CollapseControl = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.CollapseControl;
  const CollapseContent = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.CollapseContent;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: ['data-title', 'data-open'],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Collapse || !CollapseControl || !CollapseContent) return null;

  const ds = host.dataset || {};
  const title = ds.title || '';
  const open = ds.open === '1' || ds.open === 'true';
  const bodyHtml = _bodyCache.get(host) || '';

  const handleToggle = () => {
    const next = !(host.dataset.open === '1' || host.dataset.open === 'true');
    host.dataset.open = next ? '1' : '0';
    try {
      host.dispatchEvent(new Event('toggle', { bubbles: true }));
    } catch (_) {}
  };

  return React.createElement(
    Collapse,
    { collapsed: !open, onChange: handleToggle },
    React.createElement(CollapseControl, null, title),
    React.createElement(CollapseContent, null,
      React.createElement('div', { dangerouslySetInnerHTML: { __html: bodyHtml } })
    )
  );
}

window.__SSP_COLLAPSE = {
  mountAt(host, opts) {
    if (!host) return;
    if (opts && typeof opts === 'object') {
      if (opts.title != null) host.dataset.title = String(opts.title);
      if (opts.open != null) host.dataset.open = opts.open ? '1' : '0';
      if (opts.bodyHtml != null) _bodyCache.set(host, String(opts.bodyHtml));
    }
    /* If body content lives as a <template> child, capture HTML before mount. */
    if (!_bodyCache.has(host)) {
      const tpl = host.querySelector('template[data-ssp-collapse-body]');
      if (tpl) {
        _bodyCache.set(host, tpl.innerHTML);
        tpl.remove();
      }
    }
    if (_mounted.has(host)) return;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspCollapseCmp, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) {}
    _mounted.delete(host);
    _bodyCache.delete(host);
  },
  unmountAllIn(scope) {
    const sc = scope || document;
    sc.querySelectorAll('[data-ssp-collapse-host]').forEach((h) => window.__SSP_COLLAPSE.unmountAt(h));
  },
  mountAllIn(scope) {
    const sc = scope || document;
    sc.querySelectorAll('[data-ssp-collapse-host]').forEach((h) => window.__SSP_COLLAPSE.mountAt(h));
  },
  setOpen(host, isOpen) {
    if (!host) return;
    host.dataset.open = isOpen ? '1' : '0';
  },
  isOpen(host) {
    if (!host) return false;
    return host.dataset.open === '1' || host.dataset.open === 'true';
  },
};
