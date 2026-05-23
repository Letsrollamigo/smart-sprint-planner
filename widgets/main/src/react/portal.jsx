/* v2.0.0 D125 — React portal manager.
   Singleton pool: per-component createRoot, lazy + reused (D-19).
   IIFE-bridge: window.__SSP_REACT.mount(id, element) / .unmount(id). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _rootPool = new Map();

function getOrCreateRoot(mountPointId) {
  if (_rootPool.has(mountPointId)) return _rootPool.get(mountPointId);
  const portalEl = document.getElementById('ssp-react-portal');
  if (!portalEl) throw new Error('ssp-react-portal div not found in index.html');
  const container = document.createElement('div');
  container.dataset.sspMount = mountPointId;
  portalEl.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  _rootPool.set(mountPointId, { container, root });
  return { container, root };
}

window.__SSP_REACT = {
  mount(id, element) {
    const { root } = getOrCreateRoot(id);
    root.render(element);
  },
  unmount(id) {
    const entry = _rootPool.get(id);
    if (entry) entry.root.render(null);
  },
  _React: React,
};
