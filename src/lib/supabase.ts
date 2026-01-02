import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Þessi tengist með "public" lyklinum (má nota í vafra)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Þessi tengist með "service" lyklinum (bara á server)
export const supabaseServer = () => {
  try {
    cookies(); // Þetta gerir kallið dynamic
  } catch (error) {
    // Ignorum villu ef við erum ekki í request context (t.d. í cron jobbi)
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
};
