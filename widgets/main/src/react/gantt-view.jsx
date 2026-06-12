/* Тир D слайс 6, ступень 2 (#39) — React-презентация диаграммы Ганта.
   Логика (выбор items v5.0.3, сортировка D81, date-математика, бейдж-данные #20,
   click-контракт реассайна D46, план history-фетча) остаётся в gantt-view.js:
   он строит view-model и зовёт мост mountAt(host, vm). Компонент тупой —
   рендерит готовые строки, ноль обращений к стейту монолита.

   #39 «Ring-обвязка» — итог feasibility (research-first, бэклог):
   - Ring Table для левой колонки НЕ применяется: чарту нужна жёсткая сетка
     ячеек 34×36px и sticky первой колонки при горизонтальном скролле дней —
     Ring Table управляет layout/высотами строк сам, выравнивание двух слоёв =
     драка с layout (риск, предсказанный в #39). Таблица «задача × дни» и есть
     timeline-ядро — остаётся кастомной (JSX).
   - Ring Tooltip вне vendored-сабсета (рост бандла ради hover-подсказок не
     оправдан) — нативные title сохранены.
   - Бейдж состояния — пилюля в РОДНЫХ цветах stateColor YT (#20, осознанный
     дизайн: цвет = смысл состояния задачи); Ring Tag заменил бы их темой.
     Fallback-фон пилюли без stateColor — Ring-токен ring-tag-background-color.
   - Токены: палитра рендера уже на theme-переменных (--surface2/--border/
     --muted/--text), замапленных на Ring-тему виджета, — сохранены.

   Паритет с vanilla-рендером ступени 1: те же id/классы/data-атрибуты
   (gantt-cell, data-issue, data-inbar, data-gantt-issue, data-gantt-hist-*),
   те же inline-стили; история #20 по-прежнему заполняется DOM-поками
   _updateGanttHistDOM (легитимно поверх React: каждый renderGanttChart() даёт
   свежий vm → свежие плейсхолдеры). Контракт-отличие ступени 2: history-фетч
   стартует ПОСЛЕ коммита DOM (vm.onAfterRender из useEffect), не синхронно
   после innerHTML — иначе DOM-поки кэш-хитов промахиваются мимо ещё не
   закоммиченного React-дерева.

   IIFE-мост: window.__SSP_GANTT_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

const ST = {
  table: { borderCollapse: 'collapse', minWidth: '600px', fontSize: '12px' },
  thTask: {
    minWidth: '180px', maxWidth: '220px', padding: '6px 10px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    position: 'sticky', left: 0, zIndex: 2, whiteSpace: 'nowrap',
    fontWeight: 600, fontSize: '12px',
  },
  tdTask: {
    padding: '4px 8px', border: '1px solid var(--border)', position: 'sticky',
    left: 0, background: 'var(--surface)', zIndex: 1, maxWidth: '220px', overflow: 'hidden',
  },
  taskLink: {
    fontWeight: 600, display: 'block', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  taskAssignee: {
    fontSize: '11px', color: 'var(--muted)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  badgeWrap: { marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden' },
  badgeSince: { color: 'var(--muted)', fontSize: '10px', marginLeft: '4px' },
  badgePrev: { color: 'var(--muted)', fontSize: '10px', marginTop: '1px', whiteSpace: 'normal' },
  pillDot: { display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0 },
};

function dayTh(day, idx) {
  /* Даты — чёрный читаемый шрифт; выходные чуть светлее */
  const style = {
    minWidth: '34px', padding: '4px 3px',
    background: day.weekend ? 'rgba(255,255,255,.03)' : 'var(--surface2)',
    border: '1px solid var(--border)', fontWeight: 700, fontSize: '11px',
    color: day.weekend ? 'var(--muted)' : 'var(--text)',
    textAlign: 'center', whiteSpace: 'nowrap',
  };
  return <th key={idx} style={style}>{day.label}</th>;
}

/* Бейдж состояния (#20): пилюля в родных цветах stateColor + (на активном
   спринте) плейсхолдеры since/prev, которые заполняет _updateGanttHistDOM. */
