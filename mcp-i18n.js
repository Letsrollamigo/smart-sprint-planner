/**
 * Словарь MCP-инструментов (#113 1б-2): описания инструментов и полей для модели агента, сводки результатов, тексты отказов.
 * Оба языка лежат в обоих форках; язык форка задаёт LANG — единственная строка файла, различная
 * между форками. Тексты перенесены из словарей отдельного сервера (Integrations/mcp-server/src/i18n)
 * с поправками под встроенный MCP YouTrack.
 */

var LANG = 'en';

var DICT = {
  "ru": {
    "tools": {
      "get_project_overview": {
        "title": "Обзор проекта в планере",
        "description": "Первый вызов для проекта: версия планера, настроен ли планер (configured), активные роли, шапка рабочего спринта с числом задач по ролям, включена ли блокировка создания спринтов, число релизов и ревизия реестра. Только чтение. Памятка: трудозатраты и ресурсы — минуты (8 ч = 480); даты спринта, релизов и назначений — epoch-ms; отсутствия — YYYY-MM-DD. Коды ролей, статусов и типов — только латиницей. baseRev можно не передавать — инструмент прочитает текущую ревизию сам; полная заливка черновика не затирает занятый слот без overwrite. Права — права пользователя в YouTrack и в группах ролей планера."
      },
      "get_sprint": {
        "title": "Рабочий спринт и состав",
        "description": "Рабочий слот проекта: шапка спринта (статус, даты, цель, ресурсы ролей в минутах, ревизия rev) и состав задач по ролям в компактном виде (issueId, название, состояние, статус включения, исполнитель, оценка/факт/аллокация роли в минутах). Фильтр roleKey, лимит на роль, флаг исключённых. Настройки проекта — только по includeSettings. Только чтение."
      },
      "get_history": {
        "title": "История спринтов",
        "description": "Снимки спринтов по ролям из истории проекта: статус, даты, кто и когда согласовал и завершил, перелимит, число задач. Фильтры: sprintId, roleKey, status; лимит записей; задачи записей — includeItems вместе с sprintId. Ответ несёт rev истории. Только чтение."
      },
      "get_capacity": {
        "title": "Ёмкость спринта",
        "description": "Запись ёмкости спринта: участники с грейдом, ставкой, долей участия, распределением по ролям и базой в часах; статус утверждения. Без sprintId берётся спринт рабочего слота; записи может не быть (capacity: null). Архив — по флагу. Только чтение."
      },
      "get_calendar": {
        "title": "Производственный календарь",
        "description": "Производственный календарь проекта по годам (дни с типом и часами). Параметр year сужает до одного года. Только чтение."
      },
      "get_absences": {
        "title": "Отсутствия сотрудников",
        "description": "Реестр отсутствий по логинам: from, to, type, hoursDelta. Фильтры: login и период (from/to — отсутствия, пересекающие период). Ответ несёт rev реестра. Только чтение."
      },
      "get_releases": {
        "title": "Релизы проекта",
        "description": "Реестр релизов: id, название, вид, источник, статус, даты, заморозка, состав задач, представители ролей; права вызывающего на запись (perms) и rev реестра. Фильтр по статусу; архив — по флагу. Только чтение."
      },
      "get_reminders": {
        "title": "Напоминания планера",
        "description": "Активные напоминания, адресованные пользователю токена: модуль (спринты, ёмкость, релизы), вид, сущность, через сколько дней или сколько дней назад. Журнал напоминаний проекта — по флагу. Только чтение."
      },
      "upload_draft": {
        "title": "Залить черновик спринта",
        "description": "Записать черновик спринта в рабочий слот проекта целиком: шапка (статус принудительно PLANNING) и состав задач по ролям. Сервер проверяет, что роли активны в проекте, и отказывает (slot_occupied), если слот занят чужим черновиком или спринтом в работе — тогда нужен overwrite:true. Задаче достаточно issueId и оценки: название, состояние и приоритет сервер наполняет из YouTrack (до 200 задач за запрос, счётчик enriched). Роль: редактор."
      },
      "upsert_item": {
        "title": "Добавить или изменить задачу роли",
        "description": "Точечно добавить задачу в роль или изменить её ключи (слияние: присланное обновляется, остальное сохраняется). Исключить с причиной — inclusionStatus INC_EXCLUDED и excludeReason. Роль: редактор. Ревизию читает сам."
      },
      "remove_item": {
        "title": "Убрать задачу из роли",
        "description": "Точечно убрать задачу из состава роли. Задачи нет — item_not_found. Роль: редактор."
      },
      "patch_sprint": {
        "title": "Изменить шапку спринта",
        "description": "Точечно изменить часть шапки рабочего спринта: название, даты, цель, значения полей, ресурсы ролей (минуты). Создать спринт этим нельзя — используй planner_upload_draft. Роль: редактор."
      },
      "assign_person": {
        "title": "Назначить исполнителя",
        "description": "Назначить человека на задачу роли (login) и при желании даты работы; login null — снять. Работает, когда роль уже отправлена на согласование либо спринт запущен — иначе role_record_not_found. Роль: распределяющий. В ответе rev слота и historyRev."
      },
      "upsert_absence": {
        "title": "Добавить или заменить отсутствие",
        "description": "Точечно добавить отсутствие сотрудника (from, to, type, hoursDelta); запись с теми же датами заменяется целиком. Роль: управление настройками либо планировочный менеджер."
      },
      "remove_absence": {
        "title": "Удалить отсутствие",
        "description": "Удалить отсутствие сотрудника по логину и паре дат from/to. Нет такой записи — absence_not_found. Роль: управление настройками либо планировочный менеджер."
      },
      "upsert_capacity_person": {
        "title": "Добавить или изменить участника ёмкости",
        "description": "Точечно добавить участника в запись ёмкости спринта или изменить его грейд, ставку, долю участия, распределение по ролям. Без sprintId — спринт рабочего слота; у спринта должны быть даты. Ревизии у ёмкости нет. Роль: управление настройками либо планировочный менеджер."
      },
      "upsert_release": {
        "title": "Создать или изменить релиз",
        "description": "Создать релиз либо изменить существующий по id (слияние ключей; убрать значение — null). Роль: релиз-менеджер; релиз-инженеру доступен только перевод существующего релиза на следующий статус цепочки."
      },
      "set_release_status": {
        "title": "Сменить статус релиза",
        "description": "Перевести релиз в статус: цепочка planned → prep → work → released, cancelled — отмена. Релиз-инженер — только на следующий шаг цепочки; snapshot — только вместе с released. Роль: релиз-менеджер либо релиз-инженер."
      },
      "update_release_issues": {
        "title": "Изменить состав задач релиза",
        "description": "Добавить (add) и/или убрать (remove) задачи релиза одним вызовом; выполняется как две точечные операции по цепочке ревизий. Роль: релиз-менеджер."
      }
    },
    "fields": {
      "projectKey": "Ключ проекта YouTrack (например DEMO)",
      "roleKey": "Ключ роли планирования: analysis, testing, devPlatform, devBack, devFront, devIos, devAndroid, devFs, devDb",
      "issueId": "Читаемый идентификатор задачи YouTrack, например DEMO-101",
      "baseRev": "Ревизия данных для оптимистической блокировки. Не передавать — инструмент прочитает текущую сам; передать — при конфликте вернётся rev_conflict с текущей ревизией",
      "resources": "Доступный ресурс ролей в минутах: { \"analysis\": 4800, \"devBack\": 9600 }",
      "title": "Название задачи; не передавать — сервер наполнит из YouTrack при записи",
      "inclusionStatus": "Статус включения: INC_PENDING (не решено), INC_PLANNED (планово), INC_UNPLANNED (внепланово), INC_EXCLUDED (исключена — нужен excludeReason)",
      "estimate": "Оценка роли по задаче, минуты",
      "fact": "Факт роли по задаче, минуты",
      "alloc": "Аллокация (выделенное время) роли по задаче, минуты",
      "excludeReason": "Причина исключения; обязательна при inclusionStatus = INC_EXCLUDED",
      "assignee": "Логин исполнителя (null — снять); для назначения людей предпочтителен planner_assign_person",
      "sprintName": "Название спринта",
      "dateStart": "Начало, epoch-ms (UTC-полночь календарной даты)",
      "dateEnd": "Окончание, epoch-ms",
      "sprintGoal": "Цель спринта",
      "roles": "Роли-участницы спринта; не передавать — все активные роли проекта",
      "sprintFieldVal": "Значение поля «Спринт» YouTrack, к которому привязан спринт",
      "versionFieldVal": "Значение поля версии/релиза, если проект его использует",
      "sprintId": "Стабильный идентификатор спринта (ключ дедупликации в истории), например sprint-2026-11",
      "absenceFrom": "Первый день отсутствия, YYYY-MM-DD",
      "absenceTo": "Последний день отсутствия, YYYY-MM-DD (один день — равен from)",
      "absenceType": "Тип: vacation, sick, out_of_membership, regional_holiday, training, teamleading, other",
      "hoursDelta": "Частичное отсутствие — часов в каждом дне (0.5..24); не передавать — полный день",
      "grade": "Грейд участника (строка из настроек проекта)",
      "rate": "Ставка 0..1",
      "participation": "Доля участия 0..1",
      "personAlloc": "Распределение участника по ролям, доли 0..1: { \"analysis\": 0.5, \"testing\": 0.5 }",
      "releaseId": "Идентификатор релиза (строка до 64 символов)",
      "releaseKind": "Вид: release или hotfix",
      "releaseSource": "Источник: internal или vendor",
      "releaseStatus": "Статус: planned → prep → work → released; cancelled — отмена (только релиз-менеджер)",
      "plannedDate": "Плановая дата, epoch-ms",
      "freezeDate": "Дата заморозки состава, epoch-ms",
      "roleReps": "Представители ролей: { \"analysis\": \"ivanov\" }",
      "includeExcluded": "Показывать исключённые задачи (по умолчанию да)",
      "includeSettings": "Приложить полные настройки проекта (большой объект со ставками и группами; по умолчанию нет)",
      "limitPerRole": "Максимум задач на роль в ответе (по умолчанию 200); в ответе есть total и hasMore",
      "sprintIdFilter": "Фильтр по идентификатору спринта (записи роли sprintId_roleKey тоже попадут)",
      "sprintStatus": "Фильтр по статусу спринта: PLANNING, CONFIRMED, ALLOCATED, FINISHED",
      "limit": "Максимум записей в ответе",
      "includeItems": "Приложить задачи записей — только вместе с sprintId",
      "sprintIdDefault": "Идентификатор спринта; не передавать — спринт рабочего слота",
      "includeArchive": "Приложить архив",
      "year": "Только один год календаря, например 2026",
      "loginFilter": "Только один сотрудник (логин)",
      "periodFrom": "Только отсутствия, пересекающие период: начало YYYY-MM-DD",
      "periodTo": "Только отсутствия, пересекающие период: конец YYYY-MM-DD",
      "releaseStatusFilter": "Только релизы в статусе",
      "includeJournal": "Приложить журнал напоминаний проекта",
      "sprint": "Шапка спринта: sprintId, name, dateStart, dateEnd; необязательно sprintGoal, roles, sprintFieldVal, versionFieldVal, resources. Статус всегда PLANNING",
      "roleItems": "Состав по ролям: { \"analysis\": [ { \"issueId\": \"DEMO-101\", \"inclusionStatus\": \"INC_PLANNED\", \"estimate\": 480 } ] }. Только роли из activeRoles проекта",
      "overwrite": "true — записать поверх занятого слота (чужой черновик или спринт в работе). По умолчанию false — отказ slot_occupied",
      "item": "Задача: issueId обязателен; остальное — что нужно изменить (слияние с хранимым)",
      "sprintPatch": "Ключи шапки, которые нужно изменить (name, dateStart, dateEnd, sprintGoal, sprintFieldVal, versionFieldVal, resources). Создать спринт так нельзя",
      "assignLogin": "Логин исполнителя; null — снять человека с задачи",
      "assignDateStart": "Начало работы над задачей, epoch-ms; null — снять дату",
      "assignDateEnd": "Окончание работы над задачей, epoch-ms; null — снять дату",
      "login": "Логин сотрудника в YouTrack",
      "entry": "Отсутствие: from, to, type; необязательно hoursDelta. Запись с теми же from и to заменяется целиком",
      "person": "Параметры участника ёмкости: grade, rate, participation, alloc — только то, что нужно изменить",
      "release": "Релиз: id обязателен; остальное — что нужно записать (слияние с хранимым, убрать значение — null)",
      "snapshot": "Слепок закрытия — только при переводе в released",
      "issuesAdd": "Идентификаторы задач, которые добавить в релиз",
      "issuesRemove": "Идентификаторы задач, которые убрать из релиза"
    },
    "result": {
      "overview": "Проект {projectKey}: планер {version}; слот — {sprint}; релизов {releases}.",
      "slotEmpty": "рабочий слот пуст (ревизия 0)",
      "sprint": "Спринт «{name}» ({status}), ревизия {rev}; задач по ролям: {counts}.",
      "history": "Записей истории: {count} из {total}.",
      "itemsNeedSprintId": "Задачи прилагаются только вместе с sprintId.",
      "capacity": "Ёмкость спринта {sprintId}: участников {persons}, статус {status}.",
      "capacityNone": "Записи ёмкости для спринта {sprintId} нет.",
      "calendar": "Календарь: годы {years}.",
      "absences": "Отсутствия: сотрудников {people}, записей {entries}.",
      "releases": "Релизов: {count}, ревизия реестра {rev}.",
      "reminders": "Активных напоминаний: {count}.",
      "remindersOff": "Мастер напоминаний в проекте выключен.",
      "written": "{action}: записано, ревизия {rev}.",
      "uploaded": "Черновик {sprintId} записан, ревизия {rev}; предупреждений: {warnings}.",
      "releaseIssues": "Релиз {id}: добавлено {added}, убрано {removed}; ревизия {rev}."
    },
    "errors": {
      "refusal": "Отказ планера {reason} (HTTP {status}). {hint}cid={cid}.",
      "revConflictTail": "Текущая ревизия — {rev}: перечитайте данные и повторите с ней.",
      "errorsTail": "Подробности: {errors}",
      "unexpected": "Внутренняя ошибка инструмента: {message}",
      "invalid_argument": "Неверный аргумент {field}: {problem}.",
      "guard": {
        "slot_occupied": "Рабочий слот занят: спринт {sprintId} в статусе {status} (ревизия {rev}). Заливка отклонена, чтобы не затереть чужую работу. Если запись поверх нужна осознанно — повторите с overwrite:true; для правок действующего спринта используйте точечные операции.",
        "role_not_active": "Роль {roleKey} не планируется в проекте; активные роли: {activeRoles}. Заполняйте только их.",
        "sprint_not_found": "В рабочем слоте нет спринта — передайте sprintId явно либо создайте спринт.",
        "nothing_to_do": "В запросе нет изменений: передайте хотя бы один ключ."
      },
      "hint": {
        "project_unavailable": "Проекта с таким ключом нет либо у вас нет права на чтение — проверьте ключ.",
        "planner_disabled": "Планер отключён в этом проекте.",
        "plugin_not_configured": "Планер в проекте не настроен: нет группы управления настройками.",
        "auth_required": "Нужен вход в YouTrack."
      }
    }
  },
  "en": {
    "tools": {
      "get_project_overview": {
        "title": "Project overview in the planner",
        "description": "First call for a project: planner version, whether the planner is configured, active roles, the working sprint header with issue counts per role, whether sprint creation is locked, release count and registry revision. Read-only. Memo: effort and resources are minutes (8 h = 480); sprint, release and assignment dates are epoch-ms; absences are YYYY-MM-DD. Role, status and type codes are Latin only. baseRev may be omitted — the tool reads the current revision itself; a full draft upload does not overwrite an occupied slot without overwrite. Permissions are those of the user in YouTrack and in the planner role groups."
      },
      "get_sprint": {
        "title": "Working sprint and issues",
        "description": "The project working slot: sprint header (status, dates, goal, role resources in minutes, revision rev) and issues by role in compact form (issueId, title, state, inclusion status, assignee, role estimate/actual/allocation in minutes). Filter by roleKey, per-role limit, excluded flag. Project settings — only with includeSettings. Read-only."
      },
      "get_history": {
        "title": "Sprint history",
        "description": "Sprint snapshots by role from the project history: status, dates, who confirmed and finished and when, over-limit flag, issue count. Filters: sprintId, roleKey, status; record limit; record issues — includeItems together with sprintId. The response carries the history rev. Read-only."
      },
      "get_capacity": {
        "title": "Sprint capacity",
        "description": "Sprint capacity record: participants with grade, rate, participation share, allocation across roles and base hours; approval status. Without sprintId the working slot sprint is used; the record may be missing (capacity: null). Archive — by flag. Read-only."
      },
      "get_calendar": {
        "title": "Production calendar",
        "description": "The project production calendar by year (days with type and hours). The year parameter narrows to one year. Read-only."
      },
      "get_absences": {
        "title": "Employee absences",
        "description": "Absence registry by login: from, to, type, hoursDelta. Filters: login and period (from/to — absences overlapping the period). The response carries the registry rev. Read-only."
      },
      "get_releases": {
        "title": "Project releases",
        "description": "Release registry: id, name, kind, source, status, dates, freeze, issue list, role representatives; the caller's write permissions (perms) and registry rev. Filter by status; archive — by flag. Read-only."
      },
      "get_reminders": {
        "title": "Planner reminders",
        "description": "Active reminders addressed to the token user: module (sprints, capacity, releases), kind, entity, in how many days or how many days ago. The project reminders journal — by flag. Read-only."
      },
      "upload_draft": {
        "title": "Upload a sprint draft",
        "description": "Write a sprint draft into the project working slot entirely: header (status forced to PLANNING) and issues by role. The server checks that the roles are active in the project and refuses (slot_occupied) when the slot holds someone else's draft or a sprint in progress — then overwrite:true is needed. An issue needs only issueId and an estimate: title, state and priority are filled by the server from YouTrack (up to 200 issues per request, counter enriched). Role: editor."
      },
      "upsert_item": {
        "title": "Add or change a role issue",
        "description": "Point operation: add an issue to a role or change its keys (merge: what is sent is updated, the rest is kept). Exclude with a reason — inclusionStatus INC_EXCLUDED and excludeReason. Role: editor. Reads the revision itself."
      },
      "remove_item": {
        "title": "Remove an issue from a role",
        "description": "Point operation: remove an issue from the role issue list. Missing issue — item_not_found. Role: editor."
      },
      "patch_sprint": {
        "title": "Change the sprint header",
        "description": "Point operation: change part of the working sprint header: name, dates, goal, field values, role resources (minutes). A sprint cannot be created this way — use planner_upload_draft. Role: editor."
      },
      "assign_person": {
        "title": "Assign a person",
        "description": "Assign a person (login) to a role issue and optionally the work dates; login null — unassign. Works once the role was sent for confirmation or the sprint is running — otherwise role_record_not_found. Role: assigner. The response carries the slot rev and historyRev."
      },
      "upsert_absence": {
        "title": "Add or replace an absence",
        "description": "Point operation: add an employee absence (from, to, type, hoursDelta); a record with the same dates is replaced entirely. Role: settings manager or planning manager."
      },
      "remove_absence": {
        "title": "Remove an absence",
        "description": "Remove an employee absence by login and the from/to date pair. No such record — absence_not_found. Role: settings manager or planning manager."
      },
      "upsert_capacity_person": {
        "title": "Add or change a capacity participant",
        "description": "Point operation: add a participant to the sprint capacity record or change their grade, rate, participation share, allocation across roles. Without sprintId — the working slot sprint; the sprint must have dates. Capacity has no revision. Role: settings manager or planning manager."
      },
      "upsert_release": {
        "title": "Create or change a release",
        "description": "Create a release or change an existing one by id (key merge; null removes a value). Role: release manager; a release engineer may only move an existing release to the next status in the chain."
      },
      "set_release_status": {
        "title": "Change release status",
        "description": "Move a release to a status: chain planned → prep → work → released, cancelled — cancellation. A release engineer — only to the next chain step; snapshot — only together with released. Role: release manager or release engineer."
      },
      "update_release_issues": {
        "title": "Change release issues",
        "description": "Add (add) and/or remove (remove) release issues in one call; executed as two point operations chained by revision. Role: release manager."
      }
    },
    "fields": {
      "projectKey": "YouTrack project key (e.g. DEMO)",
      "roleKey": "Planning role key: analysis, testing, devPlatform, devBack, devFront, devIos, devAndroid, devFs, devDb",
      "issueId": "Readable YouTrack issue id, e.g. DEMO-101",
      "baseRev": "Data revision for optimistic locking. Omit — the tool reads the current one itself; pass it — on a conflict you get rev_conflict with the current revision",
      "resources": "Available role resources in minutes: { \"analysis\": 4800, \"devBack\": 9600 }",
      "title": "Issue title; omit — the server fills it from YouTrack on write",
      "inclusionStatus": "Inclusion status: INC_PENDING (undecided), INC_PLANNED (planned), INC_UNPLANNED (unplanned), INC_EXCLUDED (excluded — excludeReason required)",
      "estimate": "Role estimate for the issue, minutes",
      "fact": "Role actual for the issue, minutes",
      "alloc": "Role allocation (reserved time) for the issue, minutes",
      "excludeReason": "Exclusion reason; required when inclusionStatus = INC_EXCLUDED",
      "assignee": "Assignee login (null — unassign); prefer planner_assign_person for assigning people",
      "sprintName": "Sprint name",
      "dateStart": "Start, epoch-ms (UTC midnight of the calendar date)",
      "dateEnd": "End, epoch-ms",
      "sprintGoal": "Sprint goal",
      "roles": "Roles taking part in the sprint; omit — all active project roles",
      "sprintFieldVal": "Value of the YouTrack \"Sprint\" field the sprint is bound to",
      "versionFieldVal": "Value of the version/release field, if the project uses one",
      "sprintId": "Stable sprint identifier (deduplication key in history), e.g. sprint-2026-11",
      "absenceFrom": "First day of absence, YYYY-MM-DD",
      "absenceTo": "Last day of absence, YYYY-MM-DD (single day — equals from)",
      "absenceType": "Type: vacation, sick, out_of_membership, regional_holiday, training, teamleading, other",
      "hoursDelta": "Partial absence — hours per day (0.5..24); omit — full day",
      "grade": "Participant grade (string from project settings)",
      "rate": "Rate 0..1",
      "participation": "Participation share 0..1",
      "personAlloc": "Participant allocation across roles, shares 0..1: { \"analysis\": 0.5, \"testing\": 0.5 }",
      "releaseId": "Release identifier (string up to 64 characters)",
      "releaseKind": "Kind: release or hotfix",
      "releaseSource": "Source: internal or vendor",
      "releaseStatus": "Status: planned → prep → work → released; cancelled — cancellation (release manager only)",
      "plannedDate": "Planned date, epoch-ms",
      "freezeDate": "Scope freeze date, epoch-ms",
      "roleReps": "Role representatives: { \"analysis\": \"ivanov\" }",
      "includeExcluded": "Show excluded issues (default yes)",
      "includeSettings": "Attach full project settings (a large object with rates and groups; default no)",
      "limitPerRole": "Maximum issues per role in the response (default 200); the response carries total and hasMore",
      "sprintIdFilter": "Filter by sprint identifier (role records sprintId_roleKey match too)",
      "sprintStatus": "Filter by sprint status: PLANNING, CONFIRMED, ALLOCATED, FINISHED",
      "limit": "Maximum records in the response",
      "includeItems": "Attach the records' issues — only together with sprintId",
      "sprintIdDefault": "Sprint identifier; omit — the sprint of the working slot",
      "includeArchive": "Attach the archive",
      "year": "Only one calendar year, e.g. 2026",
      "loginFilter": "Only one employee (login)",
      "periodFrom": "Only absences overlapping the period: start YYYY-MM-DD",
      "periodTo": "Only absences overlapping the period: end YYYY-MM-DD",
      "releaseStatusFilter": "Only releases in this status",
      "includeJournal": "Attach the project reminders journal",
      "sprint": "Sprint header: sprintId, name, dateStart, dateEnd; optional sprintGoal, roles, sprintFieldVal, versionFieldVal, resources. Status is always PLANNING",
      "roleItems": "Issues by role: { \"analysis\": [ { \"issueId\": \"DEMO-101\", \"inclusionStatus\": \"INC_PLANNED\", \"estimate\": 480 } ] }. Only roles from the project activeRoles",
      "overwrite": "true — write over an occupied slot (someone else's draft or a sprint in progress). Default false — refusal slot_occupied",
      "item": "Issue: issueId is required; the rest — what to change (merged with the stored record)",
      "sprintPatch": "Header keys to change (name, dateStart, dateEnd, sprintGoal, sprintFieldVal, versionFieldVal, resources). A sprint cannot be created this way",
      "assignLogin": "Assignee login; null — unassign the person",
      "assignDateStart": "Start of work on the issue, epoch-ms; null — clear the date",
      "assignDateEnd": "End of work on the issue, epoch-ms; null — clear the date",
      "login": "Employee login in YouTrack",
      "entry": "Absence: from, to, type; optional hoursDelta. A record with the same from and to is replaced entirely",
      "person": "Capacity participant parameters: grade, rate, participation, alloc — only what needs changing",
      "release": "Release: id is required; the rest — what to write (merged with the stored record; null removes a value)",
      "snapshot": "Closing snapshot — only when moving to released",
      "issuesAdd": "Issue ids to add to the release",
      "issuesRemove": "Issue ids to remove from the release"
    },
    "result": {
      "overview": "Project {projectKey}: planner {version}; slot — {sprint}; releases {releases}.",
      "slotEmpty": "the working slot is empty (revision 0)",
      "sprint": "Sprint \"{name}\" ({status}), revision {rev}; issues by role: {counts}.",
      "history": "History records: {count} of {total}.",
      "itemsNeedSprintId": "Issues are attached only together with sprintId.",
      "capacity": "Capacity of sprint {sprintId}: participants {persons}, status {status}.",
      "capacityNone": "No capacity record for sprint {sprintId}.",
      "calendar": "Calendar: years {years}.",
      "absences": "Absences: employees {people}, records {entries}.",
      "releases": "Releases: {count}, registry revision {rev}.",
      "reminders": "Active reminders: {count}.",
      "remindersOff": "The reminders master switch is off in this project.",
      "written": "{action}: written, revision {rev}.",
      "uploaded": "Draft {sprintId} written, revision {rev}; warnings: {warnings}.",
      "releaseIssues": "Release {id}: added {added}, removed {removed}; revision {rev}."
    },
    "errors": {
      "refusal": "Planner refusal {reason} (HTTP {status}). {hint}cid={cid}.",
      "revConflictTail": "Current revision is {rev}: re-read the data and retry with it.",
      "errorsTail": "Details: {errors}",
      "unexpected": "Internal tool error: {message}",
      "invalid_argument": "Invalid argument {field}: {problem}.",
      "guard": {
        "slot_occupied": "The working slot is occupied: sprint {sprintId} in status {status} (revision {rev}). The upload was refused so as not to overwrite someone else's work. If writing over it is intended, repeat with overwrite:true; to edit the current sprint use point operations.",
        "role_not_active": "Role {roleKey} is not planned in this project; active roles: {activeRoles}. Fill only those.",
        "sprint_not_found": "There is no sprint in the working slot — pass sprintId explicitly or create a sprint.",
        "nothing_to_do": "The request contains no changes: pass at least one key."
      },
      "hint": {
        "project_unavailable": "There is no project with this key, or you may not read it — check the key.",
        "planner_disabled": "The planner is disabled in this project.",
        "plugin_not_configured": "The planner is not configured in this project: no settings-manager group.",
        "auth_required": "A YouTrack sign-in is required."
      }
    }
  }
};

/* t('tools.get_sprint.title') — строка словаря языка форка; {name} подставляется из params. */
function t(key, params, lang) {
  var v = DICT[lang || LANG];
  var parts = key.split('.');
  for (var i = 0; i < parts.length; i++) {
    if (!v || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, parts[i])) return key;
    v = v[parts[i]];
  }
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, function (m, k) { return params && params[k] !== undefined ? String(params[k]) : m; });
}

exports.LANG = LANG;
exports.DICT = DICT;
exports.t = t;
