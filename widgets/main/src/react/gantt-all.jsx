/* #122 «Сквозной Гант по всем ролям» (v3.47.0 → v3.48.0) — React-презентация режима «Все роли» на vendored
   gantt-task-react 0.3.9 (SSP_VENDORED.GanttTaskReact). Логика — domain/gantt-all-view.js (vm) и
   pure/gantt-all-pure.js (правила, ось); компонент тупой: ноль обращений к стейту, правка — колбэками vm.

   Что делает либа и что поверх неё:
   - строки одной высоты (rowHeight 70, бар 31 px через barFill 44); заголовок дорожки и группа эпика — строки
     type 'project' (сводная полоса / охват подзадач, isDisabled — без drag); сворачивание — фильтром в vm
     (hideChildren либе не передаётся); порядок — displayOrder с 1;
   - полоса без дат после прогноза (3.48.0) — task с end = start: либа сама делает её smalltask, подпись
     (пометка «ждёт / не помещается») выносит справа от старта; фон прозрачный, стрелок нет;
   - левый список 380 px и тултип бара — наши компоненты (TaskListTable / TaskListHeader / TooltipContent);
     select исполнителя неуправляемый: change ловит делегат домена на контейнере;
   - поверх SVG одним MutationObserver-эффектом (узлы помечены data-ssp-poke и не будят наблюдателя):
     покраска стрелок (тип / пунктир цепочки / --warn виновника), обводка и «!» конфликтных полос, полосы
     фаз в g.gridBody и шапка 76 (плашки фаз, подписи месяцев режима Day по центру месяца внутри оси).
     Координаты — копия оси либы (GANTT_ALL_PURE.axisDates / xOf) с самопроверкой по x первого бара:
     разошлась с DOM — полосы не рисуем, не гадаем.

   IIFE-мост: window.__SSP_GANTT_ALL_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RingIcon } from './settings-shared.jsx';
import { DAY, msToLocalDay, localDayToMs, endToInclusiveMs, GanttBadge, ExtDepsBadge, GanttErrorBoundary,
  ZOOM_COLUMN_W, paintArrows, GanttLegend } from './gantt-shared.jsx';

const _mounted = new WeakMap();
const ROW_H = 70;
const SVG_NS = 'http://www.w3.org/2000/svg';
/* Сводная полоса дорожки — тон primary (как подсветка «сегодня»): приглушённая у развёрнутой, плотнее у свёрнутой;
   бар группы эпика (Д8) — плотнее сводной, чтобы отличался от неё. */
const TRACK_BG = 'rgba(66,130,214,0.18)';
const TRACK_BG_COLLAPSED = 'rgba(66,130,214,0.45)';
const EPIC_BG = 'rgba(66,130,214,0.35)';

/* Ring Tooltip внутри React-дерева (мост mountTooltips переносит узлы и сломал бы реконсиляцию), тёмная,
   задержка 500 мс; без вендора — нативный title. */
function Tip({ title, children }) {
  const Tooltip = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Tooltip;
  if (!Tooltip) return <span title={title}>{children}</span>;
  return <Tooltip title={title} delay={500}>{children}</Tooltip>;
}

function Caret({ row, vm }) {
  const i = vm.i18nExt || {};
  const label = row.kind === 'epic' ? row.chipText : (row.collapsed ? i.expand : i.collapse);
  return (
    <button type="button" className="ssp-gantt-all__caret" aria-expanded={!row.collapsed}
      title={label} aria-label={label} onClick={() => { if (typeof vm.onToggle === 'function') vm.onToggle(row.id); }}>
      {row.collapsed ? '▸' : '▾'}
    </button>
  );
}

