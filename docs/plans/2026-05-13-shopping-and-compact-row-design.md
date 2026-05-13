# Shopping Tab + Compact Mobile Row — Design Document

**Date:** 2026-05-13
**Status:** Approved
**Context:** Две связанные фичи — отдельный таб «Закупка» с флагом на пунктах + компактная одностроковая вёрстка на мобиле.

---

## Цель

1. **Закупка:** при поездке в магазин до похода удобно идти по списку расходников. Когда нажимаешь «купил» — автоматически становишься ответственным.
2. **Компактная строка:** уместить пункт в одну строку на мобиле, чтобы помещалось больше пунктов на экран. Бейджи семей, единый компактный лейбл, меню три-точки.

---

## Модель данных

Миграция (две колонки, без новых таблиц):

```sql
alter table items add column needs_purchase boolean not null default false;
alter table item_claims add column is_purchased boolean not null default false;
```

**Семантика:**
- `items.needs_purchase = true` → пункт относится к закупке. Появляется в табе «Купить»
- `item_claims.is_purchased = true` → я уже купил
- `item_claims.is_packed = true` → я уже сложил в машину (без изменений)

**Применимо только для list_type IN ('common', 'food')** — personal по смыслу не закупается командно.

## Жизненный цикл

1. Добавляешь «Уголь» в Общее с галкой «надо купить» → `needs_purchase=true` → пункт виден в табе Купить
2. В Купить нажимаешь «купил я» → если нет моего claim, создаём с `is_purchased=true`. Если был claim, просто ставим флаг
3. В Личном (packing checklist) видишь пункт в секции «Общее за нами» → ставишь `is_packed` при загрузке в машину
4. После майских — `is_purchased` и `is_packed` оба true, история сохраняется

**Дефолты при создании:**
- `common` → `needs_purchase=false`
- `food` → `needs_purchase=true`

## UX таба «Купить»

Структура:
- Заголовок «N пунктов · M куплено» + прогресс-бар
- Filter chips по статусу: всё / не куплено / куплено
- Filter chips по типу: всё / общее / еда
- Список пунктов в стиле editorial:
  - 🔴 никто не закупает (claims пустой)
  - 🟠 {семья} купит (claim есть, is_purchased=false)
  - ✅ купили {семья} (is_purchased=true, greyed-out)
- Форма добавления с дефолтом needs_purchase=true (это таб Купить!)

**Кнопка «купил я»:**
- Нет моего claim → создаём с is_purchased=true
- Есть claim, не is_purchased → ставим флаг
- Уже куплено → кнопка не показывается

## Tabs structure

5 табов: Общее / Личное / Купить / Еда / ИИ

Mobile labels: короткие (Общее / Личное / Купить / Еда / ИИ), помещаются в одну строку.

## Компактная строка на мобиле

Одна строка `flex items-center gap-3`:
- `flex-1 truncate` title
- Стек цветных кружков-claims (16px, -space-x-1, max 3 + N+ индикатор)
- Кнопка «Беру» / «Не беру» (h-7 px-3 text-xs)
- Меню `⋮` (DropdownMenu из shadcn) — ред / × (destructive)

Лейблы кнопок упрощены: **«Беру»** (когда не в claims) и **«Не беру»** (когда в claims). Без «я» и «тоже» — кружки и так показывают контекст.

**Desktop остаётся как есть** — те же элементы, но больше воздуха.

## Файлы

- `lib/db/types.ts` — `needs_purchase`, `is_purchased`
- `lib/queries/items.ts` — `insertItem` поддерживает `needs_purchase`, `updateItem` тоже. Новая `markPurchasedByCurrentFamily(itemId, familyId, purchased)` — создаёт claim если нет + ставит флаг
- `lib/queries/shopping.ts` — новый, fetchShoppingItems с агрегатами
- `components/items/item-row.tsx` — НОВЫЙ единый компонент компактной строки
- `components/items/shopping-list.tsx` — НОВЫЙ компонент таба
- `components/items/items-list.tsx` — использует ItemRow, чекбокс «надо купить» в add form
- `components/items/food-list.tsx` — то же
- `components/items/add-item-form.tsx` — опциональный showPurchaseToggle + чекбокс
- `app/t/[slug]/page.tsx` — 5-й таб
- `components/items/packing-list.tsx` — индикатор needs_purchase у пунктов (полировка)

## YAGNI

- Confirm-диалог для удаления (как сейчас, без него)
- Undo
- Числовое поле «сколько купить» (qty уже есть)
- Bulk «купил всё»
