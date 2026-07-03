'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api-client';
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

    try {
      await api.post('/api/trips', {
        slug,
        name: name.trim(),
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        families: cleanFamilies.map((fname, i) => ({
          name: fname,
          color: FAMILY_COLORS[i % FAMILY_COLORS.length],
          position: i,
        })),
      });
      router.push(`/t/${slug}/join`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ошибка создания поездки');
      setLoading(false);
    }
  };

  return (
    <div className="paper-grain min-h-screen relative">
      {/* DESKTOP: split-screen editorial spread */}
      <div className="hidden lg:grid lg:grid-cols-[1.1fr_1px_0.9fr] lg:min-h-screen relative">
        {/* Left: editorial hero */}
        <section className="relative px-16 xl:px-24 py-16 flex flex-col justify-between overflow-hidden">
          {/* top mono row */}
          <div className="flex items-baseline justify-between">
            <span className="mono-tag text-muted-foreground">№ 01 · Планировщик</span>
          </div>

          {/* Headline */}
          <div>
            <h1
              className="display ink leading-[0.92] tracking-[-0.04em]"
              style={{ fontSize: 'clamp(48px, 4.5vw, 96px)' }}
            >
              Соберись
            </h1>
            <h1
              className="display-italic text-primary leading-[0.92] tracking-[-0.035em] -mt-1"
              style={{ fontSize: 'clamp(48px, 4.5vw, 96px)' }}
            >
              обстоятельно
            </h1>
            <p className="mt-10 max-w-md text-lg leading-relaxed text-muted-foreground">
              Список вещей, продуктов и&nbsp;дел на&nbsp;общую вылазку.
              Друзья присоединяются по&nbsp;ссылке —{' '}
              <span className="ink">каждая семья видит, кто&nbsp;что&nbsp;берёт.</span>
            </p>
          </div>

          {/* Footer slug */}
          <div className="flex items-baseline justify-end hairline-t pt-6">
            <span className="mono-tag text-muted-foreground">↓ заполни справа</span>
          </div>
        </section>

        {/* Vertical hairline */}
        <div className="bg-[var(--rule)]" aria-hidden="true" />

        {/* Right: form */}
        <section className="px-12 xl:px-16 py-16 flex flex-col justify-center">
          <div className="mb-10">
            <span className="mono-tag text-muted-foreground">Колофон</span>
            <h2 className="display text-3xl mt-2">Параметры выпуска</h2>
          </div>

          <FormBody
            name={name}
            setName={setName}
            startsOn={startsOn}
            setStartsOn={setStartsOn}
            endsOn={endsOn}
            setEndsOn={setEndsOn}
            families={families}
            updateFamily={updateFamily}
            error={error}
            loading={loading}
            onSubmit={handleCreate}
          />
        </section>
      </div>

      {/* MOBILE / TABLET */}
      <main className="lg:hidden mx-auto max-w-lg px-6 pt-16 pb-20 relative">
        <div className="mb-12">
          <div className="mono-tag text-muted-foreground mb-3">
            № 01 · Планировщик
          </div>
          <h1 className="display text-[64px] leading-[0.92] tracking-[-0.04em] ink mb-4">
            Соберись<br />
            <span className="display-italic text-primary">обстоятельно</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
            Список вещей, продуктов и&nbsp;дел на&nbsp;общую вылазку.
            Друзья присоединяются по&nbsp;ссылке — каждая семья видит,
            кто&nbsp;что&nbsp;берёт.
          </p>
        </div>

        <FormBody
          name={name}
          setName={setName}
          startsOn={startsOn}
          setStartsOn={setStartsOn}
          endsOn={endsOn}
          setEndsOn={setEndsOn}
          families={families}
          updateFamily={updateFamily}
          error={error}
          loading={loading}
          onSubmit={handleCreate}
        />

        <div className="mt-16 hairline-t pt-6 flex items-baseline justify-between">
          <p className="mono-tag text-muted-foreground">Уже есть ссылка — открой её</p>
          <p className="mono-tag text-muted-foreground">v0.1</p>
        </div>
      </main>
    </div>
  );
}

function FormBody({
  name, setName,
  startsOn, setStartsOn,
  endsOn, setEndsOn,
  families, updateFamily,
  error, loading, onSubmit,
}: {
  name: string; setName: (v: string) => void;
  startsOn: string; setStartsOn: (v: string) => void;
  endsOn: string; setEndsOn: (v: string) => void;
  families: string[]; updateFamily: (i: number, v: string) => void;
  error: string | null; loading: boolean; onSubmit: () => void;
}) {
  return (
    <div className="space-y-8">
      <Field
        label="Название"
        number="01"
        input={
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Шашлыки на майские"
            className="editorial-input h-12 text-lg"
          />
        }
      />

      <div className="grid grid-cols-2 gap-6">
        <Field
          label="Старт"
          number="02"
          input={
            <Input
              type="date"
              value={startsOn}
              onChange={e => setStartsOn(e.target.value)}
              className="editorial-input h-12 text-base"
            />
          }
        />
        <Field
          label="Финиш"
          number="03"
          input={
            <Input
              type="date"
              value={endsOn}
              onChange={e => setEndsOn(e.target.value)}
              className="editorial-input h-12 text-base"
            />
          }
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <div className="flex items-baseline gap-3">
            <span className="mono-tag text-muted-foreground">04</span>
            <span className="text-sm tracking-tight">Семьи</span>
          </div>
          <span className="mono-tag text-muted-foreground">мин. 2</span>
        </div>
        <div className="space-y-3">
          {families.map((f, i) => (
            <div key={i} className="flex items-center gap-3 group">
              <span
                className="h-7 w-7 rounded-full shrink-0 ring-1 ring-[var(--rule)] flex items-center justify-center text-[10px] font-mono text-white"
                style={{ background: FAMILY_COLORS[i % FAMILY_COLORS.length] }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <Input
                value={f}
                onChange={e => updateFamily(i, e.target.value)}
                placeholder={`Фамилия ${i + 1}`}
                className="editorial-input h-11"
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 rounded-md">
          <p className="mono-tag text-destructive mb-1">Ошибка</p>
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={loading}
        className="w-full h-14 text-base rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all hover:scale-[0.99]"
      >
        {loading ? 'Создаём…' : 'Создать поездку →'}
      </Button>
    </div>
  );
}

function Field({ label, number, input }: { label: string; number: string; input: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="mono-tag text-muted-foreground">{number}</span>
        <span className="text-sm tracking-tight">{label}</span>
      </div>
      {input}
    </div>
  );
}
