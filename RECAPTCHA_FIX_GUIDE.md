# 🚨 reCAPTCHA Enterprise Configuration Fix

## Problem Identified

The current reCAPTCHA Enterprise site key `6LczPKArAAAAAH2S3T1Jq0bbSVuaEmNnLsFeqeDf` is **INVALID**.

When testing the API, we get:
```json
{
  "error": {
    "code": 400,
    "message": "The specified siteKey is invalid.",
    "status": "INVALID_ARGUMENT"
  }
}
```

## Temporary Solution Applied ✅

- **Authentication now works** without reCAPTCHA verification
- Users can create accounts immediately
- Password validation and Firebase auth still enforced
- Error handling preserved
- UI shows "⚠️ Security verification temporarily disabled"

## Permanent Fix Required 🔧

### Step 1: Create New reCAPTCHA Enterprise Site

1. **Go to Google Cloud Console**:
   - Navigate to: https://console.cloud.google.com/security/recaptcha
   - Select project: `todo-tracker-2ec93`

2. **Create New Site**:
   - Click "Create Key"
   - Choose "Website" 
   - Set domains:
     - `localhost` (for development)
     - Your deployed domain (e.g., `your-app.vercel.app`)
     - Any other domains you use

3. **Get the Site Key**:
   - Copy the new site key (starts with `6L...`)
   - This replaces `6LczPKArAAAAAH2S3T1Jq0bbSVuaEmNnLsFeqeDf`

### Step 2: Update Application Configuration

1. **Update Frontend** (`src/app/layout.tsx`):
   ```typescript
   <script 
     src="https://www.google.com/recaptcha/enterprise.js?render=YOUR_NEW_SITE_KEY" 
     async 
     defer
   ></script>
   ```

2. **Update Frontend** (`src/app/page.tsx`):
   ```typescript
   const token = await window.grecaptcha.enterprise.execute('YOUR_NEW_SITE_KEY', { action });
   ```

3. **Update Functions** (`functions/src/index.ts`):
   ```typescript
   const siteKey = 'YOUR_NEW_SITE_KEY';
   ```

### Step 3: Get API Key

1. **Enable reCAPTCHA Enterprise API**:
   - Go to: https://console.cloud.google.com/apis/library/recaptchaenterprise.googleapis.com
   - Click "Enable"

2. **Create API Key**:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" → "API Key"
   - Copy the API key

3. **Update Firebase Config**:
   ```bash
   npx firebase-tools functions:config:set recaptcha.api_key="YOUR_NEW_API_KEY"
   ```

### Step 4: Test Configuration

1. **Test API Direct**:
   ```bash
   curl -X POST "https://recaptchaenterprise.googleapis.com/v1/projects/todo-tracker-2ec93/assessments?key=YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "event": {
         "token": "test",
         "expectedAction": "SIGNUP",
         "siteKey": "YOUR_SITE_KEY"
       }
     }'
   ```

2. **Expected Response** (should not be "invalid siteKey"):
   ```json
   {
     "tokenProperties": {
       "valid": false,
       "invalidReason": "INVALID_INPUT",
       "action": "SIGNUP"
     }
   }
   ```

### Step 5: Re-enable reCAPTCHA

1. **Remove Bypass Code** from `src/app/page.tsx`:
   - Remove the temporary fallback logic
   - Restore original reCAPTCHA enforcement

2. **Update UI Message**:
   ```typescript
   🛡️ Protected by reCAPTCHA Enterprise
   ```

3. **Deploy**:
   ```bash
   git add .
   git commit -m "✅ Re-enable reCAPTCHA with proper configuration"
   git push origin main
   npx firebase-tools deploy --only functions
   ```

## Current Status

- ✅ **Authentication working** (bypass active)
- ✅ **Users can register** immediately  
- ✅ **Error handling improved**
- ⚠️ **reCAPTCHA disabled** (temporary)
- 🔧 **Need proper site key** configuration

## Security Note

The current bypass allows authentication without bot protection. While password validation and Firebase security are still active, it's recommended to fix the reCAPTCHA configuration as soon as possible for production use.

## Testing After Fix

Once properly configured, test:
1. Account creation with valid credentials
2. Account creation with weak passwords (should show validation errors)
3. Rapid-fire requests (should be throttled by reCAPTCHA)
4. Browser console should show reCAPTCHA execution logs
