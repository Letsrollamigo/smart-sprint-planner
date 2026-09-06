# Карта кода

> Сгенерировано `scripts/gen-code-map.js` (`npm run code-map`), руками не править: гейт `tests/arch/code-map.test.js` сверяет файл с генерацией и существование путей индекса. Назначение — ориентировка в репозитории без серии grep'ов: перед поиском по коду прочитать нужный раздел. Версии и даты в карте нет намеренно.

## 1. Каталоги и корневые файлы

- `assets/` — графика витрины
- `docs/` — опубликованная документация со скриншотами
- `Documentation/` — документация: CHANGELOG, SECURITY (матрица доступа), гайды, эта карта
- `marketplace-screenshots/` — кадры для витрины Marketplace
- `MP publication/` — материалы публикации на Marketplace
- `Prompts/` — бутстрап-промпты сессий
- `RoadMap/` — заглушки-указатели на общую дорожную карту
- `schema/` — whitelists.json — источник allow-list ключей схемы, синхронизируется в бэкенд скриптом
- `scripts/` — сборка и гейты: whitelists, иконки, Ring-CSS, реестр модулей, карта кода, release-check, деплой на стенд
- `Spec/` — спеки и планы фич
- `tests/` — node --test: unit, golden, arch, mirror, fixtures
  - `arch/` — architecture fitness: ратчеты LOC, топология, полнота реестра, актуальность карты кода
  - `fixtures/` — фикстуры снимков схемы по версиям-границам, моки YouTrack
  - `golden/` — характеризационные тесты со снимками (.snap)
  - `screenshots/` — локальные кадры смоуков (не в git)
  - `unit/` — юнит-тесты бэкенда и чистых функций
- `tools/` — служебные скрипты вне рантайма
- `widgets/` — виджеты приложения
  - `main/` — единственный виджет: index.html, собранные бандлы (main.js, vendored-react.chunk.js, ленивый recharts.chunk.js), ring-subset.css, i18n, lib
    - `i18n/` — словари локалей (json)
    - `lib/` — вендоренные библиотеки экспорта (pdfmake, xlsx) с лицензиями
    - `src/` — исходники фронта, esbuild → main.js
      - `data/` — слой данных: обёртка бэкенда и REST YouTrack, загрузчики, данные отчётности
      - `domain/` — доменные контроллеры и представления: спринт, история, релизы, бэклог, ёмкость, отчётность, Гант
      - `i18n/` — локализация: загрузчик словарей, контроллер, список языков
      - `icons/` — SVG-иконки набора JetBrains, собираются в icons.generated.js
      - `infra/` — инфраструктура UI: тосты, модалки, датапикер, предпочтения, диагностика
      - `pure/` — чистые функции без DOM и стейта: расчёты, слияние, даты, сортировка
      - `react/` — React-компоненты на вендоренном Ring UI и точки монтирования
      - `core.js` — ядро-монолит: стейт вкладки, инициализация, делегаторы в модули через мосты
      - `icons.generated.js` — словарь SVG-иконок, собирается build-icons.js — не править руками
      - `index.js` — порядок сборки: импорты модулей
    - `main.js` — собранный бандл фронта (esbuild, минифицирован) — артефакт, не источник
    - `recharts.chunk.js` — ленивый чанк графиков отчётности — артефакт сборки
    - `vendored-react.chunk.js` — вендоренный React + Ring UI одним чанком — артефакт сборки
- `backend-*.js` — бэкенд приложения: HTTP-обработчики (extensionEndpoints), исполняются внутри YouTrack; core = общие гейты, валидаторы, миграции; остальные — по фичам
- `CLAUDE.md` — правила работы с репозиторием для сессий; общие правила форков — в соседнем Shared Docks
- `entity-extensions.json` — объявление extension-properties — слотов хранения на Project/User
- `manifest.json` — манифест приложения YouTrack: виджеты, версия, changeNotes
- `module-registry.json` — реестр модулей фронта: слой, LOC, стейт, мосты — контракт арх-гейтов
- `NEXT_SESSION_PROMPT.md` — промпт следующей сессии (legacy-расположение; канон — соседний каталог общих промптов)
- `NOTICE.md` — уведомления о лицензиях вендоренных библиотек
- `package-lock.json` — фиксация версий devDependencies (npm ci)
- `package.json` — сборка (esbuild), тесты (node --test), гейты, zip
- `README.md` — витрина проекта и актуальная версия
- `settings.json` — JSON-схема параметров приложения (группа настройщика, debug-лог)
- `workflow-*.js` — правила workflow YouTrack (Issue.onChange): агрегации, подтяжка состояния родителя, запрет контейнера; общая инфраструктура — workflow-common.js

