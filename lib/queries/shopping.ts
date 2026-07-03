import { api } from '@/lib/api-client';
import type { Item, ItemClaim } from '@/lib/db/types';

/**
 * Fetch all items where needs_purchase=true for the trip, with their claims.
 */
export async function fetchShoppingItems(
  tripId: string
): Promise<{ items: Item[]; claims: ItemClaim[] }> {
  return api.get(`/api/shopping?tripId=${tripId}`);
}
