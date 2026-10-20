/* ============================================
   Messliner — Supabase Configuration & Auth Adapter
   ============================================ */

// Clean Console: Silence redundant startup banners, module registrations, and Firebase index warnings
(function () {
  const _origLog = console.log;
  const _origWarn = console.warn;

  console.log = function (...args) {
    const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
    if (
      msg.startsWith('[Messliner]') ||
      msg.startsWith('[SMSAlert]') ||
      msg.startsWith('[AIControl]')
    ) {
      return;
    }
    _origLog.apply(console, args);
  };

  console.warn = function (...args) {
    const msg = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
    if (
      msg.includes('FIREBASE WARNING') ||
      msg.includes('unspecified index') ||
      msg.includes('.indexOn') ||
      msg.includes('sendBeacon') ||
      msg.includes('Quirks Mode')
    ) {
      return;
    }
    _origWarn.apply(console, args);
  };
})();

const SUPABASE_URL = "https://pgnjvtmofglkjplotrha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnbmp2dG1vZmdsa2pwbG90cmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTQxMzcsImV4cCI6MjEwMjk5MDEzN30.qqJR5ob2_3g-yRi0-_uOvgfemjMy6UuzjcKth5_QbC0";

// Helper to get or create Supabase client instance dynamically
function getSupabaseClient() {
  if (window._supabaseInstance) return window._supabaseInstance;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window._supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window._supabaseInstance;
  }
  return null;
}

window._currentSupabaseUser = null;

// Auth Adapter matching 100% Supabase Auth operations
const authAdapter = {
  get client() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase SDK not loaded. Please check network connection.');
    }
    return client;
  },

  get currentUser() {
    return window._currentSupabaseUser;
  },

  onAuthStateChanged(callback) {
    const client = getSupabaseClient();
    if (!client) return;

    // Check active session on load
    client.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      if (u) {
        u.uid = u.user_metadata?.firebase_uid || u.id;
        if (!u.displayName && u.user_metadata?.name) u.displayName = u.user_metadata.name;
      }
      window._currentSupabaseUser = u;
      callback(u);
    });

    // Listen to auth state changes
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      if (u) {
        u.uid = u.user_metadata?.firebase_uid || u.id;
        if (!u.displayName && u.user_metadata?.name) u.displayName = u.user_metadata.name;
      }
      window._currentSupabaseUser = u;
      callback(u);
    });

    return subscription;
  },

  async signInWithEmailAndPassword(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      data.user.uid = data.user.user_metadata?.firebase_uid || data.user.id;
      window._currentSupabaseUser = data.user;
    }
    return data;
  },

  async createUserWithEmailAndPassword(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      data.user.uid = data.user.user_metadata?.firebase_uid || data.user.id;
      window._currentSupabaseUser = data.user;
    }
    return data;
  },

  async sendPasswordResetEmail(email) {
    const isFile = window.location.protocol === 'file:' || window.location.origin === 'null' || !window.location.origin;
    const options = {};
    if (!isFile && window.location.origin && window.location.origin !== 'null') {
      options.redirectTo = window.location.origin + window.location.pathname + '#reset-password';
    }
    const { data, error } = await this.client.auth.resetPasswordForEmail(email, options);
    if (error) throw error;
    return data;
  },

  async resendSignupOTP(email) {
    const { data, error } = await this.client.auth.resend({
      type: 'signup',
      email: email
    });
    if (error) throw error;
    return data;
  },

  async verifyOTP(email, token, type = 'recovery') {
    let result = await this.client.auth.verifyOtp({
      email: email,
      token: token,
      type: type || 'recovery'
    });

    // Fallback attempt for signup verification if 'signup' type fails
    if (result.error && type === 'signup') {
      console.warn('[Messliner] Initial OTP type "signup" failed, trying "email" fallback...', result.error.message);
      const fallbackResult = await this.client.auth.verifyOtp({
        email: email,
        token: token,
        type: 'email'
      });
      if (!fallbackResult.error) {
        result = fallbackResult;
      }
    }

    if (result.error) throw result.error;

    const data = result.data;
    if (data && data.user) {
      data.user.uid = data.user.user_metadata?.firebase_uid || data.user.id;
      window._currentSupabaseUser = data.user;
    }
    return data;
  },

  async updatePassword(newPassword) {
    const { data, error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    window._currentSupabaseUser = null;
    if (error) throw error;
  }
};

window.auth = authAdapter;
var auth = window.auth;

console.log('[Messliner] Supabase Auth Adapter initialized & 100% bound');
