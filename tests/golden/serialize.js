/**
 * Сериализация bridge-payload'ов в снапшот-форму (Фаза 2 декомпозиции).
 *
 * materializeTable(host): читает opts, застэшенные recording-стабом
 * __SSP_TABLE.mountAt (host.__sspTableOpts), и МАТЕРИАЛИЗУЕТ ячейки —
 * вызывает columns[].getValue(item) для каждой строки. Снимок фиксирует
 * фактический HTML/значения ячеек, т.е. render-логику IIFE-стороны,
 * которая и будет выноситься при декомпозиции.
 */
'use strict';

/** Значение ячейки/заголовка → снапшот-форма. */
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if ('__html' in v) return { html: v.__html };
    if (typeof v.outerHTML === 'string') return { html: v.outerHTML };
  }
  return v;
}

/** Материализованный контракт Ring Table из host.__sspTableOpts (или null). */
function materializeTable(host) {
  const opts = host && host.__sspTableOpts;
  if (!opts) return null;
  const items = opts.items || [];
  return {
    sortKey: opts.sortKey !== undefined ? opts.sortKey : null,
    stickyHeader: opts.stickyHeader !== false,
    emptyText: opts.emptyText !== undefined ? opts.emptyText : null,
    itemKeys: items.map(function (it) {
      return opts.getItemKey ? opts.getItemKey(it) : (it.id || it.issueId || null);
    }),
    columns: (opts.columns || []).map(function (c) {
      return {
        id: c.id,
        title: c.title !== undefined ? c.title : null,
        sortable: !!c.sortable,
        className: c.className || null,
        rightAlign: !!c.rightAlign,
        header: typeof c.getHeaderValue === 'function' ? cellValue(c.getHeaderValue()) : null,
        cells: items.map(function (it) { return cellValue(c.getValue(it, c)); }),
      };
    }),
  };
}

module.exports = { materializeTable, cellValue };
