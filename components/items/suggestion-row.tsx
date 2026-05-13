'use client';

import { useState } from 'react';
import { DeleteConfirm } from './delete-confirm';
import type { AISuggestion, Family, Importance } from '@/lib/db/types';

const DOT: Record<Importance, string> = {
  critical: 'bg-destructive',
  recommended: 'bg-primary',
  optional: 'bg-muted-foreground/40',
};

const LIST_LABEL: Record<string, string> = {
  common: 'общее',
  personal: 'личное',
  food: 'продукты',
};

const CAT_LABEL: Record<string, string> = {
  meat: 'мясо',
  veg: 'овощи',
  drinks: 'напитки',
  snacks: 'перекус',
  other: 'прочее',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  return `${d} д. назад`;
}

type Props = {
  suggestion: AISuggestion;
  promotedByFamily: Family | null;
  families: Family[];
  myFamilyId: string;
  onPromote: (suggestion: AISuggestion, claimedBy: string[]) => void;
  onDelete: (id: string) => void;
};

export function SuggestionRow({
  suggestion,
  promotedByFamily,
  families,
  myFamilyId,
  onPromote,
  onDelete,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [claimedBy, setClaimedBy] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isPromoted = !!suggestion.added_to_list_at;
  const isPersonal = suggestion.list_type === 'personal';

  const listTag = isPersonal
    ? '[личное]'
    : suggestion.list_type === 'food'
      ? `[продукты${suggestion.category ? ` · ${CAT_LABEL[suggestion.category] ?? suggestion.category}` : ''}]`
      : '[общее]';

  const handlePromoteClick = () => {
    if (isPersonal) {
      onPromote(suggestion, []);
      return;
    }
    setPickerOpen(true);
  };

  const handleConfirm = () => {
    onPromote(suggestion, claimedBy);
    setPickerOpen(false);
    setClaimedBy([]);
  };

  const handleCancel = () => {
    setPickerOpen(false);
    setClaimedBy([]);
  };

  return (
    <li className="hairline-b first:hairline-t py-4">
      <div className="flex items-start gap-3">
        {/* Importance dot */}
        <span
          className={`h-2 w-2 rounded-full shrink-0 mt-2 ${DOT[suggestion.importance]} ${
            isPromoted ? 'opacity-40' : ''
          }`}
          aria-label={`importance: ${suggestion.importance}`}
        />

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-base leading-tight ${
                isPromoted ? 'line-through opacity-50 text-muted-foreground' : 'ink'
              }`}
            >
              {suggestion.title}
            </span>
            {suggestion.qty && (
              <span
                className={`mono-tag ${isPromoted ? 'opacity-50' : 'text-muted-foreground'}`}
              >
                · {suggestion.qty}
              </span>
            )}
            <span
              className={`mono-tag ${isPromoted ? 'opacity-50' : 'text-muted-foreground'} ml-auto`}
            >
              {listTag} · {LIST_LABEL[suggestion.list_type]}
            </span>
          </div>

          {suggestion.reason && (
            <p
              className={`text-sm italic mt-1 leading-snug ${
                isPromoted ? 'opacity-40 text-muted-foreground' : 'text-muted-foreground'
              }`}
            >
              {suggestion.reason}
            </p>
          )}

          {/* Promoted state */}
          {isPromoted && (
            <div className="mt-2 flex items-center gap-3">
              <span className="mono-tag text-muted-foreground">
                взяли {promotedByFamily?.name ?? '?'}
                {suggestion.added_to_list_at && ` · ${timeAgo(suggestion.added_to_list_at)}`}
              </span>
              <button
                onClick={() => setConfirmOpen(true)}
                aria-label="Удалить подсказку"
                className="mono-tag text-muted-foreground hover:text-destructive transition-colors ml-auto"
              >
                ×
              </button>
            </div>
          )}

          {/* Pending state — actions */}
          {!isPromoted && !pickerOpen && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePromoteClick}
                className="mono-tag px-3 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                {isPersonal ? '+ к себе' : '+ добавить'}
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                aria-label="Удалить подсказку"
                className="mono-tag text-muted-foreground hover:text-destructive transition-colors px-2 py-2"
              >
                ×
              </button>
            </div>
          )}

          {/* Pending state — family picker (common/food) */}
          {!isPromoted && pickerOpen && (
            <div className="mt-3">
              <p className="mono-tag text-muted-foreground mb-2">
                кто возьмёт (опционально):
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {families.map(f => {
                  const active = claimedBy.includes(f.id);
                  return (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() =>
                        setClaimedBy(prev =>
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
                      <span className="text-sm">
                        {f.name}
                        {f.id === myFamilyId && ' (я)'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  className="mono-tag px-3 py-2 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  подтвердить
                </button>
                <button
                  onClick={handleCancel}
                  className="mono-tag text-muted-foreground hover:text-foreground transition-colors px-2 py-2"
                >
                  отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemTitle={suggestion.title}
        onConfirm={() => onDelete(suggestion.id)}
      />
    </li>
  );
}
