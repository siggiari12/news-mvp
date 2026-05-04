import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import OpenAI from 'openai';

// Vercel stillingar (tími fyrir AI að hugsa)
export const maxDuration = 30; 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { articleId } = body;

    if (!articleId) {
        return NextResponse.json({ articles: [], background: [] });
    }

    const supa = supabaseServer();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1. Sækjum grunn upplýsingar til að geta byrjað (Embedding + Texti fyrir AI)
    const [embeddingRes, articleRes] = await Promise.all([
        supa.from('article_embeddings').select('embedding').eq('article_id', articleId).single(),
        supa.from('articles').select('title, full_text, excerpt').eq('id', articleId).single()
    ]);

    const embeddingData = embeddingRes.data;
    const currentArticle = articleRes.data;

    if (!embeddingData || !currentArticle) {
      return NextResponse.json({ articles: [], background: [] });
    }

    // 2. PARALLEL VINNSLA: Sækjum tengdar fréttir OG búum til AI context samtímis
    const [aiResponse, dbResponse] = await Promise.all([
        
        // A: AI - Býr til "Gott að vita" (Context)
        openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Þú ert kennari. Markmið: Útskýra 2-3 lykilhugtök/persónur/staði fyrir unglingi sem veit ekkert um málið.
                    
                    OUTPUT JSON FORMAT:
                    {
                        "context": [
                            { "question": "Hver er X?", "answer": "Stutt útskýring (1 setning)." },
                            { "question": "Hvað er Y?", "answer": "Stutt útskýring." }
                        ]
                    }
                    
                    REGLUR:
                    - Veldu BARA það sem er óljóst (t.d. "Hver er Bjarni Ben?", "Hvað er NATO?"). 
                    - Ef fréttin er einföld (t.d. veður/slys), skilaðu tómu fylki [].
                    - Vertu hlutlaus.`
                },
                {
                    role: "user",
                    content: `Titill: ${currentArticle.title}\nTexti: ${(currentArticle.full_text || currentArticle.excerpt).substring(0, 3000)}`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3
        }),

        // B: DB - Finnur tengdar fréttir (Þín upprunalega lógík)
        (async () => {
            const { data: relatedMatches } = await supa.rpc('match_articles_for_topic', {
                query_embedding: embeddingData.embedding,
                match_threshold: 0.6, // Heldur þínum þröskuldi
                match_count: 10
            });

            if (!relatedMatches || relatedMatches.length === 0) return [];

            const relatedIds = relatedMatches.map((r: any) => r.id);

            const { data: fullArticles } = await supa
                .from('articles')
                .select('id, title, url, image_url, published_at, sources(name)')
                .in('id', relatedIds)
                .neq('id', articleId) // Pössum að sýna ekki fréttina sjálfa
                .order('published_at', { ascending: false })
                .limit(5);

            return fullArticles || [];
        })()
    ]);

    // 3. Pökkum niðurstöðunum
    const aiData = JSON.parse(aiResponse.choices[0].message.content || '{}');

    return NextResponse.json({ 
        background: aiData.context || [], 
        articles: dbResponse || [] 
    });

  } catch (error: any) {
    console.error("Related API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
