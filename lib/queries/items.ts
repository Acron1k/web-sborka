import { api } from '@/lib/api-client';
import type { Item, ItemClaim, ListType, Category } from '@/lib/db/types';

export async function fetchItems(tripId: string, listType: ListType): Promise<Item[]> {
  return api.get<Item[]>(`/api/items?tripId=${tripId}&listType=${listType}`);
}

export async function fetchClaims(tripId: string): Promise<ItemClaim[]> {
  return api.get<ItemClaim[]>(`/api/claims?tripId=${tripId}`);
}

export async function insertItem(payload: {
  trip_id: string;
  list_type: ListType;
  title: string;
  qty?: string | null;
  category?: Category | null;
  family_id?: string | null;
  created_by_family_id: string;
  needs_purchase?: boolean;
}): Promise<Item> {
  return api.post<Item>('/api/items', payload);
}

export async function deleteItem(itemId: string): Promise<void> {
  await api.del(`/api/items/${itemId}`);
}

export async function updateItem(
  itemId: string,
  patch: Partial<Pick<Item, 'title' | 'qty' | 'category' | 'needs_purchase'>>
): Promise<void> {
  await api.patch(`/api/items/${itemId}`, patch);
}

/**
 * Mark item as purchased by current family.
 * If no claim from current family — create one with is_purchased=true.
 * If claim exists — just set is_purchased.
 */
export async function markPurchasedByCurrentFamily(
  itemId: string,
  familyId: string,
  purchased: boolean
): Promise<void> {
  await api.post('/api/claims/purchase', { itemId, familyId, purchased });
}

export async function insertItemWithClaims(
  payload: Parameters<typeof insertItem>[0],
  familyIds: string[]
): Promise<Item> {
  return api.post<Item>('/api/items', { ...payload, claimFamilyIds: familyIds });
}

export async function toggleClaim(itemId: string, familyId: string, claimed: boolean): Promise<void> {
  await api.post('/api/claims/toggle', { itemId, familyId, claimed });
}

export async function fetchPersonalItems(tripId: string, familyId: string): Promise<Item[]> {
  return api.get<Item[]>(`/api/items?tripId=${tripId}&listType=personal&familyId=${familyId}`);
}

export async function togglePersonalDone(itemId: string, done: boolean): Promise<void> {
  await api.patch(`/api/items/${itemId}`, { is_done: done });
}

export async function fetchClaimedItemsForFamily(
  tripId: string,
  familyId: string
): Promise<{ items: Item[]; myClaims: ItemClaim[]; allClaims: ItemClaim[] }> {
  return api.get(`/api/packing?tripId=${tripId}&familyId=${familyId}`);
}

export async function toggleClaimPacked(claimId: string, packed: boolean): Promise<void> {
  await api.patch(`/api/claims/${claimId}`, { is_packed: packed });
}
