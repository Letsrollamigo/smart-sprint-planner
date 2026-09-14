/* #122 — общее двух React-презентаций Ганта: режим «Роль» (react/gantt-view.jsx) и режим «Все роли»
   (react/gantt-all.jsx). Конверсия дат канона ↔ Date либы, бейдж состояния #20, значок внешних
   зависимостей #74, фейл-громко граница ошибок, ширины колонок масштаба, пост-рендерная покраска стрелок
   и легенда. Вынесено из gantt-view.jsx без изменения поведения режима «Роль» (оба jsx держатся ниже
   порога fat-count). Обычный ES-модуль без моста — импортируется обоими jsx.

   Семантика дат: канон ta = UTC-полночь ms, dateEnd = ИНКЛЮЗИВНЫЙ последний день. Либа рисует
   end-exclusive → отображаем [start, end+1д), при drop'е конвертируем назад (endToInclusiveMs). Конверсия
   ms↔Date через календарные компоненты (UTC при чтении канона, локальные при чтении Date либы) —
   корректно при любом знаке TZ. */

import * as React from 'react';
import { RingIcon } from './settings-shared.jsx';

export const DAY = 86400000;

/* ms (UTC-полночь, канон ta) → локальный Date того же календарного дня. */
export function msToLocalDay(ms) {
  const d = new Date(Math.ceil(ms / DAY - 0.5) * DAY);   /* #116 — ближайшая UTC-полночь: старые даты могли нести локальную полночь */
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/* Локальный Date → UTC-полночь ms того же календарного дня. */
export function localDayToMs(d) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
/* Конец бара либы (exclusive Date) → инклюзивный последний день (ms, канон хранения):
   ровно полночь → предыдущий день; иначе (drop внутри дня) — этот же день. */
export function endToInclusiveMs(end) {
  const floor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const last = (end.getTime() === floor.getTime()) ? new Date(floor.getTime() - DAY) : floor;
  return localDayToMs(last);
}

const EXT_BADGE_BASE = {
  display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px',
  padding: '0 6px', borderRadius: '8px', fontSize: '11px', whiteSpace: 'nowrap',
  border: '1px solid var(--border)',
};

export const ST = {
  legend: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', margin: '0 0 8px', fontSize: '11px', color: 'var(--muted)' },
  legendTitle: { fontWeight: 500 },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
  legendSwatch: { display: 'inline-block', width: '14px', height: '3px', borderRadius: '2px' },
  /* #122 Д1/Д5 — цепочка задачи серым пунктиром, конфликт — обводка тоном --warn */
  legendChain: { display: 'inline-block', width: '14px', height: 0, borderTop: '2px dashed var(--muted)' },
  legendConflict: { display: 'inline-block', width: '12px', height: '8px', borderRadius: '2px', border: '2px solid var(--warn)' },
  /* #74 ⚖6 — незакрытая внешняя зависимость предупреждает, закрытая спокойна. */
  extDepsWarn: Object.assign({}, EXT_BADGE_BASE, { color: 'var(--warn)', borderColor: 'var(--warn)' }),
  extDepsCalm: Object.assign({}, EXT_BADGE_BASE, { color: 'var(--muted)' }),
  listCell: {
    boxSizing: 'border-box', padding: '4px 8px', overflow: 'hidden',
    borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    background: 'var(--surface)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px',
  },
  listHeader: {
    boxSizing: 'border-box', padding: '6px 10px', fontWeight: 600, fontSize: '12px',
    background: 'var(--surface2)', border: '1px solid var(--border)', borderBottom: 'none',
    display: 'flex', alignItems: 'center',
  },
  taskLink: {
    fontWeight: 600, overflow: 'hidden', fontSize: '12px', flexShrink: 0,
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  taskAssignee: {
    fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', minWidth: 0,
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cellLine: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' },
  badgeSince: { color: 'var(--muted)', fontSize: '10px', flexShrink: 0 },
  badgePrev: { color: 'var(--muted)', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  pillDot: { display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0 },
};

/* Бейдж состояния (#20): пилюля в родных цветах stateColor + (на активном
   спринте) плейсхолдеры since/prev, которые заполняет _updateGanttHistDOM. */
export function GanttBadge({ row }) {
  const b = row.badge;
  if (!b) return null;
  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 5px',
    borderRadius: '10px', fontSize: '10px', lineHeight: 1.4,
    background: b.pillBg, color: b.pillFg,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
  };
  return (
    <React.Fragment>
      <span style={pill}>
        <span style={{ ...ST.pillDot, background: b.pillFg }} />
        {b.label}
      </span>
      {b.hist ? <span data-gantt-hist-since={row.issueId} style={ST.badgeSince} /> : null}
      {b.hist ? <span data-gantt-hist-prev={row.issueId} style={ST.badgePrev}>{b.loadingText}</span> : null}
    </React.Fragment>
  );
}

/* #74 фаза 2 ⚖5/⚖6 — значок внешних зависимостей: предшественник вне спринта бара не
   получает (даты чужих проектов не тянем), поэтому показывается счётчиком на строке.
   Тултип — «номер · состояние»; незакрытая внешняя задача красится предупреждающим
   тоном, закрытая — спокойным (это статус, поэтому здесь токены темы, а не палитра
   типов: цвет типа = идентичность связи, смешивать нельзя). */
export function ExtDepsBadge({ row, i18n }) {
  const ext = (row && row.extDeps) || [];
  if (!ext.length) return null;
  const open = ext.filter((e) => !e.resolved).length;
  const tip = (i18n && i18n.badge ? i18n.badge + ': ' : '')
    + ext.map((e) => e.id + ' · ' + (e.state || (i18n && i18n.unknown) || '')).join('\n');
  return (
    <span style={open ? ST.extDepsWarn : ST.extDepsCalm} title={tip}>
      <RingIcon name="share" />{ext.length}
    </span>
  );
}

export const ZOOM_COLUMN_W = { Day: 44, Week: 120, Month: 200 };

/* Фейл-громко (#20-v2): OOPIF прячет ошибки фрейма от top-консоли (память
   feedback_oopif_hidden_errors_harness) — падение либы/рендера показываем ТЕКСТОМ
   в самом пейне (видно и юзеру, и a11y-смоуку), не роняя остальной виджет. */
export class GanttErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: '12px', color: 'var(--error,#c22)', fontSize: '12px' }}>
          {'Gantt render error: ' + String((this.state.err && this.state.err.message) || this.state.err)}
        </div>
      );
    }
    return this.props.children;
  }
}

