/**
 * Smart Sprint Planner — State rollup parent.State ← min(children.State).
 *
 * v1.7.0 D128:
 *   - Стратегия 'min' (least-progressed child wins).
 *   - Idempotent: cur === target → no-op (защита от loop).
 *   - isResolved guard: parent.State ∈ stateRollupResolvedStates → skip write.
 *   - Floor: target = order[max(minChildIdx, floorIdx)] если задан stateRollupFloor.
 *   - i18n WF_I18N inline (15 локалей).
 *   - Self-contained per B-11; не require'ит другие workflow-файлы.
 *   - Reuses cascade hierarchy config (cascadeKindField, cascadeLevel2/3Values,
 *     cascadeParentLinkInward/Outward, fieldState) — no duplicate settings.
 *
 * Loop prevention: cascade writes fact/est fields; rollup writes State.
 *   Cross-trigger невозможен. Idempotent writes защищают в любом случае.
 *
 * Out of scope (TODO post-v1.7.0): max/mode strategies, sprint-level rollup,
 *   cross-project Epic, audit chain в snapshot'ах, manual rescan (v1.7.1).
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

const SETTINGS_KEY = 'ssp_settings';
const FALLBACK_LANG = 'en';

/* v1.7.0 D128 — WF_I18N: 4 workflow-side keys × 15 локалей.
   EN + RU полностью; 13 остальных — EN placeholder до i18n-pass v1.7.x. */
