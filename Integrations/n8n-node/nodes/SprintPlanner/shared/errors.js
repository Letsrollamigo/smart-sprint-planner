// @ts-check
/** Классы ошибок и их превращение в результат инструмента (isError:true + структура). */

export class PlannerRefusal extends Error {
  /** @param {Record<string, unknown>} body */
  constructor(body) {
    const reason = typeof body.reason === 'string' ? body.reason : (typeof body.error === 'string' ? body.error : 'unknown');
    super('planner refusal: ' + reason);
    this.name = 'PlannerRefusal';
    this.kind = /** @type {const} */ ('planner');
    this.reason = reason;
    this.error = typeof body.error === 'string' ? body.error : null;
    this.cid = typeof body.cid === 'string' ? body.cid : null;
    this.rev = typeof body.rev === 'number' ? body.rev : null;
    this.errors = Array.isArray(body.errors) ? body.errors : null;
    this.detail = typeof body.message === 'string' ? body.message : null;
  }
}

export class PlatformError extends Error {
  /** @param {number} status @param {string} text */
  constructor(status, text) {
    super('platform ' + status);
    this.name = 'PlatformError';
    this.kind = /** @type {const} */ ('platform');
    this.status = status;
    this.text = text;
  }
}

export class NetworkError extends Error {
  /** @param {unknown} cause @param {string} baseUrl */
  constructor(cause, baseUrl) {
    super('network: ' + (cause instanceof Error ? cause.message : String(cause)));
    this.name = 'NetworkError';
    this.kind = /** @type {const} */ ('network');
    this.baseUrl = baseUrl;
    this.timeout = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
  }
}

/** Отказ самого сервера (guards): slot_occupied, role_not_active, project_not_allowed, read_only, sprint_not_found. */
export class GuardError extends Error {
  /** @param {string} code @param {Record<string, unknown>} [details] */
  constructor(code, details = {}) {
    super('guard: ' + code);
    this.name = 'GuardError';
    this.kind = /** @type {const} */ ('server');
    this.code = code;
    this.details = details;
  }
}

/**
 * Подсказка из реестра кодов: по коду целиком, затем по основе до «:» (динамические коды `code:detail`).
 * @param {Record<string, {ru?: string, action?: string, en?: string, actionEn?: string}>} notes
 * @param {string} reason @param {string} lang
 */
export function hintFor(notes, reason, lang) {
  const base = reason.includes(':') ? reason.slice(0, reason.indexOf(':')) : reason;
  const n = notes[reason] || notes[base] || notes[base + ':'];
  if (!n) return { meaning: '', action: '' };
  const en = lang === 'en';
  return { meaning: (en && n.en) || n.ru || '', action: (en && n.actionEn) || n.action || '' };
}

/**
 * @param {unknown} err
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {Record<string, {ru?: string, action?: string, en?: string, actionEn?: string}>} notes
 * @param {string} lang
 */
export function toToolResult(err, t, notes, lang) {
  /** @type {Record<string, unknown>} */
  let structured;
  let text;
  if (err instanceof PlannerRefusal) {
    const h = hintFor(notes, err.reason, lang);
    text = t('errors.refusal', { reason: err.reason, meaning: h.meaning || t('errors.noHint'), action: h.action || '—', cid: err.cid || '—' });
    if (err.reason === 'rev_conflict' && err.rev !== null) text += ' ' + t('errors.revConflictTail', { rev: err.rev });
    if (err.errors) text += ' ' + t('errors.errorsTail', { errors: JSON.stringify(err.errors) });
    structured = { ok: false, kind: err.kind, reason: err.reason, error: err.error, cid: err.cid, rev: err.rev, errors: err.errors, detail: err.detail };
  } else if (err instanceof PlatformError) {
    const key = err.status === 401 ? 'errors.platform.401' : err.status === 404 ? 'errors.platform.404' : 'errors.platform.other';
    text = t(key, { status: err.status });
    structured = { ok: false, kind: err.kind, status: err.status };
  } else if (err instanceof NetworkError) {
    text = t(err.timeout ? 'errors.timeout' : 'errors.network', { baseUrl: err.baseUrl });
    structured = { ok: false, kind: err.kind, timeout: err.timeout };
  } else if (err instanceof GuardError) {
    text = t('errors.guard.' + err.code, err.details);
    structured = { ok: false, kind: err.kind, reason: err.code, ...err.details };
  } else {
    text = t('errors.unexpected', { message: err instanceof Error ? err.message : String(err) });
    structured = { ok: false, kind: 'server', reason: 'unexpected' };
  }
  // structuredContent при isError не отдаём: клиент SDK сверяет его с outputSchema инструмента и отверг бы ответ.
  // Машиночитаемая часть — второй строкой текста и в _meta.error.
  return { isError: true, content: [{ type: /** @type {const} */ ('text'), text: text + '\n' + JSON.stringify(structured) }], _meta: { error: structured } };
}
