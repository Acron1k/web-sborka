import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  const { rows } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1`,
    [tripId]
  );
  return Response.json(rows);
}
