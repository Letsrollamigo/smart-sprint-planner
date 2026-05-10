/**
 * Smart Sprint Planner — Forbid direct work-item logging on container issues.
 *
 * v1.3.0 — RESOLVED B-3..B-5 (см. .roadmap-source/feature-2-cascade-and-forbid.md):
 *   B-3: без bypass — settings.forbidContainerWorkItems = true блокирует всех.
 *   B-4: hard block через workflow.check(false, ...) — save отклоняется.
 *   B-5: блокирует и `added`, и `editedWorkItems` — половинчатый блок создаёт
 *        лазейку через edit.
 *   B-8: kind-field name + values конфигурируемы (settings.cascadeKindField,
 *        cascadeLevel2Values, cascadeLevel3Values).
 *   B-10: workflow.check message локализуется в 15 языках (WF_I18N inline).
 *   B-11: self-contained файл, exports.rule = entities.Issue.onChange.
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

const SETTINGS_KEY = 'ssp_settings';
const FALLBACK_LANG = 'en';

const WF_I18N = {
  en: { errForbidContainer: 'Direct work-item logging on container issues (level-2/level-3) is forbidden. Time logging must happen on leaf child issues only.' },
  ru: { errForbidContainer: 'Запрещено прямое списание трудозатрат на контейнерные задачи (level-2/level-3). Списания должны делаться на конечных дочерних задачах.' },
  cs: { errForbidContainer: 'Přímé vykazování práce na kontejnerových úkolech (úroveň 2/úroveň 3) je zakázáno. Vykazování času je povoleno pouze na koncových podřízených úkolech.' },
  de: { errForbidContainer: 'Direkte Zeiterfassung auf Container-Issues (Ebene 2/Ebene 3) ist verboten. Zeiterfassung ist nur auf Blatt-Kind-Issues erlaubt.' },
  es: { errForbidContainer: 'El registro directo de work items en issues contenedoras (nivel 2/nivel 3) está prohibido. El registro de tiempo solo se permite en issues hijas hoja.' },
  fr: { errForbidContainer: 'L\'enregistrement direct de work items sur les issues conteneurs (niveau 2/niveau 3) est interdit. L\'enregistrement du temps n\'est autorisé que sur les issues enfants feuilles.' },
  hu: { errForbidContainer: 'A közvetlen munkaidő-rögzítés konténer issue-kon (2. szint/3. szint) tilos. Időrögzítés csak a levél (gyermek) issue-kon engedélyezett.' },
  it: { errForbidContainer: 'La registrazione diretta di work item su issue contenitore (livello 2/livello 3) è vietata. La registrazione del tempo è consentita solo sulle issue figlie foglia.' },
  ja: { errForbidContainer: 'コンテナ issue (第2階層/第3階層) への直接の作業時間記録は禁止されています。時間記録はリーフ (子) issue でのみ行ってください。' },
  ko: { errForbidContainer: '컨테이너 issue(2단계/3단계)에서 직접 work item 기록은 금지됩니다. 시간 기록은 리프(자식) issue에서만 허용됩니다.' },
  nl: { errForbidContainer: 'Direct registreren van work items op containerissues (niveau 2/niveau 3) is verboden. Tijdregistratie is alleen toegestaan op blad (child) issues.' },
  pl: { errForbidContainer: 'Bezpośrednie rejestrowanie work itemów na issue kontenerowych (poziom 2/poziom 3) jest zabronione. Rejestrowanie czasu jest dozwolone tylko na liściach (issue podrzędnych).' },
  pt: { errForbidContainer: 'O registro direto de work items em issues contêineres (nível 2/nível 3) é proibido. O registro de tempo é permitido apenas em issues filhas folha.' },
  tr: { errForbidContainer: 'Kapsayıcı issue\'larda (2. seviye/3. seviye) doğrudan work item kaydı yasaktır. Zaman kaydı yalnızca yaprak (alt) issue\'larda izinlidir.' },
  zh: { errForbidContainer: '禁止在容器 issue(第 2 级/第 3 级)上直接登记 work item。时间登记仅允许在叶子(子)issue 上进行。' }
};

function _normLang(raw) {
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().split(/[-_]/)[0];
  return lower || null;
}

function pickLocale(ctx, settings) {
  if (settings && settings.defaultLang) {
    const norm = _normLang(settings.defaultLang);
    if (norm && WF_I18N[norm]) return norm;
  }
  try {
    const userLang = ctx && ctx.currentUser && ctx.currentUser.profile
      && ctx.currentUser.profile.locale && ctx.currentUser.profile.locale.language;
    const norm = _normLang(userLang);
    if (norm && WF_I18N[norm]) return norm;
  } catch (_) {}
  return FALLBACK_LANG;
}

function tWf(lang, key) {
  const dict = WF_I18N[lang] || WF_I18N[FALLBACK_LANG];
  return (dict && dict[key]) || (WF_I18N[FALLBACK_LANG][key]) || key;
}

function readSettings(issue) {
  if (!issue) return null;
  try {
    const project = issue.project;
    if (!project) return null;
    const ep = project.extensionProperties;
    if (!ep) return null;
    const raw = ep[SETTINGS_KEY];
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return null; }
    }
    if (typeof raw === 'object') return raw;
    return null;
  } catch (_) { return null; }
}

function _kindName(issue, settings) {
  if (!issue) return null;
  const kf = (settings && typeof settings.cascadeKindField === 'string' && settings.cascadeKindField.length)
    ? settings.cascadeKindField : 'Type';
  try {
    const v = issue.fields[kf];
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v.name) return v.name;
  } catch (_) {}
  return null;
}

function _isContainerKind(kindName, settings) {
  if (!kindName) return false;
  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  return lvl2.indexOf(kindName) >= 0 || lvl3.indexOf(kindName) >= 0;
}

function _hasWorkItemMutation(issue) {
  if (!issue) return false;
  function notEmpty(coll) {
    if (!coll) return false;
    if (typeof coll.isNotEmpty === 'function') return coll.isNotEmpty();
    if (typeof coll.isEmpty === 'function') return !coll.isEmpty();
    if (typeof coll.size === 'number') return coll.size > 0;
    if (typeof coll.length === 'number') return coll.length > 0;
    return false;
  }
  if (issue.workItems && notEmpty(issue.workItems.added)) return true;
  if (notEmpty(issue.editedWorkItems)) return true;
  return false;
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
  if (!settings || !settings.forbidContainerWorkItems) return false;
  if (!_hasWorkItemMutation(issue)) return false;
  const kind = _kindName(issue, settings);
  return _isContainerKind(kind, settings);
}

exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — forbid direct workItems on container issues',
  guard: _guard,
  action: function(ctx) {
    const issue = ctx && ctx.issue;
    const settings = readSettings(issue);
    const lang = pickLocale(ctx, settings);
    workflow.check(false, tWf(lang, 'errForbidContainer'));
  }
});
