'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { useCurrentFamily } from '@/lib/session-client';
import { FamilyBadge } from '@/components/family-badge';
import { ItemsList } from '@/components/items/items-list';
import Link from 'next/link';

export default function TripPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const familyId = useCurrentFamily(slug);
  const [tab, setTab] = useState<'common' | 'personal' | 'food'>('common');

  const { data } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
    enabled: familyId !== 'loading',
  });

  if (familyId === 'loading' || !data) return <main className="p-4">Загрузка…</main>;

  const myFamily = data.families.find(f => f.id === familyId);

  return (
    <main className="mx-auto max-w-md">
      <header className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">{data.trip.name}</h1>
          {myFamily && (
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-0.5">
              <FamilyBadge family={myFamily} size={18} />
              <span>{myFamily.name}</span>
            </div>
          )}
        </div>
        <Link href={`/t/${slug}/settings`} className="text-slate-500 hover:text-slate-900 text-xl">⚙️</Link>
      </header>

      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full rounded-none border-b sticky top-[73px] z-10 bg-white">
          <TabsTrigger value="common">Общее</TabsTrigger>
          <TabsTrigger value="personal">Личное</TabsTrigger>
          <TabsTrigger value="food">Продукты</TabsTrigger>
        </TabsList>

        <TabsContent value="common" className="p-4">
          <ItemsList
            tripId={data.trip.id}
            listType="common"
            families={data.families}
            currentFamilyId={familyId as string}
          />
        </TabsContent>
        <TabsContent value="personal" className="p-4">
          <p className="text-slate-500">Личный список — будет в Task 9</p>
        </TabsContent>
        <TabsContent value="food" className="p-4">
          <p className="text-slate-500">Продукты — будет в Task 10</p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
