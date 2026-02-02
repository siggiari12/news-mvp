import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import stockManifest from '../../../../public/stock/manifest.json';

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
  'http://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.theguardian.com/world/rss',
  'http://rss.cnn.com/rss/edition_world.rss',
];

// --- HJÁLPARFÖLL (ÓBREYTT) ---
function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.origin + urlObj.pathname;
    } catch (e) {
        return url;
    }
}

function cleanImageUrl(url: string | null): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();

  if (lower.includes('mbl-logo') ||
      lower.includes('gfx/logo') ||
      lower.includes('default-image') ||
      lower.includes('placeholder')) {
      return null;
  }

  // MBL: only keep real content images (must contain /frimg/)
  if (url.includes('mbl.is')) {
      if (!url.includes('/frimg/')) return null;
      return url.replace('/frimg/th/', '/frimg/').replace('/crop/', '/');
  }
  
  if (url.includes('visir.is')) {
      if (url.includes('w=')) return url.replace(/w=\d+/, 'w=1200');
      return url;
  }

  if (url.includes('bbci.co.uk')) return url.replace(/\/news\/\d+\//, '/news/976/'); 
  if (url.includes('theguardian.com') && url.includes('width=')) return url.replace(/width=\d+/, 'width=1000').replace(/quality=\d+/, 'quality=85');
  
  return url;
}

function aggressiveClean(text: string): string {
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => {
            const l = line.toLowerCase();
            if (l.length < 5) return false; 
            if (l.includes('published time:')) return false;
            if (l.includes('markdown content:')) return false;
            if (l.includes('url source:')) return false;
            if (l.includes('hafa samband')) return false;
            if (l.includes('áskrift')) return false;
            if (l.includes('skráðu þig')) return false;
            if (l.includes('mest lesið')) return false;
            if (l.includes('loka leit')) return false;
            if (l.includes('search for:')) return false;
            if (l.includes('video ad feedback')) return false;
            if (l.includes('cookie')) return false;
            return true;
        })
        .join('\n');
}

async function processArticle(title: string, rawText: string, rssSnippet: string, defaultCategory: string, url: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    
    if (!rawText || rawText.length < 50) {
        return { text: rssSnippet, category: defaultCategory, importance: 0, title: title };
    }

    const cleanedInput = aggressiveClean(rawText).substring(0, 15000);

    if (cleanedInput.length < 50) {
        return { text: rssSnippet, category: defaultCategory, importance: 0, title: title };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [
        {
          role: "system",
          content: `Þú ert ritstjóri.
          OUTPUT JSON:
          {
            "summary": "3-4 málsgreina samantekt. Hlutlaus og grípandi.",
            "category": "innlent" | "erlent" | "sport" | "folk",
            "importance": "Heiltala 1-10.",
            "clean_title": "Titillinn (lagfærður ef þarf)"
          }`
        },
        {
          role: "user",
          content: `Titill: ${title}\n\nTexti:\n${cleanedInput}`
        }
      ],
      temperature: 0.3, 
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
        text: result.summary || rssSnippet, 
        category: result.category || defaultCategory, 
        importance: result.importance || 0,
        title: result.clean_title || title 
    };

  } catch (e) {
    console.error(`AI fail fyrir ${url}:`, e);
    return { text: rssSnippet, category: defaultCategory, importance: 0, title: title };
  }
}

