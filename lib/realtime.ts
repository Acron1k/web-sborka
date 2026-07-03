'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'error';

export function useTripRealtime(tripId: string): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('idle');

  useEffect(() => {
    if (!tripId) return;
    setStatus('connecting');

    const es = new EventSource(`/api/events?tripId=${tripId}`);

    es.onopen = () => setStatus('live');
    // EventSource реконнектится сам; на время обрыва показываем error
    es.onerror = () => setStatus('error');

    es.addEventListener('change', (e) => {
      const { table } = JSON.parse((e as MessageEvent).data) as { table: string };
      switch (table) {
        case 'items':
          qc.invalidateQueries({ queryKey: ['items', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
          break;
        case 'item_claims':
          qc.invalidateQueries({ queryKey: ['claims', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
          break;
        case 'families':
          qc.invalidateQueries({ queryKey: ['trip'] });
          break;
        case 'ai_suggestions':
          qc.invalidateQueries({ queryKey: ['suggestions', tripId] });
          break;
      }
    });

    return () => {
      es.close();
      setStatus('idle');
    };
  }, [tripId, qc]);

  return status;
}
