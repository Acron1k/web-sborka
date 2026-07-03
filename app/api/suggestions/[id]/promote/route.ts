import { pool } from '@/lib/server/db';
import { badRequest, isUuid, notFound } from '@/lib/server/validate';
import type { AISuggestion } from '@/lib/db/types';

type Body = { myFamilyId: string; claimedBy?: string[] };

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !isUuid(body.myFamilyId)) return badRequest('myFamilyId должен быть uuid');
  const claimedBy = body.claimedBy ?? [];
  if (!Array.isArray(claimedBy) || claimedBy.some((f) => !isUuid(f))) {
    return badRequest('claimedBy должны быть uuid');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<AISuggestion>(
      'select * from ai_suggestions where id = $1 for update',
      [id]
    );
    if (rows.length === 0) {
      await client.query('rollback');
      return notFound('Suggestion не найден');
    }
    const s = rows[0];
    const isPersonal = s.list_type === 'personal';
    const { rows: itemRows } = await client.query<{ id: string }>(
      `insert into items
         (trip_id, list_type, title, qty, category, family_id, created_by_family_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        s.trip_id,
        s.list_type,
        s.title,
        s.qty,
        s.category,
        isPersonal ? body.myFamilyId : null,
        body.myFamilyId,
      ]
    );
    if (!isPersonal) {
      for (const familyId of claimedBy) {
        await client.query(
          `insert into item_claims (item_id, family_id) values ($1, $2)
           on conflict (item_id, family_id) do nothing`,
          [itemRows[0].id, familyId]
        );
      }
    }
    await client.query(
      `update ai_suggestions
       set added_to_list_at = now(), added_by_family_id = $2
       where id = $1`,
      [id, body.myFamilyId]
    );
    await client.query('commit');
    return new Response(null, { status: 204 });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
