import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = supabaseServer();

  // Köllum á RPC fallið (Núna skilar það UUID sem er ekkert mál fyrir React)
  const { data: rankedArticles, error } = await supabase
    .rpc('get_ranked_feed', {
      device_id_input: 'server',
      limit_count: 50,
      offset_count: 0
    });

  if (error) {
    console.error("Villa við að sækja ranked feed:", error);
  }

  // Pökkum gögnunum fyrir NewsFeed
  const formattedArticles = (rankedArticles || []).map((article: any) => {
    return {
      ...article,
      sources: { name: article.source_name || 'Fréttir' }, 
      importance: article.importance || 0
    };
  });

  return (
    <NewsFeed initialArticles={formattedArticles} />
  );
}
