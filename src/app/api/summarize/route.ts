import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { textToSummarize, topicId } = await req.json();
    let finalPrompt = textToSummarize;

    // EF ÞETTA ER TOPIC: Sækjum allar fréttirnar og púsla saman
    if (topicId) {
        const supabase = supabaseServer();
        const { data: articles } = await supabase
            .from('articles')
            .select('title, excerpt, sources(name)')
            .eq('topic_id', topicId)
            .limit(5); // Lesum max 5 fréttir til að spara token

        if (articles && articles.length > 0) {
            // Búum til einn stóran texta úr öllum fréttunum
            finalPrompt = articles.map((a: any) => 
                `Miðill: ${a.sources?.name}\nTitill: ${a.title}\nInngangur: ${a.excerpt}`
            ).join('\n\n---\n\n');
            
            finalPrompt = `Hér eru nokkrar fréttir um sama málið frá mismunandi miðlum. Skrifaðu eina hnitmiðaða samantekt (max 3 málsgreinar) sem dregur saman aðalatriðin úr þeim öllum:\n\n${finalPrompt}`;
        }
    }

    if (!finalPrompt) return NextResponse.json({ error: 'Vantar texta' }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Þú ert snjall fréttaritari. Þitt hlutverk er að útskýra fréttir á einföldu máli (ELI5) á íslensku. Vertu hlutlaus og stuttorður."
        },
        {
          role: "user",
          content: topicId 
            ? finalPrompt // Nota sérstaka promptið fyrir topics
            : `Endursegðu þessa frétt í stuttu máli (einföld íslenska):\n\n${finalPrompt}`
        }
      ],
      temperature: 0.5,
      max_tokens: 300,
    });

    const summary = response.choices[0].message.content;

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
