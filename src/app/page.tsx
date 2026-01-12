import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed";

// Þetta tryggir að síðan sé alltaf ný (ekki cache-uð af Vercel)
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = supabaseServer();

  // Köllum á RPC fallið (Heilann)
  // Við sendum 'server' sem device_id í bili (persónuleg röðun kemur síðar)
  const { data: rankedArticles, error } = await supabase
    .rpc('get_ranked_feed', {
      device_id_input: 'server',
      limit_count: 50, // Sækjum nóg til að fylla alla flokka
      offset_count: 0
    });

  if (error) {
    console.error("Villa við að sækja ranked feed:", error);
  }

  // Pökkum gögnunum fyrir NewsFeed
  const formattedArticles = (rankedArticles || []).map((article: any) => {
    return {
      id: article.id,
      topic_id: article.topic_id,
      title: article.title,
      excerpt: article.excerpt, 
      full_text: article.full_text,
      image_url: article.image_url,
      published_at: article.published_at,
      article_count: article.article_count,
      category: article.category,
      importance: article.importance, // Passa að þetta fylgi með
      sources: { name: article.source_name }, 
      url: article.url 
    };
  });

  return (
    <NewsFeed initialArticles={formattedArticles} />
  );
}
