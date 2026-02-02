import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import stockManifest from '../../../../public/stock/manifest.json';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ICELANDIC_SOURCES = ['MBL', 'RÚV', 'Vísir', 'DV'];
const STOCK_IMAGE_MATCH_THRESHOLD = 0.3;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function matchStockImage(
  articleEmbedding: number[],
  recentlyUsedImageIds: Set<string>
): string {
  const fallbackImage = stockManifest.images.find(i => i.id === stockManifest.fallbackImageId);
  const fallbackPath = `/stock/${fallbackImage?.filename || 'reykjavik-skyline-01.jpg'}`;

  const imagesWithEmbeddings = stockManifest.images.filter(img => img.embedding && img.embedding.length > 0);
  if (imagesWithEmbeddings.length === 0) return fallbackPath;

  let bestMatch = { id: '', score: 0, filename: '' };

  for (const image of imagesWithEmbeddings) {
    if (recentlyUsedImageIds.has(image.id)) continue;
    const score = cosineSimilarity(articleEmbedding, image.embedding);
    if (score > bestMatch.score) {
      bestMatch = { id: image.id, score, filename: image.filename };
    }
  }

  if (bestMatch.score < STOCK_IMAGE_MATCH_THRESHOLD || !bestMatch.filename) {
    return fallbackPath;
  }

  return `/stock/${bestMatch.filename}`;
}

function needsStockImage(imageUrl: string | null): boolean {
  if (!imageUrl) return true;
  // Old DALL-E Supabase Storage images
  if (imageUrl.includes('supabase.co/storage')) return true;
  // Already has a stock image
  if (imageUrl.startsWith('/stock/')) return false;
  // MBL logos/junk
  if (imageUrl.includes('mbl.is') && !imageUrl.includes('/frimg/')) return true;
  if (imageUrl.includes('mbl-logo') || imageUrl.includes('gfx/logo')) return true;
  if (imageUrl.includes('default-image') || imageUrl.includes('placeholder')) return true;
  return false;
}

export async function GET(request: Request) {
  // Auth check
  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const providedSecret = request.headers.get('X-INGEST-SECRET');
  if (providedSecret !== ingestSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === 'true';

  const supa = supabaseServer();

  // 1. Get Icelandic source IDs
  const { data: sources } = await supa
    .from('sources')
    .select('id, name')
    .in('name', ICELANDIC_SOURCES);

  if (!sources || sources.length === 0) {
    return NextResponse.json({ error: 'No Icelandic sources found', sources_checked: ICELANDIC_SOURCES }, { status: 404 });
  }

  const sourceIds = sources.map(s => s.id);

  // 2. Find ALL articles from Icelandic sources, then filter by bad/missing images
  const { data: allArticles } = await supa
    .from('articles')
    .select('id, title, topic_id, image_url')
    .in('source_id', sourceIds)
    .order('published_at', { ascending: false })
    .limit(500);

  const articles = (allArticles || []).filter(a => needsStockImage(a.image_url));

  if (dryRun) {
    // Diagnostic mode: show what would be updated
    const sampleImages = (allArticles || []).slice(0, 20).map(a => ({
      id: a.id,
      title: a.title?.substring(0, 60),
      image_url: a.image_url,
      needs_stock: needsStockImage(a.image_url)
    }));
    return NextResponse.json({
      sources_found: sources.map(s => s.name),
      total_icelandic_articles: allArticles?.length || 0,
      articles_needing_stock_image: articles.length,
      sample: sampleImages
    });
  }

  if (articles.length === 0) {
    return NextResponse.json({ message: 'No articles need backfill', count: 0 });
  }

  // 3. Get embeddings for these articles
  const articleIds = articles.map(a => a.id);
  const { data: embeddings } = await supa
    .from('article_embeddings')
    .select('article_id, embedding')
    .in('article_id', articleIds);

  const embeddingMap = new Map<string, number[]>();
  for (const e of embeddings || []) {
    embeddingMap.set(e.article_id, e.embedding);
  }

  // 4. Track recently used images across this backfill to avoid repeats
  const recentlyUsedIds = new Set<string>();
  let updated = 0;
  const topicUpdates = new Map<string, string>(); // topic_id -> image_url

  for (const article of articles) {
    const embedding = embeddingMap.get(article.id);
    if (!embedding) continue;

    const stockImagePath = matchStockImage(embedding, recentlyUsedIds);

    // Track the assigned image to avoid immediate repeats
    const matchedImage = stockManifest.images.find(img => `/stock/${img.filename}` === stockImagePath);
    if (matchedImage) {
      recentlyUsedIds.add(matchedImage.id);
      // Reset after using half the library to allow reuse
      if (recentlyUsedIds.size > stockManifest.images.length / 2) {
        recentlyUsedIds.clear();
      }
    }

    // Update article
    await supa.from('articles').update({ image_url: stockImagePath }).eq('id', article.id);
    updated++;

    // Track topic image update (use first article's image per topic)
    if (article.topic_id && !topicUpdates.has(article.topic_id)) {
      topicUpdates.set(article.topic_id, stockImagePath);
    }
  }

  // 5. Update topics linked to backfilled articles
  let topicsUpdated = 0;
  for (const [topicId, imageUrl] of topicUpdates) {
    const { data: topic } = await supa
      .from('topics')
      .select('image_url')
      .eq('id', topicId)
      .maybeSingle();

    if (topic && needsStockImage(topic.image_url)) {
      await supa.from('topics').update({ image_url: imageUrl }).eq('id', topicId);
      topicsUpdated++;
    }
  }

  // 6. Scan ALL topics for bad images (covers topics not linked to backfilled articles)
  const { data: allTopics } = await supa
    .from('topics')
    .select('id, title, image_url')
    .order('updated_at', { ascending: false })
    .limit(500);

  let topicsFixedDirectly = 0;
  for (const topic of allTopics || []) {
    if (!needsStockImage(topic.image_url)) continue;
    if (topicUpdates.has(topic.id)) continue; // Already handled above

    // Find the best article with a good image for this topic
    const { data: topicArticle } = await supa
      .from('articles')
      .select('id, image_url')
      .eq('topic_id', topic.id)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (topicArticle && !needsStockImage(topicArticle.image_url)) {
      // Use a good article image
      await supa.from('topics').update({ image_url: topicArticle.image_url }).eq('id', topic.id);
      topicsFixedDirectly++;
    } else {
      // No good article image found - get embedding from any article in this topic
      const { data: anyArticle } = await supa
        .from('articles')
        .select('id')
        .eq('topic_id', topic.id)
        .limit(1)
        .maybeSingle();

      if (anyArticle) {
        const { data: emb } = await supa
          .from('article_embeddings')
          .select('embedding')
          .eq('article_id', anyArticle.id)
          .maybeSingle();

        if (emb?.embedding) {
          const stockPath = matchStockImage(emb.embedding, recentlyUsedIds);
          await supa.from('topics').update({ image_url: stockPath }).eq('id', topic.id);
          topicsFixedDirectly++;
        }
      }
    }
  }

  return NextResponse.json({
    message: 'Backfill complete',
    articles_updated: updated,
    topics_updated: topicsUpdated,
    topics_fixed_directly: topicsFixedDirectly,
    total_candidates: articles.length
  });
}
