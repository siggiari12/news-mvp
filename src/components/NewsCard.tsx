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

export default function NewsCard({ article }: { article: any }) {
  if (!article) return null;

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'read' | 'eli10' | 'related'>('read');
  
  // --- NÝTT STATE FYRIR TVÆR TEGUNDIR AF TEXTA ---
  const [unifiedStory, setUnifiedStory] = useState<string | null>(null); // Super-fréttin
  const [eli10, setEli10] = useState<string | null>(null); // Einföldun
  
  const [loadingText, setLoadingText] = useState(false);
  const [loadingEli10, setLoadingEli10] = useState(false);

  const [topicArticles, setTopicArticles] = useState<any[]>([]);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  
  const [formattedTime, setFormattedTime] = useState<string>('');
  
  const cardRef = useRef<HTMLElement>(null);
  const supabase = supabaseBrowser; 

  const isTopic = article.article_count && article.article_count > 1;
  const sourceName = article.sources?.name || (isTopic ? 'Samantekt' : '');
  const branding = getBranding(sourceName);

  useEffect(() => {
    const date = new Date(article.published_at || article.updated_at);
    setFormattedTime(date.toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'}));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.4) {
          setExpanded(false);
        }
      },
      { threshold: 0.4 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (expanded) {
      if (isTopic) {
          // 1. Sækja heimildir (fyrir lista neðst)
          if (topicArticles.length === 0) fetchTopicArticles();
          // 2. Sækja Super-fréttina (fyrir aðal textann)
          if (!unifiedStory) fetchSummary('full'); 
      }
      
      // Ef notandi fer í ELI10 flipann
      if (activeTab === 'eli10' && !eli10) fetchSummary('eli10');
      
      // Ef notandi fer í Related flipann
      if (activeTab === 'related' && relatedArticles.length === 0) fetchRelated();
    }
  }, [expanded, activeTab]);

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

  // --- UPPFÆRT FETCH SUMMARY ---
  const fetchSummary = async (type: 'full' | 'eli10') => {
    if (type === 'full') setLoadingText(true);
    else setLoadingEli10(true);

    try {
      const payload = isTopic 
        ? { topicId: article.id, type } 
        : { textToSummarize: article.full_text || (article.title + "\n" + article.excerpt), type };

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
      const res = await fetch('/api/related', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ articleId: article.id })
      });
      const data = await res.json();
      
      // Síum út fréttir sem eru nú þegar í topicinu
      const currentIds = topicArticles.map(a => a.id);
      const filtered = (data.articles || []).filter((a: any) => !currentIds.includes(a.id) && a.id !== article.id);
      
      setRelatedArticles(filtered);
    } catch (e) { console.error(e); } finally { setLoadingRelated(false); }
  };

  return (
    <section 
      ref={cardRef}
      className="news-card" 
      style={{position: 'relative', overflow: 'hidden', height: '100vh', width: '100%'}}
    >
      {/* BAKGRUNNUR & FORSÍÐA (Óbreytt) */}
      <div className="bg-image" style={{
        background: branding.bg, zIndex: 0, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: expanded ? 'brightness(0.4) blur(15px)' : 'none',
        transition: 'all 0.5s ease'
      }}>
          {branding.logo && (
            <img src={branding.logo} alt="" style={{width: branding.scale, opacity: 0.9, display: 'block'}} 
              onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
          )}
          <h1 style={{fontSize: '4rem', color: 'rgba(255,255,255,0.2)', display: branding.logo ? 'none' : 'block'}}>{sourceName}</h1>
      </div>

      {article.image_url && (
        <img src={article.image_url} alt="" className="bg-image" style={{ 
          zIndex: 1, filter: expanded ? 'brightness(0.4) blur(15px)' : 'none',
          transition: 'all 0.5s ease'
        }} onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
      )}
      
      <div style={{
          zIndex: 2, position: 'absolute', bottom: 0, left: 0, width: '100%', height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
          opacity: expanded ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: 'none'
      }}></div>

      <div className="content" style={{
          zIndex: 3, position: 'absolute', bottom: 0, left: 0, width: '100%',
          padding: '24px', paddingBottom: '160px', opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
            <div className="source-badge">
            {sourceName} • {formattedTime}
            </div>
            {isTopic && (
                <div style={{
                    background: 'rgba(255, 69, 58, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', 
                    fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}>🔥 {article.article_count} miðlar</div>
            )}
        </div>
        <h2 className="title" onClick={() => setExpanded(true)}>{article.title}</h2>
        <p className="excerpt" onClick={() => setExpanded(true)}>{article.excerpt || article.summary || 'Smelltu til að lesa umfjöllun...'}</p>
      </div>

      <div onClick={() => setExpanded(true)} style={{
          zIndex: 3, position: 'absolute', bottom: '100px', left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: expanded ? 0 : 0.8, pointerEvents: expanded ? 'none' : 'auto', transition: 'opacity 0.3s ease'
      }}>
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px'}}>
            {isTopic ? 'Sjá umfjöllun' : 'Sjá meira'}
        </span>
      </div>

      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4,
        display: 'flex', flexDirection: 'column', opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? 'auto' : 'none', transition: 'opacity 0.3s ease 0.1s', paddingTop: '60px'
      }}>
        <div style={{padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h2 style={{fontSize: '1.2rem', fontWeight: 'bold', margin: 0, flex: 1}}>{article.title}</h2>
           <button onClick={() => setExpanded(false)} style={{background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', padding: '10px'}}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
           </button>
        </div>

        {/* --- NÝJU FLIPARNIR --- */}
        <div style={{display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', margin: '20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>
              {isTopic ? '📰 Fréttin' : '📄 Fréttin'}
          </button>
          
          {/* Núna sýnum við alltaf alla flipa */}
          <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>
              🤖 Samantekt
          </button>
          
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>
              🔗 Tengt
          </button>
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px'}}>
           
           {/* FLIPI 1: FRÉTTIN (Super-story + Heimildir) */}
           {activeTab === 'read' && (
             <div style={{fontSize: '1.1rem', lineHeight: '1.8', color: '#eee', fontFamily: 'system-ui, sans-serif'}}>
               
               {isTopic ? (
                   <>
                       {/* 1. Super-Story (AI skrifuð frétt) */}
                       <div style={{marginBottom: '40px'}}>
                           {loadingText && !unifiedStory ? (
                               <div style={{color: '#888', fontStyle: 'italic', display:'flex', alignItems:'center', gap:'10px'}}>
                                   <span>✍️</span> Les fréttirnar og skrifa yfirlit...
                               </div>
                           ) : (
                               (unifiedStory || article.excerpt).split('\n').map((p:string, i:number) => <p key={i} style={{marginBottom:'15px'}}>{p}</p>)
                           )}
                       </div>

                       {/* 2. Heimildir (Listi neðst) */}
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
                   // Stök frétt (óbreytt)
                   <>
                    {article.full_text ? (
                        article.full_text.split('\n').map((paragraph: string, i: number) => {
                        if (paragraph.includes('[Lesa nánar á vef miðils]')) return null;
                        return paragraph.trim() && <p key={i} style={{marginBottom:'20px'}}>{paragraph}</p>;
                        })
                    ) : (<p>{article.excerpt}</p>)}
                    <div style={{marginTop: '40px', textAlign: 'center'}}>
                        <a href={article.url} target="_blank" style={{display: 'inline-block', color: 'white', textDecoration: 'none', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: '30px', backdropFilter: 'blur(5px)'}}>Lesa nánar á vef miðils ↗</a>
                    </div>
                   </>
               )}
             </div>
           )}
           
           {/* FLIPI 2: ELI10 (Fyrir alla) */}
           {activeTab === 'eli10' && (
             <div>
                 {loadingEli10 && !eli10 ? '🤖 Hugsa...' : <p style={{fontSize:'1.2rem', lineHeight:'1.6'}}>{eli10 || 'Smelltu til að fá útskýringu.'}</p>}
             </div>
           )}
           
           {/* FLIPI 3: TENGT (Fyrir alla) */}
           {activeTab === 'related' && (
             <div>
                 {loadingRelated ? 'Leita...' : relatedArticles.length === 0 ? 'Ekkert tengt efni fannst.' : relatedArticles.map(rel => (
                     <div key={rel.id} style={{marginBottom:'15px', paddingBottom:'15px', borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                         <div style={{fontSize:'0.8rem', color:'#888', marginBottom:'2px'}}>{rel.sources?.name}</div>
                         <div style={{fontWeight:'bold', fontSize:'1rem'}}>{rel.title}</div>
                     </div>
                 ))}
             </div>
           )}
           
           <div onClick={() => setExpanded(false)} style={{marginTop: '50px', marginBottom: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', opacity: 0.8}}>
             <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '5px'}}>Loka</span>
             <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
           </div>
        </div>
      </div>
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
