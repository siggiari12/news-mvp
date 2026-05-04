import Link from 'next/link';

export default function ContactPage() {
  return (
    <main style={{ background: '#000', minHeight: '100dvh', color: '#fff', padding: '60px 24px 40px' }}>
      <Link href="/" style={{ color: '#888', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block', marginBottom: '32px' }}>
        ← Til baka
      </Link>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '16px' }}>Hafa samband</h1>
      <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: '#ccc', maxWidth: '520px' }}>
        Spurningar, athugasemdir eða hugmyndir? Sendu okkur tölvupóst:
      </p>
      <a
        href="mailto:hallo@vizka.app"
        style={{ display: 'inline-block', marginTop: '20px', fontSize: '1.1rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}
      >
        hallo@vizka.app
      </a>
    </main>
  );
}
