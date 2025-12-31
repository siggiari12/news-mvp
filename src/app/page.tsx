import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed"; // Sækjum nýja componentinn

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = supabaseServer();

  const { data: articles } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .order('published_at', { ascending: false })
    .limit(20);

  // Sendum gögnin í NewsFeed componentinn sem sér um restina
  return <NewsFeed articles={articles || []} />;
}
