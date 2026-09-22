// @ts-check
/** Журнал в stderr, JSON-строками, только поля из белого списка — токены и тела сюда попасть не могут. */
const LEVELS = { error: 0, info: 1, debug: 2 };
const FIELDS = ['event', 'tool', 'projectKey', 'outcome', 'reason', 'cid', 'ms', 'status', 'method', 'path', 'transport', 'host', 'port', 'msg'];

/**
 * @param {'error'|'info'|'debug'} level
 * @param {{ write(s: string): unknown }} [out]
 */
export function createLog(level, out = process.stderr) {
  const max = LEVELS[level] ?? LEVELS.info;
  /** @param {'error'|'info'|'debug'} lvl @param {Record<string, unknown>} fields */
  function emit(lvl, fields) {
    if (LEVELS[lvl] > max) return;
    /** @type {Record<string, unknown>} */
    const rec = { ts: new Date().toISOString(), level: lvl };
    for (const k of FIELDS) if (fields[k] !== undefined) rec[k] = fields[k];
    out.write(JSON.stringify(rec) + '\n');
  }
  return {
    level,
    error: (/** @type {Record<string, unknown>} */ f) => emit('error', f),
    info: (/** @type {Record<string, unknown>} */ f) => emit('info', f),
    debug: (/** @type {Record<string, unknown>} */ f) => emit('debug', f)
  };
}
export const LOG_FIELDS = FIELDS;
