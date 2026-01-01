"use client";
import { useState, useEffect } from "react";

const getBranding = (sourceName: string | undefined) => {
  const name = (sourceName || '').toLowerCase();
  if (name.includes('mbl')) return { bg: 'hsl(240deg 100% 23.53%)', logo: '/mbl.png', scale: '80%' };
  if (name.includes('rúv') || name.includes('ruv')) return { bg: '#00477f', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg', scale: '60%' };
  if (name.includes('vísir') || name.includes('visir')) return { bg: '#f4d100', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg', scale: '60%' };
  if (name.includes('dv')) return { bg: '#d0021b', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png', scale: '60%' };
  return { bg: '#222', logo: null, scale: '100%' };
};

export default function NewsCard({ article }: { article: any }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'read' | 'eli10' | 'related'>('read');
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const branding = getBranding(article.sources?.name);

  useEffect(() => {
    if (expanded && activeTab === 'eli10' && !summary) fetchSummary();
    if (expanded && activeTab === 'related' && relatedArticles.length === 0) fetchRelated();
  }, [expanded, activeTab]);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const textToUse = article.full_text || (article.title + "\n" + article.excerpt);
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id, textToSummarize: textToUse })
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
    <section className="news-card" style={{position: 'relative', overflow: 'hidden', height: '100vh', width: '100%'}}>
      
      {/* 1. BAKGRUNNUR */}
      <div className="bg-image" style={{
        background: branding.bg,
        zIndex: 0, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: expanded ? 'brightness(0.2) blur(10px)' : 'none',
        transition: 'all 0.5s ease'
      }}>
          {branding.logo && (
            <img src={branding.logo} alt="" style={{width: branding.scale, opacity: 0.9, display: 'block'}} 
              onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
          )}
          <h1 style={{fontSize: '4rem', color: 'rgba(255,255,255,0.2)', display: branding.logo ? 'none' : 'block'}}>{article.sources?.name}</h1>
      </div>

      {article.image_url && (
        <img src={article.image_url} alt="" className="bg-image" style={{ 
          zIndex: 1, 
          filter: expanded ? 'brightness(0.2) blur(10px)' : 'none',
          transition: 'all 0.5s ease'
        }} onError={(e) => (e.target as HTMLElement).style.display = 'none'} />
      )}
      
      {/* 2. GRADIENT */}
      <div 
        style={{
          zIndex: 2,
          position: 'absolute', bottom: 0, left: 0, width: '100%', height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
          opacity: expanded ? 0 : 1,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none'
        }}
      ></div>

      {/* 3. FORSÍÐA (Texti) */}
      <div 
        className="content" 
        style={{
          zIndex: 3, 
          position: 'absolute', bottom: 0, left: 0, width: '100%',
          padding: '24px',
          // Lyftum textanum upp (160px frá botni)
          paddingBottom: '160px', 
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto',
          transition: 'opacity 0.3s ease'
        }}
      >
        <div className="source-badge" style={{marginBottom: '10px'}}>
          {article.sources?.name} • {new Date(article.published_at).toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'})}
        </div>
        
        <h2 className="title" onClick={() => setExpanded(true)}>{article.title}</h2>
        <p className="excerpt" onClick={() => setExpanded(true)}>{article.excerpt}</p>
      </div>

      {/* 3b. ÖRIN (100px frá botni) */}
      <div 
        onClick={() => setExpanded(true)} 
        style={{
          zIndex: 3,
          position: 'absolute', 
          bottom: '100px', 
          left: 0, width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
          opacity: expanded ? 0 : 0.8,
          pointerEvents: expanded ? 'none' : 'auto',
          transition: 'opacity 0.3s ease'
        }}
      >
        <svg className="arrow-bounce" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
        <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginTop: '5px'}}>Sjá meira</span>
      </div>

      {/* 4. BAKSÍÐA (Expanded) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        zIndex: 4,
        display: 'flex', flexDirection: 'column',
        opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? 'auto' : 'none',
        transition: 'opacity 0.3s ease 0.1s',
        paddingTop: '60px'
      }}>
        
        {/* Header */}
        <div style={{padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h2 style={{fontSize: '1.2rem', fontWeight: 'bold', margin: 0, flex: 1}}>{article.title}</h2>
           <button onClick={() => setExpanded(false)} style={{background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', padding: '10px'}}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
           </button>
        </div>

        {/* Flipar */}
        <div style={{display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.2)', margin: '20px'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>📄 Fréttin</button>
          <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>🤖 Samantekt</button>
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>🔗 Tengt</button>
        </div>

        {/* Efni */}
        <div 
          className="modal-content"
          style={{flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px'}}
        >
           {activeTab === 'read' && (
             <div style={{fontSize: '1.1rem', lineHeight: '1.7', color: '#eee'}}>
               {article.full_text ? article.full_text.split('\n').map((p:string, i:number) => p.trim() && <p key={i} style={{marginBottom:'15px'}}>{p}</p>) : <p>{article.excerpt}</p>}
             </div>
           )}
           {activeTab === 'eli10' && (
             <div>{loadingSummary ? '🤖 Hugsa...' : <p style={{fontSize:'1.2rem', lineHeight:'1.6'}}>{summary}</p>}</div>
           )}
           {activeTab === 'related' && (
             <div>{relatedArticles.map(rel => <div key={rel.id} style={{marginBottom:'15px', fontWeight:'bold'}}>{rel.title}</div>)}</div>
           )}
           
           <div style={{textAlign: 'center', marginTop: '50px', color: '#888', paddingBottom: '80px'}}>
             <p onClick={() => setExpanded(false)}>⬇️ Loka frétt</p>
           </div>
        </div>
      </div>

    </section>
  );
}

function tabStyle(isActive: boolean) {
  return {
    flex: 1, padding: '10px 0', background: 'none', border: 'none',
    color: isActive ? 'white' : '#888',
    borderBottom: isActive ? '2px solid white' : 'none',
    fontWeight: 'bold', fontSize: '0.9rem'
  };
}
