'use client';

interface CategoryFilterProps {
  activeCategory: any;
  onSelectCategory: (category: any) => void;
  isHidden?: boolean; // <-- NÝTT
}

export default function CategoryFilter({ activeCategory, onSelectCategory, isHidden = false }: CategoryFilterProps) {
  const categories = [
    { id: 'allt', label: 'ALLT' },
    { id: 'innlent', label: 'INNLENT' },
    { id: 'erlent', label: 'ERLENT' },
    { id: 'folk', label: 'FÓLKIÐ' },
    { id: 'sport', label: 'ÍÞRÓTTIR' },
  ];

  return (
    <div 
      className="category-bar"
      style={{
        // Við stjórnum sýnileika beint hér
        opacity: isHidden ? 0 : 1,
        pointerEvents: isHidden ? 'none' : 'auto',
        transform: isHidden ? 'translateY(-10px)' : 'translateY(0)',
        transition: 'opacity 0.3s ease, transform 0.3s ease'
      }}
    >
      <div className="scroll-row">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            tabIndex={isHidden ? -1 : 0} // Kemur í veg fyrir tab þegar falið
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
