/* v2.0.0 D128 — Ring Table bridge for Phase D7.
   Hybrid controlled-mode (decision 2026-05-24, planning session — see RoadMap §8.2):
   - Ring Table = visual layer (sort affordance, sticky header, theme integration)
   - IIFE = single owner of state (sortKey, items, all change handlers)
   - Cell renderers = JSX returning native HTML with legacy CSS-classes and
     data-attrs (.currentRole-task-assignee, data-ssp-datepicker-host etc.)
   - Event delegation on the host wrapper — NOT per-row listeners — so handlers
     survive any Ring re-render and (if v2.1.0 adds it) virtualization.

   Items are passed already sorted by the IIFE (multiKeySort). Ring receives
   the array as-is and renders sortKey/sortOrder only for visual affordance.
   `onSort` is wired to a 2-state cycle (off ↔ asc), matching legacy
   `setSortKey(cur === k ? 'off' : k)` from sort-pure.js / core.js.

   IIFE-bridge: window.__SSP_TABLE.mountAt(host, opts) / .unmountAt(host) /
                .unmountAllIn(container) — opts described below. */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

/* Stable React component for DatePicker cells. Uses ref + useEffect to mount
   __SSP_DATEPICKER once and survive Ring Table row re-renders (focus changes,
   data updates). Without this, dangerouslySetInnerHTML would recreate the
   host span on every parent re-render and tear down the DatePicker root. */
function SspDatePickerCell({ issue, className, dateValue, min, max }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.__SSP_DATEPICKER) return undefined;
    el.dataset.issue = issue;
    el.dataset.value = dateValue || '';
    el.dataset.min = min || '';
    el.dataset.max = max || '';
    window.__SSP_DATEPICKER.mountAt(el);
    return () => {
      try { window.__SSP_DATEPICKER.unmountAt(el); } catch (_) { /* noop */ }
    };
    // Mount once per cell; updates flow through dataset MutationObserver
    // wired up inside datepicker-mount.jsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* Update dataset attrs when props change without remounting. */
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((el.dataset.value || '') !== (dateValue || '')) el.dataset.value = dateValue || '';
    if ((el.dataset.min || '')   !== (min || ''))       el.dataset.min   = min   || '';
    if ((el.dataset.max || '')   !== (max || ''))       el.dataset.max   = max   || '';
  }, [dateValue, min, max]);
  return React.createElement('span', {
    ref,
    'data-ssp-datepicker-host': '',
    className,
    'data-issue': issue,
    'data-value': dateValue || '',
    'data-min': min || '',
    'data-max': max || '',
  });
}

/* Convert a cell value (string | number | ReactNode | { __html } | { __type, ... })
   into a ReactNode that Ring Table can render. The IIFE-side cell renderers most
   often produce HTML strings already (esc'd), so we accept { __html } and wrap
   with dangerouslySetInnerHTML. For mount-points that must survive parent
   re-renders (DatePicker), use { __type: 'datepicker', ... } — returns a stable
   React component with proper lifecycle. */
function renderCellValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object' && value.__type === 'datepicker') {
    return React.createElement(SspDatePickerCell, {
      key: value.issue + '|' + (value.className || ''),
      issue: value.issue,
      className: value.className || '',
      dateValue: value.dateValue,
      min: value.min,
      max: value.max,
    });
  }
  if (typeof value === 'object' && typeof value.__html === 'string') {
    return React.createElement('span', {
      dangerouslySetInnerHTML: { __html: value.__html },
    });
  }
  return value;
}

