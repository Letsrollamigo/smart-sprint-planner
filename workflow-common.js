/**
 * Smart Sprint Planner — общая инфраструктура workflow-правил.
 *
 * R3c (v3.7.0, арх-аудит 2026-07-12 D3): дубли 4 правил (dta-aggregation /
 * cascade-aggregation / forbid-container / state-rollup) сведены сюда.
 * Инвариант B-11 «self-contained файл» снят ОСОЗНАННО: sibling-require в
 * workflow-рантайме YT Apps подтверждён стенд-пробами 3.3.94/3.3.95 —
 * рабочий require('./workflow-common.js') регистрируется штатно, битый
 * валит импорт приложения fail-fast (тихой деградации нет).
 *
 * ВАЖНО: файл НЕ экспортирует exports.rule — YT не регистрирует его как
 * workflow-правило (проверено пробой 3.3.94: модуль без rule-экспорта
 * импортируется как обычный скрипт).
 *
 * Mutable-состояние (_settingsStash, WF_HOURS_PER_DAY) переехало из per-file
 * копий в один инстанс модуля. Семантика эквивалентна: правила одного события
 * работают с одним issue и одним settings-блобом; each-action выставляет
 * hoursPerDay из тех же settings перед использованием. Если YT не кэширует
 * require (each-file instance) — получаем ровно старую per-file семантику.
 */
const SETTINGS_KEY = 'ssp_settings';
const FALLBACK_LANG = 'en';

/* Объединённый словарь 4 правил: 30 ключей × 15 локалей. Ключи правил
   дизъюнктны (проверяется workflow-i18n.test.js). Собран программно из
   per-file словарей при R3c-выносе — переводы byte-идентичны исходным. */
