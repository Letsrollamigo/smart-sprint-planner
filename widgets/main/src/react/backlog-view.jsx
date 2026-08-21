/* #21 слайс 3 — React-презентация вида «по зонам» бэклога.
   Логика (VM-builder слайса 2a + обогащение лейблами/спросом) — в
   domain/backlog-view.js: строит view-model и зовёт мост mountAt(host, vm).
   Компонент ТУПОЙ — спойлеры (реальный Ring Collapse из vendored-сабсета) +
   таблицы задач, ноль обращений к стейту монолита. JSX автоэкранирует текст —
   esc() не нужен (в отличие от innerHTML-рендеров).

   IIFE-мост: window.__SSP_BACKLOG_MOUNT.mountAt(host, vm) / .unmountAt(host).
   Паттерн mount — gantt-view.jsx (vm стэшится на host.__sspBacklogVm,
   ре-рендер форсится бампом data-vm-key через MutationObserver).

   §6.1 вариант A: верхние спойлеры по ЭТАПУ; этап с >1 ролью — под-секции по
   ролям; этап с 1 ролью — без под-разбивки. Пул заказчика + «Прочие» (§8 fail-loud)
   — отдельные спойлеры. Пагинация 25/таблица («показать ещё») — состояние компонента.
   Полоса нагрузки (§6.3) — СТАБ слайса 3: только спрос (Σ остатков), без потолка. */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();
const AMBER = '#E56D17'; /* warning-токен палитры зеркала (§15 спеки) */

/* Error boundary: render-throw компонента не должен ронять весь пейн в blank —
   показываем сообщение (и репортим в diag через vm.onError, если задан). */
class BacklogBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e) {
    try {
      var vm = this.props.host && this.props.host.__sspBacklogVm;
      if (vm && typeof vm.onError === 'function') vm.onError(e);
    } catch (_) { /* noop */ }
  }
  render() {
    if (this.state.err) {
      return React.createElement('div', { style: { color: '#CC3645', padding: '12px', fontSize: '12px', whiteSpace: 'pre-wrap' } },
        'Backlog render error: ' + (this.state.err && this.state.err.message ? this.state.err.message : String(this.state.err)));
    }
    return this.props.children;
  }
}

