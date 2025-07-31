# Testing Email-to-Task System

## 🧪 **How to Test Your Email System**

### **Prerequisites**
- Mailgun account set up
- Domain configured in Mailgun
- Webhook pointing to Firebase function
- User account in your app

### **Step 1: Get Your Task Email Address**
1. Open your app
2. Click the 📧 button in the header
3. Copy your unique email address (e.g., `user123@tasks.yourdomain.com`)

### **Step 2: Send Test Emails**

#### **Test 1: Basic Task Creation**
```
To: user123@tasks.yourdomain.com
Subject: Review project proposal
Body: Need to review the Q1 project proposal by Friday.
```
**Expected Result**: Task created with default importance (5), no due date

#### **Test 2: Priority Detection**
```
To: user123@tasks.yourdomain.com
Subject: URGENT: Server down - fix immediately
Body: The production server is down. Please fix as soon as possible.
```
**Expected Result**: Task with importance 9, "URGENT" detected

#### **Test 3: Due Date Detection**
```
To: user123@tasks.yourdomain.com
Subject: Team meeting tomorrow
Body: Weekly team sync meeting at 10 AM.
```
**Expected Result**: Task with due date set to tomorrow

#### **Test 4: Complex Email**
```
To: user123@tasks.yourdomain.com
Subject: HIGH: Due: 2024-01-20 - Client presentation
Body: Prepare presentation for ABC Corp client meeting.
Include quarterly results and next steps.
```
**Expected Result**: 
- Importance: 7 (HIGH detected)
- Due Date: January 20, 2024
- Description: Cleaned email body

### **Step 3: Monitor the Process**

#### **A. Check Mailgun Logs**
1. Go to Mailgun dashboard
2. Navigate to "Logs" section
3. Look for your test emails
4. Check webhook delivery status

#### **B. Check Firebase Function Logs**
```bash
npx firebase-tools functions:log
```
Look for:
- `Task created from email for user user123`
- Any error messages

#### **C. Check Your App**
1. Refresh your app
2. Look for new tasks in "Inbox" category
3. Check task details for email source information

### **Step 4: Troubleshooting**

#### **Common Issues:**

**Issue**: Email not creating tasks
**Check**:
- Mailgun webhook URL is correct
- Firebase function is deployed
- User ID in email address exists in database

**Issue**: Tasks created but wrong data
**Check**:
- Email parsing logic in Firebase function
- Subject line format
- Email body content

**Issue**: Webhook not receiving emails
**Check**:
- Mailgun domain configuration
- DNS records are correct
- Webhook is active in Mailgun

### **Step 5: Advanced Testing**

#### **Test Email Formats**
```
# HTML Email
Subject: <strong>Important</strong> meeting
Body: <p>Meeting details</p>

# Email with Attachments
Subject: Project files
Body: Please review attached documents

# Email with Signature
Subject: Weekly update
Body: Here's the weekly update.
--
John Doe
CEO, Company Inc.
```

#### **Test Edge Cases**
```
# Very Long Subject
Subject: This is a very long subject line that might exceed normal limits and could cause issues with parsing or display in the task management system

# Special Characters
Subject: Meeting @ 2PM - Bring 📊 & 💡

# Multiple Priority Words
Subject: URGENT HIGH PRIORITY meeting
```

## 🔍 **Monitoring Tools**

### **Mailgun Dashboard**
- **Logs**: See all incoming emails
- **Webhooks**: Monitor webhook delivery
- **Analytics**: Email delivery rates

### **Firebase Console**
- **Functions**: Monitor function executions
- **Logs**: Detailed function logs
- **Firestore**: See created tasks

### **Your App**
- **Task List**: See created tasks
- **Inbox Category**: All email tasks
- **Task Details**: Email source information

## 📊 **Expected Results**

### **Successful Email Processing**
```
✅ Email received by Mailgun
✅ Webhook sent to Firebase function
✅ User validated in database
✅ Task created in Firestore
✅ Task appears in app
✅ Email source tracked
```

### **Failed Email Processing**
```
❌ Email rejected by Mailgun (spam, invalid domain)
❌ Webhook failed to deliver
❌ User not found in database
❌ Function error (check logs)
❌ Task not created
```

## 🚀 **Production Readiness Checklist**

- [ ] Mailgun domain configured
- [ ] DNS records propagated
- [ ] Webhook active and tested
- [ ] Firebase function deployed
- [ ] User accounts exist
- [ ] Test emails working
- [ ] Error handling verified
- [ ] Monitoring set up 