const WF_I18N = {
  "en": {
    "msgFactUpdated": "Distributed time updated for {issueId}: {details}",
    "errMappingMissing": "Time accounting mapping is not configured. Configure mapping in plugin settings.",
    "errInvalidRole": "Type \"{type}\" is mapped to inactive or unknown role \"{role}\".",
    "errFieldMissing": "No fact-field configured for role \"{role}\". Set it in plugin settings → Fields.",
    "errMissingType": "Please specify the work item type!",
    "progressNoEstimate": "Logged {label}: {fact}",
    "progressUnder90": "Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%), ⚠️ Less than 10% of plan remaining! {advice}",
    "progressOverLimit": "Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%), 🚨 OVER LIMIT! {advice}",
    "adviceAnalysis": "Time to break the issue down!",
    "adviceExecutor": "Please contact the analyst!",
    "roleLabel_analysis": "by analyst",
    "roleLabel_testing": "for testing",
    "roleLabel_devPlatform": "for platform development",
    "roleLabel_devBack": "for backend development",
    "roleLabel_devFront": "for frontend development",
    "roleLabel_devIos": "for iOS development",
    "roleLabel_devAndroid": "for Android development",
    "roleLabel_devFs": "for fullstack development",
    "roleLabel_devDb": "for DB development",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Cascade-updated estimates in {issueId}: {details}",
    "cascadeUpdatedFact": "Cascade-updated work hours in {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Direct work-item logging on container issues (level-2/level-3) is forbidden. Time logging must happen on leaf child issues only.",
    "rollupUpdated": "State rollup updated for {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "State rollup clamped to floor «{floorState}» for {issueId} (children min would be «{minState}»)",
    "rollupResolvedSkipped": "State rollup skipped — {issueId} is already in resolved state «{state}»",
    "rollupUnknownState": "State rollup ignored unknown child state «{state}» (not in stateRollupOrder)"
  },
  "ru": {
    "msgFactUpdated": "Распределение времени обновлено для {issueId}: {details}",
    "errMappingMissing": "Маппинг учёта времени не настроен. Настройте маппинг в настройках плагина.",
    "errInvalidRole": "Тип «{type}» сопоставлен с неактивной/неизвестной ролью «{role}».",
    "errFieldMissing": "Не задано фактическое поле для роли «{role}». Укажите его в настройках плагина → Поля.",
    "errMissingType": "Укажите тип работы!",
    "progressNoEstimate": "Выработано {label}: {fact}",
    "progressUnder90": "Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%), ⚠️ Остаток менее 10%! {advice}",
    "progressOverLimit": "Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%), 🚨 ПЕРЕЛИМИТ! {advice}",
    "adviceAnalysis": "Пора декомпозировать задачу!",
    "adviceExecutor": "Необходимо связаться с аналитиком!",
    "roleLabel_analysis": "аналитиком",
    "roleLabel_testing": "на тестирование",
    "roleLabel_devPlatform": "на платформенную разработку",
    "roleLabel_devBack": "на backend-разработку",
    "roleLabel_devFront": "на frontend-разработку",
    "roleLabel_devIos": "на iOS-разработку",
    "roleLabel_devAndroid": "на Android-разработку",
    "roleLabel_devFs": "на fullstack-разработку",
    "roleLabel_devDb": "на СУБД-разработку",
    "unitH": "ч",
    "unitM": "м",
    "cascadeUpdatedEst": "Каскадно обновлены оценки в {issueId}: {details}",
    "cascadeUpdatedFact": "Каскадно обновлены трудозатраты в {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Запрещено прямое списание трудозатрат на контейнерные задачи (level-2/level-3). Списания должны делаться на конечных дочерних задачах.",
    "rollupUpdated": "Состояние контейнера {issueId} автоматически обновлено: {fromState} → {toState}",
    "rollupFloorHit": "Состояние контейнера {issueId} удержано на минимуме «{floorState}» (по children было бы «{minState}»)",
    "rollupResolvedSkipped": "Состояние контейнера {issueId} уже «{state}» — rollup не пересчитывает завершённые контейнеры",
    "rollupUnknownState": "Rollup проигнорировал неизвестное состояние «{state}» (нет в настройке stateRollupOrder)"
  },
  "cs": {
    "msgFactUpdated": "Distribuovaný čas aktualizován pro {issueId}: {details}",
    "errMappingMissing": "Mapování sledování času není nakonfigurováno. Nakonfigurujte mapování v nastavení pluginu.",
    "errInvalidRole": "Typ „{type}“ je přiřazen neaktivní/neznámé roli „{role}“.",
    "errFieldMissing": "Pro roli „{role}“ není nakonfigurováno fact-pole. Nastavte ho v Nastavení pluginu → Pole.",
    "errMissingType": "Zadejte typ práce!",
    "progressNoEstimate": "Vykázáno {label}: {fact}",
    "progressUnder90": "Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%), ⚠️ Zbývá méně než 10%! {advice}",
    "progressOverLimit": "Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%), 🚨 PŘEKROČENÍ LIMITU! {advice}",
    "adviceAnalysis": "Je čas dekompozovat úkol!",
    "adviceExecutor": "Kontaktujte analytika!",
    "roleLabel_analysis": "analytikem",
    "roleLabel_testing": "na testování",
    "roleLabel_devPlatform": "na platformový vývoj",
    "roleLabel_devBack": "na backend vývoj",
    "roleLabel_devFront": "na frontend vývoj",
    "roleLabel_devIos": "na iOS vývoj",
    "roleLabel_devAndroid": "na Android vývoj",
    "roleLabel_devFs": "na fullstack vývoj",
    "roleLabel_devDb": "na vývoj DB",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Kaskádově aktualizovány odhady v {issueId}: {details}",
    "cascadeUpdatedFact": "Kaskádově aktualizovány pracovní hodiny v {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Přímé vykazování práce na kontejnerových úkolech (úroveň 2/úroveň 3) je zakázáno. Vykazování času je povoleno pouze na koncových podřízených úkolech.",
    "rollupUpdated": "Stav kontejneru aktualizován pro {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Stav kontejneru udržen na minimu «{floorState}» pro {issueId} (podle podřízených by byl «{minState}»)",
    "rollupResolvedSkipped": "Aktualizace stavu přeskočena — {issueId} je již ve stavu «{state}»",
    "rollupUnknownState": "Aktualizace stavu ignorovala neznámý stav podřízeného «{state}» (není v nastavení stateRollupOrder)"
  },
  "de": {
    "msgFactUpdated": "Verteilte Zeit aktualisiert für {issueId}: {details}",
    "errMappingMissing": "Zeiterfassungs-Mapping ist nicht konfiguriert. Konfigurieren Sie das Mapping in den Plugin-Einstellungen.",
    "errInvalidRole": "Typ „{type}“ ist einer inaktiven/unbekannten Rolle „{role}“ zugeordnet.",
    "errFieldMissing": "Für Rolle „{role}“ ist kein Fact-Feld konfiguriert. Legen Sie es in Plugin-Einstellungen → Felder fest.",
    "errMissingType": "Bitte geben Sie den Arbeitstyp an!",
    "progressNoEstimate": "Erfasst {label}: {fact}",
    "progressUnder90": "Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%), ⚠️ Weniger als 10% des Plans übrig! {advice}",
    "progressOverLimit": "Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%), 🚨 ÜBERSCHRITTEN! {advice}",
    "adviceAnalysis": "Zeit, das Issue aufzubrechen!",
    "adviceExecutor": "Bitte kontaktieren Sie den Analysten!",
    "roleLabel_analysis": "durch Analyst",
    "roleLabel_testing": "für Test",
    "roleLabel_devPlatform": "für Plattformentwicklung",
    "roleLabel_devBack": "für Backend-Entwicklung",
    "roleLabel_devFront": "für Frontend-Entwicklung",
    "roleLabel_devIos": "für iOS-Entwicklung",
    "roleLabel_devAndroid": "für Android-Entwicklung",
    "roleLabel_devFs": "für Fullstack-Entwicklung",
    "roleLabel_devDb": "für DB-Entwicklung",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Schätzungen in {issueId} kaskadierend aktualisiert: {details}",
    "cascadeUpdatedFact": "Arbeitszeit in {issueId} kaskadierend aktualisiert: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Direkte Zeiterfassung auf Container-Issues (Ebene 2/Ebene 3) ist verboten. Zeiterfassung ist nur auf Blatt-Kind-Issues erlaubt.",
    "rollupUpdated": "Container-Status aktualisiert für {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Container-Status für {issueId} bei Mindestwert «{floorState}» gehalten (Kinder-Minimum wäre «{minState}»)",
    "rollupResolvedSkipped": "Status-Rollup übersprungen — {issueId} ist bereits im Status «{state}»",
    "rollupUnknownState": "Status-Rollup ignorierte unbekannten Kind-Status «{state}» (nicht in stateRollupOrder)"
  },
  "es": {
    "msgFactUpdated": "Tiempo distribuido actualizado para {issueId}: {details}",
    "errMappingMissing": "El mapeo de seguimiento de tiempo no está configurado. Configure el mapeo en los ajustes del plugin.",
    "errInvalidRole": "El tipo «{type}» está asignado a un rol inactivo/desconocido «{role}».",
    "errFieldMissing": "No hay campo fact configurado para el rol «{role}». Establézcalo en Ajustes del plugin → Campos.",
    "errMissingType": "¡Especifique el tipo de trabajo!",
    "progressNoEstimate": "Registrado {label}: {fact}",
    "progressUnder90": "Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%), ⚠️ ¡Queda menos del 10% del plan! {advice}",
    "progressOverLimit": "Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%), 🚨 ¡SOBRELÍMITE! {advice}",
    "adviceAnalysis": "¡Es hora de descomponer la tarea!",
    "adviceExecutor": "¡Póngase en contacto con el analista!",
    "roleLabel_analysis": "por analista",
    "roleLabel_testing": "para pruebas",
    "roleLabel_devPlatform": "para desarrollo de plataforma",
    "roleLabel_devBack": "para desarrollo backend",
    "roleLabel_devFront": "para desarrollo frontend",
    "roleLabel_devIos": "para desarrollo iOS",
    "roleLabel_devAndroid": "para desarrollo Android",
    "roleLabel_devFs": "para desarrollo fullstack",
    "roleLabel_devDb": "para desarrollo de BD",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Estimaciones actualizadas en cascada en {issueId}: {details}",
    "cascadeUpdatedFact": "Horas de trabajo actualizadas en cascada en {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "El registro directo de work items en issues contenedoras (nivel 2/nivel 3) está prohibido. El registro de tiempo solo se permite en issues hijas hoja.",
    "rollupUpdated": "Estado del contenedor actualizado para {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Estado del contenedor limitado al mínimo «{floorState}» para {issueId} (el mínimo de hijos sería «{minState}»)",
    "rollupResolvedSkipped": "Actualización de estado omitida — {issueId} ya está en estado «{state}»",
    "rollupUnknownState": "La actualización de estado ignoró el estado hijo desconocido «{state}» (no está en stateRollupOrder)"
  },
  "fr": {
    "msgFactUpdated": "Temps distribué mis à jour pour {issueId} : {details}",
    "errMappingMissing": "Le mappage de suivi du temps n'est pas configuré. Configurez le mappage dans les paramètres du plugin.",
    "errInvalidRole": "Le type « {type} » est mappé sur un rôle inactif/inconnu « {role} ».",
    "errFieldMissing": "Aucun champ fact configuré pour le rôle « {role} ». Définissez-le dans Paramètres du plugin → Champs.",
    "errMissingType": "Veuillez spécifier le type de travail !",
    "progressNoEstimate": "Enregistré {label} : {fact}",
    "progressUnder90": "Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%)",
    "progressNearLimit": "Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%), ⚠️ Moins de 10% du plan restant ! {advice}",
    "progressOverLimit": "Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%), 🚨 DÉPASSEMENT ! {advice}",
    "adviceAnalysis": "Il est temps de décomposer la tâche !",
    "adviceExecutor": "Veuillez contacter l'analyste !",
    "roleLabel_analysis": "par l'analyste",
    "roleLabel_testing": "pour les tests",
    "roleLabel_devPlatform": "pour le développement plateforme",
    "roleLabel_devBack": "pour le développement backend",
    "roleLabel_devFront": "pour le développement frontend",
    "roleLabel_devIos": "pour le développement iOS",
    "roleLabel_devAndroid": "pour le développement Android",
    "roleLabel_devFs": "pour le développement fullstack",
    "roleLabel_devDb": "pour le développement BDD",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Estimations mises à jour en cascade dans {issueId} : {details}",
    "cascadeUpdatedFact": "Heures de travail mises à jour en cascade dans {issueId} : {details}",
    "cascadeFieldChange": "{field} : {from} → {to}",
    "errForbidContainer": "L'enregistrement direct de work items sur les issues conteneurs (niveau 2/niveau 3) est interdit. L'enregistrement du temps n'est autorisé que sur les issues enfants feuilles.",
    "rollupUpdated": "État du conteneur mis à jour pour {issueId} : {fromState} → {toState}",
    "rollupFloorHit": "État du conteneur limité au minimum « {floorState} » pour {issueId} (le minimum des enfants serait « {minState} »)",
    "rollupResolvedSkipped": "Mise à jour d’état ignorée — {issueId} est déjà à l’état « {state} »",
    "rollupUnknownState": "La mise à jour d’état a ignoré l’état enfant inconnu « {state} » (pas dans stateRollupOrder)"
  },
  "hu": {
    "msgFactUpdated": "Elosztott idő frissítve {issueId} esetén: {details}",
    "errMappingMissing": "Az időkövetés leképezése nincs konfigurálva. Állítsa be a plugin beállításainál.",
    "errInvalidRole": "A „{type}“ típus egy inaktív/ismeretlen „{role}“ szerepkörhöz van rendelve.",
    "errFieldMissing": "Nincs fact-mező beállítva a „{role}“ szerepkörhöz. Állítsa be a Plugin beállítások → Mezők alatt.",
    "errMissingType": "Kérjük, adja meg a munka típusát!",
    "progressNoEstimate": "Rögzítve {label}: {fact}",
    "progressUnder90": "Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%)",
    "progressNearLimit": "Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%), ⚠️ A tervből kevesebb mint 10% van hátra! {advice}",
    "progressOverLimit": "Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%), 🚨 TÚLLÉPÉS! {advice}",
    "adviceAnalysis": "Itt az ideje feldarabolni a feladatot!",
    "adviceExecutor": "Kérjük, lépjen kapcsolatba az elemzővel!",
    "roleLabel_analysis": "elemző által",
    "roleLabel_testing": "tesztelésre",
    "roleLabel_devPlatform": "platform fejlesztésre",
    "roleLabel_devBack": "backend fejlesztésre",
    "roleLabel_devFront": "frontend fejlesztésre",
    "roleLabel_devIos": "iOS fejlesztésre",
    "roleLabel_devAndroid": "Android fejlesztésre",
    "roleLabel_devFs": "fullstack fejlesztésre",
    "roleLabel_devDb": "adatbázis fejlesztésre",
    "unitH": "ó",
    "unitM": "p",
    "cascadeUpdatedEst": "Becslések kaszkádosan frissítve a(z) {issueId} esetén: {details}",
    "cascadeUpdatedFact": "Munkaóra kaszkádosan frissítve a(z) {issueId} esetén: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "A közvetlen munkaidő-rögzítés konténer issue-kon (2. szint/3. szint) tilos. Időrögzítés csak a levél (gyermek) issue-kon engedélyezett.",
    "rollupUpdated": "Konténer állapota frissítve a(z) {issueId} esetén: {fromState} → {toState}",
    "rollupFloorHit": "Konténer állapota a(z) {issueId} esetén a minimumon «{floorState}» tartva (gyermekek minimuma «{minState}» lenne)",
    "rollupResolvedSkipped": "Állapot-frissítés kihagyva — {issueId} már «{state}» állapotban van",
    "rollupUnknownState": "Az állapot-frissítés figyelmen kívül hagyta az ismeretlen gyermekállapotot «{state}» (nincs a stateRollupOrder beállításban)"
  },
  "it": {
    "msgFactUpdated": "Tempo distribuito aggiornato per {issueId}: {details}",
    "errMappingMissing": "Il mapping del tracciamento del tempo non è configurato. Configura il mapping nelle impostazioni del plugin.",
    "errInvalidRole": "Il tipo «{type}» è mappato a un ruolo inattivo/sconosciuto «{role}».",
    "errFieldMissing": "Nessun campo fact configurato per il ruolo «{role}». Impostalo in Impostazioni plugin → Campi.",
    "errMissingType": "Specifica il tipo di lavoro!",
    "progressNoEstimate": "Registrato {label}: {fact}",
    "progressUnder90": "Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%)",
    "progressNearLimit": "Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%), ⚠️ Meno del 10% del piano rimanente! {advice}",
    "progressOverLimit": "Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%), 🚨 OLTRE IL LIMITE! {advice}",
    "adviceAnalysis": "È ora di decomporre il task!",
    "adviceExecutor": "Contatta l'analista!",
    "roleLabel_analysis": "dall'analista",
    "roleLabel_testing": "per il testing",
    "roleLabel_devPlatform": "per lo sviluppo piattaforma",
    "roleLabel_devBack": "per lo sviluppo backend",
    "roleLabel_devFront": "per lo sviluppo frontend",
    "roleLabel_devIos": "per lo sviluppo iOS",
    "roleLabel_devAndroid": "per lo sviluppo Android",
    "roleLabel_devFs": "per lo sviluppo fullstack",
    "roleLabel_devDb": "per lo sviluppo DB",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Stime aggiornate a cascata in {issueId}: {details}",
    "cascadeUpdatedFact": "Ore di lavoro aggiornate a cascata in {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "La registrazione diretta di work item su issue contenitore (livello 2/livello 3) è vietata. La registrazione del tempo è consentita solo sulle issue figlie foglia.",
    "rollupUpdated": "Stato del contenitore aggiornato per {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Stato del contenitore limitato al minimo «{floorState}» per {issueId} (il minimo dei figli sarebbe «{minState}»)",
    "rollupResolvedSkipped": "Aggiornamento dello stato ignorato — {issueId} è già nello stato «{state}»",
    "rollupUnknownState": "L’aggiornamento dello stato ha ignorato lo stato figlio sconosciuto «{state}» (non in stateRollupOrder)"
  },
  "ja": {
    "msgFactUpdated": "{issueId} の分配時間を更新しました: {details}",
    "errMappingMissing": "時間追跡のマッピングが構成されていません。プラグイン設定でマッピングを構成してください。",
    "errInvalidRole": "タイプ「{type}」は非アクティブ/不明なロール「{role}」にマッピングされています。",
    "errFieldMissing": "ロール「{role}」用の fact フィールドが構成されていません。プラグイン設定 → フィールドで設定してください。",
    "errMissingType": "作業タイプを指定してください!",
    "progressNoEstimate": "記録 {label}: {fact}",
    "progressUnder90": "記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)、⚠️ 計画の残り 10% 未満! {advice}",
    "progressOverLimit": "記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)、🚨 オーバー! {advice}",
    "adviceAnalysis": "タスクを分解する時間です!",
    "adviceExecutor": "アナリストに連絡してください!",
    "roleLabel_analysis": "アナリストにより",
    "roleLabel_testing": "テスト用",
    "roleLabel_devPlatform": "プラットフォーム開発用",
    "roleLabel_devBack": "バックエンド開発用",
    "roleLabel_devFront": "フロントエンド開発用",
    "roleLabel_devIos": "iOS 開発用",
    "roleLabel_devAndroid": "Android 開発用",
    "roleLabel_devFs": "フルスタック開発用",
    "roleLabel_devDb": "DB 開発用",
    "unitH": "時",
    "unitM": "分",
    "cascadeUpdatedEst": "{issueId} の見積もりがカスケードで更新されました: {details}",
    "cascadeUpdatedFact": "{issueId} の作業時間がカスケードで更新されました: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "コンテナ issue (第2階層/第3階層) への直接の作業時間記録は禁止されています。時間記録はリーフ (子) issue でのみ行ってください。",
    "rollupUpdated": "コンテナの状態を更新しました（{issueId}）: {fromState} → {toState}",
    "rollupFloorHit": "コンテナの状態を最小値「{floorState}」に保持しました（{issueId}、子の最小は「{minState}」）",
    "rollupResolvedSkipped": "状態の集約をスキップ — {issueId} は既に「{state}」状態です",
    "rollupUnknownState": "状態の集約が不明な子ステート「{state}」を無視しました（stateRollupOrder に未登録）"
  },
  "ko": {
    "msgFactUpdated": "{issueId}의 분배 시간이 업데이트되었습니다: {details}",
    "errMappingMissing": "시간 추적 매핑이 구성되지 않았습니다. 플러그인 설정에서 매핑을 구성하세요.",
    "errInvalidRole": "타입 \"{type}\"이(가) 비활성/알 수 없는 역할 \"{role}\"에 매핑되었습니다.",
    "errFieldMissing": "역할 \"{role}\"에 대한 fact 필드가 구성되지 않았습니다. 플러그인 설정 → 필드에서 설정하세요.",
    "errMissingType": "작업 유형을 지정하세요!",
    "progressNoEstimate": "기록 {label}: {fact}",
    "progressUnder90": "기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%), ⚠️ 계획의 10% 미만 남음! {advice}",
    "progressOverLimit": "기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%), 🚨 초과! {advice}",
    "adviceAnalysis": "작업을 분해할 시간입니다!",
    "adviceExecutor": "분석가에게 연락하세요!",
    "roleLabel_analysis": "분석가에 의해",
    "roleLabel_testing": "테스트용",
    "roleLabel_devPlatform": "플랫폼 개발용",
    "roleLabel_devBack": "백엔드 개발용",
    "roleLabel_devFront": "프론트엔드 개발용",
    "roleLabel_devIos": "iOS 개발용",
    "roleLabel_devAndroid": "Android 개발용",
    "roleLabel_devFs": "풀스택 개발용",
    "roleLabel_devDb": "DB 개발용",
    "unitH": "시",
    "unitM": "분",
    "cascadeUpdatedEst": "{issueId}의 추정치가 캐스케이드로 업데이트되었습니다: {details}",
    "cascadeUpdatedFact": "{issueId}의 작업 시간이 캐스케이드로 업데이트되었습니다: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "컨테이너 issue(2단계/3단계)에서 직접 work item 기록은 금지됩니다. 시간 기록은 리프(자식) issue에서만 허용됩니다.",
    "rollupUpdated": "컨테이너 상태가 업데이트되었습니다 ({issueId}): {fromState} → {toState}",
    "rollupFloorHit": "컨테이너 상태를 최소값 「{floorState}」(으)로 유지했습니다 ({issueId}, 자식 최소는 「{minState}」)",
    "rollupResolvedSkipped": "상태 롤업 건너뜀 — {issueId}은(는) 이미 「{state}」 상태입니다",
    "rollupUnknownState": "상태 롤업이 알 수 없는 자식 상태 「{state}」을(를) 무시했습니다 (stateRollupOrder에 없음)"
  },
  "nl": {
    "msgFactUpdated": "Verdeelde tijd bijgewerkt voor {issueId}: {details}",
    "errMappingMissing": "Tijdregistratie-toewijzing is niet geconfigureerd. Configureer de toewijzing in de plugin-instellingen.",
    "errInvalidRole": "Type \"{type}\" is toegewezen aan een inactieve/onbekende rol \"{role}\".",
    "errFieldMissing": "Geen fact-veld geconfigureerd voor rol \"{role}\". Stel het in via Plugin-instellingen → Velden.",
    "errMissingType": "Geef het werktype op!",
    "progressNoEstimate": "Geregistreerd {label}: {fact}",
    "progressUnder90": "Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%), ⚠️ Minder dan 10% van het plan over! {advice}",
    "progressOverLimit": "Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%), 🚨 OVERSCHREDEN! {advice}",
    "adviceAnalysis": "Tijd om de taak op te splitsen!",
    "adviceExecutor": "Neem contact op met de analist!",
    "roleLabel_analysis": "door analist",
    "roleLabel_testing": "voor testen",
    "roleLabel_devPlatform": "voor platformontwikkeling",
    "roleLabel_devBack": "voor backend-ontwikkeling",
    "roleLabel_devFront": "voor frontend-ontwikkeling",
    "roleLabel_devIos": "voor iOS-ontwikkeling",
    "roleLabel_devAndroid": "voor Android-ontwikkeling",
    "roleLabel_devFs": "voor fullstack-ontwikkeling",
    "roleLabel_devDb": "voor DB-ontwikkeling",
    "unitH": "u",
    "unitM": "m",
    "cascadeUpdatedEst": "Schattingen in cascade bijgewerkt in {issueId}: {details}",
    "cascadeUpdatedFact": "Werkuren in cascade bijgewerkt in {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Direct registreren van work items op containerissues (niveau 2/niveau 3) is verboden. Tijdregistratie is alleen toegestaan op blad (child) issues.",
    "rollupUpdated": "Containerstatus bijgewerkt voor {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Containerstatus voor {issueId} op minimum «{floorState}» gehouden (minimum van onderliggende issues zou «{minState}» zijn)",
    "rollupResolvedSkipped": "Status-rollup overgeslagen — {issueId} heeft al de status «{state}»",
    "rollupUnknownState": "Status-rollup negeerde onbekende onderliggende status «{state}» (niet in stateRollupOrder)"
  },
  "pl": {
    "msgFactUpdated": "Rozdysponowany czas zaktualizowany dla {issueId}: {details}",
    "errMappingMissing": "Mapowanie śledzenia czasu nie jest skonfigurowane. Skonfiguruj mapowanie w ustawieniach pluginu.",
    "errInvalidRole": "Typ „{type}” jest przypisany do nieaktywnej/nieznanej roli „{role}”.",
    "errFieldMissing": "Brak skonfigurowanego pola fact dla roli „{role}”. Ustaw je w Ustawieniach pluginu → Pola.",
    "errMissingType": "Podaj typ pracy!",
    "progressNoEstimate": "Zarejestrowano {label}: {fact}",
    "progressUnder90": "Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%), ⚠️ Pozostało mniej niż 10% planu! {advice}",
    "progressOverLimit": "Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%), 🚨 PRZEKROCZENIE! {advice}",
    "adviceAnalysis": "Czas podzielić zadanie!",
    "adviceExecutor": "Skontaktuj się z analitykiem!",
    "roleLabel_analysis": "przez analityka",
    "roleLabel_testing": "na testowanie",
    "roleLabel_devPlatform": "na rozwój platformy",
    "roleLabel_devBack": "na rozwój backendu",
    "roleLabel_devFront": "na rozwój frontendu",
    "roleLabel_devIos": "na rozwój iOS",
    "roleLabel_devAndroid": "na rozwój Android",
    "roleLabel_devFs": "na rozwój fullstack",
    "roleLabel_devDb": "na rozwój BD",
    "unitH": "g",
    "unitM": "m",
    "cascadeUpdatedEst": "Szacunki zaktualizowane kaskadowo w {issueId}: {details}",
    "cascadeUpdatedFact": "Godziny pracy zaktualizowane kaskadowo w {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Bezpośrednie rejestrowanie work itemów na issue kontenerowych (poziom 2/poziom 3) jest zabronione. Rejestrowanie czasu jest dozwolone tylko na liściach (issue podrzędnych).",
    "rollupUpdated": "Status kontenera zaktualizowany dla {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Status kontenera utrzymany na minimum «{floorState}» dla {issueId} (minimum dzieci wynosiłoby «{minState}»)",
    "rollupResolvedSkipped": "Aktualizacja statusu pominięta — {issueId} ma już status «{state}»",
    "rollupUnknownState": "Aktualizacja statusu zignorowała nieznany status dziecka «{state}» (nie ma w stateRollupOrder)"
  },
  "pt": {
    "msgFactUpdated": "Tempo distribuído atualizado para {issueId}: {details}",
    "errMappingMissing": "O mapeamento de rastreamento de tempo não está configurado. Configure o mapeamento nas configurações do plugin.",
    "errInvalidRole": "O tipo «{type}» está mapeado para uma função inativa/desconhecida «{role}».",
    "errFieldMissing": "Nenhum campo fact configurado para a função «{role}». Defina-o em Configurações do plugin → Campos.",
    "errMissingType": "Especifique o tipo de trabalho!",
    "progressNoEstimate": "Registrado {label}: {fact}",
    "progressUnder90": "Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%)",
    "progressNearLimit": "Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%), ⚠️ Menos de 10% do plano restante! {advice}",
    "progressOverLimit": "Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%), 🚨 EXCEDIDO! {advice}",
    "adviceAnalysis": "É hora de decompor a tarefa!",
    "adviceExecutor": "Entre em contato com o analista!",
    "roleLabel_analysis": "pelo analista",
    "roleLabel_testing": "para testes",
    "roleLabel_devPlatform": "para desenvolvimento de plataforma",
    "roleLabel_devBack": "para desenvolvimento backend",
    "roleLabel_devFront": "para desenvolvimento frontend",
    "roleLabel_devIos": "para desenvolvimento iOS",
    "roleLabel_devAndroid": "para desenvolvimento Android",
    "roleLabel_devFs": "para desenvolvimento fullstack",
    "roleLabel_devDb": "para desenvolvimento de BD",
    "unitH": "h",
    "unitM": "m",
    "cascadeUpdatedEst": "Estimativas atualizadas em cascata em {issueId}: {details}",
    "cascadeUpdatedFact": "Horas de trabalho atualizadas em cascata em {issueId}: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "O registro direto de work items em issues contêineres (nível 2/nível 3) é proibido. O registro de tempo é permitido apenas em issues filhas folha.",
    "rollupUpdated": "Estado do contêiner atualizado para {issueId}: {fromState} → {toState}",
    "rollupFloorHit": "Estado do contêiner limitado ao mínimo «{floorState}» para {issueId} (o mínimo dos filhos seria «{minState}»)",
    "rollupResolvedSkipped": "Atualização de estado ignorada — {issueId} já está no estado «{state}»",
    "rollupUnknownState": "A atualização de estado ignorou o estado filho desconhecido «{state}» (não está em stateRollupOrder)"
  },
  "tr": {
    "msgFactUpdated": "{issueId} için dağıtılan zaman güncellendi: {details}",
    "errMappingMissing": "Zaman takibi eşleştirmesi yapılandırılmamış. Eklenti ayarlarında eşleştirmeyi yapılandırın.",
    "errInvalidRole": "«{type}» türü etkin olmayan/bilinmeyen «{role}» rolüne eşlendi.",
    "errFieldMissing": "«{role}» rolü için fact alanı yapılandırılmamış. Eklenti ayarları → Alanlar bölümünde ayarlayın.",
    "errMissingType": "Lütfen iş türünü belirtin!",
    "progressNoEstimate": "Kaydedildi {label}: {fact}",
    "progressUnder90": "Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%), ⚠️ Planın %10'undan azı kaldı! {advice}",
    "progressOverLimit": "Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%), 🚨 LİMİT AŞIMI! {advice}",
    "adviceAnalysis": "Görevi parçalama zamanı!",
    "adviceExecutor": "Lütfen analistle iletişime geçin!",
    "roleLabel_analysis": "analist tarafından",
    "roleLabel_testing": "test için",
    "roleLabel_devPlatform": "platform geliştirme için",
    "roleLabel_devBack": "backend geliştirme için",
    "roleLabel_devFront": "frontend geliştirme için",
    "roleLabel_devIos": "iOS geliştirme için",
    "roleLabel_devAndroid": "Android geliştirme için",
    "roleLabel_devFs": "fullstack geliştirme için",
    "roleLabel_devDb": "VT geliştirme için",
    "unitH": "s",
    "unitM": "d",
    "cascadeUpdatedEst": "{issueId} içindeki tahminler kademeli olarak güncellendi: {details}",
    "cascadeUpdatedFact": "{issueId} içindeki çalışma saatleri kademeli olarak güncellendi: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "Kapsayıcı issue'larda (2. seviye/3. seviye) doğrudan work item kaydı yasaktır. Zaman kaydı yalnızca yaprak (alt) issue'larda izinlidir.",
    "rollupUpdated": "Konteyner durumu güncellendi ({issueId}): {fromState} → {toState}",
    "rollupFloorHit": "Konteyner durumu minimumda «{floorState}» tutuldu ({issueId}, alt öğelerin minimumu «{minState}» olurdu)",
    "rollupResolvedSkipped": "Durum toplaması atlandı — {issueId} zaten «{state}» durumunda",
    "rollupUnknownState": "Durum toplaması bilinmeyen alt durumu «{state}» yok saydı (stateRollupOrder içinde değil)"
  },
  "zh": {
    "msgFactUpdated": "{issueId} 的分配时间已更新: {details}",
    "errMappingMissing": "时间跟踪映射未配置。请在插件设置中配置映射。",
    "errInvalidRole": "类型「{type}」映射到非活动/未知角色「{role}」。",
    "errFieldMissing": "角色「{role}」未配置 fact 字段。请在插件设置 → 字段中设置。",
    "errMissingType": "请指定工作类型!",
    "progressNoEstimate": "已记录 {label}: {fact}",
    "progressUnder90": "已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%)",
    "progressNearLimit": "已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%),⚠️ 计划剩余不足 10%! {advice}",
    "progressOverLimit": "已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%),🚨 超额! {advice}",
    "adviceAnalysis": "是时候分解任务了!",
    "adviceExecutor": "请联系分析师!",
    "roleLabel_analysis": "由分析师",
    "roleLabel_testing": "测试",
    "roleLabel_devPlatform": "平台开发",
    "roleLabel_devBack": "后端开发",
    "roleLabel_devFront": "前端开发",
    "roleLabel_devIos": "iOS 开发",
    "roleLabel_devAndroid": "Android 开发",
    "roleLabel_devFs": "全栈开发",
    "roleLabel_devDb": "数据库开发",
    "unitH": "时",
    "unitM": "分",
    "cascadeUpdatedEst": "{issueId} 中的估算已级联更新: {details}",
    "cascadeUpdatedFact": "{issueId} 中的工作时间已级联更新: {details}",
    "cascadeFieldChange": "{field}: {from} → {to}",
    "errForbidContainer": "禁止在容器 issue(第 2 级/第 3 级)上直接登记 work item。时间登记仅允许在叶子(子)issue 上进行。",
    "rollupUpdated": "容器状态已更新（{issueId}）：{fromState} → {toState}",
    "rollupFloorHit": "容器状态保持在最小值「{floorState}」（{issueId}，子任务最小为「{minState}」）",
    "rollupResolvedSkipped": "状态汇总已跳过 — {issueId} 已处于「{state}」状态",
    "rollupUnknownState": "状态汇总忽略了未知的子状态「{state}」（不在 stateRollupOrder 中）"
  }
};

