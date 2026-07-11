/**
 * Smart Sprint Planner — Differentiated Time Accounting (DTA) workflow rule.
 *
 * v1.2.1 — Acceptance hot-fix on top of v1.2.0:
 *   Bug A — workflow.message выходило на EN при русской локали юзера.
 *           ctx.currentUser.profile.locale.language в YT scripting workflow
 *           context часто либо undefined, либо в формате 'ru-RU' (а ключи
 *           словаря 'ru'). Сделали primary settings.defaultLang (project-level,
 *           всегда есть из widget settings), secondary — нормализованный
 *           currentUser.profile.locale.language (берём префикс до '-').
 *   Bug B — fact-поля не обновлялись после списания трудозатрат.
 *           Старый fieldFactName(role) синтезировал имя 'fact'+Role
 *           (например, 'factDevFront'), которого в реальном YT-проекте нет.
 *           Имя custom-field, в которое надо писать, уже хранится в
 *           settings[FIELD_FACT_KEY_BY_ROLE[role]] (например,
 *           settings.fieldFactDevFront = 'Факт разработка ФРОНТ ЧЧ') —
 *           заполняется из settings UI «Поля → Факт» при сохранении.
 *           Теперь читаем оттуда; синтетический fallback убран.
 *   Bug C — Issue.onChange в некоторых сборках YT 2024.3 не срабатывает
 *           на add/remove workItems. Добавили второй экспорт через
 *           IssueWorkItem.onChange — теперь любой YT-runtime, поддерживающий
 *           хотя бы один из двух событий, прогоняет агрегацию.
 *           Идемпотентность через cur-vs-target diff делает повторные
 *           срабатывания безопасными.
 *
 * Архитектурные инварианты (RESOLVED A-1..A-6, B-6):
 *   A-1: источник = `issue.workItems` (TimeTracking-логи).
 *   A-2: маппинг хранится в `ssp_settings.workItemTypeMapping`; constraint
 *        «один type → одна роль» обеспечивается JSON-object shape'ом.
 *   A-3: generic — поддерживает любое число активных ролей (читает
 *        settings.activeRoles + workItemTypeMapping).
 *   A-4: parent/child иерархия (Story/Epic) исключена.
 *   A-5: ИИ-экономия удалена.
 *   A-6: workflow поставляется в корне YT-app zip (паттерн VK Notifier).
 *   B-6: workflow.message локализуется (см. Bug A выше).
 */
const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');

const SETTINGS_KEY = 'ssp_settings';
const FALLBACK_LANG = 'en';

/* role-key → settings-key, под которым лежит имя реального custom-field в YT.
   Имена backend whitelist'а: backend-project.js ALLOWED_SETTINGS_KEYS. */
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

/* role-key → settings-key plan-поля (для notifyProgress / процент план/факт).
   Имена согласованы с ALL_ROLES в widgets/main/src/core.js. */
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

