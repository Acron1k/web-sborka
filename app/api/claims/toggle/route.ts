import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

type Body = { itemId: string; familyId: string; claimed: boolean };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.itemId)) return badRequest('itemId должен быть uuid');
  if (!isUuid(body.familyId)) return badRequest('familyId должен быть uuid');
  if (typeof body.claimed !== 'boolean') return badRequest('claimed должен быть boolean');

  if (body.claimed) {
    await pool.query(
      `insert into item_claims (item_id, family_id) values ($1, $2)
       on conflict (item_id, family_id) do nothing`,
      [body.itemId, body.familyId]
    );
  } else {
    await pool.query(
      'delete from item_claims where item_id = $1 and family_id = $2',
      [body.itemId, body.familyId]
    );
  }
  return new Response(null, { status: 204 });
}
