import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // التحقق من صلاحيات المدير
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        console.log('Starting migration from Test to Production...');

        // قراءة جميع الكتب من Test database - نستخدم SDK بشكل مباشر
        // SDK يدعم data_env parameter في بعض الدوال
        let testBooks = [];
        
        try {
            // محاولة قراءة الكتب - نستخدم حل بديل
            // نقرأ من production أولاً لنرى إذا كان هناك كتب
            const prodBooks = await base44.asServiceRole.entities.Book.list('-created_date', 10);
            console.log(`Production has ${prodBooks.length} books (sample)`);
            
            // للأسف SDK لا يدعم تحديد البيئة في backend بشكل مباشر
            // سنستخدم طريقة بديلة: نقرأ من Production ونفترض أن Test فارغة
            // أو يمكن للمستخدم استخدام tools مباشرة
            throw new Error('Backend functions cannot directly read from Test database. Please use the read_entities tool with data_env="dev" and then create_entity_records with data_env="prod" from the chat interface.');
            
        } catch (error) {
            console.error('Error reading test books:', error.message);
            throw error;
        }
        
        if (!testBooks || testBooks.length === 0) {
            return Response.json({ 
                success: true, 
                message: 'لا توجد كتب في قاعدة Test للنقل',
                count: 0
            });
        }

        console.log(`Found ${testBooks.length} books in Test database`);

        // تحضير البيانات للنقل (إزالة الحقول التي لا نحتاجها)
        const booksToMigrate = testBooks.map(book => {
            const bookData = { ...book.data };
            // إزالة أي حقول قد تسبب مشاكل
            delete bookData.id;
            delete bookData.created_date;
            delete bookData.updated_date;
            delete bookData.created_by;
            return bookData;
        });

        // النقل على دفعات (100 كتاب في كل دفعة)
        const batchSize = 100;
        let totalMigrated = 0;
        const results = [];

        for (let i = 0; i < booksToMigrate.length; i += batchSize) {
            const batch = booksToMigrate.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, ${batch.length} books`);
            
            try {
                await base44.asServiceRole.entities.Book.bulkCreate(batch);
                totalMigrated += batch.length;
                console.log(`Batch ${Math.floor(i / batchSize) + 1} succeeded`);
                results.push({
                    batch: Math.floor(i / batchSize) + 1,
                    count: batch.length,
                    status: 'success'
                });
            } catch (error) {
                console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
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
            message: `تم نقل ${totalMigrated} كتاب من Test إلى Production`,
            totalBooks: testBooks.length,
            totalMigrated,
            batches: results
        });

    } catch (error) {
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});