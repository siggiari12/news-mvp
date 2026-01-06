import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
        return NextResponse.json({ articles: [] });
    }

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

    // 2. Leitum að svipuðum greinum (Vector Search)
    // 0.5 er góður þröskuldur fyrir "Tengt efni" (ekki of strangt, ekki of vítt)
    const { data: relatedMatches, error: rpcError } = await supa.rpc('match_articles_for_topic', {
      query_embedding: embeddingData.embedding,
      match_threshold: 0.6, 
      match_count: 10
    });

    if (rpcError || !relatedMatches || relatedMatches.length === 0) {
        return NextResponse.json({ articles: [] });
    }

    // 3. Sækjum nánari upplýsingar
    const relatedIds = relatedMatches.map((r: any) => r.id);

    const { data: fullArticles } = await supa
        .from('articles')
        .select('id, title, url, image_url, published_at, sources(name)')
        .in('id', relatedIds)
        .neq('id', articleId) // Pössum að sýna ekki fréttina sjálfa
        .order('published_at', { ascending: false }) // Röðum eftir nýjustu
        .limit(5);

    return NextResponse.json({ articles: fullArticles || [] });

  } catch (error: any) {
    console.error("Related API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
