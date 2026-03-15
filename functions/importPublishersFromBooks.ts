import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const books = await base44.asServiceRole.entities.Book.list();
    const existingPublishers = await base44.asServiceRole.entities.Publisher.list();
    const existingPublisherNames = new Set(existingPublishers.map(p => p.name.toLowerCase().trim()));

    // Build a map of existing publishers by name for linking
    const existingPublisherMap = {};
    for (const p of existingPublishers) {
      existingPublisherMap[p.name.toLowerCase().trim()] = p;
    }

    // Collect unique publisher names from books (using 'publisher' field)
    const newPublisherNames = new Set();
    for (const book of books) {
      const name = (book.publisher || '').trim();
      if (name && !existingPublisherNames.has(name.toLowerCase())) {
        newPublisherNames.add(name);
      }
    }

    // Create new publishers
    const createdPublishers = [];
    for (const publisherName of newPublisherNames) {
      const publisher = await base44.asServiceRole.entities.Publisher.create({ name: publisherName });
      createdPublishers.push(publisher);
      existingPublisherMap[publisherName.toLowerCase()] = publisher;
    }

    // Link all books (new and existing) that don't have publisher_id yet
    let linkedCount = 0;
    for (const book of books) {
      if (book.publisher_id) continue;
      const name = (book.publisher || '').trim().toLowerCase();
      const matchedPublisher = existingPublisherMap[name];
      if (matchedPublisher) {
        await base44.asServiceRole.entities.Book.update(book.id, { publisher_id: matchedPublisher.id });
        linkedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `تم إنشاء ${createdPublishers.length} ناشر جديد وربط ${linkedCount} كتاب بناشريهم`,
      created_count: createdPublishers.length,
      linked_count: linkedCount,
      publishers: createdPublishers.map(p => p.name)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});