const ST = {
  spoiler: { border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', marginBottom: '8px', overflow: 'hidden' },
  spoilerHead: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600, fontSize: '13px', color: 'var(--text)', textAlign: 'left' },
  chev: { color: 'var(--muted)', fontSize: '10px', flexShrink: 0 },
  spoilerBody: { padding: '4px 12px 10px' },
  strip: { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '0 0 12px' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '12px' },
  chipNum: { fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', margin: '4px 0' },
  th: { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' },
  td: { padding: '4px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  link: { fontWeight: 600 },
  pause: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' },
  poker: { display: 'inline-block', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'rgba(229,109,23,.12)', color: AMBER, border: '1px solid ' + AMBER, whiteSpace: 'nowrap' },
  more: { marginTop: '4px' },
  empty: { color: 'var(--muted)', padding: '16px 4px' },
  toSprint: { fontSize: '11px', whiteSpace: 'nowrap' },
  /* слайс 5 — шапка вкладки */
  header: { marginBottom: '12px' },
  headRow: { display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' },
  title: { fontWeight: 600, fontSize: '15px', color: 'var(--text)' },
  target: { fontSize: '12px', color: 'var(--muted)' },
  targetNone: { fontSize: '12px', color: AMBER },
  filterRow: { marginBottom: '10px' },
  /* §6.3 ёмкостный чип с мини-баром */
  capBarWrap: { display: 'inline-block', width: '48px', height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden', verticalAlign: 'middle', marginLeft: '2px' },
  capBar: { height: '100%', borderRadius: '3px' },
  chipOver: { color: '#CC3645', fontWeight: 600 },
  /* слайс 6 — переключатель видов + дерево */
  toggle: { display: 'inline-flex', gap: '6px', marginLeft: 'auto' },
  toggleBtn: { fontSize: '12px' },
  legend: { display: 'flex', flexWrap: 'wrap', gap: '12px', margin: '0 0 10px', fontSize: '12px', color: 'var(--muted)' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: '5px' },
  dot: { display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  warn: { margin: '0 0 12px', padding: '8px 12px', borderRadius: 'var(--radius, 6px)', fontSize: '12px', background: 'rgba(229,109,23,.10)', color: AMBER, border: '1px solid ' + AMBER },
  /* §12 carry-over бейджи */
  carryOver: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'rgba(229,109,23,.12)', color: AMBER, border: '1px solid ' + AMBER, whiteSpace: 'nowrap' },
  carryCont: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', whiteSpace: 'nowrap' },
  /* #polish — бейдж «в спринте» (задача уже в составе любого спринта планера) */
  inSprint: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'rgba(43,108,176,.12)', color: '#2b6cb0', border: '1px solid #2b6cb0', whiteSpace: 'nowrap' },
};

/* #3 — локальная сортировка таблицы вида «по ролям» (ID / Приоритет / Состояние), по аналогии
   с сортируемыми колонками таблиц планирования. Состояние сорта локально таблице (не глобальный
   ssp_sortKey планировщика — иначе клик в бэклоге менял бы сорт таблиц планирования). */
const PRIORITY_RANK = { 'Show-stopper': 0, 'Critical': 1, 'Major': 2, 'Normal': 3, 'Minor': 4 };
function prRank(p) {
  const k = String(p == null ? '' : p);
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, k) ? PRIORITY_RANK[k] : 1e6;
}
function idCmp(a, b) { return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, { numeric: true }); }
function sortTasks(tasks, key, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return tasks.slice().sort((a, b) => {
    let c;
    if (key === 'id') c = idCmp(a.idReadable, b.idReadable) * sign;
    else if (key === 'priority') c = (prRank(a.priorityName) - prRank(b.priorityName)) * sign;
    else c = String(a.stateName || '').localeCompare(String(b.stateName || '')) * sign;
    return c || idCmp(a.idReadable, b.idReadable);   /* стабильный тай-брейк: ID asc */
  });
}
/* Кликабельный заголовок-сортировка: клик по активной колонке — реверс направления. */
function SortTh({ label, col, sort, setSort }) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
  return (
    <th style={{ ...ST.th, cursor: 'pointer', userSelect: 'none' }}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => setSort(active ? { key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: col, dir: 'asc' })}>
      {label}{arrow}
    </th>
  );
}

/* §12 — бейдж «Перенос» (carryover) / «Продолжение» (continuation). */
function CarryBadge({ carry, i18n }) {
  if (!carry) return null;
  const isCarry = carry === 'carryover';
  const label = isCarry ? i18n.carryover : i18n.continuation;
  return <span style={isCarry ? ST.carryOver : ST.carryCont} title={label}>{label}</span>;
}

/* #polish — бейдж «в спринте»: задача уже в составе любого спринта планера (не тащить повторно). */
function InSprintBadge({ inSprint, i18n }) {
  if (!inSprint) return null;
  return <span style={ST.inSprint} title={i18n.inSprintHint || i18n.inSprint}>{i18n.inSprint}</span>;
}

function Flag({ priority }) {
  if (!priority) return null;
  return <span title={priority} style={{ color: 'var(--muted)' }}>⚑</span>;
}

/* §2/§10 слайс 5 — query-assist фильтр пула. Ring QueryAssist (vendored) + fallback-input.
   onApply (Enter / выбор подсказки / clear) → перезагрузка пула (vm.onFilterApply). */
