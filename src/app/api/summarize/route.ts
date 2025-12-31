import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';

// Þetta verður að heita POST (með hástöfum) og má EKKI vera default
export async function POST(request: Request) {
  console.log("--- SUMMARIZE API KALLAÐ ---");
  
  if (!process.env.OPENAI_API_KEY) {
    console.error("VILLA: Vantar OPENAI_API_KEY í .env.local");
    return NextResponse.json({ error: 'Vantar API lykil' }, { status: 500 });
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const body = await request.json();
    const { articleId, textToSummarize } = body;

    if (!articleId || !textToSummarize) {
      return NextResponse.json({ error: 'Vantar gögn' }, { status: 400 });
    }

    const supa = supabaseServer();

    // 1. Gá hvort samantekt sé þegar til
    const { data: existing } = await supa
      .from('summaries')
      .select('text')
      .eq('article_id', articleId)
      .eq('type', 'eli10')
      .maybeSingle();

    if (existing) {
      console.log("Fann gamla samantekt.");
      return NextResponse.json({ summary: existing.text, cached: true });
    }

    console.log("Tala við OpenAI...");
    
    // 2. Ef ekki til, spyrja OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Þú ert hjálpsamur fréttaskýrandi. Verkefni þitt er að útskýra fréttir á einföldu íslensku máli, eins og þú sért að tala við 10 ára gamalt barn (ELI10). Notaðu emojis. Vertu stuttorður (max 3 setningar)."
        },
        {
          role: "user",
          content: `Hér er fréttin: ${textToSummarize}. Útskýrðu hvað er að gerast.`
        }
      ],
    });

    const aiResponse = completion.choices[0].message.content;

    // 3. Vista svarið
    if (aiResponse) {
      await supa.from('summaries').insert({
        article_id: articleId,
        text: aiResponse,
        type: 'eli10',
        lang: 'is'
      });
    }

    return NextResponse.json({ summary: aiResponse, cached: false });

  } catch (error: any) {
    console.error('STÓRVILLA:', error);
    return NextResponse.json({ error: 'Gat ekki búið til samantekt', details: error.message }, { status: 500 });
  }
}
