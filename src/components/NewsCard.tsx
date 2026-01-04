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
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [topicArticles, setTopicArticles] = useState<any[]>([]);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  
  // Við geymum tímann í state svo hann reiknist bara í vafranum (Hydration fix)
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
      // Ef notandi velur ELI10 flipann handvirkt
      if (activeTab === 'eli10' && !summary) fetchSummary();
      
      // Ef þetta er Topic (Stórmál):
      if (isTopic) {
          // 1. Sækjum hinar fréttirnar
          if (topicArticles.length === 0) fetchTopicArticles();
          // 2. Sækjum LÍKA samantekt strax (til að sýna efst í tímalínunni)
          if (!summary) fetchSummary(); 
      }
      
      // Ef stök frétt, sækjum related
      if (!isTopic && activeTab === 'related' && relatedArticles.length === 0) fetchRelated();
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

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      // Lykilbreyting: Sendum topicId ef þetta er stórmál, annars texta
      const payload = isTopic 
        ? { topicId: article.id } 
        : { textToSummarize: article.full_text || (article.title + "\n" + article.excerpt) };

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
    } catch (e) { console.error(e); } finally { setLoadingSummary(false); }
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
      setRelatedArticles(data.articles || []);
    } catch (e) { console.error(e); } finally { setLoadingRelated(false); }
  };

  return (
    <section 
      ref={cardRef}
      className="news-card" 
      style={{position: 'relative', overflow: 'hidden', height: '100vh', width: '100%'}}
    >
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

        <div style={{display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', margin: '20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>
              {isTopic ? '🗞️ Tímalína' : '📄 Fréttin'}
          </button>
          <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>🤖 Samantekt</button>
          {!isTopic && <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>🔗 Tengt</button>}
        </div>

        <div className="modal-content" style={{flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px'}}>
           {activeTab === 'read' && (
             <div style={{fontSize: '1.1rem', lineHeight: '1.8', color: '#eee', fontFamily: 'system-ui, sans-serif'}}>
               
               {isTopic ? (
                   // --- TÍMALÍNA MEÐ SAMANTEKT EFST ---
                   <div className="timeline">
                       
                       {/* NÝTT: Box fyrir samantektina */}
                       <div style={{
                           background: 'rgba(255,255,255,0.1)', 
                           padding: '20px', 
                           borderRadius: '12px', 
                           marginBottom: '30px',
                           borderLeft: '4px solid #4da6ff'
                       }}>
                           <h3 style={{marginTop: 0, fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px'}}>Yfirlit málsins (AI)</h3>
                           <p style={{margin: 0, fontSize: '1.1rem', lineHeight: '1.6'}}>
                               {loadingSummary && !summary ? '🤖 Les fréttirnar og skrifa yfirlit...' : (summary || article.excerpt)}
                           </p>
                       </div>

                       {/* Listi af fréttum */}
                       {loadingTopic ? <p>Sæki fréttir...</p> : topicArticles.map((item) => (
                           <div key={item.id} style={{marginBottom: '25px', paddingBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                               <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px', fontSize:'0.9rem', color:'#aaa'}}>
                                   <span style={{fontWeight:'bold', color:'white'}}>{item.sources?.name}</span>
                                   <span>• {new Date(item.published_at).toLocaleTimeString('is-IS', {hour:'2-digit', minute:'2-digit'})}</span>
                               </div>
                               <h3 style={{margin:'0 0 10px 0', fontSize:'1.2rem'}}>{item.title}</h3>
                               <p style={{fontSize:'1rem', color:'#ccc', marginBottom:'10px'}}>{item.excerpt}</p>
                               <a href={item.url} target="_blank" style={{color:'#4da6ff', textDecoration:'none', fontSize:'0.9rem'}}>Lesa alla frétt ↗</a>
                           </div>
                       ))}
                   </div>
               ) : (
                   // --- VENJULEG FRÉTT ---
                   <>
                    {article.full_text ? (
                        article.full_text.split('\n').map((paragraph: string, i: number) => {
                        if (paragraph.includes('[Lesa nánar á vef miðils]')) return null;
                        return paragraph.trim() && <p key={i} style={{marginBottom:'20px'}}>{paragraph}</p>;
                        })
                    ) : (<p>{article.excerpt}</p>)}
                    <div style={{marginTop: '40px', textAlign: 'center'}}>
                        <a href={article.url} target="_blank" style={{
                            display: 'inline-block', color: 'white', textDecoration: 'none', fontWeight: 'bold', 
                            border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
                            padding: '12px 24px', borderRadius: '30px', backdropFilter: 'blur(5px)'
                        }}>Lesa nánar á vef miðils ↗</a>
                    </div>
                   </>
               )}
             </div>
           )}
           {activeTab === 'eli10' && (<div>{loadingSummary ? '🤖 Hugsa...' : <p style={{fontSize:'1.2rem', lineHeight:'1.6'}}>{summary || 'Engin samantekt í boði.'}</p>}</div>)}
           {!isTopic && activeTab === 'related' && (<div>{relatedArticles.map(rel => <div key={rel.id} style={{marginBottom:'15px', fontWeight:'bold'}}>{rel.title}</div>)}</div>)}
           
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
    fontWeight: 'bold', fontSize: '0.9rem'
  };
}
