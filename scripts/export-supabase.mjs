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
