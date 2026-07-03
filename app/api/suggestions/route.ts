import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';
import type { AISuggestion } from '@/lib/db/types';

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!isUuid(tripId)) return badRequest('tripId должен быть uuid');
  const { rows } = await pool.query<AISuggestion>(
    'select * from ai_suggestions where trip_id = $1 order by created_at asc',
    [tripId]
  );
  return Response.json(rows);
}
