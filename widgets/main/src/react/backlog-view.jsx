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
  roleHdr: { margin: '8px 0 2px', fontWeight: 600, fontSize: '12px', color: 'var(--text)' },
  pause: { display: 'inline-block', marginLeft: '6px', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' },
  poker: { display: 'inline-block', padding: '0 6px', borderRadius: '8px', fontSize: '11px', background: 'rgba(229,109,23,.12)', color: AMBER, border: '1px solid ' + AMBER, whiteSpace: 'nowrap' },
  more: { marginTop: '4px' },
  empty: { color: 'var(--muted)', padding: '16px 4px' },
  toSprint: { fontSize: '11px', whiteSpace: 'nowrap' },
};

function Flag({ priority }) {
  if (!priority) return null;
  return <span title={priority} style={{ color: 'var(--muted)' }}>⚑</span>;
}

function TaskRow({ t, roleContext, ytBase, fmt, i18n }) {
  const rowStyle = t.needsPoker ? { background: 'rgba(229,109,23,.06)' } : undefined;
  return (
    <tr style={rowStyle}>
      <td style={ST.td}><Flag priority={t.priority} /></td>
      <td style={ST.td}>
        <a className="link" style={ST.link} href={ytBase + '/issue/' + t.idReadable} target="_blank" rel="noopener noreferrer">{t.idReadable}</a>
      </td>
      <td style={ST.td}>{t.system || '—'}</td>
      <td style={ST.td}>{t.summary}{t.isPaused ? <span style={ST.pause}>{i18n.paused}</span> : null}</td>
      {roleContext ? (
        <td style={ST.td}>
          {t.needsPoker
            ? <span style={ST.poker} title={i18n.needsPoker}>{i18n.needsPoker}</span>
            : fmt(t.est)}
        </td>
      ) : null}
      <td style={ST.td}>
        {/* ponytail: плейсхолдер действия — модалка «→ в спринт» = слайс 6, пока disabled */}
        <button type="button" className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat" style={ST.toSprint} disabled title={i18n.toSprint}>→ {i18n.toSprint}</button>
      </td>
    </tr>
  );
}

/* Таблица задач с пагинацией 25 (§10). visible — локальное состояние компонента;
   переживает ре-рендеры vm (React сохраняет state инстанса на той же позиции). */
function TaskTable({ tasks, roleContext, ytBase, fmt, i18n, pageSize }) {
  const [visible, setVisible] = React.useState(pageSize);
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
            <TaskRow key={t.issueId + ':' + i} t={t} roleContext={roleContext} ytBase={ytBase} fmt={fmt} i18n={i18n} />
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

function zoneCount(z) {
  let n = z.unassigned.length;
  z.roles.forEach((r) => { n += r.tasks.length; });
  return n;
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
  const tp = { ytBase, fmt, i18n, pageSize: ps };
  const hasAny = vm.customerPool.length || vm.otherBucket.length || vm.zones.some((z) => zoneCount(z) > 0);

  return (
    <div>
      {vm.capacityStrip.length ? (
        <div style={ST.strip}>
          {vm.capacityStrip.map((c) => (
            <span key={c.roleKey} style={ST.chip}>{c.label}: <span style={ST.chipNum}>{fmt(c.demand)}</span></span>
          ))}
        </div>
      ) : null}

      {!hasAny ? <div style={ST.empty}>{i18n.empty}</div> : null}

      {vm.customerPool.length ? (
        <Spoiler key="__pool" title={i18n.customerPool} count={vm.customerPool.length} defaultOpen>
          <TaskTable tasks={vm.customerPool} roleContext={false} {...tp} />
        </Spoiler>
      ) : null}

      {vm.zones.map((z, zi) => (zoneCount(z) > 0 ? (
        <Spoiler key={z.stateName + ':' + zi} title={z.stateName} count={zoneCount(z)} defaultOpen>
          {z.multiRole
            ? z.roles.map((r) => (r.tasks.length ? (
                <div key={r.roleKey}>
                  <div style={ST.roleHdr}>{r.label}</div>
                  <TaskTable tasks={r.tasks} roleContext {...tp} />
                </div>
              ) : null))
            : (z.roles[0] ? <TaskTable tasks={z.roles[0].tasks} roleContext {...tp} /> : null)}
          {z.unassigned.length ? (
            <div>
              <div style={ST.roleHdr}>—</div>
              <TaskTable tasks={z.unassigned} roleContext={false} {...tp} />
            </div>
          ) : null}
        </Spoiler>
      ) : null))}

      {vm.otherBucket.length ? (
        <Spoiler key="__other" title={i18n.other} count={vm.otherBucket.length}>
          <TaskTable tasks={vm.otherBucket} roleContext={false} {...tp} />
        </Spoiler>
      ) : null}
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
