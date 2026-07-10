/* release-create.jsx — #48 R1.3 body-компонент модалки «Новый релиз» на СТРОГО Ring UI.
   Регистрируется в реестре modal-mount.jsx (registerBody('releaseCreate', …)), открывается
   монолитом через openModal({ body:{ kind:'component', name:'releaseCreate' }}). Держит своё
   состояние формы, рисует собственный footer (SspModal статичен). Импорт в index.js после
   modal-mount.jsx.

   🔴 Правило проекта (CLAUDE_SHARED §3 / feedback_react_ring_ui_mandatory): контролы —
   строго Ring vendored (`Input`/`Select`/`DatePicker`), нативка только как null-fallback для
   test-env без SSP_VENDORED (канон capacity-view.jsx). Layout под макет
   design/mirror/release/create-modal.html. Представители — union членов групп-кандидатов
   (грузит release-controller → props.managerOptions/engineerOptions). */

import * as React from 'react';
import { getCurrentSspLang, getDateFnsLocale } from './i18n-bridge.jsx';

const noop = () => {};

function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightM';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  return b; /* secondary — default */
}

function _z(n) { return n < 10 ? '0' + n : '' + n; }
function fmtYmd(d) { return d ? d.getFullYear() + '-' + _z(d.getMonth() + 1) + '-' + _z(d.getDate()) : ''; }

/* Ring Select-обёртка (канон RingSelect capacity-view.jsx): options=[{key,label}], значение по key.
   onSelect(item) → item.key. Native <select> — только fallback без Ring (test-env). */
