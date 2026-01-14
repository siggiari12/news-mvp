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
  
  // State fyrir UI (hvað er opið?)
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <main className="h-screen w-full bg-black text-white overflow-hidden relative">
      
      {/* 
          1. Header fær núna 'isMenuOpen' (lagar villuna).
          2. Header sér alfarið um að teikna valmyndina sjálfur.
      */}
      <Header 
          isMenuOpen={showMenu}
          onMenuClick={() => setShowMenu(!showMenu)} 
          onSearchClick={() => setShowSearch(!showSearch)} 
      />

      <CategoryFilter 
        activeCategory={activeCategory} 
        onSelectCategory={setActiveCategory} 
      />

      {/* Fréttastraumurinn */}
      <div className="absolute inset-0 z-0">
        <NewsFeed 
            initialArticles={initialArticles} 
            activeCategory={activeCategory}
            showSearchProp={showSearch}
            onCloseSearch={() => setShowSearch(false)}
        />
      </div>
    </main>
  );
}
