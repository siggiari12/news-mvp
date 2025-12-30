import { supabaseServer } from "@/lib/supabase";

// Þetta segir Next.js að sækja ný gögn í hvert skipti (ekki geyma gamalt í minni)
export const dynamic = 'force-dynamic';

export default async function Home() {
  // 1. Tengjast gagnagrunni
  const supabase = supabaseServer();

  // 2. Sækja fréttir (og nafn á miðli úr 'sources' töflu)
  const { data: articles } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .order('published_at', { ascending: false })
    .limit(50);

  return (
    <main className="container">
      <div className="header">
        <h1>Fréttavaktin 🇮🇸</h1>
        {/* Hnappur sem fer á API-ið okkar til að sækja nýtt */}
        <a href="/api/ingest" target="_blank" className="refresh-btn">
          🔄 Sækja nýjar fréttir
        </a>
      </div>

      <div className="feed">
        {articles?.map((article: any) => (
          <article key={article.id} className="article-card">
            <div className="meta">
              {/* Sýna nafn miðils (t.d. RÚV) og dagsetningu */}
              <span style={{ fontWeight: 'bold', color: '#0070f3' }}>
                {article.sources?.name}
              </span>
              {' • '}
              {new Date(article.published_at).toLocaleString('is-IS')}
            </div>
            
            <h2 className="title">
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h2>
            
            <p className="excerpt">{article.excerpt}</p>
          </article>
        ))}

        {articles?.length === 0 && (
          <p style={{textAlign: 'center'}}>Engar fréttir fundust. Prófaðu að smella á "Sækja nýjar fréttir"!</p>
        )}
      </div>
    </main>
  );
}
