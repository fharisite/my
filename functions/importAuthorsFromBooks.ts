import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const books = await base44.asServiceRole.entities.Book.list();
    const existingAuthors = await base44.asServiceRole.entities.Author.list();
    const existingAuthorNames = new Set(existingAuthors.map(a => a.name.toLowerCase().trim()));

    // Build a map of existing authors by name for linking
    const existingAuthorMap = {};
    for (const a of existingAuthors) {
      existingAuthorMap[a.name.toLowerCase().trim()] = a;
    }

    // Collect unique author names from books (using 'author' field)
    const newAuthorNames = new Set();
    for (const book of books) {
      const name = (book.author || '').trim();
      if (name && !existingAuthorNames.has(name.toLowerCase())) {
        newAuthorNames.add(name);
      }
    }

    // Create new authors
    const createdAuthors = [];
    for (const authorName of newAuthorNames) {
      const author = await base44.asServiceRole.entities.Author.create({ name: authorName });
      createdAuthors.push(author);
      existingAuthorMap[authorName.toLowerCase()] = author;
    }

    // Link all books (new and existing) that don't have author_id yet
    let linkedCount = 0;
    for (const book of books) {
      if (book.author_id) continue;
      const name = (book.author || '').trim().toLowerCase();
      const matchedAuthor = existingAuthorMap[name];
      if (matchedAuthor) {
        await base44.asServiceRole.entities.Book.update(book.id, { author_id: matchedAuthor.id });
        linkedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `تم إنشاء ${createdAuthors.length} مؤلف جديد وربط ${linkedCount} كتاب بمؤلفيهم`,
      created_count: createdAuthors.length,
      linked_count: linkedCount,
      authors: createdAuthors.map(a => a.name)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});