'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FamilyBadge } from '@/components/family-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteConfirm } from './delete-confirm';
import type { Family, Item, ItemClaim, Category } from '@/lib/db/types';

type Props = {
  item: Item;
  claims: ItemClaim[];
  families: Family[];
  myFamilyId: string;
  mode?: 'standard' | 'shopping';
  showCategory?: boolean;
  onToggleClaim: () => void;
  onTogglePurchased?: () => void;
  onUpdate: (patch: { title?: string; qty?: string | null; category?: Category; needs_purchase?: boolean }) => void;
  onDelete: () => void;
};

const CAT_LABEL: Record<Category, string> = {
  meat: 'мясо',
  veg: 'овощи',
  drinks: 'напитки',
  snacks: 'перекус',
  other: 'прочее',
};

export function ItemRow({
  item,
  claims,
  families,
  myFamilyId,
  mode = 'standard',
  showCategory = false,
  onToggleClaim,
  onTogglePurchased,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editQty, setEditQty] = useState(item.qty ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasQty = item.list_type === 'food';

  const iTake = claims.some(c => c.family_id === myFamilyId);
  const myClaim = claims.find(c => c.family_id === myFamilyId);
  const isPurchased = !!myClaim?.is_purchased;
  const someoneElsePurchased = !isPurchased && claims.some(c => c.is_purchased);
  const noOne = claims.length === 0;
  const famById = new Map(families.map(f => [f.id, f] as const));

  const sortedClaims = [...claims].sort((a, b) => {
    if (a.family_id === myFamilyId) return -1;
    if (b.family_id === myFamilyId) return 1;
    return 0;
  });

  if (editing) {
    return (
      <li className="hairline-b first:hairline-t py-3 lg:py-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const patch: { title?: string; qty?: string | null } = {};
            const t = editTitle.trim();
            if (t && t !== item.title) patch.title = t;
            if (hasQty) {
              const q = editQty.trim();
              patch.qty = q || null;
            }
            if (Object.keys(patch).length > 0) onUpdate(patch);
            setEditing(false);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <Input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
            className="editorial-input h-9 text-base flex-1"
          />
          {hasQty && (
            <Input
              value={editQty}
              onChange={e => setEditQty(e.target.value)}
              placeholder="кол-во"
              className="editorial-input h-9 text-base sm:w-24"
            />
          )}
          <div className="flex gap-3 items-center">
            <button type="submit" className="mono-tag text-primary hover:text-foreground">
              сохр.
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="mono-tag text-muted-foreground hover:text-foreground"
            >
              отмена
            </button>
          </div>
        </form>
      </li>
    );
  }

  const shoppingPurchased = mode === 'shopping' && (isPurchased || someoneElsePurchased);

  return (
    <li
      className={`hairline-b first:hairline-t py-2.5 lg:py-3.5 group ${
        shoppingPurchased ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm lg:text-base ink truncate ${
              shoppingPurchased ? 'line-through text-muted-foreground' : ''
            }`}
          >
            {item.title}
            {item.qty && (
              <span className="text-muted-foreground font-normal"> · {item.qty}</span>
            )}
            {showCategory && item.category && (
              <span className="mono-tag text-muted-foreground ml-2">
                [{CAT_LABEL[item.category]}]
              </span>
            )}
          </p>
          {noOne && (
            <p className="mono-tag text-destructive mt-0.5">
              {mode === 'shopping' ? 'никто не закупает' : 'свободно'}
            </p>
          )}
        </div>

        {sortedClaims.length > 0 && (
          <div className="flex -space-x-1 shrink-0">
            {sortedClaims.slice(0, 3).map(c => {
              const f = famById.get(c.family_id);
              if (!f) return null;
              return (
                <div key={c.id} className="relative">
                  <FamilyBadge family={f} size={20} />
                  {mode === 'shopping' && c.is_purchased && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-background" />
                  )}
                </div>
              );
            })}
            {sortedClaims.length > 3 && (
              <span className="mono-tag text-muted-foreground self-end pl-1">
                +{sortedClaims.length - 3}
              </span>
            )}
          </div>
        )}

        {mode === 'shopping' ? (
          isPurchased ? (
            <button
              onClick={onTogglePurchased}
              className="mono-tag text-muted-foreground hover:text-foreground shrink-0"
            >
              отменить
            </button>
          ) : (
            <Button
              size="sm"
              onClick={onTogglePurchased}
              className="h-7 px-3 text-xs rounded-full bg-foreground text-background hover:bg-foreground/90 shrink-0"
            >
              Купил
            </Button>
          )
        ) : (
          <Button
            size="sm"
            onClick={onToggleClaim}
            className={`h-7 px-3 text-xs rounded-full shrink-0 ${
              iTake
                ? 'bg-background border border-[var(--rule)] text-foreground hover:border-foreground'
                : 'bg-foreground text-background hover:bg-foreground/90'
            }`}
          >
            {iTake ? 'Не беру' : 'Беру'}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="меню"
            className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 -mr-2 bg-transparent border-0 outline-hidden focus-visible:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <span className="mono-tag">ред.</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onUpdate({ needs_purchase: !item.needs_purchase })}
            >
              <span className="mono-tag">
                {item.needs_purchase ? 'убрать из закупки' : 'надо купить'}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <span className="mono-tag">удалить</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DeleteConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemTitle={item.title}
        onConfirm={onDelete}
      />
    </li>
  );
}
