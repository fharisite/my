import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        console.log('Starting publisher migration...');

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

        // استخراج أسماء الناشرين الفريدة من publisher_name
        const publisherNamesSet = new Set();
        for (const book of allBooks) {
            const publisherName = book.data?.publisher_name || book.publisher_name;
            if (publisherName && publisherName.trim()) {
                publisherNamesSet.add(publisherName.trim());
            }
        }

        const uniquePublisherNames = Array.from(publisherNamesSet);
        console.log(`Found ${uniquePublisherNames.length} unique publishers`);

        // التحقق من الناشرين الموجودين بالفعل
        let existingPublishers = [];
        skip = 0;
        
        while (true) {
            const batch = await base44.asServiceRole.entities.Publisher.filter({}, '-created_date', limit, skip);
            if (!batch || batch.length === 0) break;
            existingPublishers = existingPublishers.concat(batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        
        const existingPublisherNames = new Set(existingPublishers.map(p => p.data?.name || p.name));
        console.log(`Found ${existingPublishers.length} existing publishers`);

        // تصفية الناشرين الجدد فقط
        const newPublishers = uniquePublisherNames
            .filter(name => !existingPublisherNames.has(name))
            .map(name => ({ name }));

        console.log(`${newPublishers.length} new publishers to create`);

        if (newPublishers.length === 0) {
            return Response.json({
                success: true,
                message: 'جميع الناشرين موجودين بالفعل',
                totalPublishers: uniquePublisherNames.length,
                newPublishers: 0,
                existingPublishers: existingPublishers.length
            });
        }

        // إنشاء الناشرين على دفعات
        const batchSize = 100;
        let totalCreated = 0;
        const results = [];

        for (let i = 0; i < newPublishers.length; i += batchSize) {
            const batch = newPublishers.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, ${batch.length} publishers`);
            
            try {
                await base44.asServiceRole.entities.Publisher.bulkCreate(batch);
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
            message: `تم إنشاء ${totalCreated} ناشر جديد`,
            totalPublishers: uniquePublisherNames.length,
            newPublishers: totalCreated,
            existingPublishers: existingPublishers.length,
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