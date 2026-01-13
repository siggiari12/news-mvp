"use client";
import { useState, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase";

// --- NÝTT: FINGERPRINTING FALL ---
function getDeviceId() {
  if (typeof window === 'undefined') return null;
  
  // Reynum að ná í ID úr geymslu
  let id = localStorage.getItem('vizka_device_id');
  
  // Ef ekki til, búum til nýtt (Random string)
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('vizka_device_id', id);
  }
  return id;
}

// 1. BRANDING (Komið aftur í gamla horfið, engir litir)
const getBranding = (sourceName: string | undefined) => {
  const name = (sourceName || '').toLowerCase();
  if (name.includes('mbl')) return { bg: 'hsl(240deg 100% 23.53%)', logo: '/mbl.png', scale: '80%' };
  if (name.includes('rúv') || name.includes('ruv')) return { bg: '#000000ff', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg', scale: '60%' };
  if (name.includes('vísir') || name.includes('visir')) return { bg: '#000000ff', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg', scale: '60%' };
  if (name.includes('dv')) return { bg: '#000000ff', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png', scale: '60%' };
  return { bg: '#222', logo: null, scale: '100%' };
};

interface NewsCardProps {
    article: any;
    isExpanded: boolean;
    onOpen: () => void;
    onClose: () => void;
    onRelatedClick?: (article: any) => void;
    showCloseButton?: boolean;
}

export default function NewsCard({ article, isExpanded, onOpen, onClose, onRelatedClick, showCloseButton }: NewsCardProps) {
  if (!article) return null;

  // Fjarlægði 'eli10'
  const [activeTab, setActiveTab] = useState<'read' | 'related'>('read');
  
  const [unifiedStory, setUnifiedStory] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const [topicArticles, setTopicArticles] = useState<any[]>([]);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  
  const [formattedTime, setFormattedTime] = useState<string>('');
  
  const cardRef = useRef<HTMLElement>(null);
  const supabase = supabaseBrowser; 

  const isMultiSourceTopic = article.article_count && article.article_count > 1;
  const sourceName = article.sources?.name || (isMultiSourceTopic ? 'Samantekt' : '');
  const branding = getBranding(sourceName);

  useEffect(() => {
    const date = new Date(article.published_at || article.updated_at);
    setFormattedTime(date.toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'}));
  }, [article]); 

  useEffect(() => {
    if (isExpanded) {
      if (topicArticles.length === 0 && isMultiSourceTopic) fetchTopicArticles();
      if (isMultiSourceTopic && !unifiedStory) fetchSummary(); 
      if (relatedArticles.length === 0) fetchRelated();
    }
  }, [isExpanded, activeTab]); 

  const fetchTopicArticles = async () => {
    const { data } = await supabase
      .from('articles')
      .select('*, sources(name)')
      .eq('topic_id', article.id)
      .order('published_at', { ascending: false });
    if (data) setTopicArticles(data);
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
    } catch (e) { console.error(e); } 
    finally { setLoadingText(false); }
  };

  const fetchRelated = async () => {
    setLoadingRelated(true);
    try {
      const searchId = article.id;
      const res = await fetch('/api/related', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ articleId: searchId })
      });
      const data = await res.json();
      const filtered = (data.articles || []).filter((a: any) => a.id !== searchId);
      setRelatedArticles(filtered);
    } catch (e) { console.error(e); } finally { setLoadingRelated(false); }
  };

  // --- UPPFÆRT MEÐ DEVICE ID ---
  const handleOutboundClick = (url: string) => {
      try {
          const deviceId = getDeviceId(); // Sækjum ID
          
          fetch('/api/track-click', { 
              method: 'POST', 
              body: JSON.stringify({ 
                  articleId: article.id, 
                  source: sourceName,
                  deviceId: deviceId // Sendum með
              }) 
          });
      } catch(e) {}
      window.open(url, '_blank');
  };

  const displayArticle = topicArticles.length > 0 ? topicArticles[0] : article;
  const summaryText = isMultiSourceTopic ? unifiedStory : article.full_text;

  return (
    <section 
      ref={cardRef}
      className="news-card" 
      style={{
          position: 'relative', overflow: 'hidden', height: '100dvh', width: '100%',
          scrollSnapAlign: 'start', scrollSnapStop: 'always'
      }}
    >
      {/* BAKGRUNNUR */}
      <div className="bg-image" style={{
        background: branding.bg, zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: isExpanded ? 'brightness(0.4) blur(15px)' : 'none', transition: 'all 0.5s ease'
      }}>
          {branding.logo && (
            <img src={branding.logo} alt="" style={{width: branding.scale, opacity: 0.9, display: 'block'}} 
              onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
          )}
          <h1 style={{fontSize: '4rem', color: 'rgba(255,255,255,0.2)', display: branding.logo ? 'none' : 'block'}}>{sourceName}</h1>
      </div>

      {displayArticle.image_url && (
        <img 
            src={displayArticle.image_url} 
            alt="" 
            className="bg-image" 
            // --- HÉR ER BREYTINGIN (Fyrir MBL) ---
            referrerPolicy="no-referrer"
            // -------------------------------------
            style={{ 
                zIndex: 1, filter: isExpanded ? 'brightness(0.4) blur(15px)' : 'none', transition: 'all 0.5s ease'
            }} 
            onError={(e) => (e.target as HTMLElement).style.display = 'none'} 
        />
      )}
      
      <div style={{
          zIndex: 2, position: 'absolute', bottom: 0, left: 0, width: '100%', height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
          opacity: isExpanded ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: 'none' 
      }}></div>

      {/* LOKA TAKKI Á FRAMHLIÐ */}
      {showCloseButton && !isExpanded && (
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 10,
                background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                width: '40px', height: '40px', color: 'white', fontSize: '1.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', cursor: 'pointer'
            }}>✕</button>
      )}

      <div className="content" style={{
          zIndex: 3, position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '24px', paddingBottom: '160px', 
          opacity: isExpanded ? 0 : 1, pointerEvents: isExpanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
            <div className="source-badge">{sourceName} • {formattedTime}</div>
            {isMultiSourceTopic && (
                <div style={{background: 'rgba(255, 69, 58, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold'}}>🔥 {article.article_count} miðlar</div>
            )}
        </div>
        <h2 className="title" onClick={onOpen}>{article.title}</h2>
        <p className="excerpt" onClick={onOpen}>{article.excerpt || article.summary || 'Smelltu til að lesa umfjöllun...'}</p>
      </div>
      
      <div onClick={onOpen} style={{
          zIndex: 3, position: 'absolute', bottom: '100px', left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: isExpanded ? 0 : 0.8, pointerEvents: isExpanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px'}}>
            {isMultiSourceTopic ? 'Sjá umfjöllun' : 'Sjá meira'}
        </span>
      </div>

      {/* BAKSÍÐA (MODAL) */}
      {isExpanded && (
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4,
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto', 
        transition: 'opacity 0.3s ease 0.1s', paddingTop: '60px', animation: 'fadeIn 0.3s ease' 
      }}>
        
        <div style={{padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h2 style={{fontSize: '1.2rem', fontWeight: 'bold', margin: 0, flex: 1}}>{article.title}</h2>
           <button onClick={onClose} style={{background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', padding: '10px'}}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
           </button>
        </div>

        <div style={{display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', margin: '20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>
              Fréttin
          </button>
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>
              Tengt efni
          </button>
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px'}}>
           
           {/* FLIPI 1: FRÉTTIN & SAMANTEKT & LINKUR */}
           {activeTab === 'read' && (
             <div style={{fontSize: '1.1rem', lineHeight: '1.8', color: '#eee', fontFamily: 'system-ui, sans-serif'}}>
               
               <div style={{marginBottom: '30px'}}>
                    {loadingText && !summaryText ? (
                        <p style={{fontStyle:'italic', color:'#aaa'}}>🤖 Skrifa samantekt...</p>
                    ) : (
                        (summaryText || article.excerpt).split('\n').map((p:string, i:number) => 
                            p.trim() && <p key={i} style={{marginBottom:'15px'}}>{p.replace(/\[Lesa nánar.*\]/, '')}</p>
                        )
                    )}
               </div>

               {/* TAKKINN (TRAFFIC GENERATOR) */}
               <div style={{textAlign: 'center', marginBottom: '20px'}}>
                    <button 
                        onClick={() => handleOutboundClick(article.url)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '10px',
                            color: 'white', textDecoration: 'none', fontWeight: 'bold', 
                            border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
                            padding: '16px 32px', borderRadius: '50px', backdropFilter: 'blur(5px)',
                            cursor: 'pointer', fontSize: '1.1rem'
                        }}
                    >
                        <span>Lesa alla fréttina á {sourceName}</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </button>
                    <p style={{fontSize: '0.8rem', color: '#888', marginTop: '10px'}}>Smelltu til að styðja við blaðamennsku {sourceName}</p>
               </div>
             </div>
           )}
           
           {/* FLIPI 2: TENGT */}
           {activeTab === 'related' && (
             <div>
                 {loadingRelated ? 'Leita...' : relatedArticles.length === 0 ? 'Ekkert tengt efni fannst.' : relatedArticles.map(rel => (
                     <div 
                        key={rel.id} 
                        onClick={(e) => { e.stopPropagation(); if (onRelatedClick) onRelatedClick(rel); }}
                        style={{
                            cursor: 'pointer', marginBottom:'15px', paddingBottom:'15px', borderBottom:'1px solid rgba(255,255,255,0.1)'
                        }}
                     >
                         <div style={{fontSize:'0.8rem', color:'#888', marginBottom:'2px'}}>{rel.sources?.name} • {new Date(rel.published_at).toLocaleDateString('is-IS')}</div>
                         <div style={{fontWeight:'bold', fontSize:'1rem'}}>{rel.title}</div>
                     </div>
                 ))}
             </div>
           )}
           
           {/* LOKA TAKKINN (ÖRIN) */}
           <div onClick={onClose} style={{marginTop: '50px', marginBottom: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', opacity: 0.8}}>
             <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '5px'}}>Loka</span>
             <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
           </div>
        </div>
      </div>
      )}
    </section>
  );
}

function tabStyle(isActive: boolean) {
  return {
    flex: 1, padding: '10px 0', background: 'none', border: 'none',
    color: isActive ? 'white' : '#888', borderBottom: isActive ? '2px solid white' : 'none',
    fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer'
  };
}
