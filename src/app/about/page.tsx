import Link from 'next/link';

export default function AboutPage() {
  return (
    <main style={{ background: '#000', minHeight: '100dvh', color: '#fff', padding: '60px 24px 40px' }}>
      <Link href="/" style={{ color: '#888', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block', marginBottom: '32px' }}>
        ← Til baka
      </Link>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '16px' }}>Um Vizku</h1>
      <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: '#ccc', maxWidth: '520px' }}>
        Vizka er íslensk fréttasamleggjari sem birtir fréttir frá RÚV, MBL, Vísir, DV og erlendum miðlum
        í TikTok-stíl viðmóti. Við notum gervigreind til að búa til samantektir og flokka fréttir
        þannig að þú getur fylgst með heildarmyndinni fljótt og örugglega.
      </p>
      <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: '#ccc', maxWidth: '520px', marginTop: '16px' }}>
        Vizka er í þróun og við hlökkum til að hlusta á endurgjöf þína.
      </p>
    </main>
  );
}
