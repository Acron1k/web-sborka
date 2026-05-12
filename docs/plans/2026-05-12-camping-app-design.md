# Camping Trip App — Design Document

**Date:** 2026-05-12
**Status:** Design approved, ready for implementation
**Context:** Веб-приложение для совместных сборов 4 пар в поход с палатками на выходных.

---

## 1. Цели и контекст

- 4 пары (8 человек, без детей) едут на природу с палатками
- Нужно совместно собрать снаряжение и продукты, избежать дублей, видеть кто что берёт
- Использование: только дома перед поездкой, на телефонах через браузер
- AI-подсказки приходят извне (через чат с Claude), импортируются в приложение по кнопке

---

## 2. Архитектура

**Стек:**
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres + Realtime + RLS)
- Деплой: Vercel

**Аутентификация:**
- Без Supabase Auth — лёгкая своя логика
- Trip slug в URL → выбор семьи из списка → cookie `trip_<slug>_family` на 30 дней
- При повторном заходе автоматически попадаешь как выбранная семья

---

## 3. Модель данных

```sql
trips
  id uuid pk
  slug text unique         -- URL-сегмент (mayskie-2026)
  name text
  starts_on date
  ends_on date
  created_at timestamptz

families
  id uuid pk
  trip_id uuid fk
  name text                -- "Ивановы"
  color text               -- hex для UI

members
  id uuid pk
  family_id uuid fk
  name text                -- "Ваня", "Маша" (опционально)

items
  id uuid pk
  trip_id uuid fk
  list_type text           -- 'common' | 'personal' | 'food'
  title text
  qty text                 -- "5 кг", свободный формат
  category text            -- для food: meat/veg/drinks/snacks
  family_id uuid fk        -- для personal (NULL для common/food)
  notes text
  created_by_family_id uuid fk
  is_done boolean default false
  created_at timestamptz

item_claims                -- кто берёт пункт (common + food)
  id uuid pk
  item_id uuid fk
  family_id uuid fk
  claimed_at timestamptz
  unique (item_id, family_id)
```

**Ключевые решения:**
- Одна таблица `items` на все три списка, фильтрация по `list_type` — DRY.
- `item_claims` отдельной таблицей — на общий пункт могут зацепиться несколько семей.
- Для `personal` claims не нужны — пункт принадлежит конкретной семье через `family_id`.

**RLS:**
- Видеть айтемы своего trip — любая семья этого trip
- Видеть `personal` — только владелец (family_id = current)
- Писать в свой trip — любая семья этого trip

---

## 4. UX и экраны

### Карта экранов

```
/                          — лендинг + кнопка "Создать поездку"
/t/[slug]/join             — выбор семьи
/t/[slug]                  — главный экран с 3 табами
  ├─ Общее
  ├─ Личное
  └─ Продукты
/t/[slug]/settings         — название, даты, семьи, AI export/import
```

### Экран "Общее"

- Сверху: инпут + кнопка "+"
- Список карточек: название, цветные кружки берущих семей, кнопка "Беру я" / "Я не беру"
- Пункт без берущих — красная рамка + текст "никто не берёт"
- При добавлении дубля — модалка: **Объединить** / **Это другое**
- Фильтр: Все / Никто не берёт / Я беру

### Экран "Личное"

- Заголовок: "Список семьи Ивановы"
- Чекбоксы с прогресс-баром "12 из 18 упаковано"
- Никто кроме этой семьи не видит (RLS)

### Экран "Продукты"

- Сегмент-контрол: Все / Мясо / Овощи / Напитки / Перекус
- Карточки: название + qty + кто берёт
- Та же логика claims и дублей что в Общем
- Сводка снизу: "Мяса: 7 кг (3 семьи), Напитков: 0 ⚠️"

### Settings

- Название, даты, имена семей, цвета
- Кнопка "Скопировать ссылку для друзей"
- AI-блок: "Экспортировать состояние" (JSON в буфер) + "Импортировать предложения" (textarea + превью с чекбоксами)

---

## 5. Ключевая логика

### Flow создания поездки

1. Юзер на `/` жмёт "Создать поездку"
2. Форма: название, даты, 4 имени семей с цветами
3. Insert в `trips` + `families`, редирект на `/t/[slug]`
4. Шарит ссылку → друзья открывают → выбирают семью на `/join` → cookie → главный экран

### "Беру я" (claims)

- Тап "Беру я" — insert в `item_claims`
- Тап "Я не беру" — delete своего claim
- Несколько семей в claims = несколько кружков в ряд
- Все убрали — пункт в "никто не берёт"

### Детектор дублей

- Нормализация title: `toLowerCase().trim().replace(/\s+/g, ' ')`
- Levenshtein ≤ 2 ИЛИ один title — подстрока другого
- Модалка: **Объединить** (текущая семья → claims существующего) / **Это другое**

### Realtime

- Supabase Realtime каналы на `items` и `item_claims` с фильтром `trip_id`
- Оптимистичный апдейт состояния на клиенте через React Query или Zustand
- Изменения видны у всех через ~300мс

### AI export/import JSON

```json
{
  "trip": {"name": "...", "dates": "..."},
  "families": ["Ивановы", "Петровы"],
  "common": [{"title": "Мангал", "claimed_by": ["Ивановы"]}],
  "food": [{"title": "Мясо", "qty": "5 кг", "category": "meat", "claimed_by": []}],
  "suggestions": [
    {"list": "common", "title": "Тент от дождя", "reason": "..."},
    {"list": "food", "title": "Соль", "qty": "пачка", "category": "snacks"}
  ]
}
```

UI показывает превью каждой suggestion с чекбоксами для выборочного импорта.

---

## 6. План реализации

1. Скаффолд: `create-next-app` + Tailwind + shadcn/ui, Supabase проект, SQL-миграция
2. Routing + базовые экраны (заглушки)
3. Создание поездки (форма + insert)
4. Cookie-логика семьи (middleware + `/join`)
5. Общий список (CRUD + claims + цветные кружки)
6. Детектор дублей (Levenshtein + модалка)
7. Личный список (CRUD + RLS + прогресс-бар)
8. Продукты (категории + сегмент-контрол)
9. Realtime-подписки
10. Settings + AI export/import
11. Деплой на Vercel + тест на телефонах друзей

---

## 7. YAGNI — что НЕ делаем

- Регистрация и пароли
- Push-уведомления / email
- Загрузка фото
- Drag-and-drop сортировка
- Чат внутри приложения
- История изменений / undo
- Тёмная тема
- PWA / offline
- i18n
- Автотесты (ручное тестирование перед отправкой ссылки)

---

## 8. Риски

| Риск | Митигация |
|------|-----------|
| Друг выбрал не ту семью | Кнопка смены в settings |
| Бесплатный лимит Supabase | Для 8 человек и ~200 пунктов не приблизимся |
| Realtime отвалится | Pull-to-refresh из коробки |
