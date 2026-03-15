import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { bookTitle, bookAuthor, bookDescription } = await req.json();

        if (!bookTitle) {
            return Response.json({ error: 'Book title is required' }, { status: 400 });
        }

        const prompt = `أنت ناقد أدبي متخصص. اكتب ملخصاً شاملاً ومفيداً للكتاب التالي:

العنوان: ${bookTitle}
${bookAuthor ? `المؤلف: ${bookAuthor}` : ''}
${bookDescription ? `الوصف: ${bookDescription}` : ''}

يرجى تقديم:
1. ملخص للكتاب (3-4 فقرات)
2. 3 اقتباسات ملهمة أو مهمة من الكتاب (إذا كنت تعرفها)
3. الموضوعات الرئيسية التي يتناولها الكتاب

الرد يجب أن يكون بالعربية ومنسق جيداً.`;

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: prompt,
            add_context_from_internet: true,
            response_json_schema: {
                type: "object",
                properties: {
                    summary: { type: "string", description: "ملخص شامل للكتاب" },
                    quotes: {
                        type: "array",
                        items: { type: "string" },
                        description: "اقتباسات من الكتاب"
                    },
                    themes: {
                        type: "array",
                        items: { type: "string" },
                        description: "الموضوعات الرئيسية"
                    }
                }
            }
        });

        return Response.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error generating summary:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});