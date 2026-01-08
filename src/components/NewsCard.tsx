"use client";
import { useState, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase";

const getBranding = (sourceName: string | undefined) => {
  const name = (sourceName || '').toLowerCase();
  if (name.includes('mbl')) return { bg: 'hsl(240deg 100% 23.53%)', logo: '/mbl.png', scale: '80%' };
  if (name.includes('rúv') || name.includes('ruv')) return { bg: '#00477f', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg', scale: '60%' };
  if (name.includes('vísir') || name.includes('visir')) return { bg: '#f4d100', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg', scale: '60%' };
  if (name.includes('dv')) return { bg: '#d0021b', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png', scale: '60%' };
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

  const [activeTab, setActiveTab] = useState<'read' | 'eli10' | 'related'>('read');
  const [unifiedStory, setUnifiedStory] = useState<string | null>(null);
  const [eli10, setEli10] = useState<string | null>(null);
  
  const [loadingText, setLoadingText] = useState(false);
  const [loadingEli10, setLoadingEli10] = useState(false);

  const [topicArticles, setTopicArticles] = useState<any[]>([]);
  const [loadingTopic, setLoadingTopic] = useState(false);
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
      if (topicArticles.length === 0) fetchTopicArticles();

      if (isMultiSourceTopic && !unifiedStory) fetchSummary('full'); 
      if (activeTab === 'eli10' && !eli10) fetchSummary('eli10');
      
      const readyToSearch = topicArticles.length > 0;
      if (activeTab === 'related' && relatedArticles.length === 0 && readyToSearch) {
          fetchRelated();
      }
    }
  }, [isExpanded, activeTab, topicArticles]); 

  const fetchTopicArticles = async () => {
    setLoadingTopic(true);
    const { data } = await supabase
      .from('articles')
      .select('*, sources(name)')
      .eq('topic_id', article.id)
      .order('published_at', { ascending: false });
    
    if (data) setTopicArticles(data);
    setLoadingTopic(false);
  };

  const fetchSummary = async (type: 'full' | 'eli10') => {
    if (type === 'full') setLoadingText(true);
    else setLoadingEli10(true);

    try {
      const mainArticle = topicArticles.length > 0 ? topicArticles[0] : article;
      
      const payload = isMultiSourceTopic 
        ? { topicId: article.id, type } 
        : { textToSummarize: mainArticle.full_text || (mainArticle.title + "\n" + mainArticle.excerpt), type };

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.summary) {
          if (type === 'full') setUnifiedStory(data.summary);
          else setEli10(data.summary);
      }
    } catch (e) { console.error(e); } 
    finally { 
        if (type === 'full') setLoadingText(false);
        else setLoadingEli10(false);
    }
  };

  const fetchRelated = async () => {
    setLoadingRelated(true);
    try {
      if (topicArticles.length === 0) {
          setLoadingRelated(false);
          return;
      }
      
      const searchId = topicArticles[0].id;

      const res = await fetch('/api/related', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ articleId: searchId })
      });
      const data = await res.json();
      
      const currentIds = topicArticles.map(a => a.id);
      const filtered = (data.articles || []).filter((a: any) => !currentIds.includes(a.id) && a.id !== searchId);
      
      setRelatedArticles(filtered);
    } catch (e) { console.error(e); } finally { setLoadingRelated(false); }
  };

  const displayArticle = topicArticles.length > 0 ? topicArticles[0] : article;

  return (
    <section 
      ref={cardRef}
      className="news-card" 
      style={{position: 'relative', overflow: 'hidden', height: '100vh', width: '100%'}}
    >
      {/* BAKGRUNNUR */}
      <div className="bg-image" style={{
        background: branding.bg, zIndex: 0, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: isExpanded ? 'brightness(0.4) blur(15px)' : 'none', 
        transition: 'all 0.5s ease'
      }}>
          {branding.logo && (
            <img src={branding.logo} alt="" style={{width: branding.scale, opacity: 0.9, display: 'block'}} 
              onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
          )}
          <h1 style={{fontSize: '4rem', color: 'rgba(255,255,255,0.2)', display: branding.logo ? 'none' : 'block'}}>{sourceName}</h1>
      </div>

      {displayArticle.image_url && (
        <img src={displayArticle.image_url} alt="" className="bg-image" style={{ 
          zIndex: 1, filter: isExpanded ? 'brightness(0.4) blur(15px)' : 'none', 
          transition: 'all 0.5s ease'
        }} onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
      )}
      
      <div style={{
          zIndex: 2, position: 'absolute', bottom: 0, left: 0, width: '100%', height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
          opacity: isExpanded ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: 'none' 
      }}></div>

      {/* --- LOKA TAKKI Á FRAMHLIÐ (Bara ef showCloseButton er true) --- */}
      {showCloseButton && !isExpanded && (
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 10,
                background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                width: '40px', height: '40px', color: 'white', fontSize: '1.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(5px)', cursor: 'pointer'
            }}
          >
              ✕
          </button>
      )}

      <div className="content" style={{
          zIndex: 3, position: 'absolute', bottom: 0, left: 0, width: '100%',
          padding: '24px', paddingBottom: '160px', 
          opacity: isExpanded ? 0 : 1, 
          pointerEvents: isExpanded ? 'none' : 'auto', 
          transition: 'opacity 0.3s ease'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
            <div className="source-badge">
            {sourceName} • {formattedTime}
            </div>
            {isMultiSourceTopic && (
                <div style={{
                    background: 'rgba(255, 69, 58, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', 
                    fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>🔥 {article.article_count} miðlar</div>
            )}
        </div>
        
        <h2 className="title" onClick={onOpen}>{article.title}</h2>
        <p className="excerpt" onClick={onOpen}>{article.excerpt || article.summary || 'Smelltu til að lesa umfjöllun...'}</p>
      </div>
      
      <div onClick={onOpen} style={{
          zIndex: 3, position: 'absolute', bottom: '100px', left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: isExpanded ? 0 : 0.8, 
          pointerEvents: isExpanded ? 'none' : 'auto', 
          transition: 'opacity 0.3s ease'
      }}>
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px'}}>
            {isMultiSourceTopic ? 'Sjá umfjöllun' : 'Sjá meira'}
        </span>
      </div>

      {/* BAKSÍÐA (MODAL) - BARA RENDERA EF OPIÐ! */}
      {isExpanded && (
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4,
        display: 'flex', flexDirection: 'column', 
        pointerEvents: 'auto', 
        transition: 'opacity 0.3s ease 0.1s', paddingTop: '60px',
        animation: 'fadeIn 0.3s ease' 
      }}>
        <div style={{padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h2 style={{fontSize: '1.2rem', fontWeight: 'bold', margin: 0, flex: 1}}>{article.title}</h2>
           
           <button onClick={onClose} style={{background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', padding: '10px'}}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
           </button>
        </div>

        <div style={{display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', margin: '20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>
              {isMultiSourceTopic ? '📰 Fréttin' : 'Fréttin'}
          </button>
          
          <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>
              Samantekt
          </button>
          
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>
              Tengt efni
          </button>
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px'}}>
           
           {/* FLIPI 1: FRÉTTIN */}
           {activeTab === 'read' && (
             <div style={{fontSize: '1.1rem', lineHeight: '1.8', color: '#eee', fontFamily: 'system-ui, sans-serif'}}>
               
               {isMultiSourceTopic ? (
                   <>
                       <div style={{marginBottom: '40px'}}>
                           {loadingText && !unifiedStory ? (
                               <div style={{color: '#888', fontStyle: 'italic', display:'flex', alignItems:'center', gap:'10px'}}>
                                   <span>✍️</span> Les fréttirnar og skrifa yfirlit...
                               </div>
                           ) : (
                               (unifiedStory || article.excerpt).split('\n').map((p:string, i:number) => <p key={i} style={{marginBottom:'15px'}}>{p}</p>)
                           )}
                       </div>

                       <div style={{borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px'}}>
                           <h4 style={{margin: '0 0 15px 0', color: '#888', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing:'1px'}}>Heimildir</h4>
                           {loadingTopic ? <p>Sæki...</p> : topicArticles.map((item) => (
                               <a key={item.id} href={item.url} target="_blank" style={{display:'block', textDecoration:'none', marginBottom: '15px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: '3px solid rgba(255,255,255,0.2)'}}>
                                   <div style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.8rem', color:'#aaa', marginBottom:'4px'}}>
                                       <span style={{fontWeight:'bold', color:'white'}}>{item.sources?.name}</span>
                                       <span>• {new Date(item.published_at).toLocaleTimeString('is-IS', {hour:'2-digit', minute:'2-digit'})}</span>
                                   </div>
                                   <div style={{color: '#4da6ff', fontSize:'0.95rem'}}>{item.title} ↗</div>
                               </a>
                           ))}
                       </div>
                   </>
               ) : (
                   // STÖK FRÉTT
                   <>
                    {displayArticle.full_text ? (
                        displayArticle.full_text.split('\n').map((paragraph: string, i: number) => {
                        if (paragraph.includes('[Lesa nánar á vef miðils]')) return null;
                        return paragraph.trim() && <p key={i} style={{marginBottom:'20px'}}>{paragraph}</p>;
                        })
                    ) : (<p>{displayArticle.excerpt}</p>)}
                    <div style={{marginTop: '40px', textAlign: 'center'}}>
                        <a href={displayArticle.url} target="_blank" style={{
                            display: 'inline-block', color: 'white', textDecoration: 'none', fontWeight: 'bold', 
                            border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
                            padding: '12px 24px', borderRadius: '30px', backdropFilter: 'blur(5px)'
                        }}>Lesa nánar á vef miðils ↗</a>
                    </div>
                   </>
               )}
             </div>
           )}
           
           {/* FLIPI 2: ELI10 */}
           {activeTab === 'eli10' && (
             <div>
                 {loadingEli10 && !eli10 ? '🤖 Hugsa...' : <p style={{fontSize:'1.2rem', lineHeight:'1.6'}}>{eli10 || 'Smelltu til að fá útskýringu.'}</p>}
             </div>
           )}
           
           {/* FLIPI 3: TENGT */}
           {activeTab === 'related' && (
             <div>
                 {loadingRelated ? 'Leita...' : relatedArticles.length === 0 ? 'Ekkert tengt efni fannst.' : relatedArticles.map(rel => (
                     <div 
                        key={rel.id} 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            if (onRelatedClick) onRelatedClick(rel);
                        }}
                        style={{
                            cursor: 'pointer', 
                            marginBottom:'15px', 
                            paddingBottom:'15px', 
                            borderBottom:'1px solid rgba(255,255,255,0.1)'
                        }}
                     >
                         <div style={{fontSize:'0.8rem', color:'#888', marginBottom:'2px'}}>{rel.sources?.name} • {new Date(rel.published_at).toLocaleDateString('is-IS')}</div>
                         <div style={{fontWeight:'bold', fontSize:'1rem'}}>{rel.title}</div>
                     </div>
                 ))}
             </div>
           )}
           
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
