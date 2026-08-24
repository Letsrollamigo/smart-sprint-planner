/* settings-links.jsx — секция настроек «Связи задач» (#74).

   Связи ДОБАВЛЯЮТСЯ ПИКЕРОМ, а не выбираются из отрисованного справочника: в пикере
   лежат ФРАЗЫ типов инстанса («подзадача для», «зависит от», …). Выбор фразы задаёт
   сразу и тип, и сторону — какой конец связи главный, — поэтому отдельного вопроса
   «кто родитель» в строке нет. Парная фраза подтягивается сама и показывается рядом,
   а добавленный тип уходит из пикера ОБЕИМИ фразами.

   Колонки-роли и список модулей-потребителей НЕ зашиты здесь: и то, и другое приходит
   из ROLE_DEFS в pure/link-roles-pure.js. Поэтому в строке видно, какой модуль эту
   настройку читает и включён ли он сейчас в проекте.

   Логика (резолвер, матчер, опции пикера) — в pure-модуле, покрыта юнитами
   tests/unit/link-roles.test.js. Здесь только рендер и правка строк. */

import * as React from 'react';
import { RoleCheck, RingIcon, RingSelLite } from './settings-shared.jsx';

const LR = () => globalThis.__SSP_LINK_ROLES_PURE;

/* Ring-класс кнопки-корзины — как в матрице прав (#71). */
const TRASH_BTN_CLS = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';

/* i18n-ключи подписей ролей и модулей. Единственное, что здесь «по имени» — сами ключи;
   набор ролей и состав потребителей приходит данными из ROLE_DEFS. */
const ROLE_I18N = {
  hier: { col: 'linkColHier', hint: 'hintLinkColHier' },
  dep:  { col: 'linkColDep',  hint: 'hintLinkColDep' },
  info: { col: 'linkColInfo', hint: 'hintLinkColInfo' },
};
const MODULE_I18N = {
  backlog: 'linkModBacklog',
  release: 'linkModRelease',
  cascade: 'linkModCascade',
  rollup:  'linkModRollup',
  gantt:   'linkModGantt',
};

function _rowOf(rows, name) {
  return rows.find((r) => r && r.type === name) || null;
}

/* Строка без единой роли в настройке не хранится (хранить нечего) — но с экрана не
   исчезает: она переезжает в pending и продолжает быть видимой, пока её не убрали
   корзиной. Паттерн — pendingRows матрицы прав #71. */
function _patch(rows, name, change) {
  const cur = _rowOf(rows, name) || { type: name, hier: null, dep: null, info: false };
  const next = Object.assign({}, cur, change);
  const empty = !next.hier && !next.dep && !next.info;
  if (empty) return rows.filter((r) => r && r.type !== name);
  return _rowOf(rows, name) ? rows.map((r) => (r.type === name ? next : r)) : rows.concat([next]);
}

