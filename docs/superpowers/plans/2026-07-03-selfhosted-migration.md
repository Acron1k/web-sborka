# Self-Hosted Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести приложение с Vercel + Supabase на vps-ru-1 (Docker: Postgres 16 + Next.js standalone за nginx), полностью выпилив Supabase и сохранив все данные.

**Architecture:** Клиентские вызовы supabase-js заменяются на fetch к собственным route handlers (`app/api/*`), которые ходят в Postgres через `pg`. Realtime заменяется на SSE (`/api/events`) поверх Postgres LISTEN/NOTIFY с триггерами. Сигнатуры функций `lib/queries/*` и ключи React Query не меняются — компоненты не трогаем.

**Tech Stack:** Next.js 16.2.6 (App Router, route handlers, standalone), pg 8.x, PostgreSQL 16 (Docker), nginx + certbot (уже на сервере), Docker Compose.

**Спека:** `docs/superpowers/specs/2026-07-03-selfhosted-migration-design.md`

**Контекст сервера:** `vps-ru-1` (SSH-алиас из `~/.ssh/config`, root@185.56.162.59), Ubuntu 24.04, Docker 29 + Compose v5, nginx на хосте (80/443, SAN-сертификат mirobase.ru). Домен: **sbory.mirobase.ru** (A-запись добавляет пользователь). Порт приложения: `127.0.0.1:3002`. Каталог на сервере: `/opt/sbory`.

**Данные на момент планирования:** trips 7, families 22, items 131, item_claims 77, ai_suggestions 179.

**Next.js 16 особенности (из `node_modules/next/dist/docs/`):** route handlers — стандартные Web Request/Response, `ctx.params` — это **Promise** (`const { id } = await ctx.params`), GET-handlers не кэшируются по умолчанию; `output: 'standalone'` кладёт минимальный `server.js` в `.next/standalone`, `public/` и `.next/static` копируются руками; `PORT`/`HOSTNAME` задаются env-переменными.

---

## Задача 1: Ветка, зависимости, схема БД, dev-Postgres

**Files:**
- Create: `db/schema.sql`
- Create: `docker-compose.dev.yml`
- Modify: `package.json` (добавить `pg`, `@types/pg`)
- Modify: `.gitignore` (добавить `data-export.json`)
- Modify: `.env.local` (добавить `DATABASE_URL`; строки NEXT_PUBLIC_SUPABASE_* НЕ удалять — нужны экспорт-скрипту до cutover)

- [ ] **Step 1: Создать ветку**

```bash
git checkout -b migration-selfhosted
```

- [ ] **Step 2: Установить зависимости**

```bash
npm install pg
npm install -D @types/pg
```

Expected: `pg` в dependencies, `@types/pg` в devDependencies. `@supabase/supabase-js` пока НЕ удаляем (код ещё на нём).

- [ ] **Step 3: Написать `db/schema.sql`**

Полная боевая схема (закоммиченный `supabase/migrations/0001_init.sql` устарел — нет `ai_suggestions`, `needs_purchase`, `is_packed`, `is_purchased`). Без RLS. С NOTIFY-триггерами.

```sql
-- Каноничная схема БД (self-hosted). Применяется автоматически
-- контейнером postgres при первом старте (docker-entrypoint-initdb.d).

create table trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  color text not null default '#3b82f6',
  position int not null default 0
);

create index idx_families_trip on families(trip_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  list_type text not null,
  title text not null,
  qty text,
  category text,
  family_id uuid references families(id) on delete cascade,
  notes text,
  created_by_family_id uuid references families(id) on delete set null,
  is_done boolean not null default false,
  needs_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  constraint items_list_type_check check (list_type in ('common', 'personal', 'food')),
  constraint items_category_check check (category is null or category in ('meat', 'veg', 'drinks', 'snacks', 'other'))
);

create index idx_items_trip_list on items(trip_id, list_type);
create index idx_items_family on items(family_id);

create table item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  is_packed boolean not null default false,
  is_purchased boolean not null default false,
  unique (item_id, family_id)
);

create index idx_claims_item on item_claims(item_id);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  list_type text not null,
  title text not null,
  qty text,
  category text,
  importance text not null,
  reason text,
  added_to_list_at timestamptz,
  added_by_family_id uuid references families(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_suggestions_list_type_check check (list_type in ('common', 'personal', 'food')),
  constraint ai_suggestions_category_check check (category is null or category in ('meat', 'veg', 'drinks', 'snacks', 'other')),
  constraint ai_suggestions_importance_check check (importance in ('critical', 'recommended', 'optional'))
);

create index idx_suggestions_trip on ai_suggestions(trip_id);

-- Realtime: NOTIFY при изменениях, слушает Next.js (SSE /api/events)
create or replace function notify_trip_change() returns trigger
language plpgsql as $$
declare
  v_trip_id uuid;
begin
  if tg_table_name = 'item_claims' then
    if tg_op = 'DELETE' then
      select trip_id into v_trip_id from items where id = old.item_id;
    else
      select trip_id into v_trip_id from items where id = new.item_id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_trip_id := old.trip_id;
    else
      v_trip_id := new.trip_id;
    end if;
  end if;
  if v_trip_id is not null then
    perform pg_notify('trip_events',
      json_build_object('table', tg_table_name, 'trip_id', v_trip_id)::text);
  end if;
  return null;
end;
$$;

create trigger trg_items_notify
  after insert or update or delete on items
  for each row execute function notify_trip_change();

create trigger trg_families_notify
  after insert or update or delete on families
  for each row execute function notify_trip_change();

create trigger trg_claims_notify
  after insert or update or delete on item_claims
  for each row execute function notify_trip_change();

create trigger trg_suggestions_notify
  after insert or update or delete on ai_suggestions
  for each row execute function notify_trip_change();
```

Замечание: при каскадном удалении item его claims удаляются тоже; триггер клейма может не найти родительский item (`v_trip_id is null`) — это ок, инвалидация придёт от события по `items`.

- [ ] **Step 4: Написать `docker-compose.dev.yml`** (локальная БД для разработки)

```yaml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "54329:5432"
    environment:
      POSTGRES_DB: sbory
      POSTGRES_USER: sbory
      POSTGRES_PASSWORD: sbory
    volumes:
      - pgdata_dev:/var/lib/postgresql/data
      - ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro

volumes:
  pgdata_dev:
```

- [ ] **Step 5: Обновить `.gitignore` и `.env.local`**

В `.gitignore` добавить строку (в данных — имена семей, не коммитим):

```
data-export.json
```

В `.env.local` добавить (существующие строки не трогать):

```
DATABASE_URL=postgresql://sbory:sbory@localhost:54329/sbory
```

- [ ] **Step 6: Поднять dev-БД и проверить схему**

```bash
docker compose -f docker-compose.dev.yml up -d
sleep 5
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "\dt"
```

Expected: 5 таблиц (trips, families, items, item_claims, ai_suggestions).

```bash
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "select tgname from pg_trigger where not tgisinternal"
```

Expected: 4 триггера `trg_*_notify`.

Если схема менялась после первого старта: `docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d` (init-скрипт применяется только на пустой volume).

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql docker-compose.dev.yml package.json package-lock.json .gitignore
git commit -m "feat: canonical db schema, dev postgres, pg dependency"
```

---

## Задача 2: Бэкап — экспорт данных из Supabase

**Files:**
- Create: `scripts/export-supabase.mjs`

- [ ] **Step 1: Написать `scripts/export-supabase.mjs`**

Выгрузка через PostgREST с anon-ключом (работает, проверено: RLS открытый). Без новых зависимостей — голый fetch, `.env.local` парсим сами.

```js
// Экспорт всех таблиц из Supabase через REST API (anon key).
// Использование: node scripts/export-supabase.mjs
// Результат: data-export.json в корне проекта.
import { readFileSync, writeFileSync } from 'node:fs';

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY не найдены в .env.local');
  process.exit(1);
}

