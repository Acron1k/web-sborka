'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { AddItemForm } from './add-item-form';
import {
  fetchPersonalItems,
  insertItem,
  deleteItem,
  togglePersonalDone,
} from '@/lib/queries/items';

export function PersonalList({
  tripId,
  familyId,
  familyName,
}: {
  tripId: string;
  familyId: string;
  familyName: string;
}) {
  const qc = useQueryClient();
  const key = ['items', tripId, 'personal', familyId];

  const { data: items = [] } = useQuery({
    queryKey: key,
    queryFn: () => fetchPersonalItems(tripId, familyId),
  });

  const addMut = useMutation({
    mutationFn: (title: string) =>
      insertItem({
        trip_id: tripId,
        list_type: 'personal',
        title,
        family_id: familyId,
        created_by_family_id: familyId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const doneMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => togglePersonalDone(id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const done = items.filter(i => i.is_done).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      {/* Heading + progress: full width even inside grid */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">
            личное · {familyName}
          </span>
          {total > 0 && (
            <span className="mono-tag text-muted-foreground">
              {done} / {total} упаковано
            </span>
          )}
        </div>

        {total > 0 && (
          <div className="relative h-px bg-[var(--rule)]" aria-hidden="true">
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <AddItemForm
        onAdd={async t => { await addMut.mutateAsync(t); }}
        placeholder="Например: Тёплые носки"
      />

      {items.length === 0 && (
        <p className="mono-tag text-muted-foreground py-8">
          пусто · добавь личную вещь
        </p>
      )}

      <ul className="md:grid md:grid-cols-2 md:gap-x-10">
        {items.map((item, idx) => (
          <li
            key={item.id}
            className={`group hairline-b ${idx === 0 ? 'hairline-t md:[&:nth-child(2)]:hairline-t' : ''} py-4 flex items-center gap-4`}
          >
            <Checkbox
              checked={item.is_done}
              onCheckedChange={(v) => doneMut.mutate({ id: item.id, done: !!v })}
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
            <button
              onClick={() => delMut.mutate(item.id)}
              aria-label="Удалить пункт"
              className="mono-tag text-muted-foreground hover:text-destructive transition-colors opacity-60 group-hover:opacity-100 px-2 py-2"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
