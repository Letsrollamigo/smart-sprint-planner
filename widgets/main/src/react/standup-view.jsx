/* Тир D слайс 1, ступень 2 — React-презентация Stand-up.
   Логика (группировка секций по состояниям 68-7, канон-чтение PP, тексты/часы)
   остаётся в standup-view.js: он строит view-model и зовёт мост mountAt(host, vm).
   Компонент тупой — рендерит готовые строки, ноль обращений к стейту монолита.

   68-7 — бакеты done/inflight/notStarted заменены секциями по фактическим
   состояниям: заголовок секции = цветной чип состояния (цвета бандла YT из vm;
   нейтральный фолбэк на CSS-переменных) + счётчик. Строка получила список
   исполнителей (режим «Все роли» — исполнители всех ролей через запятую).

   Паритет с vanilla-рендером ступени 1:
   - те же inline-стили/id, что у статической зоны index.html;
   - data-i18n на статичных текстах (goal-label/goal-missing) сохранён —
     applyI18N монолита продолжает обновлять их при смене языка (заголовки секций —
     дин-текст без data-i18n, обновляются следующим рендером);
   - пустая секция — маркер «—»; видимость блоков — флагами vm (conditional render
     вместо display-toggle, поведенчески эквивалентно);
   - большие empty-states (standupNoSprint/standupEmptyRole) НЕ здесь — это статика
     index.html с per-element CTA-биндами, ею управляет standup-view.js как раньше.

   IIFE-мост: window.__SSP_STANDUP_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RingIcon } from './settings-shared.jsx';

const _mounted = new WeakMap();

const ST = {
  goalBanner: { padding: '10px 14px', marginBottom: '12px', fontSize: '13px', lineHeight: 1.5 },
  goalLabel: { fontSize: '11px', color: 'var(--muted,#888)', display: 'block', marginBottom: '2px' },
  goalText: { fontWeight: 500 },
  goalMissing: { fontSize: '11px', color: 'var(--muted,#888)', marginBottom: '10px', padding: '0 4px' },
  sections: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', alignItems: 'start' },
  sectionCard: { padding: '10px 12px' },
  /* Заголовок = кнопка спойлера (Ring Collapse вешает onClick/aria через cloneElement) */
  sectionHdr: { display: 'flex', alignItems: 'center', gap: '6px', width: '100%', fontWeight: 600, fontSize: '12px', margin: 0, padding: '0 0 6px', background: 'none', border: 'none', borderBottom: '1px solid var(--border,#e0e0e0)', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', fontFamily: 'inherit' },
  sectionHdrCollapsed: { borderBottom: 'none', paddingBottom: 0 },
  chev: { fontSize: '9px', color: 'var(--muted,#888)', flex: '0 0 auto' },
  sectionBody: { paddingTop: '2px' },
  chip: { display: 'inline-block', fontSize: '10px', fontWeight: 600, lineHeight: 1, padding: '3px 7px', borderRadius: '8px', whiteSpace: 'nowrap' },
  sectionCount: { color: 'var(--muted,#888)' },
  sectionRoles: { marginLeft: 'auto', fontSize: '10px', fontWeight: 400, color: 'var(--muted,#888)', textAlign: 'right' },
  sectionEmpty: { fontSize: '11px', color: 'var(--muted,#888)', textAlign: 'center', padding: '12px 0' },
  row: { padding: '5px 0', borderBottom: '1px solid var(--border,#e0e0e0)', fontSize: '12px' },
  rowHours: { color: 'var(--muted,#888)', fontSize: '11px', float: 'right' },
  rowId: { fontWeight: 600 },
  rowIdLink: { fontWeight: 600, color: 'var(--primary)' },
  rowTitle: { color: 'var(--text)' },
  rowAssignee: { fontSize: '11px', color: 'var(--muted,#888)', marginTop: '2px' },
};

/* Рамка — всегда: у YT-дефолтного стиля значения бандла background = '#fff'
   (смоук на YT 2025.3 — весь бандл проекта такой), и чип без рамки сливается с карточкой. */
function StateChip({ label, bg, fg }) {
  const style = {
    ...ST.chip,
    background: bg || 'var(--surface2,#eef2f5)',
    color: fg || 'var(--muted,#888)',
    border: '1px solid var(--border,#e0e0e0)',
  };
  return <span style={style}>{label}</span>;
}

