'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { FamilyBadge } from '@/components/family-badge';
import {
  fetchItems,
  fetchClaims,
  insertItem,
  deleteItem,
  toggleClaim,
} from '@/lib/queries/items';
import { findDuplicate } from '@/lib/duplicate';
import { DuplicateDialog } from './duplicate-dialog';
import type { Family, Item, ItemClaim, Category } from '@/lib/db/types';

const CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'все' },
  { value: 'meat', label: 'мясо' },
  { value: 'veg', label: 'овощи' },
  { value: 'drinks', label: 'напитки' },
  { value: 'snacks', label: 'перекус' },
  { value: 'other', label: 'прочее' },
];

export function FoodList({
  tripId,
  families,
  currentFamilyId,
}: {
  tripId: string;
  families: Family[];
  currentFamilyId: string;
}) {
  const qc = useQueryClient();
  const itemsKey = ['items', tripId, 'food'];
  const claimsKey = ['claims', tripId];

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [category, setCategory] = useState<Category>('meat');
  const [dupState, setDupState] = useState<{
    existing: Item;
    newTitle: string;
    newQty: string;
    newCat: Category;
  } | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: () => fetchItems(tripId, 'food'),
  });
  const { data: claims = [] } = useQuery({
    queryKey: claimsKey,
    queryFn: () => fetchClaims(tripId),
  });

  const addMut = useMutation({
    mutationFn: (p: { title: string; qty: string; category: Category }) =>
      insertItem({
        trip_id: tripId,
        list_type: 'food',
        title: p.title,
        qty: p.qty || null,
        category: p.category,
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

  const handleAdd = async () => {
    const t = title.trim();
    if (!t) return;
    const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), t);
    if (dup) {
      const existing = items.find(i => i.id === dup.id);
      if (existing) {
        setDupState({ existing, newTitle: t, newQty: qty, newCat: category });
        return;
      }
    }
    await addMut.mutateAsync({ title: t, qty, category });
    setTitle('');
    setQty('');
  };

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
  const famById = new Map(families.map(f => [f.id, f] as const));
  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);
  const unclaimedCount = items.filter(i => (claimsByItem.get(i.id) ?? []).length === 0).length;

  return (
    <div>
      {/* Category strip — editorial scrollable nav */}
      <nav className="hairline-b mb-6 -mx-1">
        <div className="flex gap-1 overflow-x-auto px-1 pb-2 scrollbar-none">
          {CATEGORIES.map(c => {
            const active = filter === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setFilter(c.value)}
                className={`mono-tag whitespace-nowrap px-3 py-2 transition-colors ${
                  active
                    ? 'text-foreground border-b-2 border-foreground -mb-[2px]'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-[2px]'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Editorial add form */}
      <div className="mb-6 space-y-4 sm:space-y-0 sm:flex sm:items-end sm:gap-4">
        <div className="flex-1 min-w-0">
          <span className="mono-tag text-muted-foreground block mb-1">название</span>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Например: Мясо"
            className="editorial-input h-11 text-base placeholder:text-muted-foreground/60"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="flex items-end gap-3 sm:gap-4 shrink-0">
          <div className="w-24">
            <span className="mono-tag text-muted-foreground block mb-1">кол-во</span>
            <Input
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="5 кг"
              className="editorial-input h-11 text-base placeholder:text-muted-foreground/60"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="flex-1 sm:w-32 min-w-0">
            <span className="mono-tag text-muted-foreground block mb-1">кат.</span>
            <select
              className="editorial-input h-11 text-base bg-transparent w-full text-foreground"
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!title.trim()}
            aria-label="Добавить продукт"
            className="shrink-0 h-11 w-11 rounded-full bg-foreground text-background flex items-center justify-center text-xl leading-none transition-all hover:scale-[0.97] disabled:opacity-30 disabled:hover:scale-100"
          >
            +
          </button>
        </div>
      </div>

      {/* Summary as mono row */}
      {items.length > 0 && (
        <div className="mb-4 flex items-baseline gap-4">
          <span className="mono-tag text-muted-foreground">
            всего {items.length}
          </span>
          <span
            className={`mono-tag ${unclaimedCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            свободно {unclaimedCount}
          </span>
          {filter !== 'all' && (
            <span className="mono-tag text-muted-foreground ml-auto">
              в категории: {filtered.length}
            </span>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="mono-tag text-muted-foreground py-8">
          {items.length === 0 ? 'пусто · добавь первый продукт' : 'пусто в этой категории'}
        </p>
      )}

      <ul className="md:grid md:grid-cols-2 md:gap-x-10">
        {filtered.map((item, idx) => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;
          return (
            <li
              key={item.id}
              className={`group hairline-b ${idx === 0 ? 'hairline-t md:[&:nth-child(2)]:hairline-t' : ''} py-4 flex items-center gap-4`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-base ink leading-tight truncate">
                  {item.title}
                  {item.qty && (
                    <span className="text-muted-foreground font-normal"> · {item.qty}</span>
                  )}
                </p>
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
                  aria-label="Удалить продукт"
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
          existingTitle={dupState.existing.title}
          newTitle={dupState.newTitle}
          onMerge={async () => {
            await toggleClaim(dupState.existing.id, currentFamilyId, true);
            qc.invalidateQueries({ queryKey: claimsKey });
            setDupState(null);
            setTitle('');
            setQty('');
          }}
          onKeepBoth={async () => {
            await addMut.mutateAsync({
              title: dupState.newTitle,
              qty: dupState.newQty,
              category: dupState.newCat,
            });
            setDupState(null);
            setTitle('');
            setQty('');
          }}
          onCancel={() => setDupState(null)}
        />
      )}
    </div>
  );
}
