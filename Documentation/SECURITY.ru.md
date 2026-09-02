# Модель безопасности — Smart Sprint Planner

> 🇬🇧 [Read in English](../.github/SECURITY.md) · 🇷🇺 По-русски

Актуально для версии **3.34.1**. Модель — server-authoritative: deny-by-default, whitelist-валидаторы, защита от Prototype Pollution и явная ролевая модель.

> Разделы «Роли», «Матрица доступа» и «Угрозы и митигации» перегенерированы из кода по итогам authz-аудита #67 (2026-08-19): матрица покрывает все endpoints обоих handler'ов (project + global). Юнит-инвариант `tests/unit/security-matrix-invariant.test.js` сверяет матрицу с фактическим реестром `core.ENDPOINTS` — рассинхрон роняет гейт.
>
> **v3.32.0 — «Отключить планер в этом проекте»: новый узкий эндпоинт + два серверных гейта.** Аддитивный settings-ключ `plannerDisabled` (bool, admin-тир, preserve-merge для не-настройщика). Пишет его ТОЛЬКО `POST planner-disabled` под ролью settingsManager (fail-closed: без настроенной группы — `plugin_not_configured`; байпас инстанс-админа штатный); обычный settings-save хранимое значение preserve'ит — форма флаг не затирает. Гейт global-делегирования отвечает `403 planner_disabled` для выключенного проекта (exempt только канал включения), гейт `filter-planner-projects` скрывает выключенный проект от всех, кроме проходящих `isSettingsManager` по зеркалу `ssp_acl` (fail-closed) и инстанс-админов. Оба гейта читают ТОЛЬКО актуальный блоб `ssp_settings` — не снимки `history[].settings`. Workflow-правила флагом намеренно не гейтятся. Миграция схемы no-op (3.29.0 → 3.32.0).

> **v3.29.0 — 68-8 «Отображаемые поля»: аддитивный settings-ключ, значения полей нигде не хранятся.** В `SETTINGS_WHITELIST` и `ADMIN_TIER_SETTINGS_KEYS` добавлен `displayFields` — набор колонок трёх таблиц задач (`array<{name,summary,role,my}>`, ≤50 строк, `name` — непустая строка ≤200 с дедупом, три флага — boolean либо null). Admin-тир выбран намеренно: набор общий на проект, поэтому правит его только settings-менеджер, а сейв планировочным менеджером preserve-merge'ит значение из хранилища. Имя ключа намеренно **не** начинается с `field`/`userField`: такие ключи попадают в серверный allow-list записи полей задач (`backend-issuefields.js`), а этой настройке там делать нечего. **Нового серверного эндпоинта не появилось**: значения полей читает фронт через `host.fetchYouTrack`, то есть под правами самого пользователя — YouTrack не отдаёт того, что человеку не видно, и персональная видимость получается моделью доступа самого трекера, а не логикой плагина. Значения не сохраняются ни в составе спринта, ни в снимках, ни в истории — схема данных не изменилась (миграция 3.28.0 → 3.29.0 no-op). Записи полей задач фича не добавляет: колонки только показывают. Значение поля может содержать сырой HTML, поэтому ячейка-чип экранируется явно, а цвет из YouTrack валидируется перед подстановкой в `style` (регресс — `tests/unit/fieldvalues-loader.test.js`). Authz-гейты, группы и матрица доступа — без изменений.

> **v3.28.0 — #74 «Связи задач» фаза 1: аддитивный settings-ключ, модель прав не менялась.** В `SETTINGS_WHITELIST` и `ADMIN_TIER_SETTINGS_KEYS` добавлен `linkTypeRoles` — таблица «тип связи × роль» (`array<{type,hier,dep,info}>`, ≤50 строк, `type` — непустая строка ≤200 с дедупом, стороны — enum `source|target|null`, `info` — boolean). Admin-тир выбран намеренно: ключ определяет, по каким связям строятся дерево бэклога и состав релиза, поэтому правит его только settings-менеджер, а сейв планировочным менеджером preserve-merge'ит значение из хранилища. Приложение связи только **читает** — ни один путь записи в YouTrack не добавлен. Легаси-пара `cascadeParentLinkInward`/`Outward` вошла в шаг 1 лестницы депрекации: backend принимает её как прежде и логирует `SCHEMA_DEPRECATION_WARN`, а форма продолжает писать пару **производной** от таблицы — оба workflow-правила (каскадная агрегация, подтяжка состояния родителя) читают этот блоб напрямую, и «просто перестать писать» отняло бы у них настройку. Hard-removal — не ранее чем через один minor. Authz-гейты, группы и матрица доступа — без изменений.

