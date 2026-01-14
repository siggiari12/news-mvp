'use client';

interface CategoryFilterProps {
  activeCategory: any;
  onSelectCategory: (category: any) => void;
}

export default function CategoryFilter({ activeCategory, onSelectCategory }: CategoryFilterProps) {
  const categories = [
    { id: 'allt', label: 'ALLT' },
    { id: 'innlent', label: 'INNLENT' },
    { id: 'erlent', label: 'ERLENT' },
    { id: 'folk', label: 'FÓLKIÐ' },
    { id: 'sport', label: 'ÍÞRÓTTIR' },
    
  ];

  return (
    <div className="category-bar">
      <div className="scroll-row">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
