import { pool } from '@/lib/server/db';
import { badRequest, isUuid, notFound } from '@/lib/server/validate';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as { is_packed?: boolean } | null;
  if (!body || typeof body.is_packed !== 'boolean') {
    return badRequest('is_packed должен быть boolean');
  }
  const result = await pool.query(
    'update item_claims set is_packed = $2 where id = $1',
    [id, body.is_packed]
  );
  if (result.rowCount === 0) return notFound('Claim не найден');
  return new Response(null, { status: 204 });
}
