'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';
import { slugify } from '@/lib/slugify';
import { FAMILY_COLORS } from '@/lib/colors';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [families, setFamilies] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFamily = (i: number, v: string) => {
    const next = [...families];
    next[i] = v;
    setFamilies(next);
  };

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) return setError('Введи название поездки');
    const cleanFamilies = families.map(f => f.trim()).filter(Boolean);
    if (cleanFamilies.length < 2) return setError('Нужно минимум 2 семьи');

    setLoading(true);
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .insert({ slug, name: name.trim(), starts_on: startsOn || null, ends_on: endsOn || null })
      .select()
      .single();

    if (tripErr || !trip) {
      setError(tripErr?.message ?? 'Ошибка создания поездки');
      setLoading(false);
      return;
    }

    const familiesPayload = cleanFamilies.map((fname, i) => ({
      trip_id: trip.id,
      name: fname,
      color: FAMILY_COLORS[i % FAMILY_COLORS.length],
      position: i,
    }));
    const { error: famErr } = await supabase.from('families').insert(familiesPayload);
    if (famErr) {
      setError(famErr.message);
      setLoading(false);
      return;
    }

    router.push(`/t/${slug}/join`);
  };

  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <h1 className="text-2xl font-bold mb-1">🏕️ Сборы в поход</h1>
      <p className="text-slate-600 mb-2">Заведи поездку и зови друзей по ссылке</p>
      <p className="text-xs text-slate-500 mb-4">
        Уже есть поездка? Открой ссылку, которую дал тебе организатор.
      </p>

      <Card className="p-4 space-y-4">
        <div>
          <Label htmlFor="name">Название поездки</Label>
          <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Шашлыки на майские" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="starts">Старт</Label>
            <Input id="starts" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ends">Финиш</Label>
            <Input id="ends" type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Семьи (минимум 2)</Label>
          <div className="space-y-2 mt-2">
            {families.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ background: FAMILY_COLORS[i % FAMILY_COLORS.length] }}
                />
                <Input value={f} onChange={e => updateFamily(i, e.target.value)} placeholder={`Семья ${i + 1}`} />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button className="w-full" onClick={handleCreate} disabled={loading}>
          {loading ? 'Создаём…' : 'Создать поездку'}
        </Button>
      </Card>
    </main>
  );
}
