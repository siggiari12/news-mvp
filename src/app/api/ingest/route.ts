import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';

const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/',
  'https://www.visir.is/rss/allt',
  'https://www.dv.is/rss/',
];

export async function GET() {
  const supa = supabaseServer();
  
  const parser = new Parser({
    customFields: {
      item: [
        ['media:content', 'media'],
        ['content:encoded', 'contentEncoded'],
        ['description', 'desc'], // Sækjum description sérstaklega
      ],
    },
  });

  let totalSaved = 0;

  try {
    for (const feedUrl of RSS_FEEDS) {
      let feed;
      try {
        feed = await parser.parseURL(feedUrl);
      } catch (e) {
        console.error(`Gat ekki sótt ${feedUrl}`);
        continue;
      }

      // --- NAFNA-LEIÐRÉTTING ---
      // Ef nafnið er "Allar fréttir" (Vísir), breytum því í "Vísir"
      let sourceName = feed.title || feedUrl;
      if (sourceName === 'Allar fréttir') sourceName = 'Vísir';
      if (sourceName.includes('mbl.is')) sourceName = 'MBL'; // Snyrtum MBL líka

      // 1. Finna/Búa til Source
      let { data: source } = await supa
        .from('sources')
        .select('id')
        .eq('rss_url', feedUrl)
        .maybeSingle();

      if (!source) {
        const { data: inserted } = await supa
          .from('sources')
          .insert({ name: sourceName, rss_url: feedUrl })
          .select()
          .single();
        source = inserted;
      } else {
        // Uppfæra nafnið ef það var "Allar fréttir" áður
        if (sourceName !== 'Allar fréttir') {
             await supa.from('sources').update({ name: sourceName }).eq('id', source.id);
        }
      }

      if (source) {
        const articlesToSave = feed.items?.map((item: any) => {
          const url = item.link || '';
          if (!url) return null;
          
          const title = (item.title || '').trim();
          const hash = crypto.createHash('md5').update((title + url).toLowerCase()).digest('hex');

          // --- ÖFLUG MYNDALEIT ---
          let imageUrl = null;

          // 1. Media content (Vísir notar oft þetta en með type="image/jpeg")
          if (item.media && item.media['$'] && item.media['$'].url) {
            imageUrl = item.media['$'].url;
          }
          // 2. Enclosure (RÚV)
          else if (item.enclosure && item.enclosure.url) {
            imageUrl = item.enclosure.url;
          }
          
          // 3. HTML "Scraping" (Ef allt annað bregst)
          if (!imageUrl) {
            // Sameinum allan texta til að leita í
            const allHtml = (item.contentEncoded || item.content || item.description || item.desc || '') + '';
            
            // Leitum að src="..." inni í <img ... > tagi. 
            // Þetta regex er "kærulaust" - tekur allt sem byrjar á http og endar á jpg/png/webp eða bara "
            const imgMatch = allHtml.match(/<img[^>]+src="([^">]+)"/i);
            
            if (imgMatch && imgMatch[1]) {
              imageUrl = imgMatch[1];
            }
          }

          return {
            source_id: source.id,
            title: title,
            excerpt: (item.contentSnippet || item.content || '').trim().substring(0, 300),
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is',
            image_url: imageUrl,
            hash: hash
          };
        }).filter(Boolean) || [];

        if (articlesToSave.length > 0) {
            const { error } = await supa.from('articles').upsert(articlesToSave, { onConflict: 'url' });
            if (!error) totalSaved += articlesToSave.length;
        }
      }
    }
    
    return NextResponse.json({ success: true, message: `Vann úr ${totalSaved} fréttum.` });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
