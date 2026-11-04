/* =========================================================
   Messliner Environment Variables Template (Example)
   Copy this file to `js/env.js` and fill in your actual credentials.
   ========================================================= */

window.__ENV__ = window.__ENV__ || {};

// Google Gemini API Configuration
window.__ENV__.GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
window.__ENV__.GEMINI_MODEL = "gemini-3-flash-preview";

// Direct window access for backwards compatibility
window.GEMINI_API_KEY = window.__ENV__.GEMINI_API_KEY;
window.GEMINI_MODEL = window.__ENV__.GEMINI_MODEL;

