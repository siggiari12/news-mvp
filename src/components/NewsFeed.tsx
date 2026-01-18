"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";

// --- SAMRÆMD TÝPA (Verður að vera eins og í NewsCard) ---
interface Article {
  id: string;
  topic_id?: string;
  title: string;
  excerpt?: string;
  summary?: string;
  image_url?: string;
  published_at: string;
  article_count?: number;
  category?: string;
  importance?: number;
  sources?: { name: string };
  full_text?: string;
  url?: string; // Valkvætt (?) til að koma í veg fyrir Type Error
}

// --- SVG IKON ---
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

interface NewsFeedProps {
  initialArticles: Article[];
  activeCategory: string; // Breytt í string
  showSearchProp: boolean;
  onCloseSearch: () => void;
  onArticleStateChange?: (isOpen: boolean) => void;
}

export default function NewsFeed({ initialArticles, activeCategory, showSearchProp, onCloseSearch, onArticleStateChange }: NewsFeedProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles || []);
  const [loading, setLoading] = useState(initialArticles ? false : true);
  
  // Ref til að stjórna scrollinu
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // --- PAGINATION & VIRTUALIZATION STATES ---
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // --- LEIT ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Article[]>([]);
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
  const [readingArticle, setReadingArticle] = useState<Article | null>(null);
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

  // --- FILTERING (useMemo) ---
  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      const cat = (article.category || '').toLowerCase().trim();
      const imp = article.importance || 0;
      
      if (activeCategory === 'allt') return true; 
      if (activeCategory === 'folk') return cat === 'folk';
      if (activeCategory === 'sport') return cat === 'sport';
      if (activeCategory === 'innlent') return cat === 'innlent' || (imp >= 8 && cat !== 'sport' && cat !== 'erlent');
      if (activeCategory === 'erlent') return cat === 'erlent' || (imp >= 8 && cat !== 'sport' && cat !== 'innlent');
      
      return cat === activeCategory;
    });
  }, [articles, activeCategory]);

  // --- SCROLL TO TOP LÖGUN ---
  // Þetta keyrir þegar activeCategory breytist
  useEffect(() => {
    if (feedContainerRef.current) {
      // 1. Reset active index
      setActiveIndex(0);
      // 2. Þvinga scroll efst strax
      feedContainerRef.current.scrollTop = 0;
    }
  }, [activeCategory]); 


  // --- DATA FETCHING ---
  const formatData = (data: any[]): Article[] => {
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

  const fetchInitialNews = async () => {
    if (isBusyRef.current) return;
    if (articles.length === 0) setLoading(true);
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
                const existingIds = new Set(prev.map(a => a.id));
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

  const openGlobalArticle = (article: Article) => {
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
          const formattedRelated: Article = {
              id: data.id,
              topic_id: data.id,
              title: data.title,
              published_at: data.published_at,
              excerpt: data.excerpt,
              image_url: data.image_url,
              url: data.url,
              article_count: 1,
              sources: data.sources,
              full_text: data.full_text
          };
          openGlobalArticle(formattedRelated);
      }
  };

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (articles.length === 0) fetchInitialNews();
    
    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') fetchInitialNews(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = setInterval(() => { fetchInitialNews(); }, 300000); 

    return () => { 
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // --- SCROLL HANDLER (Með requestAnimationFrame fyrir performance) ---
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
      const target = e.currentTarget;
      
      requestAnimationFrame(() => {
          const height = target.clientHeight;
          const scrollTop = target.scrollTop;
          
          const index = Math.round(scrollTop / height);
          setActiveIndex(index);

          if (hasMore && !isFetchingMore && (index >= filteredArticles.length - 5)) {
              fetchMoreNews();
          }
      });
  };

  if (loading && articles.length === 0) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main 
        ref={feedContainerRef}
        className="feed-container" 
        onScroll={handleScroll}
        style={{
            height: '100dvh', 
            width: '100%',
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollBehavior: 'auto' // 'auto' er betra en 'smooth' hér til að scroll-to-top sé instant
        }}
    >
      
      {/* --- LEITAR OVERLAY --- */}
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
                {/* Hér er "Vinsælt núna" hlutinn aftur kominn inn! */}
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

      {/* --- VENJULEGT FEED --- */}
      {filteredArticles.length === 0 && !loading && (
          <div style={{height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>
              Engar fréttir fundust í þessum flokki.
          </div>
      )}

      {filteredArticles.map((article, index) => {
        // VIRTUALIZATION LOGIC:
        const isVisible = Math.abs(activeIndex - index) <= 2;

        if (!isVisible) {
            return <div key={article.id} style={{height: '100dvh', width: '100%', scrollSnapAlign: 'start'}} />;
        }

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

      {isFetchingMore && (
          <div style={{height: '100px', scrollSnapAlign: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888'}}>
              Sæki fleiri fréttir...
          </div>
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
