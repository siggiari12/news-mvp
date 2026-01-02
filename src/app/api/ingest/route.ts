import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';

// Vercel stillingar (Jina er hratt, en 60s er öruggt)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
];

// --- AI Flokkari ---
async function classifyArticle(title: string, excerpt: string) {
  const lowerTitle = title.toLowerCase();
  const sportWords = ['fótbolti', 'handbolti', 'körfubolti', 'liverpool', 'united', 'arsenal', 'deildin', 'mörk', 'landslið', 'valur', 'kr ', 'ka ', 'fh ', 'breiðablik', 'íþrótt', 'sport', 'leikur', 'marka'];
  
  if (sportWords.some(word => lowerTitle.includes(word))) return 'sport';

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Flokkaðu í: 'innlent', 'erlent', 'sport'. Skilaðu BARA einu orði.`
        },
        {
          role: "user",
          content: `Titill: ${title}\nTexti: ${excerpt.substring(0, 300)}`
        }
      ],
      temperature: 0.3,
    });
    const category = response.choices[0].message.content?.trim().toLowerCase();
    if (category?.includes('sport')) return 'sport';
    if (category?.includes('erlent')) return 'erlent';
    return 'innlent';
  } catch (e) { return 'innlent'; }
}

async function fetchContentAndImage(url: string) {
  console.log("------------------------------------------------");
  console.log(`🔍 SKREF 1: Byrja að sækja fyrir: ${url}`);

  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    // Köllum á Jina
    const res = await fetch(jinaUrl);
    
    console.log(`📡 SKREF 2: Jina Status Code: ${res.status}`);

    if (!res.ok) {
        console.error("❌ SKREF 2 FAIL: Jina svaraði með villu.");
        return { text: null, image: null };
    }
    
    const markdown = await res.text();
    console.log(`📄 SKREF 3: Fengum svar! Lengd: ${markdown.length} stafir.`);
    console.log(`👀 Sýnishorn af byrjun:\n${markdown.substring(0, 200)}`);

    if (markdown.includes("Title:") || markdown.includes("URL:")) {
        console.log("✅ SKREF 3: Svarið lítur út eins og Jina Markdown.");
    } else {
        console.warn("⚠️ SKREF 3: Svarið lítur skrýtið út (ekki hefðbundið Jina).");
    }

    // Vinnsla (mjög einfölduð til að útiloka villur í regex)
    let text = markdown;
    
    // Fjarlægjum myndir (svo við sjáum textann betur)
    text = text.replace(/!\[.*?\]\(.*?\)/g, '');
    
    // Tökum bara kjötið
    if (text.length > 500) {
        console.log("✅ SKREF 4: Textinn er nógu langur. Skila niðurstöðu.");
        return { text: text, image: null }; // Skilum engri mynd í bili, bara texta
    } else {
        console.warn("⚠️ SKREF 4: Textinn er of stuttur eftir hreinsun.");
        return { text: text, image: null };
    }

  } catch (error) {
    console.error("❌ ALVARLEG VILLA:", error);
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
  // Parser fyrir RSS
  
  const parser = new Parser({
    customFields: {
      item: [
        ['media:content', 'media'],
        ['media:thumbnail', 'thumbnail'],
        ['enclosure', 'enclosure'],
      ]
    },
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
        // Tökum 3 nýjustu
        const items = feed.items?.slice(0, 3) || [];
        for (const item of items) {
          const url = item.link || '';
          if (!url) continue;
          
          const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
          if (existing) continue;

          // 1. Reyna RSS mynd fyrst (hraðast)
          let imageUrl = null;
          if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
          else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
          else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

          // 2. Sækja efni með Jina AI
          const scraped = await fetchContentAndImage(url);
          let fullText = scraped.text;
          
          // Ef engin RSS mynd, notum Jina myndina
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

          const category = await classifyArticle(item.title || '', fullText || item.contentSnippet || '');

          const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');

          const articleData = {
            source_id: source.id,
            title: item.title,
            excerpt: (item.contentSnippet || '').substring(0, 300),
            full_text: fullText,
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is',
            image_url: imageUrl,
            hash: hash,
            category: category
          };

          const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
          
          if (!error && saved) {
            totalSaved++;
            const embedding = await generateEmbedding((item.title || '') + " " + (fullText || "").substring(0, 500));
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
