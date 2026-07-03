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
