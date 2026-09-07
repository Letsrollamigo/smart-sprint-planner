/* widgets/main/src/infra/read-gate.js — #110 (v3.37.0): единый шлюз чтений YouTrack.
   Leaf-модуль (infra): оборачивает host, который ядро получает от YTApp.register, и для
   GET-вызовов даёт (1) потолок параллелизма fetchYouTrack — не больше MAX_PARALLEL
   одновременно, остальные ждут в очереди в порядке вызова; (2) повтор транзиентных ошибок
   с растущей паузой — RETRY_DELAYS_MS, то есть три попытки. POST и прочие методы проходят
   как есть: запись не повторяется (могла дойти до сервера) и не встаёт в очередь чтений.
   Транзиентной считается ошибка, чей текст похож на 429/502/503/504, таймаут или обрыв
   сети; прикладные отказы (invalid_*, 403/404, дедлайн чтения 30 с) не повторяются.
   Публикует window.__SSP_READ_GATE (+ module.exports для юнит-теста). */
'use strict';

const MAX_PARALLEL = 6;
const RETRY_DELAYS_MS = [300, 900];
const TRANSIENT_RE = /\b(429|502|503|504)\b|timed? ?out|network|failed to fetch|econn|socket|temporar/i;

function isTransient(e) {
  if (e && e._readDeadlineExceeded) return false;
  var m = e && (e.message || e.error || e.reason);
  return TRANSIENT_RE.test(String(m || e || ''));
}

function isRead(opts) {
  return !opts || !opts.method || String(opts.method).toUpperCase() === 'GET';
}

/* Повтор транзиентных ошибок: delays.length повторов сверх первой попытки. */
function withRetry(call, opts) {
  var delays = (opts && opts.delaysMs) || RETRY_DELAYS_MS;
  var diag = opts && opts.diag, label = (opts && opts.label) || '';
  var attempt = 0;
  function run() {
    return Promise.resolve().then(call).catch(function (e) {
      if (attempt >= delays.length || !isTransient(e)) throw e;
      var wait = delays[attempt++];
      if (typeof diag === 'function') {
        try { diag('retry ' + attempt + '/' + delays.length + ' ' + label + ' in ' + wait + 'ms: ' + (e && e.message ? e.message : e), 'warn'); } catch (_) {}
      }
      return new Promise(function (r) { setTimeout(r, wait); }).then(run);
    });
  }
  return run();
}

/* Семафор: не больше max одновременных fn, остальные — в очередь по порядку. */
function makeGate(max) {
  var active = 0, queue = [];
  function pump() {
    while (active < max && queue.length) { active++; queue.shift()(); }
  }
  return function (fn) {
    return new Promise(function (resolve, reject) {
      queue.push(function () {
        Promise.resolve().then(fn).then(resolve, reject).then(function () { active--; pump(); });
      });
      pump();
    });
  };
}

/* host → обёртка с теми же методами; прочие свойства хоста доступны через прототип. */
function wrapHost(host, opts) {
  if (!host || typeof host !== 'object') return host;
  var gate = makeGate((opts && opts.maxParallel) || MAX_PARALLEL);
  var base = { delaysMs: opts && opts.delaysMs, diag: opts && opts.diag };
  var wrapped = Object.create(host);
  if (typeof host.fetchYouTrack === 'function') {
    wrapped.fetchYouTrack = function (path, o) {
      if (!isRead(o)) return host.fetchYouTrack(path, o);
      var ro = { delaysMs: base.delaysMs, diag: base.diag, label: 'yt ' + String(path).split('?')[0].slice(0, 40) };
      return gate(function () { return withRetry(function () { return host.fetchYouTrack(path, o); }, ro); });
    };
  }
  if (typeof host.fetchApp === 'function') {
    wrapped.fetchApp = function (path, o) {
      if (!isRead(o)) return host.fetchApp(path, o);
      var ro = { delaysMs: base.delaysMs, diag: base.diag, label: 'app ' + String(path).slice(0, 40) };
      return withRetry(function () { return host.fetchApp(path, o); }, ro);
    };
  }
  return wrapped;
}

const api = { wrapHost: wrapHost, withRetry: withRetry, makeGate: makeGate, isTransient: isTransient,
  MAX_PARALLEL: MAX_PARALLEL, RETRY_DELAYS_MS: RETRY_DELAYS_MS };

if (typeof window !== 'undefined') {
  try { window.__SSP_READ_GATE = api; } catch (_) { /* sandboxed write may throw */ }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
