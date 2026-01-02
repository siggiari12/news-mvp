import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
];

// --- NÝTT: Betri AI Flokkari ---
async function classifyArticle(title: string, excerpt: string) {
  // 1. Öryggisnet: Ef titill inniheldur augljós sport-orð, sleppum AI (sparar pening og er 100% rétt)
  const lowerTitle = title.toLowerCase();
  const sportWords = ['fótbolti', 'handbolti', 'körfubolti', 'liverpool', 'united', 'arsenal', 'deildin', 'mörk', 'landslið', 'valur', 'kr ', 'ka ', 'fh ', 'breiðablik', 'íþrótt', 'sport', 'leikur', 'marka'];
  
  if (sportWords.some(word => lowerTitle.includes(word))) {
    return 'sport';
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Þú ert fréttaflokkari. Flokkaðu fréttina í EINN af þessum flokkum: 'innlent', 'erlent', 'sport'.
          Reglur:
          - Ef fréttin fjallar um íþróttir (fótbolta, handbolta, lið, leiki), veldu 'sport'.
          - Ef fréttin gerist utan Íslands (USA, Evrópa, Stríð), veldu 'erlent'.
          - Annars veldu 'innlent'.
          Skilaðu BARA einu orði.`
        },
        {
          role: "user",
          content: `Titill: ${title}\nTexti: ${excerpt.substring(0, 300)}`
        }
      ],
      temperature: 0.3, // Aðeins meira frelsi
    });

    const category = response.choices[0].message.content?.trim().toLowerCase();
    
    if (category?.includes('sport') || category?.includes('íþrótt')) return 'sport';
    if (category?.includes('erlent') || category?.includes('heim')) return 'erlent';
    return 'innlent';

  } catch (e) {
    console.error("AI flokkun mistókst:", e);
    return 'innlent';
  }
}


async function fetchContentAndImage(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!res.ok) return { text: null, image: null };
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    let textContainer = $('article, .article-body, .main-content, .content, #main');
    if (textContainer.length === 0) textContainer = $('body');
    
    const text = textContainer.find('p').map((i, el) => $(el).text()).get().join('\n\n');

    let image: string | null | undefined = null;
    image = $('meta[property="og:image"]').attr('content');

    if (!image) {
      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const data = JSON.parse($(el).html() || '{}');
          if (data.image && data.image.url) image = data.image.url;
        } catch (e) {}
      });
    }

    if (!image && url.includes('mbl.is')) {
        const matches = html.match(/https?:\\?\/\\?\/[^"'\s]*arvakur[^"'\s]*frimg[^"'\s]*\.jpg/gi);
        if (matches && matches.length > 0) {
            image = matches[0].replace(/\\/g, '');
        }
    }

    if (!image) {
      $('img').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.match(/\.(jpg|jpeg|png|webp)/i) && !src.includes('logo') && !src.includes('icon')) {
           if (!image) image = src;
        }
      });
    }

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
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
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
        // Tökum aðeins færri fréttir (3 í stað 5) til að spara AI tíma/kostnað
        const itemsToProcess = feed.items?.slice(0, 3) || [];

        for (const item of itemsToProcess) {
          const url = item.link || '';
          if (!url) continue;
          
          const title = (item.title || '').trim();
          const { data: existing } = await supa.from('articles').select('id, image_url').eq('url', url).maybeSingle();
          
          // Ef fréttin er til, sleppum við henni (svo við borgum ekki fyrir AI aftur)
          if (existing) continue;

          let imageUrl = null;
          if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
          else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

          let fullText = null;
          const scraped = await fetchContentAndImage(url);
          fullText = scraped.text;
          
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

          // --- NÝTT: AI Flokkun ---
          const category = await classifyArticle(title, fullText || item.contentSnippet || '');

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
            hash: hash,
            category: category // Vista flokkinn!
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
