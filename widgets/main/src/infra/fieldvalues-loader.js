/* fieldvalues-loader.js — 68-8: эфемерная подгрузка значений «отображаемых полей».

   Значения НЕ хранятся (⚖2) — читаются из YouTrack на лету фронтом, то есть под
   правами самого пользователя: чего человеку не видно, того YouTrack и не отдаст.
   Нового серверного эндпоинта фича не заводит вовсе.

   Почему infra, а не domain: модуль зовут ТРИ вью (сводная, состав роли, «Моя роль»),
   а прямой вызов domain → domain запрещён гейтом B1; в ядро прокинуть тоже нельзя —
   бюджет core исчерпан. infra — leaf-слой, домены зовут его напрямую. `host` приходит
   аргументом, чтобы leaf не тянул domain/data (B2).

   Кэш — одно ПОКОЛЕНИЕ на связку «спринт + отпечаток состава колонок»: три таблицы
   спрашивают одни и те же задачи, поэтому значения лежат по id задачи, а не по таблице
   или роли (иначе одна и та же волна ушла бы трижды). Правка настроек меняет отпечаток →
   новое поколение → полный перезапрос. Кэш модуль-приватный и транзиентный: он обязан
   переживать перестройку тела сводной (спойлер перестраивается на каждый ре-рендер). */
'use strict';

var CHUNK = 100;                 /* канон батча — refresh-controller */
var CHUNK_TIMEOUT_MS = 20000;    /* fetchYouTrack не отменяем: зависший чанк иначе запирает loading навсегда */

/* Селектор ПЛОСКИЙ (глубокий разворот даёт квадратичный payload). `text` обязателен —
   без него текстовые поля приезжают пустышкой {$type:'TextFieldValue'} (спека §3).
   `$type` нужен ровно для различения «сырое число — дата или integer». */
var FIELDS = 'idReadable,customFields($type,name,projectCustomField(field(name)),'
  + 'value(name,localizedName,presentation,minutes,login,fullName,text,color(id,background,foreground)))';

/* Поколение: { key, byId:{issueId:{fieldName:{text,bg,fg}}}, done:{issueId:1},
   inflight:{issueId:1}, failed:{issueId:1}, loading:bool } */
var _gen = null;

function _DF() { return (typeof window !== 'undefined' && window.__SSP_DISPLAY_FIELDS_PURE) || null; }

function _reset(key) {
  _gen = { key: key, byId: {}, done: {}, inflight: {}, failed: {}, loading: false };
  return _gen;
}

function _ensure(key) {
  if (!_gen || _gen.key !== key) return _reset(key);
  return _gen;
}

/* Гонка с таймером: чанк, не ответивший вовремя, помечается провалившимся и
   освобождает inflight — иначе повторной попытки уже не будет никогда. */
function _withTimeout(p) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error('fieldvalues chunk timeout'));
    }, CHUNK_TIMEOUT_MS);
    p.then(function (v) {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(v);
    }, function (e) {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(e);
    });
  });
}

/* Значения задачи из уже загруженного поколения. null = «ещё не знаем» (грузится или
   не запрашивалось), {} = «загружено, значений нет». Различение нужно шапке колонки. */
function valuesFor(key, issueId) {
  if (!_gen || _gen.key !== key) return null;
  return _gen.done[issueId] ? (_gen.byId[issueId] || {}) : null;
}

/* Провалившиеся задачи текущего поколения — признак «значения не загрузились» (⚖6). */
function failedCount(key) {
  if (!_gen || _gen.key !== key) return 0;
  return Object.keys(_gen.failed).length;
}

function isLoading(key) {
  return !!(_gen && _gen.key === key && _gen.loading);
}

/* Сброс кэша — зовут три кнопки «Обновить из задачи» (через refresh-controller). */
function invalidate() { _gen = null; }

/* Раздача значений, приехавших ЧУЖИМ батчем: селектор «Обновить из задачи» и так везёт
   все customFields задачи (68-8 §5.6), второй раз спрашивать то же самое незачем. */
function seed(key, names, issues) {
  var DF = _DF();
  if (!DF || !key || !Array.isArray(names) || !names.length) return;
  var gen = _ensure(key);
  var lang = _lang();   /* язык берём тем же путём, что ensureLoaded: иначе засеянные даты форматировались бы чужой локалью */
  (issues || []).forEach(function (iss) {
    var iid = iss && iss.idReadable;
    if (!iid) return;
    gen.byId[iid] = DF.valuesOf(iss, names, lang);
    gen.done[iid] = 1;
    delete gen.failed[iid];
  });
}

/* Старт подгрузки. Идемпотентен: повторный вызов на том же поколении не создаёт новой
   волны (три таблицы стартуют одновременно — без inflight-дедупа получили бы тройную).
   onDone зовут ОДИН раз по завершении волны — вью перерисовывается вторым кадром. */
