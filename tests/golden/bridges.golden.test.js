/**
 * Golden-master: мосты монолита — тост-обвязка (Ring alertService + legacy DOM
 * fallback) и кастомный локализованный датапикер D127 (поп-ап для
 * input[data-ssp-datepicker]).
 *
 * Контракты сняты ДО выноса (Фаза 5 слайс E3) и идут ТОЛЬКО через выживающие
 * entry-points: глобальный toast(msg, type) / window.__SSP_TOAST и реальные
 * DOM-события (датапикер живёт на document-level capture-листенерах).
 *
 * Path A тостов (toast-stack в parent/top document) в jsdom недостижим —
 * window.top === window → _ensureParentToastHost() всегда null; на проде YT
 * cross-origin блокирует его же. Контракт не характеризуется (как и React-
 * сторона мостов).
 *
 * Детерминизм: requestAnimationFrame подменяется синхронным per-host —
 * settle-проходы _repositionToastSoon/_enqueueToast (toast--in, aria-live)
 * выполняются до ассертов; Date заморожен хостом (FIXED_NOW = 2026-06-01).
 */
'use strict';

const test = require('node:test');
const { createHost } = require('./monolith-host');
const { checkHtmlSnapshot, checkJsonSnapshot } = require('./snap');

/** Хост с синхронным rAF (читается мостами в момент вызова — late-bound). */
function bridgeHost() {
  const h = createHost();
  h.window.requestAnimationFrame = function (cb) { cb(0); return 0; };
  return h;
}

/** Recording-стаб Ring alertService на window.SSP_VENDORED (в хосте его нет —
 *  дефолт = legacy DOM fallback; Ring-путь включается этим стабом). */
function installRingStub(window) {
  const log = { addAlert: [], remove: [] };
  let seq = 0;
  window.SSP_VENDORED = {
    alertService: {
      addAlert: function (text, type, timeout, opts) {
        const key = 'k' + (++seq);
        log.addAlert.push({
          key: key, text: text, type: type, timeout: timeout,
          hasOnClose: !!(opts && typeof opts.onClose === 'function'),
        });
        return key;
      },
      remove: function (key) { log.remove.push(key); },
    },
  };
  return log;
}

/** Recording-стаб diag (function-binding closure перезаписывается через gm.set,
 *  late-binding deps подхватывают — паттерн recording-тоста слайса 1). */
function recordDiag(gm) {
  const entries = [];
  gm.set({ diag: function (msg, level) { entries.push({ msg: msg, level: level || null }); } });
  return entries;
}

/* ═══════════════════ Тост-мост (Ring alertService) ═══════════════════ */

test('golden: toast Ring — маппинг типов, длительности, нормализация текста', () => {
  const { window, gm } = bridgeHost();
  const ring = installRingStub(window);
  const keys = [];
  keys.push(gm.call('toast', 'строка\nс переносами\n\nи ещё', 'info'));
  keys.push(gm.call('toast', 'предупреждение', 'warn'));
  keys.push(gm.call('toast', 'ошибка', 'error'));
  gm.get('toastApi').dismissAll(); /* очистить очередь — без evict на 4-м */
  ring.remove.length = 0;
  keys.push(gm.call('toast', 'успех', 'success'));
  keys.push(gm.call('toast', 'дефолтный тип')); /* без type → info */
  checkJsonSnapshot('toast-ring-contract', { addAlert: ring.addAlert, returnedKeys: keys });
});

test('golden: toast Ring — очередь ≤3, evict oldest non-error, diag-след', () => {
  const { window, gm } = bridgeHost();
  const ring = installRingStub(window);
  const diagLog = recordDiag(gm);
  gm.call('toast', 'первый', 'info');
  gm.call('toast', 'второй', 'success');
  gm.call('toast', 'третий', 'warn');
  gm.call('toast', 'четвёртый', 'info'); /* переполнение → evict k1 */
  const afterOverflow = { removed: ring.remove.slice(), diag: diagLog.slice() };

  /* persistent error не вытесняется: остаток [k2,k3,k4] + error → evict k2 (oldest non-error) */
  ring.remove.length = 0; diagLog.length = 0;
  gm.call('toast', 'критическая ошибка', 'error');
  const afterError = { removed: ring.remove.slice(), diag: diagLog.slice() };
  checkJsonSnapshot('toast-ring-queue-evict', { afterOverflow: afterOverflow, afterError: afterError });
});

