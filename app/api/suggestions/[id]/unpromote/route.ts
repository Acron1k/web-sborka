import { pool } from '@/lib/server/db';
import { badRequest, isUuid } from '@/lib/server/validate';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query(
    'update ai_suggestions set added_to_list_at = null, added_by_family_id = null where id = $1',
    [id]
  );
  return new Response(null, { status: 204 });
}
