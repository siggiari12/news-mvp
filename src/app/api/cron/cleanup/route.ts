import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic'; // Tryggir að þetta keyri alltaf ferskt

export async function GET(req: Request) {
  // Öryggistékk: Athuga hvort kallið komi frá Vercel Cron eða þér (með secret key)
  // Í bili leyfum við öllum að kalla á þetta til að prófa, en í framtíðinni setjum við auth header.
  
  const supabase = supabaseServer();
  
  // Reiknum dagsetninguna fyrir 3 dögum síðan
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  try {
    // 1. Finnum ID á gömlum fréttum (til að logga hvað við erum að gera)
    const { data: oldArticles, error: fetchError } = await supabase
      .from('articles')
      .select('id, title, published_at')
      .lt('published_at', threeDaysAgo.toISOString())
      .limit(1000); // Tökum max 1000 í einu til að sprengja ekki tímamörk

    if (fetchError) throw fetchError;

    if (!oldArticles || oldArticles.length === 0) {
      return NextResponse.json({ message: 'Ekkert til að hreinsa', count: 0 });
    }

    const idsToDelete = oldArticles.map(a => a.id);

    // 2. Eyðum fréttunum
    // (Ath: Ef þú ert með 'cascade' delete á tengdum töflum eins og embeddings/clicks þá hverfa þær líka)
    const { error: deleteError } = await supabase
      .from('articles')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) throw deleteError;

    console.log(`🧹 Hreinsaði ${idsToDelete.length} gamlar fréttir.`);

    return NextResponse.json({ 
      success: true, 
      deletedCount: idsToDelete.length,
      message: `Hreinsaði ${idsToDelete.length} fréttir eldri en ${threeDaysAgo.toISOString()}`
    });

  } catch (error: any) {
    console.error("Cleanup villa:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
