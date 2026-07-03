import { pool } from '@/lib/server/db';
import { badRequest, isCategoryOrNull, isNonEmptyString, isUuid, notFound } from '@/lib/server/validate';

type PatchBody = {
  title?: string;
  qty?: string | null;
  category?: string | null;
  needs_purchase?: boolean;
  is_done?: boolean;
};

const PATCHABLE = ['title', 'qty', 'category', 'needs_purchase', 'is_done'] as const;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return badRequest('Невалидный JSON');

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const key of PATCHABLE) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === 'title' && !isNonEmptyString(value)) return badRequest('title не может быть пустым');
    if (key === 'category' && !isCategoryOrNull(value ?? null)) return badRequest('невалидная category');
    if ((key === 'needs_purchase' || key === 'is_done') && typeof value !== 'boolean') {
      return badRequest(`${key} должен быть boolean`);
    }
    params.push(value ?? null);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return badRequest('Нет полей для обновления');

  const result = await pool.query(
    `update items set ${sets.join(', ')} where id = $1`,
    params
  );
  if (result.rowCount === 0) return notFound('Item не найден');
  return new Response(null, { status: 204 });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badRequest('id должен быть uuid');
  await pool.query('delete from items where id = $1', [id]);
  return new Response(null, { status: 204 });
}
