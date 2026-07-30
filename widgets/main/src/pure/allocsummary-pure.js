/* #61 — Сводная таблица мультиролевого планирования: чистая сборка строк.
   Объединение составов всех активных ролей по issueId (дедуп), per-role
   оценки + сумма строки; раскраска — по перелимиту роли ЦЕЛИКОМ (⚖ владелец
   2026-07-30: красными помечаются все задачи перегруженной роли — потолок
   принят осознанно; построчный нарастающий итог по приоритету отвергнут,
   держится как второй шаг). Без DOM и стейта — потребитель
   domain/allocsummary-view.js, юниты — tests/unit/alloc-summary-61.test.js. */
'use strict';

/* Одна строка на уникальный issueId в порядке первого вхождения (обход ролей
   в порядке activeRoleKeys, внутри роли — порядок storage). Общие поля берутся
   из первой записи, где поле непусто: записи одной задачи в разных ролях
   набирались разными подборами и могут расходиться по заполненности.
   estByRole[rk]: null = задача в составе роли, но оценки нет; отсутствие
   ключа = задачи в составе роли нет (оба случая витрина показывает прочерком,
   различие держит inRoles — по нему считается перелимит-раскраска).
   estSum: сумма непустых оценок; ни одной — null (прочерк). */
function buildAllocSummaryRows(roleItemsMap, activeRoleKeys) {
  var all = roleItemsMap || {};
  var keys = Array.isArray(activeRoleKeys) ? activeRoleKeys : [];
  var COMMON_FIELDS = ['url', 'title', 'priority', 'xpriority', 'state', 'system', 'externalTicketId'];
  var order = [], byId = {};
  keys.forEach(function (rk) {
    var arr = Array.isArray(all[rk]) ? all[rk] : [];
    arr.forEach(function (it) {
      if (!it || !it.issueId) return;
      var row = byId[it.issueId];
      if (!row) {
        row = { issueId: it.issueId, url: null, title: null, priority: null,
                xpriority: null, state: null, system: null, externalTicketId: null,
                estByRole: {}, inRoles: [], estSum: null, isOver: false };
        byId[it.issueId] = row;
        order.push(row);
      }
      COMMON_FIELDS.forEach(function (f) {
        if (row[f] === null && it[f] !== null && it[f] !== undefined && it[f] !== '') row[f] = it[f];
      });
      var est = it['estimate_' + rk];
      row.estByRole[rk] = (est === null || est === undefined) ? null : est;
      row.inRoles.push(rk);
      if (est !== null && est !== undefined) row.estSum = (row.estSum === null ? 0 : row.estSum) + est;
    });
  });
  return order;
}

/* Пометка перелимита: строка «красная», если хотя бы одна роль, в составе
   которой она есть, перегружена (overlimitByRole[rk] truthy). Мутирует rows
   на месте (isOver), возвращает их же для чейнинга. */
function markOverlimitRows(rows, overlimitByRole) {
  var map = overlimitByRole || {};
  (rows || []).forEach(function (row) {
    row.isOver = (row.inRoles || []).some(function (rk) { return !!map[rk]; });
  });
  return rows;
}

const api = {
  buildAllocSummaryRows: buildAllocSummaryRows,
  markOverlimitRows: markOverlimitRows,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_ALLOCSUMMARY_PURE = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
