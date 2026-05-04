"use client";
import { useState, useEffect, useRef, useMemo, memo } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase";
import type { Article } from "@/types/article";

interface NewsCardProps {
    article: Article;
    isExpanded: boolean;
    onOpen: () => void;
    onClose: () => void;
    onRelatedClick?: (article: Article) => void;
    showCloseButton?: boolean;
}

function getDeviceId() {
  if (typeof window === 'undefined') return 'unknown';
  let id = localStorage.getItem('vizka_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('vizka_device_id', id);
  }
  return id;
}

function NewsCard({ article, isExpanded, onOpen, onClose, onRelatedClick, showCloseButton }: NewsCardProps) {
  if (!article) return null;

  const [activeTab, setActiveTab] = useState<'read' | 'related'>('read');
  const [unifiedStory, setUnifiedStory] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [topicArticles, setTopicArticles] = useState<Article[]>([]);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [formattedTime, setFormattedTime] = useState<string>('');
  
  
  // NÝTT: State til að fylgjast með hvort myndin sé brotin
  const [imgError, setImgError] = useState(false);

  // AI bakgrunnur (context Q&A)
  const [backgroundInfo, setBackgroundInfo] = useState<{question: string, answer: string}[]>([]);

  // Explainers: inline tooltip chips for named terms/people/places
  interface Explainer { term: string; explanation: string; term_type: string; }
  const [explainers, setExplainers] = useState<Explainer[]>([]);
  const [activeExplainer, setActiveExplainer] = useState<string | null>(null);

  const cardRef = useRef<HTMLElement>(null);
  
  const isMultiSourceTopic = (article.article_count || 0) > 1;
  const sourceName = article.sources?.name || (isMultiSourceTopic ? 'Samantekt' : 'Frétt');

  // --- BRANDING ---
  const branding = useMemo(() => {
      const name = (sourceName || '').toLowerCase();
      if (name.includes('mbl')) return { bg: 'rgb(2 6 120)', logo: '/mbl.png', scale: '70%' }; 
      if (name.includes('rúv') || name.includes('ruv')) return { bg: '#000000', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg', scale: '60%' };
      if (name.includes('vísir') || name.includes('visir')) return { bg: '#000000', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg', scale: '60%' };
      if (name.includes('dv')) return { bg: '#000000', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png', scale: '60%' };
      return { bg: '#1a1a1a', logo: null, scale: '100%' };
  }, [sourceName]);

  useEffect(() => {
    const d = article.published_at || article.updated_at;
    if(d) {
        const date = new Date(d);
        setFormattedTime(date.toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'}));
    }
  }, [article]); 

  useEffect(() => {
    if (isExpanded) {
      if (isMultiSourceTopic && topicArticles.length === 0) fetchTopicArticles();
      if (!unifiedStory && !loadingText) fetchSummary();
      if (relatedArticles.length === 0 && !loadingRelated) fetchRelated();
      if (explainers.length === 0) fetchExplainers();
    }
  }, [isExpanded]);

  const fetchTopicArticles = async () => {
    const { data } = await supabaseBrowser
      .from('articles')
      .select('*, sources(name)')
      .eq('topic_id', article.id)
      .order('published_at', { ascending: true });
    if (data) setTopicArticles(data as unknown as Article[]);
  };

  const fetchExplainers = async () => {
    try {
      const { data } = await supabaseBrowser
        .from('explainers')
        .select('term, explanation, term_type')
        .eq('article_id', article.id)
        .limit(5);
      if (data && data.length > 0) setExplainers(data);
    } catch (e) {
      // Explainers are optional — fail silently
    }
  };

  const fetchSummary = async () => {
    setLoadingText(true);
    try {
      const body = isMultiSourceTopic
        ? { topicId: article.id, type: 'full' }
        : { articleId: article.id, type: 'full' };

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.summary) setUnifiedStory(data.summary);
    } catch (e) { console.error('Summary error:', e); }
    finally { setLoadingText(false); }
  };

    const fetchRelated = async () => {
    // Ef við erum búin að sækja þetta, sleppum því að sækja aftur
    if (relatedArticles.length > 0 || backgroundInfo.length > 0) return;

    setLoadingRelated(true);
    try {
      const res = await fetch('/api/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id })
      });
      
      const data = await res.json();
      
      // 1. Setjum bakgrunninn (ef einhver)
      if (data.background) {
          setBackgroundInfo(data.background);
      }
      
      // 2. Setjum greinarnar (ef einhverjar)
      if (data.articles) {
          setRelatedArticles(data.articles);
      }
      
    } catch (e) {
      console.error("Related error:", e);
    } finally {
      setLoadingRelated(false);
    }
  };

  const handleOutboundClick = (url: string | undefined, specificSource?: string) => {
      if (!url) return;
      const deviceId = getDeviceId();
      fetch('/api/track-click', { 
          method: 'POST', 
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articleId: article.id, source: specificSource || sourceName, deviceId: deviceId }) 
      }).catch(err => console.error(err));
      window.open(url, '_blank');
  };

  const handleShare = async () => {
    const url = article.url || window.location.href;
    const text = article.excerpt || article.title;
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, text, url });
      } catch (e) {
        // User cancelled — do nothing
      }
    } else {
      // Desktop fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(url);
        alert('Hlekkur afritaður!');
      } catch (e) {
        // clipboard not available
      }
    }
  };

  const sourceList = topicArticles.length > 0 ? topicArticles : [article];

  // --- UPPFÆRT MYNDALOGIC (The Gatekeeper) ---
  const candidateImage = (topicArticles.length > 0 ? topicArticles[0].image_url : article.image_url) || article.image_url;

  // Fall sem sannprófar hvort slóðin sé í raun "alvöru" mynd eða bara lógó drasl
  const isValidImage = (url: string | undefined | null) => {
    if (!url) return false;

    // Stock images from /public/stock/ are always valid
    if (url.startsWith('/stock/')) return true;

    const lower = url.toLowerCase();

    // MBL Regla: Ef þetta er mbl slóð en vantar '/frimg/', þá er þetta rusl.
    if (url.includes('mbl.is') && !url.includes('/frimg/')) return false;

    // Almenn útilokun (Blacklist)
    const blockedTerms = ['mbl-logo', 'default', 'placeholder', '1x1', 'gfx/logo', 'transparent'];
    if (blockedTerms.some(term => lower.includes(term))) return false;

    return true;
  };

  // Ef myndin er ógild (eða imgError er true), sýnum við NULL (sem kveikir á bakgrunninum)
  const displayImage = (candidateImage && isValidImage(candidateImage) && !imgError) ? candidateImage : null;
  
  const summaryText = unifiedStory || article.full_text || article.excerpt;

  return (
    <section 
      ref={cardRef}
      className="news-card" 
      style={{
          position: 'relative', overflow: 'hidden', height: '100dvh', width: '100%',
          scrollSnapAlign: 'start', scrollSnapStop: 'always',
          backgroundColor: '#000'
      }}
    >
      {/* 1. BAKGRUNNUR (Fallback) */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: branding.bg,
        zIndex: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: isExpanded ? 'brightness(0.2)' : 'none',
        transition: 'filter 0.3s ease'
      }}>
          {/* Lógó logic - Birtist BARA ef engin gild mynd fannst */}
          {!displayImage && branding.logo ? (
            <img 
                src={branding.logo} 
                alt="" 
                style={{
                    width: branding.scale, 
                    maxWidth: '220px',    
                    height: 'auto', 
                    objectFit: 'contain', 
                    opacity: 0.9, 
                    marginBottom: '100px' 
                }} 
            />
          ) : null}

          {/* Fallback titill */}
          {!displayImage && !branding.logo && (
             <h1 style={{fontSize: '4rem', color: 'rgba(255,255,255,0.1)'}}>{sourceName}</h1>
          )}
      </div>

      {/* 2. AÐALMYND */}
      {/* Við renderum bara img tagið ef displayImage er til staðar og löglegt */}
      {displayImage && (
        <Image
            src={displayImage}
            alt={article.title}
            fill
            sizes="100vw"
            priority={false}
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAklEQVR4AewaftIAAAAuSURBVBXBMQ0AIAwEsE4AhUwAhkYBjv03JaRNuktCCAzujpm7IyIiImJmZmb+HxkHBPOJKLkAAAAASUVORK5CYII="
            onError={() => setImgError(true)}
            style={{
                objectFit: 'cover',
                zIndex: 1,
                filter: isExpanded ? 'brightness(0.2)' : 'none',
                transition: 'filter 0.3s ease, opacity 0.3s ease',
                opacity: isExpanded ? 0.5 : 1
            }}
        />
      )}
      
      {/* 3. GRADIENT */}
      <div style={{
          zIndex: 2, position: 'absolute', bottom: 0, left: 0, width: '100%', height: '80%', 
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)',
          pointerEvents: 'none',
          opacity: isExpanded ? 0 : 1, transition: 'opacity 0.3s ease'
      }}></div>

      {/* 4. LOKA TAKKI (FRAMHLIÐ) */}
      {showCloseButton && !isExpanded && (
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 50,
                background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                width: '40px', height: '40px', color: 'white', fontSize: '1.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>✕</button>
      )}

      {/* 5. FRAMHLIÐ (Content) */}
      <div className="content" style={{
          zIndex: 10, position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '24px', paddingBottom: '160px', 
          opacity: isExpanded ? 0 : 1, 
          transform: isExpanded ? 'translateY(20px)' : 'translateY(0)',
          pointerEvents: isExpanded ? 'none' : 'auto', 
          transition: 'all 0.3s ease'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
            <div className="source-badge">
                {sourceName} • {formattedTime}
            </div>
            {isMultiSourceTopic && (
                <div style={{background: 'rgba(255, 69, 58, 0.9)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold'}}>
                    🔥 {article.article_count} miðlar
                </div>
            )}
        </div>
        <h2 className="title" onClick={onOpen} style={{fontSize: '1.8rem', fontWeight: '800', lineHeight: '1.2', marginBottom: '10px', textShadow: '0 2px 4px rgba(0,0,0,0.5)', cursor:'pointer'}}>
            {article.title}
        </h2>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <p className="excerpt" onClick={onOpen} style={{flex: 1, fontSize: '1rem', lineHeight: '1.4', color: '#ddd', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor:'pointer'}}>
              {article.excerpt || article.summary || 'Smelltu til að lesa umfjöllun...'}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
            style={{
              flexShrink: 0, marginTop: '2px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white',
            }}
            aria-label="Deila"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>
      </div>
      
      {/* 6. "SJÁ MEIRA" */}
      <div onClick={onOpen} style={{
          zIndex: 10, position: 'absolute', bottom: '100px', left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: isExpanded ? 0 : 0.9, pointerEvents: isExpanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px', textShadow: '0 2px 4px rgba(0,0,0,0.8)'}}>
            {isMultiSourceTopic ? 'Lesa meira' : 'Lesa meira'}
        </span>
      </div>

      {/* 7. BAKHLIÐ (Expanded) */}
      {isExpanded && (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto', 
        paddingTop: '90px', 
        overflow: 'hidden',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{padding: '0 20px 10px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '15px'}}>
          <h2 style={{fontSize: '1.4rem', fontWeight: 'bold', margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.8)', flex: 1, lineHeight: '1.3'}}>{article.title}</h2>
          
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {/* Share button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleShare(); }}
              style={{
                background: 'transparent', border: 'none', borderRadius: '50%',
                width: '36px', height: '36px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'white',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
              }}
              aria-label="Deila"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            {/* Close button */}
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
                   background: 'transparent',
                   border: 'none',
                   borderRadius: '50%',
                   width: '36px',
                   height: '36px',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white',
                   filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
               }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <div style={{display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', margin: '0 20px 20px 20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>Umfjöllun</button>
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>Tengt efni</button>
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 120px 20px', scrollBehavior: 'smooth'}}>
           {activeTab === 'read' && (
             <div style={{fontSize: '1.05rem', lineHeight: '1.7', color: '#eee'}}>

               {/* EXPLAINER CHIPS */}
               {explainers.length > 0 && (
                 <div style={{ marginBottom: '20px' }}>
                   <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: '8px' }}>
                     Hvað þýðir þetta?
                   </div>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                     {explainers.map((ex) => (
                       <div key={ex.term} style={{ position: 'relative' }}>
                         <button
                           onClick={() => setActiveExplainer(activeExplainer === ex.term ? null : ex.term)}
                           style={{
                             background: activeExplainer === ex.term ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                             border: `1px solid ${activeExplainer === ex.term ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.15)'}`,
                             borderRadius: '20px',
                             color: '#fff',
                             padding: '5px 12px',
                             fontSize: '0.82rem',
                             cursor: 'pointer',
                             transition: 'all 0.2s ease',
                           }}
                         >
                           💡 {ex.term}
                         </button>
                         {activeExplainer === ex.term && (
                           <div style={{
                             position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                             background: '#1a1a2e', border: '1px solid rgba(59,130,246,0.4)',
                             borderRadius: '12px', padding: '12px 14px',
                             fontSize: '0.88rem', lineHeight: '1.5', color: '#ddd',
                             width: '240px', zIndex: 200,
                             boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                           }}>
                             <div style={{ fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{ex.term}</div>
                             {ex.explanation}
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               <div style={{marginBottom: '30px'}}>
                    {loadingText && !summaryText ? <div style={{color:'#aaa', fontStyle:'italic'}}>🤖 Sæki samantekt...</div> : (
                        summaryText?.split('\n').map((p: string, i: number) =>
                          p.trim() && <p key={i} style={{marginBottom:'15px'}}>{p.replace(/\[Lesa nánar.*\]/, '')}</p>
                        )
                    )}
               </div>
               <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'}}>
                    {sourceList.map((item, index) => {
                        const sName = item.sources?.name || sourceName;
                        return (
                            <button key={item.id || index} onClick={() => handleOutboundClick(item.url, sName)} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 20px',
                                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px',
                                    color: 'white', cursor: 'pointer', textAlign: 'left'
                                }}>
                                <span style={{fontWeight: 'bold', fontSize: '0.95rem'}}>Lesa á {sName}</span>
                                <svg style={{opacity:0.7}} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </button>
                        );
                    })}
               </div>
             </div>
           )}
            {activeTab === 'related' && (
            <div className="animate-fadeIn" style={{ height: '100%', overflowY: 'auto', paddingBottom: '20px' }}>
                {loadingRelated ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#888' }}>
                        <div className="loading-spinner" style={{ marginBottom: '15px' }}></div>
                        <div style={{ fontSize: '0.9rem' }}>Greini samhengi og sæki sögu...</div>
                    </div>
                ) : (
                    <>
                        {/* HLUTI 1: AI CONTEXT / FAKTASPJÖLD */}
                        {backgroundInfo.length > 0 && (
                            <div style={{ marginBottom: '35px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {backgroundInfo.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: 'linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '20px',
                                            padding: '24px',
                                            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                                        }}>
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '10px', 
                                                marginBottom: '8px' 
                                            }}>
                                                <span style={{ fontSize: '1.2rem' }}>💡</span>
                                                <h4 style={{ 
                                                    margin: 0, 
                                                    fontSize: '1.1rem', 
                                                    fontWeight: '700', 
                                                    color: '#fff',
                                                    lineHeight: '1.2'
                                                }}>
                                                    {item.question}
                                                </h4>
                                            </div>
                                            
                                            <div style={{ 
                                                fontSize: '1rem', 
                                                lineHeight: '1.6', 
                                                color: 'rgba(255,255,255,0.85)',
                                                fontWeight: '400',
                                                paddingLeft: '2px'
                                            }}>
                                                {item.answer}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* HLUTI 2: TENGDAR FRÉTTIR */}
                        <div>
                            <h3 style={{ 
                                fontSize: '0.75rem', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1px', 
                                color: '#aaa', 
                                marginBottom: '10px', 
                                borderBottom: '1px solid rgba(255,255,255,0.1)', 
                                paddingBottom: '5px' 
                            }}>
                                Eldra efni & Tengt
                            </h3>

                            {relatedArticles.length === 0 ? (
                                <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', marginTop: '20px' }}>
                                    Engar tengdar fréttir fundust.
                                </div>
                            ) : (
                                relatedArticles.map(rel => (
                                    <div key={rel.id} 
                                         onClick={(e) => { 
                                             e.stopPropagation(); 
                                             if (onRelatedClick) onRelatedClick(rel); 
                                         }} 
                                         style={{
                                            cursor: 'pointer', 
                                            marginBottom: '10px', 
                                            padding: '12px', 
                                            background: 'rgba(255,255,255,0.03)', 
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            transition: 'background 0.2s'
                                         }}
                                         onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                         onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#888', marginBottom: '4px' }}>
                                            <span style={{color: '#aaa'}}>{rel.sources?.name || 'Frétt'}</span>
                                            <span>{new Date(rel.published_at).toLocaleDateString('is-IS')}</span>
                                        </div>
                                        <div style={{ fontWeight: '500', fontSize: '0.9rem', lineHeight: '1.3', color: '#fff' }}>
                                            {rel.title}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        )}

           {/* LINSULAUS "LOKA" ÖR */}
           <div onClick={onClose} style={{marginTop: '40px', padding:'20px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', opacity: 0.6}}>
             <div style={{
                 // background:'rgba(255,255,255,0.1)', // FJARLÆGT
                 background: 'transparent',
                 borderRadius:'50%', padding:'10px', marginBottom:'10px'
             }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
             </div>
             <span style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold'}}>Loka</span>
           </div>
        </div>
      </div>
      )}
    </section>
  );
}

function tabStyle(isActive: boolean) {
  return {
    flex: 1, padding: '12px 0', background: 'none', border: 'none',
    color: isActive ? 'white' : 'rgba(255,255,255,0.4)',
    borderBottom: isActive ? '2px solid white' : '2px solid rgba(255,255,255,0.1)',
    fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer',
    transition: 'all 0.2s ease'
  };
}

// Memoize to prevent re-renders during scroll when props haven't changed
export default memo(NewsCard);
