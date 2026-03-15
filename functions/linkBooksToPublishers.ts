import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all books and publishers
    const books = await base44.asServiceRole.entities.Book.list();
    const publishers = await base44.asServiceRole.entities.Publisher.list();

    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const book of books) {
      // Skip if already has publisher_id
      if (book.publisher_id) {
        skippedCount++;
        continue;
      }

      // Skip if no publisher_name
      if (!book.publisher_name) {
        skippedCount++;
        continue;
      }

      // Find matching publisher by name (case-insensitive)
      const matchingPublisher = publishers.find(
        p => p.name.trim().toLowerCase() === book.publisher_name.trim().toLowerCase()
      );

      if (matchingPublisher) {
        try {
          await base44.asServiceRole.entities.Book.update(book.id, {
            publisher_id: matchingPublisher.id
          });
          updatedCount++;
        } catch (error) {
          errors.push({
            bookId: book.id,
            bookTitle: book.title,
            error: error.message
          });
        }
      } else {
        skippedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `تم ربط ${updatedCount} كتاب بالناشرين`,
      stats: {
        totalBooks: books.length,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});