const WF_I18N = {
  en: {
    msgFactUpdated: 'Distributed time updated for {issueId}: {details}',
    errMappingMissing: 'Time accounting mapping is not configured. Configure mapping in plugin settings.',
    errInvalidRole: 'Type "{type}" is mapped to inactive or unknown role "{role}".',
    errFieldMissing: 'No fact-field configured for role "{role}". Set it in plugin settings → Fields.',
    /* v1.2.4: mandatory type-check on add/edit work-item. */
    errMissingType: 'Please specify the work item type!',
    /* v1.2.4: notifyProgress (plan/fact ratio) — three thresholds. */
    progressNoEstimate: 'Logged {label}: {fact}',
    progressUnder90:    'Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%), ⚠️ Less than 10% of plan remaining! {advice}',
    progressOverLimit:  'Logged {label}: {fact} of planned {planHours}{unitH} ({percent}%), 🚨 OVER LIMIT! {advice}',
    adviceAnalysis: 'Time to break the issue down!',
    adviceExecutor: 'Please contact the analyst!',
    /* role labels — substitute into «Logged {label}: …» template. */
    'roleLabel_analysis':    'by analyst',
    'roleLabel_testing':     'for testing',
    'roleLabel_devPlatform': 'for platform development',
    'roleLabel_devBack':     'for backend development',
    'roleLabel_devFront':    'for frontend development',
    'roleLabel_devIos':      'for iOS development',
    'roleLabel_devAndroid':  'for Android development',
    'roleLabel_devFs':       'for fullstack development',
    'roleLabel_devDb':       'for DB development',
    /* time units (compact). */
    unitH: 'h',
    unitM: 'm'
  },
  ru: {
    msgFactUpdated: 'Распределение времени обновлено для {issueId}: {details}',
    errMappingMissing: 'Маппинг учёта времени не настроен. Настройте маппинг в настройках плагина.',
    errInvalidRole: 'Тип «{type}» сопоставлен с неактивной/неизвестной ролью «{role}».',
    errFieldMissing: 'Не задано фактическое поле для роли «{role}». Укажите его в настройках плагина → Поля.',
    errMissingType: 'Укажите тип работы!',
    progressNoEstimate: 'Выработано {label}: {fact}',
    progressUnder90:    'Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%), ⚠️ Остаток менее 10%! {advice}',
    progressOverLimit:  'Выработано {label}: {fact} из плановых {planHours}{unitH} ({percent}%), 🚨 ПЕРЕЛИМИТ! {advice}',
    adviceAnalysis: 'Пора декомпозировать задачу!',
    adviceExecutor: 'Необходимо связаться с аналитиком!',
    'roleLabel_analysis':    'аналитиком',
    'roleLabel_testing':     'на тестирование',
    'roleLabel_devPlatform': 'на платформенную разработку',
    'roleLabel_devBack':     'на backend-разработку',
    'roleLabel_devFront':    'на frontend-разработку',
    'roleLabel_devIos':      'на iOS-разработку',
    'roleLabel_devAndroid':  'на Android-разработку',
    'roleLabel_devFs':       'на fullstack-разработку',
    'roleLabel_devDb':       'на СУБД-разработку',
    unitH: 'ч',
    unitM: 'м'
  },
  cs: {
    msgFactUpdated: 'Distribuovaný čas aktualizován pro {issueId}: {details}',
    errMappingMissing: 'Mapování sledování času není nakonfigurováno. Nakonfigurujte mapování v nastavení pluginu.',
    errInvalidRole: 'Typ „{type}“ je přiřazen neaktivní/neznámé roli „{role}“.',
    errFieldMissing: 'Pro roli „{role}“ není nakonfigurováno fact-pole. Nastavte ho v Nastavení pluginu → Pole.',
    errMissingType: 'Zadejte typ práce!',
    progressNoEstimate: 'Vykázáno {label}: {fact}',
    progressUnder90:    'Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%), ⚠️ Zbývá méně než 10%! {advice}',
    progressOverLimit:  'Vykázáno {label}: {fact} z plánovaných {planHours}{unitH} ({percent}%), 🚨 PŘEKROČENÍ LIMITU! {advice}',
    adviceAnalysis: 'Je čas dekompozovat úkol!',
    adviceExecutor: 'Kontaktujte analytika!',
    'roleLabel_analysis':    'analytikem',
    'roleLabel_testing':     'na testování',
    'roleLabel_devPlatform': 'na platformový vývoj',
    'roleLabel_devBack':     'na backend vývoj',
    'roleLabel_devFront':    'na frontend vývoj',
    'roleLabel_devIos':      'na iOS vývoj',
    'roleLabel_devAndroid':  'na Android vývoj',
    'roleLabel_devFs':       'na fullstack vývoj',
    'roleLabel_devDb':       'na vývoj DB',
    unitH: 'h',
    unitM: 'm'
  },
  de: {
    msgFactUpdated: 'Verteilte Zeit aktualisiert für {issueId}: {details}',
    errMappingMissing: 'Zeiterfassungs-Mapping ist nicht konfiguriert. Konfigurieren Sie das Mapping in den Plugin-Einstellungen.',
    errInvalidRole: 'Typ „{type}“ ist einer inaktiven/unbekannten Rolle „{role}“ zugeordnet.',
    errFieldMissing: 'Für Rolle „{role}“ ist kein Fact-Feld konfiguriert. Legen Sie es in Plugin-Einstellungen → Felder fest.',
    errMissingType: 'Bitte geben Sie den Arbeitstyp an!',
    progressNoEstimate: 'Erfasst {label}: {fact}',
    progressUnder90:    'Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%), ⚠️ Weniger als 10% des Plans übrig! {advice}',
    progressOverLimit:  'Erfasst {label}: {fact} von geplanten {planHours}{unitH} ({percent}%), 🚨 ÜBERSCHRITTEN! {advice}',
    adviceAnalysis: 'Zeit, das Issue aufzubrechen!',
    adviceExecutor: 'Bitte kontaktieren Sie den Analysten!',
    'roleLabel_analysis':    'durch Analyst',
    'roleLabel_testing':     'für Test',
    'roleLabel_devPlatform': 'für Plattformentwicklung',
    'roleLabel_devBack':     'für Backend-Entwicklung',
    'roleLabel_devFront':    'für Frontend-Entwicklung',
    'roleLabel_devIos':      'für iOS-Entwicklung',
    'roleLabel_devAndroid':  'für Android-Entwicklung',
    'roleLabel_devFs':       'für Fullstack-Entwicklung',
    'roleLabel_devDb':       'für DB-Entwicklung',
    unitH: 'h',
    unitM: 'm'
  },
  es: {
    msgFactUpdated: 'Tiempo distribuido actualizado para {issueId}: {details}',
    errMappingMissing: 'El mapeo de seguimiento de tiempo no está configurado. Configure el mapeo en los ajustes del plugin.',
    errInvalidRole: 'El tipo «{type}» está asignado a un rol inactivo/desconocido «{role}».',
    errFieldMissing: 'No hay campo fact configurado para el rol «{role}». Establézcalo en Ajustes del plugin → Campos.',
    errMissingType: '¡Especifique el tipo de trabajo!',
    progressNoEstimate: 'Registrado {label}: {fact}',
    progressUnder90:    'Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%), ⚠️ ¡Queda menos del 10% del plan! {advice}',
    progressOverLimit:  'Registrado {label}: {fact} de los planificados {planHours}{unitH} ({percent}%), 🚨 ¡SOBRELÍMITE! {advice}',
    adviceAnalysis: '¡Es hora de descomponer la tarea!',
    adviceExecutor: '¡Póngase en contacto con el analista!',
    'roleLabel_analysis':    'por analista',
    'roleLabel_testing':     'para pruebas',
    'roleLabel_devPlatform': 'para desarrollo de plataforma',
    'roleLabel_devBack':     'para desarrollo backend',
    'roleLabel_devFront':    'para desarrollo frontend',
    'roleLabel_devIos':      'para desarrollo iOS',
    'roleLabel_devAndroid':  'para desarrollo Android',
    'roleLabel_devFs':       'para desarrollo fullstack',
    'roleLabel_devDb':       'para desarrollo de BD',
    unitH: 'h',
    unitM: 'm'
  },
  fr: {
    msgFactUpdated: 'Temps distribué mis à jour pour {issueId} : {details}',
    errMappingMissing: 'Le mappage de suivi du temps n\'est pas configuré. Configurez le mappage dans les paramètres du plugin.',
    errInvalidRole: 'Le type « {type} » est mappé sur un rôle inactif/inconnu « {role} ».',
    errFieldMissing: 'Aucun champ fact configuré pour le rôle « {role} ». Définissez-le dans Paramètres du plugin → Champs.',
    errMissingType: 'Veuillez spécifier le type de travail !',
    progressNoEstimate: 'Enregistré {label} : {fact}',
    progressUnder90:    'Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%)',
    progressNearLimit:  'Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%), ⚠️ Moins de 10% du plan restant ! {advice}',
    progressOverLimit:  'Enregistré {label} : {fact} sur {planHours}{unitH} prévus ({percent}%), 🚨 DÉPASSEMENT ! {advice}',
    adviceAnalysis: 'Il est temps de décomposer la tâche !',
    adviceExecutor: 'Veuillez contacter l\'analyste !',
    'roleLabel_analysis':    'par l\'analyste',
    'roleLabel_testing':     'pour les tests',
    'roleLabel_devPlatform': 'pour le développement plateforme',
    'roleLabel_devBack':     'pour le développement backend',
    'roleLabel_devFront':    'pour le développement frontend',
    'roleLabel_devIos':      'pour le développement iOS',
    'roleLabel_devAndroid':  'pour le développement Android',
    'roleLabel_devFs':       'pour le développement fullstack',
    'roleLabel_devDb':       'pour le développement BDD',
    unitH: 'h',
    unitM: 'm'
  },
  hu: {
    msgFactUpdated: 'Elosztott idő frissítve {issueId} esetén: {details}',
    errMappingMissing: 'Az időkövetés leképezése nincs konfigurálva. Állítsa be a plugin beállításainál.',
    errInvalidRole: 'A „{type}“ típus egy inaktív/ismeretlen „{role}“ szerepkörhöz van rendelve.',
    errFieldMissing: 'Nincs fact-mező beállítva a „{role}“ szerepkörhöz. Állítsa be a Plugin beállítások → Mezők alatt.',
    errMissingType: 'Kérjük, adja meg a munka típusát!',
    progressNoEstimate: 'Rögzítve {label}: {fact}',
    progressUnder90:    'Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%)',
    progressNearLimit:  'Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%), ⚠️ A tervből kevesebb mint 10% van hátra! {advice}',
    progressOverLimit:  'Rögzítve {label}: {fact} a tervezett {planHours}{unitH}-ból ({percent}%), 🚨 TÚLLÉPÉS! {advice}',
    adviceAnalysis: 'Itt az ideje feldarabolni a feladatot!',
    adviceExecutor: 'Kérjük, lépjen kapcsolatba az elemzővel!',
    'roleLabel_analysis':    'elemző által',
    'roleLabel_testing':     'tesztelésre',
    'roleLabel_devPlatform': 'platform fejlesztésre',
    'roleLabel_devBack':     'backend fejlesztésre',
    'roleLabel_devFront':    'frontend fejlesztésre',
    'roleLabel_devIos':      'iOS fejlesztésre',
    'roleLabel_devAndroid':  'Android fejlesztésre',
    'roleLabel_devFs':       'fullstack fejlesztésre',
    'roleLabel_devDb':       'adatbázis fejlesztésre',
    unitH: 'ó',
    unitM: 'p'
  },
  it: {
    msgFactUpdated: 'Tempo distribuito aggiornato per {issueId}: {details}',
    errMappingMissing: 'Il mapping del tracciamento del tempo non è configurato. Configura il mapping nelle impostazioni del plugin.',
    errInvalidRole: 'Il tipo «{type}» è mappato a un ruolo inattivo/sconosciuto «{role}».',
    errFieldMissing: 'Nessun campo fact configurato per il ruolo «{role}». Impostalo in Impostazioni plugin → Campi.',
    errMissingType: 'Specifica il tipo di lavoro!',
    progressNoEstimate: 'Registrato {label}: {fact}',
    progressUnder90:    'Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%)',
    progressNearLimit:  'Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%), ⚠️ Meno del 10% del piano rimanente! {advice}',
    progressOverLimit:  'Registrato {label}: {fact} su {planHours}{unitH} pianificate ({percent}%), 🚨 OLTRE IL LIMITE! {advice}',
    adviceAnalysis: 'È ora di decomporre il task!',
    adviceExecutor: 'Contatta l\'analista!',
    'roleLabel_analysis':    'dall\'analista',
    'roleLabel_testing':     'per il testing',
    'roleLabel_devPlatform': 'per lo sviluppo piattaforma',
    'roleLabel_devBack':     'per lo sviluppo backend',
    'roleLabel_devFront':    'per lo sviluppo frontend',
    'roleLabel_devIos':      'per lo sviluppo iOS',
    'roleLabel_devAndroid':  'per lo sviluppo Android',
    'roleLabel_devFs':       'per lo sviluppo fullstack',
    'roleLabel_devDb':       'per lo sviluppo DB',
    unitH: 'h',
    unitM: 'm'
  },
  ja: {
    msgFactUpdated: '{issueId} の分配時間を更新しました: {details}',
    errMappingMissing: '時間追跡のマッピングが構成されていません。プラグイン設定でマッピングを構成してください。',
    errInvalidRole: 'タイプ「{type}」は非アクティブ/不明なロール「{role}」にマッピングされています。',
    errFieldMissing: 'ロール「{role}」用の fact フィールドが構成されていません。プラグイン設定 → フィールドで設定してください。',
    errMissingType: '作業タイプを指定してください!',
    progressNoEstimate: '記録 {label}: {fact}',
    progressUnder90:    '記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)',
    progressNearLimit:  '記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)、⚠️ 計画の残り 10% 未満! {advice}',
    progressOverLimit:  '記録 {label}: {fact} / 計画 {planHours}{unitH} ({percent}%)、🚨 オーバー! {advice}',
    adviceAnalysis: 'タスクを分解する時間です!',
    adviceExecutor: 'アナリストに連絡してください!',
    'roleLabel_analysis':    'アナリストにより',
    'roleLabel_testing':     'テスト用',
    'roleLabel_devPlatform': 'プラットフォーム開発用',
    'roleLabel_devBack':     'バックエンド開発用',
    'roleLabel_devFront':    'フロントエンド開発用',
    'roleLabel_devIos':      'iOS 開発用',
    'roleLabel_devAndroid':  'Android 開発用',
    'roleLabel_devFs':       'フルスタック開発用',
    'roleLabel_devDb':       'DB 開発用',
    unitH: '時',
    unitM: '分'
  },
  ko: {
    msgFactUpdated: '{issueId}의 분배 시간이 업데이트되었습니다: {details}',
    errMappingMissing: '시간 추적 매핑이 구성되지 않았습니다. 플러그인 설정에서 매핑을 구성하세요.',
    errInvalidRole: '타입 "{type}"이(가) 비활성/알 수 없는 역할 "{role}"에 매핑되었습니다.',
    errFieldMissing: '역할 "{role}"에 대한 fact 필드가 구성되지 않았습니다. 플러그인 설정 → 필드에서 설정하세요.',
    errMissingType: '작업 유형을 지정하세요!',
    progressNoEstimate: '기록 {label}: {fact}',
    progressUnder90:    '기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%)',
    progressNearLimit:  '기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%), ⚠️ 계획의 10% 미만 남음! {advice}',
    progressOverLimit:  '기록 {label}: {fact} / 계획 {planHours}{unitH} ({percent}%), 🚨 초과! {advice}',
    adviceAnalysis: '작업을 분해할 시간입니다!',
    adviceExecutor: '분석가에게 연락하세요!',
    'roleLabel_analysis':    '분석가에 의해',
    'roleLabel_testing':     '테스트용',
    'roleLabel_devPlatform': '플랫폼 개발용',
    'roleLabel_devBack':     '백엔드 개발용',
    'roleLabel_devFront':    '프론트엔드 개발용',
    'roleLabel_devIos':      'iOS 개발용',
    'roleLabel_devAndroid':  'Android 개발용',
    'roleLabel_devFs':       '풀스택 개발용',
    'roleLabel_devDb':       'DB 개발용',
    unitH: '시',
    unitM: '분'
  },
  nl: {
    msgFactUpdated: 'Verdeelde tijd bijgewerkt voor {issueId}: {details}',
    errMappingMissing: 'Tijdregistratie-toewijzing is niet geconfigureerd. Configureer de toewijzing in de plugin-instellingen.',
    errInvalidRole: 'Type "{type}" is toegewezen aan een inactieve/onbekende rol "{role}".',
    errFieldMissing: 'Geen fact-veld geconfigureerd voor rol "{role}". Stel het in via Plugin-instellingen → Velden.',
    errMissingType: 'Geef het werktype op!',
    progressNoEstimate: 'Geregistreerd {label}: {fact}',
    progressUnder90:    'Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%), ⚠️ Minder dan 10% van het plan over! {advice}',
    progressOverLimit:  'Geregistreerd {label}: {fact} van geplande {planHours}{unitH} ({percent}%), 🚨 OVERSCHREDEN! {advice}',
    adviceAnalysis: 'Tijd om de taak op te splitsen!',
    adviceExecutor: 'Neem contact op met de analist!',
    'roleLabel_analysis':    'door analist',
    'roleLabel_testing':     'voor testen',
    'roleLabel_devPlatform': 'voor platformontwikkeling',
    'roleLabel_devBack':     'voor backend-ontwikkeling',
    'roleLabel_devFront':    'voor frontend-ontwikkeling',
    'roleLabel_devIos':      'voor iOS-ontwikkeling',
    'roleLabel_devAndroid':  'voor Android-ontwikkeling',
    'roleLabel_devFs':       'voor fullstack-ontwikkeling',
    'roleLabel_devDb':       'voor DB-ontwikkeling',
    unitH: 'u',
    unitM: 'm'
  },
  pl: {
    msgFactUpdated: 'Rozdysponowany czas zaktualizowany dla {issueId}: {details}',
    errMappingMissing: 'Mapowanie śledzenia czasu nie jest skonfigurowane. Skonfiguruj mapowanie w ustawieniach pluginu.',
    errInvalidRole: 'Typ „{type}” jest przypisany do nieaktywnej/nieznanej roli „{role}”.',
    errFieldMissing: 'Brak skonfigurowanego pola fact dla roli „{role}”. Ustaw je w Ustawieniach pluginu → Pola.',
    errMissingType: 'Podaj typ pracy!',
    progressNoEstimate: 'Zarejestrowano {label}: {fact}',
    progressUnder90:    'Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%), ⚠️ Pozostało mniej niż 10% planu! {advice}',
    progressOverLimit:  'Zarejestrowano {label}: {fact} z planowanych {planHours}{unitH} ({percent}%), 🚨 PRZEKROCZENIE! {advice}',
    adviceAnalysis: 'Czas podzielić zadanie!',
    adviceExecutor: 'Skontaktuj się z analitykiem!',
    'roleLabel_analysis':    'przez analityka',
    'roleLabel_testing':     'na testowanie',
    'roleLabel_devPlatform': 'na rozwój platformy',
    'roleLabel_devBack':     'na rozwój backendu',
    'roleLabel_devFront':    'na rozwój frontendu',
    'roleLabel_devIos':      'na rozwój iOS',
    'roleLabel_devAndroid':  'na rozwój Android',
    'roleLabel_devFs':       'na rozwój fullstack',
    'roleLabel_devDb':       'na rozwój BD',
    unitH: 'g',
    unitM: 'm'
  },
  pt: {
    msgFactUpdated: 'Tempo distribuído atualizado para {issueId}: {details}',
    errMappingMissing: 'O mapeamento de rastreamento de tempo não está configurado. Configure o mapeamento nas configurações do plugin.',
    errInvalidRole: 'O tipo «{type}» está mapeado para uma função inativa/desconhecida «{role}».',
    errFieldMissing: 'Nenhum campo fact configurado para a função «{role}». Defina-o em Configurações do plugin → Campos.',
    errMissingType: 'Especifique o tipo de trabalho!',
    progressNoEstimate: 'Registrado {label}: {fact}',
    progressUnder90:    'Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%)',
    progressNearLimit:  'Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%), ⚠️ Menos de 10% do plano restante! {advice}',
    progressOverLimit:  'Registrado {label}: {fact} dos {planHours}{unitH} planejados ({percent}%), 🚨 EXCEDIDO! {advice}',
    adviceAnalysis: 'É hora de decompor a tarefa!',
    adviceExecutor: 'Entre em contato com o analista!',
    'roleLabel_analysis':    'pelo analista',
    'roleLabel_testing':     'para testes',
    'roleLabel_devPlatform': 'para desenvolvimento de plataforma',
    'roleLabel_devBack':     'para desenvolvimento backend',
    'roleLabel_devFront':    'para desenvolvimento frontend',
    'roleLabel_devIos':      'para desenvolvimento iOS',
    'roleLabel_devAndroid':  'para desenvolvimento Android',
    'roleLabel_devFs':       'para desenvolvimento fullstack',
    'roleLabel_devDb':       'para desenvolvimento de BD',
    unitH: 'h',
    unitM: 'm'
  },
  tr: {
    msgFactUpdated: '{issueId} için dağıtılan zaman güncellendi: {details}',
    errMappingMissing: 'Zaman takibi eşleştirmesi yapılandırılmamış. Eklenti ayarlarında eşleştirmeyi yapılandırın.',
    errInvalidRole: '«{type}» türü etkin olmayan/bilinmeyen «{role}» rolüne eşlendi.',
    errFieldMissing: '«{role}» rolü için fact alanı yapılandırılmamış. Eklenti ayarları → Alanlar bölümünde ayarlayın.',
    errMissingType: 'Lütfen iş türünü belirtin!',
    progressNoEstimate: 'Kaydedildi {label}: {fact}',
    progressUnder90:    'Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%)',
    progressNearLimit:  'Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%), ⚠️ Planın %10\'undan azı kaldı! {advice}',
    progressOverLimit:  'Kaydedildi {label}: {fact} / planlanan {planHours}{unitH} ({percent}%), 🚨 LİMİT AŞIMI! {advice}',
    adviceAnalysis: 'Görevi parçalama zamanı!',
    adviceExecutor: 'Lütfen analistle iletişime geçin!',
    'roleLabel_analysis':    'analist tarafından',
    'roleLabel_testing':     'test için',
    'roleLabel_devPlatform': 'platform geliştirme için',
    'roleLabel_devBack':     'backend geliştirme için',
    'roleLabel_devFront':    'frontend geliştirme için',
    'roleLabel_devIos':      'iOS geliştirme için',
    'roleLabel_devAndroid':  'Android geliştirme için',
    'roleLabel_devFs':       'fullstack geliştirme için',
    'roleLabel_devDb':       'VT geliştirme için',
    unitH: 's',
    unitM: 'd'
  },
  zh: {
    msgFactUpdated: '{issueId} 的分配时间已更新: {details}',
    errMappingMissing: '时间跟踪映射未配置。请在插件设置中配置映射。',
    errInvalidRole: '类型「{type}」映射到非活动/未知角色「{role}」。',
    errFieldMissing: '角色「{role}」未配置 fact 字段。请在插件设置 → 字段中设置。',
    errMissingType: '请指定工作类型!',
    progressNoEstimate: '已记录 {label}: {fact}',
    progressUnder90:    '已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%)',
    progressNearLimit:  '已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%),⚠️ 计划剩余不足 10%! {advice}',
    progressOverLimit:  '已记录 {label}: {fact} / 计划 {planHours}{unitH} ({percent}%),🚨 超额! {advice}',
    adviceAnalysis: '是时候分解任务了!',
    adviceExecutor: '请联系分析师!',
    'roleLabel_analysis':    '由分析师',
    'roleLabel_testing':     '测试',
    'roleLabel_devPlatform': '平台开发',
    'roleLabel_devBack':     '后端开发',
    'roleLabel_devFront':    '前端开发',
    'roleLabel_devIos':      'iOS 开发',
    'roleLabel_devAndroid':  'Android 开发',
    'roleLabel_devFs':       '全栈开发',
    'roleLabel_devDb':       '数据库开发',
    unitH: '时',
    unitM: '分'
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

function getMinutes(period) {
  if (!period) return 0;
  const weeks = period.getWeeks ? (period.getWeeks() || 0) : 0;
  const days = period.getDays ? (period.getDays() || 0) : 0;
  const hours = period.getHours ? (period.getHours() || 0) : 0;
  const minutes = period.getMinutes ? (period.getMinutes() || 0) : 0;
  return weeks * 5 * 8 * 60 + days * 8 * 60 + hours * 60 + minutes;
}

function formatMinutes(m) {
  const mm = m || 0;
  const h = Math.floor(mm / 60);
  const r = mm % 60;
  return h + 'h ' + r + 'm';
}

/* v1.2.4: целое число часов плана (без минут) — для строки «{planHours} ч»
   в notifyProgress. Совпадает с поведением оригинального workflow. */
function getHoursFromPeriod(p) {
  if (!p) return 0;
  const weeks = p.getWeeks ? (p.getWeeks() || 0) : 0;
  const days = p.getDays ? (p.getDays() || 0) : 0;
  const hours = p.getHours ? (p.getHours() || 0) : 0;
  return weeks * 5 * 8 + days * 8 + hours;
}

/* v1.2.4: локализованный лейбл «Xч Yм» / «Xh Ym» — для текущего факта
   в notifyProgress. unitH/unitM берутся из WF_I18N по lang. */
function toPeriodLabel(minutes, lang) {
  const p = dateTime.toPeriod((minutes || 0) * 60000);
  const h = p.getHours ? (p.getHours() || 0) : 0;
  const m = p.getMinutes ? (p.getMinutes() || 0) : 0;
  return h + tWf(lang, 'unitH') + ' ' + m + tWf(lang, 'unitM');
}

function isRoleActive(settings, role) {
  if (!settings || !settings.activeRoles) return false;
  if (Array.isArray(settings.activeRoles)) return settings.activeRoles.indexOf(role) >= 0;
  return Boolean(settings.activeRoles[role]);
}

/* v1.2.1 fix Bug B: имя реального custom-field берём из settings,
   которые SSP-виджет наполняет в settings UI «Поля → Факт». Если для
   роли поле не выбрано — возвращаем null и aggregate() пропускает её
   с warning. */
function fieldFactName(role, settings) {
  const settingsKey = FIELD_FACT_KEY_BY_ROLE[role];
  if (!settingsKey) return null;
  const v = settings && settings[settingsKey];
  return (typeof v === 'string' && v.length > 0) ? v : null;
}

function _wiMinutes(wi) {
  if (!wi) return 0;
  try {
    if (typeof wi.duration === 'number') return wi.duration;
    if (wi.duration && typeof wi.duration.minutes === 'number') return wi.duration.minutes;
    if (wi.duration) return getMinutes(wi.duration);
  } catch (_) {}
  return 0;
}

function _wiTypeName(wi) {
  try { return (wi && wi.type && wi.type.name) ? wi.type.name : ''; } catch (_) { return ''; }
}

function groupWorkItemsByType(issue) {
  const out = {};
  if (!issue || !issue.workItems) return out;
  issue.workItems.forEach(function(wi) {
    out[_wiTypeName(wi)] = (out[_wiTypeName(wi)] || 0) + _wiMinutes(wi);
  });
  return out;
}

/* v1.2.4 (#7 из оригинала): full recompute по всем workItems issue —
   используется когда есть `editedWorkItems` (старый тип неизвестен,
   delta невозможна без артефактов). */
function _computeRoleMinutesFull(issue, settings) {
  const mapping = settings.workItemTypeMapping || {};
  const byType = groupWorkItemsByType(issue);
  const out = {};
  Object.keys(byType).forEach(function(typeName) {
    const role = mapping[typeName];
    if (!role) return;
    out[role] = (out[role] || 0) + byType[typeName];
  });
  return out;
}

/* v1.2.4 (#7): delta — текущие fact-поля + added.duration - removed.duration.
   Безопасно когда editedWorkItems пуст (никто не сменил тип у уже
   существующего workItem). Inactive-role фильтруется в действии-обёртке. */
function _computeRoleMinutesDelta(issue, settings) {
  const mapping = settings.workItemTypeMapping || {};
  const out = {};

  /* 1. Стартовое значение из текущих fact-полей для каждой роли в маппинге. */
  const rolesInMapping = {};
  Object.keys(mapping).forEach(function(t) {
    const r = mapping[t];
    if (r) rolesInMapping[r] = true;
  });
  Object.keys(rolesInMapping).forEach(function(role) {
    const fname = fieldFactName(role, settings);
    let cur = 0;
    if (fname) {
      try {
        const v = issue.fields[fname];
        if (v) cur = getMinutes(v);
      } catch (_) {}
    }
    out[role] = cur;
  });

  /* 2. + added. */
  if (issue.workItems && issue.workItems.added && typeof issue.workItems.added.forEach === 'function') {
    issue.workItems.added.forEach(function(wi) {
      const role = mapping[_wiTypeName(wi)];
      if (!role) return;
      out[role] = (out[role] || 0) + _wiMinutes(wi);
    });
  }
  /* 3. - removed. */
  if (issue.workItems && issue.workItems.removed && typeof issue.workItems.removed.forEach === 'function') {
    issue.workItems.removed.forEach(function(wi) {
      const role = mapping[_wiTypeName(wi)];
      if (!role) return;
      out[role] = Math.max(0, (out[role] || 0) - _wiMinutes(wi));
    });
  }
  return out;
}

function _computeRoleMinutes(issue, settings) {
  /* Если есть editedWorkItems — полный пересчёт; иначе — оптимизированная
     дельта по added/removed. */
  const edited = issue && issue.editedWorkItems;
  let editedNotEmpty = false;
  if (edited) {
    if (typeof edited.isNotEmpty === 'function') editedNotEmpty = edited.isNotEmpty();
    else if (typeof edited.isEmpty === 'function') editedNotEmpty = !edited.isEmpty();
    else if (typeof edited.size === 'number') editedNotEmpty = edited.size > 0;
  }
  return editedNotEmpty
    ? _computeRoleMinutesFull(issue, settings)
    : _computeRoleMinutesDelta(issue, settings);
}

/* v1.2.4: уведомление о соотношении план/факт по роли. Три порога:
   <90% — info, 90-100% — ⚠️ остаток <10%, >100% — 🚨 ПЕРЕЛИМИТ.
   Подсказка («декомпозируй» vs «свяжись с аналитиком») зависит от того,
   является ли роль аналитической. Только для analysis-role hardcoded;
   все остальные роли получают executor-подсказку. */
function notifyProgress(roleKey, durMinutes, planPeriod, lang) {
  const label = tWf(lang, 'roleLabel_' + roleKey);
  const fact = toPeriodLabel(durMinutes, lang);
  const planMinutes = getMinutes(planPeriod);

  if (planMinutes <= 0) {
    try { workflow.message(tWf(lang, 'progressNoEstimate', { label: label, fact: fact })); } catch (_) {}
    return;
  }

  const planHours = getHoursFromPeriod(planPeriod);
  const percentNum = (durMinutes / planMinutes) * 100;
  const percent = percentNum.toFixed(2);
  const unitH = tWf(lang, 'unitH');
  const advice = (roleKey === 'analysis')
    ? tWf(lang, 'adviceAnalysis')
    : tWf(lang, 'adviceExecutor');
  const vars = {
    label: label, fact: fact,
    planHours: planHours, percent: percent, unitH: unitH, advice: advice
  };

  let key;
  if (percentNum < 90)         key = 'progressUnder90';
  else if (percentNum <= 100)  key = 'progressNearLimit';
  else                         key = 'progressOverLimit';

  try { workflow.message(tWf(lang, key, vars)); } catch (_) {}
}

function aggregate(issue, settings, lang) {
  const mapping = settings.workItemTypeMapping || {};

  /* v1.2.4: full vs delta — выбирается _computeRoleMinutes по наличию
     editedWorkItems. Inactive-role диагностика делается отдельным
     pre-проходом по mapping (одно сообщение на проблемный type). */
  const roleMinutesRaw = _computeRoleMinutes(issue, settings);

  /* Diagnostic: type → role, role не active. Один проход по mapping. */
  Object.keys(mapping).forEach(function(typeName) {
    const role = mapping[typeName];
    if (role && !isRoleActive(settings, role) && roleMinutesRaw.hasOwnProperty(role)) {
      try { workflow.message(tWf(lang, 'errInvalidRole', { type: typeName, role: role })); } catch (_) {}
    }
  });

  /* Отфильтровываем inactive-роли из результата. */
  const roleMinutes = {};
  Object.keys(roleMinutesRaw).forEach(function(role) {
    if (isRoleActive(settings, role)) roleMinutes[role] = roleMinutesRaw[role];
  });

  /* Обнуляем fact-поля для активных ролей в маппинге, у которых нет
     workItems (cleanup stale-значений после удаления всех). */
  const rolesInMapping = {};
  Object.keys(mapping).forEach(function(t) {
    const r = mapping[t];
    if (r && isRoleActive(settings, r)) rolesInMapping[r] = true;
  });
  Object.keys(rolesInMapping).forEach(function(r) {
    if (!(r in roleMinutes)) roleMinutes[r] = 0;
  });

  const changes = [];
  Object.keys(roleMinutes).forEach(function(role) {
    const fname = fieldFactName(role, settings);
    if (!fname) {
      try { workflow.message(tWf(lang, 'errFieldMissing', { role: role })); } catch (_) {}
      return;
    }
    let cur = 0;
    try {
      const v = issue.fields[fname];
      if (v) cur = getMinutes(v);
    } catch (_) {}
    const target = roleMinutes[role];
    if (cur !== target) {
      try {
        if (target > 0) {
          issue.fields[fname] = dateTime.toPeriod(target * 60000);
        } else {
          issue.fields[fname] = null;
        }
        changes.push({ field: fname, role: role, from: cur, to: target });
      } catch (_) { /* поле не period-type / не существует — тихо пропускаем */ }
    }

    /* v1.2.4: notifyProgress если флаг включён. Срабатывает даже если
       cur === target (для каждого нового списания мы хотим уведомить
       пользователя об актуальном проценте). */
    if (settings.dtaWarningsEnabled) {
      let planPeriod = null;
      try {
        const planFieldKey = FIELD_EST_KEY_BY_ROLE[role];
        const planFieldName = planFieldKey ? settings[planFieldKey] : null;
        if (planFieldName && typeof planFieldName === 'string') {
          planPeriod = issue.fields[planFieldName];
        }
      } catch (_) {}
      notifyProgress(role, target, planPeriod, lang);
    }
  });
  return changes;
}

/* v1.2.4: mandatory type-check для каждого added/edited workItem.
   workflow.check блокирует save если condition false → save fails,
   юзер видит сообщение. removed-items не проверяем (там тип уже
   ничего не значит). */
function _assertAllAddedHaveType(issue, lang) {
  if (!issue || !issue.workItems) return;
  function each(coll) {
    if (!coll || typeof coll.forEach !== 'function') return;
    coll.forEach(function(wi) {
      workflow.check(!!(wi && wi.type), tWf(lang, 'errMissingType'));
    });
  }
  each(issue.workItems.added);
  each(issue.editedWorkItems);
}

function _runIfDtaEnabled(issue, ctx) {
  if (!issue) return;
  const settings = readSettings(issue);
  if (!settings || !settings.dtaEnabled) return;
  if (!settings.workItemTypeMapping || !Object.keys(settings.workItemTypeMapping).length) return;

  const lang = pickLocale(ctx, settings);

  /* Type-check ДО aggregate: если есть added/edited без type — workflow.check
     прервёт выполнение через throw и save не пройдёт. */
  _assertAllAddedHaveType(issue, lang);

  const changes = aggregate(issue, settings, lang);
  if (changes && changes.length) {
    const details = changes.map(function(c) {
      return c.field + ': ' + formatMinutes(c.from) + ' → ' + formatMinutes(c.to);
    }).join('; ');
    try {
      workflow.message(tWf(lang, 'msgFactUpdated', {
        issueId: issue.id,
        details: details
      }));
    } catch (_) {}
  }
}

/* v1.2.4: guard расширен.
   - `isReported && !isResolved` — не дёргаем workflow для черновиков и
     для закрытых issue (последнее особенно важно: после Resolved
     перерасчёт fact-полей не нужен и может конфликтовать с другими
     workflows-замораживателями).
   - `hasWorkItemChanges` — workflow стартует только если затронуты
     workItems (а не любое изменение issue). Это снижает количество
     no-op срабатываний на изменения других полей.
   Если на текущем YT-билде collections `added/editedWorkItems/removed`
   не имеют `.isNotEmpty()` — fallback на best-effort (size, length,
   isEmpty), либо считаем что workItems могли поменяться. */
function _hasWorkItemChanges(issue) {
  if (!issue || !issue.workItems) return false;
  function notEmpty(coll) {
    if (!coll) return false;
    if (typeof coll.isNotEmpty === 'function') return coll.isNotEmpty();
    if (typeof coll.isEmpty === 'function') return !coll.isEmpty();
    if (typeof coll.size === 'number') return coll.size > 0;
    if (typeof coll.length === 'number') return coll.length > 0;
    return false;
  }
  if (notEmpty(issue.workItems.added)) return true;
  if (notEmpty(issue.workItems.removed)) return true;
  if (notEmpty(issue.editedWorkItems)) return true;
  return false;
}

function _commonGuard(issue) {
  if (!issue) return false;
  /* Skip drafts and resolved issues. */
  try {
    if (issue.isReported === false) return false;
    if (issue.isResolved === true) return false;
  } catch (_) { /* fields могут быть недоступны — пропускаем чек */ }
  /* v3.2.1 — дешёвый отсекатель ПЕРВЫМ: readSettings парсит многокилобайтный
     ssp_settings на КАЖДОЕ изменение любого поля любой задачи проекта; раньше
     parse стоял до чека workItems и налогом ложился на все массовые правки. */
  if (!_hasWorkItemChanges(issue)) return false;
  const settings = readSettings(issue);
  if (!settings || !settings.dtaEnabled) return false;
  if (!settings.workItemTypeMapping) return false;
  if (!Object.keys(settings.workItemTypeMapping).length) return false;
  return true;
}

/* v1.2.3 (acceptance fix #3): YT scripting API регистрирует workflow rule
   ТОЛЬКО когда экспорт называется ровно `exports.rule` (так это сделано
   в VK Workspace Notifier и так требует JetBrains Apps spec).
   Кастомные имена `exports.issueRule` / `exports.workItemRule` YT парсит
   как "exported script" (action/script-type), а не как on-change rule.
   В UI YT Admin → Workflows такой entry не получает on-change-trigger.
   Возвращаемся к одиночному `exports.rule = entities.Issue.onChange(...)`.
   Issue.onChange срабатывает на add/remove workItems как часть
   issue-update event (тот же cascading-mutation механизм, что и для
   comments.added / tags.added в VK Notifier). */
exports.rule = entities.Issue.onChange({
  title: 'Smart Sprint Planner — DTA workItem aggregation',
  guard: function(ctx) { return _commonGuard(ctx && ctx.issue); },
  action: function(ctx) { _runIfDtaEnabled(ctx && ctx.issue, ctx); }
});

// v1.7.1 — Test-only exports (для node --test). YT scripting игнорирует typeof module проверку.
if (typeof module !== 'undefined' && module.exports) {
  Object.assign(module.exports, {
    WF_I18N:    WF_I18N,
    tWf:        tWf,
    pickLocale: pickLocale
  });
}
