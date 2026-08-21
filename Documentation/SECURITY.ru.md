# Модель безопасности — Smart Sprint Planner

> 🇬🇧 [Read in English](../.github/SECURITY.md) · 🇷🇺 По-русски

Актуально для версии **3.20.1**. Модель — server-authoritative: deny-by-default, whitelist-валидаторы, защита от Prototype Pollution и явная ролевая модель.

> Разделы «Роли», «Матрица доступа» и «Угрозы и митигации» перегенерированы из кода по итогам authz-аудита #67 (2026-08-19): матрица покрывает все endpoints обоих handler'ов (project + global). Юнит-инвариант `tests/unit/security-matrix-invariant.test.js` сверяет матрицу с фактическим реестром `core.ENDPOINTS` — рассинхрон роняет гейт.
>
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
| POST   | `sprint-data` (`body.sprint`/`roleItems`/`items`) | editor; **ветка `sprint:null` (сброс слота, в т.ч. парный `roleItems`-гейт) — editor ∨ validator (#67 H5)**; item'ы без `title` обогащаются сервером из задач — изоляция проекта + `isVisibleTo`, лимит 200 |
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
| POST   | `update-issue-field` | assigner-объединение (типы: `period`/`enum`/`state`/`version`/`owned`/`build`/`user`; изоляция проекта; `fieldName` — длина/символы + **allow-list настроенных полей, #67 H7**) |
| POST   | `refresh-assignees` | **viewer** (bulk-чтение assignee/state до 200 issueId за запрос) |
| GET    | `releases` | viewer |
| GET    | `releases-archive` | viewer |
| POST   | `releases` | settingsManager ИЛИ releaseManager; releaseEngineer — только advance-дифф (`engineerDiffAllowed`) |
| GET    | `reporting-access` | viewer (ответ — флаги контуров A/B по членству) |
| GET    | `sprint-lock` | viewer |
| POST   | `sprint-lock` | sprintLockManager |
<!-- authz-matrix:project:end -->

### Global scope (`backend-global.js`)

Все project-endpoints, кроме `sync-acl` и `app-version`, доступны через global-URL с `?projectKey=<KEY>`: адаптер резолвит проект и применяет read-gate (`READ_PROJECT_BASIC`) **до** ролевой логики ядра — ролевые проверки не ослабляются. «Нет проекта» и «нет прав» отвечаются единым `project_unavailable` (#67 H11 — оракул существования проектов закрыт). Собственные endpoints global-handler'а:

<!-- authz-matrix:global:begin -->
| Method | Path | Минимальная роль |
|--------|------|------------------|
| GET    | `app-version` | аутентификация (статика, без read-gate — бейдж версии до выбора проекта) |
| POST   | `filter-planner-projects` | аутентификация (арбитр picker'а: до 5000 ключей за запрос; cap тела 256 КБ, #67 H11) |
| GET    | `last-project` | аутентификация (свой слот) |
| POST   | `last-project` | аутентификация (пишет только свой слот) |
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

---

## Сообщить об уязвимости

Пишите на **Oberon999@yandex.kz** (vendor из `manifest.json`) **до** публичного раскрытия, чтобы можно было скоординировать фикс.

В отчёте укажите:
- Затронутую версию (из `manifest.json:version` или с бейджа в шапке виджета).
- Минимальный воспроизводящий пример или proof-of-concept.
- Наблюдаемое воздействие (раскрытие данных, эскалация привилегий, denial-of-service и т.д.).

Цели по срокам: подтверждение получения отчёта в течение **5 рабочих дней**, фикс или митигация подтверждённой проблемы — в течение **30 дней** в зависимости от критичности. Поскольку у проекта один мейнтейнер, сроки — best-effort; для критичных отчётов мы публикуем промежуточный advisory в разделе [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories), даже если фикс готовится дольше.

Платная bug bounty-программа в Smart Sprint Planner пока не предусмотрена.
