'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AddItemForm } from './add-item-form';
import { ClaimedReadonlyRow } from './claimed-readonly-row';
import { DeleteConfirm } from './delete-confirm';
import {
  fetchPersonalItems,
  fetchClaimedItemsForFamily,
  insertItem,
  deleteItem,
  togglePersonalDone,
  toggleClaimPacked,
  updateItem,
} from '@/lib/queries/items';
import type { Family, Item, ItemClaim } from '@/lib/db/types';

type Props = {
  tripId: string;
  familyId: string;
  familyName: string;
  families: Family[];
};

type PackingData = {
  items: Item[];
  myClaims: ItemClaim[];
  allClaims: ItemClaim[];
};

export function PackingList({ tripId, familyId, familyName, families }: Props) {
  const qc = useQueryClient();

  const personalKey = ['items', tripId, 'personal', familyId];
  const packingKey = ['packing', tripId, familyId];

  const { data: personalItems = [] } = useQuery({
    queryKey: personalKey,
    queryFn: () => fetchPersonalItems(tripId, familyId),
  });

  const { data: packing = { items: [], myClaims: [], allClaims: [] } } = useQuery<PackingData>({
    queryKey: packingKey,
    queryFn: () => fetchClaimedItemsForFamily(tripId, familyId),
  });

  const itemById = new Map(packing.items.map(i => [i.id, i] as const));
  const famById = new Map(families.map(f => [f.id, f] as const));

  type Row = { claim: ItemClaim; item: Item };

  const commonRows: Row[] = packing.myClaims
    .map(c => ({ claim: c, item: itemById.get(c.item_id) }))
    .filter((r): r is Row => !!r.item && r.item.list_type === 'common');

  const foodRows: Row[] = packing.myClaims
    .map(c => ({ claim: c, item: itemById.get(c.item_id) }))
    .filter((r): r is Row => !!r.item && r.item.list_type === 'food');

  const otherFamiliesFor = (itemId: string): Family[] =>
    packing.allClaims
      .filter(c => c.item_id === itemId && c.family_id !== familyId)
      .map(c => famById.get(c.family_id))
      .filter((f): f is Family => !!f);

  // Progress
  const totalPersonal = personalItems.length;
  const donePersonal = personalItems.filter(i => i.is_done).length;
  const totalCommon = commonRows.length;
  const doneCommon = commonRows.filter(r => r.claim.is_packed).length;
  const totalFood = foodRows.length;
  const doneFood = foodRows.filter(r => r.claim.is_packed).length;
  const allTotal = totalPersonal + totalCommon + totalFood;
  const allDone = donePersonal + doneCommon + doneFood;
  const pct = allTotal === 0 ? 0 : Math.round((allDone / allTotal) * 100);

  // ── Mutations (optimistic) ─────────────────────────────────────────────

  const togglePersonalMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      togglePersonalDone(id, done),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: personalKey });
      const prev = qc.getQueryData<Item[]>(personalKey);
      qc.setQueryData<Item[]>(personalKey, old =>
        (old ?? []).map(i => (i.id === id ? { ...i, is_done: done } : i))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(personalKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: personalKey }),
  });

  const addPersonalMut = useMutation({
    mutationFn: (title: string) =>
      insertItem({
        trip_id: tripId,
        list_type: 'personal',
        title,
        family_id: familyId,
        created_by_family_id: familyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: personalKey }),
  });

  const delPersonalMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: personalKey });
      const prev = qc.getQueryData<Item[]>(personalKey);
      qc.setQueryData<Item[]>(personalKey, old => (old ?? []).filter(i => i.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(personalKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: personalKey }),
  });

  const updatePersonalMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateItem(id, { title }),
    onMutate: async ({ id, title }) => {
      await qc.cancelQueries({ queryKey: personalKey });
      const prev = qc.getQueryData<Item[]>(personalKey);
      qc.setQueryData<Item[]>(personalKey, old =>
        (old ?? []).map(i => (i.id === id ? { ...i, title } : i))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(personalKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: personalKey }),
  });

  const togglePackedMut = useMutation({
    mutationFn: ({ id, packed }: { id: string; packed: boolean }) =>
      toggleClaimPacked(id, packed),
    onMutate: async ({ id, packed }) => {
      await qc.cancelQueries({ queryKey: packingKey });
      const prev = qc.getQueryData<PackingData>(packingKey);
      qc.setQueryData<PackingData>(packingKey, old => {
        if (!old) return old;
        return {
          ...old,
          myClaims: old.myClaims.map(c =>
            c.id === id ? { ...c, is_packed: packed } : c
          ),
          allClaims: old.allClaims.map(c =>
            c.id === id ? { ...c, is_packed: packed } : c
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(packingKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: packingKey }),
  });

  // ── UI state ───────────────────────────────────────────────────────────

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  const startEdit = (item: Item) => {
    setEditingId(item.id);
    setEditValue(item.title);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 lg:gap-y-12 space-y-12 lg:space-y-0">
      {/* Header + overall progress (full width) */}
      <div className="lg:col-span-2">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">
            сборы · {familyName}
          </span>
          <span className="mono-tag text-muted-foreground">
            {allDone} / {allTotal} упаковано
          </span>
        </div>
        <div className="relative h-px bg-[var(--rule)]" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Section 01 — Моё личное (left column on desktop, spans both rows) */}
      <section className="lg:row-span-2 lg:col-start-1">
        <div className="hairline-b pb-2 mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="mono-tag text-muted-foreground">01</span>
            <h2 className="display text-2xl ink leading-none">Моё личное</h2>
          </div>
          <span className="mono-tag text-muted-foreground">
            {donePersonal} / {totalPersonal}
          </span>
        </div>

        <AddItemForm
          onAdd={async t => {
            await addPersonalMut.mutateAsync(t);
          }}
          placeholder="Например: Тёплые носки"
        />

        {personalItems.length === 0 ? (
          <p className="mono-tag text-muted-foreground py-4">пусто</p>
        ) : (
          <ul>
            {personalItems.map(item => {
              const isEditing = editingId === item.id;
              return (
                <li
                  key={item.id}
                  className="group hairline-b first:hairline-t py-3"
                >
                  {isEditing ? (
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        const v = editValue.trim();
                        if (!v) return;
                        updatePersonalMut.mutate({ id: item.id, title: v });
                        cancelEdit();
                      }}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="editorial-input h-9 text-base flex-1"
                      />
                      <button
                        type="submit"
                        className="mono-tag text-primary hover:text-foreground px-2 py-2"
                      >
                        сохр.
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="mono-tag text-muted-foreground hover:text-foreground px-2 py-2"
                      >
                        отмена
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={item.is_done}
                        onCheckedChange={v =>
                          togglePersonalMut.mutate({ id: item.id, done: !!v })
                        }
                        className="shrink-0 rounded-sm border-[var(--rule)] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                      />
                      <p
                        className={`flex-1 text-base leading-tight transition-colors ${
                          item.is_done
                            ? 'line-through text-muted-foreground'
                            : 'ink'
                        }`}
                      >
                        {item.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(item)}
                          aria-label="Редактировать пункт"
                          className="mono-tag text-muted-foreground hover:text-foreground transition-colors px-2 py-2"
                        >
                          ред.
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          aria-label="Удалить пункт"
                          className="mono-tag text-muted-foreground hover:text-destructive transition-colors px-2 py-2"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Section 02 — Общее за нами */}
      <section className="lg:col-start-2 lg:row-start-2">
        <div className="hairline-b pb-2 mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="mono-tag text-muted-foreground">02</span>
            <h2 className="display text-2xl ink leading-none">Общее за нами</h2>
          </div>
          <span className="mono-tag text-muted-foreground">
            {doneCommon} / {totalCommon}
          </span>
        </div>
        {commonRows.length === 0 ? (
          <p className="mono-tag text-muted-foreground py-4">
            никаких пунктов на нас
          </p>
        ) : (
          <ul>
            {commonRows.map(({ item, claim }) => (
              <ClaimedReadonlyRow
                key={claim.id}
                item={item}
                claim={claim}
                otherFamilies={otherFamiliesFor(item.id)}
                onTogglePacked={(id, packed) =>
                  togglePackedMut.mutate({ id, packed })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Section 03 — Продукты за нами */}
      <section className="lg:col-start-2 lg:row-start-3">
        <div className="hairline-b pb-2 mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="mono-tag text-muted-foreground">03</span>
            <h2 className="display text-2xl ink leading-none">Продукты за нами</h2>
          </div>
          <span className="mono-tag text-muted-foreground">
            {doneFood} / {totalFood}
          </span>
        </div>
        {foodRows.length === 0 ? (
          <p className="mono-tag text-muted-foreground py-4">
            никаких пунктов на нас
          </p>
        ) : (
          <ul>
            {foodRows.map(({ item, claim }) => (
              <ClaimedReadonlyRow
                key={claim.id}
                item={item}
                claim={claim}
                otherFamilies={otherFamiliesFor(item.id)}
                onTogglePacked={(id, packed) =>
                  togglePackedMut.mutate({ id, packed })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Delete confirm dialog */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={v => !v && setDeleteTarget(null)}
        itemTitle={deleteTarget?.title ?? ''}
        onConfirm={() => {
          if (deleteTarget) delPersonalMut.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
