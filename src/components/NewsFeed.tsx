"use client";
import { useState, useEffect, useRef } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

// --- SVG IKON ---
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

interface NewsFeedProps {
  initialArticles: any[];
  activeCategory: any;
  showSearchProp: boolean;
  onCloseSearch: () => void;
  // NÝTT: Fall til að láta parent vita hvort frétt sé opin (til að fela header)
  onArticleStateChange?: (isOpen: boolean) => void;
}

export default function NewsFeed({ initialArticles, activeCategory, showSearchProp, onCloseSearch, onArticleStateChange }: NewsFeedProps) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  
  // --- LEIT ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowSearch(showSearchProp);
    if (showSearchProp) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearchProp]);

  // --- NAVIGATION STATE ---
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readingArticle, setReadingArticle] = useState<any | null>(null);
  const [isReaderExpanded, setIsReaderExpanded] = useState(false); 

  // --- NÝTT: Láta parent vita ef eitthvað er opið ---
  useEffect(() => {
    if (onArticleStateChange) {
        const isAnyArticleOpen = !!readingId || !!readingArticle;
        onArticleStateChange(isAnyArticleOpen);
    }
  }, [readingId, readingArticle, onArticleStateChange]);

  const isBusyRef = useRef(false);
  useEffect(() => { 
      isBusyRef.current = !!readingId || !!readingArticle; 
  }, [readingId, readingArticle]);

  const openGlobalArticle = (article: any) => {
      setReadingArticle(article);
      setIsReaderExpanded(false); 
      // Ef smellt er úr leit, lokum leitinni líka
      if (showSearch) onCloseSearch();
  };

  const handleRelatedClick = async (relatedArticle: any) => {
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
    const deviceId = localStorage.getItem('vizka_device_id') || 'unknown';
    
    const { data } = await supabaseBrowser
      .rpc('get_ranked_feed', { 
        device_id_input: deviceId,
        limit_count: 60, 
        offset_count: 0 
      });
    
    if (data) {
      setArticles(formatData(data));
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
      return data.map((article: any) => ({
          id: article.id,
          topic_id: article.topic_id,
          title: article.title,
          excerpt: article.excerpt,
          image_url: article.image_url,
          published_at: article.published_at,
          article_count: article.article_count,
          category: article.category,
          importance: article.importance || 0, 
          sources: { name: article.source_name }, 
          full_text: article.full_text,
          url: article.url
      }));
  };

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    fetchNews(); 
    
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') fetchNews(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const channel = supabaseBrowser.channel('realtime-topics').on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, () => fetchNews()).subscribe();
    const interval = setInterval(() => { fetchNews(); }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const filteredArticles = articles.filter(article => {
    const cat = (article.category || '').toLowerCase().trim();
    const imp = article.importance || 0;
    if (activeCategory === 'allt') return true; 
    if (activeCategory === 'folk') return cat === 'folk';
    if (activeCategory === 'sport') return cat === 'sport';
    if (activeCategory === 'innlent') return cat === 'innlent' || (imp >= 8 && cat !== 'sport' && cat !== 'erlent');
    if (activeCategory === 'erlent') return cat === 'erlent' || (imp >= 8 && cat !== 'sport' && cat !== 'innlent');
    return cat === activeCategory;
  });

  if (loading) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main className="feed-container">
      
      {/* --- LEITAR OVERLAY (NÝTT ÚTLIT) --- */}
      {showSearch && (
          <div className="search-overlay">
              
              {/* Top Bar (í stað Header) */}
              <div className="search-top-bar">
                <SearchIcon />
                <form onSubmit={handleSearch} style={{flex: 1, position: 'relative'}}>
                    <input 
                        ref={searchInputRef}
                        className="search-input"
                        type="text" 
                        placeholder="Leita að fréttum..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </form>
                <button onClick={onCloseSearch} style={{background: 'none', border: 'none', color: '#fff', cursor: 'pointer'}}>
                    <CloseIcon />
                </button>
              </div>

              {/* Efni í leit */}
              <div style={{overflowY: 'auto', flex: 1}}>
                
                {/* Vinsælt (Birtist bara ef engin leit er í gangi) */}
                {!searchQuery && searchResults.length === 0 && (
                    <div className="popular-section">
                        <h3 style={{color:'#888', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'10px'}}>Vinsælt núna</h3>
                        <div className="tag-cloud">
                            <span className="search-tag" onClick={() => setSearchQuery("Kosningar")}>Kosningar</span>
                            <span className="search-tag" onClick={() => setSearchQuery("Eldgos")}>Eldgos</span>
                            <span className="search-tag" onClick={() => setSearchQuery("Veðrið")}>Veðrið</span>
                            <span className="search-tag" onClick={() => setSearchQuery("Enski boltinn")}>Enski boltinn</span>
                        </div>
                    </div>
                )}

                {/* Niðurstöður */}
                <div style={{padding: '20px'}}>
                    {isSearching && <p style={{color:'#888'}}>Leita...</p>}
                    {searchResults.map(result => (
                        <div key={result.id} onClick={() => openGlobalArticle(result)} style={{
                            padding: '15px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer'
                        }}>
                            <h3 style={{margin: '0 0 5px 0', fontSize: '1.1rem', color: 'white'}}>{result.title}</h3>
                            <div style={{fontSize: '0.8rem', color: '#888'}}>
                                {result.sources?.name} • {new Date(result.published_at).toLocaleDateString('is-IS')}
                            </div>
                        </div>
                    ))}
                </div>
              </div>
          </div>
      )}

      {/* --- VENJULEGT FEED --- */}
      {filteredArticles.map((article) => (
        <NewsCard 
            key={article.id} 
            article={article}
            isExpanded={readingId === article.id} 
            onOpen={() => setReadingId(article.id)} 
            onClose={() => setReadingId(null)} 
            onRelatedClick={handleRelatedClick} 
        />
      ))}

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
