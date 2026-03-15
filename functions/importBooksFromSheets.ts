import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { spreadsheetId, sheetName } = await req.json();

    if (!spreadsheetId) {
      return Response.json({ error: 'Spreadsheet ID is required' }, { status: 400 });
    }

    // Get Google Sheets access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googlesheets');

    // Fetch data from Google Sheets
    const range = sheetName ? `${sheetName}!A:O` : 'A:O';
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    
    const response = await fetch(sheetsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `Google Sheets API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return Response.json({ error: 'No data found in spreadsheet' }, { status: 400 });
    }

    // First row is headers
    const headers = rows[0];
    const books = [];
    const errors = [];
    let successCount = 0;
    let skippedCount = 0;

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1; // +1 for Excel-style numbering
      const row = rows[i];
      
      try {
        // Skip completely empty rows
        if (!row || row.every(cell => !cell || cell.trim() === '')) {
          continue;
        }

        // Validate title (required field)
        if (!row[1] || row[1].trim() === '') {
          errors.push({
            row: rowNumber,
            error: 'العنوان مطلوب',
            data: row[0] || 'بدون ISBN'
          });
          skippedCount++;
          continue;
        }

        const book = {
          isbn: row[0] || undefined,
          title: row[1].trim(),
          author_name: row[2] || undefined,
          publisher_name: row[3] || undefined,
          category: row[4] || undefined,
          summary: row[5] || undefined,
          description: row[6] || undefined,
          cover_image: row[7] || undefined,
          publication_year: row[8] ? parseInt(row[8]) : undefined,
          pages: row[9] ? parseInt(row[9]) : undefined,
          rating: row[10] ? parseFloat(row[10]) : undefined,
          tags: row[11] ? row[11].split(',').map(t => t.trim()).filter(t => t) : undefined,
          is_featured: row[12]?.toLowerCase() === 'true' || row[12] === '1' || row[12] === 'نعم',
          audio_available: row[13]?.toLowerCase() === 'true' || row[13] === '1' || row[13] === 'نعم',
        };

        // Validate numeric fields
        if (book.publication_year && isNaN(book.publication_year)) {
          errors.push({
            row: rowNumber,
            error: 'سنة النشر يجب أن تكون رقماً',
            data: row[1]
          });
          skippedCount++;
          continue;
        }

        if (book.pages && isNaN(book.pages)) {
          errors.push({
            row: rowNumber,
            error: 'عدد الصفحات يجب أن يكون رقماً',
            data: row[1]
          });
          skippedCount++;
          continue;
        }

        if (book.rating && (isNaN(book.rating) || book.rating < 0 || book.rating > 5)) {
          errors.push({
            row: rowNumber,
            error: 'التقييم يجب أن يكون رقماً بين 0 و 5',
            data: row[1]
          });
          skippedCount++;
          continue;
        }

        books.push(book);
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error.message,
          data: row[1] || row[0] || 'بيانات غير متوفرة'
        });
        skippedCount++;
      }
    }

    // Import valid books
    if (books.length > 0) {
      try {
        const importedBooks = await base44.asServiceRole.entities.Book.bulkCreate(books);
        successCount = importedBooks.length;
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
      total: rows.length - 1,
      errors: errors.length > 0 ? errors : undefined,
      hasErrors: errors.length > 0
    });

  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});