function FilterField({ initial, placeholder, onAssist, onApply }) {
  const QA = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.QueryAssist;
  const [q, setQ] = React.useState(initial || '');
  if (!onApply) return null;
  if (QA && onAssist) {
    return (
      <QA huge glass clear placeholder={placeholder} query={q}
          dataSource={onAssist}
          onChange={(ch) => setQ((ch && ch.query) || '')}
          onApply={(ch) => onApply((ch && ch.query) || '')}
          onClear={() => { setQ(''); onApply(''); }} />
    );
  }
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <input type="text" className="ring-input" style={{ flex: 1, minWidth: 0 }}
             value={q} placeholder={placeholder} aria-label={placeholder}
             onChange={(e) => setQ(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter') onApply(q); }} />
      <button type="button" className="ring-button-button ring-button-block ring-button-heightS"
              aria-label={placeholder} title={placeholder} onClick={() => onApply(q)}>🔎</button>
    </div>
  );
}

/* §6.3 — чип нагрузки роли: спрос (/ ёмкость + мини-бар). Перелимит красным. */
function CapacityChip({ c, fmt }) {
  const hasCap = c.capacity != null;
  const pct = hasCap && c.capacity > 0 ? Math.min(100, Math.round((c.demand / c.capacity) * 100)) : 0;
  const barColor = c.over ? '#CC3645' : (pct >= 80 ? AMBER : '#1F8039');
  return (
    <span style={ST.chip}>
      {c.label}: <span style={c.over ? ST.chipOver : ST.chipNum}>{fmt(c.demand)}</span>
      {hasCap ? (
        <React.Fragment>
          <span style={{ color: 'var(--muted)' }}> / {fmt(c.capacity)}</span>
          <span style={ST.capBarWrap}><span style={{ ...ST.capBar, width: pct + '%', background: barColor }} /></span>
        </React.Fragment>
      ) : null}
    </span>
  );
}

function TaskRow({ t, roleContext, showState, ytBase, fmt, i18n, onToSprint }) {
  const rowStyle = t.needsPoker ? { background: 'rgba(229,109,23,.06)' } : undefined;
  return (
    <tr style={rowStyle}>
      <td style={ST.td}><Flag priority={t.priority} /></td>
      <td style={ST.td}>
        <a className="link" style={ST.link} href={ytBase + '/issue/' + t.idReadable} target="_blank" rel="noopener noreferrer">{t.idReadable}</a>
      </td>
      <td style={ST.td}>{t.system || '—'}</td>
      <td style={ST.td}>{t.summary}{t.isPaused ? <span style={ST.pause}>{i18n.paused}</span> : null}<CarryBadge carry={t.carry} i18n={i18n} /><InSprintBadge inSprint={t.inSprint} i18n={i18n} /></td>
      {showState ? <td style={ST.td}>{t.stateName || '—'}</td> : null}
      {roleContext ? (
        <td style={ST.td}>
          {t.needsPoker
            ? <span style={ST.poker} title={i18n.needsPoker}>{i18n.needsPoker}</span>
            : fmt(t.est)}
        </td>
      ) : null}
      <td style={ST.td}>
        {/* слайс 4 — раскладка «→ в спринт» (модалка выбора ролей). roleContext-роль = hint. */}
        <button type="button" className="ring-button-button ring-button-block ring-button-heightS" style={ST.toSprint}
                disabled={!onToSprint} title={i18n.toSprint}
                onClick={onToSprint ? () => onToSprint(t.issueId, t.roleKey) : undefined}>→ {i18n.toSprint}</button>
      </td>
    </tr>
  );
}

/* Таблица задач с пагинацией 25 (§10). visible — локальное состояние компонента;
   переживает ре-рендеры vm (React сохраняет state инстанса на той же позиции). */
function TaskTable({ tasks, roleContext, ytBase, fmt, i18n, pageSize, onToSprint }) {
  const [visible, setVisible] = React.useState(pageSize);
  /* слайс 5 — сброс пагинации при смене набора (фильтр перегрузил пул). Депенденси —
     длина (не идентичность): обычный ре-рендер vm-key bump сохраняет «показать ещё». */
  React.useEffect(() => { setVisible(pageSize); }, [tasks.length, pageSize]);
  if (!tasks.length) return <div style={ST.empty}>{i18n.empty}</div>;
  const shown = tasks.slice(0, visible);
  const rest = tasks.length - visible;
  return (
    <div>
      <table style={ST.table}>
        <thead>
          <tr>
            <th style={ST.th} />
            <th style={ST.th}>{i18n.colKey}</th>
            <th style={ST.th}>{i18n.colSystem}</th>
            <th style={ST.th}>{i18n.colSummary}</th>
            {roleContext ? <th style={ST.th}>{i18n.colEstimate}</th> : null}
            <th style={ST.th} />
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <TaskRow key={t.issueId + ':' + i} t={t} roleContext={roleContext} ytBase={ytBase} fmt={fmt} i18n={i18n} onToSprint={onToSprint} />
          ))}
        </tbody>
      </table>
      {rest > 0 ? (
        <button type="button" className="ring-button-button ring-button-block ring-button-heightS" style={ST.more} onClick={() => setVisible((v) => v + pageSize)}>
          {i18n.showMore} (+{Math.min(pageSize, rest)})
        </button>
      ) : null}
    </div>
  );
}

