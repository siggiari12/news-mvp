"use client";
import { useState, useEffect } from "react";
import NewsModal from "./NewsModal";
import { supabaseBrowser } from "@/lib/supabase";

const getBranding = (sourceName: string | undefined) => {
  const name = (sourceName || '').toLowerCase();
  if (name.includes('mbl')) return { bg: '#3b5e91', logo: '/mbl.png', scale: '80%' };
  if (name.includes('rúv') || name.includes('ruv')) return { bg: '#00477f', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg', scale: '60%' };
  if (name.includes('vísir') || name.includes('visir')) return { bg: '#f4d100', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg', scale: '60%' };
  if (name.includes('dv')) return { bg: '#d0021b', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png', scale: '60%' };
  return { bg: '#222', logo: null, scale: '100%' };
};

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      // console.log("Sæki nýjar fréttir...");
      const { data } = await supabaseBrowser
        .from('articles')
        .select('*, sources(name)')
        .order('published_at', { ascending: false })
        .limit(50);
      
      if (data) {
        setArticles(prev => {
            // Ef engin breyting er á nýjustu fréttinni, sleppum uppfærslu (minnkar flökt)
            if (prev.length > 0 && data.length > 0 && prev[0].id === data[0].id) return prev;
            return data;
        });
        setLoading(false);
      }
    };

    // 1. Sækja strax í byrjun
    fetchNews();
    
    // 2. Realtime hlustun (Ef gagnagrunnurinn lætur vita)
    const channel = supabaseBrowser
      .channel('realtime-articles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'articles' }, (payload) => {
        console.log("Ný frétt kom (Realtime)!", payload);
        fetchNews();
      })
      .subscribe();

    // 3. Polling (Öryggisnet): Sækja á 60 sek fresti
    const interval = setInterval(() => {
      fetchNews();
    }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
        <div style={{background: '#000', height: '100vh', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'}}>
          <style>{`@keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } } .skeleton { background: #333; border-radius: 8px; animation: pulse 1.5s infinite ease-in-out; }`}</style>
          <div className="skeleton" style={{width: '100px', height: '16px', marginBottom: '16px'}}></div>
          <div className="skeleton" style={{width: '90%', height: '32px', marginBottom: '12px'}}></div>
          <div className="skeleton" style={{width: '70%', height: '32px', marginBottom: '40px'}}></div>
        </div>
    );
  }

  const openArticle = (article: any) => {
    setSelectedArticle(article);
  };

  return (
    <main className="feed-container">
      {selectedArticle && (
        <NewsModal 
          article={selectedArticle} 
          onClose={() => setSelectedArticle(null)} 
        />
      )}

      {articles.map((article) => {
        const branding = getBranding(article.sources?.name);

        return (
          <section key={article.id} className="news-card">
            
            {/* 1. BRANDED BAKGRUNNUR */}
            <div className="bg-image" style={{
              background: branding.bg,
              zIndex: 0, 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column'
            }}>
                {branding.logo && (
                  <img 
                    src={branding.logo} 
                    alt={article.sources?.name}
                    style={{
                      width: branding.scale, 
                      maxWidth: '80%', 
                      opacity: 0.9,
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                      display: 'block'
                    }} 
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      const textFallback = img.nextElementSibling as HTMLElement;
                      if (textFallback) textFallback.style.display = 'block';
                    }}
                  />
                )}

                <h1 
                  style={{
                    fontSize: '4rem', 
                    color: 'rgba(255,255,255,0.2)', 
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    display: branding.logo ? 'none' : 'block' 
                  }}
                >
                  {article.sources?.name}
                </h1>
            </div>

            {/* 2. FRÉTTAMYND */}
            {article.image_url && (
              <img 
                src={article.image_url} 
                alt="" 
                className="bg-image"
                style={{ zIndex: 1 }}
                onError={(e) => { 
                  (e.target as HTMLImageElement).style.display = 'none'; 
                }}
              />
            )}
            
            <div className="overlay" style={{zIndex: 2}}></div>

            <div className="source-badge" style={{zIndex: 3}}>
              {article.sources?.name} • {new Date(article.published_at).toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'})}
            </div>

            <div className="content" style={{zIndex: 3}}>
              <h2 className="title" onClick={() => openArticle(article)} style={{cursor: 'pointer'}}>
                {article.title}
              </h2>
              
              <p className="excerpt" onClick={() => openArticle(article)} style={{cursor: 'pointer'}}>
                {article.excerpt}
              </p>

              <div style={{marginTop: '20px'}}>
                <button 
                  onClick={() => openArticle(article)}
                  style={{
                    background: 'rgba(255,255,255,0.2)', 
                    color: 'white', border: '1px solid rgba(255,255,255,0.4)', 
                    padding: '12px 24px', borderRadius: '30px', 
                    fontWeight: 'bold', backdropFilter: 'blur(5px)', cursor: 'pointer',
                    fontSize: '1rem',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                    transition: 'transform 0.1s'
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  Lesa meira
                </button>
              </div>
            </div>
          </section>
        );
      })}
      
      {articles.length === 0 && (
         <div className="news-card" style={{justifyContent: 'center', alignItems: 'center'}}>
            <h2>Engar fréttir fundust 😢</h2>
            <p>Appið er að leita...</p>
         </div>
      )}
    </main>
  );
}