const WF_I18N = {
  en: {
    rollupUpdated:         'State rollup updated for {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'State rollup clamped to floor «{floorState}» for {issueId} (children min would be «{minState}»)',
    rollupResolvedSkipped: 'State rollup skipped — {issueId} is already in resolved state «{state}»',
    rollupUnknownState:    'State rollup ignored unknown child state «{state}» (not in stateRollupOrder)'
  },
  ru: {
    rollupUpdated:         'Состояние контейнера {issueId} автоматически обновлено: {fromState} → {toState}',
    rollupFloorHit:        'Состояние контейнера {issueId} удержано на минимуме «{floorState}» (по children было бы «{minState}»)',
    rollupResolvedSkipped: 'Состояние контейнера {issueId} уже «{state}» — rollup не пересчитывает завершённые контейнеры',
    rollupUnknownState:    'Rollup проигнорировал неизвестное состояние «{state}» (нет в настройке stateRollupOrder)'
  },
  cs: {
    rollupUpdated:         'Stav kontejneru aktualizován pro {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Stav kontejneru udržen na minimu «{floorState}» pro {issueId} (podle podřízených by byl «{minState}»)',
    rollupResolvedSkipped: 'Aktualizace stavu přeskočena — {issueId} je již ve stavu «{state}»',
    rollupUnknownState:    'Aktualizace stavu ignorovala neznámý stav podřízeného «{state}» (není v nastavení stateRollupOrder)'
  },
  de: {
    rollupUpdated:         'Container-Status aktualisiert für {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Container-Status für {issueId} bei Mindestwert «{floorState}» gehalten (Kinder-Minimum wäre «{minState}»)',
    rollupResolvedSkipped: 'Status-Rollup übersprungen — {issueId} ist bereits im Status «{state}»',
    rollupUnknownState:    'Status-Rollup ignorierte unbekannten Kind-Status «{state}» (nicht in stateRollupOrder)'
  },
  es: {
    rollupUpdated:         'Estado del contenedor actualizado para {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Estado del contenedor limitado al mínimo «{floorState}» para {issueId} (el mínimo de hijos sería «{minState}»)',
    rollupResolvedSkipped: 'Actualización de estado omitida — {issueId} ya está en estado «{state}»',
    rollupUnknownState:    'La actualización de estado ignoró el estado hijo desconocido «{state}» (no está en stateRollupOrder)'
  },
  fr: {
    rollupUpdated:         'État du conteneur mis à jour pour {issueId} : {fromState} → {toState}',
    rollupFloorHit:        'État du conteneur limité au minimum « {floorState} » pour {issueId} (le minimum des enfants serait « {minState} »)',
    rollupResolvedSkipped: 'Mise à jour d’état ignorée — {issueId} est déjà à l’état « {state} »',
    rollupUnknownState:    'La mise à jour d’état a ignoré l’état enfant inconnu « {state} » (pas dans stateRollupOrder)'
  },
  hu: {
    rollupUpdated:         'Konténer állapota frissítve a(z) {issueId} esetén: {fromState} → {toState}',
    rollupFloorHit:        'Konténer állapota a(z) {issueId} esetén a minimumon «{floorState}» tartva (gyermekek minimuma «{minState}» lenne)',
    rollupResolvedSkipped: 'Állapot-frissítés kihagyva — {issueId} már «{state}» állapotban van',
    rollupUnknownState:    'Az állapot-frissítés figyelmen kívül hagyta az ismeretlen gyermekállapotot «{state}» (nincs a stateRollupOrder beállításban)'
  },
  it: {
    rollupUpdated:         'Stato del contenitore aggiornato per {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Stato del contenitore limitato al minimo «{floorState}» per {issueId} (il minimo dei figli sarebbe «{minState}»)',
    rollupResolvedSkipped: 'Aggiornamento dello stato ignorato — {issueId} è già nello stato «{state}»',
    rollupUnknownState:    'L’aggiornamento dello stato ha ignorato lo stato figlio sconosciuto «{state}» (non in stateRollupOrder)'
  },
  ja: {
    rollupUpdated:         'コンテナの状態を更新しました（{issueId}）: {fromState} → {toState}',
    rollupFloorHit:        'コンテナの状態を最小値「{floorState}」に保持しました（{issueId}、子の最小は「{minState}」）',
    rollupResolvedSkipped: '状態の集約をスキップ — {issueId} は既に「{state}」状態です',
    rollupUnknownState:    '状態の集約が不明な子ステート「{state}」を無視しました（stateRollupOrder に未登録）'
  },
  ko: {
    rollupUpdated:         '컨테이너 상태가 업데이트되었습니다 ({issueId}): {fromState} → {toState}',
    rollupFloorHit:        '컨테이너 상태를 최소값 「{floorState}」(으)로 유지했습니다 ({issueId}, 자식 최소는 「{minState}」)',
    rollupResolvedSkipped: '상태 롤업 건너뜀 — {issueId}은(는) 이미 「{state}」 상태입니다',
    rollupUnknownState:    '상태 롤업이 알 수 없는 자식 상태 「{state}」을(를) 무시했습니다 (stateRollupOrder에 없음)'
  },
  nl: {
    rollupUpdated:         'Containerstatus bijgewerkt voor {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Containerstatus voor {issueId} op minimum «{floorState}» gehouden (minimum van onderliggende issues zou «{minState}» zijn)',
    rollupResolvedSkipped: 'Status-rollup overgeslagen — {issueId} heeft al de status «{state}»',
    rollupUnknownState:    'Status-rollup negeerde onbekende onderliggende status «{state}» (niet in stateRollupOrder)'
  },
  pl: {
    rollupUpdated:         'Status kontenera zaktualizowany dla {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Status kontenera utrzymany na minimum «{floorState}» dla {issueId} (minimum dzieci wynosiłoby «{minState}»)',
    rollupResolvedSkipped: 'Aktualizacja statusu pominięta — {issueId} ma już status «{state}»',
    rollupUnknownState:    'Aktualizacja statusu zignorowała nieznany status dziecka «{state}» (nie ma w stateRollupOrder)'
  },
  pt: {
    rollupUpdated:         'Estado do contêiner atualizado para {issueId}: {fromState} → {toState}',
    rollupFloorHit:        'Estado do contêiner limitado ao mínimo «{floorState}» para {issueId} (o mínimo dos filhos seria «{minState}»)',
    rollupResolvedSkipped: 'Atualização de estado ignorada — {issueId} já está no estado «{state}»',
    rollupUnknownState:    'A atualização de estado ignorou o estado filho desconhecido «{state}» (não está em stateRollupOrder)'
  },
  tr: {
    rollupUpdated:         'Konteyner durumu güncellendi ({issueId}): {fromState} → {toState}',
    rollupFloorHit:        'Konteyner durumu minimumda «{floorState}» tutuldu ({issueId}, alt öğelerin minimumu «{minState}» olurdu)',
    rollupResolvedSkipped: 'Durum toplaması atlandı — {issueId} zaten «{state}» durumunda',
    rollupUnknownState:    'Durum toplaması bilinmeyen alt durumu «{state}» yok saydı (stateRollupOrder içinde değil)'
  },
  zh: {
    rollupUpdated:         '容器状态已更新（{issueId}）：{fromState} → {toState}',
    rollupFloorHit:        '容器状态保持在最小值「{floorState}」（{issueId}，子任务最小为「{minState}」）',
    rollupResolvedSkipped: '状态汇总已跳过 — {issueId} 已处于「{state}」状态',
    rollupUnknownState:    '状态汇总忽略了未知的子状态「{state}」（不在 stateRollupOrder 中）'
  }
};

