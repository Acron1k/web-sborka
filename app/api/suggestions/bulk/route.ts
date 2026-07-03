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
