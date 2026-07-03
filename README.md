# Сборы с палатками

**Совместный список вещей, продуктов и покупок для выезда несколькими семьями.**

Создаёшь поездку, кидаешь семьям ссылку — каждый видит, кто что берёт, что куплено и что осталось упаковать. Изменения синхронизируются между участниками в реальном времени.

## Возможности

- Три списка: общие вещи, личные сборы, еда (с категориями)
- Клеймы «кто берёт» и отметки «куплено» / «упаковано» по семьям
- Список покупок из вещей с флагом «надо купить»
- AI-подсказки: промпт копируется ассистенту, ответ вставляется обратно и разбирается в предложения
- Live-синхронизация между вкладками и устройствами (SSE)
- Без регистрации: доступ по ссылке поездки + выбор семьи (cookie)

## Быстрый старт (локально)

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 16 на :54329, схема применится сама
cp .env.local.example .env.local
npm install
npm run dev                                       # http://localhost:3000
```

Подлить реальные данные из бэкапа: `DATABASE_URL=postgresql://sbory:sbory@localhost:54329/sbory node scripts/import-db.mjs` (нужен `data-export.json`).

## Требования

- Node.js 22+
- Docker (для локального Postgres и прод-сборки)

## Архитектура

```
Браузер ──HTTPS──> nginx ──> Next.js (standalone, Docker)
                               ├─ route handlers /api/*  (валидация на границе, pg Pool)
                               ├─ SSE /api/events  ←  LISTEN/NOTIFY (триггеры в схеме)
                               └─> Postgres 16 (Docker, наружу не торчит)
```

Клиент — React Query поверх `lib/queries/*`; realtime — `useTripRealtime` (EventSource → инвалидация кэшей). Схема БД: `db/schema.sql`.

## Деплой

Прод: **https://sbory.mirobase.ru** (vps-ru-1). Один шаг:

```bash
bash scripts/deploy.sh   # локальная сборка образа → доставка по SSH → docker compose up -d
```

Детали серверного контура (nginx/SNI, сертификаты, секреты, импорт данных) — в [deploy/README.md](deploy/README.md).

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4, React Query 5 |
| Backend | Next.js route handlers, `pg`, Postgres 16 |
| Realtime | Postgres LISTEN/NOTIFY → Server-Sent Events |
| Деплой | Docker (standalone), nginx, Let's Encrypt |

## Тесты

```bash
npm test          # vitest
npx tsc --noEmit  # типы
```