/* ---- Утилиты (self-contained copy per B-11) ---- */

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

function tWf(lang, key, vars) {
  const dict = WF_I18N[lang] || WF_I18N[FALLBACK_LANG];
  let s = (dict && dict[key]) || (WF_I18N[FALLBACK_LANG][key]) || key;
  if (vars) {
    Object.keys(vars).forEach(function(v) {
      s = s.replace(new RegExp('\\{' + v + '\\}', 'g'), String(vars[v]));
    });
  }
  return s;
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

function _firstLink(issue, linkName) {
  if (!issue || !issue.links) return null;
  const coll = issue.links[linkName];
  if (!coll) return null;
  if (typeof coll.first === 'function') {
    try { return coll.first(); } catch (_) { return null; }
  }
  return null;
}

function _collectChildren(parent, outwardLinkName) {
  const out = [];
  if (!parent || !parent.links) return out;
  const coll = parent.links[outwardLinkName];
  if (!coll) return out;
  if (typeof coll.forEach === 'function') {
    try {
      coll.forEach(function(c) { if (c) out.push(c); });
    } catch (_) {}
  }
  return out;
}

/* ---- State rollup logic ---- */

function _stateOrderIndex(stateName, order) {
  if (!stateName || !Array.isArray(order)) return -1;
  return order.indexOf(stateName);
}

function _readIssueStateName(issue, stateFieldName) {
  if (!issue) return null;
  const fname = stateFieldName || 'State';
  try {
    const v = issue.fields[fname];
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v.name) return v.name;
  } catch (_) {}
  return null;
}

/**
 * Вычислить target state для parent на основе children.
 * Возвращает { target: string|null, reason: string }.
 */
/* v3.2.1 — сообщения копятся в msgs и эмитятся ВЫЗЫВАЮЩИМ только при реальном
   применении: раньше unknown-state/floor-баннеры сыпались на КАЖДЫЙ save каждого
   ребёнка даже при идемпотентном no-op (curState===target) — воспринималось как сбой. */
function computeRollupTarget(parent, settings, outwardLinkName, stateFieldName, lang, msgs) {
  const order = settings.stateRollupOrder || [];
  if (!Array.isArray(order) || order.length < 2) return { target: null, reason: 'no-order' };

  const children = _collectChildren(parent, outwardLinkName);
  if (!children.length) return { target: null, reason: 'no-children' };

  let minIdx = Number.MAX_SAFE_INTEGER;
  let anyKnown = false;
  for (let i = 0; i < children.length; i++) {
    const childState = _readIssueStateName(children[i], stateFieldName);
    const idx = _stateOrderIndex(childState, order);
    if (idx < 0) {
      if (childState && msgs) {
        msgs.push(tWf(lang || FALLBACK_LANG, 'rollupUnknownState', { state: childState }));
      }
      continue;
    }
    anyKnown = true;
    if (idx < minIdx) minIdx = idx;
  }
  if (!anyKnown) return { target: null, reason: 'unknown-states' };

  const floor = settings.stateRollupFloor;
  if (floor && typeof floor === 'string') {
    const floorIdx = _stateOrderIndex(floor, order);
    if (floorIdx >= 0 && minIdx < floorIdx) {
      if (msgs) {
        msgs.push(tWf(lang || FALLBACK_LANG, 'rollupFloorHit', {
          issueId: parent.id,
          floorState: floor,
          minState: order[minIdx]
        }));
      }
      return { target: order[floorIdx], reason: 'ok-floor' };
    }
  }

  return { target: order[minIdx], reason: 'ok' };
}

