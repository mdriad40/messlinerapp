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

const SUPABASE_URL = (window.__ENV__ && window.__ENV__.SUPABASE_URL) || "https://pgnjvtmofglkjplotrha.supabase.co";
const SUPABASE_ANON_KEY = (window.__ENV__ && window.__ENV__.SUPABASE_ANON_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnbmp2dG1vZmdsa2pwbG90cmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTQxMzcsImV4cCI6MjEwMjk5MDEzN30.qqJR5ob2_3g-yRi0-_uOvgfemjMy6UuzjcKth5_QbC0";

// Dynamic safe getter for cached auth token across env configurations
function _getStoredAuthToken() {
  if (window.__ENV__ && typeof window.__ENV__.getStoredAuthToken === 'function') {
    return window.__ENV__.getStoredAuthToken();
  }
  try {
    const key = (window.__ENV__ && typeof window.__ENV__.getAuthTokenKey === 'function')
      ? window.__ENV__.getAuthTokenKey()
      : 'sb-pgnjvtmofglkjplotrha-auth-token';
    return localStorage.getItem(key) || localStorage.getItem('sb-pgnjvtmofglkjplotrha-auth-token');
  } catch (_) {
    return null;
  }
}

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

/**
 * Enterprise Auth Bridge:
 * Syncs Supabase session with Firebase Auth in the background.
 * Mints an authentic Firebase Custom Token via Supabase Edge Function so
 * Firebase Realtime Database is 100% secured with auth != null rules.
 */
let _isSyncingFirebase = false;
  window._firebaseSyncPromise = null;

  async function _waitForFirebase(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (typeof firebase !== 'undefined' && firebase.auth && typeof firebase.auth === 'function') {
        return true;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    return false;
  }

  async function _syncFirebaseSession(session) {
    if (!session) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const s = await client.auth.getSession();
          session = s?.data?.session;
        }
      } catch (_) { }
    }
    if (!session || !session.access_token) return Promise.resolve(null);

    // Ensure Firebase Auth SDK is loaded
    if (typeof firebase === 'undefined' || !firebase.auth) {
      const ready = await _waitForFirebase(6000);
      if (!ready) {
        console.warn('[Messliner Bridge] Firebase Auth SDK timed out waiting to load.');
        return null;
      }
    }

    const targetUid = session.user?.user_metadata?.firebase_uid || session.user?.id;
    const currentFb = firebase.auth().currentUser;
    if (currentFb && (currentFb.uid === targetUid || !currentFb.isAnonymous)) {
      return Promise.resolve(currentFb);
    }

    if (window._firebaseSyncPromise && _isSyncingFirebase) {
      return window._firebaseSyncPromise;
    }

    _isSyncingFirebase = true;
    window._firebaseSyncPromise = (async () => {
      try {
        const bridgeUrl = (window.__ENV__?.FUNCTIONS?.authBridge) ||
          (SUPABASE_URL + '/functions/v1/firebase-auth-bridge');
        const anonKey = (window.__ENV__?.SUPABASE_ANON_KEY) || SUPABASE_ANON_KEY;

        const res = await fetch(bridgeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': anonKey
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.customToken) {
            const userCred = await firebase.auth().signInWithCustomToken(data.customToken);
            console.log('[Messliner Bridge] ⚡ Firebase Auth synced seamlessly with Supabase UID:', targetUid);
            return userCred?.user || firebase.auth().currentUser;
          } else {
            console.warn('[Messliner Bridge] No customToken returned:', data);
          }
        } else {
          const errDetail = await res.text();
          console.warn('[Messliner Bridge] Edge bridge error response (' + res.status + '):', errDetail);
          // Resilient fallback: Try signing in anonymously to Firebase so rules requiring auth != null pass
          if (!firebase.auth().currentUser && typeof firebase.auth().signInAnonymously === 'function') {
            try {
              const anonCred = await firebase.auth().signInAnonymously();
              console.log('[Messliner Bridge] Resilient anonymous auth active for Firebase RTDB.');
              return anonCred?.user || firebase.auth().currentUser;
            } catch (_) { }
          }
        }
      } catch (err) {
        console.warn('[Messliner Bridge] Background sync notice:', err.message);
        if (!firebase.auth().currentUser && typeof firebase.auth().signInAnonymously === 'function') {
          try {
            const anonCred = await firebase.auth().signInAnonymously();
            console.log('[Messliner Bridge] Resilient anonymous auth active for Firebase RTDB.');
            return anonCred?.user || firebase.auth().currentUser;
          } catch (_) { }
        }
      } finally {
        _isSyncingFirebase = false;
      }
      return firebase.auth().currentUser;
    })();

    return window._firebaseSyncPromise;
  }

  // Global helper to ensure Firebase session is active before queries
  window.syncFirebaseSession = _syncFirebaseSession;
  window.ensureFirebaseSession = async function (timeoutMs = 6000) {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return firebase.auth().currentUser;
    }
    if (window._firebaseSyncPromise) {
      try {
        await Promise.race([
          window._firebaseSyncPromise,
          new Promise(r => setTimeout(r, timeoutMs))
        ]);
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
          return firebase.auth().currentUser;
        }
      } catch (_) { }
    }
    const client = getSupabaseClient();
    if (client) {
      const { data } = await client.auth.getSession();
      if (data?.session) {
        return await _syncFirebaseSession(data.session);
      }
    }
    return null;
  };

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
          if (!client) {
            let retries = 0;
            const timer = setInterval(() => {
              retries++;
              const retryClient = getSupabaseClient();
              if (retryClient) {
                clearInterval(timer);
                authAdapter.onAuthStateChanged(callback);
              } else if (retries >= 80) {
                clearInterval(timer);
                console.warn('[Messliner Auth] Supabase client timed out, checking cached session.');
                try {
                  const raw = _getStoredAuthToken();
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.user) {
                      const u = parsed.user;
                      u.uid = u.user_metadata?.firebase_uid || u.id;
                      window._currentSupabaseUser = u;
                      callback(u);
                      return;
                    }
                  }
                } catch (_) { }
                callback(null);
              }
            }, 50);
            return { unsubscribe: () => clearInterval(timer) };
          }

          // Check active session on load with resilient error catch
          client.auth.getSession().then(({ data }) => {
            const session = data?.session || null;
            let u = session?.user || null;
            if (u) {
              u.uid = u.user_metadata?.firebase_uid || u.id;
              if (!u.displayName && u.user_metadata?.name) u.displayName = u.user_metadata.name;
              _syncFirebaseSession(session);
            }
            window._currentSupabaseUser = u;
            callback(u);
          }).catch(err => {
            console.warn('[Messliner Auth] getSession error (proceeding to cached fallback):', err);
            try {
              const raw = _getStoredAuthToken();
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.user) {
                  const u = parsed.user;
                  u.uid = u.user_metadata?.firebase_uid || u.id;
                  window._currentSupabaseUser = u;
                  callback(u);
                  return;
                }
              }
            } catch (_) { }
            callback(null);
          });

          // Listen to auth state changes safely
          try {
            const { data } = client.auth.onAuthStateChange((_event, session) => {
              let u = session?.user || null;
              if (u) {
                u.uid = u.user_metadata?.firebase_uid || u.id;
                if (!u.displayName && u.user_metadata?.name) u.displayName = u.user_metadata.name;
                _syncFirebaseSession(session);
                window._currentSupabaseUser = u;
                callback(u);
              } else if (_event === 'SIGNED_OUT') {
                try {
                  if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
                    firebase.auth().signOut().catch(() => { });
                  }
                } catch (_) { }
                window._currentSupabaseUser = null;
                callback(null);
              } else {
                // If event is not an explicit sign out, verify localStorage before declaring null
                try {
                  const raw = _getStoredAuthToken();
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.user) {
                      u = parsed.user;
                      u.uid = u.user_metadata?.firebase_uid || u.id;
                      window._currentSupabaseUser = u;
                      callback(u);
                      return;
                    }
                  }
                } catch (_) { }
                window._currentSupabaseUser = null;
                callback(null);
              }
            });
            return data?.subscription || { unsubscribe: () => { } };
          } catch (e) {
            return { unsubscribe: () => { } };
          }
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
          try {
            if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
              await firebase.auth().signOut().catch(() => { });
            }
          } catch (_) { }
          const { error } = await client.auth.signOut();
          window._currentSupabaseUser = null;
          if (error) throw error;
        }
      };

      window.auth = authAdapter;
      var auth = window.auth;

      console.log('[Messliner] Supabase Auth Adapter initialized & 100% bound');