test('golden: toast Ring — aria-live контейнера: polite ↔ assertive при error', () => {
  const { window, gm, document } = bridgeHost();
  installRingStub(window);
  /* Ring alertService рендерит контейнер в body — в хосте React нет, создаём вручную. */
  const container = document.createElement('div');
  container.setAttribute('data-test', 'alert-container');
  document.body.appendChild(container);

  gm.call('toast', 'инфо', 'info');
  const afterInfo = { ariaLive: container.getAttribute('aria-live'), role: container.getAttribute('role') };
  gm.call('toast', 'ошибка', 'error');
  const afterError = { ariaLive: container.getAttribute('aria-live'), role: container.getAttribute('role') };
  gm.get('toastApi').dismissAll();
  gm.call('toast', 'снова инфо', 'info');
  const afterReset = { ariaLive: container.getAttribute('aria-live'), role: container.getAttribute('role') };
  checkJsonSnapshot('toast-ring-aria-live', { afterInfo: afterInfo, afterError: afterError, afterReset: afterReset });
});

test('golden: toast Ring — dismissAll снимает все ключи', () => {
  const { window, gm } = bridgeHost();
  const ring = installRingStub(window);
  gm.call('toast', 'a', 'info');
  gm.call('toast', 'b', 'error');
  gm.call('toast', 'c', 'warn');
  ring.remove.length = 0;
  gm.get('toastApi').dismissAll();
  checkJsonSnapshot('toast-ring-dismissall', { removed: ring.remove.slice() });
});

/* ═══════════════ Тост-мост (legacy DOM fallback, без Ring) ═══════════════ */

test('golden: toast legacy — DOM-структура элемента + ARIA (info и error)', () => {
  const { gm, document } = bridgeHost();
  gm.call('toast', 'обычное сообщение\nвторая строка', 'info');
  gm.call('toast', 'сообщение об ошибке', 'error');
  checkHtmlSnapshot('toast-legacy-dom', document.getElementById('toastStack').innerHTML);
});

test('golden: toast legacy — клик dismiss, evict при переполнении, diag-след', () => {
  const { gm, document } = bridgeHost();
  const diagLog = recordDiag(gm);
  const stack = document.getElementById('toastStack');
  gm.call('toast', 'первый', 'info');
  gm.call('toast', 'второй', 'warn');
  /* Клик по тосту dismiss'ит его (toast--out синхронно; удаление из DOM — в 250мс таймере). */
  stack.children[0].dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
  const afterClick = {
    classes: Array.prototype.map.call(stack.children, function (el) { return el.className; }),
  };
  /* Переполнение: очередь после клика = 1 живой… добиваем до >3 → evict oldest non-error. */
  gm.call('toast', 'третий', 'info');
  gm.call('toast', 'четвёртый', 'info');
  gm.call('toast', 'пятый', 'info'); /* очередь была 4 (≥3) → на push'е пятого вытеснен «второй» */
  const afterOverflow = {
    classes: Array.prototype.map.call(stack.children, function (el) { return el.className; }),
    texts: Array.prototype.map.call(stack.children, function (el) {
      return el.querySelector('.toast__text').textContent;
    }),
    diag: diagLog.slice(),
  };
  checkJsonSnapshot('toast-legacy-dismiss-evict', { afterClick: afterClick, afterOverflow: afterOverflow });
});

test('golden: toast legacy — click-anchor позиционирование стака', () => {
  const { gm, document } = bridgeHost();
  const stack = document.getElementById('toastStack');
  /* Без кликов: anchor = 50% высоты iframe (jsdom innerHeight=768 → 384). */
  gm.call('toast', 'до клика', 'info');
  const noClickTop = stack.style.top;
  /* mousedown трекается capture-листенером → следующий toast позиционируется от клика. */
  document.dispatchEvent(new document.defaultView.MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 300 }));
  gm.call('toast', 'после клика', 'info');
  const afterClickTop = stack.style.top;
  checkJsonSnapshot('toast-legacy-position', { noClickTop: noClickTop, afterClickTop: afterClickTop });
});

