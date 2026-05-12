'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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

  return (
    <form onSubmit={submit} className="flex gap-2 mb-3">
      <Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} disabled={busy} />
      <Button type="submit" disabled={busy || !value.trim()}>+</Button>
    </form>
  );
}