> **v3.27.0 — #73 «Роли-участницы спринта»: аддитивный ключ схемы, модель прав не менялась.** В whitelist'ы `ALLOWED_SPRINT_KEYS`/`ALLOWED_HISTORY_SNAP_KEYS` добавлен optional-ключ `roles` (массив ⊆ `ROLE_KEYS`, дедуп, серверная валидация `validateSprintRoles` на WRITE и READ). Валидация намеренно **независима от `settings.activeRoles`**: проверка «подмножество настроек проекта» выполняется только UI-гейтом диалога создания — write-гейт по настройкам бракова́л бы легитимный сейв после их смены. Набор ролей спринта — фильтр отображения, не команда на удаление: сервер не удаляет и не фильтрует записи истории по набору (инвариант закреплён тестом на прод-слепке). Authz-гейты, группы и матрица доступа — без изменений.
>
> **v3.26.0 — #71 «Управление правами» одной таблицей: только представление.** Двенадцать групповых полномочий (шесть планировочных + четыре релизных + два контура отчётности) собраны из трёх секций настроек в одну таблицу «группа × полномочие». **Модель прав не менялась:** ключи настроек, `ADMIN_TIER_SETTINGS_KEYS`, whitelist'ы, `mergeAdminTierFromStored`, предикаты ролей и матрица доступа ниже — без изменений; путь сохранения формы не тронут ни строкой (round-trip-инвариант: открыть → сохранить без правок → все 24 массива byte-identical, юнит + смоук). Секция остаётся admin-тиром (`ADMIN_SECTION_IDS.groups`) — планировочному менеджеру она по-прежнему не видна. Строка настройщика (`settingsManagerGroup`) показывается только для чтения: она живёт в app-настройках проекта и в whitelist настроек плагина намеренно отсутствует. Новое в безопасности — **предупреждающие маркеры, не гейты**: автогруппы YouTrack («Все пользователи», «Зарегистрированные пользователи», команда проекта) помечаются как нерабочий носитель прав, потому что `ctx.currentUser.groups` отдаёт приложению только явно назначенные группы; пустая обязательная колонка («Валидация»/«Редактирование») даёт предупреждение о deny-by-default. Сохранение ни один из маркеров не блокирует — поведение бэкенда прежнее.

> **v3.25.0 — #67 закрыт целиком: «плагин не даёт больше, чем YouTrack».** Эксперимент на стенде YT 2025.3 (пользователь с ролью Issue Reader — чтение задач без `UPDATE_ISSUE`, в группах плагина) дал худший из двух исходов: платформа **не проверяет внутри обработчика приложения ни право пользователя на запись поля, ни видимость задачи** — `entities.*` исполняется с делегированными правами (документация JetBrains, «Permission delegation»). Через `POST /update-issue-field` такой пользователь менял State и исполнителя, в том числе у задачи с `Visible to`, которую не видит даже через REST; `POST /refresh-assignees` отдавал её исполнителя и состояние. Закрыто сервером, fail-closed на исключение SDK:
> - `update-issue-field`: `Issue.isVisibleTo(ctx.currentUser)` — невидимая задача отвечает `issue_not_found` (неотличимо от несуществующей, без оракула); затем `Issue.canBeWrittenBy(<поле проекта>, ctx.currentUser)` — без права YouTrack на поле ответ `field_not_writable`, поле не трогается. Группы плагина остаются вторым замком, не заменой первого: Contributor проекта пишет как раньше.
> - `refresh-assignees`: невидимая задача отдаётся как `null` — как несуществующая.
> - Обогатитель (v3.18.0) проверен на живой платформе со скрытой задачей: не обогащает, счётчик её не выдаёт.
> - Попутно подтверждено живьём: группа **«All Users»** в настройках прав плагина не даёт прав никому — `ctx.currentUser.groups` содержит только явно назначенные группы.
> Endpoints, whitelist'ы и схема данных не менялись; матрица дополнена в строках `update-issue-field`/`refresh-assignees`.

> **v3.24.1 — R6 «Зеркало», попутная полировка UI.** Только CSS и два UI-текста: модель прав, endpoints, whitelist'ы и схема данных не менялись, матрица доступа без изменений. Горизонтальный отступ у текстовых `.ring-button-inline` кнопок; ❄/🔒 заменены иконкой `lock` из уже вендоренного `@jetbrains/icons` (статический SVG из бандла, пользовательский ввод не участвует).

> **v3.24.0 — #69 R4 «Развилки» (строки 18, 20, 22, 28; ⚖ владелец 2026-08-22).** UI-срез: модель прав, endpoints, whitelist'ы и схема данных не менялись; матрица доступа без изменений.
> - **18** — эмодзи в интерфейсе заменены иконками из набора `@jetbrains/icons` (Apache-2.0, уже вендорен в `widgets/main/src/icons/`; +4 SVG: flag/success/cancel/pencil). Новый строковый мост `window.__SSP_ICON_HTML` (генерится `build-icons.js`, слой infra в реестре) и React-компонент `RingIcon` — оба рендерят только статические SVG из бандла (`dangerouslySetInnerHTML` / `innerHTML` с фиксированным словарём, пользовательский ввод не участвует).
> - **20** — нативный `<select>` языка в шапке зафиксирован явным исключением из мандата Ring UI (`CLAUDE_SHARED §3`), кода не касается.
> - **22** — дотранслированы ≈8–9 ключей ×13 локалей (словари).
> - **28** — дерево состава релиза (`release-view.fetchIssueData` → `_linkParents`) читает родителей по настройке `cascadeParentLinkInward` (фраза связи со стороны задачи; дефолт «subtask of» = прежнее поведение) вместо захардкоженного `linkType.name === 'Subtask'`; тот же REST-запрос `issues?fields=…links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))` под правами пользователя, что и у бэклога. Изменение поведения только у команд с другой связью.