test('golden: toast legacy — dismissAll гасит всю очередь', () => {
  const { gm, document } = bridgeHost();
  const stack = document.getElementById('toastStack');
  gm.call('toast', 'a', 'info');
  gm.call('toast', 'b', 'error');
  gm.get('toastApi').dismissAll();
  checkJsonSnapshot('toast-legacy-dismissall', {
    classes: Array.prototype.map.call(stack.children, function (el) { return el.className; }),
  });
});

/* ═══════════════ Датапикер D127 (поп-ап, document-листенеры) ═══════════════ */

/** Инпут с маркером кастомного датапикера в body. */
function dpInput(document, value, min, max) {
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('data-ssp-datepicker', '1');
  if (value) input.value = value;
  if (min) input.setAttribute('min', min);
  if (max) input.setAttribute('max', max);
  document.body.appendChild(input);
  return input;
}

function clickOn(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
}

test('golden: datepicker — открытие: сетка месяца, min/max, selected, today', () => {
  const { document } = bridgeHost();
  /* value в июне 2026 — frozen-Date «сегодня» (2026-06-01) попадает в сетку. */
  const input = dpInput(document, '2026-06-05', '2026-06-01', '2026-06-30');
  clickOn(input);
  const popup = document.querySelector('.ssp-dp-popup');
  checkJsonSnapshot('dp-open-state', { display: popup.style.display });
  checkHtmlSnapshot('dp-open-grid', popup.innerHTML);
});

test('golden: datepicker — навигация prev/next пере-рендерит месяц', () => {
  const { document } = bridgeHost();
  const input = dpInput(document, '2026-06-05');
  clickOn(input);
  const popup = document.querySelector('.ssp-dp-popup');
  clickOn(popup.querySelector('.ssp-dp-prev'));
  const afterPrev = {
    title: popup.querySelector('.ssp-dp-title').textContent,
    firstIso: popup.querySelector('.ssp-dp-day').getAttribute('data-iso'),
  };
  clickOn(popup.querySelector('.ssp-dp-next'));
  clickOn(popup.querySelector('.ssp-dp-next'));
  const afterNext2 = {
    title: popup.querySelector('.ssp-dp-title').textContent,
    firstIso: popup.querySelector('.ssp-dp-day').getAttribute('data-iso'),
  };
  checkJsonSnapshot('dp-nav-contract', { afterPrev: afterPrev, afterNext2: afterNext2 });
});

test('golden: datepicker — commit дня: value, синтетические input/change, закрытие', () => {
  const { document } = bridgeHost();
  const input = dpInput(document, '2026-06-05');
  const events = [];
  input.addEventListener('input', function () { events.push('input:' + input.value); });
  input.addEventListener('change', function () { events.push('change:' + input.value); });
  clickOn(input);
  const popup = document.querySelector('.ssp-dp-popup');
  clickOn(popup.querySelector('.ssp-dp-day[data-iso="2026-06-15"]'));
  checkJsonSnapshot('dp-commit-contract', {
    value: input.value, events: events, display: popup.style.display,
  });
});

test('golden: datepicker — кнопки Today и Clear', () => {
  const { document } = bridgeHost();
  const input = dpInput(document, '2026-06-05');
  const events = [];
  input.addEventListener('change', function () { events.push('change:' + input.value); });
  clickOn(input);
  const popup = document.querySelector('.ssp-dp-popup');
  clickOn(popup.querySelector('.ssp-dp-today')); /* frozen Date → 2026-06-01 */
  const afterToday = { value: input.value, display: popup.style.display };
  clickOn(input); /* re-open */
  clickOn(popup.querySelector('.ssp-dp-clear'));
  const afterClear = { value: input.value, display: popup.style.display };
  checkJsonSnapshot('dp-today-clear-contract', { afterToday: afterToday, afterClear: afterClear, events: events });
});

test('golden: datepicker — outside-click и Escape закрывают поп-ап', () => {
  const { document } = bridgeHost();
  const input = dpInput(document, '2026-06-05');
  clickOn(input);
  const popup = document.querySelector('.ssp-dp-popup');
  clickOn(document.body); /* вне инпута и поп-апа */
  const afterOutside = popup.style.display;
  clickOn(input); /* re-open */
  const reopened = popup.style.display;
  document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const afterEscape = popup.style.display;
  checkJsonSnapshot('dp-close-contract', { afterOutside: afterOutside, reopened: reopened, afterEscape: afterEscape });
});
