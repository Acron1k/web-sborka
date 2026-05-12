# Packing Checklist — Design Document

**Date:** 2026-05-12
**Status:** Approved
**Context:** Расширение таба «Личное» — unified view всего что нужно собрать моей семье (личные вещи + общие пункты + продукты с claims на меня).

---

## Цель

При сборе смотреть в один список вместо переключения между тремя табами и параллельной фильтрации «что за нашей семьёй».

---

## Схема БД

**Миграция:**

```sql
alter table item_claims add column is_packed boolean not null default false;
```

**Семантика:**
- `items.is_done` — упаковка **личных** пунктов (как сейчас)
- `item_claims.is_packed` — упаковка **общих/продуктовых** пунктов на уровне конкретной семьи. Один пункт может иметь несколько claims, у каждого свой флаг.

Пример: «Мангал» взяли Ивановы и Петровы → два `item_claims`, каждый со своим `is_packed`. Независимо.

---

## UX

Таб «Личное» получает три секции:

1. **Моё личное** — items where `list_type='personal' AND family_id=$me`. Full CRUD + чекбокс is_done.
2. **Общее за нами** — items where `list_type='common'` JOIN claims where `family_id=$me`. Read-only + чекбокс is_packed.
3. **Продукты за нами** — items where `list_type='food'` JOIN claims where `family_id=$me`. Read-only + чекбокс is_packed.

**Заголовок таба:** общий прогресс «N / M упаковано» с прогресс-баром по всем трём секциям сразу.

**Каждая секция:** mono-tag номер (01/02/03) + display заголовок + счётчик per-section.

**Read-only строка:** только чекбокс + текст + (для food) qty + категория-тег. Под пунктом — mono-tag «· также Петровы» если есть другие семьи в claims.

**Пустая секция:** mono-tag «никаких пунктов на нас».

**Mobile:** стопкой. **Desktop:** на широком экране секция 01 слева, 02+03 справа.

---

## Файлы

- `lib/db/types.ts` — добавить `is_packed: boolean` в `ItemClaim`
- `lib/queries/items.ts` — `fetchClaimedItemsForFamily`, `toggleClaimPacked`
- `components/items/packing-list.tsx` — **новый** главный контейнер
- `components/items/claimed-readonly-row.tsx` — **новый** read-only row с чекбоксом
- `app/t/[slug]/page.tsx` — заменить `PersonalList` на `PackingList` в табе personal
- `lib/realtime.ts` — без изменений (существующая инвалидация покрывает)

## YAGNI

- Tap title → переход в исходный таб (потом, требует URL state)
- Bulk «упаковать всё»
- Сортировка/фильтры в чеклисте
