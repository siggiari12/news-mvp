import { NextResponse } from 'next/server';

// Vercel Cron calls this endpoint every 15 minutes (configured in vercel.json).
// It forwards the request to /api/ingest with the shared secret so ingest
// doesn't need to be called manually.
export async function GET(request: Request) {
  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured' }, { status: 500 });
  }

  // Build the ingest URL relative to the current host so this works on
  // any Vercel deployment (preview, production, localhost).
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const ingestUrl = `${protocol}://${host}/api/ingest`;

  try {
    const res = await fetch(ingestUrl, {
      method: 'GET',
      headers: { 'X-INGEST-SECRET': ingestSecret },
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, ingest: data });
  } catch (err: any) {
    console.error('Cron: ingest call failed:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