## 2. Фронт: модули по слоям

Слой и LOC — из `module-registry.json`; мосты — глобалы `window.__SSP_*`, через которые ядро зовёт модуль; назначение — первая строка заголовка модуля.

| Модуль | LOC | Мосты | Назначение |
|---|---|---|---|
| `core.js` | 4597 | — | композиционный корень виджета. |

### domain/ — доменные контроллеры и представления: спринт, история, релизы, бэклог, ёмкость, отчётность, Гант

| Модуль | LOC | Мосты | Назначение |
|---|---|---|---|
| `data-loaders.js` | 319 | `__SSP_DATA_LOADERS` | загрузчики данных проекта (Фаза 5 слайс 12, домен E6 — первый выносимый подкластер init/bootstrap). |
| `reporting-data.js` | 538 | `__SSP_REPORTING_DATA` | #50 S1b. |
| `youtrack-api.js` | 483 | `__SSP_YOUTRACK_API` | #25 Ф1 — роутинг по режиму. project → backend-project (scope:true). global → backend-global + projectKey. |
| `allocsummary-view.js` | 247 | `__SSP_ALLOCSUMMARY_VIEW` | #61 — Сводная таблица мультиролевого планирования: read-only спойлер над аккордеонами ролей экрана «Аллокация общего ресурса» (#allocSummaryHost). |
| `backlog-assign.js` | 138 | `__SSP_BACKLOG_ASSIGN` | #21 слайс 4 — раскладка задачи из пула бэклога в состав ролей спринта (C1-C2 спеки). |
| `backlog-loader.js` | 422 | `__SSP_BACKLOG_LOADER` | #21 слайс 2b — async-загрузчик пула бэклога. |
| `backlog-view.js` | 146 | `__SSP_BACKLOG_VIEW` | #21 слайс 3 — render-делегатор вида «по зонам». |
| `capacity-store.js` | 60 | `__SSP_CAPACITY_STORE` | доменный стор ёмкости #45 (ADR-001, третье применение после sprint-store/release-store; |
| `capacity-view.js` | 468 | `__SSP_CAPACITY_VIEW` | #45 R3 вкладка «Управление ёмкостью». |
| `currentrole-view.js` | 1094 | `__SSP_CURRENTROLE_VIEW` | Current-role tables view — таблицы текущей роли уровня «Люди» («Распределение по исполнителям» + таблица задач) и их calc-хелперы. |
| `dash-shell.js` | 254 | `__SSP_DASH_SHELL` | global-рельс + дерево навигации (#25 Ф2 Этап 3+4+7, Фаза 5 слайс 13, домен E6 — выносимый подкластер init/bootstrap). |
| `draft-store.js` | 371 | `__SSP_DRAFT_STORE` | Persistence-инфра: серверный черновик (GET/POST /draft, debounced 300мс) и working copies (GET/POST /working-drafts + reconcile/gc). |
| `excel-export.js` | 329 | — | KL#5 v5.3.0 (D48 уточнённый): один xlsx с двумя листами «Текущий снимок» / «Ваша рабочая копия» + diff-маркер в отдельной колонке. |
| `gantt-view.js` | 423 | `__SSP_GANTT_VIEW` | Диаграмма Ганта — view вкладки «Гант» (v4.0.0): таблица «задача × дни» с полосами в цвет родного stateColor задачи YT (v2.1.14), бейджем состояния … |
| `header-view.js` | 373 | `__SSP_HEADER_VIEW` | Шапка виджета — view «общего контекста спринта» (v5.4.0, журнал D25–D29): селектор логических спринтов, per-role статус-бейджи (v1.8.1), индикатор … |
| `history-controller.js` | 209 | — | контроллер действий вкладки «История»: правка/ завершение спринта + экспорт/импорт истории в JSON (Фаза 5, зачистка «прочих» — слайс 10). |
| `history-io.js` | 194 | — | #69 R1 — per-role rate_/kpe_-ключей в схеме нет (цикл снят) |
| `history-view.js` | 606 | `__SSP_HISTORY_VIEW` | История спринтов — view вкладки «История»: список-пагинация (renderHistory), групповой спойлер спринта (#60) и спойлер записи (buildSpoiler: meta+б… |
| `intro-view.js` | 321 | `__SSP_INTRO_VIEW` | рендер «вводных» планировщика (Фаза 5, зачистка «прочих» — слайс 9). |
| `permissions.js` | 213 | `__SSP_PERMISSIONS` | Permissions-кластер: backend-проверки прав (validator/editor/assigner/ settings-manager), синглтон-батч _startPermissionsCheck и применение прав к … |
| `pick.js` | 317 | `__SSP_PICK` | построение query + fingerprint; rawQ передаётся из React-компонента (DOM-инпут pickQuery удалён вместе с #pickOverlay). |
| `project-nav.js` | 489 | `__SSP_PROJECT_NAV` | global-picker проектов + project-mode страница настроек (#25 Ф1, Фаза 5 слайс 14, домен E6 — выносимый подкластер init/bootstrap). |
| `reassign-controller.js` | 181 | `__SSP_REASSIGN_CTRL` | контроллер реассайн-модалки задачи в Ганте (Фаза 5, зачистка «прочих» — слайс 7, домен D46). |
| `refresh-controller.js` | 513 | `__SSP_REFRESH_CTRL` | Refresh-контроллер #35 «Обновить из задачи»: единый refreshFromYouTrack (чанкованный REST-батч + field-class merge через resolveRefreshMerge + конф… |
| `release-controller.js` | 597 | `__SSP_RELEASE_CTRL` | #48 R1.3 действия релиз-менеджмента (создание; удаление — R1.3b). |
| `release-pick.js` | 257 | `__SSP_RELEASE_PICK` | #48 R1.4 подбор задач YouTrack в релиз (строго Ring UI). |
| `release-rollback.js` | 86 | `__SSP_RELEASE_ROLLBACK` | #57-3 откат состояний задач релиза по истории поля State (⚖ владелец: снапшот НЕ храним — история изменений YT и есть снимок). |
| `release-store.js` | 84 | `__SSP_RELEASE_STORE` | доменный стор релиз-менеджмента (#48, ADR-001). |
| `release-view.js` | 440 | — | #48 вкладки «Релиз-менеджмент» (планируемые / история релизов). |
| `reporting-view.js` | 1425 | `__SSP_REPORTING_VIEW` | #50 S1c/S2. |
| `revalidation.js` | 118 | `__SSP_REVALIDATION` | Уровни ре-валидации working copy. |
| `rolecomposition-view.js` | 1128 | `__SSP_ROLECOMP_VIEW` | Planning-core view — уровень «Роли» вкладки Планирование: accordion-карточки ролей (quick-stats/warn перелимита) и таблица состава роли (Ring Table). |
| `settings-controller.js` | 228 | `__SSP_SETTINGS_CTRL` | обвязка формы настроек проекта (Фаза 5, зачистка «прочих» — слайс 11). |
| `share-controller.js` | 186 | `__SSP_SHARE_CTRL` | #36 Share-URL (deep-link + handoff): чтение share-параметров с init, авто-синк state→URL, сборка shareable-ссылки, копирование по «Поделиться» и фо… |
| `sprint-controller.js` | 642 | `__SSP_SPRINT_CTRL` | контроллеры спринт-CRUD (Фаза 5 слайс 6, домен E1-sprint, последний подслайс E1). |
| `sprint-store.js` | 73 | `__SSP_SPRINT_STORE` | доменный стор конфликт-канона спринта (ADR-001, второе применение). |
| `standup-view.js` | 377 | `__SSP_STANDUP_VIEW` | значение опции «Все роли» (не пересекается с role keys) |
| `tab-router.js` | 107 | `__SSP_TAB_ROUTER` | Этап 4: planner-wide на всё, что не settings-overlay. |
| `validation-controller.js` | 331 | `__SSP_VALIDATION_CTRL` | Validation-контроллер: валидация состава роли (doValidateRole), детектор перелимита аллокаций + блокировка кнопки валидации (updateAllocOverlimitUI… |
| `working-copy.js` | 555 | `__SSP_WORKING_COPY` | #88 — резолвер ролевого значения поля «Спринт» (leaf-слой pure, гейт B1 доволен). |

### pure/ — чистые функции без DOM и стейта: расчёты, слияние, даты, сортировка

| Модуль | LOC | Мосты | Назначение |
|---|---|---|---|
| `allocsummary-pure.js` | 62 | `__SSP_ALLOCSUMMARY_PURE` | #61 — Сводная таблица мультиролевого планирования: чистая сборка строк. |
| `backlog-vm-pure.js` | 262 | `__SSP_BACKLOG_VM_PURE` | #21 слайс 2 — ЧИСТЫЙ VM-builder пула бэклога. |
| `capacity-pure.js` | 306 | `__SSP_CAPACITY_PURE` | Side-effect модуль: чистое ядро расчёта ёмкости (#45 R2 «ядро ёмкости»). |
| `date-pure.js` | 52 | `__SSP_DATE_PURE` | Чистые date-хелперы. |
| `display-fields-pure.js` | 179 | `__SSP_DISPLAY_FIELDS_PURE` | 68-8 «Отображаемые поля»: произвольные поля YouTrack проекта дополнительными колонками трёх таблиц задач. |
| `enum-locale-pure.js` | 23 | `__SSP_ENUM_PURE` | B7 — locale-aware DISPLAY значений enum-полей (Priority / State / X-Priority). |
| `forecast-pure.js` | 123 | `__SSP_FORECAST_PURE` | Side-effect модуль: чистое ядро авто-прогноза дат старта/окончания задач (#40). |
| `hash-pure.js` | 99 | `__SSP_HASH_PURE` | Чистые hash / equality / diff-утилиты рабочих копий. |
| `link-roles-pure.js` | 345 | `__SSP_LINK_ROLES_PURE` | эпик #74 фаза 1 «Связи задач»: роли типов связей. |
| `migrate-pure.js` | 120 | `__SSP_MIGRATE_PURE` | #49 — personalPlanning: единый канон = per-role записи истории (histRec.personalPlanning, single PP). |
| `period-pure.js` | 83 | `__SSP_PERIOD_PURE` | Side-effect модуль: чистые функции форматирования/парсинга периодов (минуты ↔ строка). |
| `permissions-matrix-pure.js` | 216 | `__SSP_PERMISSIONS_MATRIX_PURE` | #71 — «Управление правами» как таблица «группа × полномочие»: чистая логика. |
| `planning-model-pure.js` | 73 | `__SSP_PLANNING_MODEL_PURE` | Side-effect модуль: чистые функции маппинга «Модель планирования» (simple\|light\|full) ↔ тройка legacy-флагов (personalPlanningEnabled / usePersonal… |
| `refresh-merge-pure.js` | 107 | `__SSP_REFRESH_MERGE_PURE` | Side-effect модуль: чистое ядро слияния при «Обновить из задачи» (#35). |
| `release-tree-pure.js` | 81 | `__SSP_RELEASE_TREE_PURE` | #48 R3.2 дерево состава релиза (US-R3-04). |
| `reporting-b-pure.js` | 169 | `__SSP_REPORTING_B_PURE` | #50 S8c. |
| `reporting-export-pure.js` | 279 | `__SSP_REPORTING_EXPORT_PURE` | #50 S9. |
| `reporting-period.js` | 116 | `__SSP_REPORTING_PERIOD` | #50 S2. |
| `reporting-pure.js` | 656 | `__SSP_REPORTING_PURE` | #50 S1b. |
| `reporting-rollup.js` | 238 | `__SSP_REPORTING_ROLLUP` | #50 B0 «Свод» (контур B, управленческий roll-up). |
| `reporting-ttm.js` | 412 | `__SSP_REPORTING_TTM` | #50 S3b/S4b. |
| `share-url-pure.js` | 111 | `__SSP_SHARE_URL_PURE` | Side-effect модуль: чистое ядро deep-link share-URL (#36). |
| `slot-merge-pure.js` | 143 | `__SSP_SLOT_MERGE_PURE` | #84 «перечитать-и-слить вместо „обновите страницу"». |
| `sort-pure.js` | 144 | `__SSP_SORT_PURE` | sandboxed write may throw |
| `sprint-field-pure.js` | 86 | `__SSP_SPRINT_FIELD_PURE` | #88 «ролевое поле спринта». |
| `toast-pure.js` | 45 | `__SSP_TOAST_PURE` | sandboxed write may throw |
| `util-pure.js` | 61 | — | #69 R1 (строка 26) — ячейка «Внешний ID» (была ×3: состав/люди/история; |
| `velocity-pure.js` | 67 | `__SSP_VELOCITY_PURE` | #11 Velocity (v3.12.0) — скорость команды по ролям из FINISHED-снимков ssp_history. |

### infra/ — инфраструктура UI: тосты, модалки, датапикер, предпочтения, диагностика

| Модуль | LOC | Мосты | Назначение |
|---|---|---|---|
| `click-anchor.js` | 84 | `__SSP_MODAL_ANCHOR` | Cross-origin sandbox iframe modal anchor tracker. |
| `datepicker-bridge.js` | 179 | `__SSP_DP_BRIDGE` | Кастомный локализованный датапикер (v1.4.1 D127) — поп-ап для инпутов с маркером [data-ssp-datepicker]. |
| `diag-snapshot.js` | 103 | `__SSP_DIAG_SNAPSHOT` | экспорт-слепок состояния из диаг-панели (#63 п.4). |
| `fieldvalues-loader.js` | 196 | `__SSP_FIELDVALUES_LOADER` | 68-8: эфемерная подгрузка значений «отображаемых полей». |
| `modal-specs.js` | 223 | `__SSP_MODAL_SPECS` | Phase 2 #32 — WC-семейство мигрировано на openModal() (настоящий React в Ring Dialog). |
| `toast-ring.js` | 364 | `__SSP_TOAST`, `__SSP_TOAST_RING` | Тост-обвязка (v1.9.11 UX-нормализация, B-32; |
| `user-prefs.js` | 82 | `__SSP_USER_PREFS` | предпочтения пользователя: localStorage ⊃ серверное зеркало (#69 строка 21). |

### i18n/ — локализация: загрузчик словарей, контроллер, список языков

| Модуль | LOC | Мосты | Назначение |
|---|---|---|---|
| `i18n-bridge.js` | 14 | `__SSP_I18N__`, `__SSP_I18N_DICTS__`, `__SSP_I18N_LANGS__` | Side-effect модуль: ставит i18n loader API + inlined dicts на window.__SSP_* ДО того как IIFE core.js начнёт исполняться. |
| `i18n-controller.js` | 162 | `__SSP_I18N_CTRL` | application-side i18n-обвязка монолита (Фаза 5, зачистка «прочих» — слайс 8). |
| `languages.js` | 37 | — | Список 15 поддерживаемых языков для v1.1.0 i18n. |
| `loader.js` | 176 | — | Async-загрузчик i18n-словарей. - EN+RU inlined в bundle через ES-import JSON (esbuild json loader). - Остальные 13 языков лениво загружаются через … |

### react/ — React-компоненты на вендоренном Ring UI и точки монтирования

| Компонент | LOC | Назначение |
|---|---|---|
| `backlog-assign.jsx` | 77 | #21 слайс 4 — body-компонент модалки «Разложить в спринт» (C1 спеки). |
| `backlog-view.jsx` | 506 | #21 слайс 3 — React-презентация вида «по зонам» бэклога. |
| `capacity-view.jsx` | 531 | #45 R3 — React-презентация вкладки «Управление ёмкостью» (де-гибридизация #32: настоящий Ring React, как gantt-view/standup-view). |
| `datepicker-mount.jsx` | 110 | Ring DatePicker bridge for Phase D4. |
| `gantt-view.jsx` | 354 | Тир D слайс 6, ступень 2 (#39) → #20-v2 (v3.2.0) — React-презентация диаграммы Ганта на vendored gantt-task-react (MIT, SSP_VENDORED.GanttTaskReact… |
| `i18n-bridge.jsx` | 37 | i18n bridge for Ring components. |
| `input-mount.jsx` | 137 | Ring Input bridge for text/number/textarea fields outside Ring Table cells. |
| `loader-mount.jsx` | 58 | Ring LoaderInline bridge for Phase D3. |
| `modal-bodies.jsx` | 552 | bespoke body-компоненты для openModal(body.kind:'component'). |
| `modal-mount.jsx` | 263 | SspModal: настоящий React-контент в Ring Dialog. |
| `portal.jsx` | 40 | React portal manager. |
| `radio-mount.jsx` | 94 | Ring Radio bridge for Phase D5. |
| `release-create.jsx` | 175 | #48 R1.3 body-компонент модалки «Новый релиз» на СТРОГО Ring UI. |
| `release-state-preview.jsx` | 167 | #48 R2.3 body-компонент модалки «Смена состояний» (СТРОГО Ring UI). |
| `release-view.jsx` | 413 | #48 React-презентация вкладок релиз-менеджмента (строго Ring UI). |
| `reporting-view.jsx` | 1486 | #50 React-презентация вкладок отчётности (строго Ring UI). |
| `select-mount.jsx` | 142 | Ring Select bridge for top-level dropdowns outside Ring Table. |
| `settings-backlog.jsx` | 77 | секция «BacklogSection» формы настроек. |
| `settings-cascade.jsx` | 65 | секция «CascadeSection» формы настроек. |
| `settings-dta.jsx` | 80 | секция «DtaSection» формы настроек. |
| `settings-fields.jsx` | 134 | секция настроек «Отображаемые поля» (68-8). |
| `settings-form.jsx` | 1027 | bespoke SettingsForm для openModal(body.kind:'component'). |
| `settings-links.jsx` | 212 | секция настроек «Связи задач» (#74). |
| `settings-permissions.jsx` | 204 | секция «Управление правами» (#71): таблица «группа × полномочие» вместо 12 мультиселектов в трёх разных секциях. |
| `settings-release.jsx` | 83 | секция «ReleaseSection» формы настроек. |
| `settings-reporting.jsx` | 486 | секция «ReportingSection» формы настроек. |
| `settings-rollup.jsx` | 88 | секция «StateRollupSection» формы настроек. |
| `settings-shared.jsx` | 339 | общие листовые контролы и хелперы формы настроек. |
| `settings-standup.jsx` | 49 | секция «StandupSection» формы настроек. |
| `sprint-lock-toggle.jsx` | 35 | #57-2 (эпик 57) тумблер блокировки создания спринтов в шапке планера (СТРОГО Ring UI — вендоренный Toggle, CSS-сабсет ring-toggle-* в ring-subset.c… |
| `standup-view.jsx` | 175 | Тир D слайс 1, ступень 2 — React-презентация Stand-up. |
| `table-mount.jsx` | 220 | Ring Table bridge for Phase D7. |
| `tabs-mount.jsx` | 74 | Ring Tabs bridge for Phase D6. |

## 3. Бэкенд и workflow

| Файл | Назначение |
|---|---|
| `backend-capacity.js` | Capacity Management backend (#45 R2 «ядро ёмкости»). |
| `backend-core.js` | ОБЩЕЕ ЯДРО (shared core, #25 Ф1) Не handler-файл: НЕ экспортирует exports.httpHandler (V1a). |
| `backend-global.js` | HTTP Handler (GLOBAL scope, #25 Ф1) MAIN_MENU_ITEM-виджет (нет ctx.project). |
| `backend-issuefields.js` | Issue-fields backend (вынос из backend-core.js). |
| `backend-plannerdisable.js` | Planner-disable backend (#80). |
| `backend-project.js` | HTTP Handler (PROJECT scope) #25 Ф1 — тонкая обёртка. |
| `backend-release.js` | Release Management backend (#48 R1.2 «сущность»). |
| `backend-reporting.js` | Оперативная отчётность backend (#50 S1). |
| `backend-sprintlock.js` | Sprint-lock backend (#57-2, epic 57). |
| `backend-userprefs.js` | User-prefs backend (#69 строка 21, эпик «Упрощение»). |
| `workflow-cascade-aggregation.js` | Cascade aggregation parent ← child workflow rule. v1.3.0 — RESOLVED B-1..B-14 (см. .roadmap-source/feature-2-cascade-and-forbid.md): B-1: один общи… |
| `workflow-common.js` | общая инфраструктура workflow-правил. |
| `workflow-dta-aggregation.js` | Differentiated Time Accounting (DTA) workflow rule. v1.2.1 — Acceptance hot-fix on top of v1.2.0: Bug A — workflow.message выходило на EN при русск… |
| `workflow-forbid-container.js` | Forbid direct work-item logging on container issues. v1.3.0 — RESOLVED B-3..B-5 (см. .roadmap-source/feature-2-cascade-and-forbid.md): B-3: без byp… |
| `workflow-state-rollup.js` | State rollup parent.State ← min(children.State). v1.7.0 D128: - Стратегия 'min' (least-progressed child wins). |

### Эндпоинты (`path:` в backend-*.js; scope global — обработчик главного меню, project — проектный)

| Метод | Путь | Scope | Модуль |
|---|---|---|---|
| GET | `capacity` | project | `backend-capacity.js` |
| GET | `capacity-archive` | project | `backend-capacity.js` |
| POST | `capacity` | project | `backend-capacity.js` |
| GET | `calendar` | project | `backend-capacity.js` |
| POST | `calendar` | project | `backend-capacity.js` |
| GET | `absences` | project | `backend-capacity.js` |
| POST | `absences` | project | `backend-capacity.js` |
| GET | `project-fields` | project | `backend-core.js` |
| GET | `sprint-data` | project | `backend-core.js` |
| POST | `sprint-data` | project | `backend-core.js` |
| GET | `history` | project | `backend-core.js` |
| POST | `history` | project | `backend-core.js` |
| GET | `check-settings-manager` | project | `backend-core.js` |
| GET | `check-instance-admin` | project | `backend-core.js` |
| GET | `app-version` | project | `backend-core.js` |
| GET | `check-validator` | project | `backend-core.js` |
| GET | `check-editor` | project | `backend-core.js` |
| GET | `check-assigner` | project | `backend-core.js` |
| GET | `check-history-manager` | project | `backend-core.js` |
| GET | `draft` | project | `backend-core.js` |
| POST | `draft` | project | `backend-core.js` |
| GET | `working-drafts` | project | `backend-core.js` |
| POST | `working-drafts` | project | `backend-core.js` |
| POST | `sync-acl` | project | `backend-core.js` |
| GET | `app-version` | global | `backend-global.js` |
| POST | `filter-planner-projects` | global | `backend-global.js` |
| GET | `last-project` | global | `backend-global.js` |
| POST | `last-project` | global | `backend-global.js` |
| GET | `field-values` | project | `backend-issuefields.js` |
| GET | `get-user-field-values` | project | `backend-issuefields.js` |
| POST | `update-issue-field` | project | `backend-issuefields.js` |
| POST | `refresh-assignees` | project | `backend-issuefields.js` |
| POST | `planner-disabled` | project | `backend-plannerdisable.js` |
| GET | `releases` | project | `backend-release.js` |
| POST | `releases` | project | `backend-release.js` |
| GET | `releases-archive` | project | `backend-release.js` |
| GET | `reporting-access` | project | `backend-reporting.js` |
| GET | `sprint-lock` | project | `backend-sprintlock.js` |
| POST | `sprint-lock` | project | `backend-sprintlock.js` |
| GET | `user-prefs` | global | `backend-userprefs.js` |
| POST | `user-prefs` | global | `backend-userprefs.js` |

## 4. Где что: вопрос → файлы

| Вопрос | Файлы |
|---|---|
| Optimistic lock: rev слотов, 409 rev_conflict, baseRev | `backend-core.js`, `widgets/main/src/data/youtrack-api.js`, `widgets/main/src/domain/sprint-store.js` |
| Слияние правок при конфликте записи вместо отказа | `widgets/main/src/pure/slot-merge-pure.js`, `widgets/main/src/data/youtrack-api.js` |
| Миграции схемы снимков: цепочка, migrateSnap, маркер схемы, лестница депрекации | `backend-core.js`, `tests/unit/schema-evolution.test.js`, `tests/fixtures/snapshots/` |
| Allow-list ключей схемы и настроек | `schema/whitelists.json`, `scripts/sync-backend-whitelists.js` |
| Авторизация: гейты ролей, группы, матрица доступа | `backend-core.js`, `Documentation/SECURITY.ru.md`, `tests/unit/security-matrix-invariant.test.js` |
| Запись в поля задач YouTrack: allow-list полей, видимость, права | `backend-issuefields.js`, `widgets/main/src/domain/validation-controller.js`, `widgets/main/src/pure/sprint-field-pure.js` |
| Сетевой слой фронта: роутинг project/global, дедлайны чтения, обработка 409 | `widgets/main/src/data/youtrack-api.js` |
| Пул бэклога: YT-запрос, пагинация, батчи родителей | `widgets/main/src/domain/backlog-loader.js` |
| Чанкованные массовые операции по 25 | `widgets/main/src/domain/validation-controller.js`, `widgets/main/src/domain/release-controller.js`, `widgets/main/src/data/youtrack-api.js` |
| Ёмкость: расчёт, календарь, отсутствия, архив | `backend-capacity.js`, `widgets/main/src/pure/capacity-pure.js`, `widgets/main/src/domain/capacity-store.js`, `widgets/main/src/domain/capacity-view.js` |
| История спринтов: снимки, экспорт и импорт | `widgets/main/src/domain/history-controller.js`, `widgets/main/src/domain/history-io.js`, `widgets/main/src/domain/history-view.js` |
| Релизы: состав, состояния, откат по истории | `backend-release.js`, `widgets/main/src/domain/release-controller.js`, `widgets/main/src/domain/release-rollback.js` |
| Отчётность: activities, периоды, бисекция | `widgets/main/src/data/reporting-data.js`, `widgets/main/src/domain/reporting-view.js`, `widgets/main/src/pure/reporting-pure.js`, `backend-reporting.js` |
| Гант: история состояний, стрелки связей | `widgets/main/src/domain/gantt-view.js`, `widgets/main/src/data/youtrack-api.js` |
| Связи задач: роли типов связей, дерево | `widgets/main/src/pure/link-roles-pure.js`, `widgets/main/src/pure/release-tree-pure.js` |
| «Обновить из задачи»: слияние по классам полей | `widgets/main/src/domain/refresh-controller.js`, `widgets/main/src/pure/refresh-merge-pure.js` |
| Рабочие копии и черновики | `widgets/main/src/domain/working-copy.js`, `widgets/main/src/domain/draft-store.js` |
| Предпочтения пользователя: localStorage и серверное зеркало | `widgets/main/src/infra/user-prefs.js`, `backend-userprefs.js` |
| Диагностика: панель, слепок состояния | `widgets/main/src/infra/diag-snapshot.js` |
| Модалки и тосты Ring UI | `widgets/main/src/infra/modal-specs.js`, `widgets/main/src/infra/toast-ring.js`, `widgets/main/src/react/modal-bodies.jsx` |
| Локализация | `widgets/main/src/i18n/loader.js`, `widgets/main/src/i18n/i18n-controller.js`, `widgets/main/i18n/` |
| Главное меню: выбор проекта, фильтр проектов | `backend-global.js`, `widgets/main/src/domain/project-nav.js` |
| Отключение планера в проекте | `backend-plannerdisable.js` |
| Блокировка создания спринтов | `backend-sprintlock.js` |
| Workflow-правила: агрегации, подтяжка состояния | `workflow-common.js`, `workflow-cascade-aggregation.js`, `workflow-dta-aggregation.js`, `workflow-state-rollup.js`, `workflow-forbid-container.js` |
| Даты и часовые пояса | `widgets/main/src/pure/date-pure.js`, `widgets/main/src/pure/period-pure.js` |
| Экспорт в Excel и PDF | `widgets/main/src/domain/excel-export.js`, `widgets/main/src/pure/reporting-export-pure.js`, `widgets/main/lib/` |
| Точки версии и релизный гейт | `manifest.json`, `package.json`, `backend-core.js`, `widgets/main/src/core.js`, `scripts/release-check.sh` |
| Сборка: esbuild, вендоринг React и Ring, иконки | `package.json`, `widgets/main/src/react/vendor.js`, `scripts/build-icons.js`, `scripts/extract-ring-subset.js` |
| Арх-гейты: реестр модулей, ратчеты, парити форков | `module-registry.json`, `tests/arch/` |
| Деплой на тест-стенд | `scripts/stand-deploy.sh` |
