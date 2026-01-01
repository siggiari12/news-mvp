"use client";
import NewsCard from "./NewsCard";

export default function NewsFeed({ articles }: { articles: any[] }) {
  return (
    <main className="feed-container">
      {/* Enginn refresh takki, enginn modal hér */}
      
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
      
      {articles.length === 0 && (
         <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white'}}>
            <h2>Engar fréttir 😢</h2>
         </div>
      )}
    </main>
  );
}
