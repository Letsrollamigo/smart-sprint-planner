/* v2.2.0 Phase 2 #32 — bespoke body-компоненты для openModal(body.kind:'component').
   Регистрируются в реестре modal-mount.jsx через __SSP_RING_MODAL.registerBody.
   Каждый компонент держит ВСЁ своё состояние (select/radio/textarea) и рисует
   собственный footer — SspModal остаётся статичным, ноль ре-рендеров.
   Импортируется в index.js ПОСЛЕ modal-mount.jsx (мост уже существует). */

import * as React from 'react';

const noop = () => {};

/* CSS-класс кнопки по variant (зеркалит _btnCls из modal-mount.jsx) */
function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightS';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  if (variant === 'danger')  return b + ' ring-button-danger';
  if (variant === 'flat')    return b + ' ring-button-ghost ring-button-flat';
  return b; /* secondary — default */
}

/* ── reassignForm — переназначение задачи в Ганте (нативный <select> ассайни роли) ── */
function ReassignForm(props) {
  const [login, setLogin] = React.useState(props.current || '');
  const onApply = props.onApply || noop;
  const onCancel = props.onCancel || noop;
  return (
    <React.Fragment>
      <p className="ssp-modal-body-text">
        {props.bodyText} <strong>{props.issueId}</strong>:
      </p>
      <select
        className="app-select ring-select-button"
        style={{ width: '100%', margin: '8px 0' }}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
      >
        {(props.options || []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('primary')} onClick={() => onApply(login)}>
          {props.applyText}
        </button>
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>
          {props.cancelText}
        </button>
      </div>
    </React.Fragment>
  );
}

/* ── confirmGoalForm — подтверждение результата спринта (Ring Radio outcome + Ring Input ретро) ──
   OK активна только при выбранном outcome. onConfirm({goalOutcome, goalRetroNote}) / onCancel(). */
function ConfirmGoalForm(props) {
  const Radio = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Radio;
  const Input = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Input;
  const [outcome, setOutcome] = React.useState(props.existingOutcome || '');
  const [note, setNote] = React.useState('');
  const onConfirm = props.onConfirm || noop;
  const onCancel = props.onCancel || noop;

  const confirm = () => {
    if (!outcome) return;
    const retro = (note || '').trim();
    onConfirm({ goalOutcome: outcome, goalRetroNote: retro || undefined });
  };

  return (
    <React.Fragment>
      {props.goalText
        ? (
          <div style={{ background: 'var(--surface-light,#f5f5f5)', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted,#888)', display: 'block', marginBottom: '4px' }}>{props.goalLabel}</span>
            <span style={{ fontWeight: 500 }}>{props.goalText}</span>
          </div>
        )
        : (
          <div style={{ background: 'var(--surface-light,#f5f5f5)', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: 'var(--muted,#888)' }}>
            {props.goalNotSetText}
          </div>
        )}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>{props.outcomeLabel}</label>
        {Radio && Radio.Item
          ? (
            <Radio value={outcome} onChange={(v) => setOutcome(v == null ? '' : String(v))}>
              {(props.options || []).map((o) => (
                <Radio.Item key={o.value} value={o.value}>{o.label}</Radio.Item>
              ))}
            </Radio>
          )
          : null}
      </div>
      <div style={{ marginBottom: '14px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>{props.retroLabel}</label>
        {Input
          ? (
            <Input
              multiline
              rows={3}
              maxLength={1000}
              value={note}
              placeholder={props.retroPlaceholder}
              onChange={(ev) => setNote(ev && ev.target ? ev.target.value : '')}
            />
          )
          : null}
      </div>
      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>
          {props.cancelText}
        </button>
        <button type="button" className={_btnCls('primary')} disabled={!outcome} onClick={confirm}>
          {props.confirmText}
        </button>
      </div>
    </React.Fragment>
  );
}

/* ── wcDiffView — read-only просмотр различий рабочей копии (added/removed/changed) ──
   Phase 3 #32. Контент диффа вычисляется в IIFE (diffItemsForUI) и передаётся как
   plain-props; компонент только рендерит секции + свой footer («Закрыть»). */
function WcDiffView(props) {
  const L = props.labels || {};
  const added = props.added || [];
  const removed = props.removed || [];
  const changed = props.changed || [];
  const empty = !added.length && !removed.length && !changed.length;
  const onClose = props.onClose || noop;
  return (
    <React.Fragment>
      <div className="wc-diff-body">
        {empty ? <p className="ssp-modal-body-text">{L.noChanges}</p> : null}
        {added.length ? (
          <div className="wc-diff-section wc-diff-section--added">
            <h4>{L.added + ' (' + added.length + ')'}</h4>
            {added.map((t, i) => <div key={i} className="wc-diff-item">{t}</div>)}
          </div>
        ) : null}
        {removed.length ? (
          <div className="wc-diff-section wc-diff-section--removed">
            <h4>{L.removed + ' (' + removed.length + ')'}</h4>
            {removed.map((t, i) => <div key={i} className="wc-diff-item">{t}</div>)}
          </div>
        ) : null}
        {changed.length ? (
          <div className="wc-diff-section wc-diff-section--changed">
            <h4>{L.changed + ' (' + changed.length + ')'}</h4>
            {changed.map((c, i) => (
              <div key={i} className="wc-diff-item">
                {c.title}
                {(c.fields || []).map((f, j) => (
                  <div key={j} className="wc-diff-item__field">{f.name + ': ' + f.from + ' → ' + f.to}</div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('primary')} onClick={() => onClose()}>
          {L.close}
        </button>
      </div>
    </React.Fragment>
  );
}

/* ── dynFieldForm — обновление поля задачи: нативный <select> (enum) ИЛИ Ring Input (период) ──
   Phase 3 #32. onApply(rawValue) — caller (IIFE) сам решает enum-value vs parsePeriod по mode.
   onCancel(). */
function DynFieldForm(props) {
  const Input = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Input;
  const isEnum = props.mode === 'enum';
  const [value, setValue] = React.useState(props.initialValue || '');
  const onApply = props.onApply || noop;
  const onCancel = props.onCancel || noop;
  return (
    <React.Fragment>
      {props.desc ? <p className="ssp-modal-body-text">{props.desc}</p> : null}
      {isEnum
        ? (
          <select
            className="dyn-modal-select"
            style={{ width: '100%', margin: '8px 0' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            {(props.options || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )
        : (Input
          ? (
            <div style={{ margin: '8px 0' }}>
              <Input
                value={value}
                placeholder={props.placeholder}
                onChange={(ev) => setValue(ev && ev.target ? ev.target.value : '')}
              />
            </div>
          )
          : (
            <input
              type="text"
              className="dyn-modal-select"
              style={{ width: '100%', margin: '8px 0' }}
              value={value}
              placeholder={props.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          ))}
      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>
          {props.cancelText}
        </button>
        <button type="button" className={_btnCls('primary')} onClick={() => onApply(value)}>
          {props.applyText}
        </button>
      </div>
    </React.Fragment>
  );
}

/* ── importHistForm — импорт истории спринтов (#27): info+warn-блоки, чекбоксы выбора
   спринтов (обычный React-стейт — НЕ Ring Table, чтобы избежать mousedown-проблемы B11/B12),
   Ring Radio режима skip/overwrite, 3 кнопки (Восстановить/Отмена/Импортировать). ──
   Phase 3 #32. onSubmit(selectedBaseIds, mode) / onReplace() / onCancel(). */
function ImportHistForm(props) {
  const Radio = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Radio;
  const groups = props.groups || [];
  const L = props.labels || {};
  const [selected, setSelected] = React.useState(() => {
    const s = {};
    groups.forEach((g) => { s[g.baseId] = true; });
    return s;
  });
  const [mode, setMode] = React.useState('skip');
  const onSubmit = props.onSubmit || noop;
  const onReplace = props.onReplace || noop;
  const onCancel = props.onCancel || noop;

  const selectedIds = groups.filter((g) => selected[g.baseId]).map((g) => g.baseId);
  const toggle = (id) => setSelected((prev) => {
    const next = Object.assign({}, prev);
    next[id] = !next[id];
    return next;
  });

  return (
    <React.Fragment>
      {((props.infoRows && props.infoRows.length) || props.anonText)
        ? (
          <div style={{ background: 'var(--surface-light,#f5f5f5)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
              {(props.infoRows || []).map((r, i) => (
                <React.Fragment key={i}>
                  <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                  <span>{r.bold ? <b>{r.value}</b> : r.value}</span>
                </React.Fragment>
              ))}
            </div>
            {props.anonText ? <div style={{ marginTop: '6px', color: 'var(--muted)', fontSize: '11px' }}>{props.anonText}</div> : null}
          </div>
        )
        : null}

      {(props.warnings || []).map((w, i) => (
        <div key={i} style={{ marginBottom: '6px', fontSize: '12px', color: w.color || 'var(--muted)' }}>{w.text}</div>
      ))}

      <div style={{ marginBottom: '10px' }}>
        {groups.map((g) => (
          <label key={g.baseId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!selected[g.baseId]} onChange={() => toggle(g.baseId)} />
            <span style={{ fontSize: '13px' }}>
              {g.name}
              {g.dateText ? <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{' (' + g.dateText + ')'}</span> : null}
              {g.collision ? <span style={{ fontSize: '10px', background: 'var(--warn,#fff3cd)', color: 'var(--warn-text,#b36800)', padding: '1px 5px', borderRadius: '3px', marginLeft: '6px', verticalAlign: 'middle' }}>{L.collisionBadge}</span> : null}
            </span>
          </label>
        ))}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>{L.modeLabel}</div>
        {Radio && Radio.Item
          ? (
            <Radio value={mode} onChange={(v) => setMode(v == null ? 'skip' : String(v))}>
              <Radio.Item value="skip">{L.modeSkip}</Radio.Item>
              <Radio.Item value="overwrite">{L.modeOverwrite}</Radio.Item>
            </Radio>
          )
          : null}
      </div>

      <div className="ssp-modal-footer" style={{ flexWrap: 'wrap' }}>
        <button type="button" className={_btnCls('danger')} style={{ marginRight: 'auto' }} title={L.replaceTitle} onClick={() => onReplace()}>
          {L.replaceText}
        </button>
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>
          {L.cancelText}
        </button>
        <button type="button" className={_btnCls('primary')} disabled={!selectedIds.length} onClick={() => onSubmit(selectedIds, mode)}>
          {L.submitText}
        </button>
      </div>
    </React.Fragment>
  );
}

/* ── pickPicker — подбор задач в спринт (Phase 4 #32, закрывает B10+B11) ──
   Bespoke React: поиск + результаты-таблица (простой <table>, НЕ Ring Table →
   нет mousedown-проблемы B12 и tri-state-рассинхрона B11) + пагинация + выбор.
   Чекбоксы = нативные <input> на обычном React-стейте (Set). Master select-all —
   DERIVED tri-state (all/none/some из размеров selected ∩ known), без dataset-моста/
   двойной делегации. Data-layer (поиск/load-all/добавление) — IIFE-колбэки в props
   (поиск НЕ переписан — #33 отдельно).
   onSearch(q,page)→Promise<{items:[{idReadable,isAdded,state,summary,priority}],hasMore}>
   onLoadAll(q)→Promise<{ids:[addable],capped}>  ·  onAdd(ids)  ·  onCancel(). */
function PickPicker(props) {
  const L = props.labels || {};
  const onSearch  = props.onSearch  || (() => Promise.resolve({ items: [], hasMore: false }));
  const onLoadAll = props.onLoadAll || (() => Promise.resolve({ ids: [], capped: false }));
  const onAdd     = props.onAdd     || noop;
  const onCancel  = props.onCancel  || noop;

  const [query, setQuery]       = React.useState('');
  const [committed, setCommitted] = React.useState(null); // запрос текущего набора результатов
  const [items, setItems]       = React.useState([]);
  const [page, setPage]         = React.useState(1);
  const [hasMore, setHasMore]   = React.useState(false);
  const [selected, setSelected] = React.useState(() => new Set());
  const [known, setKnown]       = React.useState(() => new Set()); // addable id'ы со всех загруженных страниц (для master)
  const [loading, setLoading]   = React.useState(false);
  const [allBusy, setAllBusy]   = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError]       = React.useState(null);

  const masterRef = React.useRef(null);

  /* tri-state master — derived, не отдельный source-of-truth */
  let selectedAddable = 0;
  selected.forEach((id) => { if (known.has(id)) selectedAddable++; });
  const addableCount = known.size;
  const masterChecked = addableCount > 0 && selectedAddable === addableCount;
  const masterIndeterminate = selectedAddable > 0 && selectedAddable < addableCount;

  React.useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = masterIndeterminate;
  }, [masterIndeterminate, masterChecked, items]);

  function runSearch(q, p, freshQuery) {
    setLoading(true); setError(null);
    onSearch(q, p).then((res) => {
      const its = (res && res.items) || [];
      setItems(its);
      setHasMore(!!(res && res.hasMore));
      setSearched(true);
      setLoading(false);
      setKnown((prev) => {
        const next = freshQuery ? new Set() : new Set(prev);
        its.forEach((it) => { if (!it.isAdded) next.add(it.idReadable); });
        return next;
      });
    }).catch((e) => {
      setLoading(false); setItems([]); setHasMore(false); setSearched(true);
      setError((L.errorPrefix || '') + (e && e.message ? e.message : String(e)));
    });
  }

  function doSearchClick() {
    const fresh = query !== committed;
    if (fresh) setSelected(new Set());
    setCommitted(query);
    setPage(1);
    runSearch(query, 1, fresh);
  }

  function goPage(delta) {
    const np = page + delta;
    if (np < 1) return;
    setPage(np);
    runSearch(committed, np, false);
  }

  function toggleRow(id, isAdded) {
    if (isAdded) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleMaster() {
    if (allBusy) return;
    if (masterChecked) {
      setSelected((prev) => { const next = new Set(prev); known.forEach((id) => next.delete(id)); return next; });
      return;
    }
    setAllBusy(true);
    onLoadAll(committed).then((res) => {
      const ids = (res && res.ids) || [];
      setKnown(new Set(ids));
      setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
      setAllBusy(false);
    }).catch(() => { setAllBusy(false); });
  }

  const thStyle = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border,#ddd)', position: 'sticky', top: 0, background: 'var(--surface,#fff)', fontSize: '12px', fontWeight: 600 };
  const tdStyle = { padding: '5px 8px', borderBottom: '1px solid var(--border-light,#eee)', verticalAlign: 'top' };

  let results;
  if (loading) {
    results = <div className="empty"><span className="spinner"></span> {L.searching}</div>;
  } else if (error) {
    results = <div className="empty" style={{ color: 'var(--error)' }}>{error}</div>;
  } else if (!searched) {
    results = <div className="empty">{L.emptyInitial}</div>;
  } else if (!items.length) {
    results = <div className="empty">{L.notFound}</div>;
  } else {
    results = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={Object.assign({ width: '32px' }, thStyle)}>
              <input ref={masterRef} type="checkbox" checked={masterChecked}
                     disabled={allBusy || !addableCount} onChange={toggleMaster} title={L.selectAllTitle} />
            </th>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>{L.thState}</th>
            <th style={thStyle}>{L.thTitle}</th>
            <th style={thStyle}>{L.thPriority}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.idReadable} style={it.isAdded ? { opacity: 0.55 } : undefined}>
              <td style={tdStyle}>
                <input type="checkbox"
                       checked={it.isAdded || selected.has(it.idReadable)}
                       disabled={it.isAdded}
                       onChange={() => toggleRow(it.idReadable, it.isAdded)}
                       title={it.isAdded ? L.alreadyInSprint : undefined} />
              </td>
              <td style={Object.assign({ color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }, tdStyle)}>{it.idReadable}</td>
              <td style={tdStyle}>{it.state}</td>
              <td style={tdStyle}>{it.summary}</td>
              <td style={tdStyle}>{it.priority || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div className="search-row" style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <input type="text" className="ring-input" style={{ flex: 1, minWidth: 0 }}
               value={query} placeholder={L.placeholder}
               onChange={(e) => setQuery(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') doSearchClick(); }} />
        <button type="button" className={_btnCls('primary')} style={{ flex: '0 0 auto', minWidth: '90px' }} onClick={doSearchClick}>
          {L.searchText}
        </button>
      </div>

      <div style={{ maxHeight: '48vh', overflow: 'auto' }}>
        {results}
      </div>

      {searched && !loading && !error && items.length ? (
        <div className="pagination" style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '10px' }}>
          <button type="button" className={_btnCls('secondary')} disabled={page <= 1} onClick={() => goPage(-1)}>‹</button>
          <span style={{ fontSize: '12px' }}>{L.pageOf + page}</span>
          <button type="button" className={_btnCls('secondary')} disabled={!hasMore} onClick={() => goPage(1)}>›</button>
        </div>
      ) : null}

      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>{L.closeText}</button>
        <button type="button" className={_btnCls('primary')} disabled={!selected.size} onClick={() => onAdd(Array.from(selected))}>
          {L.addText}
        </button>
      </div>
    </div>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('reassignForm', ReassignForm);
  window.__SSP_RING_MODAL.registerBody('confirmGoalForm', ConfirmGoalForm);
  window.__SSP_RING_MODAL.registerBody('wcDiffView', WcDiffView);
  window.__SSP_RING_MODAL.registerBody('dynFieldForm', DynFieldForm);
  window.__SSP_RING_MODAL.registerBody('importHistForm', ImportHistForm);
  window.__SSP_RING_MODAL.registerBody('pickPicker', PickPicker);
}
