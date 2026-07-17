/* settings-cascade.jsx — секция «CascadeSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, FieldSelect, RoleCheck, MultiSelect, TextField } from './settings-shared.jsx';

function CascadeSection(props) {
  const t = props.t;
  const v = props.value; // { agg, forbid, kindField, level2, level3, linkIn, linkOut, tag }
  const set = props.onChange;
  const enumFields = props.enumFields || [];
  const [bundle, setBundle] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    if (v.kindField && props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(v.kindField)).then((vals) => { if (alive && Array.isArray(vals)) setBundle(vals); }).catch(noop);
    } else { setBundle([]); }
    return () => { alive = false; };
  }, [v.kindField]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => set(Object.assign({}, v, p));
  const dangerous = v.agg && !v.forbid;
  const overlap = v.level2.some((x) => v.level3.indexOf(x) >= 0);
  /* Смена kind-field → значения из старого bundle невалидны, чистим level2/3. */
  function changeKind(fname) { patch({ kindField: fname, level2: [], level3: [] }); }

  return (
    <React.Fragment>
      <RoleCheck on={v.agg} label={t('lblCascadeEnabled')} hint={t('hintCascade')} onToggle={() => patch({ agg: !v.agg })} />
      <div style={{ marginTop: '12px' }}>
        <RoleCheck on={v.forbid} label={t('lblForbidContainer')} hint={t('hintForbidContainer')} onToggle={() => patch({ forbid: !v.forbid })} />
        {dangerous ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '6px' }}>{t('warnCascadeWithoutForbid')}</div> : null}
      </div>
      <div className="form-grid form-grid--2" style={{ marginTop: '14px' }}>
        <div className="field">
          <label>{t('lblCascadeKindField')}</label>
          <FieldSelect value={v.kindField || ''} onChange={changeKind} names={enumFields} placeholder={t('phNotSelected')} />
        </div>
      </div>
      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblCascadeLevel2')}</label>
        <MultiSelect options={bundle} selected={v.level2} placeholder={t('phNotSelected')} onChange={(vals) => patch({ level2: vals })} />
      </div>
      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblCascadeLevel3')}</label>
        <MultiSelect options={bundle} selected={v.level3} placeholder={t('phNotSelected')} onChange={(vals) => patch({ level3: vals })} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintCascadeLevel3Optional')}</div>
        {overlap ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '4px' }}>{t('warnCascadeLevelsOverlap')}</div> : null}
      </div>
      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblCascadeLinkInward')}</label>
          <TextField value={v.linkIn} onChange={(val) => patch({ linkIn: val })} placeholder={t('phCascadeLinkInward')} />
        </div>
        <div className="field">
          <label>{t('lblCascadeLinkOutward')}</label>
          <TextField value={v.linkOut} onChange={(val) => patch({ linkOut: val })} placeholder={t('phCascadeLinkOutward')} />
        </div>
      </div>
      <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>{t('hintCascadeLinks')}</div>
      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblCascadeManualEstTag')}</label>
          <TextField value={v.tag} onChange={(val) => patch({ tag: val })} />
        </div>
      </div>
      <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintCascadeManualEstTag')}</div>
    </React.Fragment>
  );
}

/* ── Секция: state rollup (parent ← min(children)) ── */
export { CascadeSection };
