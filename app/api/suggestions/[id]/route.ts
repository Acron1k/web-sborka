import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query('delete from ai_suggestions where id = $1', [id]);
  return new Response(null, { status: 204 });
}
