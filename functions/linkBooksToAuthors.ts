import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        console.log('Starting books-to-authors linking...');

        // قراءة جميع المؤلفين
        let allAuthors = [];
        let skip = 0;
        const limit = 1000;
        
        while (true) {
            console.log(`Fetching authors, skip: ${skip}`);
            const batch = await base44.asServiceRole.entities.Author.filter({}, '-created_date', limit, skip);
            if (!batch || batch.length === 0) break;
            allAuthors = allAuthors.concat(batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        
        console.log(`Total authors found: ${allAuthors.length}`);
        
        if (allAuthors.length === 0) {
            return Response.json({ 
                success: false, 
                message: 'لا يوجد مؤلفين في قاعدة البيانات'
            });
        }

        // إنشاء خريطة من أسماء المؤلفين إلى معرفاتهم
        const authorNameToId = new Map();
        for (const author of allAuthors) {
            const name = author.data?.name || author.name;
            const id = author.data?.id || author.id;
            if (name && id) {
                authorNameToId.set(name.trim(), id);
            }
        }
        
        console.log(`Created name-to-id map with ${authorNameToId.size} entries`);

        // قراءة جميع الكتب بطريقة تدريجية
        let allBooks = [];
        skip = 0;
        
        while (true) {
            console.log(`Fetching books, skip: ${skip}`);
            const batch = await base44.asServiceRole.entities.Book.filter({}, '-created_date', limit, skip);
            if (!batch || batch.length === 0) break;
            allBooks = allBooks.concat(batch);
            console.log(`Total books loaded so far: ${allBooks.length}`);
            if (batch.length < limit) break;
            skip += limit;
        }
        
        console.log(`Total books found: ${allBooks.length}`);

        // تحديث الكتب بمعرفات المؤلفين
        let updatedCount = 0;
        let notFoundCount = 0;
        let alreadyLinkedCount = 0;
        const batchSize = 30;
        const results = [];

        for (let i = 0; i < allBooks.length; i += batchSize) {
            const batch = allBooks.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, ${batch.length} books`);
            
            const updates = [];
            
            for (const book of batch) {
                const bookId = book.data?.id || book.id;
                const authorName = book.data?.author_name || book.author_name;
                const currentAuthorId = book.data?.author_id || book.author_id;
                
                // إذا كان الكتاب مرتبط بالفعل، تجاوزه
                if (currentAuthorId) {
                    alreadyLinkedCount++;
                    continue;
                }
                
                // إذا لم يكن هناك اسم مؤلف، تجاوزه
                if (!authorName || !authorName.trim()) {
                    notFoundCount++;
                    continue;
                }
                
                // البحث عن معرف المؤلف
                const authorId = authorNameToId.get(authorName.trim());
                
                if (authorId) {
                    updates.push({
                        id: bookId,
                        author_id: authorId
                    });
                } else {
                    notFoundCount++;
                    console.log(`Author not found for book: ${book.title}, author_name: ${authorName}`);
                }
            }
            
            // تنفيذ التحديثات
            if (updates.length > 0) {
                try {
                    for (const update of updates) {
                        await base44.asServiceRole.entities.Book.update(update.id, { author_id: update.author_id });
                        // تأخير لتجنب تجاوز حد الطلبات
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    updatedCount += updates.length;
                    results.push({
                        batch: Math.floor(i / batchSize) + 1,
                        count: updates.length,
                        status: 'success'
                    });
                    console.log(`Batch ${Math.floor(i / batchSize) + 1} succeeded, updated ${updates.length} books`);
                } catch (error) {
                    console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
                    results.push({
                        batch: Math.floor(i / batchSize) + 1,
                        count: updates.length,
                        status: 'error',
                        error: error.message
                    });
                }
            } else {
                console.log(`Batch ${Math.floor(i / batchSize) + 1} had no updates`);
            }
        }

        return Response.json({
            success: true,
            message: `تم ربط ${updatedCount} كتاب بالمؤلفين`,
            totalBooks: allBooks.length,
            updatedBooks: updatedCount,
            alreadyLinked: alreadyLinkedCount,
            authorNotFound: notFoundCount,
            batches: results
        });

    } catch (error) {
        console.error('Error in linking:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});