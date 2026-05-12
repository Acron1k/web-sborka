'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
      <p className="text-sm text-slate-600 mb-1">Список семьи {familyName}</p>
      {total > 0 && (
        <div className="mb-3">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-slate-500 mt-1">{done} из {total} упаковано</p>
        </div>
      )}

      <AddItemForm
        onAdd={async t => { await addMut.mutateAsync(t); }}
        placeholder="Например: Тёплые носки"
      />

      {items.length === 0 && <p className="text-slate-500 text-sm">Пока пусто.</p>}

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id} className="p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={item.is_done}
                onCheckedChange={(v) => doneMut.mutate({ id: item.id, done: v })}
              />
              <p className={`flex-1 ${item.is_done ? 'line-through text-slate-400' : ''}`}>
                {item.title}
              </p>
              <Button size="sm" variant="ghost" onClick={() => delMut.mutate(item.id)}>🗑</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
