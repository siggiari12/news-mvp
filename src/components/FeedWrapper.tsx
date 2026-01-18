'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import CategoryFilter from '@/components/CategoryFilter';
import NewsFeed from '@/components/NewsFeed';

interface Props {
  initialArticles: any[];
}

export default function FeedWrapper({ initialArticles }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('allt');
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // State til að fela UI þegar frétt er opin (Full screen mode)
  const [isArticleOpen, setIsArticleOpen] = useState(false);

  return (
    <main className="h-screen w-full bg-black text-white overflow-hidden relative touch-none">
      
      {/* HEADER: Z-index 50 (yfir feed) */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header 
            isMenuOpen={showMenu}
            onMenuClick={() => setShowMenu(!showMenu)} 
            onSearchClick={() => setShowSearch(!showSearch)} 
        />
      </div>

      {/* FLOKKAR: Z-index 40. Hverfa þegar frétt/leit er opin */}
      <div className={`absolute top-16 left-0 right-0 z-40 transition-opacity duration-300 ${isArticleOpen || showSearch ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <CategoryFilter 
          activeCategory={activeCategory} 
          onSelectCategory={setActiveCategory} 
        />
      </div>

      {/* Fréttastraumurinn: Z-index 10. Fyllir allan skjáinn */}
      <div className="absolute inset-0 z-10">
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
