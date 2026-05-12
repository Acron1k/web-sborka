import { supabase } from '@/lib/supabase/client';
import type { Trip, Family } from '@/lib/db/types';

export async function fetchTripBySlug(slug: string): Promise<{ trip: Trip; families: Family[] } | null> {
  const { data: trip } = await supabase.from('trips').select('*').eq('slug', slug).single();
  if (!trip) return null;
  const { data: families } = await supabase
    .from('families')
    .select('*')
    .eq('trip_id', trip.id)
    .order('position');
  return { trip, families: families ?? [] };
}