function SspTable({ host }) {
  const Table = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Table;
  const TableSelection = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.TableSelection;
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, {
      attributes: true,
      attributeFilter: ['data-items-key', 'data-sort-key', 'data-empty-text'],
    });
    return () => obs.disconnect();
  }, [host]);

  if (!Table) return null;

  const opts = host.__sspTableOpts || {};
  const items = Array.isArray(opts.items) ? opts.items : [];
  const rawColumns = Array.isArray(opts.columns) ? opts.columns : [];
  const sortKey = opts.sortKey == null || opts.sortKey === 'off' ? '' : String(opts.sortKey);
  const emptyText = host.dataset.emptyText || opts.emptyText || '';
  const stickyHeader = opts.stickyHeader !== false;
  const onSortCb = typeof opts.onSort === 'function' ? opts.onSort : null;
  const getItemKey = typeof opts.getItemKey === 'function'
    ? opts.getItemKey
    : (item) => (item && (item.id || item.issueId)) || JSON.stringify(item);

  /* If column.title contains `<br>` (legacy i18n strings like
     "Сквозной<br>приоритет"), auto-generate a React getHeaderValue with
     real <br/> elements — Ring Table title prop is plain text and would
     render the tag literally. Caller can still override by providing its
     own getHeaderValue. Lesson #26: r5 generic helper after r4 only
     covered history. */
  const autoBrHeader = (title) => {
    const str = String(title == null ? '' : title);
    if (!/<br\s*\/?>/i.test(str)) return null;
    const parts = str.split(/<br\s*\/?>/i);
    return () => {
      const children = [];
      parts.forEach((p, i) => {
        if (i > 0) children.push(React.createElement('br', { key: 'br' + i }));
        children.push(p);
      });
      return React.createElement('span', null, children);
    };
  };

  /* Ring expects columns[].getValue / getHeaderValue to return ReactNode.
     Wrap IIFE-provided callbacks so they may return { __html }, { __type },
     plain strings, or already-ReactNode values. Lesson #30 (E3): pickOverlay
     master checkbox lives in column header and must support { __html }. */
  const wrapHeaderFn = (fn) => {
    if (typeof fn !== 'function') return null;
    return () => renderCellValue(fn());
  };
  const columns = rawColumns.map((col) => ({
    id: col.id,
    title: col.title,
    sortable: !!col.sortable,
    className: col.className || null,
    headerClassName: col.headerClassName || null,
    rightAlign: !!col.rightAlign,
    getHeaderValue: wrapHeaderFn(col.getHeaderValue) || autoBrHeader(col.title),
    getValue: (item, column) => renderCellValue(
      typeof col.getValue === 'function' ? col.getValue(item, column) : ''
    ),
  }));

  const handleSort = ({ column }) => {
    if (!onSortCb || !column || !column.id) return;
    /* 2-state cycle off↔asc — matches legacy `setSortKey(cur === k ? 'off' : k)` */
    const nextKey = (sortKey === column.id) ? 'off' : column.id;
    try { onSortCb(nextKey); } catch (_) { /* noop */ }
  };

  /* Ring TableContainer requires a Selection instance (selection.getSelected()
     is called inside HOC). Without it React throws "Cannot read properties of
     undefined". We pass a no-op Selection seeded with current items + getKey. */
  const selection = TableSelection
    ? new TableSelection({ data: items, getKey: getItemKey })
    : undefined;

  return React.createElement(Table, {
    data: items,
    columns,
    sortKey: sortKey || '',
    sortOrder: true,
    onSort: handleSort,
    getItemKey,
    stickyHeader,
    selection,
    selectable: false,
    renderEmpty: emptyText
      ? () => React.createElement('div', { className: 'empty' }, emptyText)
      : null,
  });
}

window.__SSP_TABLE = {
  /* mountAt(host, opts):
       opts = {
         items: Array,         // pre-sorted (IIFE already applied multiKeySort)
         columns: Array<{
           id, title, sortable?, className?, headerClassName?, rightAlign?,
           getHeaderValue?(), getValue(item, col) // returns string | number | ReactNode | { __html: '...' }
         }>,
         sortKey: string,      // 'off' or one of SORT_KEYS_CYCLE — for header affordance
         onSort(nextKey),      // IIFE callback; 2-state cycle applied inside
         getItemKey(item),     // unique key — default: item.id || item.issueId
         stickyHeader: bool,   // default true
         emptyText: string,    // shown when items.length === 0
       }
     Opts are stashed on host.__sspTableOpts (not serializable). React-side
     reads them on render. To trigger re-render after updating opts — bump
     host.dataset.itemsKey (or .sortKey / .emptyText) to any new value. */
  mountAt(host, opts) {
    if (!host) return;
    host.__sspTableOpts = opts || {};
    if (_mounted.has(host)) {
      /* Already mounted — bump data-items-key to force MutationObserver render. */
      host.dataset.itemsKey = String((parseInt(host.dataset.itemsKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(React.createElement(SspTable, { host }));
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspTableOpts; } catch (_) {}
  },
  unmountAllIn(container) {
    const scope = container || document;
    scope.querySelectorAll('[data-ssp-table-host]').forEach((h) => {
      window.__SSP_TABLE.unmountAt(h);
    });
  },
};
