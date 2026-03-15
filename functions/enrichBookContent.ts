import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { bookIds } = await req.json();
    
    if (!bookIds || bookIds.length === 0) {
      return Response.json({ error: 'يجب تحديد كتاب واحد على الأقل' }, { status: 400 });
    }

    const enrichedCount = { total: bookIds.length, enriched: 0, failed: 0 };
    const errors = [];

    for (const bookId of bookIds) {
      try {
        const book = await base44.asServiceRole.entities.Book.get(bookId);
        if (!book) {
          errors.push({ bookId, error: 'الكتاب غير موجود' });
          enrichedCount.failed++;
          continue;
        }

        const needsEnrichment = !book.summary || !book.description || !book.detailed_summary || 
          !book.tags || book.tags.length === 0 || !book.table_of_contents || 
          !book.famous_quotes || book.famous_quotes.length === 0 ||
          book.summary.length < 50 || book.description.length < 100 || book.detailed_summary?.length < 200;
        
        if (!needsEnrichment) {
          continue;
        }

        // Prepare comprehensive prompt for AI with web context
        const prompt = `أنت خبير متخصص في الكتب العربية والعالمية المترجمة. لديك المعلومات التالية عن كتاب:

العنوان: ${book.title}
المؤلف: ${book.author || 'غير محدد'}
الناشر: ${book.publisher || 'غير محدد'}
الأنواع: ${book.genres && book.genres.length > 0 ? book.genres.join('، ') : 'غير محدد'}
سنة النشر: ${book.published_year || 'غير محددة'}
اللغة: ${book.language || 'العربية'}
عدد الصفحات: ${book.pages || 'غير محدد'}
${book.series_name ? `السلسلة: ${book.series_name} (الجزء ${book.series_number || '؟'})` : ''}
${book.summary ? `الملخص الحالي: ${book.summary}` : ''}
${book.description ? `الوصف الحالي: ${book.description}` : ''}
${book.detailed_summary ? `الملخص التفصيلي: ${book.detailed_summary}` : ''}
${book.tags && book.tags.length > 0 ? `الوسوم الحالية: ${book.tags.join('، ')}` : ''}

المطلوب منك - إنشاء محتوى غني وشامل:

1. **ملخص مختصر** (summary): ${book.summary && book.summary.length >= 50 ? 'تحسين وإعادة صياغة' : 'إنشاء'} ملخص قصير جذاب (3-5 جمل) يثير فضول القارئ

2. **وصف تفصيلي** (description): ${book.description && book.description.length >= 100 ? 'تحسين وتوسيع' : 'إنشاء'} وصف شامل (6-10 جمل) يغطي الموضوعات الرئيسية وأهمية الكتاب

3. **ملخص تفصيلي شامل** (detailed_summary): ${book.detailed_summary ? 'تحسين' : 'إنشاء'} ملخص مفصل (10-15 جملة) يتناول الأفكار والموضوعات بعمق

4. **جدول المحتويات** (table_of_contents): ${book.table_of_contents ? 'تحسين' : 'إنشاء'} قائمة بالفصول أو الأقسام الرئيسية (8-15 فصل) إذا كان الكتاب معروفاً

5. **اقتباسات شهيرة** (famous_quotes): ${book.famous_quotes && book.famous_quotes.length > 0 ? 'إضافة المزيد من' : 'اقتراح'} 3-5 اقتباسات ملهمة أو مشهورة من الكتاب (إن كان معروفاً)

6. **عنوان محسّن** (enhanced_title): اقترح عنواً محسّناً فقط إذا كان العنوان الأصلي قصيراً جداً (أقل من 15 حرف) أو غير واضح، وإلا اتركه فارغاً

7. **وسوم** (tags): ${book.tags && book.tags.length > 0 ? 'تحسين وإضافة' : 'اقتراح'} 8-12 وسم دقيق يصف الموضوعات والنوع الأدبي

معايير الجودة:
- استخدم معلومات دقيقة وحقيقية من الإنترنت إن كان الكتاب معروفاً
- إذا لم تجد معلومات كافية عن الكتاب، اعتمد على عنوانه ونوعه ومؤلفه لإنشاء محتوى واقعي
- اجعل النصوص جذابة ومشوقة تحفز القراءة
- استخدم اللغة العربية الفصحى الحديثة والسلسة
- للاقتباسات: إن لم يكن الكتاب معروفاً، لا تخترع اقتباسات، اتركها فارغة
- جدول المحتويات يجب أن يكون واقعياً ومناسباً لنوع الكتاب`;

        const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              summary: { 
                type: "string", 
                description: "ملخص مختصر جذاب 3-5 جمل يثير الفضول"
              },
              description: { 
                type: "string", 
                description: "وصف تفصيلي شامل 6-10 جمل يغطي المحتوى والأهمية"
              },
              detailed_summary: {
                type: "string",
                description: "ملخص تفصيلي شامل 10-15 جملة يتناول الأفكار بعمق"
              },
              table_of_contents: {
                type: "string",
                description: "جدول محتويات يحتوي على قائمة الفصول أو الأقسام الرئيسية (كل فصل في سطر) - فقط إن كان الكتاب معروفاً"
              },
              famous_quotes: {
                type: "array",
                items: { type: "string" },
                description: "3-5 اقتباسات مشهورة أو ملهمة من الكتاب - فقط إن كان الكتاب معروفاً ولديك اقتباسات حقيقية"
              },
              tags: { 
                type: "array", 
                items: { type: "string" },
                description: "8-12 وسم دقيق ومتنوع للتصنيف والبحث"
              },
              enhanced_title: {
                type: "string",
                description: "عنوان محسّن فقط إذا كان العنوان الأصلي قصير جداً (<15 حرف) أو غير واضح - وإلا اتركه فارغاً"
              }
            },
            required: ["summary", "description", "detailed_summary", "tags"]
          }
        });

        // Update book with enriched content
        const updateData = {};
        
        // 1. Update summary if missing, too short, or new one is better
        if (!book.summary || book.summary.length < 50 || response.summary.length > book.summary.length) {
          updateData.summary = response.summary;
        }
        
        // 2. Update description if missing, too short, or new one is better
        if (!book.description || book.description.length < 100 || response.description.length > book.description.length) {
          updateData.description = response.description;
        }
        
        // 3. Update detailed_summary if missing or new one is longer/better
        if (!book.detailed_summary || book.detailed_summary.length < 200 || 
            (response.detailed_summary && response.detailed_summary.length > (book.detailed_summary?.length || 0))) {
          updateData.detailed_summary = response.detailed_summary;
        }
        
        // 4. Add table of contents if missing and AI provided one
        if (!book.table_of_contents && response.table_of_contents && response.table_of_contents.trim()) {
          updateData.table_of_contents = response.table_of_contents;
        }
        
        // 5. Add or merge famous quotes
        if (response.famous_quotes && response.famous_quotes.length > 0) {
          const existingQuotes = book.famous_quotes || [];
          const newQuotes = response.famous_quotes.filter(q => q && q.trim());
          const mergedQuotes = [...new Set([...existingQuotes, ...newQuotes])].slice(0, 10);
          
          if (mergedQuotes.length > existingQuotes.length) {
            updateData.famous_quotes = mergedQuotes;
          }
        }
        
        // 6. Merge tags: keep existing unique tags and add new ones
        const existingTags = book.tags || [];
        const newTags = response.tags || [];
        const mergedTags = [...new Set([...existingTags, ...newTags])].slice(0, 15);
        
        if (mergedTags.length > existingTags.length) {
          updateData.tags = mergedTags;
        }
        
        // 7. Update title only if suggested and current title is too short or unclear
        if (response.enhanced_title && response.enhanced_title.trim() && 
            book.title.length < 15 && response.enhanced_title !== book.title) {
          updateData.title = response.enhanced_title;
        }

        if (Object.keys(updateData).length > 0) {
          await base44.asServiceRole.entities.Book.update(bookId, updateData);
          enrichedCount.enriched++;
        }

      } catch (error) {
        errors.push({ bookId, bookTitle: book?.title, error: error.message });
        enrichedCount.failed++;
      }
    }

    return Response.json({
      success: true,
      message: `تم إثراء ${enrichedCount.enriched} كتاب بنجاح`,
      stats: enrichedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});