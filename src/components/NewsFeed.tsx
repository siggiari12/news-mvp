"use client";
import { useState, useEffect, useRef } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'innlent' | 'erlent' | 'sport'>('all');

  // --- NÝTT: Fylgjumst með hvort notandi sé að lesa ---
  const [readingId, setReadingId] = useState<string | null>(null);
  const isReadingRef = useRef(false);

  // Uppfærum ref svo fetchNews viti af stöðunni inni í intervalinu
  useEffect(() => {
    isReadingRef.current = !!readingId;
  }, [readingId]);

  const fetchNews = async () => {
    // --- MIKILVÆGT: Ef notandi er að lesa, EKKI uppfæra listann ---
    if (isReadingRef.current) {
        console.log("Notandi að lesa, fresta uppfærslu...");
        return;
    }

    console.log("Sæki nýjar fréttir...");
    const { data } = await supabaseBrowser
      .from('topics')
      .select(`
        *,
        articles (
          id, title, excerpt, full_text, url, published_at, image_url, sources(name)
        )
      `)
      .order('updated_at', { ascending: false })
      .limit(200); // Sækjum 200
    
    if (data) {
      console.log("Supabase skilaði:", data.length, "færslum."); // DEBUG

      const formattedArticles = data.map((topic: any) => {
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

      // --- BREYTING: Uppfærum ALLTAF (tökum út optimization tékkið) ---
      setArticles(formattedArticles);
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Slökkvum á scroll restoration
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    // 2. Skrollum efst strax
    window.scrollTo(0, 0);

    // 3. Sækjum fréttir
    fetchNews();
    
    // 4. Hlustum eftir visibility
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            console.log("App orðið sýnilegt -> Refresh og Scroll Top");
            window.scrollTo(0, 0);
            fetchNews();
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 5. Realtime
    const channel = supabaseBrowser
      .channel('realtime-topics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, (payload) => {
        console.log("Uppfærsla á topics!", payload);
        fetchNews();
      })
      .subscribe();

    // 6. Polling
    const interval = setInterval(() => { fetchNews(); }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- BREYTING: Case-insensitive filter ---
  const filteredArticles = articles.filter(article => {
    if (activeCategory === 'all') return true;
    const cat = (article.category || '').toLowerCase().trim();
    return cat === activeCategory;
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

      {filteredArticles.map((article) => (
        <NewsCard 
            key={article.id} 
            article={article}
            isExpanded={readingId === article.id}
            onOpen={() => setReadingId(article.id)}
            onClose={() => setReadingId(null)}
        />
      ))}
      
      {filteredArticles.length === 0 && (
         <div className="news-card" style={{justifyContent: 'center', alignItems: 'center'}}>
            <h2>Engar fréttir í þessum flokki</h2>
            <p style={{color: '#888', marginTop: '10px'}}>Prófaðu annan flokk.</p>
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