/* #3 — таблица задач РОЛЕВОГО спойлера: плоский список, колонка «Состояние», дефолт-сорт по
   состоянию + кликабельные заголовки ID/Приоритет/Состояние (sort локален таблице). roleContext
   всегда true (показываем роле-контекстную оценку/остаток). */
function RoleTaskTable({ tasks, ytBase, fmt, i18n, pageSize, onToSprint }) {
  const [sort, setSort] = React.useState({ key: 'state', dir: 'asc' });
  const [visible, setVisible] = React.useState(pageSize);
  React.useEffect(() => { setVisible(pageSize); }, [tasks.length, pageSize]);
  if (!tasks.length) return <div style={ST.empty}>{i18n.empty}</div>;
  const sorted = sortTasks(tasks, sort.key, sort.dir);
  const shown = sorted.slice(0, visible);
  const rest = sorted.length - visible;
  return (
    <div>
      <table style={ST.table}>
        <thead>
          <tr>
            <SortTh label="⚑" col="priority" sort={sort} setSort={setSort} />
            <SortTh label={i18n.colKey} col="id" sort={sort} setSort={setSort} />
            <th style={ST.th}>{i18n.colSystem}</th>
            <th style={ST.th}>{i18n.colSummary}</th>
            <SortTh label={i18n.colState} col="state" sort={sort} setSort={setSort} />
            <th style={ST.th}>{i18n.colEstimate}</th>
            <th style={ST.th} />
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <TaskRow key={t.issueId + ':' + i} t={t} roleContext showState ytBase={ytBase} fmt={fmt} i18n={i18n} onToSprint={onToSprint} />
          ))}
        </tbody>
      </table>
      {rest > 0 ? (
        <button type="button" className="ring-button-button ring-button-block ring-button-heightS" style={ST.more} onClick={() => setVisible((v) => v + pageSize)}>
          {i18n.showMore} (+{Math.min(pageSize, rest)})
        </button>
      ) : null}
    </div>
  );
}

/* Спойлер на НАТИВНОМ Ring Collapse (vendored). КОНТРАКТ Ring (исходник collapse-control):
   CollapseControl делает cloneElement(child, {onClick: setCollapsed, aria-*}) — поэтому child
   ОБЯЗАН быть React-ЭЛЕМЕНТОМ (button), не строкой (cloneElement('текст') → тип undefined → React #130).
   Function-child `(collapsed)=>…` даёт состояние для chevron. Collapse сам держит состояние
   (uncontrolled, defaultCollapsed) + вешает onClick/aria на наш button. Fallback на нативный
   <details>, если Ring не загружен (golden/деградация). */
function Spoiler({ title, count, defaultOpen, children }) {
  const V = globalThis.SSP_VENDORED || {};
  const Collapse = V.Collapse, Ctrl = V.CollapseControl, Content = V.CollapseContent;
  const head = title + (count != null ? ' (' + count + ')' : '');
  if (!Collapse || !Ctrl || !Content) {
    return (
      <details open={!!defaultOpen} style={ST.spoiler}>
        <summary style={ST.spoilerHead}>{head}</summary>
        <div style={ST.spoilerBody}>{children}</div>
      </details>
    );
  }
  return (
    <div style={ST.spoiler}>
      <Collapse defaultCollapsed={!defaultOpen}>
        <Ctrl>
          {(collapsed) => (
            <button type="button" style={ST.spoilerHead}>
              <span style={ST.chev}>{collapsed ? '▶' : '▼'}</span>
              <span>{head}</span>
            </button>
          )}
        </Ctrl>
        <Content>
          <div style={ST.spoilerBody}>{children}</div>
        </Content>
      </Collapse>
    </div>
  );
}


/* слайс 6 — вид «Дерево» (§5). Переключатель + контейнеры (нативный Ring Collapse) с
   бейджем Вида, агрегатом и зонами-точками + легенда; листья с зоной-точкой; сироты. */
const ZONE_PALETTE = ['#3369D6', '#1F8039', '#E56D17', '#9B59B6', '#16A2B8', '#CC3645', '#6C757D'];
function zoneLabel(name, i18n) { return name === '__pool' ? i18n.customerPool : (name === '__other' ? i18n.other : name); }

