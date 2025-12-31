import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(request: Request) {
  const { articleId } = await request.json();
  const supa = supabaseServer();

  // 1. Finna vectorinn fyrir þessa frétt
  const { data: embeddingData } = await supa
    .from('article_embeddings')
    .select('embedding')
    .eq('article_id', articleId)
    .single();

  if (!embeddingData) {
    return NextResponse.json({ articles: [] }); // Enginn vector til = engar tengdar fréttir
  }

  // 2. Kalla á SQL fallið sem við bjuggum til í Skrefi 1
  const { data: related } = await supa.rpc('match_articles', {
    query_embedding: embeddingData.embedding,
    match_threshold: 0.5, // Hversu lík þarf hún að vera? (0.5 er fínt)
    match_count: 5 // Sækja 5 fréttir
  });

  // Sía út upprunalegu fréttina sjálfa
  const filtered = related?.filter((a: any) => a.id !== articleId) || [];

  return NextResponse.json({ articles: filtered });
}
