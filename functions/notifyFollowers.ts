import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { event, data } = await req.json();

        if (event.type !== 'create') {
            return Response.json({ success: true, message: 'Not a create event' });
        }

        const book = data;
        
        if (!book || !book.id) {
            return Response.json({ success: false, error: 'Invalid book data' });
        }

        const notifications = [];

        // Notify author followers
        if (book.author_id) {
            const authorFollows = await base44.asServiceRole.entities.AuthorFollow.filter({ 
                author_id: book.author_id 
            });

            for (const follow of authorFollows) {
                notifications.push({
                    user_email: follow.follower_email,
                    type: 'new_book_author',
                    title: 'كتاب جديد من مؤلف تتابعه',
                    message: `تم نشر كتاب جديد "${book.title}" من المؤلف ${book.author_name}`,
                    book_id: book.id,
                    is_read: false
                });
            }
        }

        // Notify publisher followers
        if (book.publisher_id) {
            const publisherFollows = await base44.asServiceRole.entities.PublisherFollow.filter({ 
                publisher_id: book.publisher_id 
            });

            for (const follow of publisherFollows) {
                notifications.push({
                    user_email: follow.follower_email,
                    type: 'new_book_publisher',
                    title: 'كتاب جديد من ناشر تتابعه',
                    message: `تم نشر كتاب جديد "${book.title}" من دار ${book.publisher_name}`,
                    book_id: book.id,
                    is_read: false
                });
            }
        }

        // Create notifications
        if (notifications.length > 0) {
            await base44.asServiceRole.entities.Notification.bulkCreate(notifications);
        }

        return Response.json({ 
            success: true, 
            notificationsCreated: notifications.length 
        });

    } catch (error) {
        console.error('Error in notifyFollowers:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});