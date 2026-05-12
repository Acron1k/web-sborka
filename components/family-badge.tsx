import type { Family } from '@/lib/db/types';

export function FamilyBadge({ family, size = 24 }: { family: Family; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold text-xs shrink-0"
      style={{ background: family.color, width: size, height: size }}
      title={family.name}
    >
      {family.name.slice(0, 2)}
    </div>
  );
}
