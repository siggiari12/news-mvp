import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main style={{ background: '#000', minHeight: '100dvh', color: '#fff', padding: '60px 24px 40px' }}>
      <Link href="/" style={{ color: '#888', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block', marginBottom: '32px' }}>
        ← Til baka
      </Link>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '24px' }}>Persónuvernd</h1>
      <div style={{ maxWidth: '520px', fontSize: '1.05rem', lineHeight: 1.7, color: '#ccc', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p>
          Vizka safnar <strong style={{ color: '#fff' }}>engum persónuupplýsingum</strong>. Engin þörf á innskráningu
          eða tölvupósti.
        </p>
        <p>
          Við búum til nafnlægt tæki-auðkenni (geymt í <em>localStorage</em> á tækinu þínu) til að
          bæta röðun fréttanna. Þessar upplýsingar eru aldrei sendar þriðja aðila.
        </p>
        <p>
          Við skráum nafnlægar tölfræðilegar upplýsingar, þ.m.t. hvaða fréttir eru lesnar og
          smellt á, til að bæta þjónustuna. Engar upplýsingar sem rekja má til einstaklinga eru
          geymdar.
        </p>
        <p>
          Við notum <strong style={{ color: '#fff' }}>engar vafrakökur</strong> (cookies) til
          auglýsingamarkhópagreiningar og selja aldrei gögn.
        </p>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Síðast uppfært: Janúar 2026</p>
      </div>
    </main>
  );
}
