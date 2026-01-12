"use client";
import { useState, useEffect, useRef } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

// --- SVG IKON ---
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  
  // Uppfærðir flokkar: 'fyrir_thig' í stað 'all', og 'folk' bætt við
  const [activeCategory, setActiveCategory] = useState<'fyrir_thig' | 'innlent' | 'erlent' | 'folk' | 'sport'>('fyrir_thig');

  // --- LEIT ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- HYBRID NAVIGATION STATE ---
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readingArticle, setReadingArticle] = useState<any | null>(null);
  const [isReaderExpanded, setIsReaderExpanded] = useState(false); 

  const isBusyRef = useRef(false);
  useEffect(() => { 
      isBusyRef.current = !!readingId || !!readingArticle; 
  }, [readingId, readingArticle]);

  const openGlobalArticle = (article: any) => {
      setReadingArticle(article);
      setIsReaderExpanded(false); 
  };

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
    if (isBusyRef.current) return;

    // Sækjum deviceId fyrir persónulega röðun (seinna)
    const deviceId = localStorage.getItem('vizka_device_id') || 'unknown';

    console.log("Sæki nýjar fréttir...");
    
    // Köllum á RPC fallið (Heilann) í staðinn fyrir töfluna beint
    // Þetta tryggir að við fáum raðaðan lista (vinsældir + tími)
    const { data } = await supabaseBrowser
      .rpc('get_ranked_feed', { 
        device_id_input: deviceId,
        limit_count: 50, // Sækjum nóg til að fylla flokkana
        offset_count: 0 
      });
    
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
      return data.map((article: any) => {
        return {
          id: article.id,
          topic_id: article.topic_id,
          title: article.title,
          excerpt: article.excerpt,
          image_url: article.image_url,
          published_at: article.published_at,
          article_count: article.article_count,
          category: article.category,
          importance: article.importance || 0, // Passa að þetta sé með
          sources: { name: article.source_name }, // NewsCard býst við object
          full_text: article.full_text,
          url: article.url
        };
      });
  };

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    fetchNews(); // Sækjum strax til að fá nýjustu röðun
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            window.scrollTo(0, 0);
            fetchNews();
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabaseBrowser
      .channel('realtime-topics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, () => {
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

  // --- SÍAN (FILTER) ---
  const filteredArticles = articles.filter(article => {
    const cat = (article.category || '').toLowerCase().trim();
    const imp = article.importance || 0;

    // MIKILVÆGT: Ef frétt er mjög mikilvæg (8+), sýnum hana alltaf í 'fyrir_thig' og 'innlent/erlent'
    // en pössum að blanda ekki sporti og pólitík nema nauðsyn krefji.
    
    if (activeCategory === 'fyrir_thig') return true; // Sýna allt í 'Fyrir þig' (raðað af SQL)
    
    if (activeCategory === 'folk') return cat === 'folk';
    if (activeCategory === 'sport') return cat === 'sport';
    
    if (activeCategory === 'innlent') {
        return cat === 'innlent' || (imp >= 8 && cat !== 'sport' && cat !== 'erlent');
    }
    if (activeCategory === 'erlent') {
        return cat === 'erlent' || (imp >= 8 && cat !== 'sport' && cat !== 'innlent');
    }
    
    return cat === activeCategory;
  });

  if (loading) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main className="feed-container">
      {/* --- TOP BAR --- */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 100, 
        padding: '15px 0', paddingTop: 'calc(15px + env(safe-area-inset-top))',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
        pointerEvents: 'none'
      }}>
        {!showSearch && (
            <div style={{
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'space-between', 
                width: '100%', 
                pointerEvents: 'auto',
                overflowX: 'auto', 
                whiteSpace: 'nowrap', 
                padding: '0 25px', 
                scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch'
            }}>
                <style>{`::-webkit-scrollbar { display: none; }`}</style>
                
                {/* UPPFÆRÐIR FLIPAR */}
                <button onClick={() => setActiveCategory('fyrir_thig')} style={catStyle(activeCategory === 'fyrir_thig')}>FYRIR ÞIG</button>
                <button onClick={() => setActiveCategory('innlent')} style={catStyle(activeCategory === 'innlent')}>INNLENT</button>
                <button onClick={() => setActiveCategory('erlent')} style={catStyle(activeCategory === 'erlent')}>ERLENT</button>
                <button onClick={() => setActiveCategory('folk')} style={catStyle(activeCategory === 'folk')}>FÓLK</button>
                <button onClick={() => setActiveCategory('sport')} style={catStyle(activeCategory === 'sport')}>SPORT</button>
                
                <button 
                    onClick={() => { setShowSearch(true); setSearchResults([]); }} 
                    style={{ ...catStyle(false), marginLeft: '0' }} 
                >
                    <SearchIcon/>
                </button>
            </div>
        )}
        {showSearch && (
            <form onSubmit={handleSearch} style={{display: 'flex', gap: '10px', width: '90%', maxWidth: '400px', pointerEvents: 'auto'}}>
                <div style={{position: 'relative', flex: 1}}>
                    <input 
                        autoFocus type="text" placeholder="Leita..." value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 20px', borderRadius: '30px', border: 'none', 
                            background: 'rgba(50,50,50,0.9)', color: 'white', fontSize: '1rem'
                        }}
                    />
                </div>
                <button type="button" onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{background:'none', border:'none', color:'white'}}><CloseIcon/></button>
            </form>
        )}
      </div>

      {/* --- LISTI --- */}
      {showSearch ? (
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
          filteredArticles.map((article) => (
            <NewsCard 
                key={article.id} 
                article={article}
                isExpanded={readingId === article.id} 
                onOpen={() => setReadingId(article.id)} 
                onClose={() => setReadingId(null)} 
                onRelatedClick={handleRelatedClick} 
            />
          ))
      )}

      {/* --- GLOBAL READER --- */}
      {readingArticle && (
          <div style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 200, background: 'black'}}>
              <NewsCard 
                  key={readingArticle.id} 
                  article={readingArticle}
                  isExpanded={isReaderExpanded} 
                  showCloseButton={true} 
                  onOpen={() => setIsReaderExpanded(true)}
                  onClose={() => {
                      if (isReaderExpanded) setIsReaderExpanded(false);
                      else setReadingArticle(null);
                  }}
                  onRelatedClick={handleRelatedClick} 
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
    fontWeight: isActive ? '700' : '500', 
    fontSize: '0.85rem', 
    textTransform: 'uppercase' as const, 
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'all 0.2s',
    borderBottom: isActive ? '2px solid white' : '2px solid transparent',
    paddingBottom: '4px',
    flexShrink: 0
  };
}
