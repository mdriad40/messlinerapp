/* =========================================================
   Messliner Environment Variables Template (Example)
   Copy this file to `js/env.js` and fill in your actual credentials.
   DO NOT COMMIT `js/env.js` WITH REAL SECRETS TO GITHUB.
   ========================================================= */

(function () {
  'use strict';

  const ENV = {
    // ── Supabase Authentication & Database ──────────────
    SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
    SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_PUBLIC_KEY",
    SUPABASE_PROJECT_REF: "YOUR_PROJECT_ID",

    // ── Primary Dining Firebase Project ─────────────────
    FIREBASE: {
      apiKey: "YOUR_FIREBASE_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT.firebasestorage.app",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_FIREBASE_APP_ID",
      measurementId: "YOUR_MEASUREMENT_ID"
    },

    // ── Admin Firebase Project for Analytics & Presence ──
    FIREBASE_ADMIN: {
      apiKey: "YOUR_ADMIN_FIREBASE_API_KEY",
      authDomain: "YOUR_ADMIN_PROJECT.firebaseapp.com",
      databaseURL: "https://YOUR_ADMIN_PROJECT-default-rtdb.firebaseio.com",
      projectId: "YOUR_ADMIN_PROJECT_ID",
      storageBucket: "YOUR_ADMIN_PROJECT.firebasestorage.app",
      messagingSenderId: "YOUR_ADMIN_MESSAGING_SENDER_ID",
      appId: "YOUR_ADMIN_FIREBASE_APP_ID"
    },

    // ── Google Gemini AI API Configuration ──────────────
    GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
    GEMINI_MODEL: "gemini-3-flash-preview",

    // ── BulkSMSBD Universal SMS Gateway Credentials ──────
    SMS_GATEWAY: {
      apiKey: "YOUR_BULKSMSBD_API_KEY",
      senderId: "YOUR_APPROVED_SENDER_ID",
      rate: 0.30,
      format: "Dear {name}, your deposit of {amount} BDT has been received. Current balance: {balance} BDT. Note: {note}. Date: {datetime}"
    },

    // ── bKash Merchant Payment Gateway ──────────────────
    BKASH_GATEWAY: {
      gatewayUrl: "https://YOUR_GATEWAY_URL.app",
      licenseKey: "YOUR_BKASH_GATEWAY_LICENSE_KEY"
    },

    // ── Security & Application Settings ─────────────────
    APP_NAME: "Messliner",
    APP_VERSION: "3.5.0",
    IS_PRODUCTION: false
  };

  ENV.getAuthTokenKey = function () {
    const ref = ENV.SUPABASE_PROJECT_REF || (ENV.SUPABASE_URL && ENV.SUPABASE_URL.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1]) || 'YOUR_PROJECT_ID';
    return 'sb-' + ref + '-auth-token';
  };

  ENV.getStoredAuthToken = function () {
    try {
      const primaryKey = ENV.getAuthTokenKey();
      return localStorage.getItem(primaryKey);
    } catch (_) { }
    return null;
  };

  window.__ENV__ = Object.assign(window.__ENV__ || {}, ENV);
  window.GEMINI_API_KEY = window.__ENV__.GEMINI_API_KEY;
  window.GEMINI_MODEL = window.__ENV__.GEMINI_MODEL;
})();
