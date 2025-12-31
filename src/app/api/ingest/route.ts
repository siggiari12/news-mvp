import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
];

async function fetchContentAndImage(url: string) {
  try {
    // Þykjumst vera nýjasti Chrome vafri til að komast framhjá vörnum
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'is-IS,is;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1'
      }
    });
    
    // Ef MBL bannar okkur (t.d. 403 Forbidden), þá sjáum við það hér
    if (!res.ok) {
        console.log(`⚠️ BLOKKAÐ: ${url} skilaði status ${res.status}`);
        return { text: null, image: null };
    }
    
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    
    const reader = new Readability(doc);
    const article = reader.parse();
    const text = article ? article.textContent : null;

    let image = null;

    // 1. Open Graph
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage) image = ogImage.getAttribute('content');

    // 2. JSON-LD
    if (!image) {
      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (let i = 0; i < scripts.length; i++) {
        try {
          const data = JSON.parse(scripts[i].textContent || '{}');
          if (data.image && data.image.url) { image = data.image.url; break; }
        } catch (e) {}
      }
    }

    // 3. NUCLEAR MBL SEARCH (Með JSON/Escaped slash stuðningi)
    if (!image && url.includes('mbl.is')) {
        console.log("   > MBL Deep Scan...");
        // Leitum að: c.arvakur.is ... frimg ... .jpg
        const matches = html.match(/https?:\\?\/\\?\/[^"'\s]*arvakur[^"'\s]*frimg[^"'\s]*\.jpg/gi);
        
        if (matches && matches.length > 0) {
            image = matches[0].replace(/\\/g, '');
            console.log("   > Fann MBL mynd (Nuclear):", image);
        }
    }

    // 4. Fallback
    if (!image) {
      const allImgs = doc.querySelectorAll('img');
      for (let img of allImgs) {
        const src = img.getAttribute('src');
        if (src && src.match(/\.(jpg|jpeg|png|webp)/i) && !src.includes('logo') && !src.includes('icon')) {
           image = src; break;
        }
      }
    }

    // --- LAGA SLÓÐIR ---
    if (image) {
      image = image.trim();
      if (image.startsWith('//')) image = 'https:' + image;
      else if (image.startsWith('/')) {
        const u = new URL(url);
        image = `${u.protocol}//${u.host}${image}`;
      }
    }
    
    return { text, image };
  } catch (error) {
    console.error(`Gat ekki scrapað ${url}:`, error);
    return { text: null, image: null };
  }
}

async function generateEmbedding(text: string) {
  try {
    const cleanText = text.replace(/\n/g, ' ').substring(0, 8000);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: cleanText,
    });
    return response.data[0].embedding;
  } catch (e) { return null; }
}

export async function GET() {
  const supa = supabaseServer();
  const parser = new Parser({
    customFields: { item: [['media:content', 'media'], ['content:encoded', 'contentEncoded']] },
  });

  let totalSaved = 0;

  try {
    for (const feedUrl of RSS_FEEDS) {
      console.log(`Vinn með: ${feedUrl}`);
      let feed;
      try { feed = await parser.parseURL(feedUrl); } catch (e) { continue; }

      let sourceName = feed.title || feedUrl;
      if (sourceName === 'Allar fréttir') sourceName = 'Vísir';
      if (sourceName.includes('mbl.is')) sourceName = 'MBL';

      let { data: source } = await supa.from('sources').select('id').eq('rss_url', feedUrl).maybeSingle();

      if (!source) {
        const { data: inserted } = await supa.from('sources').insert({ name: sourceName, rss_url: feedUrl }).select().single();
        source = inserted;
      }

      if (source) {
        const itemsToProcess = feed.items?.slice(0, 5) || [];

        for (const item of itemsToProcess) {
          const url = item.link || '';
          if (!url) continue;
          
          const title = (item.title || '').trim();
          const { data: existing } = await supa.from('articles').select('id, image_url').eq('url', url).maybeSingle();
          
          if (existing && existing.image_url) continue;

          console.log(`   > Vinn: ${title.substring(0, 20)}...`);

          let imageUrl = null;
          if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
          else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

          let fullText = null;
          const scraped = await fetchContentAndImage(url);
          fullText = scraped.text;
          
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

          const hash = crypto.createHash('md5').update((title + url).toLowerCase()).digest('hex');

          const articleData = {
            source_id: source.id,
            title: title,
            excerpt: (item.contentSnippet || item.content || '').trim().substring(0, 300),
            full_text: fullText,
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is',
            image_url: imageUrl,
            hash: hash
          };

          const { data: savedArticle, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
          
          if (!error && savedArticle) {
            totalSaved++;
            const textForVector = title + " " + (fullText || "").substring(0, 500);
            const embedding = await generateEmbedding(textForVector);
            if (embedding) {
               await supa.from('article_embeddings').upsert({ article_id: savedArticle.id, embedding: embedding });
            }
          }
        }
      }
    }
    
    return NextResponse.json({ success: true, message: `Vann úr ${totalSaved} fréttum.` });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
