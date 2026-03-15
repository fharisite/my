import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        console.log('Starting author migration...');

        // قراءة جميع الكتب بطريقة تدريجية
        let allBooks = [];
        let skip = 0;
        const limit = 1000;
        
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
        
        if (allBooks.length === 0) {
            return Response.json({ 
                success: true, 
                message: 'لا توجد كتب',
                count: 0
            });
        }

        // استخراج أسماء المؤلفين الفريدة من author_name
        const authorNamesSet = new Set();
        for (const book of allBooks) {
            const authorName = book.data?.author_name || book.author_name;
            if (authorName && authorName.trim()) {
                authorNamesSet.add(authorName.trim());
            }
        }

        const uniqueAuthorNames = Array.from(authorNamesSet);
        console.log(`Found ${uniqueAuthorNames.length} unique authors`);

        // التحقق من المؤلفين الموجودين بالفعل
        let existingAuthors = [];
        skip = 0;
        
        while (true) {
            const batch = await base44.asServiceRole.entities.Author.filter({}, '-created_date', limit, skip);
            if (!batch || batch.length === 0) break;
            existingAuthors = existingAuthors.concat(batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        
        const existingAuthorNames = new Set(existingAuthors.map(a => a.data?.name || a.name));
        console.log(`Found ${existingAuthors.length} existing authors`);

        // تصفية المؤلفين الجدد فقط
        const newAuthors = uniqueAuthorNames
            .filter(name => !existingAuthorNames.has(name))
            .map(name => ({ name }));

        console.log(`${newAuthors.length} new authors to create`);

        if (newAuthors.length === 0) {
            return Response.json({
                success: true,
                message: 'جميع المؤلفين موجودين بالفعل',
                totalAuthors: uniqueAuthorNames.length,
                newAuthors: 0,
                existingAuthors: existingAuthors.length
            });
        }

        // إنشاء المؤلفين على دفعات
        const batchSize = 100;
        let totalCreated = 0;
        const results = [];

        for (let i = 0; i < newAuthors.length; i += batchSize) {
            const batch = newAuthors.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, ${batch.length} authors`);
            
            try {
                await base44.asServiceRole.entities.Author.bulkCreate(batch);
                totalCreated += batch.length;
                results.push({
                    batch: Math.floor(i / batchSize) + 1,
                    count: batch.length,
                    status: 'success'
                });
                console.log(`Batch ${Math.floor(i / batchSize) + 1} succeeded`);
            } catch (error) {
                console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
                results.push({
                    batch: Math.floor(i / batchSize) + 1,
                    count: batch.length,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            message: `تم إنشاء ${totalCreated} مؤلف جديد`,
            totalAuthors: uniqueAuthorNames.length,
            newAuthors: totalCreated,
            existingAuthors: existingAuthors.length,
            batches: results
        });

    } catch (error) {
        console.error('Error in migration:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});