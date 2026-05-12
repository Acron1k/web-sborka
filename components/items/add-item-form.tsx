'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Family } from '@/lib/db/types';

type Props = {
  onAdd: (title: string, claimedBy: string[]) => void | Promise<void>;
  placeholder?: string;
  families?: Family[];
};

export function AddItemForm({ onAdd, placeholder = 'Например: Мангал', families }: Props) {
  const [value, setValue] = useState('');
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    await onAdd(t, selectedFamilies);
    setValue('');
    setSelectedFamilies([]);
    setBusy(false);
  };

  const disabled = busy || !value.trim();

  return (
    <form onSubmit={submit} className="mb-6">
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={busy}
            className="editorial-input h-11 text-base placeholder:text-muted-foreground/60"
          />
        </div>
        <button
          type="submit"
          disabled={disabled}
          aria-label="Добавить пункт"
          className="shrink-0 h-11 w-11 rounded-full bg-foreground text-background flex items-center justify-center text-xl leading-none transition-all hover:scale-[0.97] disabled:opacity-30 disabled:hover:scale-100"
        >
          +
        </button>
      </div>

      {families && families.length > 0 && (
        <div className="mt-3">
          <p className="mono-tag text-muted-foreground mb-2">назначить (опционально):</p>
          <div className="flex flex-wrap gap-2">
            {families.map(f => {
              const active = selectedFamilies.includes(f.id);
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() =>
                    setSelectedFamilies(prev =>
                      active ? prev.filter(id => id !== f.id) : [...prev, f.id]
                    )
                  }
                  className={`flex items-center gap-2 px-3 h-8 rounded-full border transition-colors ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-[var(--rule)] hover:border-foreground'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ background: f.color }}
                  />
                  <span className="text-sm">{f.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}
