-- Camping app initial schema
-- Run this in Supabase Dashboard - SQL Editor

-- Cleanup (safe to re-run)
drop table if exists item_claims cascade;
drop table if exists items cascade;
drop table if exists families cascade;
drop table if exists trips cascade;

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

-- Items
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
  is_done boolean default false,
  created_at timestamptz default now(),
  constraint items_list_type_check check (list_type in ('common', 'personal', 'food')),
  constraint items_category_check check (category is null or category in ('meat', 'veg', 'drinks', 'snacks', 'other'))
);

create index idx_items_trip_list on items(trip_id, list_type);
create index idx_items_family on items(family_id);

-- Claims
create table item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  claimed_at timestamptz default now(),
  unique (item_id, family_id)
);

create index idx_claims_item on item_claims(item_id);

-- RLS (permissive MVP)
alter table trips        enable row level security;
alter table families     enable row level security;
alter table items        enable row level security;
alter table item_claims  enable row level security;

create policy "anon all trips"    on trips        for all using (true) with check (true);
create policy "anon all families" on families     for all using (true) with check (true);
create policy "anon all items"    on items        for all using (true) with check (true);
create policy "anon all claims"   on item_claims  for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table item_claims;
alter publication supabase_realtime add table families;
