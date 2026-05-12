'use client';

import { useState } from 'react';
import type { AIExport, AISuggestion, SuggestionImportance } from '@/lib/ai-format';
import { buildExportPrompt } from '@/lib/ai-format';

const IMP_DOT: Record<SuggestionImportance, string> = {
  critical: 'bg-destructive',
  recommended: 'bg-primary',
  optional: 'bg-muted-foreground/40',
};

const IMP_LABEL: Record<SuggestionImportance, string> = {
  critical: 'критично',
  recommended: 'рекомендую',
  optional: 'по желанию',
};

export function AIBlock({
  exportData,
  onImport,
}: {
  exportData: AIExport;
  onImport: (s: AISuggestion[]) => Promise<void>;
}) {
  const [importText, setImportText] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [copiedState, setCopiedState] = useState<'json' | 'prompt' | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (kind: 'json' | 'prompt') => {
    const text =
      kind === 'prompt' ? buildExportPrompt(exportData) : JSON.stringify(exportData, null, 2);
    await navigator.clipboard.writeText(text);
    setCopiedState(kind);
    setTimeout(() => setCopiedState(null), 1500);
  };

  const parseInput = () => {
    setError(null);
    setDone(null);
    try {
      const parsed = JSON.parse(importText);
      const raw: unknown[] = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : Array.isArray(parsed)
          ? parsed
          : [];
      if (raw.length === 0) throw new Error('Не нашёл suggestions');

      const list: AISuggestion[] = raw.map(item => {
        const r = item as Partial<AISuggestion>;
        const importance: SuggestionImportance =
          r.importance === 'critical' || r.importance === 'optional'
            ? r.importance
            : 'recommended';
        return {
          list: r.list ?? 'common',
          title: r.title ?? '',
          qty: r.qty,
          category: r.category,
          importance,
          reason: r.reason,
        };
      }).filter(s => s.title.trim().length > 0);

      if (list.length === 0) throw new Error('Все suggestions без title');
      setSuggestions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось распарсить JSON');
    }
  };

  const apply = async () => {
    if (suggestions.length === 0) return;
    setBusy(true);
    try {
      await onImport(suggestions);
      setDone(suggestions.length);
      setSuggestions([]);
      setImportText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка записи');
    } finally {
      setBusy(false);
    }
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
          Промпт <span className="display-italic text-primary">и&nbsp;импорт</span>
        </h2>
        <p className="text-base text-muted-foreground mt-3 max-w-md leading-relaxed">
          Скопируй промпт (или только JSON), отдай ассистенту, вставь его ответ обратно —
          подсказки попадут в&nbsp;таб <b className="ink">«ИИ»</b>.
        </p>
      </div>

      {/* Export */}
      <div className="hairline-t pt-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">шаг 01 · экспорт</span>
          {copiedState && (
            <span className="mono-tag text-primary">
              скопировано · {copiedState === 'prompt' ? 'промпт' : 'JSON'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => copy('prompt')}
            className="h-12 px-6 rounded-full bg-foreground text-background text-sm tracking-tight hover:bg-foreground/90 transition-colors"
          >
            {copiedState === 'prompt' ? '✓ в буфере' : 'Копировать промпт + состояние'}
          </button>
          <button
            onClick={() => copy('json')}
            className="h-12 px-6 rounded-full border border-foreground text-foreground text-sm tracking-tight hover:bg-foreground/[0.04] transition-colors"
          >
            {copiedState === 'json' ? '✓ в буфере' : 'Только JSON'}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-md leading-relaxed">
          Промпт уже содержит инструкцию для Claude и текущий стейт — копипасть всё одним сообщением.
        </p>
      </div>

      {/* Import */}
      <div className="hairline-t pt-6">
        <div className="flex items-baseline justify-between mb-3">
          <span className="mono-tag text-muted-foreground">шаг 02 · импорт</span>
          {done !== null && (
            <span className="mono-tag text-primary">
              {done} {pluralItems(done)} в табе «ИИ»
            </span>
          )}
        </div>
        <textarea
          className="w-full border border-[var(--rule)] bg-card rounded-md p-3 text-xs font-mono h-32 leading-relaxed text-foreground focus:outline-none focus:border-foreground transition-colors"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='{"suggestions": [{"list": "common", "title": "Аптечка", "importance": "critical", "reason": "must"}]}'
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={parseInput}
            disabled={!importText.trim()}
            className="h-11 px-5 rounded-full border border-foreground text-foreground text-sm tracking-tight hover:bg-foreground/[0.04] transition-colors disabled:opacity-40"
          >
            Распарсить JSON
          </button>
          {error && <span className="mono-tag text-destructive">{error}</span>}
        </div>
      </div>

      {/* Preview */}
      {suggestions.length > 0 && (
        <div className="hairline-t pt-6 rise">
          <div className="flex items-baseline justify-between mb-4">
            <span className="mono-tag text-muted-foreground">
              предпросмотр · {suggestions.length}
            </span>
            <span className="mono-tag text-muted-foreground">
              отсортируешь и&nbsp;промоутишь в&nbsp;табе «ИИ»
            </span>
          </div>

          <ul className="mb-6">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className={`hairline-b ${i === 0 ? 'hairline-t' : ''} py-3 flex items-start gap-3`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 mt-2 ${IMP_DOT[s.importance]}`}
                  aria-label={IMP_LABEL[s.importance]}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-base ink leading-tight">{s.title}</span>
                    {s.qty && (
                      <span className="mono-tag text-muted-foreground">· {s.qty}</span>
                    )}
                    <span className="mono-tag text-primary ml-auto">[{s.list}]</span>
                  </div>
                  {s.reason && (
                    <p className="text-sm text-muted-foreground italic mt-1 leading-snug">
                      {s.reason}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={apply}
            disabled={busy}
            className="w-full sm:w-auto h-12 px-8 rounded-full bg-foreground text-background text-sm tracking-tight hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {busy
              ? 'Сохраняю…'
              : `Добавить ${suggestions.length} ${pluralItems(suggestions.length)} в таб «ИИ» →`}
          </button>
        </div>
      )}
    </section>
  );
}

function pluralItems(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'подсказка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'подсказки';
  return 'подсказок';
}