> **v3.23.0 — #69 R3 «Лестницы», шаг 2 (строка 27, hard-removal).** Вторая ступень лестницы ≥2 minor после soft-deprecation v3.22.0 — схема сужается, новых endpoints и прав нет.
> - **Whitelist'ы сужены:** `editingFromHistory`/`historyIdx` сняты с `ALLOWED_SPRINT_KEYS` (`schema/whitelists.json` → sync), `migratedTo` — с `ALLOWED_SETTINGS_KEYS` (+ валидатор); `items` снят с верхнеуровневого списка тела `POST sprint-data` (`ALLOWED_SPRINT_DATA_KEYS`) — ключ молча отбрасывается `filterKeys`, warning шага 1 больше не выдаётся. Schema-маркер `CURRENT_PLUGIN_VERSION` → `3.23.0`; новая запись `SCHEMA_MIGRATIONS` `3.6.0 → 3.23.0` (`delete` legacy-ключей спринта; `migratedTo` чистит `migrateSettingsObj` шаг 3 — и в `history[].settings` через `migrateHistoryArr`), `SCHEMA_BUMP` пишется в `migrationLog` при первом чтении каждого снимка.
> - **Silent strip на WRITE** (класс `gantt` v6.1.0): миграция применяется только на READ и не персистится, а `assignerSync`, bulk-POST `working-drafts` (вложенный `sprint` старых/чужих драфтов) и сохранение настроек/confirm со stale-вкладки несут legacy-ключи на WRITE мимо миграции — `stripDeprecatedSprintKeys` расширен (`editingFromHistory`/`historyIdx`), новый `stripDeprecatedSettingsKeys` (`migratedTo`) применяется к `body.settings` и к `history[].settings` внутри `stripDeprecatedHistoryKeys`. Прямой strict-валидатор без strip отвергает ключи как неизвестные. Прав и границ доверия это не меняет — только форма принимаемых блобов.
> - **`ssp_items` снят из `entity-extensions.json`** вместе с READ-fallback в `GET sprint-data` (и фронтовой веткой `r.items`); удалён фронтовой `migrateEditingFromHistoryV52` (+ toast `wcMigrationNotice` ×15 локалей) и защитные `delete` legacy-ключей в `validation-controller`/`working-copy`/`project-nav`. Проверено на стендах обоих форков: проект с уже записанным значением снятого extension-property читается штатно.
> - Фикстура `tests/fixtures/snapshots/3.23.0/`; compat-регресс на `3.21.0` (несёт legacy-ключи) и D109-гейт на прод-фикстуре (`migratedTo` ×9 в embedded settings) зелёные.

> **v3.22.0 — #69 R3 «Лестницы», шаг 1 (строки 21 и 27).**
> - **Строка 21 — `GET/POST user-prefs` (global-only, `backend-userprefs.js`)**: единый блоб предпочтений пользователя `User.extensionProperties.ssp_user_prefs` (новое объявление в `entity-extensions.json`). Фронт зеркалит в него localStorage-ключи (язык, роль, сортировка, рельс, хинт, кэш версии, последний проект) — на сборках YouTrack, где песочница виджета без `allow-same-origin` (например 2025.3), `localStorage` бросает SecurityError и предпочтения не переживали перезагрузку. Доступ — любой аутентифицированный пользователь, **только свой слот** (`ctx.currentUser`, projectKey не принимается); сервер — allowlist 7 ключей + cap длины значения (строка; `null` = удалить) + cap блоба 2 КБ; reason-коды без эха значений. Новых прав и внешних запросов нет.
> - **Строка 27, шаг 1 — soft-deprecation legacy-ключей** (лестница ≥2 minor): путь записи `ssp_items` в `POST sprint-data` закрыт — тело с `items` принимается, но не пишется (`warnings: deprecated:items_ignored`, ключа нет в `saved`); READ-fallback остаётся. Ключи спринта `editingFromHistory`/`historyIdx` и настроек `migratedTo` фронт больше не пишет и стрипает из загруженных блобов; на WRITE сервер их принимает (whitelist не менялся), помечая в `migrationLog` записью `SCHEMA_DEPRECATION_WARN`. Hard-removal (миграция `delete`, снятие из whitelist, `SCHEMA_BUMP`) — шаг 2, не раньше v3.23.0. Фикстура `tests/fixtures/snapshots/3.21.0/` + compat-регресс.

> **v3.21.0 — #69 R2 «Сборка».** Только сборка: Recharts вынесен из `vendored-react.chunk.js` в ленивый `recharts.chunk.js` (грузится relative-script'ом по паттерну pdfmake/XLSX при монтировании панели отчётности; React/ReactDOM — через шимы из `SSP_VENDORED`, второй инстанс React не бандлится), esbuild `--charset=utf8`. Новых эндпоинтов, прав и внешних запросов нет; allowlist marketplace-зипа расширен на чанк, `release-check.sh` проверяет его наличие.

> **v3.20.1 — #69 строка 2 (кнопки сохранения).** `doSaveRoleHeader` («Сохранить ресурс роли») сужен до записи `_sprint[role.resKey]` — общие поля спринта (name/dates/goal/Sprint/Version) из формы «Вводных» больше не переписываются per-role кнопкой; гейт «выбранный спринт ≠ рабочий слот» (#70) сохранён в обоих сейверах. Модель доступа и серверные валидаторы не менялись.

