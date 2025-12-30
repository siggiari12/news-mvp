import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase';

// Uppfærðar slóðir (MBL breytt í 'feeds/innlent')
const RSS_FEEDS = [
  'https://www.ruv.is/rss/frettir',
  'https://www.mbl.is/feeds/innlent/', 
];

export async function GET() {
  const supa = supabaseServer();
  const parser = new Parser();
  let totalSaved = 0;

  try {
    for (const feedUrl of RSS_FEEDS) {
      console.log(`\n--- Vinn með: ${feedUrl} ---`);
      
      let feed;
      try {
        feed = await parser.parseURL(feedUrl);
      } catch (e) {
        console.error(`Gat ekki sótt RSS frá ${feedUrl} (líklega 404 eða villa)`);
        continue; // Hoppa yfir ef slóðin er dauð
      }

      // 1. Finna/Búa til Source
      let { data: source } = await supa
        .from('sources')
        .select('id')
        .eq('rss_url', feedUrl)
        .maybeSingle();

      if (!source) {
        const { data: inserted } = await supa
          .from('sources')
          .insert({ name: feed.title || feedUrl, rss_url: feedUrl })
          .select()
          .single();
        source = inserted;
      }

      if (source) {
        // 2. Vista fréttir
        const articlesToSave = feed.items?.map((item) => {
          const url = item.link || '';
          if (!url) return null;
          
          const title = (item.title || '').trim();
          // Búa til ID
          const hash = crypto.createHash('md5').update((title + url).toLowerCase()).digest('hex');

          return {
            source_id: source.id,
            title: title,
            excerpt: (item.contentSnippet || '').trim().substring(0, 300), // Styttum aðeins
            url: url,
            published_at: item.isoDate ? new Date(item.isoDate) : new Date(),
            language: 'is',
            hash: hash
          };
        }).filter(Boolean) || []; // Hreinsa tóm gildi

        if (articlesToSave.length > 0) {
            // Upsert = Vista ef nýtt, sleppa ef til
            const { error } = await supa.from('articles').upsert(articlesToSave, { onConflict: 'url' });
            
            if (error) console.error("Villa við vistun:", error);
            else {
                console.log(`> Vistaði/uppfærði ${articlesToSave.length} fréttir.`);
                totalSaved += articlesToSave.length;
            }
        }
      }
    }
    
    return NextResponse.json({ 
        success: true, 
        message: `Aðgerð lokið. Vann úr ${totalSaved} fréttum.` 
    });

  } catch (error: any) {
    console.error('Alvarleg villa:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
