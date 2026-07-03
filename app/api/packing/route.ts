import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { Item, ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
  const familyId = url.searchParams.get('familyId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  if (!isUuid(familyId)) return badRequest('familyId должен быть uuid');

  const { rows: items } = await pool.query<Item>(
    'select * from items where trip_id = $1',
    [tripId]
  );
  const { rows: allClaims } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1`,
    [tripId]
  );
  const myClaims = allClaims.filter((c) => c.family_id === familyId);
  return Response.json({ items, myClaims, allClaims });
}