function GanttBadge({ row }) {
  const b = row.badge;
  if (!b) return null;
  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 5px',
    borderRadius: '10px', fontSize: '10px', lineHeight: 1.4,
    background: b.pillBg, color: b.pillFg,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
  };
  return (
    <React.Fragment>
      <div style={ST.badgeWrap}>
        <span style={pill}>
          <span style={{ ...ST.pillDot, background: b.pillFg }} />
          {b.label}
        </span>
        {b.hist ? <span data-gantt-hist-since={row.issueId} style={ST.badgeSince} /> : null}
      </div>
      {b.hist ? <div data-gantt-hist-prev={row.issueId} style={ST.badgePrev}>{b.loadingText}</div> : null}
    </React.Fragment>
  );
}

/* Полоса в ячейке: pill-скругление на торцах, прямой стык в середине. */
function barDiv(row, isStart, isEnd) {
  const r = '999px';
  const isSingle = isStart && isEnd;
  let br;
  if (isSingle) br = r;                       // полная пилюля
  else if (isStart) br = `${r} 0 0 ${r}`;     // скруглён только левый торец
  else if (isEnd) br = `0 ${r} ${r} 0`;       // скруглён только правый торец
  else br = '0';                              // середина — без скругления
  const style = {
    position: 'absolute', top: '50%',
    left: isStart ? '4px' : 0, right: isEnd ? '4px' : 0,
    transform: 'translateY(-50%)', height: '60%',
    background: row.bg, borderRadius: br,
    boxShadow: '0 2px 6px rgba(0,0,0,.18)', pointerEvents: 'none',
  };
  return <div style={style} />;
}

function GanttRow({ row, totalDays, onCellClick }) {
  const cells = [];
  for (let d = 0; d < totalDays; d++) {
    const inBar = d >= row.startDay && d <= row.endDay;
    const isStart = d === row.startDay;
    const isEnd = d === row.endDay;
    const cellStyle = {
      padding: 0, border: '1px solid var(--border)', minWidth: '34px', height: '36px',
      cursor: inBar ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
    };
    cells.push(
      <td
        key={d}
        className="gantt-cell"
        data-issue={row.issueId}
        data-inbar={inBar ? '1' : '0'}
        style={cellStyle}
        onClick={inBar && onCellClick ? (e) => onCellClick(row.issueId, e.currentTarget) : undefined}
      >
        {inBar ? barDiv(row, isStart, isEnd) : null}
      </td>
    );
  }
  return (
    <tr data-gantt-issue={row.issueId}>
      <td style={ST.tdTask} title={row.title}>
        {/* класс link — тема виджета поверх Ring-токенов (--primary) */}
        <a href={row.url} target="_blank" rel="noopener noreferrer" className="link" style={ST.taskLink}>{row.issueId}</a>
        <div style={ST.taskAssignee}>{row.assignee}</div>
        <GanttBadge row={row} />
      </td>
      {cells}
    </tr>
  );
}

function GanttChart({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);

  const vm = host.__sspGanttVm;
  React.useEffect(() => {
    /* После КАЖДОГО коммита DOM — пинок history-фетча #20 (плейсхолдеры уже
       в дереве, DOM-поки кэш-хитов youtrack-api попадают в цель). */
    if (vm && typeof vm.onAfterRender === 'function') vm.onAfterRender();
  });
  if (!vm) return null;
  const totalDays = vm.days.length;
  return (
    <table style={ST.table}>
      <thead>
        <tr>
          <th style={ST.thTask}>{vm.taskColHeader}</th>
          {vm.days.map(dayTh)}
        </tr>
      </thead>
      <tbody>
        {vm.rows.map((row) => (
          <GanttRow key={row.issueId} row={row} totalDays={totalDays} onCellClick={vm.onCellClick} />
        ))}
      </tbody>
    </table>
  );
}

window.__SSP_GANTT_MOUNT = {
  /* mountAt(host, vm): vm стэшится на host.__sspGanttVm (несериализуемо),
     ре-рендер форсится бампом data-vm-key (MutationObserver внутри компонента —
     паттерн standup/table-mount). Идемпотентно: root создаётся один раз на host. */
  mountAt(host, vm) {
    if (!host) return;
    host.__sspGanttVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<GanttChart host={host} />);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspGanttVm; } catch (_) { /* noop */ }
  },
};
