import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // التحقق من صلاحيات المدير
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { startIndex = 0, batchSize = 50 } = await req.json();

        console.log(`Starting batch migration from index ${startIndex} with batch size ${batchSize}...`);

        // استخدام حل عملي: نستخدم الـ tool من المحادثة
        // هذه الدالة مجرد helper للإشارة للمستخدم
        return Response.json({
            success: false,
            message: 'Please use the chat interface to migrate books. Backend functions cannot directly access Test database.',
            instructions: 'Use read_entities with data_env="dev" then create_entity_records with data_env="prod"'
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});