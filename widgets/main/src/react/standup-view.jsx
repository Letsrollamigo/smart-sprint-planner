/* Тир D слайс 1, ступень 2 — React-презентация Stand-up.
   Логика (классификация бакетов, канон-чтение PP, тексты/часы) остаётся в
   standup-view.js: он строит view-model и зовёт мост mountAt(host, vm).
   Компонент тупой — рендерит готовые строки, ноль обращений к стейту монолита.

   Паритет с vanilla-рендером ступени 1:
   - те же inline-стили/id, что у статической зоны index.html и _renderStandupBucket;
   - data-i18n на статичных текстах (goal-label/goal-missing/done-hint) сохранён —
     applyI18N монолита продолжает обновлять их при смене языка (заголовки бакетов,
     как и раньше, дин-текст без data-i18n — обновляются следующим рендером);
   - пустой бакет — маркер «—»; видимость блоков — флагами vm (conditional render
     вместо display-toggle, поведенчески эквивалентно);
   - большие empty-states (standupNoSprint/standupEmptyRole) НЕ здесь — это статика
     index.html с per-element CTA-биндами, ею управляет standup-view.js как раньше.

   IIFE-мост: window.__SSP_STANDUP_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

const ST = {
  goalBanner: { padding: '10px 14px', marginBottom: '12px', fontSize: '13px', lineHeight: 1.5 },
  goalLabel: { fontSize: '11px', color: 'var(--muted,#888)', display: 'block', marginBottom: '2px' },
  goalText: { fontWeight: 500 },
  goalMissing: { fontSize: '11px', color: 'var(--muted,#888)', marginBottom: '10px', padding: '0 4px' },
  buckets: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', alignItems: 'start' },
  bucketCard: { padding: '10px 12px' },
  bucketHdr: { fontWeight: 600, fontSize: '12px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border,#e0e0e0)' },
  bucketEmpty: { fontSize: '11px', color: 'var(--muted,#888)', textAlign: 'center', padding: '12px 0' },
  row: { padding: '5px 0', borderBottom: '1px solid var(--border,#e0e0e0)', fontSize: '12px' },
  rowHours: { color: 'var(--muted,#888)', fontSize: '11px', float: 'right' },
  rowId: { fontWeight: 600 },
  rowIdLink: { fontWeight: 600, color: 'var(--primary)' },
  rowTitle: { color: 'var(--text)' },
  rowAssignee: { fontSize: '11px', color: 'var(--muted,#888)', marginTop: '2px' },
  noDoneHint: { fontSize: '11px', color: 'var(--muted,#888)', marginTop: '8px', padding: '0 4px' },
};

function StandupBucket({ bucket }) {
  const rows = bucket.rows || [];
  return (
    <div id={bucket.id} className="card" style={ST.bucketCard}>
      <div style={ST.bucketHdr}>{bucket.header}</div>
      {rows.length === 0 ? (
        <div style={ST.bucketEmpty}>—</div>
      ) : (
        rows.map((r) => (
          <div key={r.issueId} style={ST.row}>
            {r.hours ? <span style={ST.rowHours}>{r.hours}</span> : null}
            {r.url
              ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={ST.rowIdLink}>{r.issueId}</a>
              : <span style={ST.rowId}>{r.issueId}</span>}
            {' '}
            <span title={r.title} style={ST.rowTitle}>{r.titleTrunc}</span>
            {r.assignee ? <div style={ST.rowAssignee}>@{r.assignee}</div> : null}
          </div>
        ))
      )}
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
          <span style={ST.goalLabel} data-i18n="standupGoalLabel">{vm.goalLabel}</span>
          <span id="standupGoalText" style={ST.goalText}>{vm.goalText}</span>
        </div>
      ) : null}
      {vm.goalMissingVisible ? (
        <div id="standupGoalMissingHint" style={ST.goalMissing} data-i18n="standupGoalMissing">{vm.goalMissingText}</div>
      ) : null}
      {vm.bucketsVisible ? (
        <div id="standupBuckets" style={ST.buckets}>
          {(vm.buckets || []).map((b) => <StandupBucket key={b.id} bucket={b} />)}
        </div>
      ) : null}
      {vm.noDoneHintVisible ? (
        <div id="standupNoDoneStatesHint" style={ST.noDoneHint} data-i18n="standupNoDoneStatesHint">{vm.noDoneHintText}</div>
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
