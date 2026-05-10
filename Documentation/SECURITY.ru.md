# Модель безопасности — Smart Sprint Planner

> 🇬🇧 [Read in English](../.github/SECURITY.md) · 🇷🇺 По-русски

Применимо к **v1.0.0** и более новым версиям. Модель — server-authoritative: deny-by-default, whitelist-валидаторы, защита от Prototype Pollution и явная иерархия ролей.

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

| Роль | Где задаётся | Кто может назначать | Примечание |
|------|--------------|---------------------|------------|
| `settingsManager` | `ctx.settings.settingsManagerGroup` (project-scoped app-settings) | Project admin / Global admin (через Project Settings → Apps) | Обязателен для любых мутаций |
| `editor` | `ssp_settings.editGroups` / `editGroupNames` | settingsManager | Полный доступ на запись состава спринта |
| `validator` | `ssp_settings.validationGroups` / `validationGroupNames` | settingsManager | Подтверждение / распределение / финализация спринтов |
| `historyManager` | `ssp_settings.historyClearGroups` / `historyClearGroupNames` | settingsManager | Требуется для очистки истории |
| `assigner` | `ssp_settings.assignerGroups` / `assignerGroupNames` | settingsManager | Может писать только в `personalPlanning` (assignee + dates) |
| `viewer` | любой аутентифицированный пользователь проекта | YouTrack project permissions | Read-only |
| `wcOwner` *(контекстная)* | `editorLogin === ctx.currentUser.login` в `_workingDrafts[key]` | Создаётся автоматически при `POST /working-drafts` | Защита от перехвата чужой WC |

**Иерархия**: `editor ⊃ assigner ⊃ viewer`. `editor` имеет все права `assigner` плюс полную мутацию спринта. `assigner` ограничен записью в `personalPlanning` (assignee + start/end-dates) через `action=assignerSync` и записью assignee-полей через `update-issue-field`.

**`wcOwner`** (working copy owner) — единственная роль, авторизация которой не из `ssp_settings` / `ctx.settings.*`, а из самого `_workingDrafts[key].editorLogin`. Backend перезаписывает `editorLogin` серверным значением на каждом POST (defense-in-depth — клиент не может подменить владельца). Перехват чужой WC возвращает `{success: false, reason: 'not_owner'}` (исключение — `settingsManager` может удалить любую WC).

---

## Матрица доступа по endpoints

