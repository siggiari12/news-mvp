"use client";
import { useState, useEffect } from "react";
import NewsCard from "./NewsCard"; // MIKILVÆGT: Við notum NewsCard hér!
import { supabaseBrowser } from "@/lib/supabase";

export default function NewsFeed({ initialArticles }: { initialArticles: any[] }) {
  const [articles, setArticles] = useState<any[]>(initialArticles);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      // console.log("Sæki nýjar fréttir...");
      const { data } = await supabaseBrowser
        .from('articles')
        .select('*, sources(name)')
        .order('published_at', { ascending: false })
        .limit(50);
      
      if (data) {
        setArticles(prev => {
            if (prev.length > 0 && data.length > 0 && prev[0].id === data[0].id) return prev;
            return data;
        });
        setLoading(false);
      }
    };

    fetchNews();
    
    // Realtime hlustun
    const channel = supabaseBrowser
      .channel('realtime-articles')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'articles' }, (payload) => {
        console.log("Ný frétt kom!", payload);
        fetchNews();
      })
      .subscribe();

    // Polling á 60 sek fresti
    const interval = setInterval(() => {
      fetchNews();
    }, 60000);

    return () => { 
      supabaseBrowser.removeChannel(channel); 
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
        <div style={{background: '#000', height: '100vh', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'}}>
          <style>{`@keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } } .skeleton { background: #333; border-radius: 8px; animation: pulse 1.5s infinite ease-in-out; }`}</style>
          <div className="skeleton" style={{width: '100px', height: '16px', marginBottom: '16px'}}></div>
          <div className="skeleton" style={{width: '90%', height: '32px', marginBottom: '12px'}}></div>
          <div className="skeleton" style={{width: '70%', height: '32px', marginBottom: '40px'}}></div>
        </div>
    );
  }

  return (
    <main className="feed-container">
      {/* Hér notum við NewsCard sem sér um allt útlitið (örina, baksíðuna o.s.frv.) */}
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
      
      {articles.length === 0 && (
         <div className="news-card" style={{justifyContent: 'center', alignItems: 'center'}}>
            <h2>Engar fréttir fundust 😢</h2>
            <p>Appið er að leita...</p>
         </div>
      )}
    </main>
  );
}