async function fetchContentAndImage(url: string) {
  let ogImage: string | null = null;
  let html: string | null = null;
  let jinaImage: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); 
    const rawRes = await fetch(url, { 
        signal: controller.signal,
        headers: { 
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
    });
    clearTimeout(timeoutId);

    if (rawRes.ok) {
        html = await rawRes.text();
        const $ = cheerio.load(html);
        ogImage = $('meta[property="og:image"]').attr('content') || 
                  $('meta[name="twitter:image"]').attr('content') || null;
    }
  } catch (e) { }

  let text: string | null = null;

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'X-No-Cache': 'true' } 
    });
    if (res.ok) {
        const markdown = await res.text();
        if (markdown.length > 200 && !markdown.includes("403 Forbidden")) {
            const imageMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
            if (imageMatch && !ogImage) { jinaImage = imageMatch[1]; }
            text = markdown.replace(/!\[.*?\]\(.*?\)/g, '')
                           .replace(/\[(.*?)\]\(.*?\)/g, '$1')
                           .replace(/[#*`_]/g, '')
                           .trim();
        }
    }
  } catch (error) { }

  if (html && (!text || text.length < 300)) {
      try {
          const $ = cheerio.load(html);
          $('script, style, nav, footer, header, form, iframe, .advertisement, .related-items').remove();
          const selectors = ['article', '.article-body', '.story-body', '.main-content', '#main-content', '.frett-texti'];
          let foundText = '';
          for (const selector of selectors) {
              if ($(selector).length > 0) {
                  foundText = $(selector).find('p, h2, h3').map((i, el) => $(el).text().trim()).get().join('\n\n');
                  if (foundText.length > 200) break;
              }
          }
          if (foundText.length < 200) {
              foundText = $('p').map((i, el) => {
                  const t = $(el).text().trim();
                  return t.length > 20 ? t : null;
              }).get().join('\n\n');
          }
          text = foundText;
      } catch (e) { }
  }
  
  return { text: text, image: ogImage || jinaImage };
}


async function generateEmbedding(text: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, ' ').substring(0, 8000),
    });
    return response.data[0].embedding;
  } catch (e) { return null; }
}

// --- EXPLAINER GENERATION WITH GUARDRAILS ---
const EXPLAINER_MIN_TEXT_LENGTH = 500;  // Only generate for substantial articles
const EXPLAINER_MAX_PER_RUN = 10;       // Cost control: max articles per ingest run
let explainersGeneratedThisRun = 0;

// --- STOCK IMAGE MATCHING ---
const ICELANDIC_FEEDS = ['mbl.is', 'ruv.is', 'visir.is', 'dv.is'];
const STOCK_IMAGE_MATCH_THRESHOLD = 0.3;

function isIcelandicSource(feedUrl: string): boolean {
  return ICELANDIC_FEEDS.some(domain => feedUrl.includes(domain));
}

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

  // Skip if manifest has no embeddings yet
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

interface Explainer {
  term: string;
  explanation: string;
  term_type: 'person' | 'organization' | 'place' | 'term' | 'entity';
}

