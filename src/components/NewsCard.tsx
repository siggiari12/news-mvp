"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase";

// --- SAMRÆMD TÝPA ---
interface Article {
    id: string;
    topic_id?: string;
    title: string;
    excerpt?: string;
    summary?: string; 
    image_url?: string;
    published_at: string;
    updated_at?: string;
    article_count?: number;
    full_text?: string;
    url?: string;
    sources?: { name: string };
    category?: string;
    importance?: number;
}

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

export default function NewsCard({ article, isExpanded, onOpen, onClose, onRelatedClick, showCloseButton }: NewsCardProps) {
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
      if (isMultiSourceTopic && !unifiedStory && !loadingText) fetchSummary(); 
      if (relatedArticles.length === 0 && !loadingRelated) fetchRelated();
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

  const fetchSummary = async () => {
    setLoadingText(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: article.id, type: 'full' })
      });
      const data = await res.json();
      if (data.summary) setUnifiedStory(data.summary);
    } catch (e) { console.error("Summary error:", e); } 
    finally { setLoadingText(false); }
  };

  const fetchRelated = async () => {
    setLoadingRelated(true);
    try {
      const res = await fetch('/api/related', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ articleId: article.id })
      });
      const data = await res.json();
      const filtered = (data.articles || []).filter((a: Article) => a.id !== article.id);
      setRelatedArticles(filtered);
    } catch (e) { console.error("Related error:", e); } finally { setLoadingRelated(false); }
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

  const sourceList = topicArticles.length > 0 ? topicArticles : [article];
  
  // --- UPPFÆRT MYNDALOGIC (The Gatekeeper) ---
  const candidateImage = (topicArticles.length > 0 ? topicArticles[0].image_url : article.image_url) || article.image_url;

  // Fall sem sannprófar hvort slóðin sé í raun "alvöru" mynd eða bara lógó drasl
  const isValidImage = (url: string | undefined | null) => {
    if (!url) return false;
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
        filter: isExpanded ? 'brightness(0.3) blur(20px)' : 'none',
        transition: 'all 0.5s ease'
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
        <img 
            src={displayImage} 
            alt={article.title} 
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)} 
            style={{ 
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                objectFit: 'cover',
                zIndex: 1, 
                filter: isExpanded ? 'brightness(0.3) blur(20px)' : 'none', 
                transition: 'all 0.5s ease',
                opacity: isExpanded ? 0.4 : 1
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

      {/* 4. LOKA TAKKI */}
      {showCloseButton && !isExpanded && (
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 50,
                background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                width: '40px', height: '40px', color: 'white', fontSize: '1.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', cursor: 'pointer'
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
                    🔥 {article.article_count}
                </div>
            )}
        </div>
        <h2 className="title" onClick={onOpen} style={{fontSize: '1.8rem', fontWeight: '800', lineHeight: '1.2', marginBottom: '10px', textShadow: '0 2px 4px rgba(0,0,0,0.5)', cursor:'pointer'}}>
            {article.title}
        </h2>
        <p className="excerpt" onClick={onOpen} style={{fontSize: '1rem', lineHeight: '1.4', color: '#ddd', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', cursor:'pointer'}}>
            {article.excerpt || article.summary || 'Smelltu til að lesa umfjöllun...'}
        </p>
      </div>
      
      {/* 6. "SJÁ MEIRA" */}
      <div onClick={onOpen} style={{
          zIndex: 10, position: 'absolute', bottom: '100px', left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: isExpanded ? 0 : 0.9, pointerEvents: isExpanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px', textShadow: '0 2px 4px rgba(0,0,0,0.8)'}}>
            {isMultiSourceTopic ? 'Sjá umfjöllun' : 'Lesa meira'}
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
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
                 background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', 
                 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', flexShrink: 0, backdropFilter: 'blur(10px)'
             }}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
           </button>
        </div>

        <div style={{display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.2)', margin: '0 20px 20px 20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>Umfjöllun</button>
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>Tengt efni</button>
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 120px 20px', scrollBehavior: 'smooth'}}>
           {activeTab === 'read' && (
             <div style={{fontSize: '1.05rem', lineHeight: '1.7', color: '#eee'}}>
               <div style={{marginBottom: '30px'}}>
                    {loadingText && !summaryText ? <div style={{color:'#aaa', fontStyle:'italic'}}>🤖 Sæki samantekt...</div> : (
                        (summaryText || '').split('\n').map((p:string, i:number) => p.trim() && <p key={i} style={{marginBottom:'15px'}}>{p.replace(/\[Lesa nánar.*\]/, '')}</p>)
                    )}
               </div>
               <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px'}}>
                    {sourceList.map((item, index) => {
                        const sName = item.sources?.name || sourceName;
                        return (
                            <button key={item.id || index} onClick={() => handleOutboundClick(item.url, sName)} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 20px',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
                                    backdropFilter: 'blur(10px)', color: 'white', cursor: 'pointer', textAlign: 'left'
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
             <div>
                 {loadingRelated ? <div style={{textAlign:'center', color:'#888'}}>Leita...</div> : relatedArticles.map(rel => (
                     <div key={rel.id} onClick={(e) => { e.stopPropagation(); if (onRelatedClick) onRelatedClick(rel); }} style={{
                            cursor: 'pointer', marginBottom:'15px', padding:'15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px'
                        }}>
                         <div style={{fontSize:'0.75rem', color:'#aaa', marginBottom:'4px'}}>{rel.sources?.name}</div>
                         <div style={{fontWeight:'bold', fontSize:'1rem'}}>{rel.title}</div>
                     </div>
                 ))}
             </div>
           )}
           <div onClick={onClose} style={{marginTop: '40px', padding:'20px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', opacity: 0.6}}>
             <div style={{background:'rgba(255,255,255,0.1)', borderRadius:'50%', padding:'10px', marginBottom:'10px'}}>
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
