import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // الحصول على قوائم المستخدم
    const userLists = await base44.entities.BookList.filter({ owner_email: user.email });
    
    if (!userLists || userLists.length === 0) {
      // إذا لم يكن لديه قوائم، نرجع كتب عشوائية مميزة
      const allBooks = await base44.entities.Book.list('-created_date', 20);
      return Response.json({
        recommendations: allBooks.slice(0, 10),
        reason: 'كتب مقترحة للبدء'
      });
    }

    // الحصول على جميع الكتب في قوائم المستخدم
    const listIds = userLists.map(list => list.id);
    let userBooks = [];
    
    for (const listId of listIds) {
      const items = await base44.entities.BookListItem.filter({ list_id: listId });
      for (const item of items) {
        const book = await base44.entities.Book.filter({ id: item.book_id });
        if (book && book.length > 0) {
          userBooks.push(book[0]);
        }
      }
    }

    if (userBooks.length === 0) {
      const allBooks = await base44.entities.Book.list('-created_date', 20);
      return Response.json({
        recommendations: allBooks.slice(0, 10),
        reason: 'كتب مقترحة بناءً على الإصدارات الحديثة'
      });
    }

    // تحليل تفضيلات المستخدم
    const categories = [...new Set(userBooks.map(b => b.category).filter(Boolean))];
    const tags = [...new Set(userBooks.flatMap(b => b.tags || []))];
    const authors = [...new Set(userBooks.map(b => b.author_name).filter(Boolean))];
    const publishers = [...new Set(userBooks.map(b => b.publisher_name).filter(Boolean))];

    // الحصول على كتب مشابهة
    const allBooks = await base44.entities.Book.list('-created_date', 500);
    
    // تصفية الكتب التي لم يضفها المستخدم بعد
    const userBookIds = new Set(userBooks.map(b => b.id));
    const candidateBooks = allBooks.filter(book => !userBookIds.has(book.id));

    // حساب نقاط التشابه لكل كتاب
    const scoredBooks = candidateBooks.map(book => {
      let score = 0;
      
      // نقاط للتصنيف المطابق
      if (book.category && categories.includes(book.category)) {
        score += 5;
      }
      
      // نقاط للوسوم المطابقة
      if (book.tags) {
        const matchingTags = book.tags.filter(tag => tags.includes(tag));
        score += matchingTags.length * 3;
      }
      
      // نقاط للمؤلف المطابق
      if (book.author_name && authors.includes(book.author_name)) {
        score += 4;
      }
      
      // نقاط للناشر المطابق
      if (book.publisher_name && publishers.includes(book.publisher_name)) {
        score += 2;
      }
      
      // نقاط للتقييم العالي
      if (book.rating) {
        score += book.rating;
      }
      
      return { book, score };
    });

    // ترتيب حسب النقاط
    scoredBooks.sort((a, b) => b.score - a.score);
    
    // أخذ أفضل 10 توصيات
    const recommendations = scoredBooks
      .filter(item => item.score > 0)
      .slice(0, 10)
      .map(item => item.book);

    // إذا لم نجد توصيات كافية، نضيف كتب عشوائية
    if (recommendations.length < 10) {
      const remaining = candidateBooks
        .filter(book => !recommendations.some(r => r.id === book.id))
        .slice(0, 10 - recommendations.length);
      recommendations.push(...remaining);
    }

    return Response.json({
      recommendations,
      reason: `توصيات بناءً على اهتماماتك في ${categories.slice(0, 3).join('، ')}`
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    return Response.json({ 
      error: error.message,
      recommendations: []
    }, { status: 500 });
  }
});