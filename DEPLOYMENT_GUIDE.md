# 🚀 Deployment Guide - Task Manager Alpha

This guide will help you deploy your Task Manager app to production.

## 📋 Prerequisites

1. **GitHub account** (for code repository)
2. **Vercel account** (free at vercel.com)
3. **Firebase project** (already configured)
4. **Domain name** (optional, for custom URL)

## 🎯 Recommended Platform: Vercel

**Why Vercel?**
- ✅ Perfect for Next.js apps
- ✅ Zero configuration deployment
- ✅ Free tier with generous limits
- ✅ Automatic HTTPS and CDN
- ✅ Custom domains support
- ✅ Environment variables management
- ✅ Preview deployments for testing

## 📁 Files to Deploy

### **Essential Files (Include in Repository):**
```
todo-tracker/
├── src/                    # ✅ Source code
├── public/                 # ✅ Static assets
├── package.json            # ✅ Dependencies
├── package-lock.json       # ✅ Lock file
├── next.config.js          # ✅ Next.js config
├── tailwind.config.js      # ✅ Tailwind config
├── tsconfig.json           # ✅ TypeScript config
├── firestore.rules         # ✅ Firestore security rules
├── firestore.indexes.json  # ✅ Firestore indexes
├── firebase.json           # ✅ Firebase config
├── .gitignore             # ✅ Git ignore rules
└── functions/              # ✅ Firebase Functions
```

### **Files to Exclude (Don't Deploy):**
```
todo-tracker/
├── .next/                  # ❌ Build output (auto-generated)
├── node_modules/           # ❌ Dependencies (auto-installed)
├── .env.local              # ❌ Local environment (use Vercel env vars)
├── .env.example            # ❌ Example file (optional)
└── *.log                   # ❌ Log files
```

## 🔧 Deployment Steps

### **Step 1: Prepare Repository**

1. **Initialize Git** (if not already done):
   ```bash
   cd todo-tracker
   git init
   git add .
   git commit -m "Initial commit - Task Manager Alpha"
   ```

2. **Create .gitignore** (if not exists):
   ```bash
   # Dependencies
   node_modules/
   
   # Next.js build output
   .next/
   out/
   
   # Environment variables
   .env.local
   .env.development.local
   .env.test.local
   .env.production.local
   
   # Logs
   npm-debug.log*
   yarn-debug.log*
   yarn-error.log*
   
   # IDE files
   .vscode/
   .idea/
   
   # OS files
   .DS_Store
   Thumbs.db
   ```

3. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/yourusername/task-manager.git
   git branch -M main
   git push -u origin main
   ```

### **Step 2: Deploy Firebase Functions**

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Deploy Functions**:
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions
   ```

4. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

### **Step 3: Deploy to Vercel**

1. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `todo-tracker` (if in subfolder)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)

3. **Set Environment Variables**:
   In Vercel dashboard → Project Settings → Environment Variables:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCFQT6t4WuaPi9kChmB-3BEp8M82B16XOM
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=todo-tracker-2ec93.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=todo-tracker-2ec93
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=todo-tracker-2ec93.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=254870563973
   NEXT_PUBLIC_FIREBASE_APP_ID=1:254870563973:web:630b0a2cae7f4a6326cdec
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key_here
   ```

4. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-project.vercel.app`

### **Step 4: Configure Custom Domain (Optional)**

1. **Add Domain**:
   - Vercel Dashboard → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **SSL Certificate**:
   - Vercel automatically provides SSL
   - No additional configuration needed

## 🔔 Notification Setup (Post-Deployment)

### **1. Get VAPID Key**:
1. Firebase Console → Project Settings → Cloud Messaging
2. Generate Web Push certificate
3. Copy VAPID key
4. Add to Vercel environment variables

### **2. Test Notifications**:
1. Visit your deployed app
2. Sign in with Google
3. Allow notifications when prompted
4. Create a task with today's date
5. Verify instant notification appears

## 📊 Monitoring & Analytics

### **Vercel Analytics**:
- Built-in performance monitoring
- Real-time metrics
- Error tracking

### **Firebase Analytics**:
- User engagement
- Feature usage
- Error reporting

## 🔧 Troubleshooting

### **Common Issues**:

1. **Build Failures**:
   - Check build logs in Vercel
   - Verify all dependencies in package.json
   - Ensure TypeScript compilation passes

2. **Environment Variables**:
   - Verify all Firebase config variables are set
   - Check variable names match exactly
   - Redeploy after adding new variables

3. **Firebase Functions**:
   - Check Firebase Functions logs
   - Verify functions are deployed successfully
   - Test functions manually in Firebase Console

4. **Notifications Not Working**:
   - Verify VAPID key is set correctly
   - Check browser console for errors
   - Ensure HTTPS is enabled (required for notifications)

### **Debug Commands**:
```bash
# Test build locally
npm run build

# Test production build
npm run start

# Check Firebase Functions
firebase functions:log

# Test Firestore rules
firebase emulators:start
```

## 🎯 Post-Deployment Checklist

- [ ] App loads without errors
- [ ] Google authentication works
- [ ] Tasks can be created, edited, deleted
- [ ] Categories work properly
- [ ] Notifications are enabled
- [ ] Firebase Functions are deployed
- [ ] Firestore rules are active
- [ ] Custom domain is configured (if applicable)
- [ ] SSL certificate is active
- [ ] Analytics are tracking

## 🚀 Next Steps

After successful deployment:
1. **Share the URL** with alpha testers
2. **Monitor performance** and errors
3. **Collect feedback** from users
4. **Plan beta features** based on feedback
5. **Consider Google Calendar integration** for v2.0

---

**Need help?** Check Vercel documentation or Firebase Console for detailed logs. 