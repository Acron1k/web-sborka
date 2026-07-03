import { api } from '@/lib/api-client';
import type { AISuggestion, Importance, ListType, Category } from '@/lib/db/types';

export async function fetchSuggestions(tripId: string): Promise<AISuggestion[]> {
  return api.get<AISuggestion[]>(`/api/suggestions?tripId=${tripId}`);
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
  await api.post('/api/suggestions/bulk', { tripId, suggestions });
}

export async function deleteSuggestion(id: string): Promise<void> {
  await api.del(`/api/suggestions/${id}`);
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
  await api.post(`/api/suggestions/${suggestion.id}/promote`, { myFamilyId, claimedBy });
}

export async function unpromoteSuggestion(id: string): Promise<void> {
  // На случай отмены — снимаем флаг (item НЕ удаляем, пользователь делает руками)
  await api.post(`/api/suggestions/${id}/unpromote`);
}
