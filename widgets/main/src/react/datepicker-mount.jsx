/* v2.0.0 D125 — Ring DatePicker bridge for Phase D4.
   Mounts Ring DatePicker inside a host wrapper, preserving the change-event
   contract of the legacy <input data-ssp-datepicker> (host.dataset.value writes
   + native `change` dispatch + out-of-range borderColor).
   IIFE-bridge: window.__SSP_DATEPICKER.mountAt(host) / .unmountAt(host) / .unmountAll().
   Host element contract:
   - data-value = "YYYY-MM-DD" or empty
   - data-min, data-max = "YYYY-MM-DD" constraints
   - data-issue = issueId (preserved for legacy handler)
   - classList contains .currentRole-task-date + .currentRole-task-start/.end */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { getCurrentSspLang, getDateFnsLocale } from './i18n-bridge.jsx';

const _mounted = new WeakMap();

function parseYmd(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function fmtYmd(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function getTranslations() {
  /* Pass through SSP T() values where they map cleanly; fall back to date-fns native
     where Ring uses month/day names (handled by locale prop). */
  const T = (window.__SSP_T || window.T || ((k) => k));
  return {
    setDate: T('btnSelect') || 'Set date',
    setDateTime: T('btnSelect') || 'Set date/time',
    setPeriod: T('btnSelect') || 'Set period',
    addFirstDate: T('hdrDateStart') || 'Start',
    addSecondDate: T('hdrDateEnd') || 'End',
    addTime: 'Time',
    selectName: 'Select',
  };
}

function SspDatePicker({ host }) {
  const DatePicker = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.DatePicker;
  const [value, setValue] = React.useState(() => parseYmd(host.dataset.value));
  /* React subscribes to host attribute changes so external updates (e.g. table
     re-render writing new data-value) refresh the picker without remount. */
  React.useEffect(() => {
    const obs = new MutationObserver(() => {
      setValue(parseYmd(host.dataset.value));
    });
    obs.observe(host, { attributes: true, attributeFilter: ['data-value'] });
    return () => obs.disconnect();
  }, [host]);

  if (!DatePicker) return null;

  const locale = getDateFnsLocale(getCurrentSspLang());
  const minDate = host.dataset.min || null;
  const maxDate = host.dataset.max || null;
  const translations = getTranslations();

  const handleChange = (date) => {
    const next = date instanceof Date ? date : null;
    setValue(next);
    const iso = next ? fmtYmd(next) : '';
    host.dataset.value = iso;
    /* Out-of-range visual feedback preserved from legacy handler */
    try {
      host.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) { /* noop */ }
  };

  return (
    <DatePicker
      date={value}
      locale={locale}
      minDate={minDate}
      maxDate={maxDate}
      translations={translations}
      clear={true}
      size="S"
      onChange={handleChange}
    />
  );
}

window.__SSP_DATEPICKER = {
  mountAt(host) {
    if (!host || _mounted.has(host)) return;
    const React = globalThis.SSP_VENDORED.React;
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspDatePicker, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
  },
  unmountAll(container) {
    const root = container || document;
    root.querySelectorAll('[data-ssp-datepicker-host]').forEach((h) => {
      const r = _mounted.get(h);
      if (r) { try { r.unmount(); } catch (_) {} _mounted.delete(h); }
    });
  },
  mountAllIn(container) {
    const root = container || document;
    root.querySelectorAll('[data-ssp-datepicker-host]').forEach((h) => {
      window.__SSP_DATEPICKER.mountAt(h);
    });
  },
};
