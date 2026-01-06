import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { textToSummarize, topicId, type = 'full' } = await req.json();
    let finalPrompt = textToSummarize;

    // 1. EF TOPIC: Sækjum FULLAN TEXTA (ekki bara excerpt)
    if (topicId) {
        const supabase = supabaseServer();
        const { data: articles } = await supabase
            .from('articles')
            .select('title, full_text, sources(name)') // Breytt í full_text
            .eq('topic_id', topicId)
            .limit(5); 

        if (articles && articles.length > 0) {
            finalPrompt = articles.map((a: any) => 
                // Tökum fyrstu 3000 stafi úr hverri frétt (nóg fyrir deep dive, sparar tokens)
                `Miðill: ${a.sources?.name}\nTitill: ${a.title}\nTexti: ${(a.full_text || '').substring(0, 3000)}`
            ).join('\n\n---\n\n');
        }
    }

    if (!finalPrompt) return NextResponse.json({ error: 'Vantar texta' }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    let systemPrompt = "";
    let userPrompt = "";

    if (type === 'eli10') {
        // --- ELI10 (Óbreytt - eins og þú vildir hafa það) ---
        systemPrompt = "Þú ert kennari. Útskýrðu fréttina á mjög einföldu máli (fyrir 10 ára barn). Vertu stuttorður og hlutlaus.";
        userPrompt = `Útskýrðu þetta einfaldlega:\n\n${finalPrompt}`;
    } else {
        // --- SUPER-FRÉTTIN (Uppfært í "Deep Dive") ---
        systemPrompt = `
          Þú ert reyndur fréttaskýrandi og rannsóknarblaðamaður. 
          Verkefni þitt er að skrifa **ítarlega og djúpa úttekt** á málinu byggða á eftirfarandi heimildum.
          
          Kröfur:
          1. **Smáatriði:** Taktu fram nöfn, staðsetningar, tímasetningar og tölulegar upplýsingar.
          2. **Uppbygging:** Notaðu millifyrirsagnir (feitletrun) til að stúka textann niður (t.d. Atburðarásin, Viðbrögð, Bakgrunnur).
          3. **Hlutleysi:** Fléttaðu upplýsingarnar saman í eina heildstæða frásögn. Ekki segja "MBL segir þetta", heldur sameinaðu staðreyndirnar.
          4. **Lengd:** Textinn á að vera innihaldsríkur og gefa tæmandi yfirlit.
        `;
        userPrompt = `Gerðu ítarlega úttekt á þessu máli:\n\n${finalPrompt}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.4, // Aðeins lægra hitastig fyrir meiri nákvæmni í staðreyndum
      max_tokens: 1200, // Hækkað úr 600 í 1200 fyrir lengri texta
    });

    const summary = response.choices[0].message.content;

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
