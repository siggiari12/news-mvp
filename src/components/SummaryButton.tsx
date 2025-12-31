"use client"; // Þetta segir Next.js að þessi kóði keyri í vafranum hjá notandanum

import { useState } from "react";

export default function SummaryButton({ articleId, title, excerpt }: { articleId: number, title: string, excerpt: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          articleId, 
          textToSummarize: title + "\n" + excerpt 
        })
      });
      
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (e) {
      alert("Gat ekki sótt skýringu :(");
    } finally {
      setLoading(false);
    }
  };

  // Ef samantekt er komin, sýnum hana í staðinn fyrir takkann
  if (summary) {
    return (
      <div style={{ 
        background: 'rgba(0,0,0,0.8)', 
        padding: '15px', 
        borderRadius: '15px', 
        marginTop: '15px',
        border: '1px solid #444',
        animation: 'fadeIn 0.5s'
      }}>
        <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: '1.5' }}>{summary}</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <button 
        onClick={handleExplain}
        disabled={loading}
        style={{
          background: loading ? '#666' : 'rgba(255,255,255,0.2)', 
          color: 'white', 
          border: '1px solid rgba(255,255,255,0.4)', 
          padding: '10px 20px', 
          borderRadius: '20px', 
          fontWeight: 'bold',
          backdropFilter: 'blur(5px)',
          cursor: loading ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        {loading ? '🤖 Hugsa...' : '🤖 Útskýra fyrir mér'}
      </button>
    </div>
  );
}
