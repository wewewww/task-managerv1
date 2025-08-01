import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

interface Task {
  id: string;
  title: string;
  dueDate: string;
  status: 'open' | 'complete';
  importance: number;
  area: string;
  userId: string;
}

interface User {
  uid: string;
  fcmToken?: string;
  email?: string;
  displayName?: string;
}

// Helper function to get tasks for a specific date
async function getTasksForDate(userId: string, date: Date): Promise<Task[]> {
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
    
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
}

// Helper function to get overdue tasks
async function getOverdueTasks(userId: string): Promise<Task[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('tasks')
    .where('dueDate', '<', today.toISOString())
    .where('status', '==', 'open')
    .get();
    
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
}

// Helper function to send notification to user
async function sendNotificationToUser(userId: string, title: string, body: string, data?: any) {
  try {
    // Get user's FCM token
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() as User;
    
    if (!userData?.fcmToken) {
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
          priority: 'high' as const,
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
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
  }
}

// Morning notification (8:00 AM Paris time)
export const morningNotification = functions.pubsub
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
          await sendNotificationToUser(
            userId,
            'Good Morning! 🌅',
            'No tasks due today. Enjoy your day!',
            { type: 'morning_summary', taskCount: 0 }
          );
        } else {
          // Tasks due today
          const taskList = openTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
          const remaining = openTasks.length > 3 ? ` and ${openTasks.length - 3} more` : '';
          
          await sendNotificationToUser(
            userId,
            'Good Morning! Here\'s your day ahead 🌅',
            `${openTasks.length} task${openTasks.length > 1 ? 's' : ''} due today:\n${taskList}${remaining}`,
            { type: 'morning_summary', taskCount: openTasks.length }
          );
        }
      }
      
      console.log('Morning notifications completed');
    } catch (error) {
      console.error('Error in morning notification:', error);
    }
  });

// Afternoon reminder (1:00 PM Paris time)
export const afternoonReminder = functions.pubsub
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
          
          await sendNotificationToUser(
            userId,
            'Afternoon Check-in ☀️',
            `${incompleteTasks.length} task${incompleteTasks.length > 1 ? 's' : ''} still pending:\n${taskList}${remaining}`,
            { type: 'afternoon_reminder', taskCount: incompleteTasks.length }
          );
        }
      }
      
      console.log('Afternoon reminders completed');
    } catch (error) {
      console.error('Error in afternoon reminder:', error);
    }
  });

// Evening summary (6:00 PM Paris time)
export const eveningSummary = functions.pubsub
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
          await sendNotificationToUser(
            userId,
            'Evening Summary 🌙',
            'All caught up! No pending tasks for today or tomorrow.',
            { type: 'evening_summary', taskCount: 0 }
          );
        } else {
          const taskList = allPending.slice(0, 3).map(task => `• ${task.title}`).join('\n');
          const remaining = allPending.length > 3 ? ` and ${allPending.length - 3} more` : '';
          
          const summary = pendingToday.length > 0 && tomorrowOpen.length > 0 
            ? `${pendingToday.length} pending today, ${tomorrowOpen.length} due tomorrow`
            : pendingToday.length > 0 
            ? `${pendingToday.length} pending today`
            : `${tomorrowOpen.length} due tomorrow`;
          
          await sendNotificationToUser(
            userId,
            'Evening Summary 🌙',
            `${summary}:\n${taskList}${remaining}`,
            { type: 'evening_summary', taskCount: allPending.length }
          );
        }
      }
      
      console.log('Evening summaries completed');
    } catch (error) {
      console.error('Error in evening summary:', error);
    }
  });

