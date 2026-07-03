import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { Item, ItemClaim } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const { rows: items } = await pool.query<Item>(
    `select * from items
     where trip_id = $1 and needs_purchase = true
     order by created_at asc`,
    [tripId]
  );
  if (items.length === 0) return Response.json({ items: [], claims: [] });

  const { rows: claims } = await pool.query<ItemClaim>(
    `select c.* from item_claims c
     join items i on i.id = c.item_id
     where i.trip_id = $1 and i.needs_purchase = true`,
    [tripId]
  );
  return Response.json({ items, claims });
}
