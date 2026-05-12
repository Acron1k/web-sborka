'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { fetchItems, fetchClaims } from '@/lib/queries/items';
import { useCurrentFamily } from '@/lib/session-client';
import { clearFamilyCookie } from '@/lib/session';
import { AIBlock } from '@/components/settings/ai-block';
import { buildExport, type AISuggestion } from '@/lib/ai-format';

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const qc = useQueryClient();
  const familyId = useCurrentFamily(slug);

  const { data: tripData } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
    enabled: familyId !== 'loading',
  });
  const { data: common = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'common'],
    queryFn: () => fetchItems(tripData!.trip.id, 'common'),
    enabled: !!tripData,
  });
  const { data: personal = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'personal'],
    queryFn: () => fetchItems(tripData!.trip.id, 'personal'),
    enabled: !!tripData,
  });
  const { data: food = [] } = useQuery({
    queryKey: ['items', tripData?.trip.id, 'food'],
    queryFn: () => fetchItems(tripData!.trip.id, 'food'),
    enabled: !!tripData,
  });
  const { data: claims = [] } = useQuery({
    queryKey: ['claims', tripData?.trip.id],
    queryFn: () => fetchClaims(tripData!.trip.id),
    enabled: !!tripData,
  });

  const [copied, setCopied] = useState(false);

  if (!tripData) return <main className="p-4">Загрузка…</main>;
  const { trip, families } = tripData;
  const allItems = [...common, ...personal, ...food];
  const exportData = buildExport(trip, families, allItems, claims);
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${slug}` : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const switchFamily = () => {
    clearFamilyCookie(slug);
    router.push(`/t/${slug}/join`);
  };

  const importSuggestions = async (sugs: AISuggestion[]) => {
    const myId = familyId as string;
    const payload = sugs.map(s => ({
      trip_id: trip.id,
      list_type: s.list,
      title: s.title,
      qty: s.qty ?? null,
      category: s.list === 'food' ? (s.category ?? 'other') : null,
      family_id: s.list === 'personal' ? myId : null,
      created_by_family_id: myId,
      notes: null,
      is_done: false,
    }));
    const { error } = await supabase.from('items').insert(payload);
    if (error) {
      console.error(error);
      return;
    }
    qc.invalidateQueries({ queryKey: ['items'] });
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center gap-2">
        <button onClick={() => router.push(`/t/${slug}`)} className="text-slate-600">← Назад</button>
        <h1 className="text-xl font-bold">Настройки</h1>
      </header>

      <Card className="p-4">
        <Label>Название поездки</Label>
        <p className="font-medium">{trip.name}</p>
        <p className="text-sm text-slate-500 mt-1">
          {trip.starts_on || '?'} — {trip.ends_on || '?'}
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <Label>Ссылка для друзей</Label>
        <div className="flex gap-2">
          <Input value={inviteUrl} readOnly />
          <Button onClick={copyLink}>{copied ? '✓' : 'Копировать'}</Button>
        </div>
        <p className="text-xs text-slate-500">Друзья откроют ссылку, выберут свою семью.</p>
      </Card>

      <Card className="p-4">
        <Label>Семьи</Label>
        <div className="space-y-2 mt-2">
          {families.map(f => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full shrink-0" style={{ background: f.color }} />
              <span className="flex-1">{f.name}</span>
              {f.id === familyId && <span className="text-xs text-slate-500">это ты</span>}
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-3" onClick={switchFamily}>Сменить мою семью</Button>
      </Card>

      <AIBlock exportData={exportData} onImport={importSuggestions} />
    </main>
  );
}
