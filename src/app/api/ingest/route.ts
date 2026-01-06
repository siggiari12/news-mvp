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

// --- HJÁLPARFALL: Hreinsar titil fyrir samanburð ---
function cleanTitle(text: string) {
  return text
    .toLowerCase()
    .replace(/\|.*$/, '') // Fjarlægja allt eftir | (t.d. "| mbl.is")
    .replace(/-.*$/, '')  // Fjarlægja allt eftir - (t.d. "- Vísir")
    .replace(/[^\w\sáðéíóúýþæö]/g, '') // Fjarlægja tákn en halda íslenskum stöfum
    .replace(/\s{2,}/g, " ") // Fjarlægja auka bil
    .trim();
}

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
          content: `Þú ert fréttaritari. Verkefni þitt er að hreinsa, flokka og þýða fréttir.
          
          OUTPUT JSON snið:
          {
            "clean_text": "Hreinn texti fréttarinnar. Ef fréttin er á erlendu tungumáli, ÞÝDDU hana yfir á ÍSLENSKU. Ef hún er á íslensku, haltu henni á íslensku (óbreyttri).",
            "category": "innlent" | "erlent" | "sport",
            "translated_title": "Titillinn á ÍSLENSKU. Ef upprunalegi titillinn er á íslensku, skilaðu honum ÓBREYTTUM. Ef hann er á ensku, þýddu hann."
          }

          REGLUR FYRIR FLOKKUN (MIKILVÆGT):
          1. SPORT: Allt sem tengist íþróttum (fótbolti, handbolti, golf, formúla 1, landslið). Þetta gildir LÍKA ef fréttin er um íslenskt landslið eða íslenska leikmenn. Það er ALLTAF 'sport', aldrei 'innlent'.
          2. ERLENT: Fréttir frá útlöndum (BBC, NYT, Guardian) sem eru EKKI íþróttir.
          3. INNLENT: Íslenskar fréttir (RÚV, MBL, Vísir) sem eru EKKI íþróttir (t.d. stjórnmál, veður, samfélag).
          `
        },
        {
          role: "user",
          content: `Titill: ${title}\n\nHrár texti:\n${textSample}`
        }
      ],
      temperature: 0, // Lægra hitastig fyrir meiri nákvæmni í flokkun
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
    
    if (!res.ok) return { text: null, image: ogImage };

    const markdown = await res.text();
    
    let text = markdown
        .replace(/!\[.*?\]\(.*?\)/g, '') 
        .replace(/\[.*?\]\(.*?\)/g, '$1')
        .replace(/[#*`_]/g, '')
        .trim();

    return { text: text.substring(0, 5000), image: ogImage }; 

  } catch (error) {
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

// --- TOPIC LOGIC ---
async function assignTopic(supa: any, articleId: string, title: string, embedding: any | null, imageUrl: string | null, category: string) {
  let topicId = null;
  const cleanedTitle = cleanTitle(title);

  // 1. HEIMSKI TÉKKINN (Grípur augljós mál strax)
  const { data: recentTopics } = await supa
    .from('topics')
    .select('id, title')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (recentTopics) {
      for (const t of recentTopics) {
          if (cleanTitle(t.title) === cleanedTitle) {
              console.log(`🎯 Fann nákvæman titil-match! "${title}"`);
              topicId = t.id;
              break;
          }
      }
  }

  // 2. SNJALLI TÉKKINN (Vektor leit)
  if (!topicId && embedding) {
      const { data: similarArticles } = await supa.rpc('match_articles_for_topic', {
        query_embedding: embedding,
        match_threshold: 0.75, // Lækkaður þröskuldur (eins og þú varst með)
        match_count: 1
      });

      if (similarArticles && similarArticles.length > 0) {
        console.log(`✅ Fann AI match! "${title}"`);
        topicId = similarArticles[0].topic_id;
      }
  }

  // 3. UPDATE / INSERT
  if (topicId) {
    const { data: topic } = await supa.from('topics').select('article_count').eq('id', topicId).single();
    if (topic) {
        await supa.from('topics').update({ 
            article_count: topic.article_count + 1,
            updated_at: new Date().toISOString()
        }).eq('id', topicId);
    }
  } else {
    console.log(`🆕 Bý til nýtt topic: "${title}"`);
    const { data: newTopic } = await supa.from('topics').insert({
      title: title, 
      summary: null, 
      category: category,
      image_url: imageUrl,
      article_count: 1
    }).select().single();
    if (newTopic) topicId = newTopic.id;
  }

  if (topicId) {
    await supa.from('articles').update({ topic_id: topicId }).eq('id', articleId);
  }
}

// --- TÚRBÓ GET FALL (Parallel Processing) ---
export async function GET() {
  const supa = supabaseServer();
  const parser = new Parser({
    customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail'], ['enclosure', 'enclosure']] },
  });

  const startTime = Date.now();
  let totalSaved = 0;

  try {
    // 1. Vinnum alla miðla SAMTÍMIS (Parallel)
    const feedPromises = RSS_FEEDS.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        
        let sourceName = feed.title || 'Fréttir';
        if (feedUrl.includes('mbl')) sourceName = 'MBL';
        if (feedUrl.includes('visir')) sourceName = 'Vísir';
        if (feedUrl.includes('dv')) sourceName = 'DV';
        if (feedUrl.includes('bbc')) sourceName = 'BBC';
        if (feedUrl.includes('nytimes')) sourceName = 'NYT';
        if (feedUrl.includes('guardian')) sourceName = 'The Guardian';

        let { data: source } = await supa.from('sources').select('id').eq('rss_url', feedUrl).maybeSingle();
        
        if (!source) {
            const { data: existingByName } = await supa.from('sources').select('id').eq('name', sourceName).maybeSingle();
            if (existingByName) {
                source = existingByName;
            } else {
                const { data: inserted } = await supa.from('sources').insert({ name: sourceName, rss_url: feedUrl }).select().single();
                source = inserted;
            }
        }

        if (source) {
            const items = feed.items?.slice(0, 10) || [];
            
            const itemPromises = items.map(async (item) => {
                const url = item.link || '';
                if (!url) return 0;
                
                const { data: existing } = await supa.from('articles').select('id').eq('url', url).maybeSingle();
                if (existing) return 0;

                let imageUrl = null;
                if (item.media && item.media['$'] && item.media['$'].url) imageUrl = item.media['$'].url;
                else if (item.thumbnail && item.thumbnail['$'] && item.thumbnail['$'].url) imageUrl = item.thumbnail['$'].url;
                else if (item.enclosure && item.enclosure.url) imageUrl = item.enclosure.url;

                const scraped = await fetchContentAndImage(url);
                if (!imageUrl && scraped.image) imageUrl = scraped.image;

                const processed = await processArticle(item.title || '', scraped.text || item.contentSnippet || '');

                const hash = crypto.createHash('md5').update(((item.title || '') + url).toLowerCase()).digest('hex');
                const textWithLink = processed.text + `\n\n[Lesa nánar á vef miðils](${url})`;

                const articleData = {
                    source_id: source.id,
                    title: processed.title, 
                    excerpt: (item.contentSnippet || '').substring(0, 300),
                    full_text: textWithLink, 
                    url: url,
                    published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
                    language: 'is', 
                    image_url: imageUrl,
                    hash: hash,
                    category: processed.category
                };

                const { data: saved, error } = await supa.from('articles').upsert(articleData, { onConflict: 'url' }).select().single();
                
                if (!error && saved) {
                    const embedding = await generateEmbedding((processed.title || '') + " " + (processed.text || "").substring(0, 500));
                    
                    if (embedding) {
                        await supa.from('article_embeddings').upsert({ article_id: saved.id, embedding });
                        await assignTopic(supa, saved.id, processed.title, embedding, imageUrl, processed.category);
                    }
                    return 1;
                }
                return 0;
            });

            // HÉR VAR VILLAN: Bætti við ": number" til að laga týpuna
            const results = await Promise.all(itemPromises);
            return results.reduce((a: number, b) => (a || 0) + (b || 0), 0);
        }
        return 0;
      } catch (e) {
        console.error(`Villa í feed ${feedUrl}:`, e);
        return 0;
      }
    });

    // HÉR LÍKA: Bætti við ": number"
    const results = await Promise.all(feedPromises);
    totalSaved = results.reduce((a: number, b) => a + b, 0);

    const duration = (Date.now() - startTime) / 1000;
    return NextResponse.json({ success: true, count: totalSaved, time: `${duration}s` });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

