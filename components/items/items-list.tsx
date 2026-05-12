'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FamilyBadge } from '@/components/family-badge';
import { fetchItems, fetchClaims, insertItem, deleteItem, toggleClaim } from '@/lib/queries/items';
import type { Family, ItemClaim, ListType } from '@/lib/db/types';
import { AddItemForm } from './add-item-form';
import { findDuplicate } from '@/lib/duplicate';
import { DuplicateDialog } from './duplicate-dialog';

export function ItemsList({
  tripId,
  listType,
  families,
  currentFamilyId,
}: {
  tripId: string;
  listType: ListType;
  families: Family[];
  currentFamilyId: string;
}) {
  const qc = useQueryClient();
  const itemsKey = ['items', tripId, listType];
  const claimsKey = ['claims', tripId];

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: () => fetchItems(tripId, listType),
  });
  const { data: claims = [] } = useQuery({
    queryKey: claimsKey,
    queryFn: () => fetchClaims(tripId),
  });

  const addMut = useMutation({
    mutationFn: (title: string) =>
      insertItem({
        trip_id: tripId,
        list_type: listType,
        title,
        created_by_family_id: currentFamilyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey });
      qc.invalidateQueries({ queryKey: claimsKey });
    },
  });

  const claimMut = useMutation({
    mutationFn: ({ id, claimed }: { id: string; claimed: boolean }) =>
      toggleClaim(id, currentFamilyId, claimed),
    onSuccess: () => qc.invalidateQueries({ queryKey: claimsKey }),
  });

  const [dupState, setDupState] = useState<{ existingId: string; existingTitle: string; newTitle: string } | null>(null);

  const handleAdd = async (title: string) => {
    const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), title);
    if (dup) {
      setDupState({ existingId: dup.id, existingTitle: dup.title, newTitle: title });
      return;
    }
    await addMut.mutateAsync(title);
  };

  const handleMerge = async () => {
    if (!dupState) return;
    await toggleClaim(dupState.existingId, currentFamilyId, true);
    qc.invalidateQueries({ queryKey: claimsKey });
    setDupState(null);
  };

  const handleKeepBoth = async () => {
    if (!dupState) return;
    await addMut.mutateAsync(dupState.newTitle);
    setDupState(null);
  };

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
  const famById = new Map(families.map(f => [f.id, f] as const));

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <span className="mono-tag text-muted-foreground">
          общий список · {items.length}
        </span>
        {items.length > 0 && (
          <span className="mono-tag text-muted-foreground">
            {items.filter(i => (claimsByItem.get(i.id) ?? []).length === 0).length} без хозяина
          </span>
        )}
      </div>

      <AddItemForm onAdd={handleAdd} />

      {items.length === 0 && (
        <p className="mono-tag text-muted-foreground py-8">
          пусто · добавь первый пункт
        </p>
      )}

      <ul className="md:grid md:grid-cols-2 md:gap-x-10">
        {items.map((item, idx) => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;

          return (
            <li
              key={item.id}
              className={`group hairline-b ${idx === 0 ? 'hairline-t md:[&:nth-child(2)]:hairline-t' : ''} py-4 flex items-center gap-4`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-base ink leading-tight truncate">{item.title}</p>
                <div className="mt-2 flex items-center gap-2 min-h-[20px]">
                  {noOne ? (
                    <span className="mono-tag text-destructive">свободно</span>
                  ) : (
                    <div className="flex -space-x-1.5">
                      {itemClaims.map(c => {
                        const f = famById.get(c.family_id);
                        return f ? <FamilyBadge key={c.id} family={f} size={18} /> : null;
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => claimMut.mutate({ id: item.id, claimed: !iTake })}
                  className={`mono-tag px-3 py-2 rounded-full transition-colors ${
                    iTake
                      ? 'border border-[var(--rule)] text-foreground hover:bg-foreground/[0.04]'
                      : 'bg-foreground text-background hover:bg-foreground/90'
                  }`}
                >
                  {iTake ? 'я не беру' : 'беру я'}
                </button>
                <button
                  onClick={() => delMut.mutate(item.id)}
                  aria-label="Удалить пункт"
                  className="mono-tag text-muted-foreground hover:text-destructive transition-colors px-2 py-2"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {dupState && (
        <DuplicateDialog
          open={!!dupState}
          existingTitle={dupState.existingTitle}
          newTitle={dupState.newTitle}
          onMerge={handleMerge}
          onKeepBoth={handleKeepBoth}
          onCancel={() => setDupState(null)}
        />
      )}
    </div>
  );
}
