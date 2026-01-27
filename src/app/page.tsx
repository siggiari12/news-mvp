import { supabaseServer } from "@/lib/supabase";
import FeedWrapper from "@/components/FeedWrapper"; // BREYTING: Notum Wrapperinn

// ISR: Cache for 60 seconds, revalidate in background
export const revalidate = 60;

export default async function Home() {
  const supabase = supabaseServer();

  // Köllum á RPC fallið (Heilann)
  const { data: rankedArticles, error } = await supabase
    .rpc('get_ranked_feed', {
      device_id_input: 'server',
      limit_count: 15,  // Reduced for faster initial load
      offset_count: 0
    });

  if (error) {
    console.error("Villa við að sækja ranked feed:", error);
  }

  // Pökkum gögnunum
  const formattedArticles = (rankedArticles || []).map((article: any) => {
    return {
      ...article,
      sources: { name: article.source_name || 'Fréttir' }, 
      importance: article.importance || 0
    };
  });

  // BREYTING: Skilum FeedWrapper í staðinn fyrir NewsFeed
  // FeedWrapper sér um að rendera Header, Filter og NewsFeed með réttum props.
  return (
    <FeedWrapper initialArticles={formattedArticles} />
  );
}
