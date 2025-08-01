"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processEmailTask = exports.checkOverdueTasks = exports.updateFCMToken = exports.eveningSummary = exports.afternoonReminder = exports.morningNotification = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// Helper function to get tasks for a specific date
async function getTasksForDate(userId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('tasks')
        .where('dueDate', '>=', startOfDay.toISOString())
        .where('dueDate', '<=', endOfDay.toISOString())
        .get();
    return snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
}
// Helper function to get overdue tasks
async function getOverdueTasks(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('tasks')
        .where('dueDate', '<', today.toISOString())
        .where('status', '==', 'open')
        .get();
    return snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
}
// Helper function to send notification to user
async function sendNotificationToUser(userId, title, body, data) {
    try {
        // Get user's FCM token
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (!(userData === null || userData === void 0 ? void 0 : userData.fcmToken)) {
            console.log(`No FCM token for user ${userId}`);
            return;
        }
        const message = {
            token: userData.fcmToken,
            notification: {
                title,
                body,
            },
            data: data || {},
            android: {
                notification: {
                    sound: 'default',
                    priority: 'high',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        };
        const response = await messaging.send(message);
        console.log(`Notification sent to user ${userId}:`, response);
    }
    catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
    }
}
// Morning notification (8:00 AM Paris time)
exports.morningNotification = functions.pubsub
    .schedule('0 8 * * *')
    .timeZone('Europe/Paris')
    .onRun(async (context) => {
    console.log('Running morning notification...');
    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            // Get today's tasks
            const today = new Date();
            const todayTasks = await getTasksForDate(userId, today);
            const openTasks = todayTasks.filter(task => task.status === 'open');
            if (openTasks.length === 0) {
                // No tasks today
                await sendNotificationToUser(userId, 'Good Morning! 🌅', 'No tasks due today. Enjoy your day!', { type: 'morning_summary', taskCount: 0 });
            }
            else {
                // Tasks due today
                const taskList = openTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
                const remaining = openTasks.length > 3 ? ` and ${openTasks.length - 3} more` : '';
                await sendNotificationToUser(userId, 'Good Morning! Here\'s your day ahead 🌅', `${openTasks.length} task${openTasks.length > 1 ? 's' : ''} due today:\n${taskList}${remaining}`, { type: 'morning_summary', taskCount: openTasks.length });
            }
        }
        console.log('Morning notifications completed');
    }
    catch (error) {
        console.error('Error in morning notification:', error);
    }
});
// Afternoon reminder (1:00 PM Paris time)
exports.afternoonReminder = functions.pubsub
    .schedule('0 13 * * *')
    .timeZone('Europe/Paris')
    .onRun(async (context) => {
    console.log('Running afternoon reminder...');
    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            // Get today's incomplete tasks
            const today = new Date();
            const todayTasks = await getTasksForDate(userId, today);
            const incompleteTasks = todayTasks.filter(task => task.status === 'open');
            if (incompleteTasks.length > 0) {
                const taskList = incompleteTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
                const remaining = incompleteTasks.length > 3 ? ` and ${incompleteTasks.length - 3} more` : '';
                await sendNotificationToUser(userId, 'Afternoon Check-in ☀️', `${incompleteTasks.length} task${incompleteTasks.length > 1 ? 's' : ''} still pending:\n${taskList}${remaining}`, { type: 'afternoon_reminder', taskCount: incompleteTasks.length });
            }
        }
        console.log('Afternoon reminders completed');
    }
    catch (error) {
        console.error('Error in afternoon reminder:', error);
    }
});
// Evening summary (6:00 PM Paris time)
exports.eveningSummary = functions.pubsub
    .schedule('0 18 * * *')
    .timeZone('Europe/Paris')
    .onRun(async (context) => {
    console.log('Running evening summary...');
    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            // Get today's pending tasks
            const today = new Date();
            const todayTasks = await getTasksForDate(userId, today);
            const pendingToday = todayTasks.filter(task => task.status === 'open');
            // Get tomorrow's tasks
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowTasks = await getTasksForDate(userId, tomorrow);
            const tomorrowOpen = tomorrowTasks.filter(task => task.status === 'open');
            const allPending = [...pendingToday, ...tomorrowOpen];
            if (allPending.length === 0) {
                await sendNotificationToUser(userId, 'Evening Summary 🌙', 'All caught up! No pending tasks for today or tomorrow.', { type: 'evening_summary', taskCount: 0 });
            }
            else {
                const taskList = allPending.slice(0, 3).map(task => `• ${task.title}`).join('\n');
                const remaining = allPending.length > 3 ? ` and ${allPending.length - 3} more` : '';
                const summary = pendingToday.length > 0 && tomorrowOpen.length > 0
                    ? `${pendingToday.length} pending today, ${tomorrowOpen.length} due tomorrow`
                    : pendingToday.length > 0
                        ? `${pendingToday.length} pending today`
                        : `${tomorrowOpen.length} due tomorrow`;
                await sendNotificationToUser(userId, 'Evening Summary 🌙', `${summary}:\n${taskList}${remaining}`, { type: 'evening_summary', taskCount: allPending.length });
            }
        }
        console.log('Evening summaries completed');
    }
    catch (error) {
        console.error('Error in evening summary:', error);
    }
});
// Function to update user's FCM token
exports.updateFCMToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { token } = data;
    const userId = context.auth.uid;
    if (!token) {
        throw new functions.https.HttpsError('invalid-argument', 'FCM token is required');
    }
    try {
        await db.collection('users').doc(userId).set({
            fcmToken: token,
            lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`FCM token updated for user ${userId}`);
        return { success: true };
    }
    catch (error) {
        console.error(`Error updating FCM token for user ${userId}:`, error);
        throw new functions.https.HttpsError('internal', 'Failed to update FCM token');
    }
});
// Function to send overdue task notifications
exports.checkOverdueTasks = functions.pubsub
    .schedule('0 9 * * *') // 9 AM daily only
    .timeZone('Europe/Paris')
    .onRun(async (context) => {
    console.log('Checking for overdue tasks...');
    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            // Get overdue tasks
            const overdueTasks = await getOverdueTasks(userId);
            if (overdueTasks.length > 0) {
                const taskList = overdueTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
                const remaining = overdueTasks.length > 3 ? ` and ${overdueTasks.length - 3} more` : '';
                await sendNotificationToUser(userId, 'Overdue Tasks Alert ⚠️', `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}:\n${taskList}${remaining}`, { type: 'overdue_alert', taskCount: overdueTasks.length });
            }
        }
        console.log('Overdue task check completed');
    }
    catch (error) {
        console.error('Error checking overdue tasks:', error);
    }
});
// Helper function to extract user ID from email address
function extractUserIdFromEmail(emailAddress) {
    // Expected format: userId@tasks.yourdomain.com
    const match = emailAddress.match(/^([^@]+)@/);
    return match ? match[1] : null;
}
// Helper function to parse email content
function parseEmailToTask(email) {
    var _a, _b;
    // Clean up subject line (remove Fwd:, Re:, etc.)
    const cleanSubject = ((_b = (_a = email.subject) === null || _a === void 0 ? void 0 : _a.replace(/^(Fwd|Re|Fw|Forward|Reply):\s*/i, '')) === null || _b === void 0 ? void 0 : _b.trim()) || 'Email Task';
    // Extract due date from subject (e.g., "Meeting tomorrow", "Due: 2024-01-15")
    const dueDate = extractDueDateFromSubject(cleanSubject);
    // Extract priority from subject (e.g., "URGENT:", "HIGH:", "LOW:")
    const importance = extractImportanceFromSubject(cleanSubject);
    // Clean up email body
    const description = cleanEmailBody(email.text || email.html || '');
    console.log('Parsed email task:', {
        originalSubject: email.subject,
        cleanSubject,
        descriptionLength: description.length,
        importance,
        dueDate
    });
    return {
        title: cleanSubject,
        description,
        area: 'inbox',
        importance: importance || 5,
        dueDate,
        emailSource: {
            sender: email.from,
            receivedAt: email.receivedAt,
            originalSubject: email.subject
        }
    };
}
// Helper function to extract due date from subject
function extractDueDateFromSubject(subject) {
    // Look for patterns like "Due: 2024-01-15", "tomorrow", "next week"
    const dueMatch = subject.match(/due:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dueMatch) {
        return new Date(dueMatch[1]);
    }
    const tomorrowMatch = subject.match(/tomorrow/i);
    if (tomorrowMatch) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }
    const nextWeekMatch = subject.match(/next week/i);
    if (nextWeekMatch) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
    }
    return undefined;
}
// Helper function to extract importance from subject
function extractImportanceFromSubject(subject) {
    if (subject.match(/urgent|asap|immediate/i))
        return 9;
    if (subject.match(/high|important/i))
        return 7;
    if (subject.match(/low|minor/i))
        return 3;
    return 5; // Default importance
}
// Helper function to clean email body
function cleanEmailBody(body) {
    // Remove HTML tags if present
    const textOnly = body.replace(/<[^>]*>/g, '');
    // Remove email headers (common in forwarded emails)
    const withoutHeaders = textOnly.replace(/^.*?(?=From:|To:|Subject:|Date:|Sent:|Cc:|Bcc:)/gim, '');
    // Remove quoted text (lines starting with >)
    const withoutQuotes = withoutHeaders.replace(/^>.*$/gm, '');
    // Remove email signatures (common patterns)
    const withoutSignature = withoutQuotes.replace(/--\s*\n.*$/m, '');
    // Remove forwarded email markers
    const withoutForwardMarkers = withoutSignature.replace(/^.*?(?=Original Message|From:|Sent:)/gim, '');
    // Remove excessive whitespace and empty lines
    const cleaned = withoutForwardMarkers
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '') // Trim each line
        .trim();
    // If we end up with very little content, try to get the first meaningful paragraph
    if (cleaned.length < 50) {
        const paragraphs = textOnly.split(/\n\s*\n/);
        const firstParagraph = paragraphs.find(p => p.trim().length > 20);
        if (firstParagraph) {
            return firstParagraph.trim() || 'No description provided';
        }
    }
    return cleaned || 'No description provided';
}
// Function to process incoming emails and create tasks
exports.processEmailTask = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c;
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    try {
        console.log('Received webhook data:', JSON.stringify(req.body, null, 2));
        // Handle Mailgun webhook format
        let from, to, subject, text, html;
        console.log('Checking webhook format...');
        console.log('Has event-data:', !!req.body['event-data']);
        console.log('Has recipient:', !!req.body.recipient);
        console.log('Available keys:', Object.keys(req.body));
        if (req.body['event-data'] && req.body['event-data'].message) {
            // Mailgun webhook format (event-data)
            console.log('Using event-data format');
            const message = req.body['event-data'].message;
            from = (_a = message.headers) === null || _a === void 0 ? void 0 : _a.from;
            to = (_b = message.headers) === null || _b === void 0 ? void 0 : _b.to;
            subject = (_c = message.headers) === null || _c === void 0 ? void 0 : _c.subject;
            text = message['body-plain'];
            html = message['body-html'];
            // For forwarded emails, try to get content from different fields
            if (!text && !html) {
                console.log('No body content found, checking alternative fields...');
                text = message['stripped-text'] || message['stripped-html'] || message['body'] || '';
                html = message['stripped-html'] || message['body-html'] || '';
            }
        }
        else if (req.body.recipient) {
            // Mailgun webhook format (direct)
            console.log('Using recipient format');
            from = req.body.sender;
            to = req.body.recipient;
            subject = req.body.subject;
            text = req.body['body-plain'];
            html = req.body['body-html'];
            // For forwarded emails, try alternative fields
            if (!text && !html) {
                console.log('No body content found, checking alternative fields...');
                text = req.body['stripped-text'] || req.body['stripped-html'] || req.body['body'] || '';
                html = req.body['stripped-html'] || req.body['body-html'] || '';
            }
        }
        else {
            // Simple format (for testing)
            console.log('Using simple format');
            from = req.body.from;
            to = req.body.to;
            subject = req.body.subject;
            text = req.body.text;
            html = req.body.html;
        }
        console.log('Extracted email data:', {
            from,
            to,
            subject,
            textLength: (text === null || text === void 0 ? void 0 : text.length) || 0,
            htmlLength: (html === null || html === void 0 ? void 0 : html.length) || 0,
            textPreview: text === null || text === void 0 ? void 0 : text.substring(0, 100),
            isForwarded: (subject === null || subject === void 0 ? void 0 : subject.toLowerCase().includes('fwd')) || (subject === null || subject === void 0 ? void 0 : subject.toLowerCase().includes('forward'))
        });
        if (!from || !to || !subject) {
            console.log('Missing required fields:', { from, to, subject });
            res.status(400).send('Missing required email fields');
            return;
        }
        // Extract user ID from email address
        const userId = extractUserIdFromEmail(to);
        console.log('Extracted user ID:', userId);
        if (!userId) {
            console.log('Invalid email format:', to);
            res.status(400).send('Invalid email address format');
            return;
        }
        // Check if user exists
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            console.log('User not found:', userId);
            res.status(404).send('User not found');
            return;
        }
        console.log('User found, creating task...');
        // Parse email to task
        const emailTask = parseEmailToTask({
            from,
            to,
            subject,
            text,
            html,
            receivedAt: new Date()
        });
        console.log('Email task parsed:', emailTask);
        // Create task in Firestore
        const taskData = Object.assign(Object.assign({}, emailTask), { dateNoted: admin.firestore.FieldValue.serverTimestamp(), status: 'open', userId });
        // Remove undefined values to avoid Firestore errors
        Object.keys(taskData).forEach(key => {
            if (taskData[key] === undefined) {
                delete taskData[key];
            }
        });
        const taskRef = await db
            .collection('users')
            .doc(userId)
            .collection('tasks')
            .add(taskData);
        console.log(`Task created from email for user ${userId}:`, taskRef.id);
        // Send confirmation response
        res.status(200).json({
            success: true,
            taskId: taskRef.id,
            message: 'Task created successfully from email'
        });
    }
    catch (error) {
        console.error('Error processing email task:', error);
        res.status(500).send('Internal server error');
    }
});
//# sourceMappingURL=index.js.map