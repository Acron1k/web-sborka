'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold mb-1">🤖 AI-помощник</h3>
        <p className="text-sm text-slate-600">
          Экспортни состояние, отдай Claude, вставь обратно его предложения.
        </p>
      </div>

      <Button variant="secondary" onClick={copyExport}>
        {copied ? '✓ Скопировано' : 'Экспорт состояния в буфер'}
      </Button>

      <div>
        <p className="text-sm font-medium mb-1">Импорт предложений:</p>
        <textarea
          className="w-full border rounded-md p-2 text-xs font-mono h-32"
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='{"suggestions": [{"list": "common", "title": "Тент"}]}'
        />
        <Button variant="secondary" className="mt-2" onClick={parseInput}>Распарсить</Button>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {done && <p className="text-sm text-green-600 mt-2">Добавлено!</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Выбери, что добавить:</p>
          {suggestions.map((s, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} />
              <span>
                <b>[{s.list}]</b> {s.title}
                {s.qty && ` (${s.qty})`}
                {s.category && ` · ${s.category}`}
                {s.reason && <span className="text-slate-500"> — {s.reason}</span>}
              </span>
            </label>
          ))}
          <Button onClick={apply}>Добавить {selected.size} пунктов</Button>
        </div>
      )}
    </Card>
  );
}
