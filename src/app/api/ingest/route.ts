import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';

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

// --- HJÁLPARFÖLL ---
function cleanTitle(text: string) {
  return text.toLowerCase().replace(/\|.*$/, '').replace(/-.*$/, '').replace(/[^\w\sáðéíóúýþæö]/g, '').replace(/\s{2,}/g, " ").trim();
}

// --- NÝTT: Hreinsar URL svo við fáum ekki duplicates út af query params ---
function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        // Fjarlægum allt eftir ? (query params)
        return urlObj.origin + urlObj.pathname;
    } catch (e) {
        return url;
    }
}

function cleanImageUrl(url: string | null): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();

  if (lower.includes('mbl-logo') || 
      lower.includes('frontend/gfx/logo') || 
      lower.includes('default-image') ||
      lower.includes('placeholder')) {
      return null; 
  }
  
  if (url.includes('mbl.is')) {
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
            if (l.length < 20) return false; 
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

async function processArticle(title: string, rawText: string, rssSnippet: string, defaultCategory: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const cleanedInput = aggressiveClean(rawText).substring(0, 15000);

    if (cleanedInput.length < 50) throw new Error("Texti of stuttur eftir hreinsun");

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
            "clean_title": "Titillinn"
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
    console.error("AI fail:", e);
    return { text: rssSnippet, category: defaultCategory, importance: 0, title: title };
  }
}

