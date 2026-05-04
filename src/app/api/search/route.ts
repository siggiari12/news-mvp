import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(supabaseUrl, supabaseServiceKey);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query) return NextResponse.json({ articles: [] });

    console.log(`Leita að: "${query}"`);

    // 1. Búa til embedding fyrir leitarorðið
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 2. Leita í grunninum (Vector Search)
    // Við notum sama fall og í "Related", en kannski með lægri þröskuld
    const { data: matches, error } = await supa.rpc('match_articles_for_topic', {
      query_embedding: embedding,
      match_threshold: 0.4, // 0.4 er fínt fyrir leit (vill finna eitthvað frekar en ekkert)
      match_count: 10
    });

    if (error) throw error;

    if (!matches || matches.length === 0) {
        return NextResponse.json({ articles: [] });
    }

    const ids = matches.map((m: any) => m.id);

    // 3. Sækja gögnin (Titil, mynd o.s.frv.)
    const { data: articles } = await supa
      .from('articles')
      .select('id, title, excerpt, image_url, published_at, sources(name)')
      .in('id', ids)
      .order('published_at', { ascending: false });

    return NextResponse.json({ articles: articles || [] });

  } catch (e: any) {
    console.error("Search Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
