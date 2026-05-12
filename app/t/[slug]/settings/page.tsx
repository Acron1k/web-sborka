'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { FamilyBadge } from '@/components/family-badge';
import { supabase } from '@/lib/supabase/client';
import { fetchTripBySlug } from '@/lib/queries/trip';
import { fetchItems, fetchClaims } from '@/lib/queries/items';
import { useCurrentFamily } from '@/lib/session-client';
import { clearFamilyCookie } from '@/lib/session';
import { AIBlock } from '@/components/settings/ai-block';
import { buildExport, type AISuggestion } from '@/lib/ai-format';
import Link from 'next/link';

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

  if (!tripData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <span className="mono-tag text-muted-foreground">Загрузка…</span>
      </main>
    );
  }

  const { trip, families } = tripData;
  const allItems = [...common, ...personal, ...food];
  const exportData = buildExport(trip, families, allItems, claims);
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/t/${slug}` : '';

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

  const dateLine =
    trip.starts_on || trip.ends_on
      ? `${trip.starts_on || '?'} → ${trip.ends_on || '?'}`
      : 'даты не указаны';

  return (
    <main className="paper-grain min-h-screen relative">
      <div className="mx-auto max-w-6xl px-5 lg:px-12 pt-10 lg:pt-16 pb-16">
        {/* Breadcrumb + headline */}
        <div className="mb-10 lg:mb-16">
          <Link
            href={`/t/${slug}`}
            className="mono-tag text-muted-foreground hover:text-foreground transition-colors inline-block"
          >
            ← /t/{slug}
          </Link>
          <div className="mt-3 flex items-baseline justify-between gap-4 flex-wrap">
            <h1 className="display ink text-5xl lg:text-[88px] leading-[0.92] tracking-[-0.04em]">
              Настройки
            </h1>
            <span className="mono-tag text-muted-foreground hidden lg:inline">
              {trip.name}
            </span>
          </div>
        </div>

        {/* Responsive grid: mobile flow, desktop 2 cols */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-16 lg:gap-y-12">
          {/* 01 — Поездка */}
          <Section number="01" tag="Поездка">
            <p className="display text-3xl ink leading-tight">{trip.name}</p>
            <p className="mono-tag text-muted-foreground mt-3">{dateLine}</p>
            <p className="mono-tag text-muted-foreground mt-1">
              slug · {slug}
            </p>
          </Section>

          {/* 02 — Ссылка */}
          <Section number="02" tag="Ссылка для друзей">
            <div className="flex items-end gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <Input
                  value={inviteUrl}
                  readOnly
                  className="editorial-input h-11 text-sm font-mono text-foreground"
                  onFocus={e => e.currentTarget.select()}
                />
              </div>
              <button
                onClick={copyLink}
                className="shrink-0 h-11 px-5 rounded-full bg-foreground text-background text-sm tracking-tight hover:bg-foreground/90 transition-colors"
              >
                {copied ? '✓' : 'Копировать'}
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Друзья откроют ссылку и выберут свою семью — после этого видят
              общий список.
            </p>
          </Section>

          {/* 03 — Семьи */}
          <Section number="03" tag="Семьи" className="lg:col-span-1">
            <ul>
              {families.map((f, idx) => (
                <li
                  key={f.id}
                  className={`hairline-b ${idx === 0 ? 'hairline-t' : ''} py-3 flex items-center gap-3`}
                >
                  <FamilyBadge family={f} size={28} />
                  <span className="flex-1 text-base ink leading-tight">{f.name}</span>
                  {f.id === familyId && (
                    <span className="mono-tag text-primary">это ты</span>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={switchFamily}
              className="mt-4 mono-tag text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-[var(--rule)] hover:decoration-foreground"
            >
              → сменить мою семью
            </button>
          </Section>

          {/* 04 — AI block. On desktop spans full right column starting from row 1 */}
          <div className="lg:row-start-1 lg:row-span-3 lg:col-start-2 mt-12 lg:mt-0">
            <AIBlock exportData={exportData} onImport={importSuggestions} />
          </div>
        </div>

        <div className="mt-16 hairline-t pt-6 flex items-baseline justify-between">
          <span className="mono-tag text-muted-foreground">v0.1</span>
          <Link
            href={`/t/${slug}`}
            className="mono-tag text-muted-foreground hover:text-foreground transition-colors"
          >
            ← к спискам
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({
  number,
  tag,
  children,
  className = '',
}: {
  number: string;
  tag: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-10 lg:mb-0 ${className}`}>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="mono-tag text-muted-foreground">{number}</span>
        <span className="mono-tag text-muted-foreground">{tag}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}
