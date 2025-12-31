import { supabaseServer } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = supabaseServer();

  // Sækjum fréttir (með myndum núna!)
  const { data: articles } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .order('published_at', { ascending: false })
    .limit(20);

  return (
    <main className="feed-container">
      {/* Refresh takki */}
      <a href="/api/ingest" target="_blank" className="refresh-btn">
        🔄
      </a>

      {articles?.map((article: any) => (
        <section key={article.id} className="news-card">
          
          {/* --- 1. MYNDIN (Bakgrunnur) --- */}
          {/* Við setjum hana fremst svo hún lendi aftast (z-index) */}
          {article.image_url && (
            <img 
              src={article.image_url} 
              alt="Fréttamynd" 
              className="bg-image" 
            />
          )}

          {/* --- 2. SKUGGINN (Overlay) --- */}
          {/* Þessi gerir textann læsilegan */}
          <div className="overlay"></div>

          {/* --- 3. EFNIÐ (Textinn ofan á) --- */}
          <div className="source-badge">
            {article.sources?.name} • {new Date(article.published_at).toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'})}
          </div>

          <div className="content">
            <h2 className="title">
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            </h2>
            
            <p className="excerpt">
              {article.excerpt}
            </p>

            <div style={{marginTop: '20px'}}>
               <button style={{
                 background: 'rgba(255,255,255,0.2)', 
                 color: 'white', 
                 border: '1px solid rgba(255,255,255,0.4)', 
                 padding: '10px 20px', 
                 borderRadius: '20px', 
                 fontWeight: 'bold',
                 backdropFilter: 'blur(5px)',
                 cursor: 'pointer'
               }}>
                 🤖 Útskýra fyrir mér
               </button>
            </div>
          </div>
        </section>
      ))}

      {articles?.length === 0 && (
        <div className="news-card" style={{alignItems: 'center', textAlign: 'center', background: '#222'}}>
          <h2>Engar fréttir fundust!</h2>
          <p>Prófaðu að keyra /api/ingest aftur.</p>
        </div>
      )}
    </main>
  );
}
