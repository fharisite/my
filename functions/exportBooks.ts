import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get('format') || 'csv';

    const books = await base44.asServiceRole.entities.Book.list('-created_date', 1000);

    if (format === 'json') {
      return new Response(JSON.stringify(books, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename=books.json'
        }
      });
    }

    // CSV format
    const headers = [
      'ISBN',
      'العنوان',
      'المؤلف',
      'الناشر',
      'التصنيف',
      'الملخص',
      'الوصف',
      'رابط الغلاف',
      'سنة النشر',
      'عدد الصفحات',
      'التقييم',
      'الوسوم',
      'مميز',
      'صوتي'
    ];

    const csvRows = [headers.join(',')];

    books.forEach(book => {
      const row = [
        book.isbn || '',
        `"${(book.title || '').replace(/"/g, '""')}"`,
        `"${(book.author_name || '').replace(/"/g, '""')}"`,
        `"${(book.publisher_name || '').replace(/"/g, '""')}"`,
        `"${(book.category || '').replace(/"/g, '""')}"`,
        `"${(book.summary || '').replace(/"/g, '""')}"`,
        `"${(book.description || '').replace(/"/g, '""')}"`,
        book.cover_image || '',
        book.publication_year || '',
        book.pages || '',
        book.rating || '',
        `"${(book.tags || []).join(', ')}"`,
        book.is_featured ? 'نعم' : 'لا',
        book.audio_available ? 'نعم' : 'لا'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    return new Response(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=books.csv'
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});