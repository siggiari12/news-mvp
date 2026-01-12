import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';
import * as cheerio from 'cheerio'; // <-- BREYTING: Cheerio í stað JSDOM

// Vercel stillingar
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

// --- UPPFÆRT: Mynda-hreinsun sem skemmir ekki Vísi (Þín útgáfa) ---
function cleanImageUrl(url: string | null): string | null {
  if (!url) return null;
  
  // MBL: Reynum að fá stærri mynd
  if (url.includes('mbl.is')) return url.replace('/frimg/th/', '/frimg/').replace('/crop/', '/');
  
  // VÍSIR: Hér var villan áður. Við viljum halda 'w=' en breyta í 1200.
  if (url.includes('visir.is')) {
      if (url.includes('w=')) return url.replace(/w=\d+/, 'w=1200');
      return url;
  }

  if (url.includes('bbci.co.uk')) return url.replace(/\/news\/\d+\//, '/news/976/'); 
  if (url.includes('theguardian.com') && url.includes('width=')) return url.replace(/width=\d+/, 'width=1000').replace(/quality=\d+/, 'quality=85');
  return url;
}

// --- HARÐARI HREINSUN Á TEXTA ---
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

// --- AI SAMANTEKT MEÐ IMPORTANCE ---
async function processArticle(title: string, rawText: string, rssSnippet: string, defaultCategory: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    
    // 1. Hreinsum textann HARKALEGA áður en AI fær hann
    const cleanedInput = aggressiveClean(rawText).substring(0, 15000);

    // Breytt í 50 stafi til öryggis svo við missum ekki stuttar fréttir
    if (cleanedInput.length < 50) throw new Error("Texti of stuttur eftir hreinsun");

    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: `Þú ert ritstjóri.
          
          OUTPUT JSON:
          {
            "summary": "3-4 málsgreina samantekt. Hlutlaus og grípandi. EKKI innihalda valmyndir eða auglýsingar.",
            "category": "innlent" | "erlent" | "sport" | "folk",
            "importance": "Heiltala 1-10. (10=Heimsfrétt/Neyðarástand, 8=Stórpólitík, 5=Venjuleg frétt, 1=Köttur í tré/Léttmeti).",
            "clean_title": "Titillinn"
          }

          REGLUR:
          1. FLOKKUN: 
             - "folk": Frægt fólk, slúður, lífsstíll, mannlegar sögur (Smartland/DV efni).
             - "sport": Íþróttir.
             - "erlent": Útlönd.
             - "innlent": Allt annað íslenskt.
          2. IMPORTANCE: Vertu harður. Bara raunverulega stórar fréttir fá 8+. Slúður fær sjaldan yfir 3.
          `
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
        importance: result.importance || 0, // Nýtt
        title: result.clean_title || title 
    };

  } catch (e) {
    console.error("AI fail:", e);
    // FALLBACK: Ef allt klikkar, notum RSS snippet (ekki drasl textann)
    return { text: rssSnippet, category: defaultCategory, importance: 0, title: title };
  }
}

// --- UPPFÆRT: EFNISTAKA & MYNDALEIT (CHEERIO ÚTGÁFA) ---
async function fetchContentAndImage(url: string) {
  let ogImage: string | null = null;
  let html: string | null = null;
  let jinaImage: string | null = null;

  // 1. Reynum að sækja HTML (Scraping) með "Fake Browser" headers
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sek timeout

    const rawRes = await fetch(url, { 
        signal: controller.signal,
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Referer': 'https://www.google.com/'
        }
    });
    clearTimeout(timeoutId);

    if (rawRes.ok) {
        html = await rawRes.text();
        // NOTUM CHEERIO Í STAÐ JSDOM (Léttara og virkar á Vercel)
        const $ = cheerio.load(html);
        ogImage = $('meta[property="og:image"]').attr('content') || null;
    }
  } catch (e) { console.log("Raw HTML fail:", e); }

  // 2. Jina (Backup fyrir texta OG myndir)
  let text = null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    if (res.ok) {
        const markdown = await res.text();
        
        // --- NÝTT: Reynum að finna mynd í Markdown frá Jina ---
        const imageMatch = markdown.match(/!\[.*?\]\((.*?)\)/);
        if (imageMatch && !ogImage) {
            jinaImage = imageMatch[1]; 
        }

        text = markdown
            .replace(/!\[.*?\]\(.*?\)/g, '') // Myndir
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Linkar
            .replace(/[#*`_]/g, '') // Markdown drasl
            .trim();
    }
  } catch (error) { console.log("Jina fail..."); }

  // 3. Fallback (CHEERIO í stað Readability)
  if (html && (!text || text.length < 300)) {
      try {
          const $ = cheerio.load(html);
          // Einföld leið til að ná í texta ef Jina klikkar
          text = $('p').map((i, el) => $(el).text()).get().join('\n\n');
      } catch (e) { console.error("Cheerio parse fail:", e); }
  }
  
  // Skilum annað hvort ogImage eða jinaImage
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

// --- TOPIC LOGIC ---
async function assignTopic(supa: any, articleId: string, title: string, embedding: any | null, imageUrl: string | null, category: string) {
  let topicId = null;
  const cleanedTitle = cleanTitle(title);
  const { data: recentTopics } = await supa.from('topics').select('id, title').order('updated_at', { ascending: false }).limit(50);
  if (recentTopics) {
      for (const t of recentTopics) {
          if (cleanTitle(t.title) === cleanedTitle) { topicId = t.id; break; }
      }
  }
  if (!topicId && embedding) {
      const { data: similarArticles } = await supa.rpc('match_articles_for_topic', { query_embedding: embedding, match_threshold: 0.75, match_count: 1 });
      if (similarArticles && similarArticles.length > 0) topicId = similarArticles[0].topic_id;
  }
  if (topicId) {
    const { data: topic } = await supa.from('topics').select('article_count').eq('id', topicId).single();
    if (topic) await supa.from('topics').update({ article_count: topic.article_count + 1, updated_at: new Date().toISOString() }).eq('id', topicId);
  } else {
    const { data: newTopic } = await supa.from('topics').insert({ title: title, category: category, image_url: cleanImageUrl(imageUrl), article_count: 1 }).select().single();
    if (newTopic) topicId = newTopic.id;
  }
  if (topicId) await supa.from('articles').update({ topic_id: topicId }).eq('id', articleId);
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

        // --- SOURCE LOGIC (ÓBREYTT) ---
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
                const url = item.link || '';
                if (!url) return 0;
                const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
                if (existing) return 0;

                // 1. Reynum að finna mynd í RSS
                let imageUrl = null;
                if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
                else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
                else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

                // 2. Sækjum síðuna (Scraping + Jina)
                const scraped = await fetchContentAndImage(url);
                
                // Ef engin RSS mynd, notum scraped mynd (ogImage eða Jina mynd)
                if (!imageUrl && scraped.image) imageUrl = scraped.image;
                
                // Hreinsum URL (Vísir/MBL fix)
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
                    url: url,
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
                    await assignTopic(supa, saved.id, processed.title, embedding, imageUrl, processed.category);
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