// order=id — стабильный порядок для пагинации
const TABLES = ['trips', 'families', 'items', 'item_claims', 'ai_suggestions'];
const PAGE = 1000;

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${BASE}/rest/v1/${table}?select=*&order=id`, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (res.status === 416) break; // Range за концом данных (ровно N×PAGE строк) — конец
    if (!res.ok && res.status !== 206) {
      throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const out = { exported_at: new Date().toISOString(), tables: {} };
for (const t of TABLES) {
  out.tables[t] = await fetchAll(t);
  console.log(`${t}: ${out.tables[t].length} rows`);
}
writeFileSync(new URL('../data-export.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('OK -> data-export.json');
```

- [ ] **Step 2: Запустить экспорт**

```bash
node scripts/export-supabase.mjs
```

Expected: счётчики строк по 5 таблицам (порядка trips 7, families 22, items 131, item_claims 77, ai_suggestions 179 — могло вырасти, поездка активно наполняется), файл `data-export.json` создан. Это сразу и **бэкап данных**.

- [ ] **Step 3: Проверить, что data-export.json не попадает в git**

```bash
git status --short
```

Expected: `data-export.json` отсутствует в выводе (заигнорен).

- [ ] **Step 4: Commit**

```bash
git add scripts/export-supabase.mjs
git commit -m "feat: supabase data export script"
```

---

## Задача 3: Импорт данных в Postgres

**Files:**
- Create: `scripts/import-db.mjs`

- [ ] **Step 1: Написать `scripts/import-db.mjs`**

```js
// Импорт data-export.json в Postgres (DATABASE_URL из env).
// Идемпотентен: TRUNCATE CASCADE перед вставкой.
// Использование: DATABASE_URL=postgresql://... node scripts/import-db.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан');
  process.exit(1);
}

const data = JSON.parse(readFileSync(new URL('../data-export.json', import.meta.url), 'utf8'));

const COLUMNS = {
  trips: ['id', 'slug', 'name', 'starts_on', 'ends_on', 'created_at'],
  families: ['id', 'trip_id', 'name', 'color', 'position'],
  items: [
    'id', 'trip_id', 'list_type', 'title', 'qty', 'category', 'family_id',
    'notes', 'created_by_family_id', 'is_done', 'needs_purchase', 'created_at',
  ],
  item_claims: ['id', 'item_id', 'family_id', 'claimed_at', 'is_packed', 'is_purchased'],
  ai_suggestions: [
    'id', 'trip_id', 'list_type', 'title', 'qty', 'category', 'importance',
    'reason', 'added_to_list_at', 'added_by_family_id', 'created_at',
  ],
};
// FK-порядок вставки
const ORDER = ['trips', 'families', 'items', 'item_claims', 'ai_suggestions'];

// Страховка cutover: новая схема строже прода (NOT NULL на булевых и timestamps).
// Булевы NULL коэрсим в false; NULL в прочих обязательных полях — громкий отказ
// ДО TRUNCATE, чтобы не остаться с пустой БД при битом экспорте.
const BOOL_COERCE = {
  items: ['is_done', 'needs_purchase'],
  item_claims: ['is_packed', 'is_purchased'],
};
const REQUIRED = {
  trips: ['id', 'slug', 'name', 'created_at'],
  families: ['id', 'trip_id', 'name', 'color', 'position'],
  items: ['id', 'trip_id', 'list_type', 'title', 'created_at'],
  item_claims: ['id', 'item_id', 'family_id', 'claimed_at'],
  ai_suggestions: ['id', 'trip_id', 'list_type', 'title', 'importance', 'created_at'],
};
for (const [table, req] of Object.entries(REQUIRED)) {
  for (const row of data.tables[table] ?? []) {
    for (const c of req) {
      if (row[c] == null) {
        console.error(`NOT NULL нарушение в экспорте: ${table}.${c} = null (id=${row.id})`);
        process.exit(1);
      }
    }
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  await client.query(
    'truncate trips, families, items, item_claims, ai_suggestions cascade'
  );
  for (const table of ORDER) {
    const cols = COLUMNS[table];
    const rows = data.tables[table] ?? [];
    for (const row of rows) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `insert into ${table} (${cols.join(', ')}) values (${placeholders})`,
        cols.map((c) => {
          const v = row[c] ?? null;
          if (v === null && (BOOL_COERCE[table] ?? []).includes(c)) return false;
          return v;
        })
      );
    }
    console.log(`${table}: ${rows.length} rows imported`);
  }
  await client.query('commit');
  const counts = await client.query(
    `select 'trips' t, count(*) n from trips
     union all select 'families', count(*) from families
     union all select 'items', count(*) from items
     union all select 'item_claims', count(*) from item_claims
     union all select 'ai_suggestions', count(*) from ai_suggestions`
  );
  console.table(counts.rows);
} catch (e) {
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
```

Замечание: TRUNCATE запускает NOTIFY-триггеры? Нет — TRUNCATE не вызывает row-level триггеры, а массовые INSERT'ы вызовут шквал `pg_notify`; на пустой прод-системе (никто не подключён по SSE) это безобидно.

- [ ] **Step 2: Прогнать импорт в dev-БД**

```bash
DATABASE_URL=postgresql://sbory:sbory@localhost:54329/sbory node scripts/import-db.mjs
```

Expected: счётчики совпадают с выводом экспорта (Задача 2, Step 2).

- [ ] **Step 3: Выборочная сверка данных**

```bash
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "select slug, name from trips order by created_at limit 3"
```

Expected: реальные slug'и и названия поездок из Supabase.

- [ ] **Step 4: Повторный прогон (идемпотентность)**

```bash
DATABASE_URL=postgresql://sbory:sbory@localhost:54329/sbory node scripts/import-db.mjs
```

Expected: те же счётчики, без ошибок unique violation.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-db.mjs
git commit -m "feat: postgres data import script"
```

---

## Задача 4: Серверная обвязка — db.ts, validate.ts, api-client.ts

**Files:**
- Create: `lib/server/db.ts`
- Create: `lib/server/validate.ts`
- Create: `lib/api-client.ts`
- Test: `lib/server/validate.test.ts`

- [ ] **Step 1: Написать падающий тест `lib/server/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isUuid, isListType, isCategoryOrNull, isImportance } from './validate';

describe('isUuid', () => {
  it('принимает валидный uuid', () => {
    expect(isUuid('a3bb189e-8bf9-3888-9912-ace4e6543002')).toBe(true);
  });
  it('отклоняет мусор, null и SQL-инъекции', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("'; drop table trips; --")).toBe(false);
  });
});

describe('isListType', () => {
  it('принимает common/personal/food', () => {
    expect(isListType('common')).toBe(true);
    expect(isListType('personal')).toBe(true);
    expect(isListType('food')).toBe(true);
  });
  it('отклоняет прочее', () => {
    expect(isListType('shopping')).toBe(false);
    expect(isListType(null)).toBe(false);
  });
});

describe('isCategoryOrNull', () => {
  it('принимает null и валидные категории', () => {
    expect(isCategoryOrNull(null)).toBe(true);
    expect(isCategoryOrNull('meat')).toBe(true);
    expect(isCategoryOrNull('other')).toBe(true);
  });
  it('отклоняет неизвестные категории', () => {
    expect(isCategoryOrNull('fish')).toBe(false);
  });
});

