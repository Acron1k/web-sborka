import type { Category, Importance, ListType } from '@/lib/db/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

const LIST_TYPES: readonly string[] = ['common', 'personal', 'food'];
const CATEGORIES: readonly string[] = ['meat', 'veg', 'drinks', 'snacks', 'other'];
const IMPORTANCES: readonly string[] = ['critical', 'recommended', 'optional'];

export function isListType(v: unknown): v is ListType {
  return typeof v === 'string' && LIST_TYPES.includes(v);
}

export function isCategoryOrNull(v: unknown): v is Category | null {
  return v === null || (typeof v === 'string' && CATEGORIES.includes(v));
}

export function isImportance(v: unknown): v is Importance {
  return typeof v === 'string' && IMPORTANCES.includes(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = 'Not found'): Response {
  return Response.json({ error: message }, { status: 404 });
}
