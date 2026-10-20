/* ============================================
   Messliner — Firebase Configuration
   ============================================ */

const firebaseConfig = {
  apiKey: "AIzaSyD9qxIggxqT_d4NPMUhQBeVb32zT5hvDBo",
  authDomain: "meiner-3a1e5.firebaseapp.com",
  databaseURL: "https://meiner-3a1e5-default-rtdb.firebaseio.com",
  projectId: "meiner-3a1e5",
  storageBucket: "meiner-3a1e5.firebasestorage.app",
  messagingSenderId: "889336710226",
  appId: "1:889336710226:web:50df307a5be2f455570b8b",
  measurementId: "G-L4RDDY6VRG"
};

// Gemini API Key for Smart Campus AI Features
const GEMINI_API_KEY = window.GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || "AQ.Ab8RN6JuVbCr70tle91XQxPZfSBUuhG9J4HxE-hDRNxjoYbtfw";
const GEMINI_MODEL = window.GEMINI_MODEL || "gemini-3-flash-preview";

// Initialize Firebase (Realtime Database & Gemini API)
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

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

console.log('[Messliner] Firebase Database & Gemini initialized (Auth strictly powered by Supabase)');
