/* Тир D слайс 6, ступень 2 (#39) → #20-v2 (v3.2.0) — React-презентация диаграммы Ганта
   на vendored gantt-task-react (MIT, SSP_VENDORED.GanttTaskReact из вендор-чанка).
   Логика (выбор items v5.0.3, сортировка D81, date-математика, бейдж-данные #20,
   контракты реассайна D46 и записи дат drag'а) остаётся в gantt-view.js: он строит
   view-model и зовёт мост mountAt(host, vm). Компонент тупой — ноль обращений к стейту.

   #20-v2 — что сохранено от кастомного timeline-ядра и как:
   - цвет бара = родной stateColor задачи YT (v2.1.14) → Task.styles.backgroundColor;
   - бейджи состояния #20 (пилюля + since/prev из Activities, lazy) — в ЛЕВОЙ КОЛОНКЕ
     через кастомный TaskListTable (data-gantt-hist-* атрибуты сохранены → DOM-поки
     _updateGanttHistDOM работают как прежде) + дублируются в кастомном TooltipContent;
   - fallback дат на границы спринта — в _buildGanttVm (не тронут);
   - реассайн D46: двойной клик по бару (одиночный клик у либы = select/drag).
   Компромиссы против старого ядра (согласовано «Замена + drag»): выходные не
   подсвечиваются (либа не умеет), вместо жёсткой сетки 34px — таймлайн либы.
   Новое: drag/resize баров → onDateChange → канон ta.dateStart/dateEnd (#40-канал);
   зум ViewMode Day/Week/Month; today-подсветка.

   Семантика дат: канон ta = UTC-полночь ms, dateEnd = ИНКЛЮЗИВНЫЙ последний день.
   Либа рисует end-exclusive → отображаем [start, end+1д), при drop'е конвертируем
   назад (endToInclusiveMs). Конверсия ms↔Date через календарные компоненты (UTC при
   чтении канона, локальные при чтении Date либы) — корректно при любом знаке TZ.

   IIFE-мост: window.__SSP_GANTT_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();
const DAY = 86400000;

/* ms (UTC-полночь, канон ta) → локальный Date того же календарного дня. */
function msToLocalDay(ms) {
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/* Локальный Date → UTC-полночь ms того же календарного дня. */
function localDayToMs(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
/* Конец бара либы (exclusive Date) → инклюзивный последний день (ms, канон хранения):
   ровно полночь → предыдущий день; иначе (drop внутри дня) — этот же день. */
function endToInclusiveMs(end) {
  const floor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const last = (end.getTime() === floor.getTime()) ? new Date(floor.getTime() - DAY) : floor;
  return localDayToMs(last);
}

const ST = {
  listCell: {
    boxSizing: 'border-box', padding: '4px 8px', overflow: 'hidden',
    borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    background: 'var(--surface)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  listHeader: {
    boxSizing: 'border-box', padding: '6px 10px', fontWeight: 600, fontSize: '12px',
    background: 'var(--surface2)', border: '1px solid var(--border)', borderBottom: 'none',
    display: 'flex', alignItems: 'center',
  },
  taskLink: {
    fontWeight: 600, display: 'block', overflow: 'hidden', fontSize: '12px',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  taskAssignee: {
    fontSize: '11px', color: 'var(--muted)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  badgeWrap: { marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden' },
  badgeSince: { color: 'var(--muted)', fontSize: '10px', marginLeft: '4px' },
  badgePrev: { color: 'var(--muted)', fontSize: '10px', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  pillDot: { display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0 },
};

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

/* Левая колонка либы (кастомный TaskListTable): паритет со старым ядром — ссылка на
   задачу, исполнитель, бейдж #20 с hist-плейсхолдерами. Высота строки = rowHeight
   пропа либы (жёстко — бары выравниваются по index*rowHeight). */
function makeTaskListTable(vm) {
  return function GanttTaskList({ tasks, rowHeight, rowWidth }) {
    return (
      <div style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {tasks.map((t) => {
          const row = (vm._rowsById && vm._rowsById[t.id]) || { issueId: t.id, title: t.name, url: '', assignee: '' };
          return (
            <div key={t.id} data-gantt-issue={row.issueId}
              style={{ ...ST.listCell, height: rowHeight + 'px', width: rowWidth }}>
              {/* класс link — тема виджета поверх Ring-токенов (--primary) */}
              <a href={row.url} target="_blank" rel="noopener noreferrer" className="link" style={ST.taskLink} title={row.title}>{row.issueId}</a>
              <div style={ST.taskAssignee}>{row.assignee}</div>
              <GanttBadge row={row} />
            </div>
          );
        })}
      </div>
    );
  };
}

function makeTaskListHeader(vm) {
  return function GanttTaskListHeader({ headerHeight, rowWidth }) {
    return (
      <div style={{ ...ST.listHeader, height: headerHeight + 'px', width: rowWidth }}>
        {vm.taskColHeader}
      </div>
    );
  };
}

/* Кастомный тултип бара: ID · заголовок · исполнитель · даты (канонные, инклюзивные). */
function makeTooltip(vm) {
  return function GanttTooltip({ task }) {
    const row = (vm._rowsById && vm._rowsById[task.id]) || null;
    if (!row) return <div />;
    const dates = (typeof vm.fmtDate === 'function')
      ? vm.fmtDate(row.startTs) + ' – ' + vm.fmtDate(row.endTs) : '';
    return (
      <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border,#dfe3e8)', borderRadius: '6px',
        padding: '8px 10px', fontSize: '12px', boxShadow: '0 3px 6px rgba(0,0,0,.16)', maxWidth: '300px' }}>
        <div style={{ fontWeight: 600 }}>{row.issueId}</div>
        <div style={{ margin: '2px 0' }}>{row.title}</div>
        <div style={{ color: 'var(--muted,#6b7785)' }}>{row.assignee}</div>
        {dates ? <div style={{ color: 'var(--muted,#6b7785)', marginTop: '2px' }}>{dates}</div> : null}
      </div>
    );
  };
}

const ZOOM_COLUMN_W = { Day: 44, Week: 120, Month: 200 };

/* Фейл-громко (#20-v2): OOPIF прячет ошибки фрейма от top-консоли (память
   feedback_oopif_hidden_errors_harness) — падение либы/рендера показываем ТЕКСТОМ
   в самом пейне (видно и юзеру, и a11y-смоуку), не роняя остальной виджет. */
class GanttErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: '12px', color: 'var(--error,#c22)', fontSize: '12px' }}>
          {'Gantt render error: ' + String((this.state.err && this.state.err.message) || this.state.err)}
        </div>
      );
    }
    return this.props.children;
  }
}

