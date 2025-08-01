/* eslint-disable @typescript-eslint/no-explicit-any */
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { app } from './firebase';
import { Task } from '../types/task';

// Notification types
export type NotificationType = 
  | 'task_created_today'
  | 'task_created_tomorrow' 
  | 'daily_summary_morning'
  | 'daily_reminder_afternoon'
  | 'daily_summary_evening'
  | 'overdue_tasks';

interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

class NotificationService {
  private messaging: any; // Firebase messaging type
  private isSupported: boolean;
  private permission: NotificationPermission = 'default';

  constructor() {
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window;
    this.messaging = null;
    
    // Initialize Firebase messaging if available (client-side only)
    if (typeof window !== 'undefined') {
      try {
        this.messaging = getMessaging(app);
      } catch (error) {
        console.log('Firebase messaging not available:', error);
      }
    }
  }

  // Request notification permission
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported) {
      console.log('Notifications not supported');
      return false;
    }

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  // Check if notifications are enabled
  isEnabled(): boolean {
    return this.isSupported && this.permission === 'granted';
  }

  // Send browser notification
  async sendBrowserNotification(data: NotificationData): Promise<void> {
    if (!this.isEnabled()) {
      console.log('Notifications not enabled');
      return;
    }

    try {
      const notification = new Notification(data.title, {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag,
        data: data.data,
        requireInteraction: false,
        silent: false
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Handle click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Error sending browser notification:', error);
    }
  }

  // Get Firebase messaging token
  async getFCMToken(): Promise<string | null> {
    if (!this.messaging) return null;

    try {
      const token = await getToken(this.messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      });
      
      // Save token to database if we have a user
      if (token) {
        await this.saveFCMToken(token);
      }
      
      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  // Save FCM token to database
  private async saveFCMToken(token: string): Promise<void> {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const updateFCMToken = httpsCallable(functions, 'updateFCMToken');
      
      await updateFCMToken({ token });
      console.log('FCM token saved to database');
    } catch (error) {
      console.error('Error saving FCM token:', error);
    }
  }

  // Setup FCM message listener
  setupFCMListener(callback: (payload: MessagePayload) => void): void {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
      console.log('FCM message received:', payload);
      callback(payload);
    });
  }

  // Check if task is due today or tomorrow
  isTaskDueSoon(task: Task): boolean {
    if (!task.dueDate) return false;
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const taskDate = new Date(task.dueDate);
    
    // Reset time to compare dates only
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
    
    return taskDateOnly.getTime() === todayDate.getTime() || 
           taskDateOnly.getTime() === tomorrowDate.getTime();
  }

  // Check if task is overdue
  isTaskOverdue(task: Task): boolean {
    if (!task.dueDate || task.status === 'complete') return false;
    
    const today = new Date();
    const taskDate = new Date(task.dueDate);
    
    return taskDate < today;
  }

  // Send instant notification for new task
  async notifyTaskCreated(task: Task): Promise<void> {
    if (!this.isTaskDueSoon(task)) return;

    const isToday = new Date(task.dueDate!).toDateString() === new Date().toDateString();
    const dueText = isToday ? 'today' : 'tomorrow';
    
    await this.sendBrowserNotification({
      title: 'New Task Due Soon',
      body: `"${task.title}" is due ${dueText}`,
      tag: 'task_created',
      data: { taskId: task.id, type: 'task_created' }
    });
  }

  // Send daily summary notification
  async sendDailySummary(tasks: Task[], type: 'morning' | 'afternoon' | 'evening'): Promise<void> {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let relevantTasks: Task[] = [];
    let title = '';
    let body = '';

    switch (type) {
      case 'morning':
        // Today's tasks
        relevantTasks = tasks.filter(task => 
          task.dueDate && 
          new Date(task.dueDate).toDateString() === today.toDateString() &&
          task.status === 'open'
        );
        title = 'Good Morning! Here\'s your day ahead';
        break;
        
      case 'afternoon':
        // Today's incomplete tasks
        relevantTasks = tasks.filter(task => 
          task.dueDate && 
          new Date(task.dueDate).toDateString() === today.toDateString() &&
          task.status === 'open'
        );
        title = 'Afternoon Check-in';
        break;
        
      case 'evening':
        // Today's pending + tomorrow's tasks
        const todayTasks = tasks.filter(task => 
          task.dueDate && 
          new Date(task.dueDate).toDateString() === today.toDateString() &&
          task.status === 'open'
        );
        const tomorrowTasks = tasks.filter(task => 
          task.dueDate && 
          new Date(task.dueDate).toDateString() === tomorrow.toDateString() &&
          task.status === 'open'
        );
        relevantTasks = [...todayTasks, ...tomorrowTasks];
        title = 'Evening Summary';
        break;
    }

    if (relevantTasks.length === 0) {
      body = 'No tasks due! Great job staying on top of things.';
    } else {
      const taskList = relevantTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
      const remaining = relevantTasks.length > 3 ? ` and ${relevantTasks.length - 3} more` : '';
      body = `${relevantTasks.length} task${relevantTasks.length > 1 ? 's' : ''} to complete:\n${taskList}${remaining}`;
    }

    await this.sendBrowserNotification({
      title,
      body,
      tag: `daily_summary_${type}`,
      data: { type: `daily_summary_${type}`, taskCount: relevantTasks.length }
    });
  }

  // Send overdue tasks notification
  async sendOverdueNotification(tasks: Task[]): Promise<void> {
    const overdueTasks = tasks.filter(task => this.isTaskOverdue(task));
    
    if (overdueTasks.length === 0) return;

    const title = 'Overdue Tasks Alert';
    const taskList = overdueTasks.slice(0, 3).map(task => `• ${task.title}`).join('\n');
    const remaining = overdueTasks.length > 3 ? ` and ${overdueTasks.length - 3} more` : '';
    const body = `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}:\n${taskList}${remaining}`;

    await this.sendBrowserNotification({
      title,
      body,
      tag: 'overdue_tasks',
      data: { type: 'overdue_tasks', taskCount: overdueTasks.length }
    });
  }

  // Setup scheduled notifications (to be called from a service worker or server)
  setupScheduledNotifications(): void {
    // This will be implemented with Firebase Functions or service worker
    // For now, we'll use client-side scheduling
    this.scheduleDailyNotifications();
  }

  // Schedule daily notifications (client-side)
  private scheduleDailyNotifications(): void {
    const now = new Date();
    const europeTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    
    // Schedule for 8:00 AM, 1:00 PM, and 6:00 PM European time
    const times = [
      { hour: 8, minute: 0, type: 'morning' as const },
      { hour: 13, minute: 0, type: 'afternoon' as const },
      { hour: 18, minute: 0, type: 'evening' as const }
    ];

    times.forEach(({ hour, minute, type }) => {
      const scheduledTime = new Date(europeTime);
      scheduledTime.setHours(hour, minute, 0, 0);
      
      // If time has passed today, schedule for tomorrow
      if (scheduledTime <= europeTime) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      
      const delay = scheduledTime.getTime() - europeTime.getTime();
      
      setTimeout(() => {
        // This will be replaced with actual task data
        this.sendDailySummary([], type);
        // Re-schedule for next day
        this.scheduleDailyNotifications();
      }, delay);
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService(); 