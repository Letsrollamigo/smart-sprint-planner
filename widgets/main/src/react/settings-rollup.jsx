/* settings-rollup.jsx — секция «StateRollupSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { _btnCls, RoleCheck, MultiSelect, RingSelLite, RollupOrderList, RingIcon } from './settings-shared.jsx';

function StateRollupSection(props) {
  const t = props.t;
  const v = props.value; // { enabled, order, resolved, floor }
  const set = props.onChange;
  const bundle = props.bundleStates || [];
  const [bundleSel, setBundleSel] = React.useState([]);
  const [orderIdx, setOrderIdx] = React.useState(-1);

  const patch = (p) => set(Object.assign({}, v, p));
  const available = bundle.filter((s) => v.order.indexOf(s) < 0);
  const orderShort = v.order.length > 0 && v.order.length < 2;
  const noHierarchy = v.enabled && !props.cascadeHasHierarchy;

  function addToOrder() {
    const add = bundleSel.filter((s) => v.order.indexOf(s) < 0);
    if (!add.length) return;
    setBundleSel([]);
    patch({ order: v.order.concat(add) });
  }
  function move(dir) {
    if (orderIdx < 0) return;
    const j = orderIdx + dir;
    if (j < 0 || j >= v.order.length) return;
    const order = v.order.slice();
    const tmp = order[orderIdx]; order[orderIdx] = order[j]; order[j] = tmp;
    setOrderIdx(j);
    patch({ order: order });
  }
  function removeFromOrder() {
    if (orderIdx < 0 || orderIdx >= v.order.length) return;
    const order = v.order.slice();
    const removed = order.splice(orderIdx, 1)[0];
    setOrderIdx(-1);
    patch({ order: order, floor: (v.floor === removed ? '' : v.floor) });
  }

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('lblStateRollupEnabled')} hint={t('hintStateRollup')} onToggle={() => patch({ enabled: !v.enabled })} />
      {noHierarchy ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '6px' }}><RingIcon name="warning" />{t('hintStateRollupNoHierarchy')}</div> : null}

      {/* #69 R1 (строка 6) — подполя при выключенном rollup притушены, не скрыты. */}
      <div className={v.enabled ? '' : 'ssp-subfields--dim'}>
      <div className="field" style={{ marginTop: '14px' }}>
        <label>{t('lblStateRollupOrder')}</label>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('lblStateRollupBundle')}</label>
            <MultiSelect options={available} selected={bundleSel} placeholder={t('phNotSelected')} onChange={setBundleSel} size={6} />
            <button type="button" className={_btnCls('secondary')} style={{ marginTop: '4px' }} onClick={addToOrder}>{t('btnStateRollupAdd')}</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('lblStateRollupOrderList')}</label>
            <RollupOrderList items={v.order} selectedIdx={orderIdx} onSelect={(i) => setOrderIdx(i)} />
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
              <button type="button" className={_btnCls('secondary')} onClick={() => move(-1)}>{t('btnStateRollupUp')}</button>
              <button type="button" className={_btnCls('secondary')} onClick={() => move(1)}>{t('btnStateRollupDown')}</button>
              <button type="button" className={_btnCls('secondary')} onClick={removeFromOrder}>{t('btnStateRollupRemove')}</button>
            </div>
          </div>
        </div>
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupOrder')}</div>
        {orderShort ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '4px' }}><RingIcon name="warning" />{t('warnStateRollupOrderShort')}</div> : null}
      </div>

      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblStateRollupResolved')}</label>
        <MultiSelect options={bundle} selected={v.resolved} placeholder={t('phNotSelected')} onChange={(vals) => patch({ resolved: vals })} size={4} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupResolved')}</div>
      </div>

      {/* #69 R1 (строка 6) — disabled-селект «Стратегия» (единственное значение «min» и обещание
          «в будущих релизах») снят; ключ stateRollupStrategy остаётся reserved, форма пишет 'min'. */}
      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblStateRollupFloor')}</label>
          <RingSelLite
            options={v.order.map((s) => ({ key: s, label: s }))}
            value={v.floor || ''} clearable placeholder={t('optStateRollupFloorNone')}
            onChange={(val) => patch({ floor: val })}
          />
          <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupFloor')}</div>
        </div>
      </div>
      </div>
    </React.Fragment>
  );
}

export { StateRollupSection };
