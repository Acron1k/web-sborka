# Camping Trip App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Построить веб-приложение для совместных сборов 4 пар в поход с палатками — 3 списка (общее/личное/продукты), claims по семьям, детектор дублей, realtime-синхронизация, AI-импорт подсказок через JSON.

**Architecture:** Next.js App Router + Supabase (Postgres + Realtime + RLS), деплой на Vercel. Идентификация без паролей: trip slug в URL + выбор семьи + cookie. Одна таблица `items` для всех списков, отдельная `item_claims` для множественных берущих.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, shadcn/ui, Supabase JS client v2, React Query (TanStack Query), Zustand для локального стейта, `fast-levenshtein` для детектора дублей.

**Reference:** Полный дизайн — `docs/plans/2026-05-12-camping-app-design.md`

---

## Pre-flight checklist

- [ ] Установлен Node.js 20+
- [ ] Установлен pnpm (или используем npm)
- [ ] Есть аккаунт на supabase.com
- [ ] Есть аккаунт на vercel.com (для деплоя в финале)

---

## Task 0: Инициализация репозитория и Next.js скаффолд

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.local.example`

**Step 0.1: Инициализировать git**

```bash
cd "C:\Coding\Прила для сборов с палатками"
git init
git config core.autocrlf true
```

**Step 0.2: Создать Next.js приложение**

Run в текущей директории (флаг `.` ставит в `cwd`, чтобы не создавать вложенную папку):

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm
```

При интерактивных вопросах:
- ESLint: Yes
- Turbopack: Yes

**Step 0.3: Установить базовые зависимости**

```bash
npm install @supabase/supabase-js @tanstack/react-query zustand fast-levenshtein
npm install -D @types/fast-levenshtein
```

**Step 0.4: Инициализировать shadcn/ui**

```bash
npx shadcn@latest init -d
```

Принять дефолты (Slate / CSS variables / yes).

**Step 0.5: Установить нужные shadcn компоненты**

```bash
npx shadcn@latest add button input label dialog tabs card checkbox progress badge separator
```

**Step 0.6: Создать `.env.local.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Скопировать в `.env.local` и оставить пустым пока — заполним в Task 1.

**Step 0.7: Verify**

```bash
npm run dev
```

Открыть `http://localhost:3000` — должна быть дефолтная страница Next.js. Остановить сервер (Ctrl+C).

**Step 0.8: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js app with Tailwind and shadcn/ui"
```

---

## Task 1: Supabase проект и SQL-миграция

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/db/types.ts`

**Step 1.1: Создать проект в Supabase**

Вручную в UI supabase.com:
1. New project → name: `camping-app`, region: ближайший
2. Скопировать URL и `anon` key в `.env.local`
3. В SQL Editor — выполнить миграцию из шага 1.2

**Step 1.2: Написать миграцию `supabase/migrations/0001_init.sql`**

```sql
-- Trips
create table trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz default now()
);

-- Families
create table families (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  color text not null default '#3b82f6',
  position int not null default 0
);

-- Items (общий, личный, продукты)
create table items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  list_type text not null check (list_type in ('common', 'personal', 'food')),
  title text not null,
  qty text,
  category text check (category in ('meat', 'veg', 'drinks', 'snacks', 'other')),
  family_id uuid references families(id) on delete cascade,
  notes text,
  created_by_family_id uuid references families(id) on delete set null,
  is_done boolean default false,
  created_at timestamptz default now()
);

create index idx_items_trip_list on items(trip_id, list_type);
create index idx_items_family on items(family_id);

-- Claims (кто берёт пункт)
create table item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  claimed_at timestamptz default now(),
  unique (item_id, family_id)
);

create index idx_claims_item on item_claims(item_id);

-- RLS: на MVP делаем permissive — все читают/пишут.
-- Логику изоляции личных списков делаем на клиенте по family_id из cookie.
-- В прод-варианте можно докрутить policies с JWT-claim'ами.
alter table trips enable row level security;
alter table families enable row level security;
alter table items enable row level security;
alter table item_claims enable row level security;

create policy "anon all trips"    on trips    for all using (true) with check (true);
create policy "anon all families" on families for all using (true) with check (true);
create policy "anon all items"    on items    for all using (true) with check (true);
create policy "anon all claims"   on item_claims for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table item_claims;
alter publication supabase_realtime add table families;
```

Применить через Supabase SQL Editor.

**Step 1.3: Создать `lib/supabase/client.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: { params: { eventsPerSecond: 10 } },
  }
);
```

**Step 1.4: Создать `lib/db/types.ts`**

```typescript
export type ListType = 'common' | 'personal' | 'food';
export type Category = 'meat' | 'veg' | 'drinks' | 'snacks' | 'other';

export type Trip = {
  id: string;
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  position: number;
};

export type Item = {
  id: string;
  trip_id: string;
  list_type: ListType;
  title: string;
  qty: string | null;
  category: Category | null;
  family_id: string | null;
  notes: string | null;
  created_by_family_id: string | null;
  is_done: boolean;
  created_at: string;
};

export type ItemClaim = {
  id: string;
  item_id: string;
  family_id: string;
  claimed_at: string;
};

export type Database = {
  public: {
    Tables: {
      trips: { Row: Trip; Insert: Omit<Trip, 'id' | 'created_at'>; Update: Partial<Trip> };
      families: { Row: Family; Insert: Omit<Family, 'id'>; Update: Partial<Family> };
      items: { Row: Item; Insert: Omit<Item, 'id' | 'created_at'>; Update: Partial<Item> };
      item_claims: { Row: ItemClaim; Insert: Omit<ItemClaim, 'id' | 'claimed_at'>; Update: Partial<ItemClaim> };
    };
  };
};
```

**Step 1.5: Verify**

В Supabase Table Editor проверить, что 4 таблицы созданы и пустые.

**Step 1.6: Commit**

```bash
git add supabase/ lib/ .env.local.example
git commit -m "feat: add Supabase schema and client"
```

---

## Task 2: React Query provider и layout

