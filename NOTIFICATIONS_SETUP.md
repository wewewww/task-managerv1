# 🔔 Push Notifications Setup Guide

This guide will help you set up push notifications for your Task Manager app.

## 📋 Prerequisites

1. Firebase project with Firestore and Authentication enabled
2. Firebase CLI installed (`npm install -g firebase-tools`)
3. Node.js 18+ for Firebase Functions

## 🚀 Setup Steps

### 1. Firebase Project Configuration

1. **Enable Firebase Cloud Messaging (FCM)**
   - Go to Firebase Console → Project Settings → Cloud Messaging
   - Generate a new Web Push certificate
   - Copy the VAPID key

2. **Add VAPID Key to Environment**
   - Create `.env.local` file in the root directory
   - Add: `NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key_here`

### 2. Firebase Functions Setup

1. **Install Dependencies**
   ```bash
   cd functions
   npm install
   ```

2. **Build Functions**
   ```bash
   npm run build
   ```

3. **Deploy Functions**
   ```bash
   firebase deploy --only functions
   ```

### 3. Firestore Security Rules

Make sure your `firestore.rules` includes rules for the `users` collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Allow access to user's tasks and categories
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### 4. Deploy Firestore Rules and Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 🔔 Notification Features

### **Instant Notifications**
- ✅ New task created with due date = today/tomorrow
- ✅ Task status changes (completed, reopened)

### **Scheduled Notifications**
- 🌅 **8:00 AM**: Daily summary of today's tasks
- ☀️ **1:00 PM**: Reminder of incomplete today's tasks  
- 🌙 **6:00 PM**: Today's pending + tomorrow's tasks
- ⚠️ **9:00 AM & 3:00 PM**: Overdue task alerts

### **Notification Types**
- **Browser Notifications**: Immediate, when app is open
- **Firebase Cloud Messaging**: Background notifications, works when app is closed

## 🛠️ Testing Notifications

### 1. Browser Notifications
- Open the app in a modern browser
- Allow notifications when prompted
- Create a task with today's or tomorrow's due date
- You should see an instant notification

### 2. Scheduled Notifications
- Deploy Firebase Functions
- Wait for scheduled times (8 AM, 1 PM, 6 PM European time)
- Or test manually by calling the functions

### 3. Manual Testing
You can test the functions manually in Firebase Console:
1. Go to Firebase Console → Functions
2. Find the function (e.g., `morningNotification`)
3. Click "Test function"
4. Use this test data: `{}`

## 🔧 Troubleshooting

### Common Issues

1. **"Notifications not supported"**
   - Ensure you're using HTTPS or localhost
   - Check browser permissions

2. **"No FCM token"**
   - Verify VAPID key is correct
   - Check browser console for errors
   - Ensure Firebase Functions are deployed

3. **Scheduled notifications not working**
   - Check Firebase Functions logs
   - Verify timezone settings (Europe/Madrid)
   - Ensure functions are deployed successfully

4. **Permission denied errors**
   - Check Firestore security rules
   - Verify user authentication

### Debug Steps

1. **Check Browser Console**
   ```javascript
   // Test notification permission
   console.log('Notification permission:', Notification.permission);
   
   // Test FCM token
   const messaging = getMessaging();
   getToken(messaging).then(token => console.log('FCM token:', token));
   ```

2. **Check Firebase Functions Logs**
   ```bash
   firebase functions:log
   ```

3. **Test Individual Functions**
   ```bash
   firebase functions:shell
   morningNotification()
   ```

## 📱 Mobile Support

The notification system works on:
- ✅ Desktop browsers (Chrome, Firefox, Safari, Edge)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)
- ✅ Progressive Web App (PWA) mode

## 🔄 Updating Notifications

To modify notification behavior:

1. **Edit Functions**: Modify `functions/src/index.ts`
2. **Edit Client**: Modify `src/lib/notificationService.ts`
3. **Deploy**: `firebase deploy --only functions`

## 📊 Monitoring

Monitor notification delivery in:
- Firebase Console → Analytics → Events
- Firebase Console → Functions → Logs
- Browser Developer Tools → Application → Service Workers

## 🎯 Next Steps

After setup, consider:
- [ ] Add notification preferences UI
- [ ] Implement quiet hours
- [ ] Add notification history
- [ ] Custom notification sounds
- [ ] Rich notifications with actions

---

**Need help?** Check the Firebase documentation or create an issue in the project repository. 