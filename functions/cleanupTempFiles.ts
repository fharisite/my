import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // حذف الملفات المؤقتة من مجلد /tmp
    let deletedCount = 0;
    const tempDir = '/tmp';
    
    try {
      // التحقق من وجود المجلد
      const dirInfo = await Deno.stat(tempDir);
      
      if (dirInfo.isDirectory) {
        // قراءة محتويات المجلد
        for await (const entry of Deno.readDir(tempDir)) {
          try {
            const filePath = `${tempDir}/${entry.name}`;
            const fileInfo = await Deno.stat(filePath);
            
            // حذف الملفات الأقدم من 24 ساعة
            const fileAge = Date.now() - fileInfo.mtime.getTime();
            const hoursOld = fileAge / (1000 * 60 * 60);
            
            if (hoursOld > 24 || entry.name.includes('temp_') || entry.name.includes('tmp_')) {
              if (entry.isFile) {
                await Deno.remove(filePath);
                deletedCount++;
              } else if (entry.isDirectory) {
                await Deno.remove(filePath, { recursive: true });
                deletedCount++;
              }
            }
          } catch (error) {
            console.error(`Error deleting ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      // المجلد قد لا يكون موجوداً أو فارغ
      console.log('No temp directory or empty:', error);
    }

    return Response.json({
      success: true,
      message: deletedCount > 0 
        ? `تم حذف ${deletedCount} ملف مؤقت`
        : 'لا توجد ملفات مؤقتة للحذف',
      deleted_count: deletedCount
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});