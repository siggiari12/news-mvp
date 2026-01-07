"use client";
import { useState, useEffect, useRef } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'innlent' | 'erlent' | 'sport'>('all');

  // --- LEIT ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- HYBRID NAVIGATION STATE ---
  
  // 1. In-Place Lestur (fyrir feedið)
  const [readingId, setReadingId] = useState<string | null>(null);

  // 2. Global Reader (fyrir leit og tengt efni)
  const [readingArticle, setReadingArticle] = useState<any | null>(null);
  const [isReaderExpanded, setIsReaderExpanded] = useState(false); // Stýrir bakhlið í Global Reader

  // Ref til að stoppa polling ef notandi er að gera eitthvað
  const isBusyRef = useRef(false);
  useEffect(() => { 
      isBusyRef.current = !!readingId || !!readingArticle; 
  }, [readingId, readingArticle]);

  // --- HELPER: Opna frétt í Global Reader (úr leit/tengdu) ---
  const openGlobalArticle = (article: any) => {
      setReadingArticle(article);
      setIsReaderExpanded(false); // Byrja á framhlið
  };

  // --- HELPER: Opna tengda frétt (Sækir gögn og opnar Global Reader) ---
  const handleRelatedClick = async (relatedArticle: any) => {
      console.log("Sæki fulla frétt fyrir:", relatedArticle.id);
      const { data } = await supabaseBrowser
          .from('articles')
          .select('*, sources(name)')
          .eq('id', relatedArticle.id)
          .single();
      
      if (data) {
          const formattedRelated = {
              ...data,
              topic_id: data.id,
              article_count: 1,
              sources: data.sources
          };
          openGlobalArticle(formattedRelated);
      }
  };

  const fetchNews = async () => {
    if (isBusyRef.current) return; // Ekki uppfæra ef notandi er upptekinn

    console.log("Sæki nýjar fréttir...");
    const { data } = await supabaseBrowser
      .from('topics')
      .select(`*, articles (id, title, excerpt, full_text, url, published_at, image_url, sources(name))`)
      .order('updated_at', { ascending: false })
      .limit(100); // 100 er passlegt fyrir mobile performance
    
    if (data) {
      const formattedArticles = formatData(data);
      setArticles(formattedArticles);
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
        const res = await fetch('/api/search', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: searchQuery })
        });
        const data = await res.json();
        const formatted = data.articles.map((a: any) => ({
            ...a,
            topic_id: a.id,
            article_count: 1,
            category: 'search'
        }));
        setSearchResults(formatted);
    } catch (error) { console.error(error); } finally { setIsSearching(false); }
  };

  const formatData = (data: any[]) => {
      return data.map((topic: any) => {
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
  };

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    fetchNews();
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            window.scrollTo(0, 0);
            fetchNews();
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabaseBrowser
      .channel('realtime-topics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, (payload) => {
        fetchNews();
      })
      .subscribe();

    const interval = setInterval(() => { fetchNews(); }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const filteredArticles = articles.filter(article => {
    if (activeCategory === 'all') return true;
    const cat = (article.category || '').toLowerCase().trim();
    return cat === activeCategory;
  });

  if (loading) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main className="feed-container">
      {/* --- TOP BAR --- */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 100, 
        padding: '20px 0', paddingTop: 'calc(20px + env(safe-area-inset-top))',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
        pointerEvents: 'none'
      }}>
        {!showSearch && (
            <div style={{display: 'flex', gap: '15px', pointerEvents: 'auto'}}>
                <button onClick={() => setActiveCategory('all')} style={catStyle(activeCategory === 'all')}>ALLT</button>
                <button onClick={() => setActiveCategory('innlent')} style={catStyle(activeCategory === 'innlent')}>INNLENT</button>
                <button onClick={() => setActiveCategory('erlent')} style={catStyle(activeCategory === 'erlent')}>ERLENT</button>
                <button onClick={() => setActiveCategory('sport')} style={catStyle(activeCategory === 'sport')}>ÍÞRÓTTIR</button>
                <button onClick={() => { setShowSearch(true); setSearchResults([]); }} style={catStyle(false)}>🔍</button>
            </div>
        )}

        {showSearch && (
            <form onSubmit={handleSearch} style={{display: 'flex', gap: '10px', width: '90%', maxWidth: '400px', pointerEvents: 'auto'}}>
                <input 
                    autoFocus type="text" placeholder="Leita..." value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        flex: 1, padding: '12px 20px', borderRadius: '30px', border: 'none', 
                        background: 'rgba(50,50,50,0.9)', color: 'white', fontSize: '1rem'
                    }}
                />
                <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{background:'none', border:'none', fontSize:'1.2rem'}}>❌</button>
            </form>
        )}
      </div>

      {/* --- LISTI (SEARCH VS FEED) --- */}
      {showSearch ? (
          // LEITARNIÐURSTÖÐUR -> Opna Global Reader
          <div style={{padding: '100px 20px 20px 20px', minHeight: '100vh', background: '#111'}}>
              {isSearching && <p style={{textAlign:'center', color:'#888', marginTop:'20px'}}>Leita...</p>}
              {!isSearching && searchResults.length === 0 && searchQuery && <p style={{textAlign:'center', color:'#888', marginTop:'20px'}}>Ekkert fannst.</p>}
              {searchResults.map(result => (
                  <div key={result.id} onClick={() => openGlobalArticle(result)} style={{
                      padding: '15px', borderBottom: '1px solid #333', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: '5px'
                  }}>
                      <h3 style={{margin: 0, fontSize: '1rem', color: 'white'}}>{result.title}</h3>
                      <div style={{fontSize: '0.8rem', color: '#888'}}>
                          {result.sources?.name} • {new Date(result.published_at).toLocaleDateString('is-IS')}
                      </div>
                  </div>
              ))}
          </div>
      ) : (
          // FEED -> Opna In-Place (nema ef smellt er á tengt)
          filteredArticles.map((article) => (
            <NewsCard 
                key={article.id} 
                article={article}
                isExpanded={readingId === article.id} // In-Place stækkun
                onOpen={() => setReadingId(article.id)} // Opna In-Place
                onClose={() => setReadingId(null)} // Loka In-Place
                // Ef smellt er á tengt efni hér -> Opna Global Reader
                onRelatedClick={handleRelatedClick}
            />
          ))
      )}

      {/* --- GLOBAL READER (Yfirlag) --- */}
      {/* Birtist þegar readingArticle er sett (úr leit eða tengdu efni) */}
      {readingArticle && (
          <div style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 200, background: 'black'}}>
              <NewsCard 
                  key={readingArticle.id} 
                  article={readingArticle}
                  isExpanded={isReaderExpanded} // Stýrt af Global Reader state
                  showCloseButton={true} // <--- SENDA ÞETTA INN
                  onOpen={() => setIsReaderExpanded(true)}
                  onClose={() => {
                      if (isReaderExpanded) setIsReaderExpanded(false);
                      else setReadingArticle(null);
                  }}
                  onRelatedClick={handleRelatedClick} // Opnar nýja frétt í sama glugga
              />
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