function GanttChart({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [zoom, setZoom] = React.useState('Day');
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
  /* Кастомные компоненты либы пересоздаются только при смене vm (не при drag'е). */
  const parts = React.useMemo(() => (vm ? {
    TaskListTable: makeTaskListTable(vm),
    TaskListHeader: makeTaskListHeader(vm),
    TooltipContent: makeTooltip(vm),
  } : null), [vm]);
  if (!vm) return null;
  const GT = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.GanttTaskReact;
  if (!GT || !GT.Gantt) return null;   /* вендор-чанк несёт и React, и либу — ветка теоретическая */
  const { Gantt, ViewMode } = GT;
  vm._rowsById = {};
  vm.rows.forEach((r) => { vm._rowsById[r.issueId] = r; });
  const tasks = vm.rows.map((r) => ({
    id: r.issueId, name: r.issueId, type: 'task',
    start: msToLocalDay(r.startTs), end: msToLocalDay(r.endTs + DAY),   /* инклюзивный канон → exclusive либы */
    progress: 0, isDisabled: !vm.editable,
    styles: { backgroundColor: r.bg, backgroundSelectedColor: r.bg, progressColor: r.bg, progressSelectedColor: r.bg },
  }));
  const zoomBtns = [['Day', vm.zoomLabels && vm.zoomLabels.day], ['Week', vm.zoomLabels && vm.zoomLabels.week], ['Month', vm.zoomLabels && vm.zoomLabels.month]];
  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', margin: '0 0 8px' }}>
        {zoomBtns.map(([m, label]) => (
          <button type="button" key={m} onClick={() => setZoom(m)}
            className={'ring-button-button ring-button-heightS' + (zoom === m ? ' ring-button-primary' : '')}>
            {label || m}
          </button>
        ))}
      </div>
      {/* v3.2.1 — rowHeight 88: 4 строки ячейки (ссылка+исполнитель+бейдж+hist) при
          наследуемом line-height 1.5 занимают ~82px; при 64px строка «← было…» клипалась. */}
      <Gantt
        tasks={tasks}
        viewMode={ViewMode[zoom]}
        locale={vm.lang || 'en'}
        rowHeight={88}
        headerHeight={50}
        listCellWidth="220px"
        columnWidth={ZOOM_COLUMN_W[zoom] || 60}
        todayColor="rgba(66,130,214,0.18)"
        barCornerRadius={8}
        fontSize="12px"
        TaskListTable={parts.TaskListTable}
        TaskListHeader={parts.TaskListHeader}
        TooltipContent={parts.TooltipContent}
        onDateChange={vm.editable && typeof vm.onDateChange === 'function'
          ? (task) => vm.onDateChange(task.id, localDayToMs(task.start), endToInclusiveMs(task.end))
          : undefined}
        onDoubleClick={typeof vm.onBarDoubleClick === 'function'
          ? (task) => vm.onBarDoubleClick(task.id)
          : undefined}
      />
    </div>
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
    root.render(<GanttErrorBoundary><GanttChart host={host} /></GanttErrorBoundary>);
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
