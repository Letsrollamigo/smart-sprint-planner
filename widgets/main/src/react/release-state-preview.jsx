/* release-state-preview.jsx — #48 R2.3 body-компонент модалки «Смена состояний» (СТРОГО Ring UI).
   Регистрируется в реестре modal-mount.jsx (registerBody('releaseStatePreview')), открывается
   release-controller.openStatePreview. Макет design/mirror/release/state-preview.html:
   чекбокс-таблица «задача → текущее → целевое» (bespoke, как pickPicker), per-row Ring Select
   целевого состояния (US-R2-06), пометки-чипы рассинхрон/недостижимо (D-F), футер
   «Применить к отмеченным (N)». После применения модалка ЖИВА: применённые становятся
   «уже в целевом», упавшие остаются отмеченными для повтора + панель ошибок (US-R2-07). */

import * as React from 'react';
import { RingSelect } from './release-create.jsx';
import { RingIcon } from './settings-shared.jsx';

const noop = () => {};

function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightM';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  return b;
}

/* Пересчёт пометки при per-row смене целевого (US-R2-06): опции Select — только реальные
   состояния бандла, поэтому unreachable снимается; «уже в целевом» — от нового целевого;
   рассинхрон (origMark) сохраняется — он про ФАКТИЧЕСКОЕ текущее, не про целевое. */
function _remark(row, newTarget) {
  let mark;
  if (row.current && row.current === newTarget) mark = 'already';
  else if (row.origMark === 'desync') mark = 'desync';
  else mark = 'ok';
  return Object.assign({}, row, { target: newTarget, mark, disabled: false });
}

function _chip(mark, L) {
  const text = mark === 'desync' ? L.desync
    : mark === 'unreachable' ? L.unreachable
    : mark === 'already' ? L.already
    : mark === 'nohist' ? (L.noHistory || L.unreachable)         /* #57-3 откат: переходов не было */
    : mark === 'incomplete' ? (L.histIncomplete || L.unreachable) /* #57-3 откат: история обрезана (D7) */
    : L.willApply;
  const cls = (mark === 'nohist' || mark === 'incomplete') ? 'unreachable' : mark; /* стиль-группа реюзит unreachable */
  const icon = mark === 'desync' ? <RingIcon name="warning" /> : mark === 'ok' ? <RingIcon name="checkmark" /> : null;
  return <span className={'ssp-relpv-chip ssp-relpv-chip--' + cls}>{icon}{text}</span>;
}

/* Панель деталей ошибок последнего применения — Ring Collapse (канон CompositionSection). */
function ErrPanel({ errors, L }) {
  const V = globalThis.SSP_VENDORED || {};
  const Collapse = V.Collapse, Ctrl = V.CollapseControl, Content = V.CollapseContent;
  const [open, setOpen] = React.useState(true);
  if (!errors.length) return null;
  const head = (
    <span className="ssp-release-comp__toggle">
      <span className="ssp-release-comp__caret">{open ? '▾' : '▸'}</span>
      {(L.errDetails || '').replace('{n}', String(errors.length))}
    </span>
  );
  const body = (
    <table className="ssp-release-comp__table"><tbody>
      {errors.map((f) => (
        <tr key={f.id}>
          <td className="ssp-release-comp__id">{f.id}</td>
          <td className="ssp-release-comp__title">{f.error}</td>
          <td className="ssp-relpv-retry">{L.retry}</td>
        </tr>
      ))}
    </tbody></table>
  );
  if (!Collapse || !Ctrl || !Content) return <div className="ssp-relpv-errors">{head}{body}</div>;
  return (
    <div className="ssp-relpv-errors">
      <Collapse collapsed={!open} onChange={() => setOpen((o) => !o)}>
        <Ctrl>{head}</Ctrl>
        <Content>{body}</Content>
      </Collapse>
    </div>
  );
}

/* props: { labels:L, rows:[{id,title,current,target,mark,checked,disabled}],
            stateOptions:[name], onApply(list, done), onCancel } */
