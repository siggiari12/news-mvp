import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // 1. NÝTT: Við tökum við 'type' (full eða eli10)
    const { textToSummarize, topicId, type = 'full' } = await req.json();
    let finalPrompt = textToSummarize;

    // 2. EF TOPIC: Sækjum allar fréttirnar og púsla saman
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
        }
    }

    if (!finalPrompt) return NextResponse.json({ error: 'Vantar texta' }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    // 3. NÝTT: Mismunandi Prompts eftir því hvort þetta er 'full' eða 'eli10'
    let systemPrompt = "";
    let userPrompt = "";

    if (type === 'eli10') {
        // ELI10 (Einföldun fyrir 10 ára)
        systemPrompt = "Þú ert kennari. Útskýrðu fréttina á mjög einföldu máli (fyrir 10 ára barn). Vertu stuttorður og hlutlaus.";
        userPrompt = `Útskýrðu þetta einfaldlega:\n\n${finalPrompt}`;
    } else {
        // FULL (Super-fréttin / Blaðamaður)
        systemPrompt = "Þú ert reyndur blaðamaður. Verkefni þitt er að skrifa eina heildstæða og ítarlega frétt á íslensku byggða á eftirfarandi heimildum. Ekki segja 'samkvæmt vísi' eða 'samkvæmt mbl', heldur fléttaðu upplýsingarnar saman í eina hlutlausa frásögn. Notaðu millifyrirsagnir ef þarf.";
        userPrompt = `Skrifaðu fréttina:\n\n${finalPrompt}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 600, // Hækkaði tokens aðeins fyrir ítarlegri frétt
    });

    const summary = response.choices[0].message.content;

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