// Function to update user's FCM token
export const updateFCMToken = functions.https.onCall(async (data, context) => {
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
  } catch (error) {
    console.error(`Error updating FCM token for user ${userId}:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to update FCM token');
  }
});

// Function to send overdue task notifications
export const checkOverdueTasks = functions.pubsub
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
          
          await sendNotificationToUser(
            userId,
            'Overdue Tasks Alert ⚠️',
            `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}:\n${taskList}${remaining}`,
            { type: 'overdue_alert', taskCount: overdueTasks.length }
          );
        }
      }
      
      console.log('Overdue task check completed');
    } catch (error) {
      console.error('Error checking overdue tasks:', error);
    }
  });

// Email processing interfaces
interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  receivedAt: Date;
}

interface EmailTask {
  title: string;
  description: string;
  area: string;
  importance: number;
  dueDate?: Date;
  emailSource: {
    sender: string;
    receivedAt: Date;
    originalSubject: string;
  };
}

// Helper function to extract user ID from email address
function extractUserIdFromEmail(emailAddress: string): string | null {
  // Expected format: userId@tasks.yourdomain.com
  const match = emailAddress.match(/^([^@]+)@/);
  return match ? match[1] : null;
}

// Helper function to parse email content
function parseEmailToTask(email: EmailMessage): EmailTask {
  // Clean up subject line (remove Fwd:, Re:, etc.)
  const cleanSubject = email.subject
    ?.replace(/^(Fwd|Re|Fw|Forward|Reply):\s*/i, '')
    ?.trim() || 'Email Task';
  
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
function extractDueDateFromSubject(subject: string): Date | undefined {
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
function extractImportanceFromSubject(subject: string): number {
  if (subject.match(/urgent|asap|immediate/i)) return 9;
  if (subject.match(/high|important/i)) return 7;
  if (subject.match(/low|minor/i)) return 3;
  return 5; // Default importance
}

// Helper function to clean email body
function cleanEmailBody(body: string): string {
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
export const processEmailTask = functions.https.onRequest(async (req, res) => {
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
    console.log('=== EMAIL WEBHOOK RECEIVED ===');
    console.log('Request method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body type:', typeof req.body);
    
    // Handle different content types and body formats
    let parsedBody = req.body;
    
    // If body is a string, try to parse it as JSON
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
        console.log('Parsed string body as JSON');
      } catch (e) {
        console.log('Failed to parse body as JSON, treating as string');
        parsedBody = req.body;
      }
    }
    
    // If body is an array (common with some webhook formats), try to extract data
    if (Array.isArray(parsedBody)) {
      console.log('Body is an array with length:', parsedBody.length);
      // Try to find email data in the array
      const emailData = parsedBody.find(item => 
        item && typeof item === 'object' && 
        (item.from || item.to || item.subject || item.sender || item.recipient)
      );
      if (emailData) {
        parsedBody = emailData;
        console.log('Found email data in array');
      }
    }
    
    console.log('Parsed body keys:', Object.keys(parsedBody || {}));
    
    // Log the full body in a more readable way (limit to first 10 keys to avoid spam)
    if (parsedBody && typeof parsedBody === 'object') {
      console.log('Full webhook body (first 10 keys):');
      const keys = Object.keys(parsedBody);
      keys.slice(0, 10).forEach(key => {
        const value = parsedBody[key];
        if (typeof value === 'object') {
          console.log(`  ${key}:`, JSON.stringify(value, null, 2));
        } else {
          console.log(`  ${key}:`, value);
        }
      });
      if (keys.length > 10) {
        console.log(`  ... and ${keys.length - 10} more keys`);
      }
    }
    
    // Handle Mailgun webhook format
    let from, to, subject, text, html;
    
    console.log('=== EXTRACTING EMAIL DATA ===');
    console.log('Has event-data:', !!parsedBody['event-data']);
    console.log('Has recipient:', !!parsedBody.recipient);
    console.log('Has sender:', !!parsedBody.sender);
    console.log('Has from:', !!parsedBody.from);
    console.log('Has to:', !!parsedBody.to);
    console.log('Has subject:', !!parsedBody.subject);
    
    if (parsedBody['event-data'] && parsedBody['event-data'].message) {
      // Mailgun webhook format (event-data)
      console.log('Using event-data format');
      const message = parsedBody['event-data'].message;
      console.log('Message keys:', Object.keys(message || {}));
      
      from = message.headers?.from || message.from;
      to = message.headers?.to || message.to;
      subject = message.headers?.subject || message.subject;
      text = message['body-plain'] || message['stripped-text'] || message['body'];
      html = message['body-html'] || message['stripped-html'];
      
      console.log('Extracted from event-data:', { from, to, subject, textLength: text?.length, htmlLength: html?.length });
      
    } else if (parsedBody.recipient) {
      // Mailgun webhook format (direct)
      console.log('Using recipient format');
      from = parsedBody.sender || parsedBody.from;
      to = parsedBody.recipient || parsedBody.to;
      subject = parsedBody.subject;
      text = parsedBody['body-plain'] || parsedBody['stripped-text'] || parsedBody['body'] || parsedBody.text;
      html = parsedBody['body-html'] || parsedBody['stripped-html'] || parsedBody.html;
      
      console.log('Extracted from recipient format:', { from, to, subject, textLength: text?.length, htmlLength: html?.length });
      
    } else if (parsedBody.from || parsedBody.to || parsedBody.subject) {
      // Simple format (for testing)
      console.log('Using simple format');
      from = parsedBody.from;
      to = parsedBody.to;
      subject = parsedBody.subject;
      text = parsedBody.text || parsedBody['body-plain'] || parsedBody['stripped-text'];
      html = parsedBody.html || parsedBody['body-html'] || parsedBody['stripped-html'];
      
      console.log('Extracted from simple format:', { from, to, subject, textLength: text?.length, htmlLength: html?.length });
      
    } else {
      // Try to extract from any available fields
      console.log('Trying to extract from any available fields...');
      console.log('All available fields:', Object.keys(parsedBody));
      
      // Look for common email fields in the entire body
      const bodyStr = JSON.stringify(parsedBody);
      const fromMatch = bodyStr.match(/"from":\s*"([^"]+)"/);
      const toMatch = bodyStr.match(/"to":\s*"([^"]+)"/);
      const subjectMatch = bodyStr.match(/"subject":\s*"([^"]+)"/);
      
      from = fromMatch ? fromMatch[1] : undefined;
      to = toMatch ? toMatch[1] : undefined;
      subject = subjectMatch ? subjectMatch[1] : undefined;
      
      // Try to find body content
      text = parsedBody['body-plain'] || parsedBody['stripped-text'] || parsedBody['body'] || parsedBody.text || '';
      html = parsedBody['body-html'] || parsedBody['stripped-html'] || parsedBody.html || '';
      
      // If we still don't have data and the body is a large array, try to find email data in the array
      if (!from && !to && !subject && Array.isArray(parsedBody) && parsedBody.length > 1000) {
        console.log('Large array detected, searching for email data...');
        
        // Look for email-like patterns in the array
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const subjectPattern = /"subject":\s*"([^"]+)"/;
        const fromPattern = /"from":\s*"([^"]+)"/;
        const toPattern = /"to":\s*"([^"]+)"/;
        
        // Convert array to string and search for patterns
        const arrayStr = JSON.stringify(parsedBody);
        
        const emailMatch = arrayStr.match(emailPattern);
        const subjectMatch = arrayStr.match(subjectPattern);
        const fromMatch = arrayStr.match(fromPattern);
        const toMatch = arrayStr.match(toPattern);
        
        if (emailMatch) {
          console.log('Found email address in array:', emailMatch[0]);
        }
        if (subjectMatch) {
          subject = subjectMatch[1];
          console.log('Found subject in array:', subject);
        }
        if (fromMatch) {
          from = fromMatch[1];
          console.log('Found from in array:', from);
        }
        if (toMatch) {
          to = toMatch[1];
          console.log('Found to in array:', to);
        }
        
        // Try to extract body content from the array
        const bodyMatch = arrayStr.match(/"body-plain":\s*"([^"]+)"/);
        if (bodyMatch) {
          text = bodyMatch[1];
          console.log('Found body content in array, length:', text.length);
        }
      }
      
      console.log('Extracted from fallback:', { from, to, subject, textLength: text?.length, htmlLength: html?.length });
    }
    
    console.log('Extracted email data:', { 
      from, 
      to, 
      subject, 
      textLength: text?.length || 0,
      htmlLength: html?.length || 0,
      textPreview: text?.substring(0, 100),
      isForwarded: subject?.toLowerCase().includes('fwd') || subject?.toLowerCase().includes('forward')
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
    const taskData = {
      ...emailTask,
      dateNoted: admin.firestore.FieldValue.serverTimestamp(),
      status: 'open',
      userId
    };
    
    // Remove undefined values to avoid Firestore errors
    Object.keys(taskData).forEach(key => {
      if ((taskData as any)[key] === undefined) {
        delete (taskData as any)[key];
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
    
  } catch (error) {
    console.error('Error processing email task:', error);
    res.status(500).send('Internal server error');
  }
}); 