**Files:**
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`

**Step 2.1: Создать `app/providers.tsx`**

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 30, refetchOnWindowFocus: false },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

**Step 2.2: Обновить `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Сборы в поход',
  description: 'Совместное планирование поездки с палатками',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 2.3: Verify**

`npm run dev` → открыть localhost:3000 → страница рендерится, в DevTools нет ошибок React Query.

**Step 2.4: Commit**

```bash
git add app/
git commit -m "feat: add React Query provider"
```

---

## Task 3: Лендинг — создание поездки

**Files:**
- Create: `app/page.tsx` (заменить дефолт), `lib/slugify.ts`, `lib/colors.ts`

**Step 3.1: Создать `lib/slugify.ts`**

```typescript
export function slugify(text: string): string {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  };
  return text
    .toLowerCase()
    .split('')
    .map(c => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'trip';
}
```

**Step 3.2: Создать `lib/colors.ts`**

```typescript
export const FAMILY_COLORS = [
  '#ef4444', // красный
  '#3b82f6', // синий
  '#22c55e', // зелёный
  '#f59e0b', // оранжевый
  '#a855f7', // фиолетовый
  '#ec4899', // розовый
];
```

**Step 3.3: Переписать `app/page.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { slugify } from '@/lib/slugify';
import { FAMILY_COLORS } from '@/lib/colors';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [families, setFamilies] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFamily = (i: number, v: string) => {
    const next = [...families];
    next[i] = v;
    setFamilies(next);
  };

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) return setError('Введи название поездки');
    const cleanFamilies = families.map(f => f.trim()).filter(Boolean);
    if (cleanFamilies.length < 2) return setError('Нужно минимум 2 семьи');

    setLoading(true);
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert({ slug, name: name.trim(), starts_on: startsOn || null, ends_on: endsOn || null })
      .select()
      .single();

    if (tripErr || !trip) {
      setError(tripErr?.message ?? 'Ошибка создания поездки');
      setLoading(false);
      return;
    }

    const familiesPayload = cleanFamilies.map((fname, i) => ({
      trip_id: trip.id,
      name: fname,
      color: FAMILY_COLORS[i % FAMILY_COLORS.length],
      position: i,
    }));
    const { error: famErr } = await supabase.from('families').insert(familiesPayload);
    if (famErr) {
      setError(famErr.message);
      setLoading(false);
      return;
    }

    router.push(`/t/${slug}/join`);
  };

  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <h1 className="text-2xl font-bold mb-1">🏕️ Сборы в поход</h1>
      <p className="text-slate-600 mb-6">Заведи поездку и зови друзей по ссылке</p>

      <Card className="p-4 space-y-4">
        <div>
          <Label htmlFor="name">Название поездки</Label>
          <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Шашлыки на майские" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="starts">Старт</Label>
            <Input id="starts" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ends">Финиш</Label>
            <Input id="ends" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Семьи (минимум 2)</Label>
          <div className="space-y-2 mt-2">
            {families.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ background: FAMILY_COLORS[i % FAMILY_COLORS.length] }}
                />
                <Input value={f} onChange={e => updateFamily(i, e.target.value)} placeholder={`Семья ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" onClick={handleCreate} disabled={loading}>
          {loading ? 'Создаём…' : 'Создать поездку'}
        </Button>
      </Card>
    </main>
  );
}
```

**Step 3.4: Verify**

`npm run dev` → заполнить форму → нажать "Создать". Проверить в Supabase Table Editor что в `trips` и `families` появились строки. URL после редиректа: `/t/<slug>/join` — будет 404, это норма (страницу делаем в Task 4).

**Step 3.5: Commit**

```bash
git add app/page.tsx lib/
git commit -m "feat: create trip landing page"
```

---

## Task 4: Выбор семьи и cookie-логика

**Files:**
- Create: `app/t/[slug]/join/page.tsx`, `lib/session.ts`, `lib/queries/trip.ts`

**Step 4.1: Создать `lib/session.ts` (cookie-утилиты)**

```typescript
export function setFamilyCookie(slug: string, familyId: string) {
  const maxAge = 60 * 60 * 24 * 30; // 30 дней
  document.cookie = `trip_${slug}_family=${familyId}; max-age=${maxAge}; path=/; samesite=lax`;
}

export function getFamilyCookie(slug: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )trip_${slug}_family=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearFamilyCookie(slug: string) {
  document.cookie = `trip_${slug}_family=; max-age=0; path=/`;
}
```

**Step 4.2: Создать `lib/queries/trip.ts`**

```typescript
import { supabase } from '@/lib/supabase/client';
import type { Trip, Family } from '@/lib/db/types';

export async function fetchTripBySlug(slug: string): Promise<{ trip: Trip; families: Family[] } | null> {
  const { data: trip } = await supabase.from('trips').select('*').eq('slug', slug).single();
  if (!trip) return null;
  const { data: families } = await supabase
    .from('families')
    .select('*')
    .eq('trip_id', trip.id)
    .order('position');
  return { trip, families: families ?? [] };
}
```

**Step 4.3: Создать `app/t/[slug]/join/page.tsx`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { setFamilyCookie } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function JoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
  });

  if (isLoading) return <main className="p-4">Загрузка…</main>;
  if (!data) return <main className="p-4">Поездка не найдена</main>;

  const { trip, families } = data;

  const choose = (familyId: string) => {
    setFamilyCookie(slug, familyId);
    router.push(`/t/${slug}`);
  };

  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <h1 className="text-2xl font-bold mb-1">{trip.name}</h1>
      <p className="text-slate-600 mb-6">Выбери свою семью</p>

      <div className="grid gap-3">
        {families.map(f => (
          <Card key={f.id} className="p-0 overflow-hidden">
            <Button
              variant="ghost"
              className="w-full h-16 justify-start text-base px-4"
              onClick={() => choose(f.id)}
            >
              <span
                className="h-6 w-6 rounded-full mr-3 shrink-0"
                style={{ background: f.color }}
              />
              {f.name}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

**Step 4.4: Verify**

Открыть редирект-URL из предыдущей таски (`/t/<slug>/join`) → видны 4 семьи → клик → редирект на `/t/<slug>` (будет 404). В DevTools → Application → Cookies проверить, что `trip_<slug>_family` записан.

**Step 4.5: Commit**

```bash
git add app/t/ lib/session.ts lib/queries/
git commit -m "feat: family selection with cookie persistence"
```

---

## Task 5: Главный экран — каркас с табами

**Files:**
- Create: `app/t/[slug]/page.tsx`, `app/t/[slug]/layout.tsx`, `lib/session-client.ts`, `components/family-badge.tsx`

**Step 5.1: Создать `lib/session-client.ts` (хук для текущей семьи)**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFamilyCookie } from '@/lib/session';

export function useCurrentFamily(slug: string): string | null | 'loading' {
  const router = useRouter();
  const [familyId, setFamilyId] = useState<string | null | 'loading'>('loading');

  useEffect(() => {
    const id = getFamilyCookie(slug);
    if (!id) router.replace(`/t/${slug}/join`);
    else setFamilyId(id);
  }, [slug, router]);

  return familyId;
}
```

