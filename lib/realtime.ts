'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'error';

export function useTripRealtime(tripId: string): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('idle');

  useEffect(() => {
    if (!tripId) return;
    setStatus('connecting');

    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'items', filter: `trip_id=eq.${tripId}` } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['items', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
        }
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'item_claims' } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['claims', tripId] });
          qc.invalidateQueries({ queryKey: ['packing', tripId] });
          qc.invalidateQueries({ queryKey: ['shopping', tripId] });
        }
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'families', filter: `trip_id=eq.${tripId}` } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['trip'] });
        }
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'ai_suggestions', filter: `trip_id=eq.${tripId}` } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['suggestions', tripId] });
        }
      )
      .subscribe((subStatus) => {
        if (subStatus === 'SUBSCRIBED') setStatus('live');
        else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') setStatus('error');
        else if (subStatus === 'CLOSED') setStatus('idle');
      });

    return () => {
      supabase.removeChannel(channel);
      setStatus('idle');
    };
  }, [tripId, qc]);

  return status;
}
