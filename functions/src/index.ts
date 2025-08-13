import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// reCAPTCHA Enterprise verification function
async function verifyRecaptchaToken(token: string, expectedAction: string): Promise<boolean> {
  try {
    const projectId = 'todo-tracker-2ec93';
    const siteKey = '6LczPKArAAAAAH2S3TlJq0bbSVuaEmNnLsFeqeDf';
    
    // Try API key authentication first (recommended for this use case)
    const apiKey = functions.config().recaptcha?.api_key;
    
    if (!apiKey) {
      console.error('reCAPTCHA API key not configured. Please run: npx firebase-tools functions:config:set recaptcha.api_key="YOUR_API_KEY"');
      return false;
    }
    
    
    const requestBody = {
      event: {
        token: token,
        expectedAction: expectedAction,
        siteKey: siteKey
      }
    };
    
    console.log('Making reCAPTCHA Enterprise API request:', {
      projectId,
      expectedAction,
      tokenLength: token.length
    });
    
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('reCAPTCHA API request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return false;
    }
    
    const data = await response.json();
    
    console.log('reCAPTCHA Enterprise verification result:', {
      tokenProperties: data.tokenProperties,
      riskAnalysis: data.riskAnalysis,
      expectedAction
    });
    
    // Check if token is valid and action matches
    if (data.tokenProperties?.valid && data.tokenProperties?.action === expectedAction) {
      // Check the risk score (0.0 to 1.0, higher is better)
      const score = data.riskAnalysis?.score || 0;
      console.log(`reCAPTCHA score: ${score}`);
      
      // You can adjust this threshold based on your needs
      return score >= 0.5;
    }
    
    console.log('reCAPTCHA verification failed:', {
      valid: data.tokenProperties?.valid,
      action: data.tokenProperties?.action,
      expectedAction,
      reasons: data.tokenProperties?.invalidReason
    });
    
    return false;
  } catch (error) {
    console.error('Error verifying reCAPTCHA token:', error);
    return false;
  }
}

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

// Helper function to validate and sanitize email address
function validateAndSanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  // Remove any whitespace and convert to lowercase
  const cleaned = email.trim().toLowerCase();
  
  // Basic email validation regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(cleaned)) {
    console.log(`Invalid email format: ${cleaned}`);
    return null;
  }
  
  // Additional security checks
  if (cleaned.length > 254) { // RFC 5321 limit
    console.log(`Email too long: ${cleaned.length} characters`);
    return null;
  }
  
  return cleaned;
}

// Helper function to extract user ID from email address
function extractUserIdFromEmail(emailAddress: string): string | null {
  const sanitizedEmail = validateAndSanitizeEmail(emailAddress);
  if (!sanitizedEmail) {
    return null;
  }
  
  // Expected format: userId@tasks.yourdomain.com or userId@sandbox...mailgun.org
  const match = sanitizedEmail.match(/^([^@]+)@/);
  if (!match) {
    return null;
  }
  
  // Return the original case-sensitive user ID
  return match[1];
}

// Helper function to sanitize and validate subject
function sanitizeSubject(subject: string): string {
  if (!subject || typeof subject !== 'string') {
    return 'Email Task';
  }
  
  // Remove dangerous characters and limit length
  const cleaned = subject
    .replace(/[<>]/g, '') // Remove potential HTML/script tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .substring(0, 200); // Limit length
  
  return cleaned || 'Email Task';
}

// Helper function to sanitize text content
function sanitizeTextContent(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove dangerous characters, decode HTML entities, and limit length
  const cleaned = text
    .replace(/[<>]/g, '') // Remove potential HTML/script tags
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim()
    .substring(0, 5000); // Limit length to prevent abuse
  
  return cleaned;
}

