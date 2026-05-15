# Synthetic snapshot fixtures

Хранилище эталонных snapshot'ов плагина, по одной папке на каждый релиз.

## Зачем

Юнит-тест `tests/unit/backward-compatibility.test.js` (с v1.6.0) прогоняет эти
fixture через полную цепочку `migrateSnap → validate*ForRead → validate*ForWrite`
через test-only CommonJS-шим в `backend-project.js`. Отдельный CI-guard
`compat-prev-release.test.js` обязателен к зелёному статусу для каждого PR.

Цель — гарантировать, что ни один следующий релиз не сломает чтение
snapshot'ов предыдущего. Базовое правило зафиксировано в `CLAUDE.md`
(«Сборка и тесты → Backward-compat fixture-test обязателен на каждом
релиз-бампе»).

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
  <next-version>/           # добавляется на каждом релиз-бампе
    ...
```

## Правила добавления fixture для новой версии

1. При bump'е `manifest.json:version`:
   - Создать новую папку `tests/fixtures/snapshots/<new-version>/`.
   - Если schema **не менялась** — fixture новой версии = byte-identical
     fixture предыдущей версии + bump поля `pluginVersion` в JSON.
   - Если schema **изменилась** — оставить fixture предыдущей версии как есть,
     новый fixture положить в новую папку, добавить миграционный step в
     `SCHEMA_MIGRATIONS` (с v1.5.2).
   - Все timestamps — фиксированные константы, никакого `Date.now()`.
   - Все user-имена — `fixture_user_<N>`. Все project-имена — `Fixture <…>`.
2. **Не удалять** старые папки даже для давно ушедших версий — они нужны
   для `compat-prev-release` regression. Минимальный bar —
   последняя версия до текущей. Целевой bar — все версии от v1.4.2 (момент
   введения правила) до текущей.
3. С v1.6.0 — генератор-скрипт `tests/fixtures/generate-baseline.js`
   создаёт fixture'ы автоматически из `VERSION`-переменной. Запуск: `npm run fixtures:generate`.

## PII

В fixture'ах **запрещены** реальные данные из прода. Все user-имена —
`fixture_user_<N>`. Все project-имена — `Fixture <…>`. Реальные логины,
email'ы, корпоративные project-keys и т.п. недопустимы.

## История

- **v1.6.0 (2026-05-15)** — fixture-инфраструктура создана. Папка `1.4.2/` зафрожена
  (legacy contract до введения `pluginVersion`). Папка `1.6.0/` — первый stamped baseline.
  Генератор `tests/fixtures/generate-baseline.js` создаёт fixture'ы автоматически.
  Тест `backward-compatibility.test.js` прогоняет полную цепочку migrate+validate.
