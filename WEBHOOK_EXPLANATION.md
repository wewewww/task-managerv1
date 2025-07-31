# Mailgun Webhook Explanation

## 🔄 **How Mailgun Webhooks Work**

### **What is a Webhook?**
A webhook is like a **messenger** that automatically sends data from one service to another when something happens.

### **Mailgun → Firebase Function Flow**

#### **1. Email Arrives at Mailgun**
```
User sends email to: john.doe@tasks.yourdomain.com
Mailgun receives it and processes it
```

#### **2. Mailgun Triggers Webhook**
Mailgun automatically sends a **POST request** to your Firebase function with this data:

```json
{
  "event-data": {
    "event": "delivered",
    "timestamp": 1642248600,
    "message": {
      "headers": {
        "from": "sender@example.com",
        "to": "john.doe@tasks.yourdomain.com",
        "subject": "URGENT: Meeting tomorrow"
      },
      "body-plain": "Please prepare the quarterly report.",
      "body-html": "<p>Please prepare the quarterly report.</p>"
    }
  }
}
```

#### **3. Your Firebase Function Processes It**
Your function extracts the important parts:
- **From**: `sender@example.com`
- **To**: `john.doe@tasks.yourdomain.com` 
- **Subject**: `URGENT: Meeting tomorrow`
- **Body**: `Please prepare the quarterly report.`

#### **4. Task Gets Created**
- User ID extracted: `john.doe`
- Due date detected: `tomorrow`
- Priority detected: `URGENT` (importance 9)
- Task created in database

### **Webhook Configuration in Mailgun**

In your Mailgun dashboard:
```
Event: delivered
URL: https://us-central1-todo-tracker-2ec93.cloudfunctions.net/processEmailTask
Method: POST
```

### **Testing Your Webhook**

You can test if your webhook is working by:

1. **Send a test email** to your task address
2. **Check Mailgun logs** - see if webhook was sent
3. **Check Firebase logs** - see if function received it
4. **Check your app** - see if task was created

### **Common Webhook Issues**

- **404 Error**: Firebase function URL is wrong
- **401 Error**: Authentication issue
- **500 Error**: Function has an error (check logs)
- **No webhook sent**: Email didn't reach Mailgun

### **Monitoring Webhooks**

- **Mailgun Dashboard**: See webhook delivery status
- **Firebase Console**: See function execution logs
- **Your App**: See if tasks are being created 