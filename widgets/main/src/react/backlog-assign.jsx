/* #21 слайс 4 — body-компонент модалки «Разложить в спринт» (C1 спеки).
   Регистрируется в реестре modal-mount.jsx (registerBody('backlogAssign', …)) и
   открывается монолитом через openModal({ body:{ kind:'component', name:'backlogAssign' }}).
   Держит ВСЁ своё состояние (Set выбранных ролей) и рисует собственный footer —
   SspModal статичен (update() застаблен). Импортируется в index.js после modal-mount.jsx.

   §11 C1: автопредложение ролей по маппингу зоны (preselected) + ручная правка чекбоксами
   активных ролей; у каждой роли — остаток (§6.3) или метка «нужна оценка» (§6.2).
   Чекбоксы — нативные (как pickPicker): надёжнее Ring Table в OOPIF-iframe. */

import * as React from 'react';

const noop = () => {};
const AMBER = '#E56D17'; /* warning-токен палитры зеркала (§15 спеки) */

function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightS';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  if (variant === 'flat')    return b + ' ring-button-ghost ring-button-flat';
  return b; /* secondary — default */
}

const ST = {
  head: { fontSize: '13px', marginBottom: '12px', lineHeight: 1.4 },
  sys: { color: 'var(--muted)', fontSize: '12px' },
  rolesLabel: { fontWeight: 600, fontSize: '12px', color: 'var(--text)', margin: '0 0 6px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  roleName: { flex: '1 1 auto', fontSize: '13px' },
  rem: { fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' },
  poker: { fontSize: '11px', padding: '0 6px', borderRadius: '8px', background: 'rgba(229,109,23,.12)', color: AMBER, border: '1px solid ' + AMBER, whiteSpace: 'nowrap' },
  empty: { color: 'var(--muted)', fontSize: '12px', padding: '8px 4px' },
};

/* props: { task:{idReadable,summary,system}, roles:[{key,label,rem,needsPoker,preselected}],
            fmt, labels:{rolesLabel,remainder,needsPoker,confirm,cancel}, onConfirm, onCancel } */
function BacklogAssign(props) {
  const task = props.task || {};
  const roles = props.roles || [];
  const fmt = props.fmt || ((v) => String(v));
  const L = props.labels || {};
  const onConfirm = props.onConfirm || noop;
  const onCancel = props.onCancel || noop;

  const [selected, setSelected] = React.useState(() => {
    const s = new Set();
    roles.forEach((r) => { if (r.preselected) s.add(r.key); });
    return s;
  });

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <React.Fragment>
      <div style={ST.head}>
        <strong>{task.idReadable}</strong> {task.summary}
        {task.system ? <span style={ST.sys}> · {task.system}</span> : null}
      </div>

      <div style={ST.rolesLabel}>{L.rolesLabel}</div>
      {roles.length ? roles.map((r) => (
        <label key={r.key} style={ST.row}>
          <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
          <span style={ST.roleName}>{r.label}</span>
          {r.needsPoker
            ? <span style={ST.poker} title={L.needsPoker}>{L.needsPoker}</span>
            : <span style={ST.rem}>{L.remainder}: {fmt(r.rem || 0)}</span>}
        </label>
      )) : <div style={ST.empty}>{L.noRoles}</div>}

      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>{L.cancel}</button>
        <button type="button" className={_btnCls('primary')} disabled={!selected.size} onClick={() => onConfirm(Array.from(selected))}>
          {L.confirm}
        </button>
      </div>
    </React.Fragment>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('backlogAssign', BacklogAssign);
}

export { BacklogAssign };
