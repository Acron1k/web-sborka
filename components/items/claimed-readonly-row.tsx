'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { Family, Item, ItemClaim } from '@/lib/db/types';

const CAT_LABEL: Record<string, string> = {
  meat: 'мясо',
  veg: 'овощи',
  drinks: 'напитки',
  snacks: 'перекус',
  other: 'прочее',
};

type Props = {
  item: Item;
  claim: ItemClaim;
  otherFamilies: Family[];
  onTogglePacked: (claimId: string, packed: boolean) => void;
};

export function ClaimedReadonlyRow({ item, claim, otherFamilies, onTogglePacked }: Props) {
  const packed = claim.is_packed;
  const catLabel = item.category ? CAT_LABEL[item.category] : null;

  return (
    <li className="hairline-b first:hairline-t py-3 flex items-start gap-4">
      <Checkbox
        checked={packed}
        onCheckedChange={v => onTogglePacked(claim.id, !!v)}
        aria-label={`Упаковано: ${item.title}`}
        className="mt-1 shrink-0 rounded-sm border-[var(--rule)] data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className={`flex-1 text-base leading-tight min-w-0 ${
              packed ? 'line-through text-muted-foreground' : 'ink'
            }`}
          >
            {item.title}
            {item.qty && (
              <span className="text-muted-foreground font-normal"> · {item.qty}</span>
            )}
          </p>
          {item.needs_purchase && (
            <span className="mono-tag text-primary shrink-0">закупка</span>
          )}
          {catLabel && (
            <span className="mono-tag text-muted-foreground shrink-0">[{catLabel}]</span>
          )}
        </div>

        {otherFamilies.length > 0 && (
          <p className="mono-tag text-muted-foreground mt-1">
            · также {otherFamilies.map(f => f.name).join(', ')}
          </p>
        )}
      </div>
    </li>
  );
}
