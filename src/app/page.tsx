import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed";

// Þessar línur tryggja að síðan sé alltaf ný (engin cache)
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function Home() {
  const supabase = supabaseServer();

  // Sækjum 50 nýjustu fréttirnar
  const { data: articles } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .order('published_at', { ascending: false })
    .limit(50);

  return <NewsFeed articles={articles || []} />;
}