/* Покраска стрелок (#74 ⚖7; #122 — пунктир цепочки и --warn виновника конфликта). Либа красит все стрелки
   одним цветом на контейнере g.arrows, у самих g.arrow нет ни id, ни data-атрибута — сопоставление
   позиционное: plan — порядок рендера (LINK_ROLES_PURE.ganttArrowOrder), styles[i] — { stroke, dash, width }
   или null. Число узлов не совпало с расчётом — НИЧЕГО не красим: лучше один цвет по умолчанию, чем
   произвольно перепутанные. Прежняя покраска снимается (узлы стрелок либа переиспользует по ключу). */
export function paintArrows(host, plan, styles) {
  if (!host || !plan) return;
  const nodes = host.querySelectorAll('g.arrows > g.arrow');
  if (!nodes.length || plan.length !== nodes.length) return;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], st = styles[i];
    ['stroke', 'fill', 'stroke-width', 'stroke-dasharray'].forEach((a) => n.removeAttribute(a));
    n.style.stroke = ''; n.style.fill = '';
    if (!st) continue;
    /* var(--токен) в SVG-атрибуте не разбирается — токены темы идут через style */
    if (/^var\(/.test(st.stroke)) { n.style.stroke = st.stroke; n.style.fill = st.stroke; }
    else { n.setAttribute('stroke', st.stroke); n.setAttribute('fill', st.stroke); }
    if (st.width) n.setAttribute('stroke-width', String(st.width));
    if (st.dash) n.setAttribute('stroke-dasharray', st.dash);
  }
}

/* Легенда (⚖7): только фактически видимые обозначения, настроек нет. #122 — «цепочка задачи» и «конфликт
   сроков» (только когда есть на полотне); inline — без нижнего отступа, для строки масштаба «Все роли». */
export function GanttLegend({ vm, inline }) {
  const lg = vm && vm.linkLegend;
  const partial = !!(vm && vm.linksPartial);
  if (!lg || (!lg.types.length && !lg.external && !partial && !lg.chain && !lg.conflict)) return null;
  const i18n = vm.i18nExt || {};
  return (
    <div style={inline ? { ...ST.legend, margin: 0 } : ST.legend}>
      <span style={ST.legendTitle}>{i18n.legend}</span>
      {lg.types.map((t) => (
        <span key={t.name} style={ST.legendItem}>
          <span style={{ ...ST.legendSwatch, background: t.color || 'grey' }} />{t.name}
        </span>
      ))}
      {lg.chain ? (
        <span style={ST.legendItem}><span style={ST.legendChain} />{i18n.legendChain}</span>
      ) : null}
      {lg.external ? (
        <span style={ST.legendItem}><RingIcon name="share" />{i18n.legendExt}</span>
      ) : null}
      {lg.conflict ? (
        <span style={ST.legendItem}><span style={ST.legendConflict} />{i18n.legendConflict}</span>
      ) : null}
      {/* 68-8 ⚖6 — часть связей не доехала: раньше это молча выглядело как «связей нет». */}
      {partial ? (
        <span style={ST.legendItem} title={i18n.linksPartial}><RingIcon name="warning" />{i18n.linksPartial}</span>
      ) : null}
    </div>
  );
}
