import type { Trip, Family, Item, ItemClaim, Category, ListType } from '@/lib/db/types';

export type SuggestionImportance = 'critical' | 'recommended' | 'optional';

export type AISuggestion = {
  list: ListType;
  title: string;
  qty?: string;
  category?: Category;
  importance: SuggestionImportance;
  reason?: string;
};

export type AIExport = {
  trip: { name: string; starts_on: string | null; ends_on: string | null };
  families: string[];
  common: { title: string; claimed_by: string[] }[];
  personal: Record<string, string[]>; // family name -> titles
  food: { title: string; qty: string | null; category: string | null; claimed_by: string[] }[];
};

export function buildExport(
  trip: Trip,
  families: Family[],
  items: Item[],
  claims: ItemClaim[]
): AIExport {
  const famName = new Map(families.map(f => [f.id, f.name]));
  const claimNames = (itemId: string) =>
    claims.filter(c => c.item_id === itemId).map(c => famName.get(c.family_id) ?? '?');

  const common = items
    .filter(i => i.list_type === 'common')
    .map(i => ({ title: i.title, claimed_by: claimNames(i.id) }));

  const food = items
    .filter(i => i.list_type === 'food')
    .map(i => ({
      title: i.title,
      qty: i.qty,
      category: i.category,
      claimed_by: claimNames(i.id),
    }));

  const personal: Record<string, string[]> = {};
  for (const f of families) {
    personal[f.name] = items
      .filter(i => i.list_type === 'personal' && i.family_id === f.id)
      .map(i => i.title);
  }

  return {
    trip: { name: trip.name, starts_on: trip.starts_on, ends_on: trip.ends_on },
    families: families.map(f => f.name),
    common,
    personal,
    food,
  };
}

export function buildExportPrompt(exportData: AIExport): string {
  const dates = exportData.trip.starts_on && exportData.trip.ends_on
    ? `${exportData.trip.starts_on} → ${exportData.trip.ends_on}`
    : 'без дат';
  const nFamilies = exportData.families.length;

  return `Помоги собрать в поход. ${nFamilies} семьи (${exportData.families.join(', ')}), даты ${dates}.

Ниже текущее состояние списков — предложи что мы могли забыть. Для каждого предложения укажи:
- list: "common" | "personal" | "food"
- title: название
- qty (только для food): "2 кг", "1 шт" и т.д.
- category (только для food): "meat" | "veg" | "drinks" | "snacks" | "other"
- importance: "critical" (must, без этого никак) | "recommended" (сильно желательно) | "optional" (по желанию)
- reason: короткое объяснение почему

Верни JSON в формате:
{
  "suggestions": [
    { "list": "...", "title": "...", "importance": "...", "reason": "..." }
  ]
}

Текущее состояние:
${JSON.stringify(exportData, null, 2)}`;
}
