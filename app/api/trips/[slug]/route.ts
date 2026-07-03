import { pool } from '@/lib/server/db';
import { badRequest, isNonEmptyString, notFound } from '@/lib/server/validate';
import type { Family, Trip } from '@/lib/db/types';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  if (!isNonEmptyString(slug)) return badRequest('slug обязателен');

  const { rows: trips } = await pool.query<Trip>(
    'select * from trips where slug = $1',
    [slug]
  );
  if (trips.length === 0) return notFound('Поездка не найдена');
  const trip = trips[0];

  const { rows: families } = await pool.query<Family>(
    'select * from families where trip_id = $1 order by position',
    [trip.id]
  );
  return Response.json({ trip, families });
}
