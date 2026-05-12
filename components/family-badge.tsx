import type { Family } from '@/lib/db/types';

export function FamilyBadge({ family, size = 24 }: { family: Family; size?: number }) {
  const fontSize = Math.max(9, Math.floor(size * 0.42));
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-medium shrink-0 ring-1 ring-black/10"
      style={{
        background: family.color,
        width: size,
        height: size,
        fontSize: `${fontSize}px`,
        letterSpacing: '0.02em',
        fontFamily: 'var(--font-mono, monospace)',
      }}
      title={family.name}
    >
      {family.name.slice(0, 2).toUpperCase()}
    </div>
  );
}