> **v3.18.0 — остаток authz-аудита #67 + серверное обогащение состава:** псевдороль `editorOrValidator` — валидатор дочищает слот спринта (`sprint:null`) при удалении последней записи истории, редактор снимает авто-снапшот узкой веткой `POST /history?action=snapshot` (upsert одной записи, без удалений); локальный сброс слота на фронте — только после ака сервера (ordering-фикс «спринта-призрака»); allow-list `fieldName` в `update-issue-field` (только настроенные поля + фолбэк `'State'`); серверные аудит-штампы `sprint.updatedBy/At`, `confirmedBy`/`finishedBy`, `revisions[].by` (`import-replace` осознанно не штампуется — бэкап сохраняет атрибуцию); досинк зеркала `ssp_acl` после settings-save; cap тела `filter-planner-projects` (256 КБ) + единый `project_unavailable` вместо пары «нет проекта»/«нет прав» (оракул закрыт). Серверное обогащение состава: item с `issueId` без `title` наполняется из задачи (title/state/priority/xpriority/system/externalTicketId, только пустое) — изоляция проекта + видимость fail-closed (`Issue.isVisibleTo`), лимит 200/запрос, итог в `enriched: {count, skipped}`. Чтение viewer'ом полного блоба настроек оставлено и зафиксировано как принятое ограничение (модель доверия «участник проекта = viewer»).

> **v3.17.0 — фиксы authz-аудита #67:** гейт по эффекту на очистку истории (укорочение более чем на 1 запись за один POST требует `historyManager`; порог выбран потому, что удаление одной записи корзиной — штатная операция валидатора, а массовое усечение одним POST UI не порождает); `?action=validate` больше не снимает editor-гейт со сброса слота (`sprint:null`); флаг сбоя загрузки реестра отсутствий блокирует сохранение (потеря данных обычным кликом закрыта); `editorLogin` рабочей копии всегда выводится из хранилища; `hasOwnProperty`-guard в `history?action=assignerSync`.

---

## Принципы

1. **Single source of truth для авторизационной группы.**
   `settingsManagerGroup` живёт **только** в `ctx.settings` (project-scoped app-settings, задаётся через Project Settings → Apps). Backend никогда не читает её из тела запроса или из `ssp_settings`.

2. **Deny by default.** Все мутирующие endpoint'ы возвращают `{success: false, reason: 'plugin_not_configured'}`, пока `settingsManagerGroup` не задана. См. принцип №7 о success-flag паттерне.

3. **Никаких клиентских claims.** Клиент не передаёт свои группы в теле запроса — backend сам читает `ctx.currentUser.groups` и сверяет с сохранёнными настройками.

4. **Whitelist over blacklist.** Каждый POST проходит четыре фильтра:
   1. `JSON.parse` + `sanitizeDeep` — отвергает `__proto__` / `constructor` / `prototype` на любой глубине до 10 уровней.
   2. `filterKeys(body, ALLOWED_*_KEYS)` — белый список ключей верхнего уровня.
   3. Типизированный валидатор (`validateSprint`, `validateRoleItems`, `validateSettings`, `validateHistory`, `validateWorkingDraft`) с whitelist'ом ключей, типизацией и диапазонами значений.
   4. Финальная проверка размера JSON против `MAX_PROP_SIZE` (500 КБ для свойств, 1 МБ для истории).

5. **URL-безопасность.** Все `href` строятся через `safeUrl()` (https/http only, длина ≤ 2000). Все текстовые вставки — через `esc()` (`& < > " '`). SRI integrity — для всех CDN-зависимостей.

6. **Storage в нейтральном виде.** Статусы и inclusion-статусы хранятся как латинские enum-коды (`PLANNING`, `CONFIRMED`, `INC_PLANNED`, ...). Локализация — только на отображении. Это устраняет привязку storage к языку UI.

7. **Fail-closed диагностика.** При ошибках валидации/авторизации backend возвращает короткий `reason` без эха содержимого тела. Подробные логи — только в YouTrack server log при `enableDebugLog=true`.

   **Success-flag response pattern.** Все endpoint'ы используют единую форму ответа: HTTP-статус, как правило, `200 OK` независимо от бизнес-результата (YouTrack app-framework HTTP host нормализует код для cross-version совместимости). Тело ответа всегда содержит `{success: true, ...}` при успехе или `{success: false, error: '<short>', reason: '<machine-readable>'}` при отказе. **Клиент ОБЯЗАН проверять `success` flag, не HTTP-статус.** Backend-хелперы `forbidden()` и `badRequest()` устанавливают `ctx.response.status` для полноты, но downstream-маршрутизация может его переписать; не полагайтесь на численный код.

---

## Закрытие chicken-and-egg

Если бы `settingsManagerGroup` хранилась в мутируемых extension properties, любой аутентифицированный пользователь мог бы записать настройки на свежей установке и захватить все три уровня доступа (`editGroups`, `validationGroups`, `settingsManagerGroup`).

В Smart Sprint Planner v1.0.0:

- `settingsManagerGroup` живёт **только** в app-settings и задаётся **только** через Project Settings → Apps → Smart Sprint Planner. Из самого плагина её изменить невозможно.
- Все функции прав (`isSettingsManager`, `isEditor`, `isValidator`, `isHistoryManager`, `isAssigner`) возвращают `false` при отсутствии конфигурации.
- На свежей установке плагин в режиме read-only до явной конфигурации админом проекта.
- В `validateSettings` нет ключа `settingsManagerGroup` в whitelist — даже settingsManager не может сохранить её через POST.