function LinkRolesTable(props) {
  const t = props.t;
  const PURE = LR();
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const types = Array.isArray(props.types) ? props.types : [];
  const set = props.onChange;
  const settings = props.settings || {};

  /* Добавленные, но пока без роли: в настройке их нет, на экране — есть. Здесь же живёт
     выбранная в пикере сторона, пока роль не отмечена (в настройке сторона хранится
     внутри hier/dep). */
  const [pending, setPending] = React.useState([]);

  if (!PURE) return null;

  const byName = {};
  types.forEach((tp) => { byName[tp.name] = tp; });

  const options = PURE.pickerOptions(types, rows.concat(pending))
    .map((o) => ({
      key: o.key,
      label: o.directed ? (o.phrase + '  ·  ' + o.typeLabel) : (o.phrase + '  ·  ' + t('linkUndirected')),
    }));

  function addFromPicker(key) {
    if (!key) return;
    const opt = PURE.pickerOptions(types, rows.concat(pending)).find((o) => o.key === key);
    if (!opt) return;
    setPending(pending.concat([{ type: opt.type, side: opt.side }]));
  }

  /* Экранные строки: сохранённые (в порядке настройки) + добавленные пикером. */
  const shown = rows.map((r) => ({ type: r.type, side: PURE.rowSide(r), row: r, pending: false }))
    .concat(pending.filter((p) => !_rowOf(rows, p.type))
      .map((p) => ({ type: p.type, side: p.side, row: null, pending: true })));

  /* Первая строка с ролью «Иерархия» — её и только её читают каскад оценок и подтяжка
     состояния (через выводимую из неё пару фраз). Помечаем явно, чтобы порядок строк
     не был скрытой механикой. */
  const firstHier = (rows.find((r) => r && r.hier) || {}).type || null;

  function toggle(entry, roleKey) {
    const def = PURE.roleDef(roleKey);
    const on = entry.row && (def.kind === 'flag' ? !!entry.row[roleKey] : !!entry.row[roleKey]);
    const value = def.kind === 'flag' ? !on : (on ? null : (entry.side || 'source'));
    const next = _patch(rows, entry.type, { [roleKey]: value });
    /* Роль снята последней → строка ушла из настройки, но должна остаться на экране. */
    if (!_rowOf(next, entry.type) && !pending.some((p) => p.type === entry.type)) {
      setPending(pending.concat([{ type: entry.type, side: entry.side }]));
    }
    set(next);
  }

  function removeRow(entry) {
    setPending(pending.filter((p) => p.type !== entry.type));
    set(rows.filter((r) => r && r.type !== entry.type));
  }

  /* Бейджи «где используется»: объединение потребителей всех отмеченных ролей строки.
     Выключенный в проекте модуль показывается притушенным, а не прячется — иначе
     настройка выглядела бы бесполезной там, где модуль просто выключен. */
  function consumersOf(entry) {
    if (!entry.row) return [];
    const seen = {}, out = [];
    PURE.ROLE_DEFS.forEach((def) => {
      const on = def.kind === 'flag' ? !!entry.row[def.key] : !!entry.row[def.key];
      if (!on) return;
      PURE.roleConsumers(def.key, settings).forEach((c) => {
        if (c.firstOnly && entry.type !== firstHier) return;
        if (seen[c.id]) return;
        seen[c.id] = true;
        out.push(c);
      });
    });
    return out;
  }

  function renderEntry(entry) {
    const tp = byName[entry.type];
    if (!tp) return renderOrphan(entry);
    const ph = PURE.phrasesForSide(tp, entry.side);
    const cons = consumersOf(entry);
    return (
      <tr key={entry.type} className="ssp-perm-row">
        <th scope="row" className="ssp-perm-name">
          <span className="ssp-perm-name-text">{ph.chosen || tp.name}</span>
          <span className="ssp-link-phrases">
            {tp.localizedName || tp.name}
            {ph.pair ? ' · ' + t('linkReverse') + ': ' + ph.pair : ' · ' + t('linkUndirected')}
          </span>
        </th>
        {PURE.ROLE_DEFS.map((def) => {
          const blocked = def.needsDirected && !tp.directed;
          return (
            <td key={def.key} className="ssp-perm-cell">
              <RoleCheck
                on={!!(entry.row && entry.row[def.key])} disabled={blocked}
                ariaLabel={(ph.chosen || tp.name) + ': ' + t(ROLE_I18N[def.key].col)}
                onToggle={() => toggle(entry, def.key)}
              />
            </td>
          );
        })}
        <td className="ssp-link-where">
          {cons.length ? cons.map((c) => (
            <span key={c.id} className={'ssp-link-mod' + (c.enabled ? '' : ' ssp-link-mod--off')}
                  title={c.enabled ? undefined : t('linkModOff')}>
              {t(MODULE_I18N[c.id])}
              {c.firstOnly ? <span className="ssp-link-first" title={t('hintLinkFirstHier')}>★</span> : null}
            </span>
          )) : <span className="ssp-link-mod--none">{t('linkNoRole')}</span>}
        </td>
        <td className="ssp-perm-act">
          <button type="button" className={TRASH_BTN_CLS} title={t('linkRowRemove')} onClick={() => removeRow(entry)}>
            <RingIcon name="trash" />
            <span className="ssp-sr-only">{t('linkRowRemove')}</span>
          </button>
        </td>
      </tr>
    );
  }

  /* Тип, сохранённый в настройке, но исчезнувший из трекера: роли показываем как есть,
     менять нечего (фраз нет) — только убрать. */
  function renderOrphan(entry) {
    const r = entry.row;
    return (
      <tr key={'gone:' + entry.type} className="ssp-perm-row ssp-link-row--gone">
        <th scope="row" className="ssp-perm-name">
          <span className="ssp-perm-name-text">{entry.type}</span>
          <span className="ssp-link-phrases"><RingIcon name="warning" />{t('linkTypeGone')}</span>
        </th>
        {PURE.ROLE_DEFS.map((def) => (
          <td key={def.key} className="ssp-perm-cell">{r && r[def.key] ? t('linkRoleOn') : '—'}</td>
        ))}
        <td className="ssp-link-where"><span className="ssp-link-mod--none">—</span></td>
        <td className="ssp-perm-act">
          <button type="button" className={TRASH_BTN_CLS} title={t('linkRemoveGone')} onClick={() => removeRow(entry)}>
            <RingIcon name="trash" />
            <span className="ssp-sr-only">{t('linkRemoveGone')}</span>
          </button>
        </td>
      </tr>
    );
  }

  const colCount = PURE.ROLE_DEFS.length + 3;

  return (
    <React.Fragment>
      <span className="hint ssp-perm-lead">{t('hintLinkRoles')}</span>

      <div className="ssp-perm-add">
        <RingSelLite options={options} value="" placeholder={t('linkAddPlaceholder')} onChange={addFromPicker} />
        {!types.length ? <span className="hint ssp-link-nofetch">{t('linkTypesEmpty')}</span> : null}
      </div>

      <div className="ssp-perm-scroll">
        <table className="ssp-dta-table ssp-perm-table ssp-link-table">
          <thead>
            <tr>
              <th scope="col" className="ssp-perm-th-name">{t('linkColLink')}</th>
              {PURE.ROLE_DEFS.map((def) => (
                <th key={def.key} scope="col" className="ssp-perm-th" title={t(ROLE_I18N[def.key].hint)}>
                  <span>{t(ROLE_I18N[def.key].col)}</span>
                  <span className="ssp-sr-only">{t(ROLE_I18N[def.key].hint)}</span>
                </th>
              ))}
              <th scope="col" className="ssp-perm-th">{t('linkColWhere')}</th>
              <th className="ssp-perm-th-act"><span className="ssp-sr-only">{t('linkRowRemove')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(renderEntry)}
            {!shown.length ? (
              <tr><td colSpan={colCount} className="ssp-perm-empty">{t('linkEmptyDefaults')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {firstHier ? <span className="hint ssp-link-note">{t('hintLinkFirstHier')}</span> : null}
    </React.Fragment>
  );
}

export { LinkRolesTable };
