'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { setFamilyCookie } from '@/lib/session';
import { FamilyBadge } from '@/components/family-badge';

export default function JoinPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="mono-tag text-muted-foreground">Загрузка…</span>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="paper-grain min-h-screen relative flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <span className="mono-tag text-muted-foreground">№ 404 · промах</span>
          <h1 className="display ink text-5xl lg:text-7xl leading-[0.95] tracking-tight mt-3">
            Поездка{' '}
            <span className="display-italic text-primary">не&nbsp;найдена</span>
          </h1>
          <p className="text-base text-muted-foreground mt-5 leading-relaxed">
            Проверь ссылку у&nbsp;организатора — возможно, поездка ещё
            не&nbsp;создана или была удалена.
          </p>
        </div>
      </main>
    );
  }

  const { trip, families } = data;

  const choose = (familyId: string) => {
    setFamilyCookie(slug, familyId);
    router.push(`/t/${slug}`);
  };

  return (
    <main className="paper-grain min-h-screen relative">
      <div className="mx-auto max-w-6xl px-6 lg:px-12 pt-12 lg:pt-20 pb-16">
        {/* Header */}
        <div className="hairline-b pb-8 mb-10 lg:mb-16 rise">
          <div className="flex items-baseline justify-between mb-4">
            <span className="mono-tag text-muted-foreground">
              № 02 · Регистрация участника
            </span>
            <span className="mono-tag text-muted-foreground">
              {families.length}{' '}
              {pluralFamilies(families.length)}
            </span>
          </div>
          <h1 className="display ink text-5xl lg:text-[88px] leading-[0.92] tracking-[-0.04em]">
            {trip.name}
          </h1>
          <p className="mt-4 lg:mt-6 text-base lg:text-lg text-muted-foreground max-w-lg leading-relaxed">
            Выбери свою{' '}
            <span className="display-italic ink">семью</span> — так
            другие увидят, кто что несёт.
          </p>
        </div>

        {/* MOBILE — stacked list */}
        <div className="lg:hidden">
          {families.map((f, i) => (
            <button
              key={f.id}
              onClick={() => choose(f.id)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="rise w-full hairline-b first:hairline-t py-5 flex items-center gap-4 text-left group transition-colors hover:bg-foreground/[0.03] active:bg-foreground/[0.06]"
            >
              <span className="mono-tag text-muted-foreground w-8">
                {String(i + 1).padStart(2, '0')}
              </span>
              <FamilyBadge family={f} size={40} />
              <div className="flex-1 min-w-0">
                <p className="display text-2xl ink leading-tight tracking-tight truncate">
                  {f.name}
                </p>
                <p className="mono-tag text-muted-foreground mt-1">→ войти</p>
              </div>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors text-xl">
                →
              </span>
            </button>
          ))}
        </div>

        {/* DESKTOP — grid of large editorial cards */}
        <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-2 gap-px bg-[var(--rule)] hairline-t hairline-b">
          {families.map((f, i) => (
            <button
              key={f.id}
              onClick={() => choose(f.id)}
              style={{ animationDelay: `${i * 80}ms` }}
              className="rise group relative bg-background hover:bg-foreground/[0.025] transition-colors p-10 xl:p-12 text-left flex flex-col gap-8 min-h-[260px]"
            >
              <div className="flex items-baseline justify-between">
                <span className="mono-tag text-muted-foreground">
                  семья № {String(i + 1).padStart(2, '0')}
                </span>
                <FamilyBadge family={f} size={36} />
              </div>
              <div className="mt-auto">
                <p className="display ink text-5xl xl:text-6xl leading-[0.95] tracking-[-0.03em]">
                  {f.name}
                </p>
                <div className="mt-5 flex items-baseline justify-between">
                  <span className="mono-tag text-muted-foreground transition-colors group-hover:text-foreground">
                    выбрать
                  </span>
                  <span className="mono-tag text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-foreground">
                    →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-12 hairline-t pt-6 flex items-baseline justify-between">
          <span className="mono-tag text-muted-foreground">Не нашёл себя?</span>
          <span className="mono-tag text-muted-foreground">попроси организатора</span>
        </div>
      </div>
    </main>
  );
}

function pluralFamilies(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'семья';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'семьи';
  return 'семей';
}
