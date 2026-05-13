'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchItems,
  fetchClaims,
  insertItemWithClaims,
  deleteItem,
  toggleClaim,
  updateItem,
} from '@/lib/queries/items';
import type { Family, ItemClaim, ListType } from '@/lib/db/types';
import { AddItemForm } from './add-item-form';
import { ItemRow } from './item-row';
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

  const invalidateMutated = () => {
    qc.invalidateQueries({ queryKey: itemsKey });
    qc.invalidateQueries({ queryKey: claimsKey });
    qc.invalidateQueries({ queryKey: ['shopping', tripId] });
    qc.invalidateQueries({ queryKey: ['packing', tripId] });
  };

  const addMut = useMutation({
    mutationFn: ({
      title,
      claimedBy,
      needsPurchase,
    }: {
      title: string;
      claimedBy: string[];
      needsPurchase: boolean;
    }) =>
      insertItemWithClaims(
        {
          trip_id: tripId,
          list_type: listType,
          title,
          needs_purchase: needsPurchase,
          created_by_family_id: currentFamilyId,
        },
        claimedBy
      ),
    onSuccess: invalidateMutated,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: invalidateMutated,
  });

  const claimMut = useMutation({
    mutationFn: ({ id, claimed }: { id: string; claimed: boolean }) =>
      toggleClaim(id, currentFamilyId, claimed),
    onSuccess: invalidateMutated,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateItem>[1] }) =>
      updateItem(id, patch),
    onSuccess: invalidateMutated,
  });

  const [dupState, setDupState] = useState<{
    existingId: string;
    existingTitle: string;
    newTitle: string;
    claimedBy: string[];
    needsPurchase: boolean;
  } | null>(null);

  const handleAdd = async (title: string, claimedBy: string[], needsPurchase: boolean) => {
    const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), title);
    if (dup) {
      setDupState({
        existingId: dup.id,
        existingTitle: dup.title,
        newTitle: title,
        claimedBy,
        needsPurchase,
      });
      return;
    }
    await addMut.mutateAsync({ title, claimedBy, needsPurchase });
  };

  const handleMerge = async () => {
    if (!dupState) return;
    await toggleClaim(dupState.existingId, currentFamilyId, true);
    qc.invalidateQueries({ queryKey: claimsKey });
    qc.invalidateQueries({ queryKey: ['shopping', tripId] });
    qc.invalidateQueries({ queryKey: ['packing', tripId] });
    setDupState(null);
  };

  const handleKeepBoth = async () => {
    if (!dupState) return;
    await addMut.mutateAsync({
      title: dupState.newTitle,
      claimedBy: dupState.claimedBy,
      needsPurchase: dupState.needsPurchase,
    });
    setDupState(null);
  };

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }

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

      <AddItemForm
        onAdd={handleAdd}
        families={families}
        showPurchaseToggle
        defaultNeedsPurchase={false}
      />

      {items.length === 0 && (
        <p className="mono-tag text-muted-foreground py-8">
          пусто · добавь первый пункт
        </p>
      )}

      <ul className="md:grid md:grid-cols-2 md:gap-x-10">
        {items.map(item => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          return (
            <ItemRow
              key={item.id}
              item={item}
              claims={itemClaims}
              families={families}
              myFamilyId={currentFamilyId}
              mode="standard"
              showCategory={false}
              onToggleClaim={() => claimMut.mutate({ id: item.id, claimed: !iTake })}
              onUpdate={(patch) => updateMut.mutate({ id: item.id, patch })}
              onDelete={() => delMut.mutate(item.id)}
            />
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
