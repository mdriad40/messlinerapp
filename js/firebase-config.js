/* ============================================
   Messliner — Firebase Configuration
   ============================================ */

const firebaseConfig = {
  apiKey: "AIzaSyB_RIGLOegS-fy3IlblsGCnj8TS2AwC0o0",
  authDomain: "messliner-57f88.firebaseapp.com",
  databaseURL: "https://messliner-57f88-default-rtdb.firebaseio.com",
  projectId: "messliner-57f88",
  storageBucket: "messliner-57f88.firebasestorage.app",
  messagingSenderId: "867219650851",
  appId: "1:867219650851:web:3a008e34577dbc389bb496",
  measurementId: "G-4KJZHJE7EL"
};

// Gemini API Key for Smart Campus AI Features
const GEMINI_API_KEY = window.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-3.5-flash";

// Initialize Firebase (Realtime Database & Gemini API)
const firebaseApp = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Preserve Supabase Auth Adapter as primary auth provider
if (!window.auth && typeof authAdapter !== 'undefined') {
  window.auth = authAdapter;
}
var auth = window.auth;

console.log('[Messliner] Firebase Database & Gemini initialized (Auth strictly powered by Supabase)');
