import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { articleId, source, deviceId } = body; // <-- Bættum við deviceId
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (!articleId) return NextResponse.json({ error: 'Vantar articleId' }, { status: 400 });

    const supabase = supabaseServer();

    const { error } = await supabase
      .from('clicks')
      .insert({
        article_id: articleId,
        source_name: source,
        user_agent: userAgent,
        device_id: deviceId // <-- Vistum það hér
      });

    if (error) console.error('Click error:', error);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
