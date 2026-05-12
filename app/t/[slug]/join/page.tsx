'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { setFamilyCookie } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function JoinPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
  });

  if (isLoading) return <main className="p-4">Загрузка…</main>;
  if (!data) return <main className="p-4">Поездка не найдена</main>;

  const { trip, families } = data;

  const choose = (familyId: string) => {
    setFamilyCookie(slug, familyId);
    router.push(`/t/${slug}`);
  };

  return (
    <main className="mx-auto max-w-md p-4 pt-8">
      <h1 className="text-2xl font-bold mb-1">{trip.name}</h1>
      <p className="text-slate-600 mb-6">Выбери свою семью</p>

      <div className="grid gap-3">
        {families.map(f => (
          <Card key={f.id} className="p-0 overflow-hidden">
            <Button
              variant="ghost"
              className="w-full h-16 justify-start text-base px-4"
              onClick={() => choose(f.id)}
            >
              <span
                className="h-6 w-6 rounded-full mr-3 shrink-0"
                style={{ background: f.color }}
              />
              {f.name}
            </Button>
          </Card>
        ))}
      </div>
    </main>
  );
}
