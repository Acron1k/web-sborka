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
