import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';

// Vercel stillingar
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
];

// --- NÝTT: AI Hreinsun og Flokkun (Allt í einu!) ---
async function processArticle(title: string, rawText: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    
    // Styttum í 5000 stafi (í stað 15000) til að flýta fyrir og forðast timeout
    const textSample = rawText.substring(0, 5000); 

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Ódýrt og hratt
      messages: [
        {
          role: "system",
          content: `Þú ert fréttaritari. Verkefni þitt er að hreinsa og flokka frétt.
          
          OUTPUT JSON snið:
          {
            "clean_text": "Hér kemur hreinn texti fréttarinnar (engin valmyndir, engir hlekkir, engar auglýsingar, bara kjötið).",
            "category": "innlent" | "erlent" | "sport"
          }

          REGLUR FYRIR FLOKKUN:
          1. SPORT: Íþróttir, fótbolti, handbolti, lið, leikir (líka erlent sport).
          2. ERLENT: Gerist utan Íslands (nema það sé sport).
          3. INNLENT: Allt annað.
          `
        },
        {
          role: "user",
          content: `Titill: ${title}\n\nHrár texti:\n${textSample}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" } // Tryggir að við fáum JSON
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
        text: result.clean_text || rawText, // Ef AI klikkar, notum hráa textann
        category: result.category || 'innlent'
    };

  } catch (e) {
    console.error("AI vinnsla mistókst:", e);
    // Fallback: Skilum hráum texta og giskum á 'innlent'
    return { text: rawText, category: 'innlent' };
  }
}

// --- JINA READER ---
async function fetchContentAndImage(url: string) {
  console.log(`🔍 Sæki Jina: ${url}`);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    
    if (!res.ok) {
        console.error(`❌ Jina villa: ${res.status}`);
        return { text: null, image: null };
    }
    
    const markdown = await res.text();
    
    if (!markdown || markdown.length < 100) {
        console.warn("⚠️ Jina tómur texti");
        return { text: null, image: null };
    }

    // Finna mynd
    const imageMatch = markdown.match(/!\[.*?\]\((https?:\/\/.*?(jpg|jpeg|png|webp).*?)\)/i);
    let image = imageMatch ? imageMatch[1] : null;

    // Hreinsa texta (gróflega fyrst, AI sér um fínpússun)
    let text = markdown
        .replace(/!\[.*?\]\(.*?\)/g, '') // Myndir burt
        .replace(/\[.*?\]\(.*?\)/g, '$1') // Hlekkir -> Texti
        .replace(/[#*`_]/g, '') // Tákn burt
        .trim();

    // Skilum max 5000 stöfum (til að spara pláss/tíma)
    return { text: text.substring(0, 5000), image }; 

  } catch (error) {
    console.error("❌ Jina exception:", error);
    return { text: null, image: null };
  }
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

export async function GET() {
  const supa = supabaseServer();
  const parser = new Parser({
    customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail'], ['enclosure', 'enclosure']] },
  });

  let totalSaved = 0;

  try {
    for (const feedUrl of RSS_FEEDS) {
      let feed;
      try { feed = await parser.parseURL(feedUrl); } catch (e) { continue; }

      let sourceName = feed.title || 'Fréttir';
      if (feedUrl.includes('mbl')) sourceName = 'MBL';
      if (feedUrl.includes('visir')) sourceName = 'Vísir';
      if (feedUrl.includes('dv')) sourceName = 'DV';

      let { data: source } = await supa.from('sources').select('id').eq('rss_url', feedUrl).maybeSingle();
      if (!source) {
        const { data: inserted } = await supa.from('sources').insert({ name: sourceName, rss_url: feedUrl }).select().single();
        source = inserted;
      }

      if (source) {
        // Tökum 1 frétt (til að spara tíma/pening)
        const items = feed.items?.slice(0, 1) || [];
        
        for (const item of items) {
          const url = item.link || '';
          if (!url) continue;
          
          const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
          if (existing) continue;

          // 1. Reyna RSS mynd
          let imageUrl = null;
          if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
          else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
          else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

          // 2. Sækja efni með Jina
          const scraped = await fetchContentAndImage(url);
          
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

          // 3. AI Hreinsun og Flokkun (NÝTT!)
          const processed = await processArticle(item.title || '', scraped.text || item.contentSnippet || '');

          const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');

          const articleData = {
            source_id: source.id,
            title: item.title,
            excerpt: (item.contentSnippet || '').substring(0, 300),
            full_text: processed.text, // Hreinn texti frá AI
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is',
            image_url: imageUrl,
            hash: hash,
            category: processed.category // Flokkur frá AI
          };

          const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
          
          if (!error && saved) {
            totalSaved++;
            const embedding = await generateEmbedding((item.title || '') + " " + (processed.text || "").substring(0, 500));
            if (embedding) await supa.from('article_embeddings').upsert({ article_id: saved.id, embedding });
          }
        }
      }
    }
    return NextResponse.json({ success: true, count: totalSaved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
