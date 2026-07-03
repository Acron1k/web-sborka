import { api, ApiError } from '@/lib/api-client';
import type { Trip, Family } from '@/lib/db/types';

export async function fetchTripBySlug(slug: string): Promise<{ trip: Trip; families: Family[] } | null> {
  try {
    return await api.get<{ trip: Trip; families: Family[] }>(
      `/api/trips/${encodeURIComponent(slug)}`
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