function ensureLoaded(host, key, ids, names, lang, onDone) {
  var DF = _DF();
  if (!DF || !host || !key || !Array.isArray(names) || !names.length) return;
  var gen = _ensure(key);
  var want = [];
  (ids || []).forEach(function (iid) {
    if (!iid || gen.done[iid] || gen.inflight[iid] || gen.failed[iid]) return;
    gen.inflight[iid] = 1;
    want.push(iid);
  });
  if (!want.length) return;

  gen.loading = true;
  var chunks = [];
  for (var i = 0; i < want.length; i += CHUNK) chunks.push(want.slice(i, i + CHUNK));

  function fetchChunk(chunk) {
    return _withTimeout(host.fetchYouTrack('issues', {
      query: { fields: FIELDS, query: 'issue id: ' + chunk.join(', '), $top: chunk.length },
    })).then(function (issues) {
      if (!_gen || _gen.key !== key) return;                 /* поколение сменилось — результат протух */
      (issues || []).forEach(function (iss) {
        if (!iss || !iss.idReadable) return;
        gen.byId[iss.idReadable] = DF.valuesOf(iss, names, lang);
      });
      chunk.forEach(function (iid) { delete gen.inflight[iid]; gen.done[iid] = 1; });
    }).catch(function () {
      /* Ошибку НЕ глотаем: id уходят в failed — это и признак в шапке, и защита от
         бесконечного цикла рендер↔фетч (onAfterRender дёргается на каждый коммит DOM). */
      if (!_gen || _gen.key !== key) return;
      chunk.forEach(function (iid) { delete gen.inflight[iid]; gen.failed[iid] = 1; });
    });
  }

  /* Последовательной цепочкой, а не Promise.all: при 1000 задач × 9 ролей первая волна
     иначе даёт лавину параллельных запросов (антипример — связи Ганта). */
  var p = Promise.resolve();
  chunks.forEach(function (chunk) { p = p.then(function () { return fetchChunk(chunk); }); });
  p.then(function () {
    if (!_gen || _gen.key !== key) return;
    gen.loading = false;
    if (typeof onDone === 'function') { try { onDone(); } catch (_) { /* рендер вызывающего */ } }
  });
}

/* ── сборка колонок: один вызов на вью ────────────────────────────────────────
   Вью получает готовый набор колонок, функцию ячейки и заголовок с признаком
   неполной загрузки. Здесь же живёт стартер: рендер зовёт prepare, prepare зовёт
   ensureLoaded — повторный проход дедупится по done/inflight/failed, цикла нет. */

function _esc(v) {
  var U = (typeof window !== 'undefined' && window.__SSP_UTIL_PURE) || null;
  return (U && typeof U.esc === 'function') ? U.esc(v) : String(v);
}
/* Язык — из моста i18n (прецедент — infra/diag-snapshot.js): контроллер пишет туда
   при смене языка селектором, поэтому вью язык прокидывать не обязаны. */
function _lang() {
  try { return (window.__SSP_I18N__ && window.__SSP_I18N__.getCurrentLang()) || null; } catch (_) { return null; }
}
function _iconHtml(name) {
  var f = (typeof window !== 'undefined') && window.__SSP_ICON_HTML;
  return (typeof f === 'function') ? f(name, 'ssp-icon--inline') : '';
}

/* opts: {host, sprintId, settings, table, ids, warnTitle, onDone}.
   Возвращает null, если колонок нет вовсе — вью тогда ничего не добавляет. */
function prepare(opts) {
  var DF = _DF();
  if (!DF || !opts) return null;
  var cols = DF.columnsFor((opts.settings || {}).displayFields, opts.table);
  if (!cols.length) return null;

  var names = DF.fieldNames((opts.settings || {}).displayFields);
  var key = (opts.sprintId || '') + ':' + DF.fingerprint((opts.settings || {}).displayFields);
  if (opts.host) ensureLoaded(opts.host, key, opts.ids, names, _lang(), opts.onDone);

  var partial = failedCount(key) > 0;

  return {
    cols: cols,
    partial: partial,
    /* Значение ячейки. Обычный тип уходит ПЛАИН-строкой (React-текст — экранирование
       по построению, голден escape-once); {__html} только у цветного чипа, и там esc
       обязателен: значение поля приезжает с сырым HTML (спека §3). */
    cell: function (issueId, fieldName) {
      var vals = valuesFor(key, issueId);
      if (!vals) return '';                       /* ещё грузится — пусто, не «—» */
      var v = vals[fieldName];
      if (!v || !v.text) return '—';
      if (!v.bg && !v.fg) return v.text;
      var style = 'style="' + (v.bg ? 'background:' + _esc(v.bg) + ';' : '')
        + (v.fg ? 'color:' + _esc(v.fg) + ';' : '') + '"';
      return { __html: '<span class="ssp-dynfield-chip" ' + style + '>' + _esc(v.text) + '</span>' };
    },
    /* Заголовок: имя поля как есть (⚖9). При неполной загрузке — с иконкой-признаком;
       повтор даёт существующая кнопка «Обновить из задачи» (она сбрасывает кэш). */
    headerOf: function (fieldName) {
      if (!partial) return null;
      return function () {
        return { __html: _iconHtml('warning') + '<span title="' + _esc(opts.warnTitle || '') + '">'
          + _esc(fieldName) + '</span>' };
      };
    },
  };
}

var api = {
  FIELDS: FIELDS,
  prepare: prepare,
  ensureLoaded: ensureLoaded,
  valuesFor: valuesFor,
  failedCount: failedCount,
  isLoading: isLoading,
  invalidate: invalidate,
  seed: seed,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_FIELDVALUES_LOADER = api; } catch (_) { /* sandboxed write may throw */ }
}

if (typeof module !== 'undefined' && module.exports) module.exports = api;
