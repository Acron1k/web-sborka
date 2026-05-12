'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSuggestions,
  promoteSuggestion,
  deleteSuggestion,
} from '@/lib/queries/ai-suggestions';
import { SuggestionRow } from './suggestion-row';
import type { Family, Importance, ListType, AISuggestion } from '@/lib/db/types';

type ImpFilter = 'all' | Importance;
type ListFilter = 'all' | ListType;

const IMP_FILTERS: { value: ImpFilter; label: string; dot: string }[] = [
  { value: 'all', label: 'всё', dot: '' },
  { value: 'critical', label: 'критично', dot: 'bg-destructive' },
  { value: 'recommended', label: 'рекомендую', dot: 'bg-primary' },
  { value: 'optional', label: 'по желанию', dot: 'bg-muted-foreground/40' },
];

const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'all', label: 'все списки' },
  { value: 'common', label: 'общее' },
  { value: 'personal', label: 'личное' },
  { value: 'food', label: 'продукты' },
];

export function SuggestionsList({
  tripId,
  families,
  myFamilyId,
}: {
  tripId: string;
  families: Family[];
  myFamilyId: string;
}) {
  const qc = useQueryClient();
  const sugKey = ['suggestions', tripId];

  const { data: suggestions = [] } = useQuery({
    queryKey: sugKey,
    queryFn: () => fetchSuggestions(tripId),
  });

  const [impFilter, setImpFilter] = useState<ImpFilter>('all');
  const [listFilter, setListFilter] = useState<ListFilter>('all');

  const promoteMut = useMutation({
    mutationFn: ({ s, claimedBy }: { s: AISuggestion; claimedBy: string[] }) =>
      promoteSuggestion(s, myFamilyId, claimedBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sugKey });
      qc.invalidateQueries({ queryKey: ['items', tripId] });
      qc.invalidateQueries({ queryKey: ['claims', tripId] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteSuggestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sugKey }),
  });

  const famById = useMemo(
    () => new Map(families.map(f => [f.id, f] as const)),
    [families]
  );

  const filtered = useMemo(() => {
    return suggestions
      .filter(s => impFilter === 'all' || s.importance === impFilter)
      .filter(s => listFilter === 'all' || s.list_type === listFilter)
      .sort((a, b) => {
        // pending первые, потом promoted
        const aPromoted = !!a.added_to_list_at;
        const bPromoted = !!b.added_to_list_at;
        if (aPromoted !== bPromoted) return aPromoted ? 1 : -1;
        // По importance: critical → recommended → optional
        const impOrder: Record<Importance, number> = {
          critical: 0,
          recommended: 1,
          optional: 2,
        };
        if (a.importance !== b.importance)
          return impOrder[a.importance] - impOrder[b.importance];
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [suggestions, impFilter, listFilter]);

  const total = suggestions.length;
  const promoted = suggestions.filter(s => s.added_to_list_at).length;
  const pending = total - promoted;

  const impCounts = useMemo(
    () => ({
      critical: suggestions.filter(s => s.importance === 'critical' && !s.added_to_list_at).length,
      recommended: suggestions.filter(s => s.importance === 'recommended' && !s.added_to_list_at).length,
      optional: suggestions.filter(s => s.importance === 'optional' && !s.added_to_list_at).length,
    }),
    [suggestions]
  );

  if (total === 0) {
    return (
      <div className="space-y-6">
        <div>
          <span className="mono-tag text-muted-foreground">сводка</span>
          <h2 className="display text-3xl ink mt-1">Пока тихо</h2>
          <p className="text-base text-muted-foreground mt-3 max-w-md leading-relaxed">
            Жми <b className="ink">«копировать промпт»</b> в настройках, скинь Claude
            в чат — и вставь ответ обратно через <b className="ink">«импорт»</b>.
            Подсказки появятся здесь.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between hairline-b pb-2">
        <span className="mono-tag text-muted-foreground">сводка</span>
        <span className="mono-tag text-muted-foreground">
          {pending} ждут · {promoted} разобрано
        </span>
      </div>

      {/* Importance filter */}
      <div className="flex flex-wrap gap-2">
        {IMP_FILTERS.map(f => {
          const active = impFilter === f.value;
          const count =
            f.value === 'all' ? pending : impCounts[f.value as Importance];
          return (
            <button
              key={f.value}
              onClick={() => setImpFilter(f.value)}
              className={`flex items-center gap-2 px-3 h-8 rounded-full border transition-colors text-sm ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-[var(--rule)] hover:border-foreground'
              }`}
            >
              {f.dot && <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />}
              <span>{f.label}</span>
              {f.value !== 'all' && <span className="mono-tag opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* List filter */}
      <div className="flex flex-wrap gap-2">
        {LIST_FILTERS.map(f => {
          const active = listFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setListFilter(f.value)}
              className={`px-3 h-7 text-xs rounded-full border transition-colors ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-[var(--rule)] hover:border-foreground'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="mono-tag text-muted-foreground py-8">ничего под фильтром</p>
      ) : (
        <ul>
          {filtered.map(s => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              promotedByFamily={
                s.added_by_family_id ? famById.get(s.added_by_family_id) ?? null : null
              }
              families={families}
              myFamilyId={myFamilyId}
              onPromote={(sug, claimedBy) => promoteMut.mutate({ s: sug, claimedBy })}
              onDelete={id => delMut.mutate(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
