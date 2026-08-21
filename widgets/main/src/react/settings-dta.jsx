/* settings-dta.jsx — секция «DtaSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { _btnCls, RoleCheck, RingSelLite } from './settings-shared.jsx';

function DtaSection(props) {
  const t = props.t;
  const v = props.value; // { enabled, warnings, rows:[{type,role}] }
  const set = props.onChange;
  const roleOpts = props.activeRoles || [];
  const uiLang = props.uiLang;

  const counts = {};
  v.rows.forEach((r) => { const tt = (r.type || '').trim(); if (tt) counts[tt] = (counts[tt] || 0) + 1; });

  const patch = (p) => set(Object.assign({}, v, p));
  function setRow(i, p) { patch({ rows: v.rows.map((r, idx) => (idx === i ? Object.assign({}, r, p) : r)) }); }
  function addRow() { patch({ rows: v.rows.concat([{ type: '', role: '' }]) }); }
  function delRow(i) { const rows = v.rows.slice(); rows.splice(i, 1); patch({ rows: rows }); }

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('lblDtaEnabled')} hint={t('hintDta')} onToggle={() => patch({ enabled: !v.enabled })} />
      {/* #69 R1 (строка 6) — подполя при выключенном мастере притушены, НЕ скрыты («настроить,
          потом включить»); уведомления визуально вложены под агрегацию: без неё не работают. */}
      <div className={v.enabled ? '' : 'ssp-subfields--dim'}>
      <div style={{ marginTop: '12px', marginLeft: '24px' }}>
        <RoleCheck on={v.warnings} label={t('lblDtaWarnings')} hint={t('hintDtaWarnings')} onToggle={() => patch({ warnings: !v.warnings })} />
      </div>
      <table className="ssp-dta-table" style={{ marginTop: '14px', width: '100%', borderCollapse: 'collapse' }}>
        {/* #43 W4 (G-1) — scope=col связывает ячейки с заголовками для SR */}
        <thead>
          <tr>
            <th scope="col">{t('dtaColType')}</th>
            <th scope="col">{t('dtaColRole')}</th>
            <th scope="col" style={{ width: '34px' }} aria-label={t('btnDtaRemoveRow')}></th>
          </tr>
        </thead>
        <tbody>
          {!v.rows.length ? (
            <tr><td colSpan={3} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('dtaEmptyTable')}</td></tr>
          ) : v.rows.map((r, i) => {
            const tt = (r.type || '').trim();
            const dup = tt && counts[tt] > 1;
            return (
              <tr key={i}>
                <td>
                  {/* #43 W4 (G-3) — дубль типа: aria-invalid + связь с текстом ошибки */}
                  <input
                    type="text" className="app-select" maxLength={200}
                    value={r.type || ''} placeholder={t('dtaTypePlaceholder')}
                    style={dup ? { borderColor: 'var(--error)' } : undefined}
                    aria-invalid={dup ? 'true' : undefined}
                    aria-describedby={dup ? 'sspDtaDupErr' : undefined}
                    onChange={(e) => setRow(i, { type: e.target.value })}
                  />
                </td>
                <td>
                  <RingSelLite
                    options={roleOpts.map((ro) => ({ key: ro.key, label: t('role.' + ro.key) }))}
                    value={r.role || ''} clearable placeholder={t('phNotSelected')}
                    onChange={(val) => setRow(i, { role: val })}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly"
                    title={t('btnDtaRemoveRow')} onClick={() => delRow(i)}
                  >×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addRow}>{t('btnDtaAddRow')}</button>
      {props.hasDup ? <div id="sspDtaDupErr" role="alert" className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('dtaErrDuplicate')}</div> : null}
      </div>
    </React.Fragment>
  );
}

export { DtaSection };
