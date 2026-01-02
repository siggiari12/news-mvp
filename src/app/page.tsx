import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed";

// Þetta segir Next.js: "Aldrei geyma þessa síðu í minni, sæktu alltaf nýtt!"
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  // ...


  const { data: articles } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .order('published_at', { ascending: false })
    .limit(20);

  // Sendum gögnin í NewsFeed componentinn sem sér um restina
  return <NewsFeed articles={articles || []} />;
}
