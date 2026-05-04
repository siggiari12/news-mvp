import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';
import stockManifest from '../../../../public/stock/manifest.json';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const ICELANDIC_SOURCES = ['MBL', 'RÚV', 'Vísir', 'DV'];
const STOCK_IMAGE_MATCH_THRESHOLD = 0.12;
const STOCK_IMAGE_MARGIN = 0.02;

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

let fallbackCounter = 0;

function getRotatingFallback(): string {
  const ids: string[] = (stockManifest as any).fallbackImageIds || ['reykjavik-skyline-01'];
  const id = ids[fallbackCounter % ids.length];
  fallbackCounter++;
  const img = stockManifest.images.find(i => i.id === id);
  return `/stock/${img?.filename || 'alec-cooks-j94AJG771gg-unsplash.jpg'}`;
}

function matchStockImage(
  articleEmbedding: number[],
  recentlyUsedImageIds: Set<string>,
  articleTitle?: string
): string {
  const fallbackPath = getRotatingFallback();

  const imagesWithEmbeddings = stockManifest.images.filter(img => img.embedding && img.embedding.length > 0);
  if (imagesWithEmbeddings.length === 0) {
    console.log(`[stock-match] No images with embeddings in manifest`);
    return fallbackPath;
  }

  // Dimension check
  const expectedDim = imagesWithEmbeddings[0].embedding.length;
  if (articleEmbedding.length !== expectedDim) {
    console.log(`[stock-match] Dimension mismatch: article=${articleEmbedding.length} image=${expectedDim}, using fallback`);
    return fallbackPath;
  }

  // Score all images
  const scored = imagesWithEmbeddings
    .filter(img => !recentlyUsedImageIds.has(img.id))
    .map(img => ({
      id: img.id,
      score: cosineSimilarity(articleEmbedding, img.embedding),
      filename: img.filename
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    console.log(`[stock-match] All images recently used, using fallback`);
    return fallbackPath;
  }

  const best = scored[0];
  const second = scored.length > 1 ? scored[1] : { id: '-', score: 0, filename: '' };
  const third = scored.length > 2 ? scored[2] : { id: '-', score: 0, filename: '' };
  const margin = best.score - second.score;

  const logTitle = (articleTitle || '').substring(0, 50);
  console.log(
    `[stock-match] "${logTitle}" | top3: ${best.id}(${best.score.toFixed(3)}) ${second.id}(${second.score.toFixed(3)}) ${third.id}(${third.score.toFixed(3)}) | margin=${margin.toFixed(3)} threshold=${STOCK_IMAGE_MATCH_THRESHOLD}`
  );

  if (best.score < STOCK_IMAGE_MATCH_THRESHOLD) {
    console.log(`[stock-match] Below threshold (${best.score.toFixed(3)} < ${STOCK_IMAGE_MATCH_THRESHOLD}), using fallback`);
    return fallbackPath;
  }

  if (margin < STOCK_IMAGE_MARGIN) {
    console.log(`[stock-match] Margin too small (${margin.toFixed(3)} < ${STOCK_IMAGE_MARGIN}), using fallback`);
    return fallbackPath;
  }

  return `/stock/${best.filename}`;
}

function needsStockImage(imageUrl: string | null): boolean {
  if (!imageUrl) return true;
  if (imageUrl.includes('supabase.co/storage')) return true;
  if (imageUrl.startsWith('/stock/')) return false;
  if (imageUrl.includes('mbl.is') && !imageUrl.includes('/frimg/')) return true;
  if (imageUrl.includes('mbl-logo') || imageUrl.includes('gfx/logo')) return true;
  if (imageUrl.includes('default-image') || imageUrl.includes('placeholder')) return true;
  return false;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' ').substring(0, 8000),
    });
    return response.data[0].embedding;
  } catch (e) {
    console.error('[backfill] Embedding generation failed:', e);
    return null;
  }
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
  const reembed = url.searchParams.get('reembed') === 'true';

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
    .select('id, title, topic_id, image_url, full_text')
    .in('source_id', sourceIds)
    .order('published_at', { ascending: false })
    .limit(500);

  const articles = (allArticles || []).filter(a => needsStockImage(a.image_url));

  if (dryRun) {
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
      reembed,
      sample: sampleImages
    });
  }

  if (articles.length === 0) {
    return NextResponse.json({ message: 'No articles need backfill', count: 0 });
  }

  // 3. Get embeddings — either regenerate from title+summary or use stored ones
  const embeddingMap = new Map<string, number[]>();

  if (reembed) {
    // Generate fresh embeddings from title + AI summary (short, clean text)
    console.log(`[backfill] Re-embedding ${articles.length} articles from title+summary...`);
    for (const article of articles) {
      const summaryText = ((article.title || '') + ' ' + (article.full_text || '').substring(0, 500))
        .replace(/\s+/g, ' ')
        .trim();
      if (!summaryText) continue;
      const emb = await generateEmbedding(summaryText);
      if (emb) embeddingMap.set(article.id, emb);
    }
    console.log(`[backfill] Generated ${embeddingMap.size} fresh embeddings`);
  } else {
    // Use stored article embeddings
    const articleIds = articles.map(a => a.id);
    const { data: embeddings } = await supa
      .from('article_embeddings')
      .select('article_id, embedding')
      .in('article_id', articleIds);

    for (const e of embeddings || []) {
      embeddingMap.set(e.article_id, e.embedding);
    }
  }

  // 4. Track recently used images across this backfill to avoid repeats
  const recentlyUsedIds = new Set<string>();
  let updated = 0;
  const topicUpdates = new Map<string, string>();

  for (const article of articles) {
    const embedding = embeddingMap.get(article.id);
    if (!embedding) continue;

    const stockImagePath = matchStockImage(embedding, recentlyUsedIds, article.title);

    const matchedImage = stockManifest.images.find(img => `/stock/${img.filename}` === stockImagePath);
    if (matchedImage) {
      recentlyUsedIds.add(matchedImage.id);
      if (recentlyUsedIds.size > stockManifest.images.length / 2) {
        recentlyUsedIds.clear();
      }
    }

    await supa.from('articles').update({ image_url: stockImagePath }).eq('id', article.id);
    updated++;

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
    if (topicUpdates.has(topic.id)) continue;

    const { data: topicArticle } = await supa
      .from('articles')
      .select('id, image_url')
      .eq('topic_id', topic.id)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (topicArticle && !needsStockImage(topicArticle.image_url)) {
      await supa.from('topics').update({ image_url: topicArticle.image_url }).eq('id', topic.id);
      topicsFixedDirectly++;
    } else {
      const { data: anyArticle } = await supa
        .from('articles')
        .select('id, title, full_text')
        .eq('topic_id', topic.id)
        .limit(1)
        .maybeSingle();

      if (anyArticle) {
        let emb: number[] | null = null;

        if (reembed) {
          const summaryText = ((anyArticle.title || '') + ' ' + (anyArticle.full_text || '').substring(0, 500))
            .replace(/\s+/g, ' ')
            .trim();
          emb = await generateEmbedding(summaryText);
        } else {
          const { data: stored } = await supa
            .from('article_embeddings')
            .select('embedding')
            .eq('article_id', anyArticle.id)
            .maybeSingle();
          emb = stored?.embedding || null;
        }

        if (emb) {
          const stockPath = matchStockImage(emb, recentlyUsedIds, topic.title);
          await supa.from('topics').update({ image_url: stockPath }).eq('id', topic.id);
          topicsFixedDirectly++;
        }
      }
    }
  }

  return NextResponse.json({
    message: 'Backfill complete',
    reembed,
    articles_updated: updated,
    topics_updated: topicsUpdated,
    topics_fixed_directly: topicsFixedDirectly,
    total_candidates: articles.length
  });
}
