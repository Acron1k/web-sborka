'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  fetchItems,
  fetchClaims,
  insertItemWithClaims,
  deleteItem,
  toggleClaim,
  updateItem,
} from '@/lib/queries/items';
import { findDuplicate } from '@/lib/duplicate';
import { DuplicateDialog } from './duplicate-dialog';
import { ItemRow } from './item-row';
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
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [needsPurchase, setNeedsPurchase] = useState(true);
  const [dupState, setDupState] = useState<{
    existing: Item;
    newTitle: string;
    newQty: string;
    newCat: Category;
    claimedBy: string[];
    needsPurchase: boolean;
  } | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    queryFn: () => fetchItems(tripId, 'food'),
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
    mutationFn: (p: {
      title: string;
      qty: string;
      category: Category;
      claimedBy: string[];
      needsPurchase: boolean;
    }) =>
      insertItemWithClaims(
        {
          trip_id: tripId,
          list_type: 'food',
          title: p.title,
          qty: p.qty || null,
          category: p.category,
          needs_purchase: p.needsPurchase,
          created_by_family_id: currentFamilyId,
        },
        p.claimedBy
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

  const resetAddForm = () => {
    setTitle('');
    setQty('');
    setSelectedFamilies([]);
    setNeedsPurchase(true);
  };

  const handleAdd = async () => {
    const t = title.trim();
    if (!t) return;
    const dup = findDuplicate(items.map(i => ({ id: i.id, title: i.title })), t);
    if (dup) {
      const existing = items.find(i => i.id === dup.id);
      if (existing) {
        setDupState({
          existing,
          newTitle: t,
          newQty: qty,
          newCat: category,
          claimedBy: selectedFamilies,
          needsPurchase,
        });
        return;
      }
    }
    await addMut.mutateAsync({
      title: t,
      qty,
      category,
      claimedBy: selectedFamilies,
      needsPurchase,
    });
    resetAddForm();
  };

  const claimsByItem = new Map<string, ItemClaim[]>();
  for (const c of claims) {
    const arr = claimsByItem.get(c.item_id) ?? [];
    arr.push(c);
    claimsByItem.set(c.item_id, arr);
  }
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
      <div className="mb-6">
        <div className="space-y-4 sm:space-y-0 sm:flex sm:items-end sm:gap-4">
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

        {families.length > 0 && (
          <div className="mt-3">
            <p className="mono-tag text-muted-foreground mb-2">назначить (опционально):</p>
            <div className="flex flex-wrap gap-2">
              {families.map(f => {
                const active = selectedFamilies.includes(f.id);
                return (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() =>
                      setSelectedFamilies(prev =>
                        active ? prev.filter(id => id !== f.id) : [...prev, f.id]
                      )
                    }
                    className={`flex items-center gap-2 px-3 h-8 rounded-full border transition-colors ${
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-[var(--rule)] hover:border-foreground'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ background: f.color }}
                    />
                    <span className="text-sm">{f.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Checkbox
            checked={needsPurchase}
            onCheckedChange={v => setNeedsPurchase(!!v)}
            className="rounded-sm border-[var(--rule)] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
          />
          <span>надо купить</span>
        </label>
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
        {filtered.map(item => {
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
              showCategory
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
          existingTitle={dupState.existing.title}
          newTitle={dupState.newTitle}
          onMerge={async () => {
            await toggleClaim(dupState.existing.id, currentFamilyId, true);
            qc.invalidateQueries({ queryKey: claimsKey });
            qc.invalidateQueries({ queryKey: ['shopping', tripId] });
            qc.invalidateQueries({ queryKey: ['packing', tripId] });
            setDupState(null);
            resetAddForm();
          }}
          onKeepBoth={async () => {
            await addMut.mutateAsync({
              title: dupState.newTitle,
              qty: dupState.newQty,
              category: dupState.newCat,
              claimedBy: dupState.claimedBy,
              needsPurchase: dupState.needsPurchase,
            });
            setDupState(null);
            resetAddForm();
          }}
          onCancel={() => setDupState(null)}
        />
      )}
    </div>
  );
}
