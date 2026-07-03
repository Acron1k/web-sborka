import { supabase } from '@/lib/supabase/client';
import { api } from '@/lib/api-client';
import type { Item, ItemClaim, ListType, Category } from '@/lib/db/types';

export async function fetchItems(tripId: string, listType: ListType): Promise<Item[]> {
  return api.get<Item[]>(`/api/items?tripId=${tripId}&listType=${listType}`);
}

export async function fetchClaims(tripId: string): Promise<ItemClaim[]> {
  // Берём все claims с join на items для фильтрации по trip_id.
  // Supabase возвращает claims с вложенным items.trip_id — обходим простым подходом:
  // достаём все claims в trip через подзапрос по item_id.
  const { data: items } = await supabase.from('items').select('id').eq('trip_id', tripId);
  const itemIds = (items ?? []).map(i => i.id);
  if (itemIds.length === 0) return [];
  const { data, error } = await supabase.from('item_claims').select('*').in('item_id', itemIds);
  if (error) throw error;
  return data ?? [];
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
  const { data: existing } = await supabase
    .from('item_claims')
    .select('id')
    .eq('item_id', itemId)
    .eq('family_id', familyId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('item_claims')
      .update({ is_purchased: purchased })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('item_claims')
      .insert({ item_id: itemId, family_id: familyId, is_purchased: purchased });
    if (error && error.code !== '23505') throw error;
  }
}

export async function insertItemWithClaims(
  payload: Parameters<typeof insertItem>[0],
  familyIds: string[]
): Promise<Item> {
  return api.post<Item>('/api/items', { ...payload, claimFamilyIds: familyIds });
}

export async function toggleClaim(itemId: string, familyId: string, claimed: boolean): Promise<void> {
  if (claimed) {
    const { error } = await supabase.from('item_claims').insert({ item_id: itemId, family_id: familyId });
    // 23505 = unique violation (claim уже существует) — не считаем ошибкой
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('item_claims')
      .delete()
      .eq('item_id', itemId)
      .eq('family_id', familyId);
    if (error) throw error;
  }
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
  // Все items этой поездки (нужны и для resolve title/qty/category, и для отсечки claims по trip).
  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId);
  if (itemsErr) throw itemsErr;
  const allItems = items ?? [];
  const itemIds = allItems.map(i => i.id);
  if (itemIds.length === 0) return { items: [], myClaims: [], allClaims: [] };

  const { data: claims, error: claimsErr } = await supabase
    .from('item_claims')
    .select('*')
    .in('item_id', itemIds);
  if (claimsErr) throw claimsErr;
  const allClaims = claims ?? [];
  const myClaims = allClaims.filter(c => c.family_id === familyId);

  return { items: allItems, myClaims, allClaims };
}

export async function toggleClaimPacked(claimId: string, packed: boolean): Promise<void> {
  const { error } = await supabase
    .from('item_claims')
    .update({ is_packed: packed })
    .eq('id', claimId);
  if (error) throw error;
}