async function fetchContentAndImage(url: string) {
  let ogImage: string | null = null;
  let html: string | null = null;
  let jinaImage: string | null = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const rawRes = await fetch(url, { 
        signal: controller.signal,
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
    });
    clearTimeout(timeoutId);

    if (rawRes.ok) {
        html = await rawRes.text();
        const $ = cheerio.load(html);
        ogImage = $('meta[property="og:image"]').attr('content') || null;
    }
  } catch (e) { console.log("Raw HTML fail:", e); }

  let text = null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    if (res.ok) {
        const markdown = await res.text();
        const imageMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
        if (imageMatch && !ogImage) { jinaImage = imageMatch[1]; }
        text = markdown.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[#*`_]/g, '').trim();
    }
  } catch (error) { console.log("Jina fail..."); }

  if (html && (!text || text.length < 300)) {
      try {
          const $ = cheerio.load(html);
          text = $('p').map((i, el) => $(el).text()).get().join('\n\n');
      } catch (e) { console.error("Cheerio parse fail:", e); }
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

// --- ALGJÖRLEGA ENDURSKRIFAÐ: TOPIC LOGIC ---
// Þetta leysir "2 miðlar" vandamálið með því að tengja fréttir saman
async function assignTopic(supa: any, articleId: string, title: string, embedding: any | null, imageUrl: string | null, category: string, sourceId: string) {
    if (!embedding) return;

    // 1. Finnum LÍKAR fréttir (ekki endilega topic strax)
    // match_threshold: 0.82 er passlegt (0.75 var of lágt, 0.9 of hátt)
    const { data: similarArticles } = await supa.rpc('match_articles_for_topic', { 
        query_embedding: embedding, 
        match_threshold: 0.82, 
        match_count: 5 
    });

    let targetTopicId = null;

    if (similarArticles && similarArticles.length > 0) {
        // Skoðum bestu samsvörunina sem er EKKI frá sama miðli (helst)
        // En ef hún er frá sama miðli og mjög lík, þá er þetta kannski uppfærsla
        const bestMatch = similarArticles[0];

        // Ef besta samsvörun hefur nú þegar topic ID, þá hoppum við á vagninn
        if (bestMatch.topic_id) {
            targetTopicId = bestMatch.topic_id;
        } else {
            // "2 MIÐLAR" GALDURINN:
            // Besta samsvörun er "einhleyp" frétt. Við búum til nýtt Topic fyrir þær báðar!
            console.log(`Creating new group from article ${articleId} and ${bestMatch.id}`);
            
            const { data: newTopic, error } = await supa.from('topics')
                .insert({ 
                    title: title, // Notum titil nýju fréttarinnar sem topic titil (í bili)
                    category: category, 
                    image_url: cleanImageUrl(imageUrl) || cleanImageUrl(bestMatch.image_url), 
                    article_count: 2,
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (newTopic && !error) {
                targetTopicId = newTopic.id;
                // Uppfærum GÖMLU fréttina svo hún tilheyri nýja hópnum
                await supa.from('articles').update({ topic_id: targetTopicId }).eq('id', bestMatch.id);
            }
        }
    }

    // Ef við fundum topic (annað hvort tilbúið eða nýbúið), tengjum nýju fréttina
    if (targetTopicId) {
        await supa.from('articles').update({ topic_id: targetTopicId }).eq('id', articleId);
        
        // Uppfærum teljarann á topicinu (mikilvægt fyrir "Eldur" merkið)
        // Við endurreiknum fjöldann til að vera nákvæm
        const { count } = await supa.from('articles').select('*', { count: 'exact', head: true }).eq('topic_id', targetTopicId);
        await supa.from('topics').update({ 
            article_count: count, 
            updated_at: new Date().toISOString() 
        }).eq('id', targetTopicId);
    } 
    // Ef engin topic fannst (fréttin er einstök), þá gerum við ekki neitt. 
    // Hún er bara sýnd sem stök frétt þangað til önnur kemur sem passar við hana.
}

// --- MAIN GET ---
export async function GET() {
  const supa = supabaseServer();
  const parser = new Parser({ customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail'], ['enclosure', 'enclosure']] }});
  const startTime = Date.now();
  let totalSaved = 0;

  try {
    const feedPromises = RSS_FEEDS.map(async (feedUrl) => {
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
            const items = feed.items?.slice(0, 10) || [];
            const itemPromises = items.map(async (item) => {
                const rawUrl = item.link || '';
                if (!rawUrl) return 0;
                
                // --- BREYTING 1: URL Normalization ---
                const url = normalizeUrl(rawUrl);

                // --- BREYTING 2: Tvítekningavörn (Sama URL) ---
                const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
                if (existing) return 0;

                // --- BREYTING 3: Tvítekningavörn (Sama efni frá sama source) ---
                // Stundum breytist URLið örlítið en titillinn er sá sami. 
                // Ef við erum nýbúin að vista frétt með sama titil frá sama miðli, sleppum henni.
                const { data: duplicateContent } = await supa.from('articles')
                    .select('id')
                    .eq('source_id', source.id)
                    .ilike('title', item.title || '') // Case-insensitive match
                    .gt('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Síðustu 24 tíma
                    .maybeSingle();
                
                if (duplicateContent) {
                    console.log(`Skipping duplicate content from same source: ${item.title}`);
                    return 0;
                }

                // Myndavinnsla
                let imageUrl = null;
                if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
                else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
                else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

                const scraped = await fetchContentAndImage(url);
                if (!imageUrl && scraped.image) imageUrl = scraped.image;
                imageUrl = cleanImageUrl(imageUrl);

                const processed = await processArticle(
                    item.title || '', 
                    scraped.text || item.contentSnippet || '', 
                    item.contentSnippet || '', 
                    defaultCategory
                );

                const embeddingText = (processed.title || '') + " " + (scraped.text || "").substring(0, 2000);
                const embedding = await generateEmbedding(embeddingText);

                const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');
                
                const articleData = {
                    source_id: source.id,
                    title: processed.title, 
                    excerpt: (item.contentSnippet || '').substring(0, 300),
                    full_text: processed.text, 
                    url: url, // Vistum hreinsað URL
                    published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
                    language: defaultCategory === 'erlent' ? 'en' : 'is',
                    image_url: imageUrl,
                    hash: hash,
                    category: processed.category,
                    importance: processed.importance 
                };

                const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
                
                if (!error && saved && embedding) {
                    await supa.from('article_embeddings').upsert({ article_id: saved.id, embedding });
                    // Sendum source.id með í assignTopic
                    await assignTopic(supa, saved.id, processed.title, embedding, imageUrl, processed.category, source.id);
                    return 1;
                }
                return 0;
            });
            const results = await Promise.all(itemPromises);
            return results.reduce((a: number, b) => (a || 0) + (b || 0), 0);
        }
        return 0;
      } catch (e) { console.error(`Villa í feed ${feedUrl}:`, e); return 0; }
    });
    const results = await Promise.all(feedPromises);
    totalSaved = results.reduce((a: number, b) => a + b, 0);
    const duration = (Date.now() - startTime) / 1000;
    return NextResponse.json({ success: true, count: totalSaved, time: `${duration}s` });
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
