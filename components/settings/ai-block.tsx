'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { AIExport, AISuggestion } from '@/lib/ai-format';

export function AIBlock({
  exportData,
  onImport,
}: {
  exportData: AIExport;
  onImport: (s: AISuggestion[]) => Promise<void>;
}) {
  const [importText, setImportText] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyExport = async () => {
    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const parseInput = () => {
    setError(null);
    setDone(false);
    try {
      const parsed = JSON.parse(importText);
      const list: AISuggestion[] = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : Array.isArray(parsed)
        ? parsed
        : [];
      if (list.length === 0) throw new Error('Не нашёл suggestions');
      setSuggestions(list);
      setSelected(new Set(list.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось распарсить JSON');
    }
  };

  const apply = async () => {
    const chosen = suggestions.filter((_, i) => selected.has(i));
    await onImport(chosen);
    setDone(true);
    setSuggestions([]);
    setImportText('');
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="mono-tag text-muted-foreground">04</span>
          <span className="mono-tag text-muted-foreground">AI-помощник</span>
        </div>
        <h2 className="display ink text-3xl lg:text-4xl leading-[0.95] tracking-tight">
          Экспорт <span className="display-italic text-primary">и&nbsp;предложения</span>
        </h2>
        <p className="text-base text-muted-foreground mt-3 max-w-md leading-relaxed">
          Скопируй состояние, отдай ассистенту, вставь его предложения обратно —
          и&nbsp;выбери, что добавить в&nbsp;списки.
        </p>
      </div>

      {/* Export */}
      <div className="hairline-t pt-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">шаг 01 · экспорт</span>
          {copied && <span className="mono-tag text-primary">скопировано</span>}
        </div>
        <button
          onClick={copyExport}
          className="h-12 px-6 rounded-full border border-foreground text-foreground text-sm tracking-tight hover:bg-foreground/[0.04] transition-colors"
        >
          {copied ? '✓ в буфере' : 'Скопировать состояние'}
        </button>
      </div>

      {/* Import */}
      <div className="hairline-t pt-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">шаг 02 · импорт</span>
          {done && <span className="mono-tag text-primary">добавлено</span>}
        </div>
        <textarea
          className="w-full border border-[var(--rule)] bg-card rounded-md p-3 text-xs font-mono h-32 leading-relaxed text-foreground focus:outline-none focus:border-foreground transition-colors"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='{"suggestions": [{"list": "common", "title": "Тент"}]}'
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={parseInput}
            disabled={!importText.trim()}
            className="h-11 px-5 rounded-full border border-foreground text-foreground text-sm tracking-tight hover:bg-foreground/[0.04] transition-colors disabled:opacity-40"
          >
            Распарсить JSON
          </button>
          {error && (
            <span className="mono-tag text-destructive">{error}</span>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="hairline-t pt-6 rise">
          <div className="flex items-baseline justify-between mb-4">
            <span className="mono-tag text-muted-foreground">
              предложения · {suggestions.length}
            </span>
            <span className="mono-tag text-muted-foreground">
              выбрано {selected.size}
            </span>
          </div>

          <ul>
            {suggestions.map((s, i) => (
              <li
                key={i}
                className={`hairline-b ${i === 0 ? 'hairline-t' : ''} py-3 flex items-start gap-3`}
              >
                <Checkbox
                  checked={selected.has(i)}
                  onCheckedChange={() => toggle(i)}
                  className="mt-1 shrink-0 rounded-sm border-[var(--rule)] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                />
                <label className="flex-1 cursor-pointer" onClick={() => toggle(i)}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="mono-tag text-primary">[{s.list}]</span>
                    <span className="text-base ink leading-tight">{s.title}</span>
                    {s.qty && (
                      <span className="mono-tag text-muted-foreground">· {s.qty}</span>
                    )}
                    {s.category && (
                      <span className="mono-tag text-muted-foreground">· {s.category}</span>
                    )}
                  </div>
                  {s.reason && (
                    <p className="text-sm text-muted-foreground mt-1 leading-snug">
                      {s.reason}
                    </p>
                  )}
                </label>
              </li>
            ))}
          </ul>

          <button
            onClick={apply}
            disabled={selected.size === 0}
            className="mt-6 w-full sm:w-auto h-12 px-8 rounded-full bg-foreground text-background text-sm tracking-tight hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            Добавить {selected.size} {pluralItems(selected.size)} →
          </button>
        </div>
      )}
    </section>
  );
}

function pluralItems(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'пункт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'пункта';
  return 'пунктов';
}
