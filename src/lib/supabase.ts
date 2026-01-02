import { createClient } from '@supabase/supabase-js';

// Þessi tengist með "public" lyklinum (má nota í vafra)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Þessi tengist með "service" lyklinum (bara á server - hefur fullan aðgang)
export const supabaseServer = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