function TrackRow({ row, vm, h, w }) {
  const i = vm.i18nExt || {};
  const empty = row.nosnap && !row.count;
  return (
    <div className={'ssp-gantt-all__track' + (row.nosnap ? ' ssp-gantt-all__track--nosnap' : '')}
      style={{ height: h + 'px', width: w }} data-gantt-track={row.rk}>
      <div className="ssp-gantt-all__line">
        {empty ? null : <Caret row={row} vm={vm} />}
        <span className="ssp-gantt-all__role" title={row.label}>{row.label}</span>
        <span className="ssp-gantt-all__cnt">
          {empty ? i.noSnapshot : row.tasksText + (row.nosnap ? ' · ' + i.noSnapshot : '')}
          {row.conflictsText ? <span className="ssp-gantt-all__cnt-warn">{' · ' + row.conflictsText}</span> : null}
        </span>
      </div>
      {row.chips && row.chips.length ? (
        <div className="ssp-gantt-all__chips">
          {row.chips.map((c) => <span key={c} className="ssp-gantt-all__phase-chip">{c}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/* Строка задачи (Д4) и строка группы эпика (Д8): родитель в своей роли — полная строка с чипом; в чужой —
   чип и пометка роли родителя с подсказкой, без исполнителя и состояния. Подзадача — с отступом. */
function TaskRow({ row, vm, h, w }) {
  const i = vm.i18nExt || {};
  const epic = row.kind === 'epic', foreign = epic && !row.own;
  const known = (row.options || []).some((o) => o.value === row.assignee);
  const chip = epic ? <span className="ssp-gantt-all__epic-chip">{row.chipText}</span> : null;
  const cls = 'ssp-gantt-all__row' + (epic ? ' ssp-gantt-all__row--epic' : '') + (row.indent ? ' ssp-gantt-all__row--child' : '');
  return (
    <div className={cls} style={{ height: h + 'px', width: w }} data-gantt-issue={row.issueId} data-gantt-rk={row.rk}>
      <div className="ssp-gantt-all__line">
        {epic ? <Caret row={row} vm={vm} /> : null}
        <a href={row.url} target="_blank" rel="noopener noreferrer" className="link ssp-gantt-all__key">{row.issueId}</a>
        <span className="ssp-gantt-all__title" title={row.title}>{row.title}</span>
      </div>
      <div className="ssp-gantt-all__line">
        {foreign ? (
          <React.Fragment>
            {chip}
            <Tip title={row.parentRoleTip}><span className="ssp-gantt-all__parent-role">{row.parentRoleText}</span></Tip>
          </React.Fragment>
        ) : row.canAssign ? (
          /* неуправляемый select: change — делегатом домена; key пересоздаёт его при смене исполнителя */
          <select key={row.assignee} className="ssp-gantt-all__assignee assigner-btn" data-issue={row.issueId} data-rk={row.rk}
            defaultValue={row.assignee} title={i.assigneeTip}>
            <option value="">{i.notAssigned}</option>
            {row.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {row.assignee && !known ? <option value={row.assignee}>{row.assigneeText}</option> : null}
          </select>
        ) : <span className="ssp-gantt-all__who" title={row.assigneeText}>{row.assigneeText}</span>}
      </div>
      {foreign ? null : (
        <div className="ssp-gantt-all__line">
          {chip}
          <GanttBadge row={row} />
          <ExtDepsBadge row={row} i18n={vm.i18nExt} />
          {row.unfitText ? <span className="ssp-gantt-all__unfit" title={row.unfitTip}>{'! ' + row.unfitText}</span> : null}
        </div>
      )}
    </div>
  );
}

function makeTaskList(vm) {
  return function GanttAllList({ tasks, rowHeight, rowWidth }) {
    return (
      <div className="ssp-gantt-all__list">
        {tasks.map((t) => {
          const row = vm._rowsById[t.id];
          if (!row) return <div key={t.id} style={{ height: rowHeight + 'px', width: rowWidth }} />;
          return row.kind === 'track'
            ? <TrackRow key={t.id} row={row} vm={vm} h={rowHeight} w={rowWidth} />
            : <TaskRow key={t.id} row={row} vm={vm} h={rowHeight} w={rowWidth} />;
        })}
      </div>
    );
  };
}

function makeListHeader(vm) {
  return function GanttAllListHeader({ headerHeight, rowWidth }) {
    return <div className="ssp-gantt-all__list-h" style={{ height: headerHeight + 'px', width: rowWidth }}>{vm.taskColHeader}</div>;
  };
}

/* Тултип бара (Д5): ключ, название, исполнитель · роль дорожки, даты (или пометка прогноза), строки конфликтов тоном --warn. */
function makeTooltip(vm) {
  return function GanttAllTooltip({ task }) {
    const row = vm._rowsById[task.id];
    if (!row || row.kind !== 'bar') return <div />;
    const dates = row.unfit ? row.unfitText
      : ((typeof vm.fmtDate === 'function') ? vm.fmtDate(row.startTs) + ' – ' + vm.fmtDate(row.endTs) : '');
    return (
      <div className="ssp-gantt-all__tip">
        <div className="ssp-gantt-all__tip-key">{row.issueId}</div>
        <div>{row.title}</div>
        <div className="ssp-gantt-all__tip-muted">{row.assigneeText + ' · ' + row.roleLabel}</div>
        {dates ? <div className={row.unfit ? 'ssp-gantt-all__tip-warn' : 'ssp-gantt-all__tip-muted'}>{dates}</div> : null}
        {row.conflicts.map((c, k) => <div key={k} className="ssp-gantt-all__tip-warn">{'! ' + c}</div>)}
      </div>
    );
  };
}

/* Счётчик конфликтов (Д1): подсказка — Ring Tooltip, тёмная, задержка 500 мс. */
function ConflictCounter({ vm }) {
  return <Tip title={vm.conflictsTip}><span className="ssp-gantt-all__conflicts"><RingIcon name="warning" />{vm.conflictsCounter}</span></Tip>;
}

function _svg(tag, attrs, style) {
  const n = document.createElementNS(SVG_NS, tag);
  n.setAttribute('data-ssp-poke', '1');
  Object.keys(attrs).forEach((k) => n.setAttribute(k, String(attrs[k])));
  Object.assign(n.style, { pointerEvents: 'none' }, style || {});
  return n;
}
function _isPoke(n) { return !!(n && n.nodeType === 1 && n.hasAttribute('data-ssp-poke')); }

function _bandX(P, b, dates, colW) {
  const x = P.xOf(msToLocalDay(b.startMs), dates, colW);
  return { x: x, w: P.xOf(msToLocalDay(b.endMs + DAY), dates, colW) - x };
}

/* Все поки полотна. Идемпотентно: свои узлы снимаются и ставятся заново после каждого коммита либы. */
function _pokeAll(host, vm, tasks, zoom) {
  const P = globalThis.__SSP_GANTT_ALL_PURE, LRP = globalThis.__SSP_LINK_ROLES_PURE;
  if (!host || !P || !LRP || !tasks.length) return;
  host.querySelectorAll('[data-ssp-poke]').forEach((n) => n.remove());
  const byId = vm._rowsById;
  const plan = LRP.ganttArrowOrder(tasks.map((t) => ({
    id: t.id, dependencies: t.dependencies || [], depTypes: (byId[t.id] && byId[t.id].depTypes) || {},
  })));
  paintArrows(host, plan, P.arrowStyles(plan, vm.linkColors || {}, vm.conflictEdges || {}));

  /* Конфликтные полосы (Д5): обводка 2 px --warn и «!» у левого края; g.bar > g идут в порядке tasks. */
  const nodes = host.querySelectorAll('g.bar > g');
  if (nodes.length !== tasks.length) return;
  let first = null;
  tasks.forEach((t, i) => {
    const rect = nodes[i].querySelector('rect._31ERP');
    if (!rect) return;
    const x = parseFloat(rect.getAttribute('x')), y = parseFloat(rect.getAttribute('y')), hh = parseFloat(rect.getAttribute('height'));
    if (!first) first = { i: i, x: x };
    const hit = !!(byId[t.id] && byId[t.id].conflicts && byId[t.id].conflicts.length);
    rect.style.stroke = hit ? 'var(--warn)' : '';
    rect.style.strokeWidth = hit ? '2px' : '';
    if (!hit) return;
    nodes[i].appendChild(_svg('circle', { cx: x + 9, cy: y + hh / 2, r: 6 }, { fill: 'var(--surface)', stroke: 'var(--warn)', strokeWidth: '1.5px' }));
    const mark = _svg('text', { x: x + 9, y: y + hh / 2 + 3.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700 }, { fill: 'var(--warn)' });
    mark.textContent = '!';
    nodes[i].appendChild(mark);
  });

  /* Полосы фаз и шапка 76 (Д6) — только при фазах и сошедшейся с DOM оси. */
  const bands = vm.phaseBands || [];
  if (!bands.length || !first) return;
  const colW = ZOOM_COLUMN_W[zoom] || 60;
  let minS = tasks[0].start, maxE = tasks[0].start;   /* как ganttDateRange либы */
  tasks.forEach((t) => { if (t.start < minS) minS = t.start; if (t.end > maxE) maxE = t.end; });
  const dates = P.axisDates(minS, maxE, zoom);
  if (Math.abs(P.xOf(tasks[first.i].start, dates, colW) - first.x) > 0.5) { host.dataset.sspPhasesSkip = '1'; return; }
  delete host.dataset.sspPhasesSkip;

  const grid = host.querySelector('g.gridBody');
  if (grid) {
    const g = _svg('g', {});
    const total = ROW_H * tasks.length;
    const tracks = [];
    tasks.forEach((t, i) => { if (byId[t.id] && byId[t.id].kind === 'track') tracks.push(i); });
    bands.forEach((b) => {
      const bx = _bandX(P, b, dates, colW);
      if (bx.w <= 0) return;
      g.appendChild(_svg('rect', { x: bx.x, y: 0, width: bx.w, height: total, 'data-phase': b.key }, { fill: 'var(--primary)', fillOpacity: '0.045' }));
      g.appendChild(_svg('line', { x1: bx.x, x2: bx.x, y1: 0, y2: total }, { stroke: 'var(--primary)', opacity: '0.25' }));
      tracks.forEach((ti, k) => {
        if (b.roles.indexOf(byId[tasks[ti].id].rk) < 0) return;
        const end = (k + 1 < tracks.length) ? tracks[k + 1] : tasks.length;
        g.appendChild(_svg('rect', { x: bx.x, y: ti * ROW_H, width: bx.w, height: (end - ti) * ROW_H }, { fill: 'var(--primary)', fillOpacity: '0.11' }));
      });
    });
    grid.appendChild(g);
  }
  const cal = host.querySelector('g.calendar');
  if (cal) {
    const g = _svg('g', {});
    let labelEnd = -Infinity;
    cal.appendChild(g);
    bands.forEach((b) => {
      const bx = _bandX(P, b, dates, colW);
      if (bx.w <= 0) return;
      g.appendChild(_svg('rect', { x: bx.x + 1, y: 4, width: Math.max(0, bx.w - 2), height: 18, rx: 4 }, { fill: 'var(--primary)', fillOpacity: '0.12' }));
      /* одновременные фазы (регресс и бизнес-тест) делят строку плашек — подпись, наезжающая текстом на
         предыдущую, не рисуется; ширина текста — оценкой (замер 0, пока вкладка скрыта) */
      const half = Math.min(b.label.length * 6.5, bx.w - 6) / 2, cx = bx.x + bx.w / 2;
      if (bx.w < 24 || cx - half < labelEnd + 4) return;
      labelEnd = cx + half;
      const label = _svg('text', { x: bx.x + bx.w / 2, y: 17, 'text-anchor': 'middle', 'font-size': 11 }, { fill: 'var(--primary)' });
      label.textContent = b.label;
      g.appendChild(label);
      if (typeof label.getComputedTextLength === 'function' && label.getComputedTextLength() > bx.w - 6) {
        label.setAttribute('textLength', String(bx.w - 6));
        label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
    /* Подписи месяцев режима Day (§О7): у либы они стоят только на стыке месяцев и уезжают за край — скрыты CSS. */
    if (zoom === 'Day') {
      P.monthSpans(dates, colW).forEach((m) => {
        const s = m.date.toLocaleDateString(vm.lang || 'en', { month: 'long', year: 'numeric' });
        const t = _svg('text', { x: m.x, y: 36, 'text-anchor': 'middle', 'font-size': 12 }, { fill: 'var(--muted)' });
        /* обрезок месяца у края оси уже подписи — не рисуем, иначе «густ 2026 г.»; ширина — оценкой по длине:
           getComputedTextLength даёт 0, пока вкладка Ганта скрыта при первом рендере */
        if (s.length * 7 + 8 > m.w) return;
        t.textContent = s.charAt(0).toLocaleUpperCase() + s.slice(1);
        g.appendChild(t);
      });
    }
  }
}

function GanttAll({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [zoom, setZoom] = React.useState(() => (host.__sspGanttAllVm && host.__sspGanttAllVm.zoom) || 'Day');
  const tasksRef = React.useRef([]);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);

  const vm = host.__sspGanttAllVm;
  React.useEffect(() => {
    host.__sspGanttAllCommitted = true;
    if (vm && typeof vm.onAfterRender === 'function') vm.onAfterRender();
    if (!vm) return undefined;
    /* Либа строит бары и стрелки в своём эффекте, уже после нашего — поки переигрываются по появлению её
       узлов; изменения из одних наших узлов наблюдателя не будят (иначе цикл). */
    const poke = () => _pokeAll(host, vm, tasksRef.current, zoom);
    poke();
    const foreign = (list) => Array.prototype.some.call(list, (n) => !_isPoke(n));
    const obs = new MutationObserver((records) => {
      if (records.some((r) => foreign(r.addedNodes) || foreign(r.removedNodes))) poke();
    });
    obs.observe(host, { childList: true, subtree: true });
    return () => obs.disconnect();
  });
  const parts = React.useMemo(() => (vm ? {
    TaskListTable: makeTaskList(vm),
    TaskListHeader: makeListHeader(vm),
    TooltipContent: makeTooltip(vm),
  } : null), [vm]);
  if (!vm) return null;
  const GT = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.GanttTaskReact;
  if (!GT || !GT.Gantt) return null;
  const { Gantt, ViewMode } = GT;
  vm._rowsById = {};
  vm.rows.forEach((r) => { vm._rowsById[r.id] = r; });
  const paint = (bg) => ({ backgroundColor: bg, backgroundSelectedColor: bg, progressColor: bg, progressSelectedColor: bg });
  const tasks = vm.rows.map((r, idx) => {
    const base = {
      id: r.id, progress: 0, displayOrder: idx + 1,   /* 0 либа читает как «нет порядка» */
      start: msToLocalDay(r.startTs), end: msToLocalDay(r.endTs + DAY),
      dependencies: (r.dependencies && r.dependencies.length) ? r.dependencies.slice() : undefined,
    };
    if (r.kind === 'track') {
      return Object.assign(base, { name: '', type: 'project', isDisabled: true,
        styles: paint(!r.count ? 'transparent' : (r.collapsed ? TRACK_BG_COLLAPSED : TRACK_BG)) });
    }
    if (r.kind === 'epic') {
      return Object.assign(base, { name: r.issueId, type: 'project', project: r.parent, isDisabled: true, styles: paint(EPIC_BG) });
    }
    if (r.unfit) {
      return Object.assign(base, { end: base.start, name: r.unfitText, type: 'task', project: r.parent, isDisabled: true, styles: paint('transparent') });
    }
    return Object.assign(base, { name: r.issueId, type: 'task', project: r.parent, isDisabled: !vm.editable || r.readonly, styles: paint(r.bg) });
  });
  tasksRef.current = tasks;
  const zoomBtns = [['Day', vm.zoomLabels.day], ['Week', vm.zoomLabels.week], ['Month', vm.zoomLabels.month]];
  const months = !!(vm.phaseBands && vm.phaseBands.length) && zoom === 'Day';
  return (
    <div className={'ssp-gantt-all' + (months ? ' ssp-gantt-all--months' : '')}>
      <div className="ssp-gantt-all__scale">
        <div className="ssp-gantt-all__zoom">
          {zoomBtns.map(([m, label]) => (
            <button type="button" key={m} onClick={() => { setZoom(m); if (typeof vm.onZoom === 'function') vm.onZoom(m); }}
              className={'ring-button-button ring-button-block ring-button-heightS' + (zoom === m ? ' ring-button-active' : '')}>
              {label || m}
            </button>
          ))}
        </div>
        <GanttLegend vm={vm} inline />
        {vm.conflictsCounter ? <ConflictCounter vm={vm} /> : null}
      </div>
      <Gantt
        tasks={tasks}
        viewMode={ViewMode[zoom]}
        locale={vm.lang || 'en'}
        rowHeight={ROW_H}
        barFill={44}
        headerHeight={vm.headerHeight || 50}
        listCellWidth="380px"
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
      />
    </div>
  );
}

window.__SSP_GANTT_ALL_MOUNT = {
  /* mountAt(host, vm): vm стэшится на host.__sspGanttAllVm, ре-рендер — бампом data-vm-key (паттерн Ганта роли). */
  mountAt(host, vm) {
    if (!host) return;
    /* Контейнер очистили мимо моста (innerHTML в ветке «нет записи роли» режима «Роль»), а корень остался —
       он отцеплен от DOM и перерисовывал бы пустоту: пересоздаём. */
    if (_mounted.has(host) && host.__sspGanttAllCommitted && !host.firstChild) this.unmountAt(host);
    host.__sspGanttAllVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<GanttErrorBoundary><GanttAll host={host} /></GanttErrorBoundary>);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspGanttAllVm; delete host.__sspGanttAllCommitted; delete host.dataset.sspPhasesSkip; } catch (_) { /* noop */ }
  },
};
