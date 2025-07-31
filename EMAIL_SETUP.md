# Email-to-Task Setup Guide

## 🎯 Overview
This guide will help you set up the email-to-task feature using Mailgun as the email service provider.

## ✅ What's Already Deployed
- **Firebase Function**: `processEmailTask` is live at:
  `https://us-central1-todo-tracker-2ec93.cloudfunctions.net/processEmailTask`
- **Inbox Category**: Added to the app with grey color
- **Smart Parsing**: Due dates, priority detection, email cleaning

## 📧 Step 1: Mailgun Setup

### 1.1 Create Mailgun Account
1. Go to [Mailgun.com](https://www.mailgun.com/)
2. Sign up for free account (5,000 emails/month)
3. Verify your email address

### 1.2 Add Domain
1. In Mailgun dashboard, click "Add Domain"
2. Choose "Custom Domain" (recommended) or use Mailgun's sandbox domain
3. Follow DNS setup instructions for your domain
4. Wait for domain verification (usually 24-48 hours)

### 1.3 Create Webhook
1. Go to "Webhooks" in Mailgun dashboard
2. Click "Add Webhook"
3. Configure:
   - **Event**: `delivered`
   - **URL**: `https://us-central1-todo-tracker-2ec93.cloudfunctions.net/processEmailTask`
   - **Method**: `POST`
4. Save the webhook

## 🔧 Step 2: Email Address Generation

### 2.1 User Email Format
Each user gets a unique email address:
```
{userId}@tasks.yourdomain.com
```

### 2.2 Example Addresses
- `user123@tasks.yourdomain.com`
- `john.doe@tasks.yourdomain.com`
- `project-manager@tasks.yourdomain.com`

## 📝 Step 3: Testing the Setup

### 3.1 Test Email
Send an email to a user's task address:
```
To: user123@tasks.yourdomain.com
Subject: URGENT: Meeting tomorrow at 2 PM
Body: Please prepare the quarterly report for the meeting.
```

### 3.2 Expected Result
- Task created in "Inbox" category
- Title: "URGENT: Meeting tomorrow at 2 PM"
- Due Date: Tomorrow (automatically detected)
- Importance: 9 (URGENT detected)
- Description: "Please prepare the quarterly report for the meeting."

## 🎨 Step 4: User Interface Integration

### 4.1 Display Email Source
Tasks created from emails show:
- Email sender
- Received date
- Original subject
- "Created from email" indicator

### 4.2 User Settings
Users can:
- View their unique task email address
- Copy the address to clipboard
- See email processing history

## 🔒 Step 5: Security Considerations

### 5.1 Email Validation
- Only authenticated users can create tasks
- Email addresses must match user ID format
- Rate limiting on function calls

### 5.2 Spam Protection
- Mailgun provides spam filtering
- Function validates email format
- User must exist in database

## 💰 Cost Breakdown

### Mailgun (Free Tier)
- 5,000 emails/month: $0
- Additional emails: $0.80/1,000

### Firebase Functions
- 2M invocations/month: $0
- Additional invocations: $0.40/1M

### Estimated Monthly Cost
- **Low usage** (100 emails/month): $0
- **Medium usage** (1,000 emails/month): $0
- **High usage** (10,000 emails/month): ~$8

## 🚀 Next Steps

1. **Set up Mailgun domain** (24-48 hours for DNS propagation)
2. **Configure webhook** in Mailgun dashboard
3. **Test with sample emails**
4. **Add user interface** for email addresses
5. **Monitor function logs** for any issues

## 📞 Support

If you encounter issues:
1. Check Firebase Functions logs: `npx firebase-tools functions:log`
2. Check Mailgun webhook delivery logs
3. Verify domain DNS settings
4. Test function directly with curl

## 🔄 Function Endpoint Details

**URL**: `https://us-central1-todo-tracker-2ec93.cloudfunctions.net/processEmailTask`
**Method**: POST
**Content-Type**: application/json

**Request Body**:
```json
{
  "from": "sender@example.com",
  "to": "user123@tasks.yourdomain.com",
  "subject": "Task Subject",
  "text": "Email body text",
  "html": "Email body HTML (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "taskId": "generated-task-id",
  "message": "Task created successfully from email"
}
``` 