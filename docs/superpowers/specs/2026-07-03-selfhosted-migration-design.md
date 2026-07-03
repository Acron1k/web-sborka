# Миграция на self-hosted: Vercel + Supabase → vps-ru-1

**Дата:** 2026-07-03
**Статус:** утверждено пользователем

## Цель

Перевести приложение с Vercel + Supabase (free tier тормозит) на собственный сервер `vps-ru-1` (Ubuntu 24.04, 2 CPU, 3.8 GB RAM, Docker + Compose, nginx на хосте) с полным отказом от Supabase и сохранением всех текущих данных. Домен: **sbory.mirobase.ru** (A-запись → 185.56.162.59 добавляет пользователь; сертификат дорасширяется certbot'ом).

## Текущее состояние (инвентаризация)

- Приложение — тонкий клиент: все запросы к БД идут из браузера через `@supabase/supabase-js` (PostgREST). Серверных компонентов с данными, server actions, API routes и middleware нет.
- Из Supabase используются только PostgREST-запросы и Realtime (`postgres_changes`, канал `trip-${tripId}`, таблицы `items`, `item_claims`, `families`, `ai_suggestions`). Auth, Storage, Edge Functions — не используются.
- Auth отсутствует: доступ = знание slug поездки + cookie выбранной семьи (`trip_{slug}_family`). RLS-политики открыты (`using(true)`).
- Слой данных изолирован: `lib/queries/trip.ts`, `lib/queries/items.ts`, `lib/queries/shopping.ts`, `lib/queries/ai-suggestions.ts`, `lib/realtime.ts` + прямой вызов supabase в `app/page.tsx` (создание поездки). React Query v5 — единственный механизм состояния сервера.
- `supabase/migrations/0001_init.sql` устарел: нет таблицы `ai_suggestions` и колонок `needs_purchase` (items), `is_packed`, `is_purchased` (item_claims). Канон схемы — `lib/db/types.ts`.
- Vercel-специфичного в коде нет. `next.config.ts` пустой.
- Объём данных (на 2026-07-03): trips 7, families 22, items 131, item_claims 77, ai_suggestions 179. Выгрузка через REST с anon-ключом работает (проверено).
- Next.js 16.2.6 — перед написанием кода сверяться с `node_modules/next/dist/docs/` (AGENTS.md предупреждает о breaking changes).

## Целевая архитектура

```
Браузер ──HTTPS──> nginx (хост, sbory.mirobase.ru)
                     └─> 127.0.0.1:3002 ──> app (Next.js standalone, Docker)
                                              ├─ route handlers /api/*
                                              ├─ SSE /api/events (LISTEN/NOTIFY)
                                              └─> db (postgres:16-alpine, Docker,
                                                  внутренняя сеть, named volume)
```

- Стек на сервере: `/opt/sbory/` — `docker-compose.yml` (сервисы `db` и `app`), `.env` (секреты), том `sbory_pgdata`.
- Порт приложения на хосте: `127.0.0.1:3002` (3001 занят annamaks-web, 8000 — Plausible).
- Postgres наружу не маппится. Пароль — случайный, живёт только в `.env` на сервере.
- Nginx: новый vhost `sbory.mirobase.ru`, `certbot --nginx -d sbory.mirobase.ru` расширяет существующий SAN-сертификат mirobase.ru.
- RAM бюджет: app ~150–250 MB + postgres ~100–150 MB — укладывается в свободные ~1.7 GB.

## Схема БД

Новый каноничный файл `db/schema.sql` (папка `supabase/` удаляется):

- Таблицы: `trips`, `families`, `items`, `item_claims`, `ai_suggestions` — полная боевая форма: все CHECK-ограничения (`list_type`, `category`, `importance`), уникальности (`trips.slug`, `item_claims(item_id, family_id)`), FK с каскадами как сейчас, все индексы, включая «поздние» колонки `needs_purchase`, `is_packed`, `is_purchased`.
- Без RLS (доступ к БД только у API-слоя).
- Функция `notify_trip_change()` + триггеры AFTER INSERT/UPDATE/DELETE на `items`, `families`, `ai_suggestions`, `item_claims` → `pg_notify('trip_events', json {table, trip_id})`. Для `item_claims` `trip_id` берётся подзапросом из `items` по `item_id` (NEW/OLD).
- Схема применяется идемпотентно при первом старте (init-скрипт контейнера postgres).

## API-слой

Принцип: **сигнатуры функций `lib/queries/*` не меняются** — внутренности переходят с supabase-js на `fetch()` к своим route handlers. Компоненты и ключи React Query не трогаются.

Endpoints (`app/api/`, все — обычный JSON):

| Текущая функция | Endpoint |
|---|---|
| `fetchTripBySlug` | `GET /api/trips/[slug]` (trip + families) |
| создание поездки (`app/page.tsx`) | `POST /api/trips` (trip + families одной транзакцией) |
| `fetchItems`, `fetchPersonalItems` | `GET /api/items?tripId=&listType=...` |
| `insertItem`, `insertItemWithClaims` | `POST /api/items` (опционально с claims, транзакция) |
| `updateItem`, `togglePersonalDone` | `PATCH /api/items/[id]` |
| `deleteItem` | `DELETE /api/items/[id]` |
| `fetchClaims`, `fetchClaimedItemsForFamily` | `GET /api/claims?tripId=...` |
| `toggleClaim` | `POST /api/claims/toggle` |
| `toggleClaimPacked` | `PATCH /api/claims/[id]` |
| `markPurchasedByCurrentFamily` | `POST /api/claims/purchase` |
| `fetchShoppingItems` | `GET /api/shopping?tripId=` |
| `fetchSuggestions` | `GET /api/suggestions?tripId=` |
| `bulkInsertSuggestions` | `POST /api/suggestions/bulk` |
| `deleteSuggestion` | `DELETE /api/suggestions/[id]` |
| `promoteSuggestion` / `unpromoteSuggestion` | `POST /api/suggestions/[id]/promote` / `.../unpromote` |

Точная форма endpoints уточняется в плане по фактическим сигнатурам функций.

- Сервер: голый `pg` (Pool) в `lib/server/db.ts`. ORM не вводим.
- Валидация на границе API: обязательные поля, enum-значения (`list_type`, `category`, `importance`), UUID-формат. Без новых зависимостей.
- Ошибки: 400 на невалидный ввод, 404 на отсутствующие сущности, 500 с логом в stdout (видно через `docker logs`).
- Env: `DATABASE_URL` (серверная). `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` удаляются. Зависимости `@supabase/supabase-js` и неиспользуемый `zustand` выпиливаются.

## Realtime → SSE

- Сервер: модуль `lib/server/listener.ts` — один выделенный pg-клиент на процесс, `LISTEN trip_events`, раздача событий подписчикам по `trip_id` (in-memory map). Реконнект при обрыве соединения с БД.
- Route handler `GET /api/events?tripId=`: SSE-стрим (ReadableStream), событие `change` с `{table}`, heartbeat-комментарий каждые 25 с, корректное закрытие по abort.
- Клиент: `lib/realtime.ts` сохраняет текущий публичный интерфейс; внутри `EventSource` вместо supabase-канала; маппинг «таблица → invalidateQueries» остаётся тем же. Реконнект — штатный механизм EventSource.
- Nginx для `/api/events`: `proxy_buffering off`, длинный `proxy_read_timeout`.

## Перенос данных

- `scripts/export-supabase.mjs`: выгрузка 5 таблиц через Supabase REST (anon-ключ из `.env.local`, пагинация Range-заголовками) в `data-export.json` с сохранением всех id (uuid → сиквенсов нет, конфликтов нет).
- `scripts/import-db.mjs`: импорт в Postgres по `DATABASE_URL` одной транзакцией в FK-порядке: trips → families → items → item_claims → ai_suggestions. Повторный запуск — с предварительным TRUNCATE CASCADE (идемпотентность cutover'а).
- Запуск импорта на сервер — через SSH-туннель (`ssh -L`) с локальной машины.
- Cutover: пробный полный прогон заранее → «стоп редактирование» ~10 минут → свежий экспорт → импорт → сверка счётчиков строк по всем таблицам → новая ссылка семьям.

## Сборка и деплой

- `next.config.ts`: `output: 'standalone'`.
- Multi-stage `Dockerfile` (node:22-alpine): deps → build → runner (standalone + static). Google Fonts качаются на этапе локальной сборки, рантайму сеть не нужна.
- Сборка локально (`docker build --platform linux/amd64`), доставка `docker save | gzip | ssh vps-ru-1 docker load`, на сервере `docker compose up -d`. На сервере сборку не гоняем (мало RAM).
- `scripts/deploy.sh` — повторный деплой одной командой (build → ship → up → prune старых образов).
- Локальная разработка: `docker-compose.dev.yml` с одним postgres (порт 54329), `db/schema.sql` применяется автоматически, данные подливаются `import-db.mjs` из экспорта.

## Безопасность и не-цели (YAGNI)

- Модель доступа не меняется: ссылка со slug + cookie семьи. Для семейного приложения достаточно; главная дыра (прямая запись в БД по вшитому в бандл ключу) закрывается архитектурно.
- Не делаем: пользовательский auth, ORM, CI/CD (деплой скриптом; GH Actions — потом при желании), rate limiting, кэш-слои.

## Верификация

- Существующие vitest-тесты проходят; юнит-тесты на новую валидацию границы API — по необходимости в плане.
- После импорта: счётчики строк по всем 5 таблицам совпадают с Supabase на момент cutover.
- Smoke на проде: создать тестовую поездку → добавить item в двух вкладках (проверка SSE-синхры) → claim → покупка → удаление тестовой поездки.
- Vercel и Supabase не отключаются до подтверждения работоспособности; отключает пользователь вручную в дашбордах.

## Фаза 2 (вне этой спеки)

Комплексная доработка UI/UX через `/impeccable` — отдельный подпроект после завершения миграции, на новой инфраструктуре.
