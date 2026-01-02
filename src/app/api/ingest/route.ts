import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

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
          FORGANGSRÖÐUN:
          1. SPORT: Ef fréttin fjallar um íþróttir, þá er hún ALLTAF 'sport'.
          2. ERLENT: Ef hún er ekki sport, en gerist utan Íslands.
          3. INNLENT: Allt annað.
          Skilaðu BARA einu orði.`
        },
        {
          role: "user",
          content: `Titill: ${title}\nTexti: ${excerpt.substring(0, 300)}`
        }
      ],
      temperature: 0.3,
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

// --- Puppeteer Scraper ---
async function fetchContentAndImage(url: string) {
  let browser = null;
  try {
    chromium.setGraphicsMode = false;
    
    // Hér er lagfæringin: Setjum stillingar beint inn
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: true, // eða "new"
    });

    const page = await browser.newPage();
    
    // Timeout 20 sekúndur
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    const data = await page.evaluate(() => {
      const img = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      
      const content = document.querySelector('article, .story-body, .main-content, .content, [data-testid="article-body"]');
      let text = "";
      
      if (content) {
        text = content.textContent || ""; // Nota textContent (öruggara en innerText)
      } else {
        const paras = Array.from(document.querySelectorAll('p'));
        text = paras
          .filter(p => (p.textContent || "").length > 50)
          .map(p => p.textContent || "")
          .join('\n\n');
      }
      
      return { text, img };
    });

    await browser.close();
    
    // Hreinsa textann
    let cleanedText = data.text ? data.text.replace(/\s+/g, ' ').trim() : null;

    return { text: cleanedText, image: data.img || null };

  } catch (error) {
    console.error(`Puppeteer mistókst á ${url}:`, error);
    if (browser) await browser.close();
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
        // Tökum 3 nýjustu
        const itemsToProcess = feed.items?.slice(0, 3) || [];

        for (const item of itemsToProcess) {
          const url = item.link || '';
          if (!url) continue;
          
          const title = (item.title || '').trim();
          const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
          
          if (existing) continue;

          let imageUrl = null;
          if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
          else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

          // Puppeteer sækir efnið
          const scraped = await fetchContentAndImage(url);
          let fullText = scraped.text;
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

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
            category: category
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
    console.error("Ingest Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
