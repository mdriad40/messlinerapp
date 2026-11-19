# Messliner — Enterprise Security Architecture & Setup Guide

This project implements a hybrid **Dual-Cloud Enterprise Security Architecture**:
- **Authentication**: **Supabase Auth** (Email/Password, OTP, Password Recovery, JWT sessions).
- **Database**: **Firebase Realtime Database (FRTDB)** (Ultra-fast real-time listeners, high capacity).
- **Serverless Cloud API Hub**: **Supabase Edge Functions** (Keeps Gemini AI Key, BulkSMSBD Credentials, and Firebase Service Account 100% secure from client browser access).

---

## 📁 Functions Summary in `/supabase/functions`

| Function Name | Purpose | Protection |
| :--- | :--- | :--- |
| **`firebase-auth-bridge`** | Mints authentic Firebase Custom Tokens for Supabase-logged-in users. | Authenticated with Supabase JWT |
| **`gemini-proxy`** | Relays AI Predictive Logistics & Expense Audit requests to Google Gemini. | Authenticated with Supabase JWT + Rate limited |
| **`send-sms`** | Securely dispatches SMS alerts via BulkSMSBD API over HTTPS. | Authenticated with Supabase JWT |

---

## 🛠️ Step-by-Step Setup Guide

### 1. Download Firebase Service Account Key
To allow Supabase to sign users into Firebase securely:
1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select your project: **`meiner-6ec2e`**.
3. Go to **Project Settings** (gear icon) ➔ **Service accounts** tab.
4. Click **Generate new private key** and download the `.json` file.
5. Open this downloaded `.json` file and copy its entire content (as a single JSON string).

---

### 2. Configure Supabase Cloud Secrets
You can set your secrets in one of two ways:

#### Option A: Via Supabase Web Dashboard (Easiest)
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/pgnjvtmofglkjplotrha).
2. Go to **Project Settings** (or Edge Functions) ➔ **Secrets**.
3. Add the following secrets:
   - `FIREBASE_SERVICE_ACCOUNT`: Paste the full JSON content from Step 1.
   - `GEMINI_API_KEY`: Paste your Google Gemini API key.
   - `SMS_API_KEY`: Paste your BulkSMSBD API key.
   - `SMS_SENDER_ID`: Paste your BulkSMSBD Sender ID (e.g. `8809648907383`).

#### Option B: Via Terminal (Supabase CLI)
```bash
# Link to your Supabase project
npx supabase link --project-ref pgnjvtmofglkjplotrha

# Set secrets
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
npx supabase secrets set GEMINI_API_KEY="your-gemini-key"
npx supabase secrets set SMS_API_KEY="your-bulksms-key"
npx supabase secrets set SMS_SENDER_ID="your-sender-id"
```

---

### 3. Deploy Supabase Edge Functions
Run the following deploy commands in your terminal from `c:\My_Programme\Messliner_deploy`:

```bash
# 1. Deploy Firebase Auth Bridge
npx supabase functions deploy firebase-auth-bridge --no-verify-jwt

# 2. Deploy Gemini AI Proxy
npx supabase functions deploy gemini-proxy --no-verify-jwt

# 3. Deploy SMS Dispatch Service
npx supabase functions deploy send-sms --no-verify-jwt
```

---

### 4. Apply Firebase Realtime Database Security Rules
Now that Firebase knows every user's actual UID through the auth bridge, lock down your database:
1. Go to [Firebase Console](https://console.firebase.google.com/) ➔ **Realtime Database** ➔ **Rules** tab.
2. Replace all existing rules with the contents of [`database.rules.json`](../database.rules.json).
3. Click **Publish**.

🎉 **Your app is now 100% secured!**
- No API keys are visible to any user or hacker in DevTools.
- Unauthenticated users cannot read or delete your Firebase database.
- Every meal entry, bazar expense, and deposit is tracked and protected by rules.
- All existing features, listeners, and UI continue to work with zero disruption!