function SectionRows({ rows }) {
  if (!rows.length) return <div style={ST.sectionEmpty}>—</div>;
  return rows.map((r) => {
    const sub = [];
    if (r.assignees && r.assignees.length) sub.push(r.assignees.map((a) => '@' + a).join(', '));
    if (r.stateLabel) sub.push(r.stateLabel);   /* «Прочие состояния» — подпись фактического состояния */
    return (
      <div key={r.issueId} style={ST.row}>
        {r.hours ? <span style={ST.rowHours}>{r.hours}</span> : null}
        {r.url
          ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={ST.rowIdLink}>{r.issueId}</a>
          : <span style={ST.rowId}>{r.issueId}</span>}
        {' '}
        <span title={r.title} style={ST.rowTitle}>{r.titleTrunc}</span>
        {sub.length ? <div style={ST.rowAssignee}>{sub.join(' · ')}</div> : null}
      </div>
    );
  });
}

/* Секция-спойлер на нативном Ring Collapse (паттерн Spoiler бэклога #21 с3):
   uncontrolled defaultCollapsed=true — стендап открывается компактным обзором
   «состояние (счётчик)» без бесконечной простыни; стейт сворачивания живёт в
   Ring Collapse и переживает ре-рендеры vm (ключи секций стабильны — id по
   имени состояния). КОНТРАКТ Ring: CollapseControl делает cloneElement(child,
   {onClick, aria-*}) — child обязан быть элементом (button); function-child
   даёт collapsed для chevron. Fallback — нативный <details> (golden/деградация). */
function StandupStateSection({ section }) {
  const V = globalThis.SSP_VENDORED || {};
  const Collapse = V.Collapse, Ctrl = V.CollapseControl, Content = V.CollapseContent;
  const rows = section.rows || [];
  const headInner = (collapsed) => (
    <React.Fragment>
      <span style={ST.chev}>{collapsed ? '▶' : '▼'}</span>
      <StateChip label={section.label} bg={section.chipBg} fg={section.chipFg} />
      <span style={ST.sectionCount}>({section.count})</span>
      {(section.roleLabels && section.roleLabels.length)
        ? <span style={ST.sectionRoles}>{section.roleLabels.join(', ')}</span>
        : null}
    </React.Fragment>
  );
  if (!Collapse || !Ctrl || !Content) {
    return (
      <div id={section.id} className="card" style={ST.sectionCard}>
        <details>
          <summary style={{ ...ST.sectionHdr, display: 'flex' }}>{headInner(false)}</summary>
          <div style={ST.sectionBody}><SectionRows rows={rows} /></div>
        </details>
      </div>
    );
  }
  return (
    <div id={section.id} className="card" style={ST.sectionCard}>
      <Collapse defaultCollapsed>
        <Ctrl>
          {(collapsed) => (
            <button type="button" style={collapsed ? { ...ST.sectionHdr, ...ST.sectionHdrCollapsed } : ST.sectionHdr}>
              {headInner(collapsed)}
            </button>
          )}
        </Ctrl>
        <Content>
          <div style={ST.sectionBody}><SectionRows rows={rows} /></div>
        </Content>
      </Collapse>
    </div>
  );
}

function StandupView({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);

  const vm = host.__sspStandupVm;
  if (!vm) return null;
  return (
    <React.Fragment>
      {vm.goalBannerVisible ? (
        <div id="standupGoalBanner" className="card" style={ST.goalBanner}>
          <span style={ST.goalLabel} data-i18n="standupGoalLabel"><RingIcon name="flag" />{vm.goalLabel}</span>
          <span id="standupGoalText" style={ST.goalText}>{vm.goalText}</span>
        </div>
      ) : null}
      {vm.goalMissingVisible ? (
        <div id="standupGoalMissingHint" style={ST.goalMissing} data-i18n="standupGoalMissing">{vm.goalMissingText}</div>
      ) : null}
      {vm.sectionsVisible ? (
        <div id="standupBuckets" style={ST.sections}>
          {(vm.sections || []).map((s) => <StandupStateSection key={s.id} section={s} />)}
        </div>
      ) : null}
    </React.Fragment>
  );
}

window.__SSP_STANDUP_MOUNT = {
  /* mountAt(host, vm): vm стэшится на host.__sspStandupVm (несериализуемо),
     ре-рендер форсится бампом data-vm-key (MutationObserver внутри компонента —
     паттерн table-mount). Идемпотентно: root создаётся один раз на host. */
  mountAt(host, vm) {
    if (!host) return;
    host.__sspStandupVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<StandupView host={host} />);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspStandupVm; } catch (_) { /* noop */ }
  },
};
