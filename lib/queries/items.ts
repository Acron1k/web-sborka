import { supabase } from '@/lib/supabase/client';
import type { Item, ItemClaim, ListType, Category } from '@/lib/db/types';

export async function fetchItems(tripId: string, listType: ListType): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId)
    .eq('list_type', listType)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
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
}): Promise<Item> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      qty: null,
      category: null,
      family_id: null,
      notes: null,
      is_done: false,
      ...payload,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', itemId);
  if (error) throw error;
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
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId)
    .eq('list_type', 'personal')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function togglePersonalDone(itemId: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('items').update({ is_done: done }).eq('id', itemId);
  if (error) throw error;
}
