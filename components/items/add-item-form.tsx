'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { Family } from '@/lib/db/types';

type Props = {
  onAdd: (
    title: string,
    claimedBy: string[],
    needsPurchase: boolean
  ) => void | Promise<void>;
  placeholder?: string;
  families?: Family[];
  showPurchaseToggle?: boolean;
  defaultNeedsPurchase?: boolean;
};

export function AddItemForm({
  onAdd,
  placeholder = 'Например: Мангал',
  families,
  showPurchaseToggle = false,
  defaultNeedsPurchase = false,
}: Props) {
  const [value, setValue] = useState('');
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [needsPurchase, setNeedsPurchase] = useState(defaultNeedsPurchase);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    await onAdd(t, selectedFamilies, needsPurchase);
    setValue('');
    setSelectedFamilies([]);
    setNeedsPurchase(defaultNeedsPurchase);
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

      {showPurchaseToggle && (
        <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Checkbox
            checked={needsPurchase}
            onCheckedChange={v => setNeedsPurchase(!!v)}
            className="rounded-sm border-[var(--rule)] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
          />
          <span>надо купить</span>
        </label>
      )}
    </form>
  );
}
