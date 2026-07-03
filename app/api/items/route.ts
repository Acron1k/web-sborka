import { pool } from '@/lib/server/db';
import {
  badRequest,
  isCategoryOrNull,
  isListType,
  isNonEmptyString,
  isUuid,
} from '@/lib/server/validate';
import type { Item } from '@/lib/db/types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
  const listType = url.searchParams.get('listType');
  const familyId = url.searchParams.get('familyId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');

  const conditions = ['trip_id = $1'];
  const params: unknown[] = [tripId];
  if (listType !== null) {
    if (!isListType(listType)) return badRequest('невалидный listType');
    params.push(listType);
    conditions.push(`list_type = $${params.length}`);
  }
  if (familyId !== null) {
    if (!isUuid(familyId)) return badRequest('familyId должен быть uuid');
    params.push(familyId);
    conditions.push(`family_id = $${params.length}`);
  }

  const { rows } = await pool.query<Item>(
    `select * from items where ${conditions.join(' and ')} order by created_at asc`,
    params
  );
  return Response.json(rows);
}

type CreateItemBody = {
  trip_id: string;
  list_type: string;
  title: string;
  qty?: string | null;
  category?: string | null;
  family_id?: string | null;
  notes?: string | null;
  created_by_family_id: string;
  needs_purchase?: boolean;
  claimFamilyIds?: string[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateItemBody | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isUuid(body.trip_id)) return badRequest('trip_id должен быть uuid');
  if (!isListType(body.list_type)) return badRequest('невалидный list_type');
  if (!isNonEmptyString(body.title)) return badRequest('title обязателен');
  if (!isCategoryOrNull(body.category ?? null)) return badRequest('невалидная category');
  if (!isUuid(body.created_by_family_id)) return badRequest('created_by_family_id должен быть uuid');
  if (body.family_id != null && !isUuid(body.family_id)) return badRequest('family_id должен быть uuid');
  const claimFamilyIds = body.claimFamilyIds ?? [];
  if (!Array.isArray(claimFamilyIds) || claimFamilyIds.some((id) => !isUuid(id))) {
    return badRequest('claimFamilyIds должны быть uuid');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<Item>(
      `insert into items
         (trip_id, list_type, title, qty, category, family_id, notes,
          created_by_family_id, is_done, needs_purchase)
       values ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       returning *`,
      [
        body.trip_id,
        body.list_type,
        body.title.trim(),
        body.qty ?? null,
        body.category ?? null,
        body.family_id ?? null,
        body.notes ?? null,
        body.created_by_family_id,
        body.needs_purchase ?? false,
      ]
    );
    const item = rows[0];
    for (const familyId of claimFamilyIds) {
      await client.query(
        `insert into item_claims (item_id, family_id) values ($1, $2)
         on conflict (item_id, family_id) do nothing`,
        [item.id, familyId]
      );
    }
    await client.query('commit');
    return Response.json(item, { status: 201 });
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}