| Method | Path | Минимальная роль |
|--------|------|------------------|
| GET    | `project-fields` | viewer |
| GET    | `sprint-data` | viewer |
| POST   | `sprint-data` (`body.sprint` / `roleItems` / `items`) | editor |
| POST   | `sprint-data` (`body.settings`) | settingsManager |
| POST   | `sprint-data?action=validate` | validator |
| POST   | `sprint-data?action=assignerSync` | assigner (partial save: только `personalPlanning`) |
| GET    | `history` | viewer |
| POST   | `history` (обычное сохранение / обновление) | validator |
| POST   | `history?action=assignerSync` | assigner (partial save: только `personalPlanning` в существующих snap'ах) |
| POST   | `history?action=clear` | historyManager |
| GET    | `working-drafts` | viewer (возвращает все доступные WC; чтение не ограничено) |
| POST   | `working-drafts` | validator (`editorLogin` перезаписывается из `ctx.currentUser.login`) |
| DELETE | `working-drafts/<key>` | wcOwner ИЛИ settingsManager (иначе `{success: false, reason: 'not_owner'}`) |
| GET    | `check-settings-manager` | viewer |
| GET    | `check-validator` | viewer |
| GET    | `check-editor` | viewer |
| GET    | `check-history-manager` | viewer |
| GET    | `check-assigner` | viewer |
| GET    | `field-values` | viewer |
| GET    | `get-user-field-values` | viewer |
| GET    | `app-version` | viewer (read-only, возвращает `{version: '<APP_VERSION>'}`) |
| POST   | `update-issue-field` | editor ИЛИ assigner (типы поля: `enum` / `string` / `period` / `user`) |
| POST   | `refresh-assignees` | editor ИЛИ assigner (bulk fetch до 200 issueId) |
| GET    | `draft` | viewer (возвращает только слот currentUser) |
| POST   | `draft` | viewer (пишет только в слот currentUser) |
| POST   | `draft?action=clear` | viewer (удаляет только слот currentUser) |

`viewer` — любой аутентифицированный пользователь проекта. Все остальные роли требуют настроенного `settingsManagerGroup` (deny-by-default иначе). `wcOwner` — контекстная роль (см. таблицу ролей выше).

---

## Угрозы и митигации

| # | Угроза | Митигация |
|---|--------|-----------|
| 1 | **Захват настроек на свежей установке (chicken-and-egg)** | `settingsManagerGroup` только в app-settings; deny-by-default; нет endpoint'а для записи `settingsManagerGroup` |
| 2 | **Подмена ролей через body** | Backend не читает `body.editGroups` / `validationGroups` / `historyClearGroups` / `settingsManagerGroup` для авторизации; только `ctx.currentUser.groups` |
| 3 | **Случайная или злонамеренная очистка истории** | Отдельная роль `historyManager`; кнопка очистки скрыта в UI; `POST /history?action=clear` deny-by-default |
| 4 | **Prototype Pollution** | `sanitizeDeep` отвергает `__proto__` / `constructor` / `prototype` на глубине до 10 уровней |
| 5 | **Запись «мусора» в settings** | Жёсткий whitelist `ALLOWED_SETTINGS_KEYS` + типизация + диапазоны (rate, NKC, kpe) |
| 6 | **XSS через данные YouTrack** | Все вставки через `esc()` (5 символов); все `href` через `safeUrl()` (https/http only); никакого `eval` / `Function` / `document.write` |
| 7 | **Tabnabbing через `target=_blank`** | На всех внешних ссылках `rel="noopener noreferrer"` |
| 8 | **Поломка SRI у CDN xlsx** | `integrity="sha384-..."` + `crossorigin="anonymous"` на загрузке xlsx — браузер блокирует подмену |
| 9 | **DoS через большое тело запроса** | `MAX_REQUEST_BODY=2 МБ` в `getBody`, `MAX_PROP_SIZE=500 КБ` на каждое свойство (история — 1 МБ) |
| 10 | **Инъекции в `fieldName`** | Валидация запрещает только control chars и `< > "`; имена YouTrack-полей с точками/скобками/амперсандами проходят. Сам YouTrack-API делает корректный lookup поля без SQL/path-конкатенации. |
| 11 | **Утечка диагностики** | Все ошибки backend возвращают `internal_error` без эха содержимого; детали — только в server log при `enableDebugLog` |
| 12 | **Подмена/подделка персональных черновиков** | Черновики хранятся в `ssp_drafts`, scoped per-user (ключ слота — `ctx.currentUser.login`, не передаётся клиентом). Поле `data` — opaque blob, сервер его не интерпретирует. Лимиты: 256 КБ на пользователя; 1 МБ суммарно по проекту. |
| 13 | **Перехват чужой working copy** | `DELETE` / `POST` `/working-drafts` проверяют `editorLogin === ctx.currentUser.login` (исключение для DELETE — `settingsManager`). Backend всегда перезаписывает `editorLogin` серверным значением на POST → клиент не может подделать владельца через тело запроса. |
| 14 | **Conflict-replay (overwrite чужих изменений в WC)** | На коммите WC backend сравнивает `baseSnapshotHash` (FNV-1a от базового снимка) с актуальным хэшем. При расхождении — клиент получает conflict-ответ, фронтенд открывает модал «Конфликт версий» с явным выбором (Перезаписать / Скачать обе версии / Отменить). Слепой replay невозможен. |
| 15 | **Runaway-размер `_workingDrafts`** | Лимиты: 256 КБ на одну WC, 480 КБ суммарно по `ssp_workdrafts`. `validateWorkingDraft` проверяет `revisions.length ≤ 1000`. Lazy-purge на загрузке: WC старше 30 дней или orphan (без базового снимка) автоматически удаляются. |
| 16 | **Эскалация прав через `assignerSync`** | `action=assignerSync` разрешает запись **только** в `personalPlanning` (assignee + start/end-dates). Backend фильтрует тело до этого подмножества; попытка передать `body.sprint.items` / `body.settings` / прочее — silent strip. assigner не может изменить состав спринта, ёмкость роли, статус или валидацию. |
| 17 | **DoS через большой батч в `refresh-assignees`** | Жёсткий лимит **200 issueId на запрос** в коде backend. Каждый `issueId` проверяется (`≤100` символов) и матчится regex'ом `[A-Z][A-Z0-9_]+-[0-9]+`. Лимит покрывает реалистичный размер спринта с запасом. |
| 18 | **Подделка `editorLogin` через body** | На каждом `POST /working-drafts` backend безусловно перезаписывает `body.editorLogin = ctx.currentUser.login` до валидации, игнорируя любое значение из тела. Это же правило применяется к `revisions[].by` (всегда серверный login). |
| 19 | **Race condition между DELETE и POST `/working-drafts`** | YouTrack extension-properties атомарны на уровне POST/SET; concurrent DELETE + POST разрешается либо в сохранение (POST после DELETE), либо в удаление (DELETE после POST), без частичного состояния. UI справляется через retry + refresh state из `GET /working-drafts`. |

---

## Сообщить об уязвимости

Пишите на **Oberon999@yandex.kz** (vendor из `manifest.json`) **до** публичного раскрытия, чтобы можно было скоординировать фикс.

В отчёте укажите:
- Затронутую версию (из `manifest.json:version` или с бейджа в шапке виджета).
- Минимальный воспроизводящий пример или proof-of-concept.
- Наблюдаемое воздействие (раскрытие данных, эскалация привилегий, denial-of-service и т.д.).

Цели по срокам: подтверждение получения отчёта в течение **5 рабочих дней**, фикс или митигация подтверждённой проблемы — в течение **30 дней** в зависимости от критичности. Поскольку у проекта один мейнтейнер, сроки — best-effort; для критичных отчётов мы публикуем промежуточный advisory в разделе [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories), даже если фикс готовится дольше.

Платная bug bounty-программа в Smart Sprint Planner пока не предусмотрена.
