'use client';

import { Menu, Search, X, Info, Settings, Shield, Mail, LogIn } from 'lucide-react';
import Link from 'next/link';

interface HeaderProps {
  onSearchClick: () => void;
  onMenuClick: () => void;
  isMenuOpen: boolean;
}

export default function Header({ onSearchClick, onMenuClick, isMenuOpen }: HeaderProps) {
  return (
    <>
      {/* HEADER */}
      <header className="app-header">
        <button onClick={onMenuClick} className="header-btn">
          <Menu size={28} />
        </button>

        <div className="logo-container" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
          <img src="/vizka.png" alt="Logo" className="main-logo" />
        </div>

        <button onClick={onSearchClick} className="header-btn">
          <Search size={28} />
        </button>
      </header>

      {/* VALMYND (SIDEBAR) */}
      <div 
        className={`menu-overlay ${isMenuOpen ? 'open' : ''}`} 
        onClick={onMenuClick} 
      />

      <div className={`sidebar ${isMenuOpen ? 'open' : ''}`}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '40px'}}>
          <h2 className="app-logo">VIZKA</h2>
          <button onClick={onMenuClick} style={{background:'none', border:'none', color:'#888'}}>
            <X size={28} />
          </button>
        </div>

        <nav style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
          <MenuItem icon={<Info size={20} />} label="Um Vizku" href="/about" />
          <MenuItem icon={<Mail size={20} />} label="Hafa samband" href="/contact" />
          <div style={{height: '1px', background: '#333', margin: '10px 0'}} />
          <MenuItem icon={<Settings size={20} />} label="Stillingar" href="/settings" />
          <MenuItem icon={<Shield size={20} />} label="Persónuvernd" href="/privacy" />
        </nav>

        <div style={{marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #333', textAlign:'center', color:'#555', fontSize:'12px'}}>
          © 2024 Vizka
        </div>
      </div>
    </>
  );
}

function MenuItem({ icon, label, href }: { icon: any, label: string, href: string }) {
  return (
    <Link href={href} className="menu-link">
      <span style={{color: '#3b82f6'}}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
