import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient<Database>(url, key, {
  realtime: { params: { eventsPerSecond: 10 } },
});
