'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { useCurrentFamily } from '@/lib/session-client';
import { FamilyBadge } from '@/components/family-badge';
import { ItemsList } from '@/components/items/items-list';
import { PackingList } from '@/components/items/packing-list';
import { FoodList } from '@/components/items/food-list';
import { useTripRealtime } from '@/lib/realtime';
import { LiveDot } from '@/components/live-dot';
import Link from 'next/link';

type Tab = 'common' | 'personal' | 'food';

const TABS: { id: Tab; num: string; label: string; sublabel: string }[] = [
  { id: 'common', num: '01', label: 'Общее', sublabel: 'на всех' },
  { id: 'personal', num: '02', label: 'Личное', sublabel: 'твоё' },
  { id: 'food', num: '03', label: 'Продукты', sublabel: 'еда и питьё' },
];

export default function TripPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const familyId = useCurrentFamily(slug);
  const [tab, setTab] = useState<Tab>('common');

  const { data } = useQuery({
    queryKey: ['trip', slug],
    queryFn: () => fetchTripBySlug(slug),
    enabled: familyId !== 'loading',
  });

  const rtStatus = useTripRealtime(data?.trip.id ?? '');

  if (familyId === 'loading' || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="mono-tag text-muted-foreground">Загрузка…</span>
      </main>
    );
  }

  const myFamily = data.families.find(f => f.id === familyId);

  const renderTab = () => {
    if (tab === 'common') {
      return (
        <ItemsList
          tripId={data.trip.id}
          listType="common"
          families={data.families}
          currentFamilyId={familyId as string}
        />
      );
    }
    if (tab === 'personal' && myFamily) {
      return (
        <PackingList
          tripId={data.trip.id}
          familyId={myFamily.id}
          familyName={myFamily.name}
          families={data.families}
        />
      );
    }
    if (tab === 'food') {
      return (
        <FoodList
          tripId={data.trip.id}
          families={data.families}
          currentFamilyId={familyId as string}
        />
      );
    }
    return null;
  };

  const dateLine = (() => {
    if (!data.trip.starts_on && !data.trip.ends_on) return null;
    return `${data.trip.starts_on || '?'} → ${data.trip.ends_on || '?'}`;
  })();

  return (
    <main className="paper-grain min-h-screen relative">
      {/* MOBILE */}
      <div className="lg:hidden">
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur hairline-b">
          <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="mono-tag text-muted-foreground">№ 03 · Сборы</span>
              <h1 className="display text-3xl ink leading-tight tracking-[-0.025em] mt-1 truncate">
                {data.trip.name}
              </h1>
              {myFamily && (
                <div className="flex items-center gap-2 mt-2">
                  <FamilyBadge family={myFamily} size={18} />
                  <span className="text-sm ink leading-none">{myFamily.name}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="mono-tag text-muted-foreground">смена</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Link
                href={`/t/${slug}/settings`}
                className="mono-tag text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-[var(--rule)] hover:decoration-foreground"
              >
                опции
              </Link>
              <LiveDot status={rtStatus} />
            </div>
          </div>

          <nav className="flex hairline-t">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-3 text-center transition-all relative ${
                    active
                      ? 'ink border-b-2 border-foreground -mb-px'
                      : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px'
                  }`}
                >
                  <span className="mono-tag block mb-0.5">{t.num}</span>
                  <span className="text-sm tracking-tight">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        <div className="px-5 py-6">{renderTab()}</div>
      </div>

      {/* DESKTOP */}
      <div className="hidden lg:grid lg:grid-cols-[300px_1px_minmax(0,1fr)] xl:grid-cols-[340px_1px_minmax(0,1fr)] min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 h-screen px-8 xl:px-10 py-10 flex flex-col">
          <div className="mb-10">
            <span className="mono-tag text-muted-foreground">№ 03 · Сборы</span>
            <h1 className="display ink text-4xl xl:text-5xl leading-[0.95] tracking-[-0.035em] mt-2">
              {data.trip.name}
            </h1>
            {dateLine && (
              <p className="mono-tag text-muted-foreground mt-4">{dateLine}</p>
            )}
          </div>

          {myFamily && (
            <div className="hairline-t hairline-b py-5 mb-8 flex items-center gap-3">
              <FamilyBadge family={myFamily} size={28} />
              <div>
                <p className="mono-tag text-muted-foreground">это ты</p>
                <p className="text-base ink leading-tight">{myFamily.name}</p>
              </div>
            </div>
          )}

          <nav className="flex flex-col -mx-2">
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`group relative px-2 py-4 hairline-b first:hairline-t flex items-baseline justify-between text-left transition-colors ${
                    active ? '' : 'hover:bg-foreground/[0.025]'
                  }`}
                >
                  <div className="flex items-baseline gap-4">
                    <span
                      className={`mono-tag ${active ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {t.num}
                    </span>
                    <span
                      className={`display text-2xl tracking-tight ${active ? 'ink' : 'text-muted-foreground'}`}
                    >
                      {t.label}
                    </span>
                  </div>
                  <span className="mono-tag text-muted-foreground">{t.sublabel}</span>
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-8 hairline-t">
            <div className="flex items-baseline justify-between mt-6">
              <Link
                href={`/t/${slug}/settings`}
                className="mono-tag text-muted-foreground hover:text-foreground transition-colors"
              >
                → настройки
              </Link>
              <span className="mono-tag text-muted-foreground">v0.1</span>
            </div>
            <div className="mt-3">
              <LiveDot status={rtStatus} />
            </div>
          </div>
        </aside>

        {/* Vertical hairline */}
        <div className="bg-[var(--rule)]" aria-hidden="true" />

        {/* Content */}
        <section className="px-10 xl:px-16 py-12 xl:py-16">
          <div className="max-w-3xl rise">{renderTab()}</div>
        </section>
      </div>
    </main>
  );
}
