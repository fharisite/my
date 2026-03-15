import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const csvText = await file.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return Response.json({ error: 'CSV file is empty or invalid' }, { status: 400 });
    }

    // Skip header row
    const dataLines = lines.slice(1);
    const books = [];
    const errors = [];
    let successCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const lineNumber = i + 2; // +2 because: array is 0-indexed and we skip header
      const line = dataLines[i];
      
      try {
        const values = parseCSVLine(line);
        
        if (values.length < 14) {
          errors.push({
            row: lineNumber,
            error: 'عدد الأعمدة غير كافي',
            data: line.substring(0, 50) + '...'
          });
          skippedCount++;
          continue;
        }

        // Validate title (required field)
        if (!values[1] || values[1].trim() === '') {
          errors.push({
            row: lineNumber,
            error: 'العنوان مطلوب',
            data: values[0] || 'بدون ISBN'
          });
          skippedCount++;
          continue;
        }

        const book = {
          isbn: values[0] || undefined,
          title: values[1].trim(),
          author_name: values[2] || undefined,
          publisher_name: values[3] || undefined,
          category: values[4] || undefined,
          summary: values[5] || undefined,
          description: values[6] || undefined,
          cover_image: values[7] || undefined,
          publication_year: values[8] ? parseInt(values[8]) : undefined,
          pages: values[9] ? parseInt(values[9]) : undefined,
          rating: values[10] ? parseFloat(values[10]) : undefined,
          tags: values[11] ? values[11].split(',').map(t => t.trim()).filter(t => t) : undefined,
          is_featured: values[12] === 'نعم' || values[12] === 'yes' || values[12] === 'true',
          audio_available: values[13] === 'نعم' || values[13] === 'yes' || values[13] === 'true'
        };

        // Validate numeric fields
        if (book.publication_year && isNaN(book.publication_year)) {
          errors.push({
            row: lineNumber,
            error: 'سنة النشر يجب أن تكون رقماً',
            data: values[1]
          });
          skippedCount++;
          continue;
        }

        if (book.rating && (isNaN(book.rating) || book.rating < 0 || book.rating > 5)) {
          errors.push({
            row: lineNumber,
            error: 'التقييم يجب أن يكون رقماً بين 0 و 5',
            data: values[1]
          });
          skippedCount++;
          continue;
        }

        books.push(book);
      } catch (error) {
        errors.push({
          row: lineNumber,
          error: error.message,
          data: line.substring(0, 50) + '...'
        });
        skippedCount++;
      }
    }

    // Import valid books
    if (books.length > 0) {
      try {
        await base44.asServiceRole.entities.Book.bulkCreate(books);
        successCount = books.length;
      } catch (error) {
        return Response.json({
          success: false,
          error: 'فشل حفظ الكتب في قاعدة البيانات: ' + error.message,
          parsed: books.length,
          skipped: skippedCount,
          errors: errors
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      message: successCount > 0 
        ? `تم استيراد ${successCount} كتاب بنجاح${skippedCount > 0 ? ` وتم تجاهل ${skippedCount} صف` : ''}` 
        : 'لا توجد كتب صالحة للاستيراد',
      imported: successCount,
      skipped: skippedCount,
      total: dataLines.length,
      errors: errors.length > 0 ? errors : undefined,
      hasErrors: errors.length > 0
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  return values;
}