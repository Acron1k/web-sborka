'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FamilyBadge } from '@/components/family-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  { value: 'all', label: 'Все' },
  { value: 'meat', label: 'Мясо' },
  { value: 'veg', label: 'Овощи' },
  { value: 'drinks', label: 'Напитки' },
  { value: 'snacks', label: 'Перекус' },
  { value: 'other', label: 'Прочее' },
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
      <Tabs
        value={filter}
        onValueChange={v => setFilter(v as Category | 'all')}
        className="mb-3"
      >
        <TabsList className="flex w-full overflow-x-auto">
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.value} value={c.value} className="text-xs">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="p-3 mb-3 space-y-2">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Например: Мясо"
        />
        <div className="flex gap-2">
          <Input
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="5 кг"
            className="flex-1"
          />
          <select
            className="border rounded-md px-2 text-sm bg-white"
            value={category}
            onChange={e => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.filter(c => c.value !== 'all').map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Button onClick={handleAdd}>+</Button>
        </div>
      </Card>

      {items.length > 0 && (
        <div className="mb-3 p-3 bg-slate-100 rounded-md text-sm">
          Всего пунктов: <b>{items.length}</b>, без хозяина:{' '}
          <b className={unclaimedCount > 0 ? 'text-red-600' : ''}>{unclaimedCount}</b>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-slate-500 text-sm">Пока пусто в этой категории.</p>
      )}

      <div className="space-y-2">
        {filtered.map(item => {
          const itemClaims = claimsByItem.get(item.id) ?? [];
          const iTake = itemClaims.some(c => c.family_id === currentFamilyId);
          const noOne = itemClaims.length === 0;
          return (
            <Card key={item.id} className={`p-3 ${noOne ? 'border-red-300' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {item.title}
                    {item.qty && (
                      <span className="text-slate-500 font-normal"> · {item.qty}</span>
                    )}
                  </p>
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
                  <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>
                    🗑
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

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
