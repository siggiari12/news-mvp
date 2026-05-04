'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    const id = localStorage.getItem('vizka_device_id') || 'Ekki til';
    setDeviceId(id);
  }, []);

  function clearHistory() {
    localStorage.removeItem('vizka_device_id');
    setDeviceId('Eytt');
  }

  return (
    <main style={{ background: '#000', minHeight: '100dvh', color: '#fff', padding: '60px 24px 40px' }}>
      <Link href="/" style={{ color: '#888', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block', marginBottom: '32px' }}>
        ← Til baka
      </Link>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '32px' }}>Stillingar</h1>

      <section style={{ maxWidth: '520px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          Tæki
        </h2>
        <div style={{ background: '#111', borderRadius: '12px', padding: '16px 20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>Tæki-auðkenni</div>
          <div style={{ fontSize: '0.9rem', color: '#aaa', fontFamily: 'monospace', wordBreak: 'break-all' }}>{deviceId}</div>
        </div>
        <button
          onClick={clearHistory}
          style={{
            background: 'rgba(255,59,48,0.15)', border: '1px solid rgba(255,59,48,0.3)',
            color: '#ff3b30', borderRadius: '10px', padding: '12px 20px',
            fontSize: '0.95rem', cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
        >
          Eyða lestrasögu og auðkenni
        </button>
      </section>
    </main>
  );
}