function RingSelect({ value, options, onChange, placeholder, size }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const data = (options || []).map((o) => ({ key: String(o.key), label: o.label }));
  const selected = data.find((o) => o.key === String(value)) || null;
  if (!Select) {
    return (
      <select className="ssp-release-fld" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {selected ? null : <option value="">{placeholder || '—'}</option>}
        {data.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <Select data={data} selected={selected} size={size || 'FULL'}
            label={selected ? undefined : (placeholder || '—')}
            onSelect={(item) => onChange(item ? String(item.key) : '')} />
  );
}

/* Ring DatePicker-обёртка: date=Date|null, onChange(Date|null). Native input[type=date] — fallback. */
function RingDate({ value, onChange, translations, locale }) {
  const DatePicker = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.DatePicker;
  if (!DatePicker) {
    return (
      <input type="date" className="ssp-release-fld" value={fmtYmd(value)}
             onChange={(e) => onChange(e.target.value ? new Date(e.target.value + 'T00:00:00') : null)} />
    );
  }
  return (
    <div className="ssp-release-datewrap">
      <DatePicker date={value} locale={locale} translations={translations} clear={true} size="M"
                  onChange={(d) => onChange(d instanceof Date ? d : null)} />
    </div>
  );
}

/* props: { labels:L, managerOptions:[{value,label}], engineerOptions, defaultManager,
            noGroups:bool, loadError:bool, onCreate, onCancel,
            initial?:{name,kind,source,planDate:Date|null,freezeDate:Date|null,manager,engineer,patchNote,notes,taskUrl},
            submitLabel? } — R1.5a: initial+submitLabel переключают форму в режим редактирования. */
function ReleaseCreateForm(props) {
  const Input = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Input;
  const L = props.labels || {};
  const init = props.initial || {};
  const mgrOpts = (props.managerOptions || []).map((o) => ({ key: o.value, label: o.label }));
  const engOpts = (props.engineerOptions || []).map((o) => ({ key: o.value, label: o.label }));
  const onCreate = props.onCreate || noop;
  const onCancel = props.onCancel || noop;

  const [name, setName] = React.useState(init.name || '');
  const [planDate, setPlanDate] = React.useState(init.planDate instanceof Date ? init.planDate : null);
  const [freezeDate, setFreezeDate] = React.useState(init.freezeDate instanceof Date ? init.freezeDate : null);
  const [kind, setKind] = React.useState(init.kind || 'release');
  const [source, setSource] = React.useState(init.source || 'internal');
  const [manager, setManager] = React.useState(init.manager || props.defaultManager || '');
  const [engineer, setEngineer] = React.useState(init.engineer || '');
  const [patchNote, setPatchNote] = React.useState(init.patchNote || '');
  const [notes, setNotes] = React.useState(init.notes || '');
  const [taskUrl, setTaskUrl] = React.useState(init.taskUrl || '');   /* #polish — ссылка на внешнюю задачу релиза (опц.) */
  const [err, setErr] = React.useState('');

  const dpLocale = getDateFnsLocale(getCurrentSspLang());
  const dpTr = {
    setDate: L.selectDate, setDateTime: L.selectDate, setPeriod: L.selectDate,
    addFirstDate: L.selectDate, addSecondDate: L.selectDate, addTime: '', selectName: L.selectDate,
  };

  const inputVal = (ev) => (ev && ev.target ? ev.target.value : '');

  const submit = () => {
    if (!name.trim()) { setErr(L.valNameRequired); return; }
    if (planDate && freezeDate && freezeDate.getTime() > planDate.getTime()) { setErr(L.valFreezeAfterPlan); return; }
    setErr('');
    onCreate({
      name: name.trim(), planDate: fmtYmd(planDate), freezeDate: fmtYmd(freezeDate),
      kind: kind, source: source, manager: manager, engineer: engineer,
      patchNote: patchNote.trim(), notes: notes.trim(), taskUrl: taskUrl.trim(),
    });
  };

  const label = (txt, req) => (
    <label className={'ssp-release-lbl' + (req ? ' ssp-release-lbl--req' : '')}>{txt}</label>
  );
  const repField = (labelTxt, val, setVal, opts, hint, noGroups, loadError) => (
    <div className="ssp-release-col">
      {label(labelTxt)}
      {noGroups
        ? <span className="ssp-release-hint">{L.pickerNoGroups}</span>
        : loadError
          ? <span className="ssp-release-hint">{L.pickerLoadError}</span>
          : <RingSelect value={val} options={opts} onChange={setVal} placeholder={L.notSelected} />}
      {!noGroups && !loadError && hint ? <span className="ssp-release-hint">{hint}</span> : null}
    </div>
  );

  return (
    <div className="ssp-release-form">
      <div className="ssp-release-fld-row">
        {label(L.name, true)}
        {Input
          ? <Input value={name} maxLength={200} placeholder={L.name} onChange={(ev) => setName(inputVal(ev))} />
          : <input type="text" className="ssp-release-fld" value={name} maxLength={200} placeholder={L.name} onChange={(e) => setName(e.target.value)} />}
      </div>

      <div className="ssp-release-row2">
        <div className="ssp-release-col">
          {label(L.kind, true)}
          <RingSelect value={kind} onChange={setKind} options={[{ key: 'release', label: L.kindRelease }, { key: 'hotfix', label: L.kindHotfix }]} />
        </div>
        <div className="ssp-release-col">
          {label(L.source, true)}
          <RingSelect value={source} onChange={setSource} options={[{ key: 'internal', label: L.srcInternal }, { key: 'vendor', label: L.srcVendor }]} />
        </div>
      </div>

      <div className="ssp-release-row2">
        <div className="ssp-release-col">
          {label(L.planDate, true)}
          <RingDate value={planDate} onChange={setPlanDate} translations={dpTr} locale={dpLocale} />
        </div>
        <div className="ssp-release-col">
          {label(L.freezeDate)}
          <RingDate value={freezeDate} onChange={setFreezeDate} translations={dpTr} locale={dpLocale} />
          <span className="ssp-release-hint">{L.hintFreeze}</span>
        </div>
      </div>

      <div className="ssp-release-row2">
        {repField(L.manager, manager, setManager, mgrOpts, L.hintManager, props.managerNoGroups, props.managerLoadError)}
        {repField(L.engineer, engineer, setEngineer, engOpts, L.hintEngineer, props.engineerNoGroups, props.engineerLoadError)}
      </div>

      {/* #polish — опц. ссылка на задачу релиза во внешней системе (кликабельна на карточке) */}
      <div className="ssp-release-fld-row">
        {label(L.taskUrl)}
        {Input
          ? <Input value={taskUrl} maxLength={2000} placeholder="https://…" onChange={(ev) => setTaskUrl(inputVal(ev))} />
          : <input type="url" className="ssp-release-fld" value={taskUrl} maxLength={2000} placeholder="https://…" onChange={(e) => setTaskUrl(e.target.value)} />}
      </div>

      <div className="ssp-release-fld-row">
        {label(L.patchNote)}
        {Input
          ? <Input multiline rows={2} maxLength={20000} value={patchNote} onChange={(ev) => setPatchNote(inputVal(ev))} />
          : <textarea className="ssp-release-fld" rows={2} maxLength={20000} value={patchNote} onChange={(e) => setPatchNote(e.target.value)} />}
      </div>
      <div className="ssp-release-fld-row">
        {label(L.notes)}
        {Input
          ? <Input multiline rows={2} maxLength={20000} value={notes} onChange={(ev) => setNotes(inputVal(ev))} />
          : <textarea className="ssp-release-fld" rows={2} maxLength={20000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </div>

      {err ? <div className="ssp-release-err">{err}</div> : null}

      <div className="ssp-modal-footer">
        <button type="button" className={_btnCls('secondary')} onClick={() => onCancel()}>{L.cancel}</button>
        <button type="button" className={_btnCls('primary')} onClick={submit}>{props.submitLabel || L.create}</button>
      </div>
    </div>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('releaseCreate', ReleaseCreateForm);
}

export { ReleaseCreateForm, RingSelect };
