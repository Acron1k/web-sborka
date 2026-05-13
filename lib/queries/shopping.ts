import { supabase } from '@/lib/supabase/client';
import type { Item, ItemClaim } from '@/lib/db/types';

/**
 * Fetch all items where needs_purchase=true for the trip, with their claims.
 */
export async function fetchShoppingItems(
  tripId: string
): Promise<{ items: Item[]; claims: ItemClaim[] }> {
  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('*')
    .eq('trip_id', tripId)
    .eq('needs_purchase', true)
    .order('created_at', { ascending: true });
  if (itemsErr) throw itemsErr;
  const itemList = items ?? [];
  if (itemList.length === 0) return { items: [], claims: [] };

  const itemIds = itemList.map(i => i.id);
  const { data: claims, error: claimsErr } = await supabase
    .from('item_claims')
    .select('*')
    .in('item_id', itemIds);
  if (claimsErr) throw claimsErr;
  return { items: itemList, claims: claims ?? [] };
}
