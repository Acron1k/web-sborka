'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FamilyBadge } from '@/components/family-badge';
import { fetchItems, fetchClaims, insertItem, deleteItem, toggleClaim } from '@/lib/queries/items';
import type { Family, ItemClaim, ListType } from '@/lib/db/types';
import { AddItemForm } from './add-item-form';

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

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
  const famById = new Map(families.map(f => [f.id, f] as const));

  return (
    <div>
      <AddItemForm onAdd={async t => { await addMut.mutateAsync(t); }} />

      {items.length === 0 && <p className="text-slate-500 text-sm">Пока пусто. Добавь первый пункт.</p>}

      <div className="space-y-2">
        {items.map(item => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;

          return (
            <Card key={item.id} className={`p-3 ${noOne ? 'border-red-300' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  {noOne ? (
                    <p className="text-xs text-red-600 mt-0.5">никто не берёт</p>
                  ) : (
                    <div className="flex gap-1 mt-1.5">
                      {itemClaims.map(c => {
                        const f = famById.get(c.family_id);
                        return f ? <FamilyBadge key={c.id} family={f} size={20} /> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={iTake ? 'secondary' : 'default'}
                    onClick={() => claimMut.mutate({ id: item.id, claimed: !iTake })}
                  >
                    {iTake ? 'Я не беру' : 'Беру я'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>🗑</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
