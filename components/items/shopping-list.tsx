'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchShoppingItems } from '@/lib/queries/shopping';
import {
  insertItemWithClaims,
  deleteItem,
  toggleClaim,
  updateItem,
  markPurchasedByCurrentFamily,
} from '@/lib/queries/items';
import { ItemRow } from './item-row';
import { AddItemForm } from './add-item-form';
import type { Family, Item, ItemClaim, ListType } from '@/lib/db/types';

type StatusFilter = 'all' | 'pending' | 'purchased';
type TypeFilter = 'all' | 'common' | 'food';

type ShoppingData = { items: Item[]; claims: ItemClaim[] };

export function ShoppingList({
  tripId,
  families,
  myFamilyId,
}: {
  tripId: string;
  families: Family[];
  myFamilyId: string;
}) {
  const qc = useQueryClient();
  const key = ['shopping', tripId];

  const { data = { items: [], claims: [] } } = useQuery<ShoppingData>({
    queryKey: key,
    queryFn: () => fetchShoppingItems(tripId),
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['shopping', tripId] });
    qc.invalidateQueries({ queryKey: ['items', tripId] });
    qc.invalidateQueries({ queryKey: ['claims', tripId] });
    qc.invalidateQueries({ queryKey: ['packing', tripId] });
  };

  // Add — non-optimistic (server generates id). Just invalidate on success.
  const addMut = useMutation({
    mutationFn: async ({
      title,
      list,
      claimedBy,
    }: {
      title: string;
      list: ListType;
      claimedBy: string[];
    }) =>
      insertItemWithClaims(
        {
          trip_id: tripId,
          list_type: list,
          title,
          needs_purchase: true,
          created_by_family_id: myFamilyId,
        },
        claimedBy
      ),
    onSuccess: invalidateAll,
  });

  // Purchase — toggles is_purchased flag on existing claim OR creates new claim.
  // Optimistic: patch flag if claim exists, else insert temp claim.
  const purchaseMut = useMutation({
    mutationFn: ({ itemId, purchased }: { itemId: string; purchased: boolean }) =>
      markPurchasedByCurrentFamily(itemId, myFamilyId, purchased),
    onMutate: async ({ itemId, purchased }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ShoppingData>(key);
      qc.setQueryData<ShoppingData>(key, old => {
        if (!old) return old;
        const myExisting = old.claims.find(
          c => c.item_id === itemId && c.family_id === myFamilyId
        );
        if (myExisting) {
          return {
            ...old,
            claims: old.claims.map(c =>
              c.id === myExisting.id ? { ...c, is_purchased: purchased } : c
            ),
          };
        }
        // No claim yet — insert optimistic one with temp id.
        const tempClaim: ItemClaim = {
          id: `temp-${crypto.randomUUID()}`,
          item_id: itemId,
          family_id: myFamilyId,
          is_packed: false,
          is_purchased: purchased,
          claimed_at: new Date().toISOString(),
        };
        return { ...old, claims: [...old.claims, tempClaim] };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  // Claim toggle — add/remove my claim for item.
  const claimMut = useMutation({
    mutationFn: ({ itemId, claimed }: { itemId: string; claimed: boolean }) =>
      toggleClaim(itemId, myFamilyId, claimed),
    onMutate: async ({ itemId, claimed }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ShoppingData>(key);
      qc.setQueryData<ShoppingData>(key, old => {
        if (!old) return old;
        if (claimed) {
          // Add temp claim
          const tempClaim: ItemClaim = {
            id: `temp-${crypto.randomUUID()}`,
            item_id: itemId,
            family_id: myFamilyId,
            is_packed: false,
            is_purchased: false,
            claimed_at: new Date().toISOString(),
          };
          return { ...old, claims: [...old.claims, tempClaim] };
        }
        return {
          ...old,
          claims: old.claims.filter(
            c => !(c.item_id === itemId && c.family_id === myFamilyId)
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateItem>[1] }) =>
      updateItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ShoppingData>(key);
      qc.setQueryData<ShoppingData>(key, old => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map(i => (i.id === id ? { ...i, ...patch } : i)),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ShoppingData>(key);
      qc.setQueryData<ShoppingData>(key, old => {
        if (!old) return old;
        return {
          items: old.items.filter(i => i.id !== id),
          claims: old.claims.filter(c => c.item_id !== id),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidateAll,
  });

  const claimsByItem = useMemo(() => {
    const map = new Map<string, ItemClaim[]>();
    for (const c of data.claims) {
      const arr = map.get(c.item_id) ?? [];
      arr.push(c);
      map.set(c.item_id, arr);
    }
    return map;
  }, [data.claims]);

  const filtered = useMemo(() => {
    return data.items.filter(item => {
      const itemClaims = claimsByItem.get(item.id) ?? [];
      const purchased = itemClaims.some(c => c.is_purchased);
      if (statusFilter === 'pending' && purchased) return false;
      if (statusFilter === 'purchased' && !purchased) return false;
      if (typeFilter !== 'all' && item.list_type !== typeFilter) return false;
      return true;
    });
  }, [data.items, claimsByItem, statusFilter, typeFilter]);

  const total = data.items.length;
  const purchased = data.items.filter(i =>
    (claimsByItem.get(i.id) ?? []).some(c => c.is_purchased)
  ).length;
  const pct = total === 0 ? 0 : Math.round((purchased / total) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="mono-tag text-muted-foreground">закупка</span>
          <span className="mono-tag text-muted-foreground">
            {purchased} / {total} куплено
          </span>
        </div>
        <div className="h-px bg-[var(--rule)] relative">
          <div
            className="absolute left-0 top-0 h-px bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'purchased'] as const).map(s => {
          const labels = { all: 'всё', pending: 'не куплено', purchased: 'куплено' } as const;
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 h-7 text-xs rounded-full border transition-colors ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-[var(--rule)] hover:border-foreground'
              }`}
            >
              {labels[s]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'common', 'food'] as const).map(t => {
          const labels = { all: 'все', common: 'общее', food: 'еда' } as const;
          const active = typeFilter === t;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 h-7 text-xs rounded-full border transition-colors ${
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-[var(--rule)] hover:border-foreground'
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Add form */}
      <div className="space-y-2">
        <p className="mono-tag text-muted-foreground">добавить в закупку</p>
        <AddItemForm
          onAdd={async (title, claimedBy) => {
            await addMut.mutateAsync({ title, list: 'common', claimedBy });
          }}
          families={families}
          placeholder="Уголь, фольга, ТБ..."
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="mono-tag text-muted-foreground py-8">
          {total === 0
            ? 'пока пусто. добавь расходники в общее или продукты с галкой «надо купить»'
            : 'ничего под фильтром'}
        </p>
      ) : (
        <ul>
          {filtered.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              claims={claimsByItem.get(item.id) ?? []}
              families={families}
              myFamilyId={myFamilyId}
              mode="shopping"
              showCategory={item.list_type === 'food'}
              onToggleClaim={() =>
                claimMut.mutate({
                  itemId: item.id,
                  claimed: !(claimsByItem.get(item.id) ?? []).some(
                    c => c.family_id === myFamilyId
                  ),
                })
              }
              onTogglePurchased={() => {
                const myClaim = (claimsByItem.get(item.id) ?? []).find(
                  c => c.family_id === myFamilyId
                );
                const newVal = !myClaim?.is_purchased;
                purchaseMut.mutate({ itemId: item.id, purchased: newVal });
              }}
              onUpdate={(patch) => updateMut.mutate({ id: item.id, patch })}
              onDelete={() => delMut.mutate(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