function _applyRollupToParent(parent, settings, outwardLink, stateFieldName, lang) {
  const curStateName = _readIssueStateName(parent, stateFieldName);
  const resolved = Array.isArray(settings.stateRollupResolvedStates) ? settings.stateRollupResolvedStates : [];
  if (curStateName && resolved.indexOf(curStateName) >= 0) {
    /* v3.2.1 — resolved-parent скипается ТИХО: message на каждый save каждого
       ребёнка резолвнутого эпика был баннер-спамом (ponytail: осознанное удаление
       информационного сообщения — skip штатный, не сбой). */
    return;
  }

  const msgs = [];
  const res = computeRollupTarget(parent, settings, outwardLink, stateFieldName, lang, msgs);
  if (!res.target) return;

  if (curStateName === res.target) return; // idempotent — защита от loop (тихо, без msgs)
  for (let mi = 0; mi < msgs.length; mi++) { try { workflow.message(msgs[mi]); } catch (_) {} }

  try {
    parent.fields[stateFieldName] = res.target;
    parent.fields.updated = Date.now();
    workflow.message(tWf(lang, 'rollupUpdated', {
      issueId: parent.id,
      fromState: curStateName || '(empty)',
      toState: res.target
    }));
  } catch (e) {
    try { console.error('[state-rollup] write failed for ' + parent.id + ': ' + e); } catch (_) {}
  }
}

function _runRollup(issue, ctx) {
  const settings = readSettings(issue);
  if (!settings || !settings.stateRollupEnabled) return;

  if (settings.stateRollupStrategy && settings.stateRollupStrategy !== 'min') return;

  const lvl2 = Array.isArray(settings.cascadeLevel2Values) ? settings.cascadeLevel2Values : [];
  const lvl3 = Array.isArray(settings.cascadeLevel3Values) ? settings.cascadeLevel3Values : [];
  if (!lvl2.length && !lvl3.length) return;

  const inwardLink = (typeof settings.cascadeParentLinkInward === 'string' && settings.cascadeParentLinkInward.length)
    ? settings.cascadeParentLinkInward : 'subtask of';
  const outwardLink = (typeof settings.cascadeParentLinkOutward === 'string' && settings.cascadeParentLinkOutward.length)
    ? settings.cascadeParentLinkOutward : 'parent for';

  const stateFieldName = (typeof settings.fieldState === 'string' && settings.fieldState.length)
    ? settings.fieldState : 'State';

  const lang = pickLocale(ctx, settings);

  // Path 1: child → parent (level-2 OR level-3).
  const parent = _firstLink(issue, inwardLink);
  if (parent) {
    const pKind = _kindName(parent, settings);
    if (pKind && (lvl2.indexOf(pKind) >= 0 || lvl3.indexOf(pKind) >= 0)) {
      _applyRollupToParent(parent, settings, outwardLink, stateFieldName, lang);
      // Path 1+: если parent — level-2, пересчитать level-3 grandparent.
      if (lvl2.indexOf(pKind) >= 0) {
        const grand = _firstLink(parent, inwardLink);
        if (grand) {
          const gKind = _kindName(grand, settings);
          if (gKind && lvl3.indexOf(gKind) >= 0) {
            _applyRollupToParent(grand, settings, outwardLink, stateFieldName, lang);
          }
        }
      }
    }
  }

  // Path 2: изменился level-2 → пересчитать level-3 parent (если есть).
  const myKind = _kindName(issue, settings);
  if (myKind && lvl2.indexOf(myKind) >= 0) {
    const myParent = _firstLink(issue, inwardLink);
    if (myParent) {
      const mpKind = _kindName(myParent, settings);
      if (mpKind && lvl3.indexOf(mpKind) >= 0) {
        _applyRollupToParent(myParent, settings, outwardLink, stateFieldName, lang);
      }
    }
  }
}

function _guard(ctx) {
  const issue = ctx && ctx.issue;
  if (!issue) return false;
  const settings = readSettings(issue);
  if (!settings || !settings.stateRollupEnabled) return false;

  const stateFieldName = (typeof settings.fieldState === 'string' && settings.fieldState.length)
    ? settings.fieldState : 'State';
  try {
    if (issue.fields.isChanged && issue.fields.isChanged(stateFieldName)) return true;
  } catch (_) {}
  return false;
}

exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — state rollup parent ← min(children)',
  guard: _guard,
  action: function(ctx) { _runRollup(ctx && ctx.issue, ctx); }
});

// Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    computeRollupTarget: computeRollupTarget,
    _stateOrderIndex:    _stateOrderIndex,
    _readIssueStateName: _readIssueStateName,
    WF_I18N:             WF_I18N,
    tWf:                 tWf,
    pickLocale:          pickLocale
  });
}