function _normLang(raw) {
  if (typeof raw !== 'string') return null;
  /* 'ru-RU' / 'ru_RU' / 'RU' → 'ru'. */
  const lower = raw.toLowerCase().split(/[-_]/)[0];
  return lower || null;
}

function pickLocale(ctx, settings) {
  /* Primary — project-level setting (детерминировано, всегда заполнено
     если settings UI хоть раз сохранялся). */
  if (settings && settings.defaultLang) {
    const norm = _normLang(settings.defaultLang);
    if (norm && WF_I18N[norm]) return norm;
  }
  /* Secondary — locale текущего юзера (после нормализации). */
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

/* Handoff-кэш guard→action (аудит P-6): guard и action одного срабатывания
   парсили один и тот же многокилобайтный settings-блоб дважды. Guard кладёт
   распарсенное через stashSettings, action забирает через takeSettings;
   стейл-окна нет — guard и action выполняются в одной транзакции события.
   Слот один на модуль: ключ — референс issue; pop чужим правилом того же
   события отдаёт тот же распарсенный объект (безвредно), mismatch — re-read. */
var _settingsStash = null;

function stashSettings(issue, settings) {
  _settingsStash = { issue: issue, s: settings };
}

function takeSettings(issue) {
  const st = _settingsStash;
  _settingsStash = null;
  if (st && issue && st.issue === issue) return st.s;
  return readSettings(issue);
}

/* Часы в рабочем дне — из settings.hoursPerDay (admin-тир, дефолт 8); каждое
   правило выставляет в начале action после takeSettings. Scripting API НЕ отдаёт
   WorkTimeSettings инстанса (только REST-админка; сами JB в доках хардкодят
   константы) — норма проекта честнее.
   ponytail: рабочая неделя = 5 дней константой; понадобится иная — заводить settings-ключ. */
var WF_HOURS_PER_DAY = 8;
function _normHoursPerDay(v) {
  v = Number(v);
  return (isFinite(v) && v >= 1 && v <= 24) ? v : 8;
}
function setHoursPerDay(v) {
  WF_HOURS_PER_DAY = _normHoursPerDay(v);
}

function getMinutes(period) {
  if (!period) return 0;
  const weeks = period.getWeeks ? (period.getWeeks() || 0) : 0;
  const days = period.getDays ? (period.getDays() || 0) : 0;
  const hours = period.getHours ? (period.getHours() || 0) : 0;
  const minutes = period.getMinutes ? (period.getMinutes() || 0) : 0;
  return weeks * 5 * WF_HOURS_PER_DAY * 60 + days * WF_HOURS_PER_DAY * 60 + hours * 60 + minutes;
}

function formatMinutes(m) {
  const mm = m || 0;
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return h + 'h ' + r + 'm';
}

/* role-key → settings-key, под которым лежит имя реального custom-field в YT.
   Имена backend whitelist'а: backend-core.js ALLOWED_SETTINGS_KEYS. */
const FIELD_FACT_KEY_BY_ROLE = {
  analysis:    'fieldFactAnalysis',
  testing:     'fieldFactTesting',
  devPlatform: 'fieldFactDevPlatform',
  devBack:     'fieldFactDevBack',
  devFront:    'fieldFactDevFront',
  devIos:      'fieldFactDevIos',
  devAndroid:  'fieldFactDevAndroid',
  devFs:       'fieldFactDevFullstack',
  devDb:       'fieldFactDevDb'
};

/* role-key → settings-key plan-поля. Имена согласованы с ALL_ROLES
   в widgets/main/src/core.js. */
const FIELD_EST_KEY_BY_ROLE = {
  analysis:    'fieldAnalysis',
  testing:     'fieldTesting',
  devPlatform: 'fieldDevPlatform',
  devBack:     'fieldDevBack',
  devFront:    'fieldDevFront',
  devIos:      'fieldDevIos',
  devAndroid:  'fieldDevAndroid',
  devFs:       'fieldDevFullstack',
  devDb:       'fieldDevDb'
};

/* Имя kind-значения issue. settings.cascadeKindField задаёт имя field'а
   (default 'Type'). Возвращаемый объект может быть либо bundle-element с
   .name, либо string — обрабатываем оба. */
function kindName(issue, settings) {
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

function firstLink(issue, linkName) {
  if (!issue || !issue.links) return null;
  const coll = issue.links[linkName];
  if (!coll) return null;
  if (typeof coll.first === 'function') {
    try { return coll.first(); } catch (_) { return null; }
  }
  return null;
}

function collectChildren(parent, outwardLinkName) {
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

/* Best-effort «коллекция непуста» для YT-collections разных билдов
   (isNotEmpty / isEmpty / size / length). */
function collNotEmpty(coll) {
  if (!coll) return false;
  if (typeof coll.isNotEmpty === 'function') return coll.isNotEmpty();
  if (typeof coll.isEmpty === 'function') return !coll.isEmpty();
  if (typeof coll.size === 'number') return coll.size > 0;
  if (typeof coll.length === 'number') return coll.length > 0;
  return false;
}

/* Экспорт через exports.* (module может быть undefined в YT-рантайме —
   см. test-only guard'ы в правилах). */
exports.WF_I18N                = WF_I18N;
exports.FALLBACK_LANG          = FALLBACK_LANG;
exports.pickLocale             = pickLocale;
exports.tWf                    = tWf;
exports.readSettings           = readSettings;
exports.stashSettings          = stashSettings;
exports.takeSettings           = takeSettings;
exports.setHoursPerDay         = setHoursPerDay;
exports.getMinutes             = getMinutes;
exports.formatMinutes          = formatMinutes;
exports.FIELD_FACT_KEY_BY_ROLE = FIELD_FACT_KEY_BY_ROLE;
exports.FIELD_EST_KEY_BY_ROLE  = FIELD_EST_KEY_BY_ROLE;
exports.kindName               = kindName;
exports.firstLink              = firstLink;
exports.collectChildren        = collectChildren;
exports.collNotEmpty           = collNotEmpty;
