# Synthetic snapshot fixtures

Хранилище эталонных snapshot'ов плагина — по одной папке на **версию-границу схемы**
(с 2026-08-22, #69 строка 24; до этого — на каждый релиз).

## Зачем

Юнит-тест `tests/unit/backward-compatibility.test.js` (с v1.6.0) прогоняет эти
fixture через полную цепочку `migrateSnap → validate*ForRead → validate*ForWrite`
через test-only CommonJS-шим в `backend-project.js`. Отдельный CI-guard
`compat-prev-release.test.js` обязателен к зелёному статусу для каждого PR.

Цель — гарантировать, что ни один следующий релиз не сломает чтение
snapshot'ов любого прошлого формата. Базовое правило — во внутренних правилах
проекта (`CLAUDE.md` → «Backward-compat fixtures + schema deprecation»).

## Структура

```
tests/fixtures/snapshots/
  README.md                 # этот файл
  1.4.2/                    # последний релиз ДО введения pluginVersion
    sprint-baseline.json    # минимально-валидный sprint
    sprint-full.json        # sprint с заполненным personalPlanning + ёмкостью
    history.json            # массив из ≥ 2 records (FINISHED + CONFIRMED)
    working-draft.json      # пример working copy
  1.6.0/                    # первый релиз СО stamp'ом pluginVersion на WRITE
    sprint-baseline.json
    sprint-full.json
    history.json
    working-draft.json
  <граница>/               # добавляется ТОЛЬКО при изменении схемы (см. правила ниже)
    ...
```

Текущий набор (10): `1.4.2`, `1.6.0` (контракты, захардкожены в тестах), `1.8.0`, `1.9.0`,
`1.9.3` (изменения shape), `3.6.0` (штамп свёрнутой миграции `1.4.2→3.6.0`), `3.21.0`
(последняя версия с legacy-ключами `editingFromHistory`/`historyIdx`/`migratedTo`),
`3.22.0` (soft-deprecation), `3.23.0` (hard-removal; штамп миграции `3.6.0→3.23.0`),
`3.27.0` (#73: аддитивный optional-ключ `roles` в sprint/history; штамп миграции `3.23.0→3.27.0`).

## Правила добавления fixture (с 2026-08-22 — только при изменении схемы)

**Триггер** — правка любого из: `schema/whitelists.json`, `SCHEMA_MIGRATIONS`,
`CURRENT_PLUGIN_VERSION`, `entity-extensions.json`, `validate*`/`migrate*` в бэкенде.
Релиз без триггера фикстуру **не добавляет** (прецедент — v3.24.0).

При срабатывании триггера в релизе `X`:

1. **Последняя версия ДО изменения** (`<prev>/`) — обязана лежать здесь и нести
   **старый** shape. При лестнице deprecation — с deprecated-ключами (генератор даёт
   чистый снимок, ключи досеиваются руками; урок `3.21.0`). Если папки `<prev>/` ещё нет —
   создать: `VERSION=<prev> npm run fixtures:generate` + ручная досыпка старого shape.
2. **Первая версия ПОСЛЕ** (`X/`) — `VERSION=X npm run fixtures:generate` с новым shape;
   миграционный step в `SCHEMA_MIGRATIONS` (если shape breaking).
3. Все timestamps — фиксированные константы, никакого `Date.now()`.
   Все user-имена — `fixture_user_<N>`. Все project-имена — `Fixture <…>`.

**Хранение:** только версии-границы (последняя ДО / первая ПОСЛЕ каждого изменения схемы)
+ штампы, по которым гейтится цепочка `SCHEMA_MIGRATIONS` (`step.from`/`step.to`).
Byte-identical соседей (кроме `pluginVersion`) не держим: 2026-08-22 из 43 папок
удалены 34 такие копии — покрытие веток миграции не изменилось (тесты читают каталоги
динамически). Папки `1.4.2/` и `1.6.0/` захардкожены в `backward-compatibility.test.js` —
не удалять.

## PII

В fixture'ах **запрещены** реальные данные из прода. Все user-имена —
`fixture_user_<N>`. Все project-имена — `Fixture <…>`. Реальные логины,
email'ы, корпоративные project-keys и т.п. недопустимы.

## История

- **v1.6.0 (2026-05-15)** — fixture-инфраструктура создана. Папка `1.4.2/` зафрожена
  (legacy contract до введения `pluginVersion`). Папка `1.6.0/` — первый stamped baseline.
  Генератор `tests/fixtures/generate-baseline.js` создаёт fixture'ы автоматически.
  Тест `backward-compatibility.test.js` прогоняет полную цепочку migrate+validate.
- **2026-08-22 (#69 строка 24)** — правило «фикстура на каждый релиз» заменено на
  «фикстура только при изменении схемы»; 34 byte-identical папки удалены, оставлено 9
  версий-границ. Compat-тесты 347 → 76 при том же покрытии веток миграции.