**Step 5.2: Создать `components/family-badge.tsx`**

```tsx
import type { Family } from '@/lib/db/types';

export function FamilyBadge({ family, size = 24 }: { family: Family; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold text-xs shrink-0"
      style={{ background: family.color, width: size, height: size }}
      title={family.name}
    >
      {family.name.slice(0, 2)}
    </div>
  );
}
```

**Step 5.3: Создать `app/t/[slug]/layout.tsx`**

```tsx
export default function TripLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen pb-16">{children}</div>;
}
```

**Step 5.4: Создать `app/t/[slug]/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { useCurrentFamily } from '@/lib/session-client';
import { FamilyBadge } from '@/components/family-badge';
import Link from 'next/link';

export default function TripPage() {
  const { slug } = useParams<{ slug: string }>();
  const familyId = useCurrentFamily(slug);
  const [tab, setTab] = useState<'common' | 'personal' | 'food'>('common');

  const { data } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
    enabled: familyId !== 'loading',
  });

  if (familyId === 'loading' || !data) return <main className="p-4">Загрузка…</main>;

  const myFamily = data.families.find(f => f.id === familyId);

  return (
    <main className="mx-auto max-w-md">
      <header className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">{data.trip.name}</h1>
          {myFamily && (
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-0.5">
              <FamilyBadge family={myFamily} size={18} />
              <span>{myFamily.name}</span>
            </div>
          )}
        </div>
        <Link href={`/t/${slug}/settings`} className="text-slate-500 hover:text-slate-900">⚙️</Link>
      </header>

      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full rounded-none border-b sticky top-[73px] z-10 bg-white">
          <TabsTrigger value="common">Общее</TabsTrigger>
          <TabsTrigger value="personal">Личное</TabsTrigger>
          <TabsTrigger value="food">Продукты</TabsTrigger>
        </TabsList>

        <TabsContent value="common" className="p-4">
          <p className="text-slate-500">Общий список — будет в Task 6</p>
        </TabsContent>
        <TabsContent value="personal" className="p-4">
          <p className="text-slate-500">Личный список — будет в Task 9</p>
        </TabsContent>
        <TabsContent value="food" className="p-4">
          <p className="text-slate-500">Продукты — будет в Task 10</p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
```

**Step 5.5: Verify**

Открыть `/t/<slug>` после выбора семьи → видно название поездки, бейдж семьи в шапке, три таба переключаются. Без cookie — редиректит на `/join`.

**Step 5.6: Commit**

```bash
git add app/t/ lib/session-client.ts components/family-badge.tsx
git commit -m "feat: trip main screen with tab navigation"
```

---

## Task 6: Общий список — отображение и добавление

**Files:**
- Create: `lib/queries/items.ts`, `components/items/items-list.tsx`, `components/items/add-item-form.tsx`
- Modify: `app/t/[slug]/page.tsx`

**Step 6.1: Создать `lib/queries/items.ts`**

```typescript
import { supabase } from '@/lib/supabase/client';
import type { Item, ItemClaim, ListType, Category } from '@/lib/db/types';

export async function fetchItems(tripId: string, listType: ListType): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId)
    .eq('list_type', listType)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchClaims(tripId: string): Promise<ItemClaim[]> {
  const { data, error } = await supabase
    .from('item_claims')
    .select('item_claims.*, items!inner(trip_id)')
    .eq('items.trip_id', tripId);
  if (error) {
    // Fallback простой вариант — все claims без фильтра по trip
    const { data: all } = await supabase.from('item_claims').select('*');
    return all ?? [];
  }
  return (data as unknown as ItemClaim[]) ?? [];
}

export async function insertItem(payload: {
  trip_id: string;
  list_type: ListType;
  title: string;
  qty?: string | null;
  category?: Category | null;
  family_id?: string | null;
  created_by_family_id: string;
}): Promise<Item> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      qty: null,
      category: null,
      family_id: null,
      notes: null,
      is_done: false,
      ...payload,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function toggleClaim(itemId: string, familyId: string, claimed: boolean): Promise<void> {
  if (claimed) {
    await supabase.from('item_claims').insert({ item_id: itemId, family_id: familyId });
  } else {
    await supabase.from('item_claims').delete().eq('item_id', itemId).eq('family_id', familyId);
  }
}
```

**Step 6.2: Создать `components/items/add-item-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AddItemForm({ onAdd, placeholder = 'Например: Мангал' }: {
  onAdd: (title: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    await onAdd(t);
    setValue('');
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="flex gap-2 mb-3">
      <Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} disabled={busy} />
      <Button type="submit" disabled={busy || !value.trim()}>+</Button>
    </form>
  );
}
```

**Step 6.3: Создать `components/items/items-list.tsx`**