describe('isImportance', () => {
  it('принимает critical/recommended/optional', () => {
    expect(isImportance('critical')).toBe(true);
    expect(isImportance('optional')).toBe(true);
  });
  it('отклоняет прочее', () => {
    expect(isImportance('meh')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

```bash
npx vitest run lib/server/validate.test.ts
```

Expected: FAIL — `Cannot find module './validate'` (или аналогичная ошибка резолва).

- [ ] **Step 3: Написать `lib/server/validate.ts`**

```ts
import type { Category, Importance, ListType } from '@/lib/db/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

const LIST_TYPES: readonly string[] = ['common', 'personal', 'food'];
const CATEGORIES: readonly string[] = ['meat', 'veg', 'drinks', 'snacks', 'other'];
const IMPORTANCES: readonly string[] = ['critical', 'recommended', 'optional'];

export function isListType(v: unknown): v is ListType {
  return typeof v === 'string' && LIST_TYPES.includes(v);
}

export function isCategoryOrNull(v: unknown): v is Category | null {
  return v === null || (typeof v === 'string' && CATEGORIES.includes(v));
}

export function isImportance(v: unknown): v is Importance {
  return typeof v === 'string' && IMPORTANCES.includes(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = 'Not found'): Response {
  return Response.json({ error: message }, { status: 404 });
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

```bash
npx vitest run lib/server/validate.test.ts
```

Expected: PASS (8 тестов).

- [ ] **Step 5: Написать `lib/server/db.ts`**

```ts
import { Pool, types } from 'pg';

// DATE (oid 1082) отдаём строкой 'YYYY-MM-DD' — как отдавал Supabase.
// timestamptz остаётся Date: Response.json сериализует его в ISO-строку.
types.setTypeParser(1082, (v) => v);

// В dev с HMR модуль перевычисляется — переиспользуем пул через globalThis.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;
```

Замечание: не бросаем ошибку при отсутствии `DATABASE_URL` на этапе импорта модуля — `next build` импортирует route-модули без env; Pool без строки подключения падает только при первом query, что нас устраивает.

- [ ] **Step 6: Написать `lib/api-client.ts`** (клиентская обёртка для lib/queries/*)

```ts
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // тело не JSON — оставляем statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T = void>(url: string) => request<T>('DELETE', url),
};
```

- [ ] **Step 7: Полный прогон тестов и коммит**

```bash
npm test
```

Expected: PASS (duplicate.test.ts + validate.test.ts).

```bash
git add lib/server/db.ts lib/server/validate.ts lib/server/validate.test.ts lib/api-client.ts
git commit -m "feat: pg pool, api validation helpers, client api wrapper"
```

---

## Задача 5: API trips + переписать lib/queries/trip.ts и app/page.tsx

**Files:**
- Create: `app/api/trips/route.ts`
- Create: `app/api/trips/[slug]/route.ts`
- Modify: `lib/queries/trip.ts`
- Modify: `app/page.tsx:1-61` (импорты + handleCreate)

- [ ] **Step 1: Написать `app/api/trips/route.ts`** (создание поездки + семей одной транзакцией)

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isNonEmptyString } from '@/lib/server/validate';
import type { Trip } from '@/lib/db/types';

type CreateTripBody = {
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  families: { name: string; color: string; position: number }[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateTripBody | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isNonEmptyString(body.slug)) return badRequest('slug обязателен');
  if (!isNonEmptyString(body.name)) return badRequest('name обязателен');
  if (!Array.isArray(body.families) || body.families.length < 2) {
    return badRequest('Нужно минимум 2 семьи');
  }
  if (body.families.some((f) => !isNonEmptyString(f.name) || !isNonEmptyString(f.color))) {
    return badRequest('У каждой семьи должны быть name и color');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<Trip>(
      `insert into trips (slug, name, starts_on, ends_on)
       values ($1, $2, $3, $4) returning *`,
      [body.slug.trim(), body.name.trim(), body.starts_on || null, body.ends_on || null]
    );
    const trip = rows[0];
    for (const f of body.families) {
      await client.query(
        `insert into families (trip_id, name, color, position) values ($1, $2, $3, $4)`,
        [trip.id, f.name.trim(), f.color, f.position]
      );
    }
    await client.query('commit');
    return Response.json(trip, { status: 201 });
  } catch (e) {
    await client.query('rollback');
    if ((e as { code?: string }).code === '23505') {
      return Response.json({ error: 'Такой slug уже существует, попробуй ещё раз' }, { status: 409 });
    }
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Написать `app/api/trips/[slug]/route.ts`**

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isNonEmptyString, notFound } from '@/lib/server/validate';
import type { Family, Trip } from '@/lib/db/types';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  if (!isNonEmptyString(slug)) return badRequest('slug обязателен');

  const { rows: trips } = await pool.query<Trip>(
    'select * from trips where slug = $1',
    [slug]
  );
  if (trips.length === 0) return notFound('Поездка не найдена');
  const trip = trips[0];

  const { rows: families } = await pool.query<Family>(
    'select * from families where trip_id = $1 order by position',
    [trip.id]
  );
  return Response.json({ trip, families });
}
```

- [ ] **Step 3: Переписать `lib/queries/trip.ts`**

Полное новое содержимое файла:

```ts
import { api, ApiError } from '@/lib/api-client';
import type { Trip, Family } from '@/lib/db/types';

export async function fetchTripBySlug(slug: string): Promise<{ trip: Trip; families: Family[] } | null> {
  try {
    return await api.get<{ trip: Trip; families: Family[] }>(
      `/api/trips/${encodeURIComponent(slug)}`
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
```

- [ ] **Step 4: Переписать handleCreate в `app/page.tsx`**

Заменить импорт `import { supabase } from '@/lib/supabase/client';` на `import { api, ApiError } from '@/lib/api-client';` и заменить тело `handleCreate` (строки 26-61) на:

```ts
  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) return setError('Введи название поездки');
    const cleanFamilies = families.map(f => f.trim()).filter(Boolean);
    if (cleanFamilies.length < 2) return setError('Нужно минимум 2 семьи');

    setLoading(true);
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await api.post('/api/trips', {
        slug,
        name: name.trim(),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        families: cleanFamilies.map((fname, i) => ({
          name: fname,
          color: FAMILY_COLORS[i % FAMILY_COLORS.length],
          position: i,
        })),
      });
      router.push(`/t/${slug}/join`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка создания поездки');
      setLoading(false);
    }
  };
```

Остальной JSX файла не трогать.

- [ ] **Step 5: Проверить руками через dev-сервер**

```bash
npm run dev
```

В другом терминале:

```bash
curl -s http://localhost:3000/api/trips -X POST -H "Content-Type: application/json" \
  -d '{"slug":"test-curl-0001","name":"Тест","starts_on":null,"ends_on":null,"families":[{"name":"А","color":"#f00","position":0},{"name":"Б","color":"#0f0","position":1}]}'
```

Expected: JSON поездки со status 201.

```bash
curl -s http://localhost:3000/api/trips/test-curl-0001
```

Expected: `{"trip":{...},"families":[два элемента]}`.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/trips/no-such-slug
```

Expected: `404`.

Открыть `http://localhost:3000`, создать поездку через форму — редирект на `/t/<slug>/join`, семьи отображаются (страница join использует fetchTripBySlug → уже новый путь).

Удалить тестовый мусор:

```bash
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "delete from trips where slug like 'test-curl-%'"
```

Поездку, созданную через форму, удалить по её конкретному slug (НЕ по широкому LIKE — в БД реальные данные):

```bash
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "delete from trips where slug = '<slug-из-адресной-строки>'"
```

- [ ] **Step 6: Commit**

```bash
git add app/api/trips lib/queries/trip.ts app/page.tsx
git commit -m "feat: trips api routes, rewire trip queries off supabase"
```

---

## Задача 6: API items + переписать item-функции lib/queries/items.ts

**Files:**
- Create: `app/api/items/route.ts`
- Create: `app/api/items/[id]/route.ts`
- Modify: `lib/queries/items.ts`

- [ ] **Step 1: Написать `app/api/items/route.ts`**

GET — список items (фильтры tripId, listType, familyId); POST — создание, опционально с claims (заменяет и `insertItem`, и `insertItemWithClaims`).

```ts
import { pool } from '@/lib/server/db';
import {
  badRequest,
  isCategoryOrNull,
  isListType,
  isNonEmptyString,
  isUuid,
} from '@/lib/server/validate';
import type { Item } from '@/lib/db/types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
  const listType = url.searchParams.get('listType');
  const familyId = url.searchParams.get('familyId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const conditions = ['trip_id = $1'];
  const params: unknown[] = [tripId];
  if (listType !== null) {
    if (!isListType(listType)) return badRequest('невалидный listType');
    params.push(listType);
    conditions.push(`list_type = $${params.length}`);
  }
  if (familyId !== null) {
    if (!isUuid(familyId)) return badRequest('familyId должен быть uuid');
    params.push(familyId);
    conditions.push(`family_id = $${params.length}`);
  }

  const { rows } = await pool.query<Item>(
    `select * from items where ${conditions.join(' and ')} order by created_at asc`,
    params
  );
  return Response.json(rows);
}

type CreateItemBody = {
  trip_id: string;
  list_type: string;
  title: string;
  qty?: string | null;
  category?: string | null;
  family_id?: string | null;
  notes?: string | null;
  created_by_family_id: string;
  needs_purchase?: boolean;
  claimFamilyIds?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateItemBody | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.trip_id)) return badRequest('trip_id должен быть uuid');
  if (!isListType(body.list_type)) return badRequest('невалидный list_type');
  if (!isNonEmptyString(body.title)) return badRequest('title обязателен');
  if (!isCategoryOrNull(body.category ?? null)) return badRequest('невалидная category');
  if (!isUuid(body.created_by_family_id)) return badRequest('created_by_family_id должен быть uuid');
  if (body.family_id != null && !isUuid(body.family_id)) return badRequest('family_id должен быть uuid');
  const claimFamilyIds = body.claimFamilyIds ?? [];
  if (!Array.isArray(claimFamilyIds) || claimFamilyIds.some((id) => !isUuid(id))) {
    return badRequest('claimFamilyIds должны быть uuid');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<Item>(
      `insert into items
         (trip_id, list_type, title, qty, category, family_id, notes,
          created_by_family_id, is_done, needs_purchase)
       values ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       returning *`,
      [
        body.trip_id,
        body.list_type,
        body.title.trim(),
        body.qty ?? null,
        body.category ?? null,
        body.family_id ?? null,
        body.notes ?? null,
        body.created_by_family_id,
        body.needs_purchase ?? false,
      ]
    );
    const item = rows[0];
    for (const familyId of claimFamilyIds) {
      await client.query(
        `insert into item_claims (item_id, family_id) values ($1, $2)
         on conflict (item_id, family_id) do nothing`,
        [item.id, familyId]
      );
    }
    await client.query('commit');
    return Response.json(item, { status: 201 });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Написать `app/api/items/[id]/route.ts`**

PATCH — частичное обновление (title, qty, category, needs_purchase, is_done); DELETE — удаление.

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isCategoryOrNull, isNonEmptyString, isUuid, notFound } from '@/lib/server/validate';

type PatchBody = {
  title?: string;
  qty?: string | null;
  category?: string | null;
  needs_purchase?: boolean;
  is_done?: boolean;
};

const PATCHABLE = ['title', 'qty', 'category', 'needs_purchase', 'is_done'] as const;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return badRequest('Невалидный JSON');

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const key of PATCHABLE) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === 'title' && !isNonEmptyString(value)) return badRequest('title не может быть пустым');
    if (key === 'category' && !isCategoryOrNull(value ?? null)) return badRequest('невалидная category');
    if ((key === 'needs_purchase' || key === 'is_done') && typeof value !== 'boolean') {
      return badRequest(`${key} должен быть boolean`);
    }
    params.push(value ?? null);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return badRequest('Нет полей для обновления');

  const result = await pool.query(
    `update items set ${sets.join(', ')} where id = $1`,
    params
  );
  if (result.rowCount === 0) return notFound('Item не найден');
  return new Response(null, { status: 204 });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query('delete from items where id = $1', [id]);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Переписать item-функции в `lib/queries/items.ts`**

Добавить `import { api } from '@/lib/api-client';` рядом с существующими импортами. Импорт supabase ПОКА ОСТАВИТЬ: функции claim'ов (`fetchClaims`, `markPurchasedByCurrentFamily`, `toggleClaim`, `fetchClaimedItemsForFamily`, `toggleClaimPacked`) в этой задаче не трогаем — они переезжают в Задаче 7, там же удалится supabase-импорт (файл временно импортирует и api, и supabase — это ок).

Новые тела item-функций (сигнатуры не меняются):

```ts
export async function fetchItems(tripId: string, listType: ListType): Promise<Item[]> {
  return api.get<Item[]>(`/api/items?tripId=${tripId}&listType=${listType}`);
}

export async function insertItem(payload: {
  trip_id: string;
  list_type: ListType;
  title: string;
  qty?: string | null;
  category?: Category | null;
  family_id?: string | null;
  created_by_family_id: string;
  needs_purchase?: boolean;
}): Promise<Item> {
  return api.post<Item>('/api/items', payload);
}

export async function deleteItem(itemId: string): Promise<void> {
  await api.del(`/api/items/${itemId}`);
}

export async function updateItem(
  itemId: string,
  patch: Partial<Pick<Item, 'title' | 'qty' | 'category' | 'needs_purchase'>>
): Promise<void> {
  await api.patch(`/api/items/${itemId}`, patch);
}

export async function insertItemWithClaims(
  payload: Parameters<typeof insertItem>[0],
  familyIds: string[]
): Promise<Item> {
  return api.post<Item>('/api/items', { ...payload, claimFamilyIds: familyIds });
}

export async function fetchPersonalItems(tripId: string, familyId: string): Promise<Item[]> {
  return api.get<Item[]>(`/api/items?tripId=${tripId}&listType=personal&familyId=${familyId}`);
}

export async function togglePersonalDone(itemId: string, done: boolean): Promise<void> {
  await api.patch(`/api/items/${itemId}`, { is_done: done });
}
```

- [ ] **Step 4: Проверить через dev-сервер**

`npm run dev` уже запущен. Взять реальный tripId из dev-БД:

```bash
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -tAc "select id from trips limit 1"
```

```bash
curl -s "http://localhost:3000/api/items?tripId=<TRIP_ID>&listType=common" | head -c 400
```

Expected: JSON-массив items с полями trip_id/list_type/title.

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/items?tripId=abc"
```

Expected: `400`.

Открыть в браузере реальную поездку `http://localhost:3000/t/<slug>` (slug из Задачи 3 Step 3): список вещей отображается из dev-БД, добавление/редактирование/удаление item работает.

- [ ] **Step 5: Commit**

```bash
git add app/api/items lib/queries/items.ts
git commit -m "feat: items api routes, rewire item queries off supabase"
```

---

## Задача 7: API claims + packing + оставшиеся функции items.ts

**Files:**
- Create: `app/api/claims/route.ts`
- Create: `app/api/claims/[id]/route.ts`
- Create: `app/api/claims/toggle/route.ts`
- Create: `app/api/claims/purchase/route.ts`
- Create: `app/api/packing/route.ts`
- Modify: `lib/queries/items.ts` (остальные функции, убрать импорт supabase)

- [ ] **Step 1: Написать `app/api/claims/route.ts`**

Один SQL с join вместо клиентского обходного манёвра «два запроса» (`lib/queries/items.ts:15-25` старой версии).

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  const { rows } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1`,
    [tripId]
  );
  return Response.json(rows);
}
```

- [ ] **Step 2: Написать `app/api/claims/toggle/route.ts`**

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

type Body = { itemId: string; familyId: string; claimed: boolean };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.itemId)) return badRequest('itemId должен быть uuid');
  if (!isUuid(body.familyId)) return badRequest('familyId должен быть uuid');
  if (typeof body.claimed !== 'boolean') return badRequest('claimed должен быть boolean');

  if (body.claimed) {
    await pool.query(
      `insert into item_claims (item_id, family_id) values ($1, $2)
       on conflict (item_id, family_id) do nothing`,
      [body.itemId, body.familyId]
    );
  } else {
    await pool.query(
      'delete from item_claims where item_id = $1 and family_id = $2',
      [body.itemId, body.familyId]
    );
  }
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Написать `app/api/claims/purchase/route.ts`**

Upsert одним запросом (заменяет select+branch из `markPurchasedByCurrentFamily`).

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

type Body = { itemId: string; familyId: string; purchased: boolean };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.itemId)) return badRequest('itemId должен быть uuid');
  if (!isUuid(body.familyId)) return badRequest('familyId должен быть uuid');
  if (typeof body.purchased !== 'boolean') return badRequest('purchased должен быть boolean');

  await pool.query(
    `insert into item_claims (item_id, family_id, is_purchased)
     values ($1, $2, $3)
     on conflict (item_id, family_id) do update set is_purchased = excluded.is_purchased`,
    [body.itemId, body.familyId, body.purchased]
  );
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Написать `app/api/claims/[id]/route.ts`** (PATCH is_packed)

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid, notFound } from '@/lib/server/validate';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as { is_packed?: boolean } | null;
  if (!body || typeof body.is_packed !== 'boolean') {
    return badRequest('is_packed должен быть boolean');
  }
  const result = await pool.query(
    'update item_claims set is_packed = $2 where id = $1',
    [id, body.is_packed]
  );
  if (result.rowCount === 0) return notFound('Claim не найден');
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 5: Написать `app/api/packing/route.ts`** (замена fetchClaimedItemsForFamily)

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { Item, ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
  const familyId = url.searchParams.get('familyId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  if (!isUuid(familyId)) return badRequest('familyId должен быть uuid');

  const { rows: items } = await pool.query<Item>(
    'select * from items where trip_id = $1',
    [tripId]
  );
  const { rows: allClaims } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1`,
    [tripId]
  );
  const myClaims = allClaims.filter((c) => c.family_id === familyId);
  return Response.json({ items, myClaims, allClaims });
}
```

- [ ] **Step 6: Переписать оставшиеся функции `lib/queries/items.ts` и убрать supabase-импорт**

Удалить строку `import { supabase } from '@/lib/supabase/client';`. Новые тела (сигнатуры и JSDoc-комментарии сохранить):

```ts
export async function fetchClaims(tripId: string): Promise<ItemClaim[]> {
  return api.get<ItemClaim[]>(`/api/claims?tripId=${tripId}`);
}

export async function markPurchasedByCurrentFamily(
  itemId: string,
  familyId: string,
  purchased: boolean
): Promise<void> {
  await api.post('/api/claims/purchase', { itemId, familyId, purchased });
}

export async function toggleClaim(itemId: string, familyId: string, claimed: boolean): Promise<void> {
  await api.post('/api/claims/toggle', { itemId, familyId, claimed });
}

export async function fetchClaimedItemsForFamily(
  tripId: string,
  familyId: string
): Promise<{ items: Item[]; myClaims: ItemClaim[]; allClaims: ItemClaim[] }> {
  return api.get(`/api/packing?tripId=${tripId}&familyId=${familyId}`);
}

export async function toggleClaimPacked(claimId: string, packed: boolean): Promise<void> {
  await api.patch(`/api/claims/${claimId}`, { is_packed: packed });
}
```

- [ ] **Step 7: Проверить через dev-сервер**

В браузере на реальной поездке: клейм вещи от семьи (галочка «кто берёт») ставится/снимается; на вкладке личных сборов чекбокс «упаковано» работает; в UI покупок отметка «куплено» работает. Через curl:

```bash
curl -s "http://localhost:3000/api/claims?tripId=<TRIP_ID>" | head -c 300
curl -s "http://localhost:3000/api/packing?tripId=<TRIP_ID>&familyId=<FAMILY_ID>" | head -c 300
```

Expected: JSON-массив claims; JSON-объект `{items, myClaims, allClaims}`.

- [ ] **Step 8: Commit**

```bash
git add app/api/claims app/api/packing lib/queries/items.ts
git commit -m "feat: claims and packing api routes, items.ts fully off supabase"
```

---

## Задача 8: API shopping + переписать lib/queries/shopping.ts

**Files:**
- Create: `app/api/shopping/route.ts`
- Modify: `lib/queries/shopping.ts`

- [ ] **Step 1: Написать `app/api/shopping/route.ts`**

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { Item, ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const { rows: items } = await pool.query<Item>(
    `select * from items
     where trip_id = $1 and needs_purchase = true
     order by created_at asc`,
    [tripId]
  );
  if (items.length === 0) return Response.json({ items: [], claims: [] });

  const { rows: claims } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1 and i.needs_purchase = true`,
    [tripId]
  );
  return Response.json({ items, claims });
}
```

- [ ] **Step 2: Переписать `lib/queries/shopping.ts`**

Полное новое содержимое (JSDoc сохранить):

```ts
import { api } from '@/lib/api-client';
import type { Item, ItemClaim } from '@/lib/db/types';

/**
 * Fetch all items where needs_purchase=true for the trip, with their claims.
 */
export async function fetchShoppingItems(
  tripId: string
): Promise<{ items: Item[]; claims: ItemClaim[] }> {
  return api.get(`/api/shopping?tripId=${tripId}`);
}
```

- [ ] **Step 3: Проверить**

```bash
curl -s "http://localhost:3000/api/shopping?tripId=<TRIP_ID>" | head -c 300
```

Expected: `{"items":[...],"claims":[...]}`. В браузере вкладка «Покупки» показывает те же данные, что и раньше.

- [ ] **Step 4: Commit**

```bash
git add app/api/shopping lib/queries/shopping.ts
git commit -m "feat: shopping api route off supabase"
```

---

## Задача 9: API suggestions + переписать lib/queries/ai-suggestions.ts

**Files:**
- Create: `app/api/suggestions/route.ts`
- Create: `app/api/suggestions/bulk/route.ts`
- Create: `app/api/suggestions/[id]/route.ts`
- Create: `app/api/suggestions/[id]/promote/route.ts`
- Create: `app/api/suggestions/[id]/unpromote/route.ts`
- Modify: `lib/queries/ai-suggestions.ts`

- [ ] **Step 1: Написать `app/api/suggestions/route.ts`** (GET список)

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { AISuggestion } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  const { rows } = await pool.query<AISuggestion>(
    'select * from ai_suggestions where trip_id = $1 order by created_at asc',
    [tripId]
  );
  return Response.json(rows);
}
```

- [ ] **Step 2: Написать `app/api/suggestions/bulk/route.ts`**

```ts
import { pool } from '@/lib/server/db';
import {
  badRequest,
  isCategoryOrNull,
  isImportance,
  isListType,
  isNonEmptyString,
  isUuid,
} from '@/lib/server/validate';

type Suggestion = {
  list_type: string;
  title: string;
  qty?: string | null;
  category?: string | null;
  importance: string;
  reason?: string | null;
};
type Body = { tripId: string; suggestions: Suggestion[] };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.tripId)) return badRequest('tripId должен быть uuid');
  if (!Array.isArray(body.suggestions)) return badRequest('suggestions должен быть массивом');
  if (body.suggestions.length === 0) return new Response(null, { status: 204 });
  for (const s of body.suggestions) {
    if (!isListType(s.list_type)) return badRequest('невалидный list_type');
    if (!isNonEmptyString(s.title)) return badRequest('title обязателен');
    if (!isCategoryOrNull(s.category ?? null)) return badRequest('невалидная category');
    if (!isImportance(s.importance)) return badRequest('невалидная importance');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const s of body.suggestions) {
      await client.query(
        `insert into ai_suggestions (trip_id, list_type, title, qty, category, importance, reason)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [body.tripId, s.list_type, s.title.trim(), s.qty ?? null, s.category ?? null, s.importance, s.reason ?? null]
      );
    }
    await client.query('commit');
    return new Response(null, { status: 204 });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Написать `app/api/suggestions/[id]/route.ts`** (DELETE)

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query('delete from ai_suggestions where id = $1', [id]);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Написать `app/api/suggestions/[id]/promote/route.ts`**

Вся логика промоута (item + claims + отметка suggestion) — одной транзакцией на сервере. Раньше это были 2-3 нетранзакционных запроса с клиента.

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid, notFound } from '@/lib/server/validate';
import type { AISuggestion } from '@/lib/db/types';

type Body = { myFamilyId: string; claimedBy?: string[] };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !isUuid(body.myFamilyId)) return badRequest('myFamilyId должен быть uuid');
  const claimedBy = body.claimedBy ?? [];
  if (!Array.isArray(claimedBy) || claimedBy.some((f) => !isUuid(f))) {
    return badRequest('claimedBy должны быть uuid');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<AISuggestion>(
      'select * from ai_suggestions where id = $1 for update',
      [id]
    );
    if (rows.length === 0) {
      await client.query('rollback');
      return notFound('Suggestion не найден');
    }
    const s = rows[0];
    const isPersonal = s.list_type === 'personal';
    const { rows: itemRows } = await client.query<{ id: string }>(
      `insert into items
         (trip_id, list_type, title, qty, category, family_id, created_by_family_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        s.trip_id,
        s.list_type,
        s.title,
        s.qty,
        s.category,
        isPersonal ? body.myFamilyId : null,
        body.myFamilyId,
      ]
    );
    if (!isPersonal) {
      for (const familyId of claimedBy) {
        await client.query(
          `insert into item_claims (item_id, family_id) values ($1, $2)
           on conflict (item_id, family_id) do nothing`,
          [itemRows[0].id, familyId]
        );
      }
    }
    await client.query(
      `update ai_suggestions
       set added_to_list_at = now(), added_by_family_id = $2
       where id = $1`,
      [id, body.myFamilyId]
    );
    await client.query('commit');
    return new Response(null, { status: 204 });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Написать `app/api/suggestions/[id]/unpromote/route.ts`**

```ts
import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query(
    'update ai_suggestions set added_to_list_at = null, added_by_family_id = null where id = $1',
    [id]
  );
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 6: Переписать `lib/queries/ai-suggestions.ts`**

Полное новое содержимое (тип `NewSuggestion` и JSDoc-комментарии сохранить как есть):

```ts
import { api } from '@/lib/api-client';
import type { AISuggestion, Importance, ListType, Category } from '@/lib/db/types';

export async function fetchSuggestions(tripId: string): Promise<AISuggestion[]> {
  return api.get<AISuggestion[]>(`/api/suggestions?tripId=${tripId}`);
}

export type NewSuggestion = {
  list_type: ListType;
  title: string;
  qty?: string | null;
  category?: Category | null;
  importance: Importance;
  reason?: string | null;
};

export async function bulkInsertSuggestions(
  tripId: string,
  suggestions: NewSuggestion[]
): Promise<void> {
  if (suggestions.length === 0) return;
  await api.post('/api/suggestions/bulk', { tripId, suggestions });
}

export async function deleteSuggestion(id: string): Promise<void> {
  await api.del(`/api/suggestions/${id}`);
}

/**
 * Promote suggestion to actual list: create items row, mark suggestion as promoted.
 * For 'personal' — family_id из аргумента (моя семья).
 * Для 'common' и 'food' — claimedBy[] (опциональный список семей которые «возьмут»).
 */
export async function promoteSuggestion(
  suggestion: AISuggestion,
  myFamilyId: string,
  claimedBy: string[] = []
): Promise<void> {
  await api.post(`/api/suggestions/${suggestion.id}/promote`, { myFamilyId, claimedBy });
}

export async function unpromoteSuggestion(id: string): Promise<void> {
  // На случай отмены — снимаем флаг (item НЕ удаляем, пользователь делает руками)
  await api.post(`/api/suggestions/${id}/unpromote`);
}
```

Замечание: `insertItemWithClaims` больше не импортируется здесь — промоут целиком серверный.

- [ ] **Step 7: Проверить**

В браузере вкладка AI-подсказок: список отображается, промоут подсказки создаёт item и помечает подсказку, отмена промоута снимает отметку, удаление работает. Curl-проверка списка:

```bash
curl -s "http://localhost:3000/api/suggestions?tripId=<TRIP_ID>" | head -c 300
```

Expected: JSON-массив suggestions.

- [ ] **Step 8: Commit**

```bash
git add app/api/suggestions lib/queries/ai-suggestions.ts
git commit -m "feat: ai suggestions api routes with transactional promote"
```

---

## Задача 10: SSE realtime — listener, /api/events, lib/realtime.ts

**Files:**
- Create: `lib/server/listener.ts`
- Create: `app/api/events/route.ts`
- Modify: `lib/realtime.ts` (полная замена содержимого)

- [ ] **Step 1: Написать `lib/server/listener.ts`**

Один pg-клиент на процесс слушает канал `trip_events`, раздаёт события подписчикам по trip_id.

```ts
import { Client } from 'pg';

type Subscriber = (table: string) => void;

class TripListener {
  private subscribers = new Map<string, Set<Subscriber>>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  private async ensureConnected(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      client.on('notification', (msg) => {
        if (!msg.payload) return;
        try {
          const { table, trip_id } = JSON.parse(msg.payload) as {
            table: string;
            trip_id: string;
          };
          this.subscribers.get(trip_id)?.forEach((fn) => fn(table));
        } catch {
          // битый payload — игнорируем
        }
      });
      client.on('error', () => this.scheduleReconnect());
      await client.connect();
      await client.query('listen trip_events');
      this.client = client;
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private scheduleReconnect() {
    this.client = null;
    setTimeout(() => {
      // реконнект нужен только если кто-то слушает
      if (this.subscribers.size > 0) {
        this.ensureConnected().catch(() => this.scheduleReconnect());
      }
    }, 3000);
  }

  async subscribe(tripId: string, fn: Subscriber): Promise<() => void> {
    await this.ensureConnected();
    let set = this.subscribers.get(tripId);
    if (!set) {
      set = new Set();
      this.subscribers.set(tripId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(tripId);
    };
  }
}

// Синглтон, переживающий HMR в dev
const globalForListener = globalThis as unknown as { tripListener?: TripListener };
export const tripListener = globalForListener.tripListener ?? new TripListener();
if (process.env.NODE_ENV !== 'production') globalForListener.tripListener = tripListener;
```

- [ ] **Step 2: Написать `app/api/events/route.ts`**

```ts
import { tripListener } from '@/lib/server/listener';
import { badRequest, isUuid } from '@/lib/server/validate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      send('event: hello\ndata: {}\n\n');
      const unsubscribe = await tripListener.subscribe(tripId, (table) => {
        send(`event: change\ndata: ${JSON.stringify({ table })}\n\n`);
      });
      const heartbeat = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
      };
      // клиент отвалился — прибираемся
      request.signal.addEventListener('abort', () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 3: Переписать `lib/realtime.ts`**

Полная замена содержимого. Публичный интерфейс (`useTripRealtime`, `RealtimeStatus`) и маппинг инвалидаций — точно те же, что были с Supabase.

```ts
'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'error';

export function useTripRealtime(tripId: string): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('idle');

  useEffect(() => {
    if (!tripId) return;
    setStatus('connecting');

    const es = new EventSource(`/api/events?tripId=${tripId}`);

    es.onopen = () => setStatus('live');
    // EventSource реконнектится сам; на время обрыва показываем error
    es.onerror = () => setStatus('error');

    es.addEventListener('change', (e) => {
      const { table } = JSON.parse((e as MessageEvent).data) as { table: string };
      switch (table) {
        case 'items':
          qc.invalidateQueries({ queryKey: ['items', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
          break;
        case 'item_claims':
          qc.invalidateQueries({ queryKey: ['claims', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
          break;
        case 'families':
          qc.invalidateQueries({ queryKey: ['trip'] });
          break;
        case 'ai_suggestions':
          qc.invalidateQueries({ queryKey: ['suggestions', tripId] });
          break;
      }
    });

    return () => {
      es.close();
      setStatus('idle');
    };
  }, [tripId, qc]);

  return status;
}
```

- [ ] **Step 4: Проверить SSE руками**

```bash
curl -N -s "http://localhost:3000/api/events?tripId=<TRIP_ID>" &
sleep 2
docker compose -f docker-compose.dev.yml exec db psql -U sbory -d sbory -c "update items set title = title where trip_id = '<TRIP_ID>' and id = (select id from items where trip_id = '<TRIP_ID>' limit 1)"
sleep 2
kill %1
```

Expected: в выводе curl — `event: hello`, затем `event: change` с `data: {"table":"items"}`.

- [ ] **Step 5: Проверить синхронизацию в двух вкладках**

Открыть поездку в двух вкладках браузера (за разные семьи). В одной добавить item — во второй он появляется без перезагрузки (~мгновенно). Индикатор live-статуса в UI горит как раньше.

- [ ] **Step 6: Commit**

```bash
git add lib/server/listener.ts app/api/events lib/realtime.ts
git commit -m "feat: sse realtime via postgres listen/notify"
```

---

## Задача 11: Зачистка Supabase + полная верификация

**Files:**
- Delete: `lib/supabase/client.ts` (и папку `lib/supabase/`)
- Delete: `supabase/migrations/0001_init.sql` (и папку `supabase/`)
- Modify: `package.json` (удалить `@supabase/supabase-js`, `zustand`)
- Modify: `.env.local.example`

- [ ] **Step 1: Убедиться, что импортов supabase не осталось**

```bash
grep -rn "supabase" app lib components --include="*.ts" --include="*.tsx"
```

Expected: пусто (если что-то нашлось — сначала мигрировать это место, потом продолжать).

- [ ] **Step 2: Удалить файлы и зависимости**

```bash
git rm -r lib/supabase supabase
npm uninstall @supabase/supabase-js zustand
```

Замечание: `zustand` в коде не используется (проверено grep'ом при разведке) — попутная зачистка мёртвой зависимости.

- [ ] **Step 3: Обновить `.env.local.example`**

Полное новое содержимое:

```
DATABASE_URL=postgresql://sbory:sbory@localhost:54329/sbory
```

- [ ] **Step 4: Полная верификация**

```bash
npm test
npm run lint
npm run build
```

Expected: тесты PASS, линт чистый, сборка успешна (в первый раз build может попросить `next typegen` для RouteContext-типов — мы используем ручную типизацию `ctx: { params: Promise<...> }`, поэтому не требуется).

- [ ] **Step 5: Финальный dev-smoke**

`npm run dev`: создать поездку → присоединиться семьёй → добавить вещи во все три списка → клейм → покупки → AI-подсказки (вставить тестовый JSON) → промоут → две вкладки синхронизируются. Удалить тестовую поездку через UI или psql.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove supabase and zustand, project runs fully on own api"
```

---

## Задача 12: Docker-сборка

**Files:**
- Modify: `next.config.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/nginx-sbory.conf`

- [ ] **Step 1: Включить standalone в `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Написать `.dockerignore`**

```
node_modules
.next
.git
data-export.json
.env*
docs
deploy
```

- [ ] **Step 3: Написать `Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Замечание: сборка образа идёт локально (на машине разработчика есть интернет для Google Fonts из `next/font/google`; на сервере build не запускаем — 3.8 GB RAM). Если `public/` в проекте отсутствует — создать пустой с `.gitkeep` до сборки.

- [ ] **Step 4: Написать `deploy/docker-compose.yml`** (для сервера)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: sbory
      POSTGRES_USER: sbory
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro
    ports:
      - "127.0.0.1:54329:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sbory -d sbory"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    image: sbory-app:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://sbory:${POSTGRES_PASSWORD}@db:5432/sbory
    ports:
      - "127.0.0.1:3002:3000"

volumes:
  pgdata:
```

Замечание: порт 54329 наружу смотрит только на 127.0.0.1 сервера — нужен для импорта данных через SSH-туннель. `POSTGRES_PASSWORD` берётся из `/opt/sbory/.env` (создаётся в Задаче 13).

- [ ] **Step 5: Написать `deploy/nginx-sbory.conf`**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sbory.mirobase.ru;

    # SSE: без буферизации, длинный таймаут
    location /api/events {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

(443-блок добавит certbot в Задаче 13.)

- [ ] **Step 6: Локальная проверка образа**

```bash
docker build --platform linux/amd64 -t sbory-app:latest .
docker run --rm -d --name sbory-test -p 3003:3000 \
  -e DATABASE_URL=postgresql://sbory:sbory@host.docker.internal:54329/sbory \
  sbory-app:latest
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/
curl -s "http://localhost:3003/api/trips/<SLUG_ИЗ_DEV_БД>" | head -c 200
docker stop sbory-test
```

Expected: `200` на корень; JSON поездки из dev-БД по API.

- [ ] **Step 7: Commit**

```bash
git add next.config.ts Dockerfile .dockerignore deploy
git commit -m "feat: docker build and server deploy configs"
```

---

## Задача 13: Провижининг сервера (vps-ru-1)

**Files:**
- Create: `scripts/deploy.sh`

Предусловие: пользователь добавил A-запись `sbory.mirobase.ru → 185.56.162.59`. Проверить:

```bash
nslookup sbory.mirobase.ru 1.1.1.1
```

Expected: `185.56.162.59`. Если записи ещё нет — nginx+certbot шаги (5-6) отложить, остальное можно делать.

- [ ] **Step 1: Написать `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
# Сборка локально -> доставка образа по SSH -> перезапуск на сервере.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=vps-ru-1
IMAGE=sbory-app:latest

echo "== build =="
docker build --platform linux/amd64 -t "$IMAGE" .

echo "== ship image =="
docker save "$IMAGE" | gzip | ssh "$HOST" 'gunzip | docker load'

echo "== sync configs =="
scp deploy/docker-compose.yml db/schema.sql "$HOST":/opt/sbory/

echo "== restart =="
ssh "$HOST" 'cd /opt/sbory && docker compose up -d && docker image prune -f'

echo "== done =="
ssh "$HOST" 'cd /opt/sbory && docker compose ps'
```

- [ ] **Step 2: Подготовить каталог и секреты на сервере**

```bash
ssh vps-ru-1 'mkdir -p /opt/sbory && [ -f /opt/sbory/.env ] || echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > /opt/sbory/.env && chmod 600 /opt/sbory/.env && cat /opt/sbory/.env | cut -c1-20'
```

Expected: `POSTGRES_PASSWORD=...` (обрезанный вывод — пароль сгенерирован).

- [ ] **Step 3: Первый деплой**

```bash
bash scripts/deploy.sh
```

Expected: образ собран, доставлен, `docker compose ps` показывает `db (healthy)` и `app (running)`.

- [ ] **Step 4: Проверить приложение изнутри сервера**

```bash
ssh vps-ru-1 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/'
ssh vps-ru-1 'docker compose -f /opt/sbory/docker-compose.yml exec db psql -U sbory -d sbory -c "\dt" | head -12'
```

Expected: `200`; 5 таблиц (схема применилась из init-скрипта).

- [ ] **Step 5: Настроить nginx** (требует DNS)

```bash
scp deploy/nginx-sbory.conf vps-ru-1:/etc/nginx/sites-available/sbory
ssh vps-ru-1 'ln -sf /etc/nginx/sites-available/sbory /etc/nginx/sites-enabled/sbory && nginx -t && systemctl reload nginx'
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`.

- [ ] **Step 6: Выпустить сертификат**

```bash
ssh vps-ru-1 'certbot --nginx -d sbory.mirobase.ru --non-interactive --agree-tos -m danilmir.5@gmail.com'
curl -s -o /dev/null -w "%{http_code}" https://sbory.mirobase.ru/
```

Expected: certbot дорасширяет конфиг 443-блоком; итоговый curl — `200`.

- [ ] **Step 7: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: one-command deploy script"
```

---

## Задача 14: Прод-импорт данных и smoke

- [ ] **Step 1: Импортировать данные на прод через SSH-туннель**

```bash
ssh -f -N -L 54330:127.0.0.1:54329 vps-ru-1
PGPASS=$(ssh vps-ru-1 "grep POSTGRES_PASSWORD /opt/sbory/.env | cut -d= -f2")
DATABASE_URL="postgresql://sbory:${PGPASS}@localhost:54330/sbory" node scripts/import-db.mjs
```

Expected: счётчики строк совпадают с последним экспортом.

Убить туннель:

```bash
# Windows Git Bash: найти и завершить фоновый ssh
ps | grep "ssh -f" ; kill <PID>
```

- [ ] **Step 2: Smoke на проде**

- `https://sbory.mirobase.ru/` — главная открывается.
- `https://sbory.mirobase.ru/t/<реальный-slug>/join` — реальная поездка, семьи на месте.
- Выбрать семью → списки вещей совпадают с тем, что в Supabase-версии.
- Открыть в двух вкладках/с телефона: добавить item в одной — появляется во второй (SSE через nginx работает).
- Проверить логи: `ssh vps-ru-1 'cd /opt/sbory && docker compose logs app --tail 50'` — без ошибок.
- Тестовые изменения откатить (удалить тестовый item).

- [ ] **Step 3: Прогнать lighthouse/задержки (опционально, сравнение с Vercel)**

Открыть DevTools → Network на `https://sbory.mirobase.ru`: время ответа `/api/items` ожидаемо < 100–200 мс (против сотен мс у free-tier Supabase).

---

## Задача 15: Cutover — финальная синхронизация данных

Предусловие: пользователь подтверждает момент («стоп редактирование» ~10 минут — предупредить семьи).

- [ ] **Step 1: Финальный экспорт из Supabase**

```bash
node scripts/export-supabase.mjs
```

Expected: свежие счётчики (могли вырасти с прошлого экспорта).

- [ ] **Step 2: Финальный импорт на прод**

```bash
ssh -f -N -L 54330:127.0.0.1:54329 vps-ru-1
PGPASS=$(ssh vps-ru-1 "grep POSTGRES_PASSWORD /opt/sbory/.env | cut -d= -f2")
DATABASE_URL="postgresql://sbory:${PGPASS}@localhost:54330/sbory" node scripts/import-db.mjs
```

Expected: счётчики импорта == счётчикам экспорта из Step 1. Импорт идемпотентен (TRUNCATE CASCADE), так что накатывается поверх данных Задачи 14 без дублей.

- [ ] **Step 3: Финальная сверка**

```bash
PGPASS=$(ssh vps-ru-1 "grep POSTGRES_PASSWORD /opt/sbory/.env | cut -d= -f2")
DATABASE_URL="postgresql://sbory:${PGPASS}@localhost:54330/sbory" node -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client({connectionString: process.env.DATABASE_URL});
  await c.connect();
  const r = await c.query(\"select 'trips' t, count(*) n from trips union all select 'families', count(*) from families union all select 'items', count(*) from items union all select 'item_claims', count(*) from item_claims union all select 'ai_suggestions', count(*) from ai_suggestions\");
  console.table(r.rows); await c.end();
});"
```

Expected: все 5 счётчиков совпадают с финальным экспортом. Убить туннель.

- [ ] **Step 4: Переключение пользователей**

Пользователь рассылает семьям новую ссылку `https://sbory.mirobase.ru/t/<slug>/join` (cookie выбора семьи привязана к домену — каждый выбирает семью заново, это ок).

- [ ] **Step 5: Merge ветки**

```bash
git checkout main && git merge migration-selfhosted && git push
```

- [ ] **Step 6: Пост-миграционные действия (пользователь, вручную, после пары дней стабильной работы)**

- Vercel: остановить/удалить проект (дашборд Vercel).
- Supabase: скачать финальный бэкап при желании, затем pause/удалить проект (дашборд Supabase).
- `data-export.json` остаётся локально как бэкап на чёрный день.

---

## Верификация плана против спеки

- Архитектура (compose, порт 3002, nginx, certbot) — Задачи 12, 13.
- Схема БД + триггеры — Задача 1.
- API-слой (все 16 функций из таблицы спеки) — Задачи 5-9.
- SSE realtime — Задача 10.
- Перенос данных (экспорт/импорт/cutover/сверка) — Задачи 2, 3, 14, 15.
- Сборка/деплой (standalone, Dockerfile, deploy.sh) — Задачи 12, 13.
- Зачистка Supabase/zustand, env — Задача 11.
- Верификация (тесты, smoke, счётчики) — Задачи 4, 11, 14, 15.