function ViewToggle({ mode, onMode, i18n }) {
  if (!onMode) return null;
  const btn = (m, label) => (
    <button type="button" onClick={() => onMode(m)} aria-pressed={mode === m}
            className={'ring-button-button ring-button-block ring-button-heightS' + (mode === m ? ' ring-button-active' : '')}
            style={ST.toggleBtn}>{label}</button>
  );
  return <div style={ST.toggle} role="group">{btn('zones', i18n.viewZones)}{btn('tree', i18n.viewTree)}</div>;
}

function TreeLeafTable({ tasks, colorOf, i18n, ytBase, onToSprint, pageSize }) {
  const [visible, setVisible] = React.useState(pageSize);
  React.useEffect(() => { setVisible(pageSize); }, [tasks.length, pageSize]);
  if (!tasks.length) return <div style={ST.empty}>{i18n.empty}</div>;
  const shown = tasks.slice(0, visible);
  const rest = tasks.length - visible;
  return (
    <div>
      <table style={ST.table}>
        <tbody>
          {shown.map((t, i) => (
            <tr key={t.issueId + ':' + i} style={t.isPaused ? undefined : undefined}>
              <td style={ST.td}><span style={{ ...ST.dot, background: colorOf[t.zone] || 'var(--muted)' }} title={zoneLabel(t.zone, i18n)} /></td>
              <td style={ST.td}><a className="link" style={ST.link} href={ytBase + '/issue/' + t.idReadable} target="_blank" rel="noopener noreferrer">{t.idReadable}</a></td>
              <td style={ST.td}>{t.summary}{t.isPaused ? <span style={ST.pause}>{i18n.paused}</span> : null}<CarryBadge carry={t.carry} i18n={i18n} /><InSprintBadge inSprint={t.inSprint} i18n={i18n} /></td>
              <td style={ST.td}>
                <button type="button" className="ring-button-button ring-button-block ring-button-heightS" style={ST.toSprint}
                        disabled={!onToSprint} title={i18n.toSprint}
                        onClick={onToSprint ? () => onToSprint(t.issueId) : undefined}>→ {i18n.toSprint}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 ? (
        <button type="button" className="ring-button-button ring-button-block ring-button-heightS" style={ST.more} onClick={() => setVisible((v) => v + pageSize)}>
          {i18n.showMore} (+{Math.min(pageSize, rest)})
        </button>
      ) : null}
    </div>
  );
}

function collectZones(node, add) {
  node.tasks.forEach((t) => add(t.zone));
  node.children.forEach((c) => collectZones(c, add));
}

/* §5 — рекурсивный узел дерева: контейнер (нативный Ring Collapse) → свои листья + вложенные
   дочерние контейнеры. Бейдж Вида + агрегат (count) в заголовке. key=issueId (уникален). */
function TreeNode({ node, lt }) {
  return (
    <Spoiler title={(node.kind ? node.kind + ' · ' : '') + node.summary} count={node.agg.count} defaultOpen>
      {node.tasks.length ? <TreeLeafTable tasks={node.tasks} {...lt} /> : null}
      {node.children.map((c) => <TreeNode key={c.issueId} node={c} lt={lt} />)}
    </Spoiler>
  );
}

function TreeBody({ tree, i18n, ytBase, onToSprint, pageSize }) {
  if (!tree) return null;
  const zoneOrder = [], seen = {};
  const add = (z) => { if (!seen[z]) { seen[z] = true; zoneOrder.push(z); } };
  tree.roots.forEach((r) => collectZones(r, add));
  tree.orphans.forEach((t) => add(t.zone));
  const colorOf = {}; zoneOrder.forEach((z, i) => { colorOf[z] = ZONE_PALETTE[i % ZONE_PALETTE.length]; });
  if (!tree.roots.length && !tree.orphans.length) return <div style={ST.empty}>{i18n.empty}</div>;
  const lt = { colorOf, i18n, ytBase, onToSprint, pageSize };
  return (
    <div>
      {zoneOrder.length ? (
        <div style={ST.legend}>
          {zoneOrder.map((z) => (
            <span key={z} style={ST.legendItem}><span style={{ ...ST.dot, background: colorOf[z] }} />{zoneLabel(z, i18n)}</span>
          ))}
        </div>
      ) : null}
      {tree.roots.map((r) => <TreeNode key={r.issueId} node={r} lt={lt} />)}
      {tree.orphans.length ? (
        <Spoiler key="__orphan" title={i18n.noParent} count={tree.orphans.length}>
          <TreeLeafTable tasks={tree.orphans} {...lt} />
        </Spoiler>
      ) : null}
    </div>
  );
}

function BacklogView({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);

  const vm = host.__sspBacklogVm;
  if (!vm) return null;
  const i18n = vm.i18n, fmt = vm.fmt, ytBase = vm.ytBase, ps = vm.pageSize;
  const tp = { ytBase, fmt, i18n, pageSize: ps, onToSprint: vm.onToSprint };
  const roleGroups = vm.roleGroups || [];
  const unassignedTasks = vm.unassignedTasks || [];
  const hasAny = vm.customerPool.length || vm.otherBucket.length || unassignedTasks.length
    || roleGroups.some((g) => g.tasks.length > 0);

  return (
    <div>
      {/* слайс 5 — шапка: заголовок · целевой спринт · query-assist фильтр (§7/§10) */}
      <div style={ST.header}>
        <div style={ST.headRow}>
          <span style={ST.title}>{vm.title}</span>
          {vm.targetSprintName
            ? <span style={ST.target}>{i18n.targetSprintLabel}: <b>{vm.targetSprintName}</b></span>
            : <span style={ST.targetNone}>{i18n.noTarget}</span>}
          <ViewToggle mode={vm.viewMode} onMode={vm.onViewMode} i18n={i18n} />
        </div>
        {vm.onFilterApply ? (
          <div style={ST.filterRow}>
            <FilterField initial={vm.userFilter} placeholder={i18n.filterPlaceholder} onAssist={vm.onAssist} onApply={vm.onFilterApply} />
          </div>
        ) : null}
      </div>

      {vm.capacityStrip.length ? (
        <div style={ST.strip}>
          {vm.capacityStrip.map((c) => (
            <CapacityChip key={c.roleKey} c={c} fmt={fmt} />
          ))}
        </div>
      ) : null}

      {/* §8 fail-loud: schema-level (незамапленные состояния бандла, в т.ч. с нулём задач —
          приоритет, перечисляем имена) → fallback на data-level (счётчик задач в «Прочих»). */}
      {vm.unmappedStates && vm.unmappedStates.length ? (
        <div style={ST.warn}>⚠ {i18n.unmappedSchema}: {vm.unmappedStates.join(', ')}</div>
      ) : (vm.counts && vm.counts.other > 0 ? (
        <div style={ST.warn}>⚠ {vm.counts.other} · {i18n.unmappedWarn}</div>
      ) : null)}

      {vm.viewMode === 'tree' ? (
        <TreeBody tree={vm.tree} i18n={i18n} ytBase={ytBase} onToSprint={vm.onToSprint} pageSize={ps} />
      ) : (
        <React.Fragment>
          {!hasAny ? <div style={ST.empty}>{i18n.empty}</div> : null}

          {vm.customerPool.length ? (
            <Spoiler key="__pool" title={i18n.customerPool} count={vm.customerPool.length} defaultOpen>
              <TaskTable tasks={vm.customerPool} roleContext={false} {...tp} />
            </Spoiler>
          ) : null}

          {/* #3 — спойлер = РОЛЬ; состояние — колонка строки (сортируемая таблица). */}
          {roleGroups.map((g) => (g.tasks.length ? (
            <Spoiler key={g.roleKey} title={g.label} count={g.tasks.length} defaultOpen>
              <RoleTaskTable tasks={g.tasks} {...tp} />
            </Spoiler>
          ) : null))}

          {unassignedTasks.length ? (
            <Spoiler key="__roleless" title="—" count={unassignedTasks.length}>
              <TaskTable tasks={unassignedTasks} roleContext={false} {...tp} />
            </Spoiler>
          ) : null}

          {vm.otherBucket.length ? (
            <Spoiler key="__other" title={i18n.other} count={vm.otherBucket.length}>
              <TaskTable tasks={vm.otherBucket} roleContext={false} {...tp} />
            </Spoiler>
          ) : null}
        </React.Fragment>
      )}
    </div>
  );
}

window.__SSP_BACKLOG_MOUNT = {
  mountAt(host, vm) {
    if (!host) return;
    host.__sspBacklogVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<BacklogBoundary host={host}><BacklogView host={host} /></BacklogBoundary>);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspBacklogVm; } catch (_) { /* noop */ }
  },
};
