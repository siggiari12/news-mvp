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
  // Erlendar fréttir
  'http://feeds.bbci.co.uk/news/world/rss.xml', // BBC
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', // NYT
  'https://www.theguardian.com/world/rss', // The Guardian
];

// --- AI Hreinsun, Flokkun og ÞÝÐING ---
async function processArticle(title: string, rawText: string) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    
    // Styttum í 5000 stafi
    const textSample = rawText.substring(0, 5000); 

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Þú ert fréttaritari. Verkefni þitt er að hreinsa, flokka og þýða ERLENDAR fréttir.
          
          OUTPUT JSON snið:
          {
            "clean_text": "Hreinn texti fréttarinnar. Ef fréttin er á erlendu tungumáli, ÞÝDDU hana yfir á ÍSLENSKU. Ef hún er á íslensku, haltu henni á íslensku (óbreyttri).",
            "category": "innlent" | "erlent" | "sport",
            "translated_title": "Titillinn á ÍSLENSKU. Ef upprunalegi titillinn er á íslensku, skilaðu honum ÓBREYTTUM. Ef hann er á ensku, þýddu hann."
          }

          REGLUR FYRIR FLOKKUN:
          1. SPORT: Íþróttir, fótbolti, handbolti, lið, leikir.
          2. ERLENT: Fréttir frá útlöndum (BBC, NYT, Guardian).
          3. INNLENT: Íslenskar fréttir (RÚV, MBL, Vísir).
          `
        },
        {
          role: "user",
          content: `Titill: ${title}\n\nHrár texti:\n${textSample}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return {
        text: result.clean_text || rawText, 
        category: result.category || 'erlent',
        title: result.translated_title || title // Notum þýddan titil ef hann er til
    };

  } catch (e) {
    console.error("AI vinnsla mistókst:", e);
    return { text: rawText, category: 'innlent', title: title };
  }
}

// --- JINA READER & MYNDAVINNSLA ---
async function fetchContentAndImage(url: string) {
  // Skilgreinum ogImage HÉR svo það sé aðgengilegt í öllu fallinu (líka catch)
  let ogImage: string | null = null;

  try {
    // 1. Reynum fyrst að finna og:image sjálf (hratt og öruggt)
    try {
        const rawRes = await fetch(url, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
        if (rawRes.ok) {
            const html = await rawRes.text();
            
            // A. Venjulegt OG Image
            const match = html.match(/<meta property="og:image" content="([^"]+)"/);
            if (match) ogImage = match[1];

            // B. MBL SÉRSTÖK LAUSN
            if (url.includes('mbl.is')) {
                const mblMatch = html.match(/https?:\\?\/\\?\/[^"'\s]*arvakur[^"'\s]*frimg[^"'\s]*\.jpg/gi);
                if (mblMatch && mblMatch.length > 0) {
                    ogImage = mblMatch[0].replace(/\\/g, '');
                }
            }
        }
    } catch (e) {
      console.log("Gat ekki sótt raw HTML, held áfram í Jina...");
    }

    // 2. Jina fyrir texta
    const res = await fetch(`https://r.jina.ai/${url}`);
    
    // Ef Jina svarar ekki 200 OK, notum við bara myndina sem við fundum
    if (!res.ok) return { text: null, image: ogImage };

    const markdown = await res.text();
    
    let text = markdown
        .replace(/!\[.*?\]\(.*?\)/g, '') 
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`_]/g, '')
        .trim();

    // Skilum textanum og myndinni (ogImage hefur forgang því við treystum því betur)
    return { text: text.substring(0, 5000), image: ogImage }; 

  } catch (error) {
    // Ef allt fer í klessu (Jina timeout), skilum við samt myndinni ef hún fannst!
    return { text: null, image: ogImage };
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

// --- TOPIC LOGIC (Uppfært til að höndla null embedding) ---
async function assignTopic(supa: any, articleId: string, title: string, embedding: any | null, imageUrl: string | null, category: string) {
  let topicId = null;

  // 1. Leita að svipuðum fréttum (BARA ef embedding er til)
  if (embedding) {
      // Við notum SQL fallið sem við bjuggum til í Supabase
      const { data: similarArticles } = await supa.rpc('match_articles_for_topic', {
        query_embedding: embedding,
        match_threshold: 0.88, // 88% líkindi = Sama frétt
        match_count: 1
      });

      if (similarArticles && similarArticles.length > 0) {
        // Fannst svipuð frétt! Notum sama Topic ID
        topicId = similarArticles[0].topic_id;
        
        // Uppfærum Topic (hækkum teljara og uppfærum tímastimpil)
        const { data: topic } = await supa.from('topics').select('article_count').eq('id', topicId).single();
        if (topic) {
            await supa.from('topics').update({ 
                article_count: topic.article_count + 1,
                updated_at: new Date().toISOString()
            }).eq('id', topicId);
        }
      }
  }

  // 2. Ef ekkert fannst (eða ekkert embedding), búum til NÝTT Topic
  if (!topicId) {
    const { data: newTopic, error } = await supa.from('topics').insert({
      title: title, // Byrjum með titil fyrstu fréttarinnar
      summary: null, 
      category: category,
      image_url: imageUrl,
      article_count: 1
    }).select().single();

    if (newTopic) topicId = newTopic.id;
  }

  // 3. Tengjum fréttina við Topic-ið
  if (topicId) {
    await supa.from('articles').update({ topic_id: topicId }).eq('id', articleId);
  }
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
      if (feedUrl.includes('bbc')) sourceName = 'BBC';
      if (feedUrl.includes('nytimes')) sourceName = 'NYT';
      if (feedUrl.includes('guardian')) sourceName = 'The Guardian';

      let { data: source } = await supa.from('sources').select('id').eq('rss_url', feedUrl).maybeSingle();
      if (!source) {
        const { data: inserted } = await supa.from('sources').insert({ name: sourceName, rss_url: feedUrl }).select().single();
        source = inserted;
      }

      if (source) {
        // Tökum 1 frétt (til að spara tíma)
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

          // 2. Sækja efni með Jina (og sérstaka MBL fixinu)
          const scraped = await fetchContentAndImage(url);
          
          // Ef RSS var ekki með mynd, notum við scrape myndina
          if (!imageUrl && scraped.image) imageUrl = scraped.image;

          // 3. AI Hreinsun, Flokkun og Þýðing
          const processed = await processArticle(item.title || '', scraped.text || item.contentSnippet || '');

          const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');

          // Bætum við hlekk neðst í textann
          const textWithLink = processed.text + `\n\n[Lesa nánar á vef miðils](${url})`;

          const articleData = {
            source_id: source.id,
            title: processed.title, // Þýddur titill (ef við á)
            excerpt: (item.contentSnippet || '').substring(0, 300),
            full_text: textWithLink, 
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is', // Allt er núna á íslensku!
            image_url: imageUrl,
            hash: hash,
            category: processed.category
          };

          const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
          
          if (!error && saved) {
            totalSaved++;
            
            // Reynum að búa til embedding
            const embedding = await generateEmbedding((processed.title || '') + " " + (processed.text || "").substring(0, 500));
            
            if (embedding) {
                // Vistum embedding
                await supa.from('article_embeddings').upsert({ article_id: saved.id, embedding });
            }

            // --- KALLA Á TOPIC FALLIÐ (Fært út fyrir if(embedding)) ---
            // Þetta tryggir að ALLAR fréttir fái topic, líka ef embedding vantar
            await assignTopic(supa, saved.id, processed.title, embedding, imageUrl, processed.category);
          }
        }
      }
    }
    return NextResponse.json({ success: true, count: totalSaved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