// Helper function to parse email content
function parseEmailToTask(email: EmailMessage): EmailTask {
  // Sanitize and clean up subject line (remove Fwd:, Re:, etc.)
  const rawSubject = sanitizeSubject(email.subject || '');
  const cleanSubject = rawSubject
    .replace(/^(Fwd|Re|Fw|Forward|Reply):\s*/i, '')
    .trim() || 'Email Task';
  
  // Extract due date from subject (e.g., "Meeting tomorrow", "Due: 2024-01-15")
  const dueDate = extractDueDateFromSubject(cleanSubject);
  
  // Extract priority from subject (e.g., "URGENT:", "HIGH:", "LOW:")
  const importance = extractImportanceFromSubject(cleanSubject);
  
  // Clean up and sanitize email body
  const rawBody = email.text || email.html || '';
  const cleanedBody = cleanEmailBody(rawBody);
  const description = sanitizeTextContent(cleanedBody);
  
  // Sanitize sender email
  const sanitizedSender = validateAndSanitizeEmail(email.from) || 'unknown@sender.com';
  
  console.log('Parsed email task:', {
    originalSubject: email.subject?.substring(0, 50),
    cleanSubject: cleanSubject.substring(0, 50),
    descriptionLength: description.length,
    importance,
    dueDate: dueDate?.toISOString(),
    senderValid: !!validateAndSanitizeEmail(email.from)
  });
  
  return {
    title: cleanSubject,
    description: description || 'No description provided',
    area: 'inbox',
    importance: Math.max(1, Math.min(10, importance || 5)), // Ensure importance is between 1-10
    dueDate,
    emailSource: {
      sender: sanitizedSender,
      receivedAt: email.receivedAt,
      originalSubject: rawSubject
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
    
    // Initialize email data variables
    let from: string | undefined, to: string | undefined, subject: string | undefined, text: string | undefined, html: string | undefined;
    
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
      console.log('Array type check passed, proceeding with array processing...');
      
      // For small arrays, try to find email data in each item
      if (parsedBody.length <= 100) {
        console.log('Small array detected, searching for email data...');
        
        // Look for email data in each array item
        for (let i = 0; i < parsedBody.length; i++) {
          const item = parsedBody[i];
          
          if (item && typeof item === 'object' && 
              (item.from || item.to || item.subject || item.sender || item.recipient)) {
            console.log(`Found email data in array item ${i}`);
            parsedBody = item;
            break;
          } else if (item && typeof item === 'string') {
            // Try to parse string items as JSON
            try {
              const parsed = JSON.parse(item);
              if (parsed && typeof parsed === 'object' && 
                  (parsed.from || parsed.to || parsed.subject || parsed.sender || parsed.recipient)) {
                console.log(`Found email data in parsed string item ${i}`);
                parsedBody = parsed;
                break;
              }
            } catch (e) {
              // Not JSON, continue
            }
          }
        }
      } else {
        // For large arrays (forwarded email content), try to extract email headers
        console.log('Large array detected - likely forwarded email content, extracting headers...');
        console.log('Array length is:', parsedBody.length, 'which is > 100, so using large array processing...');
        
        // Convert array to string and search for email headers
        try {
          const arrayStr = JSON.stringify(parsedBody);
          
          // Extract email headers using regex patterns
          const fromMatch = arrayStr.match(/"from":\s*"([^"]+)"/i);
          const toMatch = arrayStr.match(/"to":\s*"([^"]+)"/i);
          const subjectMatch = arrayStr.match(/"subject":\s*"([^"]+)"/i);
          const bodyPlainMatch = arrayStr.match(/"body-plain":\s*"([^"]+)"/i);
          const bodyHtmlMatch = arrayStr.match(/"body-html":\s*"([^"]+)"/i);
          
          if (fromMatch) from = fromMatch[1];
          if (toMatch) to = toMatch[1];
          if (subjectMatch) subject = subjectMatch[1];
          if (bodyPlainMatch) text = bodyPlainMatch[1];
          if (bodyHtmlMatch) html = bodyHtmlMatch[1];
          
          console.log('Email header extraction results:', { 
            from: !!from, 
            to: !!to, 
            subject: !!subject, 
            textLength: text?.length,
            htmlLength: html?.length
          });
          
          if (from && to && subject) {
            console.log('Successfully extracted email data from forwarded content');
          }
        } catch (error) {
          console.error('Error extracting email headers from large array:', error);
        }
      }
    }
    
    // If body is an object with numeric keys (array-like), coerce and extract
    if (!Array.isArray(parsedBody) && parsedBody && typeof parsedBody === 'object') {
      const objectKeys = Object.keys(parsedBody);
      const numericKeys = objectKeys.filter(k => /^\d+$/.test(k));
      if (numericKeys.length > 0 && numericKeys.length >= Math.floor(objectKeys.length * 0.5)) {
        console.log('Array-like object detected with numeric keys:', numericKeys.length);
        try {
          const orderedItems = numericKeys
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => (parsedBody as any)[k]);

          // Scan items for email-like objects or parsable strings
          for (let i = 0; i < orderedItems.length; i++) {
            const item = orderedItems[i];
            if (item && typeof item === 'object') {
              // Direct headers
              if (item.headers && typeof item.headers === 'object') {
                const hdrs = item.headers as Record<string, unknown>;
                if ((hdrs.from || hdrs.to || hdrs.subject)) {
                  from = typeof hdrs.from === 'string' ? hdrs.from : from;
                  to = typeof hdrs.to === 'string' ? hdrs.to : to;
                  subject = typeof hdrs.subject === 'string' ? hdrs.subject : subject;
                  console.log(`Found headers in array-like item ${i}`);
                  break;
                }
              }
              // Message.headers (Mailgun storage message object)
              if (item.message && typeof item.message === 'object') {
                const msg = item.message;
                if (msg.headers && typeof msg.headers === 'object') {
                  const hdrs = msg.headers as Record<string, unknown>;
                  from = typeof hdrs.from === 'string' ? hdrs.from : from;
                  to = typeof hdrs.to === 'string' ? hdrs.to : to;
                  subject = typeof hdrs.subject === 'string' ? hdrs.subject : subject;
                  console.log(`Found message.headers in array-like item ${i}`);
                  break;
                }
                if (typeof msg["body-plain"] === 'string') {
                  text = msg["body-plain"];
                }
                if (typeof msg["body-html"] === 'string') {
                  html = msg["body-html"];
                }
              }
              // Direct fields
              if ((item.from || item.to || item.subject)) {
                from = typeof item.from === 'string' ? item.from : from;
                to = typeof item.to === 'string' ? item.to : to;
                subject = typeof item.subject === 'string' ? item.subject : subject;
                console.log(`Found direct fields in array-like item ${i}`);
                break;
              }
            } else if (item && typeof item === 'string') {
              // Try to parse stringified JSON
              try {
                const parsed = JSON.parse(item);
                if (parsed && typeof parsed === 'object') {
                  if (parsed.headers && typeof parsed.headers === 'object') {
                    const hdrs = parsed.headers as Record<string, unknown>;
                    from = typeof hdrs.from === 'string' ? hdrs.from : from;
                    to = typeof hdrs.to === 'string' ? hdrs.to : to;
                    subject = typeof hdrs.subject === 'string' ? hdrs.subject : subject;
                    console.log(`Found headers in parsed string item ${i}`);
                    break;
                  }
                  if (parsed.message && parsed.message.headers && typeof parsed.message.headers === 'object') {
                    const hdrs = parsed.message.headers as Record<string, unknown>;
                    from = typeof hdrs.from === 'string' ? hdrs.from : from;
                    to = typeof hdrs.to === 'string' ? hdrs.to : to;
                    subject = typeof hdrs.subject === 'string' ? hdrs.subject : subject;
                    console.log(`Found message.headers in parsed string item ${i}`);
                    break;
                  }
                  // Body fields
                  if (typeof parsed["body-plain"] === 'string') {
                    text = parsed["body-plain"];
                  }
                  if (typeof parsed["body-html"] === 'string') {
                    html = parsed["body-html"];
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }

          console.log('Array-like extraction results:', { hasFrom: !!from, hasTo: !!to, hasSubject: !!subject, textLength: text?.length, htmlLength: html?.length });
        } catch (e) {
          console.error('Failed processing array-like object payload:', e);
        }
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
      
      // Check if we have a massive array (common with certain Mailgun webhook formats)
      if (Array.isArray(parsedBody) && parsedBody.length > 1000) {
        console.log(`Massive array detected with ${parsedBody.length} items. Implementing smart parsing...`);
        
        // For massive arrays, we need to be smart about parsing to avoid timeouts
        // Sample different parts of the array to find email data
        const sampleSize = Math.min(1000, Math.floor(parsedBody.length / 10));
        const samples = [];
        
        // Take samples from beginning, middle, and end
        for (let i = 0; i < sampleSize; i += 100) {
          samples.push(parsedBody[i]);
        }
        for (let i = Math.floor(parsedBody.length / 2); i < Math.floor(parsedBody.length / 2) + sampleSize && i < parsedBody.length; i += 100) {
          samples.push(parsedBody[i]);
        }
        for (let i = Math.max(0, parsedBody.length - sampleSize); i < parsedBody.length; i += 100) {
          samples.push(parsedBody[i]);
        }
        
        console.log(`Sampling ${samples.length} items from array`);
        
        // Look for email data in samples
        let emailFound = false;
        for (const item of samples) {
          if (item && typeof item === 'string') {
            // Try to parse as JSON if it's a string
            try {
              const parsed = JSON.parse(item);
              if (parsed && typeof parsed === 'object') {
                if (parsed.from || parsed.to || parsed.subject || parsed.sender || parsed.recipient) {
                  console.log('Found email data in parsed JSON sample');
                  parsedBody = parsed;
                  emailFound = true;
                  break;
                }
              }
            } catch (e) {
              // Not JSON, continue
            }
            
            // Check if the string contains email patterns
            if (item.includes('@') && (item.includes('subject') || item.includes('from') || item.includes('to'))) {
              console.log('Found email patterns in string sample');
              // Try to extract using regex
              const fromMatch = item.match(/(?:"from"|from):\s*"?([^",\n]+@[^",\n]+)"?/i);
              const toMatch = item.match(/(?:"to"|to):\s*"?([^",\n]+@[^",\n]+)"?/i);
              const subjectMatch = item.match(/(?:"subject"|subject):\s*"([^"]+)"/i);
              
              if (fromMatch) from = fromMatch[1].trim();
              if (toMatch) to = toMatch[1].trim();
              if (subjectMatch) subject = subjectMatch[1].trim();
              
              if (from && to && subject) {
                console.log('Successfully extracted email data from string sample');
                emailFound = true;
                break;
              }
            }
          } else if (item && typeof item === 'object') {
            // Check if this object has email data
            if (item.from || item.to || item.subject || item.sender || item.recipient) {
              console.log('Found email data in object sample');
              parsedBody = item;
              emailFound = true;
              break;
            }
          }
        }
        
        if (!emailFound) {
          // Last resort: convert entire array to string and use regex (risky for large arrays)
          console.log('No email data found in samples, trying full array regex search...');
          try {
            // Only do this for arrays smaller than 10k items to avoid memory issues
            if (parsedBody.length < 10000) {
              const arrayStr = JSON.stringify(parsedBody);
              const fromMatch = arrayStr.match(/"from":\s*"([^"]+@[^"]+)"/);
              const toMatch = arrayStr.match(/"to":\s*"([^"]+@[^"]+)"/);
              const subjectMatch = arrayStr.match(/"subject":\s*"([^"]+)"/);
              
              if (fromMatch) from = fromMatch[1];
              if (toMatch) to = toMatch[1];
              if (subjectMatch) subject = subjectMatch[1];
              
              console.log('Regex extraction results:', { from: !!from, to: !!to, subject: !!subject });
            } else {
              console.log('Array too large for full regex search, skipping...');
            }
          } catch (error) {
            console.error('Error in full array regex search:', error);
          }
        }
      }
      
      // If parsedBody was updated from array processing, try standard extraction
      if (!from && !to && !subject && parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
        console.log('Trying standard extraction on processed body...');
        from = parsedBody.sender || parsedBody.from;
        to = parsedBody.recipient || parsedBody.to;
        subject = parsedBody.subject;
        text = parsedBody['body-plain'] || parsedBody['stripped-text'] || parsedBody['body'] || parsedBody.text;
        html = parsedBody['body-html'] || parsedBody['stripped-html'] || parsedBody.html;
      }
      
      // Final fallback: look for common email fields in the entire body
      if (!from && !to && !subject) {
        console.log('Final fallback: searching for email patterns in body...');
        const bodyStr = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody).substring(0, 50000); // Limit to avoid memory issues
        
        // More comprehensive regex patterns
        const patterns = {
          from: [
            /"from":\s*"([^"]+@[^"]+)"/i,
            /"sender":\s*"([^"]+@[^"]+)"/i,
            /from:\s*([^,\s\n]+@[^,\s\n]+)/i,
            /sender:\s*([^,\s\n]+@[^,\s\n]+)/i
          ],
          to: [
            /"to":\s*"([^"]+@[^"]+)"/i,
            /"recipient":\s*"([^"]+@[^"]+)"/i,
            /to:\s*([^,\s\n]+@[^,\s\n]+)/i,
            /recipient:\s*([^,\s\n]+@[^,\s\n]+)/i
          ],
          subject: [
            /"subject":\s*"([^"]+)"/i,
            /subject:\s*([^\n\r]+)/i
          ]
        };
        
        // Try each pattern
        for (const fromPattern of patterns.from) {
          const match = bodyStr.match(fromPattern);
          if (match) {
            from = match[1].trim();
            break;
          }
        }
        
        for (const toPattern of patterns.to) {
          const match = bodyStr.match(toPattern);
          if (match) {
            to = match[1].trim();
            break;
          }
        }
        
        for (const subjectPattern of patterns.subject) {
          const match = bodyStr.match(subjectPattern);
          if (match) {
            subject = match[1].trim();
            break;
          }
        }
        
        // Try to find body content
        if (!text && !html) {
          const bodyPatterns = [
            /"body-plain":\s*"([^"]+)"/,
            /"stripped-text":\s*"([^"]+)"/,
            /"body":\s*"([^"]+)"/,
            /"text":\s*"([^"]+)"/
          ];
          
          for (const bodyPattern of bodyPatterns) {
            const match = bodyStr.match(bodyPattern);
            if (match) {
              text = match[1];
              break;
            }
          }
        }
      }
      
      console.log('All available fields (first 20):', Object.keys(parsedBody || {}).slice(0, 20));
      console.log('Extracted from fallback:', { 
        from: from ? `${from.substring(0, 20)}...` : undefined, 
        to: to ? `${to.substring(0, 20)}...` : undefined, 
        subject: subject ? `${subject.substring(0, 30)}...` : undefined, 
        textLength: text?.length, 
        htmlLength: html?.length 
      });
    }
    
    // Sanitize and validate extracted email data
    const sanitizedFrom = validateAndSanitizeEmail(from || '');
    const sanitizedTo = validateAndSanitizeEmail(to || '');
    const sanitizedSubject = sanitizeSubject(subject || '');
    const sanitizedText = sanitizeTextContent(text || '');
    const sanitizedHtml = sanitizeTextContent(html || '');
    
    console.log('Extracted and sanitized email data:', { 
      from: sanitizedFrom ? `${sanitizedFrom.substring(0, 20)}...` : null, 
      to: sanitizedTo ? `${sanitizedTo.substring(0, 20)}...` : null, 
      subject: sanitizedSubject ? `${sanitizedSubject.substring(0, 30)}...` : null, 
      textLength: sanitizedText?.length || 0,
      htmlLength: sanitizedHtml?.length || 0,
      textPreview: sanitizedText?.substring(0, 50),
      isForwarded: sanitizedSubject?.toLowerCase().includes('fwd') || sanitizedSubject?.toLowerCase().includes('forward')
    });
    
    if (!sanitizedFrom || !sanitizedTo || !sanitizedSubject) {
      console.log('Missing or invalid required fields after sanitization:', { 
        from: sanitizedFrom ? 'valid' : 'invalid', 
        to: sanitizedTo ? 'valid' : 'invalid', 
        subject: sanitizedSubject ? 'valid' : 'invalid' 
      });
      res.status(400).json({
        success: false,
        error: 'Missing or invalid required email fields',
        details: {
          from: !sanitizedFrom ? 'missing or invalid' : 'ok',
          to: !sanitizedTo ? 'missing or invalid' : 'ok',
          subject: !sanitizedSubject ? 'missing or invalid' : 'ok'
        }
      });
      return;
    }
    
    // Extract user ID from email address using sanitized data
    const userId = extractUserIdFromEmail(sanitizedTo);
    console.log('Extracted user ID:', userId);
    
    if (!userId) {
      console.log('Invalid email format:', sanitizedTo);
      res.status(400).json({
        success: false,
        error: 'Invalid email address format',
        details: { email: sanitizedTo }
      });
      return;
    }
    
    // Check if user exists (try case-sensitive first, then case-insensitive)
    let userDoc;
    let actualUserId = userId;
    
    try {
      // First try exact match
      userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        console.log('User not found with exact case, trying case-insensitive search...');
        
        // Try case-insensitive search
        const usersSnapshot = await db.collection('users').get();
        const matchingUser = usersSnapshot.docs.find(doc => 
          doc.id.toLowerCase() === userId.toLowerCase()
        );
        
        if (matchingUser) {
          actualUserId = matchingUser.id;
          userDoc = matchingUser;
          console.log('Found user with case-insensitive match:', actualUserId);
        } else {
          console.log('User not found with case-insensitive search:', userId);
          res.status(404).json({
            success: false,
            error: 'User not found',
            details: { 
              requestedUserId: userId,
              availableUsers: usersSnapshot.docs.map(doc => doc.id).slice(0, 5) // Show first 5 for debugging
            }
          });
          return;
        }
      }
    } catch (error) {
      console.error('Error checking user existence:', error);
      res.status(500).json({
        success: false,
        error: 'Database error while checking user',
        details: { userId }
      });
      return;
    }
    
    console.log('User found, creating task...');
    
    // Parse email to task using sanitized data
    let emailTask;
    try {
      emailTask = parseEmailToTask({
        from: sanitizedFrom,
        to: sanitizedTo,
        subject: sanitizedSubject,
        text: sanitizedText,
        html: sanitizedHtml,
        receivedAt: new Date()
      });
    } catch (error) {
      console.error('Error parsing email to task:', error);
      res.status(500).json({
        success: false,
        error: 'Error parsing email content',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      return;
    }
    
    console.log('Email task parsed:', {
      title: emailTask.title.substring(0, 50),
      descriptionLength: emailTask.description.length,
      area: emailTask.area,
      importance: emailTask.importance,
      dueDate: emailTask.dueDate?.toISOString()
    });
    
          // Create task in Firestore with comprehensive error handling
      try {
        const taskData = {
          ...emailTask,
          dateNoted: admin.firestore.FieldValue.serverTimestamp(),
          status: 'open' as const,
          userId: actualUserId // Use the case-corrected user ID
        };
      
      // Remove undefined values to avoid Firestore errors
      Object.keys(taskData).forEach(key => {
        if ((taskData as any)[key] === undefined) {
          delete (taskData as any)[key];
        }
      });
      
      // Validate task data before saving
      if (!taskData.title || taskData.title.trim().length === 0) {
        throw new Error('Task title is required');
      }
      
      if (typeof taskData.importance !== 'number' || taskData.importance < 1 || taskData.importance > 10) {
        throw new Error('Task importance must be a number between 1 and 10');
      }
      
      if (!taskData.area || typeof taskData.area !== 'string') {
        throw new Error('Task area is required');
      }
      
      console.log('Creating task in Firestore...');
      const taskRef = await db
        .collection('users')
        .doc(actualUserId) // Use the case-corrected user ID
        .collection('tasks')
        .add(taskData);
      
      console.log(`Task created successfully from email for user ${actualUserId}:`, taskRef.id);
      
      // Send confirmation response
      res.status(200).json({
        success: true,
        taskId: taskRef.id,
        message: 'Task created successfully from email',
        taskData: {
          title: taskData.title,
          area: taskData.area,
          importance: taskData.importance,
          status: taskData.status
        }
      });
      
    } catch (error) {
      console.error('Error creating task in Firestore:', error);
      
      // Determine error type and send appropriate response
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          res.status(403).json({
            success: false,
            error: 'Permission denied while creating task',
            details: { userId, message: error.message }
          });
        } else if (error.message.includes('quota') || error.message.includes('limit')) {
          res.status(429).json({
            success: false,
            error: 'Database quota exceeded',
            details: { userId, message: error.message }
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Failed to create task in database',
            details: { userId, message: error.message }
          });
        }
      } else {
        res.status(500).json({
          success: false,
          error: 'Unknown error while creating task',
          details: { userId }
        });
      }
      return;
    }
    
  } catch (error) {
    console.error('Unexpected error processing email task:', error);
    
    // Send structured error response
    res.status(500).json({
      success: false,
      error: 'Internal server error while processing email',
      details: {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Function to verify reCAPTCHA tokens
export const verifyRecaptcha = functions.https.onCall(async (data, context) => {
  const { token, action } = data;
  
  if (!token || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'Token and action are required');
  }
  
  try {
    const isValid = await verifyRecaptchaToken(token, action);
    
    if (!isValid) {
      throw new functions.https.HttpsError('permission-denied', 'reCAPTCHA verification failed');
    }
    
    return { success: true, message: 'reCAPTCHA verified successfully' };
  } catch (error) {
    console.error('Error in reCAPTCHA verification function:', error);
    throw new functions.https.HttpsError('internal', 'Failed to verify reCAPTCHA');
  }
}); 