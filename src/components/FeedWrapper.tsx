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

  // Sameiginleg breyta: Ef frétt er opin EÐA leit er opin -> Fela UI
  const shouldHideUI = isArticleOpen || showSearch;

  return (
    <main className="h-screen w-full bg-black text-white overflow-hidden relative touch-none">
      
      {/* HEADER: Z-index 50. 
          Við sendum isHidden={shouldHideUI} inn í Header.
          (Mundu að Header.tsx verður að taka við 'isHidden' propinu eins og við ræddum) 
      */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header 
            isMenuOpen={showMenu}
            onMenuClick={() => setShowMenu(!showMenu)} 
            onSearchClick={() => setShowSearch(!showSearch)}
            // @ts-ignore (Ef þú ert ekki búinn að uppfæra Header interfaceið ennþá)
            isHidden={shouldHideUI} 
        />
      </div>

      {/* FLOKKAR: Z-index 40. 
          Við sendum isHidden={shouldHideUI} inn í CategoryFilter.
      */}
      <div className="absolute top-16 left-0 right-0 z-40">
        <CategoryFilter 
          activeCategory={activeCategory} 
          onSelectCategory={setActiveCategory} 
          // @ts-ignore (Ef þú ert ekki búinn að uppfæra CategoryFilter interfaceið ennþá)
          isHidden={shouldHideUI}
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
