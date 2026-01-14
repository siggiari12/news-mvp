'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import CategoryFilter from '@/components/CategoryFilter';
import NewsFeed from '@/components/NewsFeed';

interface Props {
  initialArticles: any[];
}

export default function FeedWrapper({ initialArticles }: Props) {
  const [activeCategory, setActiveCategory] = useState<any>('allt');
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Vitum hvort frétt sé opin
  const [isArticleOpen, setIsArticleOpen] = useState(false);

  return (
    <main className="h-screen w-full bg-black text-white overflow-hidden relative">
      
      {/* HEADER: Alltaf sýnilegur, z-index verður að vera hærra en NewsCard */}
      <div style={{position: 'relative', zIndex: 5000}}>
        <Header 
            isMenuOpen={showMenu}
            onMenuClick={() => setShowMenu(!showMenu)} 
            onSearchClick={() => setShowSearch(!showSearch)} 
        />
      </div>

      {/* FLOKKAR: Hverfa þegar frétt/leit er opin */}
      {!isArticleOpen && !showSearch && (
        <CategoryFilter 
          activeCategory={activeCategory} 
          onSelectCategory={setActiveCategory} 
        />
      )}

      {/* Fréttastraumurinn */}
      <div className="absolute inset-0 z-0">
        <NewsFeed 
            initialArticles={initialArticles} 
            activeCategory={activeCategory}
            showSearchProp={showSearch}
            onCloseSearch={() => setShowSearch(false)}
            onArticleStateChange={(isOpen) => setIsArticleOpen(isOpen)}
        />
      </div>
    </main>
  );
}
