import type { RealtimeStatus } from '@/lib/realtime';

const STATE_CONFIG: Record<RealtimeStatus, { color: string; label: string; pulse: boolean }> = {
  live: { color: 'bg-emerald-500', label: 'live', pulse: true },
  connecting: { color: 'bg-amber-500', label: 'связь', pulse: true },
  error: { color: 'bg-destructive', label: 'ошибка', pulse: false },
  idle: { color: 'bg-muted-foreground/40', label: 'оффлайн', pulse: false },
};

const TITLES: Record<RealtimeStatus, string> = {
  live: 'Подключено · изменения приходят сразу',
  connecting: 'Подключаемся к realtime…',
  error: 'Realtime отвалился — обнови страницу',
  idle: 'Не подключено',
};

export function LiveDot({ status, showLabel = true }: { status: RealtimeStatus; showLabel?: boolean }) {
  const cfg = STATE_CONFIG[status];
  return (
    <span
      title={TITLES[status]}
      className="inline-flex items-center gap-1.5"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {cfg.pulse && status === 'live' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.color} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${cfg.color}`} />
      </span>
      {showLabel && (
        <span className="mono-tag text-muted-foreground">{cfg.label}</span>
      )}
    </span>
  );
}
