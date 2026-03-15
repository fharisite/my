import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all authors
    const authors = await base44.asServiceRole.entities.Author.list();
    
    // Group authors by name (case-insensitive)
    const authorsByName = {};
    for (const author of authors) {
      const normalizedName = author.name.trim().toLowerCase();
      if (!authorsByName[normalizedName]) {
        authorsByName[normalizedName] = [];
      }
      authorsByName[normalizedName].push(author);
    }

    // Find duplicates
    const duplicateGroups = Object.values(authorsByName).filter(group => group.length > 1);
    
    if (duplicateGroups.length === 0) {
      return Response.json({
        success: true,
        message: 'لا توجد مؤلفين مكررين',
        merged: 0
      });
    }

    let mergedCount = 0;
    let booksUpdated = 0;

    // Merge each group
    for (const group of duplicateGroups) {
      // Sort by created_date to keep the oldest
      group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      
      const primaryAuthor = group[0]; // Keep the oldest
      const duplicates = group.slice(1); // Delete the rest

      // Update all books that reference the duplicate authors
      const books = await base44.asServiceRole.entities.Book.list();
      for (const duplicate of duplicates) {
        const booksToUpdate = books.filter(b => b.author_id === duplicate.id);
        
        for (const book of booksToUpdate) {
          await base44.asServiceRole.entities.Book.update(book.id, {
            author_id: primaryAuthor.id,
            author_name: primaryAuthor.name
          });
          booksUpdated++;
        }

        // Update author follows
        const follows = await base44.asServiceRole.entities.AuthorFollow.filter({ author_id: duplicate.id });
        for (const follow of follows) {
          // Check if this user already follows the primary author
          const existingFollow = await base44.asServiceRole.entities.AuthorFollow.filter({
            author_id: primaryAuthor.id,
            follower_email: follow.follower_email
          });
          
          if (existingFollow.length === 0) {
            // Move the follow to primary author
            await base44.asServiceRole.entities.AuthorFollow.create({
              author_id: primaryAuthor.id,
              follower_email: follow.follower_email
            });
          }
          
          // Delete the old follow
          await base44.asServiceRole.entities.AuthorFollow.delete(follow.id);
        }

        // Delete the duplicate author
        await base44.asServiceRole.entities.Author.delete(duplicate.id);
        mergedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `تم دمج ${mergedCount} مؤلف مكرر وتحديث ${booksUpdated} كتاب`,
      merged: mergedCount,
      booksUpdated,
      duplicateGroups: duplicateGroups.length
    });

  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});