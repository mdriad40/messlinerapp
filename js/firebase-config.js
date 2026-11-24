/* ============================================
   Messliner — Firebase Configuration
   ============================================ */

const firebaseConfig = (window.__ENV__ && window.__ENV__.FIREBASE) ? window.__ENV__.FIREBASE : {
  apiKey: (window.__ENV__ && window.__ENV__.FIREBASE && window.__ENV__.FIREBASE.apiKey) || "AIzaSyAlVTCLnmnQIPYItROJnawi98ztHv00wSU",
  authDomain: "meiner-6ec2e.firebaseapp.com",
  databaseURL: "https://meiner-6ec2e-default-rtdb.firebaseio.com",
  projectId: "meiner-6ec2e",
  storageBucket: "meiner-6ec2e.firebasestorage.app",
  messagingSenderId: "270392233174",
  appId: "1:270392233174:web:6cbd159e10073c26824d77",
  measurementId: "G-X2HD4LRXMZ"
};

// Gemini API Key for Smart Campus AI Features (Loaded dynamically from environment config js/env.js)
const GEMINI_API_KEY = (window.__ENV__ && window.__ENV__.GEMINI_API_KEY)
  || window.GEMINI_API_KEY
  || localStorage.getItem('gemini_api_key')
  || "";
const GEMINI_MODEL = (window.__ENV__ && window.__ENV__.GEMINI_MODEL)
  || window.GEMINI_MODEL
  || "gemini-3-flash-preview";

// Initialize Firebase (Realtime Database & Gemini API)
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebase.database();
window.db = db;

// Initialize Admin Firebase App for Central Subscriptions, Analytics & Logs
let adminDb = null;
try {
  const adminConfig = (window.__ENV__ && window.__ENV__.FIREBASE_ADMIN) ? window.__ENV__.FIREBASE_ADMIN : {
    apiKey: (window.__ENV__ && window.__ENV__.FIREBASE_ADMIN && window.__ENV__.FIREBASE_ADMIN.apiKey) || "",
    authDomain: "meiner-admin.firebaseapp.com",
    databaseURL: "https://meiner-admin-default-rtdb.firebaseio.com",
    projectId: "meiner-admin",
    storageBucket: "meiner-admin.firebasestorage.app",
    messagingSenderId: "62196998163",
    appId: "1:62196998163:web:b60256d994a0c674d95fe6"
  };
  const adminApp = (firebase.apps && firebase.apps.find(a => a.name === 'adminApp'))
    || firebase.initializeApp(adminConfig, 'adminApp');
  adminDb = adminApp.database();
} catch (e) {
  console.warn('[Messliner] Admin Firebase Database init notice:', e.message);
}
window.adminDb = adminDb;

// Silence repetitive Firebase unspecified index warnings in console
const _origConsoleWarn = console.warn;
console.warn = function (...args) {
  const fullMsg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
  if (fullMsg.includes('FIREBASE WARNING') || fullMsg.includes('unspecified index') || fullMsg.includes('.indexOn')) {
    return;
  }
  _origConsoleWarn.apply(console, args);
};

// Preserve Supabase Auth Adapter as primary auth provider
if (!window.auth && typeof authAdapter !== 'undefined') {
  window.auth = authAdapter;
}
var auth = window.auth;

// Trigger immediate background sync with Firebase if Supabase session is present
if (typeof window.syncFirebaseSession === 'function') {
  try {
    window.syncFirebaseSession();
  } catch (_) { }
}

console.log('[Messliner] Firebase Database & Gemini initialized (Auth strictly powered by Supabase)');