function ReleaseStatePreview(props) {
  const L = props.labels || {};
  const onApply = props.onApply || noop;
  const onCancel = props.onCancel || noop;
  const opts = (props.stateOptions || []).map((n) => ({ key: n, label: n }));

  const [rows, setRows] = React.useState(() => (props.rows || []).map((r) => Object.assign({ origMark: r.mark }, r)));
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const masterRef = React.useRef(null);

  const enabled = rows.filter((r) => !r.disabled);
  const checkedRows = enabled.filter((r) => r.checked);
  const masterChecked = enabled.length > 0 && checkedRows.length === enabled.length;
  const masterInd = checkedRows.length > 0 && checkedRows.length < enabled.length;
  React.useEffect(() => { if (masterRef.current) masterRef.current.indeterminate = masterInd; }, [masterInd, masterChecked]);

  const toggleRow = (id) => setRows((prev) => prev.map((r) => (r.id === id && !r.disabled ? Object.assign({}, r, { checked: !r.checked }) : r)));
  const toggleMaster = () => setRows((prev) => prev.map((r) => (r.disabled ? r : Object.assign({}, r, { checked: !masterChecked }))));
  const setTarget = (id, t) => setRows((prev) => prev.map((r) => (r.id === id ? _remark(r, t) : r)));
  /* #57-3 (⚖ владелец) — массовое назначение ОДНОГО статуса всем задачам сразу: мастер-селект
     в шапке колонки цели. Оживляет и помеченные строки (как ручной per-row выбор, US-R2-06);
     «уже в целевом» остаются снятыми. */
  const setAllTargets = (t) => setRows((prev) => prev.map((r) => {
    const nr = _remark(r, t);
    nr.checked = nr.mark !== 'already';
    return nr;
  }));

  const apply = () => {
    const list = checkedRows.map((r) => ({ id: r.id, target: r.target }));
    if (!list.length || busy) return;
    setBusy(true);
    onApply(list, (res) => {
      const appliedSet = new Set((res && res.applied) || []);
      /* применённые: факт = целевое → «уже в целевом», снимаются; упавшие остаются отмеченными */
      setRows((prev) => prev.map((r) => (appliedSet.has(r.id)
        ? Object.assign({}, r, { current: r.target, mark: 'already', origMark: 'ok', checked: false })
        : r)));
      setErrors((res && res.failed) || []);
      setBusy(false);
    });
  };

  return (
    <div style={{ width: '100%' }}>
      <p className="ssp-relpv-sub">{L.mappingLine}</p>
      <div className="ssp-relpv-scroll">
        <table className="ssp-relpv-table">
          <thead>
            <tr>
              <th style={{ width: '30px' }}>
                <input ref={masterRef} type="checkbox" checked={masterChecked} disabled={busy || !enabled.length} onChange={toggleMaster} />
              </th>
              <th>{L.colTask}</th>
              <th>{L.colCurrent}</th>
              <th style={{ width: '24px' }}></th>
              <th>
                {L.colTarget}
                {opts.length ? (
                  <div className="ssp-relpv-setall">
                    <RingSelect value={''} options={opts} onChange={setAllTargets} placeholder={L.setAll} />
                  </div>
                ) : null}
              </th>
              <th>{L.colMark}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.mark === 'desync' ? 'ssp-relpv-row--sync' : (r.mark === 'already' || r.mark === 'unreachable' || r.mark === 'nohist' || r.mark === 'incomplete') ? 'ssp-relpv-row--skip' : undefined}>
                <td><input type="checkbox" checked={r.checked} disabled={r.disabled || busy} onChange={() => toggleRow(r.id)} /></td>
                <td><span className="ssp-relpv-id">{r.id}</span> {r.title || ''}</td>
                <td>{r.current || '—'}{r.tsLabel ? <span style={{ color: 'var(--muted)', fontSize: '11px' }}> · {r.tsLabel}</span> : null}</td>
                <td className="ssp-relpv-arrow">→</td>
                <td className="ssp-relpv-target">
                  {opts.length
                    ? <RingSelect value={r.target} options={opts} onChange={(t) => setTarget(r.id, t)} />
                    : <b>{r.target}</b>}
                </td>
                <td>{_chip(r.mark, L)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrPanel errors={errors} L={L} />
      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>{L.cancel}</button>
        <button type="button" className={_btnCls('primary')} disabled={!checkedRows.length || busy} onClick={apply}>
          {(L.applyBtn || '').replace('{n}', String(checkedRows.length))}
        </button>
      </div>
    </div>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('releaseStatePreview', ReleaseStatePreview);
}

export { ReleaseStatePreview };
