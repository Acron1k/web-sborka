'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

export function AddItemForm({ onAdd, placeholder = 'Например: Мангал' }: {
  onAdd: (title: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setBusy(true);
    await onAdd(t);
    setValue('');
    setBusy(false);
  };

  const disabled = busy || !value.trim();

  return (
    <form onSubmit={submit} className="flex items-end gap-3 mb-6">
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
    </form>
  );
}
