"use client";
import { useState } from "react";
import NewsModal from "./NewsModal";

const getBranding = (sourceName: string) => {
  const name = sourceName?.toLowerCase() || '';

  if (name.includes('mbl')) {
    return {
      bg: 'hsl(240deg 100% 23.53%)',
      logo: '/mbl.png', // ATH: Gæsalappir utan um!
      scale: '70%'
    };
  }
  if (name.includes('rúv') || name.includes('ruv')) {
    return {
      bg: '#00477f',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/6/63/R%C3%9AV_logo.svg',
      scale: '60%'
    };
  }
  if (name.includes('vísir') || name.includes('visir')) {
    return {
      bg: '#f4d100',
      // Vísir logo (SVG)
      logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/V%C3%ADsir_logo.svg',
      scale: '60%',
    };
  }
  if (name.includes('dv')) {
    return {
      bg: '#d0021b',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/DV_logo.svg/512px-DV_logo.svg.png',
      scale: '60%'
    };
  }

  return { bg: '#222', logo: null, scale: '100%' };
};

export default function NewsFeed({ articles }: { articles: any[] }) {
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);

  return (
    <main className="feed-container">
      {selectedArticle && (
        <NewsModal 
          article={selectedArticle} 
          onClose={() => setSelectedArticle(null)} 
        />
      )}

      <a href="/api/ingest" target="_blank" className="refresh-btn">🔄</a>

      {articles.map((article) => {
        const branding = getBranding(article.sources?.name);

        return (
          <section key={article.id} className="news-card">
            
            {/* 1. BRANDED BAKGRUNNUR (Layer 0) */}
            <div className="bg-image" style={{
              background: branding.bg,
              zIndex: 0, 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column'
            }}>
                {/* LÓGÓIÐ */}
                {branding.logo && (
                  <img 
                    src={branding.logo} 
                    alt={article.sources?.name}
                    style={{
                      width: branding.scale, 
                      maxWidth: '80%', 
                      opacity: 0.9,
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                      display: 'block' // Sýnilegt by default
                    }} 
                    onError={(e) => {
                      // EF LÓGÓ KLIKKAR:
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none'; // Fela myndina
                      // Finna textann fyrir neðan og sýna hann
                      const textFallback = img.nextElementSibling as HTMLElement;
                      if (textFallback) textFallback.style.display = 'block';
                    }}
                  />
                )}

                {/* TEXTI (Fallback ef lógó klikkar eða vantar) */}
                <h1 
                  style={{
                    fontSize: '4rem', 
                    color: 'rgba(255,255,255,0.2)', 
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    // Sýnum bara ef engin lógó slóð er til. 
                    // Ef slóð er til en brotin, sér onError um að kveikja á þessu.
                    display: branding.logo ? 'none' : 'block' 
                  }}
                >
                  {article.sources?.name}
                </h1>
            </div>

            {/* 2. FRÉTTAMYND (Layer 1) */}
            {article.image_url && (
              <img 
                src={article.image_url} 
                alt="" 
                className="bg-image"
                style={{ zIndex: 1 }}
                onError={(e) => { 
                  // Ef fréttamynd klikkar -> Fela hana -> Branded bakgrunnur sést
                  (e.target as HTMLImageElement).style.display = 'none'; 
                }}
              />
            )}
            
            <div className="overlay" style={{zIndex: 2}}></div>

            <div className="source-badge" style={{zIndex: 3}}>
              {article.sources?.name} • {new Date(article.published_at).toLocaleTimeString('is-IS', {hour: '2-digit', minute:'2-digit'})}
            </div>

            <div className="content" style={{zIndex: 3}}>
              <h2 className="title">
                <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  {article.title}
                </a>
              </h2>
              <p className="excerpt">{article.excerpt}</p>
              <div style={{marginTop: '20px'}}>
                <button 
                  onClick={() => setSelectedArticle(article)}
                  style={{
                    background: 'rgba(255,255,255,0.2)', 
                    color: 'white', border: '1px solid rgba(255,255,255,0.4)', 
                    padding: '10px 20px', borderRadius: '20px', 
                    fontWeight: 'bold', backdropFilter: 'blur(5px)', cursor: 'pointer'
                  }}>
                  Sjá meira & AI
                </button>
              </div>
            </div>
          </section>
        );
      })}
      
      {articles.length === 0 && (
         <div className="news-card" style={{justifyContent: 'center', alignItems: 'center'}}>
            <h2>Engar fréttir fundust 😢</h2>
            <p>Prófaðu að smella á refresh takkann.</p>
         </div>
      )}
    </main>
  );
}
