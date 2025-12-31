"use client";
import { useState, useEffect } from "react";

interface NewsModalProps {
  article: any;
  onClose: () => void;
}

export default function NewsModal({ article, onClose }: NewsModalProps) {
  const [activeTab, setActiveTab] = useState<'read' | 'eli10' | 'related'>('read');
  
  // State fyrir ELI10
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // State fyrir Tengdar fréttir
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Sækja gögn þegar skipt er um flipa
  useEffect(() => {
    if (activeTab === 'eli10' && !summary) {
      fetchSummary();
    }
    if (activeTab === 'related' && relatedArticles.length === 0) {
      fetchRelated();
    }
  }, [activeTab]);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const textToUse = article.full_text || (article.title + "\n" + article.excerpt);
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          articleId: article.id, 
          textToSummarize: textToUse
        })
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
      background: 'rgba(0,0,0,0.85)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
    }} onClick={onClose}>
      
      <div style={{
        background: '#1a1a1a', height: '90vh', width: '100%',
        borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
        padding: '20px', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.3s ease-out'
      }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{width: '40px', height: '4px', background: '#444', borderRadius: '2px', margin: '0 auto 20px auto'}}></div>

        <h2 style={{fontSize: '1.4rem', marginBottom: '10px', lineHeight: '1.3'}}>{article.title}</h2>

        {/* FLIPARNIR */}
        <div style={{display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #333'}}>
          <button onClick={() => setActiveTab('read')} style={tabStyle(activeTab === 'read')}>📄 Lestur</button>
          <button onClick={() => setActiveTab('eli10')} style={tabStyle(activeTab === 'eli10')}>🤖 ELI10</button>
          <button onClick={() => setActiveTab('related')} style={tabStyle(activeTab === 'related')}>🔗 Tengt</button>
        </div>

        {/* EFNIÐ */}
        <div style={{flex: 1, overflowY: 'auto', paddingBottom: '40px'}}>
          
          {/* LESTUR */}
          {activeTab === 'read' && (
            <div style={{fontSize: '1.1rem', lineHeight: '1.6', color: '#ddd'}}>
              {article.full_text ? (
                article.full_text.split('\n').map((paragraph: string, i: number) => (
                  paragraph.trim() && <p key={i} style={{marginBottom: '15px'}}>{paragraph}</p>
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
            <div>
              {loadingSummary ? (
                <p style={{color: '#888', textAlign: 'center', marginTop: '20px'}}>🤖 Les greinina og skrifa samantekt...</p>
              ) : (
                <p style={{fontSize: '1.2rem', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>{summary}</p>
              )}
            </div>
          )}

          {/* RELATED */}
          {activeTab === 'related' && (
            <div style={{paddingTop: '10px'}}>
              {loadingRelated ? (
                <p style={{textAlign: 'center', color: '#888'}}>🔍 Leita að tengdum fréttum...</p>
              ) : relatedArticles.length === 0 ? (
                <p style={{textAlign: 'center', color: '#888'}}>Engar tengdar fréttir fundust.</p>
              ) : (
                relatedArticles.map((rel) => (
                  <a key={rel.id} href={rel.url} target="_blank" style={{
                    display: 'block', padding: '15px', marginBottom: '10px',
                    background: 'rgba(255,255,255,0.05)', borderRadius: '10px',
                    textDecoration: 'none', color: 'white', border: '1px solid #333'
                  }}>
                    <div style={{fontSize: '0.8rem', color: '#0070f3', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '1px'}}>
                      {rel.source_name}
                      {/* {Math.round(rel.similarity * 100)}% líkindi */}
                    </div>
                    <div style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{rel.title}</div>
                  </a>
                ))
              )}
            </div>
          )}

        </div>

        <button onClick={onClose} style={{
          marginTop: '10px', padding: '15px', background: '#333', color: 'white',
          border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'
        }}>Loka</button>
      </div>
    </div>
  );
}

function tabStyle(isActive: boolean) {
  return {
    flex: 1, padding: '10px', background: 'none', border: 'none',
    color: isActive ? 'white' : '#666',
    borderBottom: isActive ? '2px solid #0070f3' : 'none',
    fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s'
  };
}
