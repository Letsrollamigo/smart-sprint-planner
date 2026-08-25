/* settings-fields.jsx — секция настроек «Отображаемые поля» (68-8).

   Поле ДОБАВЛЯЕТСЯ ПИКЕРОМ из фактических полей проекта, минус занятые другими
   настройками (оценки/факты/исполнители ролей, приоритет, состояние, система, спринт,
   версия, тип, внешний ID) — одно и то же поле не должно оказаться и колонкой роли,
   и «просто колонкой». Три чекбокса строки = три таблицы задач, где колонка видна.

   Хранится только НАБОР (имена полей): значения не хранятся нигде и читаются на лету
   под правами самого пользователя. Список/нормализация — pure/display-fields-pure.js,
   здесь только рендер и правка строк.

   Строка без единого чекбокса в настройке не хранится (хранить нечего) — но с экрана
   не исчезает: переезжает в pending и видна, пока её не убрали корзиной. Паттерн —
   pendingRows матрицы прав (#71) и таблицы связей (#74). */

import * as React from 'react';
import { RoleCheck, RingIcon, RingSelLite } from './settings-shared.jsx';

const DF = () => globalThis.__SSP_DISPLAY_FIELDS_PURE;

/* Ring-класс кнопки-корзины — как в матрице прав (#71) и таблице связей (#74). */
const TRASH_BTN_CLS = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';

/* Колонки таблицы настройки = три таблицы задач приложения. */
const TABLE_DEFS = [
  { key: 'summary', col: 'dfColSummary', hint: 'hintDfColSummary' },
  { key: 'role',    col: 'dfColRole',    hint: 'hintDfColRole' },
  { key: 'my',      col: 'dfColMy',      hint: 'hintDfColMy' },
];

function _rowOf(rows, name) {
  return rows.find((r) => r && r.name === name) || null;
}

function _patch(rows, name, key) {
  const cur = _rowOf(rows, name) || { name, summary: false, role: false, my: false };
  const next = Object.assign({}, cur, { [key]: !cur[key] });
  if (!next.summary && !next.role && !next.my) return rows.filter((r) => r && r.name !== name);
  return _rowOf(rows, name) ? rows.map((r) => (r.name === name ? next : r)) : rows.concat([next]);
}

function DisplayFieldsTable(props) {
  const t = props.t;
  const PURE = DF();
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const fields = Array.isArray(props.fields) ? props.fields : [];
  const set = props.onChange;
  const settings = props.settings || {};

  /* Добавленные, но пока без единой галочки: в настройке их нет, на экране — есть. */
  const [pending, setPending] = React.useState([]);

  if (!PURE) return null;

  const known = {};
  fields.forEach((f) => { if (f && f.name) known[f.name] = f; });

  const shownNames = rows.map((r) => r.name).concat(pending.filter((n) => !_rowOf(rows, n)));
  const atCap = shownNames.length >= PURE.DF_MAX;

  const options = PURE.pickerOptions(fields, shownNames.map((n) => ({ name: n })), settings)
    .map((o) => ({ key: o.name, label: o.type ? (o.name + '  ·  ' + o.type) : o.name }));

  function addFromPicker(name) {
    if (!name || atCap) return;
    if (_rowOf(rows, name) || pending.indexOf(name) >= 0) return;
    setPending(pending.concat([name]));
  }

  function toggle(name, key) {
    const next = _patch(rows, name, key);
    /* Последняя галочка снята → строка ушла из настройки, но должна остаться на экране. */
    if (!_rowOf(next, name) && pending.indexOf(name) < 0) setPending(pending.concat([name]));
    set(next);
  }

  function removeRow(name) {
    setPending(pending.filter((n) => n !== name));
    set(rows.filter((r) => r && r.name !== name));
  }

  function renderEntry(name) {
    const row = _rowOf(rows, name);
    const fld = known[name];
    /* Имя сохранено, а в проекте поля больше нет (переименовали/удалили): галочки
       показываем как есть — менять нечего, колонка всё равно пустая; только убрать. */
    const gone = !fld;
    return (
      <tr key={name} className={'ssp-perm-row' + (gone ? ' ssp-link-row--gone' : '')}>
        <th scope="row" className="ssp-perm-name">
          <span className="ssp-perm-name-text">{name}</span>
          <span className="ssp-link-phrases">
            {gone ? <React.Fragment><RingIcon name="warning" />{t('dfFieldGone')}</React.Fragment> : (fld.type || '')}
          </span>
        </th>
        {TABLE_DEFS.map((def) => (
          <td key={def.key} className="ssp-perm-cell">
            {gone
              ? (row && row[def.key] ? t('linkRoleOn') : '—')
              : (
                <RoleCheck
                  on={!!(row && row[def.key])}
                  ariaLabel={name + ': ' + t(def.col)}
                  onToggle={() => toggle(name, def.key)}
                />
              )}
          </td>
        ))}
        <td className="ssp-perm-act">
          <button type="button" className={TRASH_BTN_CLS} title={t('dfRowRemove')} onClick={() => removeRow(name)}>
            <RingIcon name="trash" />
            <span className="ssp-sr-only">{t('dfRowRemove')}</span>
          </button>
        </td>
      </tr>
    );
  }

  return (
    <React.Fragment>
      <span className="hint ssp-perm-lead">{t('hintDisplayFields')}</span>

      <div className="ssp-perm-add">
        <RingSelLite options={options} value="" placeholder={t('dfAddPlaceholder')}
                     disabled={atCap} onChange={addFromPicker} />
        {!fields.length ? <span className="hint ssp-link-nofetch">{t('dfFieldsEmpty')}</span> : null}
        {atCap ? <span className="hint ssp-link-nofetch">{t('dfCapReached')}</span> : null}
      </div>

      <div className="ssp-perm-scroll">
        <table className="ssp-dta-table ssp-perm-table ssp-link-table">
          <thead>
            <tr>
              <th scope="col" className="ssp-perm-th-name">{t('dfColField')}</th>
              {TABLE_DEFS.map((def) => (
                <th key={def.key} scope="col" className="ssp-perm-th" title={t(def.hint)}>
                  <span>{t(def.col)}</span>
                  <span className="ssp-sr-only">{t(def.hint)}</span>
                </th>
              ))}
              <th className="ssp-perm-th-act"><span className="ssp-sr-only">{t('dfRowRemove')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shownNames.map(renderEntry)}
            {!shownNames.length ? (
              <tr><td colSpan={TABLE_DEFS.length + 2} className="ssp-perm-empty">{t('dfEmpty')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <span className="hint ssp-link-note">{t('hintDfNotStored')}</span>
    </React.Fragment>
  );
}

export { DisplayFieldsTable };
