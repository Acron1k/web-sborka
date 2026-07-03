import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

type Body = { itemId: string; familyId: string; purchased: boolean };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.itemId)) return badRequest('itemId должен быть uuid');
  if (!isUuid(body.familyId)) return badRequest('familyId должен быть uuid');
  if (typeof body.purchased !== 'boolean') return badRequest('purchased должен быть boolean');

  await pool.query(
    `insert into item_claims (item_id, family_id, is_purchased)
     values ($1, $2, $3)
     on conflict (item_id, family_id) do update set is_purchased = excluded.is_purchased`,
    [body.itemId, body.familyId, body.purchased]
  );
  return new Response(null, { status: 204 });
}