---

## Роли (источники правды)

13 ролей: 12 групповых + 1 контекстная (`wcOwner`). Плюс две псевдороли-объединения, существующие только как аргумент `authzGuard` (см. под таблицей).

| Роль | Где задаётся | Кто может назначать |
|------|--------------|---------------------|
| `settingsManager` | `ctx.settings.settingsManagerGroup` (project-scoped app-settings) | Project admin / Global admin (через Project Settings → Apps) |
| `editor` | `ssp_settings.editGroups` / `editGroupNames` | settingsManager |
| `validator` | `ssp_settings.validationGroups` / `validationGroupNames` | settingsManager |
| `historyManager` | `ssp_settings.historyClearGroups` / `historyClearGroupNames` · **байпаса админа нет (#66)** | settingsManager |
| `assigner` | `ssp_settings.assignerGroups` / `assignerGroupNames` | settingsManager |
| `planningManager` | `ssp_settings.planningManagerGroups` / `planningManagerGroupNames` | settingsManager |
| `releaseManager` | `ssp_settings.releaseManagerGroups` / `releaseManagerGroupNames` | settingsManager |
| `releaseEngineer` | `ssp_settings.releaseEngineerGroups` / `releaseEngineerGroupNames` | settingsManager |
| `sprintLockManager` | `ssp_settings.sprintLockGroups` / `sprintLockGroupNames` | settingsManager |
| `reportingViewerA` | `ssp_settings.reportingGroupsA` / `reportingGroupsANames` | settingsManager |
| `reportingViewerB` | `ssp_settings.reportingGroupsB` / `reportingGroupsBNames` · **B ⊇ A** | settingsManager |
| `viewer` | любой аутентифицированный пользователь проекта | YouTrack project permissions |
| `wcOwner` *(контекстная)* | `editorLogin === ctx.currentUser.login` в `_workingDrafts[key]` | автоматически при `POST /working-drafts` |

**Псевдороли `authzGuard` (объединения, не отдельные группы):**

- `assigner` как аргумент гейта — объединение **пяти** ролей: editor ∨ assigner ∨ settingsManager ∨ releaseManager ∨ releaseEngineer (+ байпас инстанс-админа).
- `editorOrValidator` (#67 H5, v3.18.0) — editor ∨ validator. Обслуживает две узкие ветки: сброс слота `sprint:null` (валидатор дочищает историю вместе со слотом; сброс слабее full-replace под `?action=validate`) и `history?action=snapshot` (авто-снапшот у редактора; upsert одной записи, без удалений).
- `settingsOrPlanning` — settingsManager ∨ planningManager. planningManager пишет только планировочный тир настроек: admin-тир ключи (все групп-ключи, sprint-lock, reporting-поля) preserve-merge'атся из хранимого — самоэскалация записью групп невозможна.

**Байпас глобального администратора проектов** (#51): пользователь с глобальным правом `UPDATE_PROJECT` считается членом любой роли планера во всех проектах, включая проекты без настроенной `settingsManagerGroup`.

> **Исключение — `historyManager` (#66, с v3.16.1).** Полная очистка (`history?action=clear`), замена истории из файла (`history?action=import-replace`) и — с v3.17.0 (#67) — массовое усечение истории основной веткой записи необратимы, поэтому байпас на эту роль **не распространяется**: нужно явное членство в `historyClearGroups`/`historyClearGroupNames`. Вырез сделан и в `isHistoryManager()`, и в раннем admin-return `authzGuard()` — чтобы кнопка в UI и серверный гейт совпадали. Лок-аута нет: администратор сохраняет `settingsManager` и может назначить группу очистки себе.

**Роли ортогональны** (уточнение #67): validator не наследует editor и наоборот. Верно узкое включение: validator ⊇ editor **по записям слотов** `ssp_sprint`/`ssp_roleitems` под `?action=validate` (осознанная механика v3.2.1). Задокументированные объединения — `assigner` и `editorOrValidator` (см. псевдороли) поверх viewer: точечные ветки, не наследование ролей целиком.

**`wcOwner`** (working copy owner) — единственная роль, авторизация которой не из `ssp_settings` / `ctx.settings.*`, а из самого `_workingDrafts[key].editorLogin`. С v3.17.0 (#67) backend выводит `editorLogin` из хранилища на каждом POST — клиентское значение не персистится никогда. Перехват чужой WC невозможен: перезапись чужого ключа со своим логином → `not_owner`; bulk-flush, несущий чужие записи, молча оставляет серверную версию. `settingsManager` может удалить любую WC.

---

## Матрица доступа по endpoints

Перегенерирована из кода (#67, 2026-08-19): `core.ENDPOINTS` — 34 project-endpoint'а; global-handler — те же endpoints через `?projectKey=` (кроме `sync-acl` и `app-version`) + 4 собственных. Инвариант «матрица = код» — `tests/unit/security-matrix-invariant.test.js`.

### Project scope (`backend-project.js` → `core.ENDPOINTS`)

`?action=…`-строки — ветки того же endpoint'а с иной ролью; строка без `action` — основная ветка.

<!-- authz-matrix:project:begin -->
| Method | Path | Минимальная роль |
|--------|------|------------------|
| GET    | `project-fields` | viewer |
| GET    | `sprint-data` | viewer (ответ включает весь блоб `ssp_settings`, вкл. групп-ключи ролей) |
| POST   | `sprint-data` (`body.sprint`/`roleItems`/`settings`) | editor; **ветка `sprint:null` (сброс слота, в т.ч. парный `roleItems`-гейт) — editor ∨ validator (#67 H5)**; item'ы без `title` обогащаются сервером из задач — изоляция проекта + `isVisibleTo`, лимит 200 |
| POST   | `sprint-data` (`body.settings`) | settingsManager ИЛИ planningManager (admin-тир preserve-merge) |
| POST   | `sprint-data?action=validate` | validator (пишет `sprint`/`roleItems` без editor — осознанно, v3.2.1; ветка `sprint:null` — editor ∨ validator, #67) |
| POST   | `sprint-data?action=assignerSync` | assigner-объединение (partial save только `personalPlanning`) |
| GET    | `history` | viewer |
| POST   | `history` | validator; **укорочение более чем на 1 запись — historyManager (#67, без байпаса админа)**; аудит-поля штампуются сервером (#67 H8) |
| POST   | `history?action=snapshot` | editor ∨ validator (upsert ровно одной записи по `sprintId`, ничего не удаляет — #67 H5; аудит-штампы H8) |
| POST   | `history?action=assignerSync` | assigner-объединение (partial save `personalPlanning` в существующих snap'ах) |
| POST   | `history?action=clear` | historyManager (без байпаса админа, #66) |
| POST   | `history?action=import-replace` | historyManager (без байпаса админа, #66) |
| GET    | `working-drafts` | viewer (возвращает рабочие копии ВСЕХ пользователей) |
| POST   | `working-drafts` | validator (`editorLogin` — из хранилища, #67) |
| POST   | `working-drafts?action=delete&key=…` | validator + (wcOwner ИЛИ settingsManager), иначе `not_owner` |
| GET    | `draft` | viewer (только слот currentUser) |
| POST   | `draft` | viewer (пишет только слот currentUser; `?action=clear` — удаляет свой слот) |
| GET    | `check-settings-manager` | viewer |
| GET    | `check-instance-admin` | viewer |
| GET    | `check-validator` | viewer |
| GET    | `check-editor` | viewer |
| GET    | `check-assigner` | viewer |
| GET    | `check-history-manager` | viewer |
| GET    | `app-version` | viewer |
| POST   | `sync-acl` | viewer (пишет зеркало `ssp_acl` ТОЛЬКО из `ctx.settings`, тело не читается) |
| GET    | `capacity` | viewer (грейды, ставки, аллокации ростера) |
| GET    | `capacity-archive` | viewer |
| POST   | `capacity` | settingsManager ИЛИ planningManager (`approvedBy` — серверный штамп) |
| GET    | `calendar` | viewer |
| POST   | `calendar` | settingsManager |
| GET    | `absences` | viewer (кто и когда отсутствует) |
| POST   | `absences` | settingsManager ИЛИ planningManager |
| GET    | `field-values` | viewer |
| GET    | `get-user-field-values` | viewer |
| POST   | `update-issue-field` | assigner-объединение (типы: `period`/`enum`/`state`/`version`/`owned`/`build`/`user`; изоляция проекта; `fieldName` — длина/символы + **allow-list настроенных полей, #67 H7**; **v3.25.0: `Issue.isVisibleTo` → `issue_not_found`, `Issue.canBeWrittenBy` по правам самого пользователя → `field_not_writable`**) |
| POST   | `refresh-assignees` | **viewer** (bulk-чтение assignee/state до 200 issueId за запрос; **v3.25.0: невидимая пользователю задача → `null`**) |
| GET    | `releases` | viewer |
| GET    | `releases-archive` | viewer |
| POST   | `releases` | settingsManager ИЛИ releaseManager; releaseEngineer — только advance-дифф (`engineerDiffAllowed`) |
| GET    | `reporting-access` | viewer (ответ — флаги контуров A/B по членству) |
| GET    | `sprint-lock` | viewer |
| POST   | `sprint-lock` | sprintLockManager |
| POST   | `planner-disabled` | settingsManager (#80: единственный писатель `plannerDisabled`; fail-closed — без настроенной группы `plugin_not_configured`) |
<!-- authz-matrix:project:end -->

### Global scope (`backend-global.js`)

Все project-endpoints, кроме `sync-acl` и `app-version`, доступны через global-URL с `?projectKey=<KEY>`: адаптер резолвит проект и применяет read-gate (`READ_PROJECT_BASIC`) **до** ролевой логики ядра — ролевые проверки не ослабляются. **#80:** при `ssp_settings.plannerDisabled === true` делегирование отвечает `403 planner_disabled` (гейт читает только актуальный блоб проекта, не историю); единственное исключение — `planner-disabled` (канал включения обратно). В `filter-planner-projects` отключённый проект возвращается (с `disabled: true`) только пользователям, проходящим `isSettingsManager` по зеркалу `ssp_acl` (fail-closed), либо инстанс-админам. «Нет проекта» и «нет прав» отвечаются единым `project_unavailable` (#67 H11 — оракул существования проектов закрыт). Собственные endpoints global-handler'а:

<!-- authz-matrix:global:begin -->
| Method | Path | Минимальная роль |
|--------|------|------------------|
| GET    | `app-version` | аутентификация (статика, без read-gate — бейдж версии до выбора проекта) |
| POST   | `filter-planner-projects` | аутентификация (арбитр picker'а: до 5000 ключей за запрос; cap тела 256 КБ, #67 H11) |
| GET    | `last-project` | аутентификация (свой слот) |
| POST   | `last-project` | аутентификация (пишет только свой слот) |
| GET    | `user-prefs` | аутентификация (свой слот; blob предпочтений `ssp_user_prefs`, строка 21) |
| POST   | `user-prefs` | аутентификация (пишет только свой слот; allowlist 7 ключей + cap 2 КБ) |
<!-- authz-matrix:global:end -->

`viewer` — любой аутентифицированный пользователь проекта. Все остальные роли требуют настроенного `settingsManagerGroup` (deny-by-default иначе). `wcOwner` — контекстная роль (см. таблицу ролей выше).

---

## Угрозы и митигации

| # | Угроза | Митигация |
|---|--------|-----------|
| 1 | **Захват настроек на свежей установке (chicken-and-egg)** | `settingsManagerGroup` только в app-settings; deny-by-default; нет endpoint'а для записи `settingsManagerGroup` |
| 2 | **Подмена ролей через body** | Backend не читает `body.editGroups` / `validationGroups` / `historyClearGroups` / `settingsManagerGroup` для авторизации; только `ctx.currentUser.groups` |
| 3 | **Случайная или злонамеренная очистка истории** | Отдельная роль `historyManager` без байпаса админа (#66); кнопка очистки скрыта в UI; с v3.17.0 (#67) гейт стоит **по эффекту**: и `?action=clear`, и основная ветка `POST /history`, укорачивающая историю более чем на 1 запись, требуют `historyManager`. Остаточное право валидатора — удаление по одной записи (штатная корзина UI). |
| 4 | **Prototype Pollution** | `sanitizeDeep` отвергает `__proto__` / `constructor` / `prototype` на глубине до 10 уровней |
| 5 | **Запись «мусора» в settings** | Жёсткий whitelist `ALLOWED_SETTINGS_KEYS` + типизация + диапазоны (rate, NKC, kpe) |
| 6 | **XSS через данные YouTrack** | Все вставки через `esc()` (5 символов); все `href` через `safeUrl()` (https/http only); никакого `eval` / `Function` / `document.write` |
| 7 | **Tabnabbing через `target=_blank`** | На всех внешних ссылках `rel="noopener noreferrer"` |
| 8 | **Поломка SRI у CDN xlsx** | `integrity="sha384-..."` + `crossorigin="anonymous"` на загрузке xlsx — браузер блокирует подмену |
| 9 | **DoS через большое тело запроса** | `MAX_REQUEST_BODY=2 МБ` в `getBody`, `MAX_PROP_SIZE=500 КБ` на каждое свойство (история — 1 МБ) |
| 10 | **Инъекции в `fieldName`** | Валидация запрещает только control chars и `< > "`; имена YouTrack-полей с точками/скобками/амперсандами проходят. Сам YouTrack-API делает корректный lookup поля без SQL/path-конкатенации. |
| 11 | **Утечка диагностики** | Все ошибки backend возвращают `internal_error` без эха содержимого; детали — только в server log при `enableDebugLog` |
| 12 | **Подмена/подделка персональных черновиков** | Черновики хранятся в `ssp_drafts`, scoped per-user (ключ слота — `ctx.currentUser.login`, не передаётся клиентом). Поле `data` — opaque blob, сервер его не интерпретирует. Лимиты: 256 КБ на пользователя; 1 МБ суммарно по проекту. |
| 13 | **Перехват чужой working copy** *(уточнено в v3.17.0)* | `POST /working-drafts` (bulk): чужой ключ с подставленным своим логином → `not_owner`; чужой ключ в bulk-flush → серверная версия побеждает молча; `editorLogin` каждой записи выводится из хранилища, клиентское значение не персистится (#67). `?action=delete&key=…`: только wcOwner или `settingsManager`. |
| 14 | **Conflict-replay (перезапись чужих параллельных правок)** *(переформулировано в v3.17.0 — по коду)* | Сверка `baseSnapshotHash` выполняется **на клиенте** (конфликт-флоу «Конфликт версий»); сервер поле только валидирует как строку. Серверная защита — optimistic lock `baseRev` на слотах `sprint-data`/`history`/`releases`/`absences`: расхождение → `rev_conflict`. Ограничение (по дизайну): клиент без `baseRev` проходит в режиме last-write-wins — lock advisory. Внешним интеграциям `baseRev` обязателен по контракту; серверный mandatory-lock осознанно не введён (#67 H11). |
| 15 | **Runaway-размер `_workingDrafts`** | Лимиты: 256 КБ на одну WC, 480 КБ суммарно по `ssp_workdrafts`. `validateWorkingDraft` проверяет `revisions.length ≤ 1000`. Lazy-purge на загрузке: WC старше 30 дней или orphan (без базового снимка) автоматически удаляются. |
| 16 | **Эскалация прав через `assignerSync`** | `action=assignerSync` разрешает запись **только** в `personalPlanning` (assignee + start/end-dates). Backend фильтрует тело до этого подмножества; попытка передать `body.sprint.items` / `body.settings` / прочее — silent strip. assigner не может изменить состав спринта, ёмкость роли, статус или валидацию. |
| 17 | **DoS через большой батч в `refresh-assignees`** *(уточнено в v3.17.0 — по коду)* | Жёсткий лимит **200 issueId на запрос** (`MAX_REFRESH_ASSIGNEES_BATCH`); при превышении — `invalid_issue_ids`. Каждый issueId проверяется regex'ом `^[A-Za-z][A-Za-z0-9_]*-\d+$` (строчные буквы допустимы), `fieldName` — на длину и запрещённые символы. Ограничение (принятый остаток, #67 H11): лимита на число запросов нет — дёшево не реализуется в stateless-handler'е. |
| 18 | **Подделка `editorLogin` через body** *(закрыто в v3.17.0, #67)* | До v3.17.0 серверный штамп ставился только на новые записи — для своей существующей записи клиентское значение уходило в хранилище (чужой логин → персистентная блокировка правки; `null` → бесхозная запись). Теперь `editorLogin` каждой записи выводится из хранилища (существующая — прежний владелец, новая/бесхозная — пишущий). С v3.18.0 (#67 H8) серверные аудит-штампы закрывают и остальные поля: `sprint.updatedBy/At` — всегда от сервера; `confirmedBy`/`finishedBy` — при отличии от хранимого штампуются автором запроса; `revisions[].by` — для новых записей. `?action=import-replace` осознанно не штампуется (восстановление бэкапа сохраняет атрибуцию). |
| 19 | **Race condition между удалением и сохранением `/working-drafts`** | YouTrack extension-properties атомарны на уровне POST/SET; concurrent `?action=delete` + POST разрешается либо в сохранение, либо в удаление, без частичного состояния. UI справляется через retry + refresh state из `GET /working-drafts`. |
| 20 | **Устаревание зеркала `ssp_acl` при смене settings-manager-группы** *(#67 H9, v3.18.0)* | Членство в группе всегда live из `ctx.currentUser.groups`; устаревает только сама группа в зеркале global-режима. Досинк: init проектного виджета + каждый успешный settings-save (`syncAclMirror`). Принятое ограничение: после смены группы откройте проектный виджет или сохраните настройки. |
| 21 | **Чтение viewer'ом полного блоба настроек / чужих черновиков** *(#67 H10, оставлено)* | Модель доверия «участник проекта = viewer»: `GET /sprint-data` отдаёт групп-ключи ролей и тарифные настройки, `GET /working-drafts` — рабочие копии всех. Эскалации нет — авторизация не читает настройки из тела; обрезка admin-тира на GET отклонена (риск регрессии UI-гейтов). |
| 22 | **Оракул существования проектов через global-адаптер** *(#67 H11, закрыто в v3.18.0)* | `project_not_found`/`project_access_denied` схлопнуты в единый `project_unavailable` — перечисление ключей проектов инстанса по разнице ответов невозможно. |
| 23 | **«Отмывание» названий скрытых задач через серверное обогащение** *(v3.18.0)* | Обогатитель читает задачу на сервере и кладёт данные в `ssp_roleitems`, читаемый любым viewer'ом → fail-closed: `Issue.isVisibleTo(ctx.currentUser)` до обогащения; невидимая задача неотличима в ответе от несуществующей (счётчик `skipped` считает только перелимит — не оракул). Изоляция проекта — как в `refresh-assignees`/`update-issue-field`. |
| 24 | **Запись в задачу мимо прав YouTrack самого пользователя** *(#67 Q1, стенд 2026-08-23, закрыто в v3.25.0)* | Платформа исполняет `entities.*` внутри обработчика с делегированными правами и не проверяет ни `UPDATE_ISSUE`, ни `Visible to`: член групп плагина с одним правом чтения менял State/исполнителя, в том числе у скрытой от него задачи. `update-issue-field` теперь сам проверяет `Issue.isVisibleTo(ctx.currentUser)` (отказ = `issue_not_found`, без оракула) и `Issue.canBeWrittenBy(<поле>, ctx.currentUser)` (отказ = `field_not_writable`); исключение SDK = отказ. Группы плагина — второй замок, не замена первого. |
| 25 | **Чтение исполнителя/состояния скрытых задач через `refresh-assignees`** *(#67 Q2, стенд 2026-08-23, закрыто в v3.25.0)* | `findById` возвращает задачу с `Visible to`, которую пользователь не видит через REST (404), и ручка отдавала её поля. Теперь невидимая задача → `null`, как несуществующая. |

---

## Сообщить об уязвимости

Пишите на **Oberon999@yandex.kz** (vendor из `manifest.json`) **до** публичного раскрытия, чтобы можно было скоординировать фикс.

В отчёте укажите:
- Затронутую версию (из `manifest.json:version` или с бейджа в шапке виджета).
- Минимальный воспроизводящий пример или proof-of-concept.
- Наблюдаемое воздействие (раскрытие данных, эскалация привилегий, denial-of-service и т.д.).

Цели по срокам: подтверждение получения отчёта в течение **5 рабочих дней**, фикс или митигация подтверждённой проблемы — в течение **30 дней** в зависимости от критичности. Поскольку у проекта один мейнтейнер, сроки — best-effort; для критичных отчётов мы публикуем промежуточный advisory в разделе [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories), даже если фикс готовится дольше.

Платная bug bounty-программа в Smart Sprint Planner пока не предусмотрена.
