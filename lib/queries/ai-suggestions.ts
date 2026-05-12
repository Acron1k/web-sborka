import { supabase } from '@/lib/supabase/client';
import type { AISuggestion, Importance, ListType, Category } from '@/lib/db/types';
import { insertItemWithClaims } from './items';

export async function fetchSuggestions(tripId: string): Promise<AISuggestion[]> {
  const { data, error } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type NewSuggestion = {
  list_type: ListType;
  title: string;
  qty?: string | null;
  category?: Category | null;
  importance: Importance;
  reason?: string | null;
};

export async function bulkInsertSuggestions(
  tripId: string,
  suggestions: NewSuggestion[]
): Promise<void> {
  if (suggestions.length === 0) return;
  const payload = suggestions.map(s => ({
    trip_id: tripId,
    list_type: s.list_type,
    title: s.title,
    qty: s.qty ?? null,
    category: s.category ?? null,
    importance: s.importance,
    reason: s.reason ?? null,
  }));
  const { error } = await supabase.from('ai_suggestions').insert(payload);
  if (error) throw error;
}

export async function deleteSuggestion(id: string): Promise<void> {
  const { error } = await supabase.from('ai_suggestions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Promote suggestion to actual list: create items row, mark suggestion as promoted.
 * For 'personal' — family_id из аргумента (моя семья).
 * Для 'common' и 'food' — claimedBy[] (опциональный список семей которые «возьмут»).
 */
export async function promoteSuggestion(
  suggestion: AISuggestion,
  myFamilyId: string,
  claimedBy: string[] = []
): Promise<void> {
  await insertItemWithClaims(
    {
      trip_id: suggestion.trip_id,
      list_type: suggestion.list_type,
      title: suggestion.title,
      qty: suggestion.qty,
      category: suggestion.category,
      family_id: suggestion.list_type === 'personal' ? myFamilyId : null,
      created_by_family_id: myFamilyId,
    },
    suggestion.list_type === 'personal' ? [] : claimedBy
  );
  const { error } = await supabase
    .from('ai_suggestions')
    .update({ added_to_list_at: new Date().toISOString(), added_by_family_id: myFamilyId })
    .eq('id', suggestion.id);
  if (error) throw error;
}

export async function unpromoteSuggestion(id: string): Promise<void> {
  // На случай отмены — снимаем флаг (item НЕ удаляем, пользователь делает руками)
  const { error } = await supabase
    .from('ai_suggestions')
    .update({ added_to_list_at: null, added_by_family_id: null })
    .eq('id', id);
  if (error) throw error;
}