```tsx
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FamilyBadge } from '@/components/family-badge';
import { fetchItems, fetchClaims, insertItem, deleteItem, toggleClaim } from '@/lib/queries/items';
import type { Family, Item, ItemClaim, ListType } from '@/lib/db/types';
import { AddItemForm } from './add-item-form';

export function ItemsList({
  tripId,
  listType,
  families,
  currentFamilyId,
}: {
  tripId: string;
  listType: ListType;
  families: Family[];
  currentFamilyId: string;
}) {
  const qc = useQueryClient();
  const itemsKey = ['items', tripId, listType];
  const claimsKey = ['claims', tripId];

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: () => fetchItems(tripId, listType),
  });
  const { data: claims = [] } = useQuery({
    queryKey: claimsKey,
    queryFn: () => fetchClaims(tripId),
  });

  const addMut = useMutation({
    mutationFn: (title: string) =>
      insertItem({
        trip_id: tripId,
        list_type: listType,
        title,
        created_by_family_id: currentFamilyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });

  const claimMut = useMutation({
    mutationFn: ({ id, claimed }: { id: string; claimed: boolean }) =>
      toggleClaim(id, currentFamilyId, claimed),
    onSuccess: () => qc.invalidateQueries({ queryKey: claimsKey }),
  });

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
  const famById = new Map(families.map(f => [f.id, f] as const));

  return (
    <div>
      <AddItemForm onAdd={t => addMut.mutateAsync(t)} />

      {items.length === 0 && <p className="text-slate-500 text-sm">Пока пусто. Добавь первый пункт.</p>}

      <div className="space-y-2">
        {items.map(item => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;

          return (
            <Card key={item.id} className={`p-3 ${noOne ? 'border-red-300' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  {noOne ? (
                    <p className="text-xs text-red-600 mt-0.5">никто не берёт</p>
                  ) : (
                    <div className="flex gap-1 mt-1.5">
                      {itemClaims.map(c => {
                        const f = famById.get(c.family_id);
                        return f ? <FamilyBadge key={c.id} family={f} size={20} /> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={iTake ? 'secondary' : 'default'}
                    onClick={() => claimMut.mutate({ id: item.id, claimed: !iTake })}
                  >
                    {iTake ? 'Я не беру' : 'Беру я'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>🗑</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 6.4: Подключить в `app/t/[slug]/page.tsx`**

Заменить заглушку в табе `common`:

```tsx
<TabsContent value="common" className="p-4">
  <ItemsList tripId={data.trip.id} listType="common" families={data.families} currentFamilyId={familyId as string} />
</TabsContent>
```

Не забудь импорт: `import { ItemsList } from '@/components/items/items-list';`

**Step 6.5: Verify**

Открыть приложение → таб "Общее" → добавить "Мангал" → появляется карточка с красной рамкой "никто не берёт" → клик "Беру я" → появляется цветной бейдж семьи → клик "Я не беру" → бейдж исчезает → клик 🗑 → пункт удаляется.

**Step 6.6: Commit**

```bash
git add app/t/[slug]/page.tsx lib/queries/items.ts components/items/
git commit -m "feat: common list with claims"
```

---

## Task 7: Детектор дублей в общем списке

**Files:**
- Create: `lib/duplicate.ts`, `components/items/duplicate-dialog.tsx`
- Modify: `components/items/items-list.tsx`

**Step 7.1: Создать `lib/duplicate.ts`**

```typescript
import levenshtein from 'fast-levenshtein';

export function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function findDuplicate(titles: { id: string; title: string }[], newTitle: string): { id: string; title: string } | null {
  const norm = normalizeTitle(newTitle);
  if (!norm) return null;
  for (const t of titles) {
    const tn = normalizeTitle(t.title);
    if (tn === norm) return t;
    if (tn.length >= 4 && norm.length >= 4 && (tn.includes(norm) || norm.includes(tn))) return t;
    const dist = levenshtein.get(tn, norm);
    if (dist <= 2 && Math.max(tn.length, norm.length) >= 4) return t;
  }
  return null;
}
```

**Step 7.2: Минимальный тест для duplicate-логики (нетривиальная, оправдан)**

Установить vitest, если ещё не:

```bash
npm install -D vitest
```

Добавить в `package.json` скрипт `"test": "vitest run"`.

Создать `lib/duplicate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findDuplicate } from './duplicate';

describe('findDuplicate', () => {
  const existing = [
    { id: '1', title: 'Мангал' },
    { id: '2', title: 'Спальник' },
  ];

  it('matches exact (case-insensitive)', () => {
    expect(findDuplicate(existing, 'мангал')?.id).toBe('1');
  });

  it('matches with typo', () => {
    expect(findDuplicate(existing, 'Магнал')?.id).toBe('1'); // levenshtein 2
  });

  it('matches substring', () => {
    expect(findDuplicate(existing, 'Большой мангал')?.id).toBe('1');
  });

  it('returns null for unrelated', () => {
    expect(findDuplicate(existing, 'Топор')).toBeNull();
  });

  it('ignores too short tokens', () => {
    expect(findDuplicate([{ id: 'a', title: 'Кот' }], 'Сок')).toBeNull();
  });
});
```

Run:
```bash
npm test
```
Expected: 5 passing.

**Step 7.3: Создать `components/items/duplicate-dialog.tsx`**

```tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DuplicateDialog({
  open,
  existingTitle,
  newTitle,
  onMerge,
  onKeepBoth,
  onCancel,
}: {
  open: boolean;
  existingTitle: string;
  newTitle: string;
  onMerge: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Похожий пункт уже есть</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Ты добавляешь <b>«{newTitle}»</b>, но в списке уже есть <b>«{existingTitle}»</b>.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
          <Button variant="secondary" onClick={onKeepBoth}>Это другое</Button>
          <Button onClick={onMerge}>Беру существующий</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 7.4: Интегрировать в `items-list.tsx`**

Заменить логику в обработчике AddItemForm. Полный обновлённый верх компонента:

```tsx
// добавить импорт:
import { findDuplicate } from '@/lib/duplicate';
import { DuplicateDialog } from './duplicate-dialog';
import { useState } from 'react';

// внутри ItemsList — добавить state:
const [dupState, setDupState] = useState<{ existing: Item; newTitle: string } | null>(null);

// заменить handler у формы:
const handleAdd = async (title: string) => {
  const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), title);
  if (dup) {
    const existing = items.find(i => i.id === dup.id);
    if (existing) {
      setDupState({ existing, newTitle: title });
      return;
    }
  }
  await addMut.mutateAsync(title);
};

const handleMerge = async () => {
  if (!dupState) return;
  await toggleClaim(dupState.existing.id, currentFamilyId, true);
  qc.invalidateQueries({ queryKey: claimsKey });
  setDupState(null);
};

const handleKeepBoth = async () => {
  if (!dupState) return;
  await addMut.mutateAsync(dupState.newTitle);
  setDupState(null);
};
```

И в JSX:

```tsx
<AddItemForm onAdd={handleAdd} />
{/* ... остальной список ... */}
{dupState && (
  <DuplicateDialog
    open={!!dupState}
    existingTitle={dupState.existing.title}
    newTitle={dupState.newTitle}
    onMerge={handleMerge}
    onKeepBoth={handleKeepBoth}
    onCancel={() => setDupState(null)}
  />
)}
```

Импортнуть `toggleClaim` из `@/lib/queries/items`.

**Step 7.5: Verify**

В общем списке: добавить "Мангал" → ещё раз "мангал" → должен открыться диалог. Кнопка "Беру существующий" — добавляет current семью в claims, новый пункт не создаётся. "Это другое" — добавляет как отдельный пункт.

**Step 7.6: Commit**

```bash
git add lib/duplicate.ts lib/duplicate.test.ts components/items/duplicate-dialog.tsx components/items/items-list.tsx package.json
git commit -m "feat: duplicate detection with merge dialog"
```

---

## Task 8: Realtime синхронизация

**Files:**
- Create: `lib/realtime.ts`
- Modify: `app/t/[slug]/page.tsx`

**Step 8.1: Создать `lib/realtime.ts`**

```typescript
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export function useTripRealtime(tripId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `trip_id=eq.${tripId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['items', tripId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_claims' },
        () => {
          qc.invalidateQueries({ queryKey: ['claims', tripId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'families', filter: `trip_id=eq.${tripId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['trip'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, qc]);
}
```

Note про invalidate: ключ `['items', tripId]` префиксный — затронет `['items', tripId, 'common']`, `['items', tripId, 'personal']`, `['items', tripId, 'food']`.

**Step 8.2: Подключить в `app/t/[slug]/page.tsx`**

В компоненте `TripPage` после получения `data`:

```tsx
useTripRealtime(data.trip.id);
```

(импорт сверху). Hooks должны быть до раннего return — переместить так, чтобы `data?.trip.id` использовалось:

```tsx
const tripId = data?.trip.id ?? '';
useTripRealtime(tripId);
```

**Step 8.3: Verify**

Открыть приложение в двух браузерах (один обычный, второй инкогнито), оба под разными семьями. Добавь пункт в одном — должен появиться во втором через ~1 секунду без обновления. Тоже самое для "Беру я".

**Step 8.4: Commit**

```bash
git add lib/realtime.ts app/t/[slug]/page.tsx
git commit -m "feat: realtime sync for items and claims"
```

---

## Task 9: Личный список (по семьям)

**Files:**
- Create: `components/items/personal-list.tsx`
- Modify: `app/t/[slug]/page.tsx`, `lib/queries/items.ts`

**Step 9.1: Добавить в `lib/queries/items.ts`**

```typescript
export async function fetchPersonalItems(tripId: string, familyId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId)
    .eq('list_type', 'personal')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function togglePersonalDone(itemId: string, done: boolean): Promise<void> {
  await supabase.from('items').update({ is_done: done }).eq('id', itemId);
}
```

**Step 9.2: Создать `components/items/personal-list.tsx`**

```tsx
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AddItemForm } from './add-item-form';
import {
  fetchPersonalItems,
  insertItem,
  deleteItem,
  togglePersonalDone,
} from '@/lib/queries/items';

export function PersonalList({
  tripId,
  familyId,
  familyName,
}: {
  tripId: string;
  familyId: string;
  familyName: string;
}) {
  const qc = useQueryClient();
  const key = ['items', tripId, 'personal', familyId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => fetchPersonalItems(tripId, familyId),
  });

  const addMut = useMutation({
    mutationFn: (title: string) =>
      insertItem({
        trip_id: tripId,
        list_type: 'personal',
        title,
        family_id: familyId,
        created_by_family_id: familyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const doneMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => togglePersonalDone(id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const done = items.filter(i => i.is_done).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      <p className="text-sm text-slate-600 mb-1">Список семьи {familyName}</p>
      {total > 0 && (
        <div className="mb-3">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-slate-500 mt-1">{done} из {total} упаковано</p>
        </div>
      )}

      <AddItemForm onAdd={t => addMut.mutateAsync(t)} placeholder="Например: Тёплые носки" />

      {items.length === 0 && <p className="text-slate-500 text-sm">Пока пусто.</p>}

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={item.is_done}
                onCheckedChange={v => doneMut.mutate({ id: item.id, done: !!v })}
              />
              <p className={`flex-1 ${item.is_done ? 'line-through text-slate-400' : ''}`}>
                {item.title}
              </p>
              <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>🗑</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 9.3: Подключить в `app/t/[slug]/page.tsx`**

В табе `personal`:

```tsx
<TabsContent value="personal" className="p-4">
  {myFamily && (
    <PersonalList tripId={data.trip.id} familyId={myFamily.id} familyName={myFamily.name} />
  )}
</TabsContent>
```

**Step 9.4: Verify**

Открыть таб "Личное" → виден заголовок с именем семьи → добавить пункты → отметить чекбоксом → прогресс-бар двигается → удалить пункт. Зайти под другой семьёй (cookie сменить вручную в DevTools или открыть другой браузер) → виден совершенно другой список.

**Step 9.5: Commit**

```bash
git add lib/queries/items.ts components/items/personal-list.tsx app/t/[slug]/page.tsx
git commit -m "feat: personal list per family"
```

---

## Task 10: Список продуктов с категориями

**Files:**
- Create: `components/items/food-list.tsx`
- Modify: `app/t/[slug]/page.tsx`

**Step 10.1: Создать `components/items/food-list.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FamilyBadge } from '@/components/family-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchItems,
  fetchClaims,
  insertItem,
  deleteItem,
  toggleClaim,
} from '@/lib/queries/items';
import { findDuplicate } from '@/lib/duplicate';
import { DuplicateDialog } from './duplicate-dialog';
import type { Family, Item, ItemClaim, Category } from '@/lib/db/types';

const CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'meat', label: 'Мясо' },
  { value: 'veg', label: 'Овощи' },
  { value: 'drinks', label: 'Напитки' },
  { value: 'snacks', label: 'Перекус' },
  { value: 'other', label: 'Прочее' },
];

export function FoodList({
  tripId,
  families,
  currentFamilyId,
}: {
  tripId: string;
  families: Family[];
  currentFamilyId: string;
}) {
  const qc = useQueryClient();
  const itemsKey = ['items', tripId, 'food'];
  const claimsKey = ['claims', tripId];

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [category, setCategory] = useState<Category>('meat');
  const [dupState, setDupState] = useState<{ existing: Item; newTitle: string; newQty: string; newCat: Category } | null>(null);

  const { data: items = [] } = useQuery({ queryKey: itemsKey, queryFn: () => fetchItems(tripId, 'food') });
  const { data: claims = [] } = useQuery({ queryKey: claimsKey, queryFn: () => fetchClaims(tripId) });

  const addMut = useMutation({
    mutationFn: (p: { title: string; qty: string; category: Category }) =>
      insertItem({
        trip_id: tripId,
        list_type: 'food',
        title: p.title,
        qty: p.qty || null,
        category: p.category,
        created_by_family_id: currentFamilyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });
  const claimMut = useMutation({
    mutationFn: ({ id, claimed }: { id: string; claimed: boolean }) =>
      toggleClaim(id, currentFamilyId, claimed),
    onSuccess: () => qc.invalidateQueries({ queryKey: claimsKey }),
  });

  const handleAdd = async () => {
    const t = title.trim();
    if (!t) return;
    const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), t);
    if (dup) {
      const existing = items.find(i => i.id === dup.id);
      if (existing) {
        setDupState({ existing, newTitle: t, newQty: qty, newCat: category });
        return;
      }
    }
    await addMut.mutateAsync({ title: t, qty, category });
    setTitle(''); setQty('');
  };

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
  const famById = new Map(families.map(f => [f.id, f] as const));
  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);

  return (
    <div>
      <Tabs value={filter} onValueChange={v => setFilter(v as Category | 'all')} className="mb-3">
        <TabsList className="flex w-full overflow-x-auto">
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.value} value={c.value} className="text-xs">{c.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="p-3 mb-3 space-y-2">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Мясо" />
        <div className="flex gap-2">
          <Input value={qty} onChange={e => setQty(e.target.value)} placeholder="5 кг" className="flex-1" />
          <select
            className="border rounded-md px-2 text-sm"
            value={category}
            onChange={e => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.filter(c => c.value !== 'all').map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <Button onClick={handleAdd}>+</Button>
        </div>
      </Card>

      {filtered.length === 0 && <p className="text-slate-500 text-sm">Пока пусто в этой категории.</p>}

      <div className="space-y-2">
        {filtered.map(item => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;
          return (
            <Card key={item.id} className={`p-3 ${noOne ? 'border-red-300' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.title}
                    {item.qty && <span className="text-slate-500 font-normal"> · {item.qty}</span>}
                  </p>
                  {noOne ? (
                    <p className="text-xs text-red-600 mt-0.5">никто не берёт</p>
                  ) : (
                    <div className="flex gap-1 mt-1.5">
                      {itemClaims.map(c => {
                        const f = famById.get(c.family_id);
                        return f ? <FamilyBadge key={c.id} family={f} size={20} /> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={iTake ? 'secondary' : 'default'}
                    onClick={() => claimMut.mutate({ id: item.id, claimed: !iTake })}
                  >
                    {iTake ? 'Я не беру' : 'Беру я'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>🗑</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {dupState && (
        <DuplicateDialog
          open={!!dupState}
          existingTitle={dupState.existing.title}
          newTitle={dupState.newTitle}
          onMerge={async () => {
            await toggleClaim(dupState.existing.id, currentFamilyId, true);
            qc.invalidateQueries({ queryKey: claimsKey });
            setDupState(null);
            setTitle(''); setQty('');
          }}
          onKeepBoth={async () => {
            await addMut.mutateAsync({ title: dupState.newTitle, qty: dupState.newQty, category: dupState.newCat });
            setDupState(null);
            setTitle(''); setQty('');
          }}
          onCancel={() => setDupState(null)}
        />
      )}
    </div>
  );
}
```

**Step 10.2: Подключить в `app/t/[slug]/page.tsx`**

```tsx
<TabsContent value="food" className="p-4">
  <FoodList tripId={data.trip.id} families={data.families} currentFamilyId={familyId as string} />
</TabsContent>
```

**Step 10.3: Verify**

Таб "Продукты" → добавить "Мясо, 5 кг, мясо" → появилось. Переключить категорию на "Овощи" — список пуст. На "Все" — снова видно. Клик "Беру я" работает.

**Step 10.4: Commit**

```bash
git add components/items/food-list.tsx app/t/[slug]/page.tsx
git commit -m "feat: food list with categories"
```

---

## Task 11: Settings — редактирование, ссылка для друзей, AI export/import

**Files:**
- Create: `app/t/[slug]/settings/page.tsx`, `lib/ai-format.ts`, `components/settings/ai-block.tsx`

**Step 11.1: Создать `lib/ai-format.ts`**

```typescript
import type { Trip, Family, Item, ItemClaim, Category, ListType } from '@/lib/db/types';

export type AISuggestion = {
  list: ListType;
  title: string;
  qty?: string;
  category?: Category;
  reason?: string;
};

export type AIExport = {
  trip: { name: string; starts_on: string | null; ends_on: string | null };
  families: string[];
  common: { title: string; claimed_by: string[] }[];
  personal: Record<string, string[]>; // family name -> titles
  food: { title: string; qty: string | null; category: string | null; claimed_by: string[] }[];
  suggestions?: AISuggestion[];
};

export function buildExport(
  trip: Trip,
  families: Family[],
  items: Item[],
  claims: ItemClaim[]
): AIExport {
  const famName = new Map(families.map(f => [f.id, f.name]));
  const claimNames = (itemId: string) =>
    claims.filter(c => c.item_id === itemId).map(c => famName.get(c.family_id) ?? '?');

  const common = items
    .filter(i => i.list_type === 'common')
    .map(i => ({ title: i.title, claimed_by: claimNames(i.id) }));

  const food = items
    .filter(i => i.list_type === 'food')
    .map(i => ({ title: i.title, qty: i.qty, category: i.category, claimed_by: claimNames(i.id) }));

  const personal: Record<string, string[]> = {};
  for (const f of families) {
    personal[f.name] = items
      .filter(i => i.list_type === 'personal' && i.family_id === f.id)
      .map(i => i.title);
  }

  return {
    trip: { name: trip.name, starts_on: trip.starts_on, ends_on: trip.ends_on },
    families: families.map(f => f.name),
    common,
    personal,
    food,
  };
}

export function parseSuggestions(json: string): AISuggestion[] {
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed?.suggestions)) return parsed.suggestions;
  if (Array.isArray(parsed)) return parsed;
  throw new Error('JSON должен содержать поле suggestions или быть массивом');
}
```

**Step 11.2: Создать `components/settings/ai-block.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { AIExport, AISuggestion } from '@/lib/ai-format';

export function AIBlock({
  exportData,
  onImport,
}: {
  exportData: AIExport;
  onImport: (s: AISuggestion[]) => Promise<void>;
}) {
  const [importText, setImportText] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const copyExport = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    alert('Скопировано! Скинь Claude вместе с вопросом "что ещё взять?".');
  };

  const parseInput = () => {
    setError(null); setDone(false);
    try {
      const parsed = JSON.parse(importText);
      const list: AISuggestion[] = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : Array.isArray(parsed)
        ? parsed
        : [];
      if (list.length === 0) throw new Error('Не нашёл suggestions');
      setSuggestions(list);
      setSelected(new Set(list.map((_, i) => i)));
    } catch (e: any) {
      setError(e.message ?? 'Не удалось распарсить JSON');
    }
  };

  const apply = async () => {
    const chosen = suggestions.filter((_, i) => selected.has(i));
    await onImport(chosen);
    setDone(true);
    setSuggestions([]);
    setImportText('');
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold mb-1">🤖 AI-помощник</h3>
        <p className="text-sm text-slate-600">Экспортни состояние, отдай Claude, вставь обратно его предложения.</p>
      </div>

      <Button variant="secondary" onClick={copyExport}>Экспорт состояния в буфер</Button>

      <div>
        <p className="text-sm font-medium mb-1">Импорт предложений:</p>
        <textarea
          className="w-full border rounded-md p-2 text-xs font-mono h-32"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='{"suggestions": [{"list": "common", "title": "Тент"}]}'
        />
        <Button variant="secondary" className="mt-2" onClick={parseInput}>Распарсить</Button>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {done && <p className="text-sm text-green-600 mt-2">Добавлено!</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Выбери, что добавить:</p>
          {suggestions.map((s, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} />
              <span>
                <b>[{s.list}]</b> {s.title}
                {s.qty && ` (${s.qty})`}
                {s.category && ` · ${s.category}`}
                {s.reason && <span className="text-slate-500"> — {s.reason}</span>}
              </span>
            </label>
          ))}
          <Button onClick={apply}>Добавить {selected.size} пунктов</Button>
        </div>
      )}
    </Card>
  );
}
```

**Step 11.3: Создать `app/t/[slug]/settings/page.tsx`**

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { fetchItems, fetchClaims, insertItem } from '@/lib/queries/items';
import { useCurrentFamily } from '@/lib/session-client';
import { clearFamilyCookie } from '@/lib/session';
import { AIBlock } from '@/components/settings/ai-block';
import { buildExport, type AISuggestion } from '@/lib/ai-format';
import { useState } from 'react';

export default function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const familyId = useCurrentFamily(slug);

  const { data: tripData } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
    enabled: familyId !== 'loading',
  });
  const { data: common = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'common'],
    queryFn: () => fetchItems(tripData!.trip.id, 'common'),
    enabled: !!tripData,
  });
  const { data: personal = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'personal'],
    queryFn: () => fetchItems(tripData!.trip.id, 'personal'),
    enabled: !!tripData,
  });
  const { data: food = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'food'],
    queryFn: () => fetchItems(tripData!.trip.id, 'food'),
    enabled: !!tripData,
  });
  const { data: claims = [] } = useQuery({
    queryKey: ['claims', tripData?.trip.id],
    queryFn: () => fetchClaims(tripData!.trip.id),
    enabled: !!tripData,
  });

  const [copied, setCopied] = useState(false);

  if (!tripData) return <main className="p-4">Загрузка…</main>;
  const { trip, families } = tripData;
  const allItems = [...common, ...personal, ...food];
  const exportData = buildExport(trip, families, allItems, claims);
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${slug}` : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const switchFamily = () => {
    clearFamilyCookie(slug);
    router.push(`/t/${slug}/join`);
  };

  const importSuggestions = async (sugs: AISuggestion[]) => {
    const myId = familyId as string;
    const payload = sugs.map(s => ({
      trip_id: trip.id,
      list_type: s.list,
      title: s.title,
      qty: s.qty ?? null,
      category: s.list === 'food' ? (s.category ?? 'other') : null,
      family_id: s.list === 'personal' ? myId : null,
      created_by_family_id: myId,
      notes: null,
      is_done: false,
    }));
    await supabase.from('items').insert(payload);
    qc.invalidateQueries({ queryKey: ['items'] });
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center gap-2">
        <button onClick={() => router.push(`/t/${slug}`)} className="text-slate-600">← Назад</button>
        <h1 className="text-xl font-bold">Настройки</h1>
      </header>

      <Card className="p-4">
        <Label>Название поездки</Label>
        <p className="font-medium">{trip.name}</p>
        <p className="text-sm text-slate-500 mt-1">
          {trip.starts_on || '?'} — {trip.ends_on || '?'}
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <Label>Ссылка для друзей</Label>
        <div className="flex gap-2">
          <Input value={inviteUrl} readOnly />
          <Button onClick={copyLink}>{copied ? '✓' : 'Копировать'}</Button>
        </div>
        <p className="text-xs text-slate-500">Друзья откроют ссылку, выберут свою семью.</p>
      </Card>

      <Card className="p-4">
        <Label>Семьи</Label>
        <div className="space-y-2 mt-2">
          {families.map(f => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full shrink-0" style={{ background: f.color }} />
              <span className="flex-1">{f.name}</span>
              {f.id === familyId && <span className="text-xs text-slate-500">это ты</span>}
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-3" onClick={switchFamily}>Сменить мою семью</Button>
      </Card>

      <AIBlock exportData={exportData} onImport={importSuggestions} />
    </main>
  );
}
```

**Step 11.4: Verify**

Открыть `/t/<slug>/settings` → ссылка копируется → кнопка "Сменить семью" возвращает на `/join` → AI блок: "Экспорт" копирует JSON в буфер. Вставить вручную в textarea простой JSON `{"suggestions":[{"list":"common","title":"Тент"}]}` → "Распарсить" → "Добавить" → пункт появляется в общем списке.

**Step 11.5: Commit**

```bash
git add app/t/[slug]/settings/ lib/ai-format.ts components/settings/
git commit -m "feat: settings page with invite link and AI export/import"
```

---

## Task 12: Сводка по продуктам и финальный полиш

**Files:**
- Modify: `components/items/food-list.tsx`, `app/globals.css`, `app/page.tsx`

**Step 12.1: Добавить сводку в `FoodList`**

После категорий и перед списком, посчитать сводку:

```tsx
const summary = (() => {
  const cats: Record<string, { total: number; claimed: number }> = {};
  for (const i of items) {
    const c = i.category ?? 'other';
    cats[c] ||= { total: 0, claimed: 0 };
    cats[c].total++;
    if ((claimsByItem.get(i.id) ?? []).length > 0) cats[c].claimed++;
  }
  return cats;
})();

const unclaimed = items.filter(i => (claimsByItem.get(i.id) ?? []).length === 0).length;
```

И отобразить (например, перед списком):

```tsx
{items.length > 0 && (
  <div className="mb-3 p-3 bg-slate-100 rounded-md text-sm">
    <p>Всего пунктов: <b>{items.length}</b>, без хозяина: <b className={unclaimed > 0 ? 'text-red-600' : ''}>{unclaimed}</b></p>
  </div>
)}
```

**Step 12.2: Стилистический полиш**

В `app/globals.css` добавить плавные тапы и safe-area для iOS:

```css
body { -webkit-tap-highlight-color: transparent; }
button, [role="button"] { user-select: none; }
main { padding-bottom: env(safe-area-inset-bottom); }
```

**Step 12.3: Добавить linkback на главной для тех, кто уже создал поездки**

В `app/page.tsx` под заголовком добавить:

```tsx
<p className="text-xs text-slate-500 mb-4">
  Уже есть поездка? Открой ссылку, которую дал тебе организатор.
</p>
```

**Step 12.4: Verify**

Открыть все три таба на телефоне (или mobile-режиме DevTools) → визуально норм, кнопки не выглядят сжатыми, шапка не наезжает.

**Step 12.5: Commit**

```bash
git add components/items/food-list.tsx app/globals.css app/page.tsx
git commit -m "feat: food summary and mobile polish"
```

---

## Task 13: Деплой на Vercel

**Step 13.1: Создать репозиторий на GitHub**

```bash
gh repo create camping-app --private --source=. --remote=origin
git push -u origin main
```

(если нет `gh` — создать руками на github.com и `git remote add origin` + push)

**Step 13.2: Подключить к Vercel**

1. vercel.com → New Project → выбрать репо
2. Environment Variables → добавить `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

**Step 13.3: Verify в проде**

1. Открыть vercel URL → создать тестовую поездку → проверить весь flow
2. Открыть в инкогнито под другой семьёй → realtime работает
3. Settings → копирование ссылки → открыть на телефоне → выбрать семью → добавить пункт
4. Скопировать JSON экспорта → проверить структуру

**Step 13.4: Шарить ссылку друзьям**

Создать боевую поездку, разослать `https://camping-app.vercel.app/t/<slug>` в общий чат.

**Step 13.5: Commit финальной правки если нужно**

```bash
git add -A
git commit -m "chore: deploy config"
git push
```

---

## Анти-чек-лист (что мы НЕ делали)

- ❌ Регистрация и пароли
- ❌ Push-уведомления
- ❌ Загрузка фото
- ❌ Drag-and-drop сортировка
- ❌ Внутренний чат
- ❌ История изменений / undo
- ❌ Тёмная тема
- ❌ PWA / offline
- ❌ i18n
- ❌ Автотесты (кроме duplicate detection — он нетривиальный)

---

## Follow-up идеи (не входит в MVP)

- Подсветка "новое с моего последнего захода"
- Возможность добавить участникам аватары/инициалы
- Лёгкий read-only режим для тех, кто без cookie (просмотр без участия)
- Кнопка "Сбросить трип" в settings (удаляет всё, оставляет каркас)
