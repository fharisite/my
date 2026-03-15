import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // جلب جميع الكتب
    const books = await base44.asServiceRole.entities.Book.list();
    
    // تجميع الكتب حسب ISBN
    const booksByISBN = {};
    const duplicates = [];
    
    for (const book of books) {
      if (book.isbn) {
        if (!booksByISBN[book.isbn]) {
          booksByISBN[book.isbn] = [];
        }
        booksByISBN[book.isbn].push(book);
      }
    }
    
    // إيجاد المكررات
    for (const isbn in booksByISBN) {
      if (booksByISBN[isbn].length > 1) {
        // الاحتفاظ بالكتاب الأول (الأقدم) وحذف البقية
        const sorted = booksByISBN[isbn].sort((a, b) => 
          new Date(a.created_date) - new Date(b.created_date)
        );
        
        // حذف جميع النسخ المكررة ما عدا الأولى
        for (let i = 1; i < sorted.length; i++) {
          await base44.asServiceRole.entities.Book.delete(sorted[i].id);
          duplicates.push({
            isbn: isbn,
            title: sorted[i].title,
            deleted_id: sorted[i].id
          });
        }
      }
    }

    return Response.json({
      success: true,
      message: `تم حذف ${duplicates.length} كتاب مكرر`,
      removed_count: duplicates.length,
      details: duplicates
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});