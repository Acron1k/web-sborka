import { pool } from '@/lib/server/db';
import { badRequest, isNonEmptyString } from '@/lib/server/validate';
import type { Trip } from '@/lib/db/types';

type CreateTripBody = {
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  families: { name: string; color: string; position: number }[];
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateTripBody | null;
  if (!body) return badRequest('Невалидный JSON');
  if (!isNonEmptyString(body.slug)) return badRequest('slug обязателен');
  if (!isNonEmptyString(body.name)) return badRequest('name обязателен');
  if (!Array.isArray(body.families) || body.families.length < 2) {
    return badRequest('Нужно минимум 2 семьи');
  }
  if (
    body.families.some(
      (f) => !isNonEmptyString(f.name) || !isNonEmptyString(f.color) || !Number.isInteger(f.position)
    )
  ) {
    return badRequest('У каждой семьи должны быть name, color и целочисленный position');
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<Trip>(
      `insert into trips (slug, name, starts_on, ends_on)
       values ($1, $2, $3, $4) returning *`,
      [body.slug.trim(), body.name.trim(), body.starts_on || null, body.ends_on || null]
    );
    const trip = rows[0];
    for (const f of body.families) {
      await client.query(
        `insert into families (trip_id, name, color, position) values ($1, $2, $3, $4)`,
        [trip.id, f.name.trim(), f.color, f.position]
      );
    }
    await client.query('commit');
    return Response.json(trip, { status: 201 });
  } catch (e) {
    await client.query('rollback');
    if ((e as { code?: string }).code === '23505') {
      return Response.json({ error: 'Такой slug уже существует, попробуй ещё раз' }, { status: 409 });
    }
    throw e;
  } finally {
    client.release();
  }
}
