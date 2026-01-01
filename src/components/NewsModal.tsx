"use client";
import { useState, useEffect } from "react";

interface NewsModalProps {
  article: any;
  onClose: () => void;
}

export default function NewsModal({ article, onClose }: NewsModalProps) {
  const [activeTab, setActiveTab] = useState<'read' | 'eli10' | 'related'>('read');
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    if (activeTab === 'eli10' && !summary) fetchSummary();
    if (activeTab === 'related' && relatedArticles.length === 0) fetchRelated();
  }, [activeTab]);

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
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 2000,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      animation: 'fadeScale 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
    }}>
      
      {/* FLIPARNIR */}
      <div style={{
        display: 'flex', 
        paddingTop: '50px',
        paddingBottom: '0',
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(10px)',
        zIndex: 10,
        borderBottom: '1px solid #222',
        flexShrink: 0
      }}>
        <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>📄 Fréttin</button>
        <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>🤖 Samantekt</button>
        <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>🔗 Tengt efni</button>
      </div>

      {/* EFNIÐ */}
      <div style={{
        height: '100%', // Fyllir plássið
        overflowY: 'scroll', // Þvingar skroll-stiku
        WebkitOverflowScrolling: 'touch',
        padding: '20px', 
        paddingBottom: '120px',
        overscrollBehavior: 'contain' // Passar að skrollið "leki" ekki út
      }}>

        
        {/* LESTUR */}
        {activeTab === 'read' && (
          <div style={{fontSize: '1.1rem', lineHeight: '1.7', color: '#e0e0e0', maxWidth: '800px', margin: '0 auto'}}>
            <h1 style={{fontSize: '1.8rem', marginBottom: '20px', lineHeight: '1.2'}}>{article.title}</h1>
            {article.full_text ? (
              article.full_text.split('\n').map((paragraph: string, i: number) => (
                paragraph.trim() && <p key={i} style={{marginBottom: '20px'}}>{paragraph}</p>
              ))
            ) : (
              <div>
                <p>{article.excerpt}</p>
                <p style={{color: '#888', fontStyle: 'italic', marginTop: '20px'}}>
                  (Fullur texti fannst ekki. <a href={article.url} target="_blank" style={{color: '#0070f3'}}>Lesa á vef miðils</a>)
                </p>
              </div>
            )}
          </div>
        )}

        {/* ELI10 */}
        {activeTab === 'eli10' && (
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            {loadingSummary ? (
              <div style={{textAlign: 'center', marginTop: '40px'}}>
                <span style={{fontSize: '2rem'}}>🤖</span>
                <p style={{color: '#888'}}>Gervigreindin er að lesa...</p>
              </div>
            ) : (
              <div style={{background: '#111', padding: '20px', borderRadius: '15px', border: '1px solid #333'}}>
                <h3 style={{marginTop: 0, color: '#0070f3'}}>🤖 ELI10 Samantekt</h3>
                <p style={{fontSize: '1.2rem', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>{summary}</p>
              </div>
            )}
          </div>
        )}

        {/* RELATED */}
        {activeTab === 'related' && (
          <div style={{maxWidth: '800px', margin: '0 auto'}}>
            {loadingRelated ? (
              <p style={{textAlign: 'center', color: '#888', marginTop: '20px'}}>🔍 Leita...</p>
            ) : relatedArticles.length === 0 ? (
              <p style={{textAlign: 'center', color: '#888', marginTop: '20px'}}>Engar tengdar fréttir.</p>
            ) : (
              relatedArticles.map((rel) => (
                <a key={rel.id} href={rel.url} target="_blank" style={{
                  display: 'block', padding: '20px', marginBottom: '15px',
                  background: '#111', borderRadius: '12px',
                  textDecoration: 'none', color: 'white', border: '1px solid #333'
                }}>
                  <div style={{fontSize: '0.8rem', color: '#0070f3', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold'}}>
                    {rel.source_name}
                  </div>
                  <div style={{fontWeight: 'bold', fontSize: '1.1rem', lineHeight: '1.4'}}>{rel.title}</div>
                </a>
              ))
            )}
          </div>
        )}
      </div>

      {/* LOKA TAKKINN */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          bottom: '0',
          left: '0',
          width: '100%',
          height: '100px',
          background: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 20
        }}
      >
         <div style={{
           display: 'flex', flexDirection: 'column', alignItems: 'center',
           animation: 'bounce 2s infinite'
         }}>
            <span style={{fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '5px'}}>Loka</span>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
         </div>
      </div>

    </div>
  );
}

function tabStyle(isActive: boolean) {
  return {
    flex: 1, 
    paddingTop: '15px',
    paddingBottom: '15px',
    paddingLeft: '0',
    paddingRight: '0',
    background: 'none', 
    border: 'none',
    color: isActive ? 'white' : '#666',
    borderBottom: isActive ? '3px solid #0070f3' : '1px solid transparent',
    fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s'
  };
}
