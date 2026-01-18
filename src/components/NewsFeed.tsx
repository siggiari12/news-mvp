"use client";
import { useState, useEffect, useRef, useCallback } from "react";
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
  onArticleStateChange?: (isOpen: boolean) => void;
}

export default function NewsFeed({ initialArticles, activeCategory, showSearchProp, onCloseSearch, onArticleStateChange }: NewsFeedProps) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  
  // --- PAGINATION & VIRTUALIZATION STATES ---
  const [offset, setOffset] = useState(0);      // Hversu margar fréttir erum við búin að sækja
  const [hasMore, setHasMore] = useState(true); // Eru til fleiri fréttir?
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0); // Hvaða frétt er á skjánum núna?
  
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

    // --- UPPHAFLEG SÓKN (RESET) ---
  const fetchInitialNews = async () => {
    if (isBusyRef.current) return;
    setLoading(true);
    const deviceId = localStorage.getItem('vizka_device_id') || 'unknown';
    
    try {
        const { data } = await supabaseBrowser
          .rpc('get_ranked_feed', { 
            device_id_input: deviceId,
            limit_count: 40, 
            offset_count: 0 
          });
        
        if (data && data.length > 0) {
          setArticles(formatData(data));
          setOffset(40);
          setHasMore(true);
        }
    } catch (e) {
        console.error("Villa við að sækja fréttir:", e);
    } finally {
        setLoading(false);
    }
  };

  // --- SÆKJA MEIRA (INFINITE SCROLL) ---
  const fetchMoreNews = async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);

    const deviceId = localStorage.getItem('vizka_device_id') || 'unknown';
    const nextOffset = offset;
    const limit = 20; 

    try {
        const { data } = await supabaseBrowser
          .rpc('get_ranked_feed', { 
            device_id_input: deviceId,
            limit_count: limit, 
            offset_count: nextOffset 
          });

        if (data && data.length > 0) {
            setArticles(prev => {
                const newArticles = formatData(data);
                // Búum til lista af ID-um sem við eigum nú þegar
                const existingIds = new Set(prev.map(a => a.id));
                
                // Síum út nýju fréttirnar: Tökum bara þær sem eru EKKI til nú þegar
                const uniqueNewArticles = newArticles.filter(a => !existingIds.has(a.id));

                return [...prev, ...uniqueNewArticles];
            });
            setOffset(prev => prev + limit);
        } else {
            setHasMore(false);
        }
    } catch (e) {
        console.error("Villa við að sækja fleiri fréttir:", e);
    } finally {
        // MIKILVÆGT: Þetta verður að keyra til að opna fyrir næsta scroll
        setIsFetchingMore(false);
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
    // Ef við fengum ekki initialArticles, sækjum þær
    if (articles.length === 0) fetchInitialNews();
    
    // Refresh logic (óbreytt)
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') fetchInitialNews(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = setInterval(() => { fetchInitialNews(); }, 300000); // Hækkaði í 5 mín refresh til að trufla ekki scroll

    return () => { 
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- FILTERING ---
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

  // --- SCROLL HANDLER (Virtualization & Infinite Scroll) ---
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
      const target = e.currentTarget;
      const height = target.clientHeight;
      const scrollTop = target.scrollTop;
      
      // 1. Reikna hvaða index er á skjánum
      const index = Math.round(scrollTop / height);
      setActiveIndex(index);

      // 2. Infinite Scroll: Ef við erum nálægt botninum (innan við 5 fréttir), sækja meira
      // Við miðum við filteredArticles lengdina
      if (hasMore && !isFetchingMore && (index >= filteredArticles.length - 5)) {
          fetchMoreNews();
      }
  };

  if (loading && articles.length === 0) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main 
        className="feed-container" 
        onScroll={handleScroll} // Tengjum scroll fallið
    >
      
      {/* --- LEITAR OVERLAY (ÓBREYTT) --- */}
      {showSearch && (
          <div className="search-overlay">
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

              <div style={{overflowY: 'auto', flex: 1}}>
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

      {/* --- VENJULEGT FEED MEÐ VIRTUALIZATION --- */}
      {filteredArticles.map((article, index) => {
        // VIRTUALIZATION LOGIC:
        // Er þessi frétt nálægt skjánum? (Núverandi + 2 fyrir ofan/neðan)
        const isVisible = Math.abs(activeIndex - index) <= 2;

        if (!isVisible) {
            // Ef ekki sýnileg, teikna tóman kassa til að halda plássinu
            return <div key={article.id} style={{height: '100dvh', width: '100%', scrollSnapAlign: 'start'}} />;
        }

        // Ef sýnileg, teikna alvöru kortið
        return (
            <NewsCard 
                key={article.id} 
                article={article}
                isExpanded={readingId === article.id} 
                onOpen={() => setReadingId(article.id)} 
                onClose={() => setReadingId(null)} 
                onRelatedClick={handleRelatedClick} 
            />
        );
      })}

      {/* Hleðslumerki í botninum ef við erum að sækja meira */}
      {isFetchingMore && (
          <div style={{height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>
              Sæki fleiri fréttir...
          </div>
      )}

      {/* --- GLOBAL READER (ÓBREYTT) --- */}
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