async function generateExplainers(title: string, text: string, language: string): Promise<Explainer[]> {
  // Feature flag check
  if (process.env.ENABLE_EXPLAINERS !== 'true') {
    return [];
  }

  // Rate/cost control
  if (explainersGeneratedThisRun >= EXPLAINER_MAX_PER_RUN) {
    return [];
  }

  // Text length check
  if (!text || text.length < EXPLAINER_MIN_TEXT_LENGTH) {
    return [];
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const inputText = `${title}\n\n${text}`.substring(0, 4000);

    const systemPrompt = language === 'is'
      ? `Þú ert fréttaritstjóri. Finndu 2-5 mikilvæg hugtök, persónur, samtök eða staði í fréttinni sem lesandi gæti þurft útskýringu á.

Reglur:
- Einbeita þér að: Íslenskum stjórnmálamönnum, stofnunum, tæknilegum hugtökum, erlendum nöfnum/stöðum
- Útskýringar eiga að vera 1-2 setningar, hnitmiðaðar og upplýsandi
- Ekki útskýra algeng orð sem flestir þekkja

OUTPUT JSON:
{
  "explainers": [
    {"term": "Orðið/Nafnið", "explanation": "Stutt útskýring", "term_type": "person|organization|place|term|entity"}
  ]
}`
      : `You are a news editor. Find 2-5 important terms, people, organizations, or places in this article that readers might need explained.

Rules:
- Focus on: Politicians, organizations, technical terms, foreign names/places
- Explanations should be 1-2 sentences, concise and informative
- Don't explain common words that most people know

OUTPUT JSON:
{
  "explainers": [
    {"term": "The word/name", "explanation": "Brief explanation", "term_type": "person|organization|place|term|entity"}
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: inputText }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    explainersGeneratedThisRun++;

    const result = JSON.parse(response.choices[0].message.content || '{}');
    const explainers = result.explainers || [];

    return explainers
      .filter((e: any) => e.term && e.explanation && e.term.length > 1 && e.explanation.length > 5)
      .slice(0, 5)
      .map((e: any) => ({
        term: e.term.substring(0, 100),
        explanation: e.explanation.substring(0, 500),
        term_type: ['person', 'organization', 'place', 'term', 'entity'].includes(e.term_type)
          ? e.term_type
          : 'entity'
      }));

  } catch (e) {
    console.error('Explainer generation failed:', e);
    return [];
  }
}

// --- MAIN GET (Optimized: Parallel Prep -> Serial Save) ---
export async function GET(request: Request) {
  // --- SECURITY: Fail-closed - require INGEST_SECRET ---
  const ingestSecret = process.env.INGEST_SECRET;
  if (!ingestSecret) {
    console.error('INGEST_SECRET env var not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const providedSecret = request.headers.get('X-INGEST-SECRET');
  if (providedSecret !== ingestSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reset per-run counters
  explainersGeneratedThisRun = 0;

  // --- Query params for testing ---
  const url = new URL(request.url);
  const sourceFilter = url.searchParams.get('source'); // e.g., "mbl"
  const maxTotalArticles = parseInt(url.searchParams.get('maxTotalArticles') || '0', 10) || 0;

  // Filter feeds if source param provided
  let feedsToProcess = RSS_FEEDS;
  if (sourceFilter) {
    feedsToProcess = RSS_FEEDS.filter(f => f.toLowerCase().includes(sourceFilter.toLowerCase()));
    if (feedsToProcess.length === 0) {
      return NextResponse.json({ error: `No feed matches source: ${sourceFilter}` }, { status: 400 });
    }
  }

  const supa = supabaseServer();
  const parser = new Parser({ customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail'], ['enclosure', 'enclosure']] }});
  const startTime = Date.now();
  let totalSaved = 0;

  try {
    // --- 1. COLLECT PHASE (Parallel Feeds) ---
    // Sækjum alla RSS lista í einu
    const feedPromises = feedsToProcess.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        let sourceName = feed.title || 'Fréttir';
        let defaultCategory = 'innlent'; 
        
        if (feedUrl.includes('mbl')) sourceName = 'MBL';
        if (feedUrl.includes('visir')) sourceName = 'Vísir';
        if (feedUrl.includes('dv')) sourceName = 'DV';
        if (feedUrl.includes('ruv')) sourceName = 'RÚV';
        if (feedUrl.includes('bbc')) { sourceName = 'BBC'; defaultCategory = 'erlent'; }
        if (feedUrl.includes('cnn')) { sourceName = 'CNN'; defaultCategory = 'erlent'; }
        if (feedUrl.includes('guardian')) { sourceName = 'The Guardian'; defaultCategory = 'erlent'; }

        // Source Logic
        let { data: source } = await supa.from('sources').select('id').eq('rss_url', feedUrl).maybeSingle();
        if (!source) {
            const { data: existingByName } = await supa.from('sources').select('id').eq('name', sourceName).maybeSingle();
            if (existingByName) {
                await supa.from('sources').update({ rss_url: feedUrl }).eq('id', existingByName.id);
                source = existingByName;
            } else {
                const { data: newSource } = await supa.from('sources').insert({ name: sourceName, rss_url: feedUrl }).select().single();
                source = newSource;
            }
        }

        if (source) {
            // Skilum items með source upplýsingum
            return (feed.items?.slice(0, 8) || []).map(item => ({
                item,
                sourceObj: source,
                defaultCategory,
                feedUrl  // Include feedUrl for Icelandic source detection
            }));
        }
        return [];
      } catch (e) { 
          console.error(`Villa í feed ${feedUrl}:`, e); 
          return [];
      }
    });

    const feedResults = await Promise.all(feedPromises);
    const allItems = feedResults.flat();

    // --- 2. FILTER PHASE (Batch DB Check) ---
    // Finnum hvaða URLs eru þegar til í DB til að sleppa við AI vinnslu á þeim
    const urlsToCheck = allItems.map(i => normalizeUrl(i.item.link || ''));
    // Hentum tómum URLs
    const validUrls = urlsToCheck.filter(u => u.length > 5);
    
    // Sækjum existing URLs í einu kalli
    const { data: existingArticles } = await supa.from('articles').select('url').in('url', validUrls);
    const existingUrlSet = new Set(existingArticles?.map(a => a.url) || []);

    let newItems = allItems.filter(i => {
        const u = normalizeUrl(i.item.link || '');
        return u.length > 5 && !existingUrlSet.has(u);
    });

    // Apply maxTotalArticles limit if specified
    if (maxTotalArticles > 0 && newItems.length > maxTotalArticles) {
      newItems = newItems.slice(0, maxTotalArticles);
    }

    console.log(`Fann ${allItems.length} samtals, ${newItems.length} eru nýjar. Vinn samsíða...`);

    // --- 3. PREP PHASE (Parallel Processing) ---
    // Hér gerist töfrarnir. GPT og Scraping keyrir samsíða fyrir allar nýjar fréttir.
    const processedResults = await Promise.all(newItems.map(async (data) => {
        try {
            const { item, sourceObj, defaultCategory, feedUrl } = data;
            const url = normalizeUrl(item.link || '');

            // Image and content handling - same for all sources
            let imageUrl: string | null = null;
            let scrapedText: string | null = null;

            if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
            else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
            else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

            const scraped = await fetchContentAndImage(url);
            scrapedText = scraped.text;
            if (!imageUrl && scraped.image) imageUrl = scraped.image;
            imageUrl = cleanImageUrl(imageUrl);

            // GPT Summary
            const processed = await processArticle(
                item.title || '',
                scrapedText || item.contentSnippet || '',
                item.contentSnippet || '',
                defaultCategory,
                url
            );

            // GPT Embedding
            const embeddingText = (processed.title || '') + " " + (scrapedText || "").substring(0, 2000);
            const embedding = await generateEmbedding(embeddingText);

            return {
                success: true,
                url,
                item,
                sourceObj,
                imageUrl,
                processed,
                embedding,
                isoDate: item.isoDate,
                feedUrl
            };
        } catch (e) {
            return { success: false };
        }
    }));

    // --- 4. SORT PHASE (Time Logic) ---
    // Hentum feilum og röðum eftir tíma (ELSTA FYRST)
    const validResults = processedResults.filter((r: any) => r.success && r.embedding) as any[];
    
    validResults.sort((a, b) => {
        const dateA = a.isoDate ? new Date(a.isoDate).getTime() : 0;
        const dateB = b.isoDate ? new Date(b.isoDate).getTime() : 0;
        return dateA - dateB; // Minna (eldra) fer fremst
    });

    // --- 5. SAVE PHASE (Serial Execution) ---
    // Nú lykkjum við hratt í gegn til að vista og tengja topics
    for (const res of validResults) {
        const { item, sourceObj, url, imageUrl, processed, embedding } = res;

        // Tvítekningavörn á titli (Sami miðill) - Öryggisnet
        const { data: duplicateContent } = await supa.from('articles')
            .select('id')
            .eq('source_id', sourceObj.id)
            .ilike('title', processed.title || '') 
            .gt('published_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()) 
            .maybeSingle();
        
        if (duplicateContent) continue;

        // Matching
        const { data: matches } = await supa.rpc('match_articles_for_topic', {
            query_embedding: embedding,
            match_threshold: 0.75,
            match_count: 8
        });

        let matchDetails: any[] = [];
        if (matches && matches.length > 0) {
            const matchIds = matches.map((m: any) => m.id);
            const { data: fetchedDetails } = await supa.from('articles')
                .select('id, source_id, topic_id, image_url, title, category')
                .in('id', matchIds);
            matchDetails = fetchedDetails || [];
        }

        // Semantic Duplicate Check
        const exactDuplicate = matchDetails.find((d: any) => {
                const matchScore = matches.find((m:any) => m.id === d.id)?.similarity || 0;
                return d.source_id === sourceObj.id && matchScore > 0.94;
        });

        if (exactDuplicate) {
            await supa.from('articles').update({
                title: processed.title,
                published_at: new Date().toISOString(),
                image_url: imageUrl || exactDuplicate.image_url,
                full_text: processed.text
            }).eq('id', exactDuplicate.id);
            continue; 
        }

        // Vista
        const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');
        
        const articleData = {
            source_id: sourceObj.id,
            title: processed.title, 
            excerpt: (item.contentSnippet || processed.text.substring(0, 300) || '').substring(0, 300),
            full_text: processed.text, 
            url: url, 
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: processed.category === 'erlent' ? 'en' : 'is',
            image_url: imageUrl,
            hash: hash,
            category: processed.category,
            importance: processed.importance 
        };

        const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
        
        if (!error && saved) {
            await supa.from('article_embeddings').upsert({ article_id: saved.id, embedding });
            totalSaved++;

            // --- STOCK IMAGE MATCHING (for Icelandic sources without images) ---
            if (!saved.image_url && isIcelandicSource(res.feedUrl) && embedding) {
                // Get recently used stock image IDs to avoid repeats
                const { data: recentStockArticles } = await supa
                    .from('articles')
                    .select('image_url')
                    .like('image_url', '/stock/%')
                    .order('published_at', { ascending: false })
                    .limit(10);

                const recentlyUsedIds = new Set<string>();
                for (const a of recentStockArticles || []) {
                    const filename = a.image_url?.replace('/stock/', '').replace(/\.[^.]+$/, '');
                    if (filename) recentlyUsedIds.add(filename);
                }

                const stockImagePath = matchStockImage(embedding, recentlyUsedIds);
                await supa.from('articles').update({ image_url: stockImagePath }).eq('id', saved.id);
                saved.image_url = stockImagePath;
            }

            // --- EXPLAINER GENERATION (Idempotent) ---
            const { count: existingExplainerCount } = await supa
              .from('explainers')
              .select('*', { count: 'exact', head: true })
              .eq('article_id', saved.id);

            if (!existingExplainerCount || existingExplainerCount === 0) {
              const language = processed.category === 'erlent' ? 'en' : 'is';
              const explainers = await generateExplainers(saved.title, processed.text, language);
              if (explainers.length > 0) {
                const rows = explainers.map(e => ({ article_id: saved.id, ...e }));
                await supa.from('explainers').upsert(rows, { onConflict: 'article_id,term' });
              }
            }

            // TOPIC LOGIC (Serial - First come first served)
            const topicCandidates = matchDetails.filter((d: any) => {
                const matchScore = matches.find((m:any) => m.id === d.id)?.similarity || 0;
                return d.id !== saved.id && matchScore > 0.76; 
            });

            let targetTopicId = null;

            if (topicCandidates.length > 0) {
                let bestMatch = topicCandidates.find((c: any) => c.topic_id && c.source_id !== sourceObj.id);
                if (!bestMatch) bestMatch = topicCandidates.find((c: any) => c.source_id !== sourceObj.id);
                if (!bestMatch) bestMatch = topicCandidates[0];

                if (bestMatch) {
                    targetTopicId = bestMatch.topic_id;
                    if (!targetTopicId) {
                        const { data: newTopic } = await supa.from('topics').insert({
                            title: bestMatch.title, // Use OLDER article title
                            category: bestMatch.category,
                            image_url: bestMatch.image_url,
                            article_count: 1,
                            updated_at: new Date().toISOString()
                        }).select().single();
                        
                        if (newTopic) {
                            targetTopicId = newTopic.id;
                            await supa.from('articles').update({ topic_id: targetTopicId }).eq('id', bestMatch.id);
                        }
                    }
                }
            }

            if (targetTopicId) {
                // Merge into existing topic
                await supa.from('articles').update({ topic_id: targetTopicId }).eq('id', saved.id);
                const { count } = await supa.from('articles').select('*', { count: 'exact', head: true }).eq('topic_id', targetTopicId);
                await supa.from('topics').update({ article_count: count, updated_at: new Date().toISOString() }).eq('id', targetTopicId);
            } else {
                // Create FRESH topic
                const { data: newTopic } = await supa.from('topics').insert({
                    title: saved.title,
                    category: saved.category,
                    image_url: saved.image_url,
                    article_count: 1,
                    updated_at: new Date().toISOString()
                }).select().single();

                if (newTopic) {
                    await supa.from('articles').update({ topic_id: newTopic.id }).eq('id', saved.id);
                }
            }
        }
    }
    
    const duration = (Date.now() - startTime) / 1000;
    return NextResponse.json({ success: true, count: totalSaved, time: `${duration}s` });

  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
