'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export function useTripRealtime(tripId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'items', filter: `trip_id=eq.${tripId}` } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['items', tripId] });
        }
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'item_claims' } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['claims', tripId] });
        }
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'families', filter: `trip_id=eq.${tripId}` } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['trip'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, qc]);
}
