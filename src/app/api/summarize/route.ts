import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { textToSummarize, topicId, articleId, type = 'full' } = await req.json();
    const supabase = supabaseServer();
    let finalPrompt = textToSummarize;

    // --- CACHE CHECK ---
    // For full summaries on a single article, return the cached full_text if it
    // already looks like a GPT-generated summary (longer than a raw excerpt).
    if (articleId && type === 'full') {
      const { data: cached } = await supabase
        .from('articles')
        .select('full_text')
        .eq('id', articleId)
        .single();

      if (cached?.full_text && cached.full_text.length > 400) {
        return NextResponse.json({ summary: cached.full_text, cached: true });
      }
    }

    // For topics, also check if the topic's lead article already has a cached summary.
    if (topicId && type === 'full') {
      const { data: lead } = await supabase
        .from('articles')
        .select('id, full_text')
        .eq('topic_id', topicId)
        .order('published_at', { ascending: false })
        .limit(1)
        .single();

      if (lead?.full_text && lead.full_text.length > 400) {
        return NextResponse.json({ summary: lead.full_text, cached: true });
      }
    }

    // --- BUILD PROMPT ---
    if (topicId) {
      const { data: articles } = await supabase
        .from('articles')
        .select('id, title, full_text, sources(name)')
        .eq('topic_id', topicId)
        .limit(5);

      if (articles && articles.length > 0) {
        finalPrompt = articles.map((a: any) =>
          `Miðill: ${a.sources?.name}\nTitill: ${a.title}\nTexti: ${(a.full_text || '').substring(0, 3000)}`
        ).join('\n\n---\n\n');
      }
    }

    if (!finalPrompt) return NextResponse.json({ error: 'Vantar texta' }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

    let systemPrompt = '';
    let userPrompt = '';

    if (type === 'eli10') {
      systemPrompt = 'Þú ert kennari. Útskýrðu fréttina á mjög einföldu máli (fyrir 10 ára barn). Vertu stuttorður og hlutlægt.';
      userPrompt = `Útskýrðu þetta einfaldlega:\n\n${finalPrompt}`;
    } else {
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
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const summary = response.choices[0].message.content;

    // --- WRITE BACK TO CACHE ---
    // Persist the generated summary so the next open is instant.
    // For topic cards: update the most-recent article in the topic.
    // For single articles: update the article directly.
    if (summary && type === 'full') {
      if (topicId) {
        const { data: lead } = await supabase
          .from('articles')
          .select('id')
          .eq('topic_id', topicId)
          .order('published_at', { ascending: false })
          .limit(1)
          .single();

        if (lead?.id) {
          await supabase.from('articles').update({ full_text: summary }).eq('id', lead.id);
        }
      } else if (articleId) {
        await supabase.from('articles').update({ full_text: summary }).eq('id', articleId);
      }
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
