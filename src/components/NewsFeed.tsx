"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import NewsCard from "./NewsCard";
import { supabaseBrowser } from "@/lib/supabase";
import type { Article } from "@/types/article";

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

  // --- PULL-TO-REFRESH STATE ---
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const PULL_THRESHOLD = 80;
  
  // --- LEIT ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Article[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowSearch(showSearchProp);
    if (showSearchProp) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      if (trendingTopics.length === 0) fetchTrendingTopics();
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

  // --- SCROLL TO TOP + PAGINATION RESET when category changes ---
  useEffect(() => {
    setActiveIndex(0);
    setOffset(0);
    setHasMore(true);
    if (feedContainerRef.current) {
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

  const fetchTrendingTopics = async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabaseBrowser
        .from('articles')
        .select('title, importance')
        .gte('published_at', since)
        .order('importance', { ascending: false })
        .limit(6);

      if (data && data.length > 0) {
        // Take the first 4-5 words of each title as a search chip
        const chips = data.map((a: any) => {
          const words = (a.title || '').split(' ');
          return words.slice(0, 4).join(' ').replace(/[.,!?:;]$/, '');
        }).filter(Boolean);
        setTrendingTopics(chips);
      }
    } catch (e) {
      // Trending is optional — fail silently
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (feedContainerRef.current && feedContainerRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const dist = Math.max(0, e.touches[0].clientY - pullStartY.current);
    // Apply rubber-band resistance
    setPullDistance(Math.min(dist * 0.4, PULL_THRESHOLD * 1.5));
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    setIsPulling(false);
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(0);
      await fetchInitialNews();
      setIsRefreshing(false);
    } else {
      setPullDistance(0);
    }
  };

  const fetchInitialNews = async () => {
    if (isBusyRef.current) return;
    if (articles.length === 0) setLoading(true);
    const deviceId = localStorage.getItem('vizka_device_id') || 'unknown';
    
    try {
        const { data } = await supabaseBrowser
          .rpc('get_ranked_feed', {
            device_id_input: deviceId,
            limit_count: 20,  // Smaller batch for faster refresh
            offset_count: 0
          });

        if (data && data.length > 0) {
          setArticles(formatData(data));
          setOffset(20);
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

  // --- SCROLL HANDLER (Throttled for performance) ---
  const lastScrollUpdate = useRef(0);
  const lastIndex = useRef(0);
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
      const now = Date.now();
      // Throttle to max 10 updates per second (100ms)
      if (now - lastScrollUpdate.current < 100) return;
      lastScrollUpdate.current = now;

      const target = e.currentTarget;
      const height = target.clientHeight;
      const scrollTop = target.scrollTop;
      const index = Math.round(scrollTop / height);

      // Only update state if index actually changed (avoids unnecessary re-renders)
      if (index !== lastIndex.current) {
          lastIndex.current = index;
          setActiveIndex(index);
      }

      if (hasMore && !isFetchingMore && (index >= filteredArticles.length - 5)) {
          fetchMoreNews();
      }
  }, [hasMore, isFetchingMore, filteredArticles.length]);

  if (loading && articles.length === 0) return <div style={{background: '#000', height: '100vh'}} />;

  return (
    <main
        ref={feedContainerRef}
        className="feed-container"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
            height: '100dvh',
            width: '100%',
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollBehavior: 'auto',
        }}
    >
      {/* PULL-TO-REFRESH INDICATOR */}
      {(pullDistance > 0 || isRefreshing) && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: `${isRefreshing ? 56 : pullDistance}px`,
            overflow: 'hidden',
            transition: isRefreshing ? 'none' : 'height 0.1s ease',
            pointerEvents: 'none',
        }}>
            <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: '#fff',
                animation: isRefreshing ? 'spin 0.7s linear infinite' : 'none',
                transform: !isRefreshing ? `rotate(${(pullDistance / PULL_THRESHOLD) * 360}deg)` : undefined,
                opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
            }} />
        </div>
      )}

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
                {!searchQuery && searchResults.length === 0 && trendingTopics.length > 0 && (
                    <div className="popular-section">
                        <h3 style={{color:'#888', fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'10px'}}>Vinsælt núna</h3>
                        <div className="tag-cloud">
                            {trendingTopics.map((topic) => (
                                <span key={topic} className="search-tag" onClick={() => setSearchQuery(topic)}>
                                    {topic}
                                </span>
                            ))}
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
        // VIRTUALIZATION LOGIC: Render ±3 cards for smoother scroll-snap
        const isVisible = Math.abs(activeIndex - index) <= 3;

        if (!isVisible) {
            return <div key={article.id} className="news-card-placeholder" />;
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
