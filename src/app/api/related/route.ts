import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { articleId } = await request.json();
    const supa = supabaseServer();

    // 1. Finna vectorinn fyrir þessa frétt
    const { data: embeddingData } = await supa
      .from('article_embeddings')
      .select('embedding')
      .eq('article_id', articleId)
      .single();

    if (!embeddingData) {
      return NextResponse.json({ articles: [] });
    }

    // 2. Leitum að svipuðum greinum með LÆGRI þröskuld (0.5)
    // Við notum sama SQL fall og í Ingest, en leyfum meiri ólíkindi hér
    const { data: relatedMatches } = await supa.rpc('match_articles_for_topic', {
      query_embedding: embeddingData.embedding,
      match_threshold: 0.5, // 0.5 er fínt fyrir "Tengt efni"
      match_count: 6 // Sækjum 6 til að eiga inni ef við þurfum að sía
    });

    if (!relatedMatches || relatedMatches.length === 0) {
        return NextResponse.json({ articles: [] });
    }

    // 3. Sækjum nánari upplýsingar (Titil, URL, Miðil) fyrir þessa matches
    const relatedIds = relatedMatches.map((r: any) => r.id);

    const { data: fullArticles } = await supa
        .from('articles')
        .select('id, title, url, sources(name)')
        .in('id', relatedIds)
        .neq('id', articleId) // Pössum að sýna ekki fréttina sjálfa
        .limit(5);

    return NextResponse.json({ articles: fullArticles || [] });

  } catch (error: any) {
    console.error("Related API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
