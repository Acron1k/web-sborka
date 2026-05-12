# AI Suggestions Tab — Design Document

**Date:** 2026-05-12
**Status:** Approved
**Context:** Отдельный 4-й таб для AI-предложений вместо прямой вставки в основные списки. Импортированные предложения хранятся как отдельная сущность с уровнями важности.

---

## Цель

Когда я (Claude) предлагаю что взять — эти пункты не должны мусорить основной список как «пустые с никем-не-берёт». Должна быть отдельная staging-зона где они отсортированы по важности и можно cherry-pick'ом промоутить.

---

## Схема БД

```sql
create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  list_type text not null check (list_type in ('common', 'personal', 'food')),
  title text not null,
  qty text,
  category text check (category is null or category in ('meat', 'veg', 'drinks', 'snacks', 'other')),
  importance text not null check (importance in ('critical', 'recommended', 'optional')),
  reason text,
  added_to_list_at timestamptz,
  added_by_family_id uuid references families(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_ai_sug_trip on ai_suggestions(trip_id);

alter table ai_suggestions enable row level security;
create policy "anon all ai_sug" on ai_suggestions for all using (true) with check (true);
alter publication supabase_realtime add table ai_suggestions;
```

## Жизненный цикл suggestion

1. **Импорт**: пользователь экспортирует state, отдаёт Claude, получает JSON, импортирует — записи попадают в `ai_suggestions` с `added_to_list_at = null`
2. **Промоут**: любая семья кликает `+ добавить` → создаётся обычный `items` row + патчится suggestion `added_to_list_at = now(), added_by_family_id = me`
3. **Greyed out**: не удаляется, остаётся видимым с пометкой «взяли Мироновы · 2 ч. назад»
4. **Удаление**: кнопка `×` стирает suggestion полностью (для случайно не того)

## AI JSON format (обновлённый)

```json
{
  "suggestions": [
    {
      "list": "common",
      "title": "Аптечка",
      "importance": "critical",
      "reason": "8 человек × 2 ночи без неё — must"
    },
    {
      "list": "food",
      "title": "Лук репчатый",
      "qty": "2 кг",
      "category": "veg",
      "importance": "critical",
      "reason": "плов + солянка"
    }
  ]
}
```

## UX

**4-й таб** «ИИ-подсказки» рядом с Общее/Личное/Продукты.

**Структура:**
- Заголовок с сводкой `N ждут · M разобрано`
- Filter chips по importance (критично / рекомендую / по желанию)
- Sub-filter по list_type (всё / общее / личное / продукты)
- Список карточек

**Карточка:**
- Цветная точка importance (destructive / primary / muted)
- Title + mono-tag `[список]`
- Подпись reason курсивом
- Кнопка `+ добавить` (popover с family-picker для common/food, сразу к моей семье для personal)
- Кнопка `×` (удалить навсегда)

**Greyed-out карточка** (added_to_list_at != null):
- opacity-50, line-through на title
- Метка «взяли {family} · {time ago}»
- Кнопка `×` доступна

**Промпт-шаблон рядом с экспортом** — копируется одним кликом вместе с JSON.

## Файлы

- `lib/db/types.ts` — добавить тип `AISuggestion` и обновить `Database`
- `lib/queries/ai-suggestions.ts` — новый: fetchSuggestions, bulkInsertSuggestions, promoteSuggestion, deleteSuggestion
- `lib/ai-format.ts` — обновить тип AISuggestion (importance обязательное, reason опционально)
- `components/items/suggestions-list.tsx` — новый главный компонент таба
- `components/items/suggestion-row.tsx` — новый одна карточка
- `components/settings/ai-block.tsx` — импорт пишет в ai_suggestions вместо items
- `app/t/[slug]/page.tsx` — добавить TAB id='ai', рендер SuggestionsList
- `lib/realtime.ts` — подписка на ai_suggestions

## Realtime

Новая подписка на `ai_suggestions`, invalidate `['suggestions', tripId]`. Также при `promoteSuggestion` нужна одновременная инвалидация `['items', tripId]` чтобы новый item появился в основных списках realtime.

## YAGNI

- Сортировка по разным полям (только дефолт: importance desc, created_at asc)
- Поиск по тексту
- Bulk select + add all
- Категории-теги (safety/weather)
