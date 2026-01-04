import { supabaseServer } from "@/lib/supabase";
import NewsFeed from "@/components/NewsFeed";

// Þetta tryggir að síðan sé alltaf ný (ekki cache-uð af Vercel)
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Notum þinn eigin server client
  const supabase = supabaseServer();

  // 1. Sækjum TOPICS (nákvæmlega eins og NewsFeed gerir)
  const { data: topics } = await supabase
    .from('topics')
    .select(`
      *,
      articles (
        id, title, excerpt, full_text, url, published_at, image_url, sources(name)
      )
    `)
    .order('updated_at', { ascending: false })
    .limit(20);

  // 2. Pökkum gögnunum (Format)
  // Við gerum þetta hér líka til að "Initial Data" passi við það sem NewsFeed býst við
  const formattedArticles = (topics || []).map((topic: any) => {
    const mainArticle = topic.articles && topic.articles.length > 0 ? topic.articles[0] : null;
    
    return {
      id: topic.id,
      topic_id: topic.id,
      title: topic.title,
      excerpt: topic.summary || mainArticle?.excerpt,
      image_url: topic.image_url || mainArticle?.image_url,
      published_at: topic.updated_at,
      article_count: topic.article_count,
      category: topic.category,
      sources: mainArticle?.sources || { name: 'Samantekt' },
      full_text: mainArticle?.full_text,
      url: mainArticle?.url
    };
  });

  return (
    <NewsFeed initialArticles={formattedArticles} />
  );
}
