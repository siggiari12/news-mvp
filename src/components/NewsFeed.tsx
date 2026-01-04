"use client";
import { useState, useEffect } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'innlent' | 'erlent' | 'sport'>('all');

  useEffect(() => {
    const fetchNews = async () => {
      // 1. Sækjum TOPICS (í staðinn fyrir articles)
      const { data } = await supabaseBrowser
        .from('topics')
        .select(`
          *,
          articles (
            id, title, excerpt, full_text, url, published_at, image_url, sources(name)
          )
        `)
        .order('updated_at', { ascending: false })
        .limit(100);
      
      if (data) {
        // 2. Pökkum gögnunum fyrir NewsCard
        const formattedArticles = data.map((topic: any) => {
          // Finnum nýjustu fréttina í þessu topici
          const mainArticle = topic.articles && topic.articles.length > 0 ? topic.articles[0] : null;
          
          // Debug: Sjáum hvort við finnum stórmál
          if (topic.article_count > 1) {
             console.log(`🔥 Fann stórmál: ${topic.title} (${topic.article_count} miðlar)`);
          }

          return {
            id: topic.id,      // Topic ID
            topic_id: topic.id,
            title: topic.title,
            // Ef engin samantekt, notum excerpt úr frétt
            excerpt: topic.summary || mainArticle?.excerpt,
            // Ef engin topic mynd, notum mynd úr frétt
            image_url: topic.image_url || mainArticle?.image_url,
            published_at: topic.updated_at,
            article_count: topic.article_count, // Stjórnar eldinum
            category: topic.category,
            
            // Upplýsingar um miðil
            sources: mainArticle?.sources || { name: 'Samantekt' },
            
            // Fyrir staka frétt
            full_text: mainArticle?.full_text,
            url: mainArticle?.url
          };
        });

        setArticles(prev => {
            // Komum í veg fyrir flökt ef gögnin eru eins
            if (prev.length > 0 && formattedArticles.length > 0 && prev[0].id === formattedArticles[0].id) return prev;
            return formattedArticles;
        });
        setLoading(false);
      }
    };

    fetchNews();
    
    // 3. Hlustum á breytingar í TOPICS töflunni
    const channel = supabaseBrowser
      .channel('realtime-topics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, (payload) => {
        console.log("Uppfærsla á topics!", payload);
        fetchNews();
      })
      .subscribe();

    const interval = setInterval(() => { fetchNews(); }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
    };
  }, []);

  const filteredArticles = articles.filter(article => {
    if (activeCategory === 'all') return true;
    return article.category === activeCategory;
  });

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

  return (
    <main key={activeCategory} className="feed-container">
      
      {/* FLIPAR */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', 
        zIndex: 100, 
        padding: '20px 0',
        paddingTop: 'calc(20px + env(safe-area-inset-top))',
        display: 'flex', justifyContent: 'center', gap: '15px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
        pointerEvents: 'none'
      }}>
        <button onClick={() => setActiveCategory('all')} style={catStyle(activeCategory === 'all')}>ALLT</button>
        <button onClick={() => setActiveCategory('innlent')} style={catStyle(activeCategory === 'innlent')}>INNLENT</button>
        <button onClick={() => setActiveCategory('erlent')} style={catStyle(activeCategory === 'erlent')}>ERLENT</button>
        <button onClick={() => setActiveCategory('sport')} style={catStyle(activeCategory === 'sport')}>ÍÞRÓTTIR</button>
      </div>

      {/* FRÉTTIR */}
      {filteredArticles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
      
      {filteredArticles.length === 0 && (
         <div className="news-card" style={{justifyContent: 'center', alignItems: 'center'}}>
            <h2>Engar fréttir í þessum flokki</h2>
         </div>
      )}
    </main>
  );
}

function catStyle(isActive: boolean) {
  return {
    pointerEvents: 'auto' as const,
    background: 'none', border: 'none', 
    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)', 
    fontWeight: isActive ? '600' : '400', 
    fontSize: '0.9rem', 
    textTransform: 'capitalize' as const, 
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'all 0.2s',
    borderBottom: isActive ? '1px solid white' : '1px solid transparent',
    paddingBottom: '2px'
  };
}
