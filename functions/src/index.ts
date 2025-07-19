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

// Morning notification (8:00 AM European time)
export const morningNotification = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('Europe/Madrid')
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

// Afternoon reminder (1:00 PM European time)
export const afternoonReminder = functions.pubsub
  .schedule('0 13 * * *')
  .timeZone('Europe/Madrid')
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

// Evening summary (6:00 PM European time)
export const eveningSummary = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Europe/Madrid')
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
  .schedule('0 9,15 * * *') // 9 AM and 3 PM daily
  .timeZone('Europe/Madrid')
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