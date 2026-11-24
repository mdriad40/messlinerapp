/* ============================================
   Messliner — Main App Entry Point (app.js)
   ============================================ */

/**
 * Global Messliner namespace
 * All modules are attached here for cross-module access
 */
// Global sign-out confirm handler used by dashboard HTML navigation
window.showSignOutConfirm = async function () {
  if (confirm("Are you sure you want to sign out?")) {
    try {
      if (window.Messliner && window.Messliner.auth && typeof window.Messliner.auth.logout === 'function') {
        await window.Messliner.auth.logout();
        return;
      }
      if (window.auth && typeof window.auth.signOut === 'function') {
        await window.auth.signOut();
      }
    } catch (_) { }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) { }
    window.location.replace('login.html');
  }
};

window.Messliner = window.DineDesk = {
  _dataRendered: false,
  _initError: false,
  state: {
    user: null,
    userId: null,
    diningId: null,
    role: null,
    mealRate: 0,
    monthlyMealRate: 0,
    totalMeals: 0,
    totalBazar: 0,
    totalDeposit: 0,
    userJoinedAt: null
  },

  // Module references (assigned during init)
  auth: {
    async logout() {
      try {
        if (sessionStorage.getItem('ml_impersonate_user_id')) {
          sessionStorage.removeItem('ml_impersonate_user_id');
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
          window.location.href = isLocal ? 'dashboard.html' : '/dashboard';
          return;
        }
        if (window.Messliner && typeof window.Messliner._clearUserCache === 'function') {
          window.Messliner._clearUserCache();
        }
        await auth.signOut();
        window.location.href = ((window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'login.html' : '/login');
      } catch (error) {
        console.error('Logout error:', error);
        Notifications.toast('error', 'Error', 'Failed to sign out.');
      }
    }
  },
  logout() {
    return this.auth.logout();
  },
  router: Router,
  users: UsersModule,
  meals: MealsModule,
  finance: FinanceModule,
  ledger: typeof LedgerModule !== 'undefined' ? LedgerModule : null,
  userBills: typeof UserBillsModule !== 'undefined' ? UserBillsModule : null,
  settings: SettingsModule,
  userDashboard: UserDashboard,
  history: HistoryModule,
  historyPage: typeof HistoryPageModule !== 'undefined' ? HistoryPageModule : null,
  overview: OverviewModule,
  notifications: Notifications,
  charts: Charts,
  mealChart: MealChartModule,
  bazar: typeof BazarModule !== 'undefined' ? BazarModule : null,
  bazarHistory: BazarHistoryModule,
  summary: typeof SummaryModule !== 'undefined' ? SummaryModule : null,
  fridayMeals: typeof FridayMealsModule !== 'undefined' ? FridayMealsModule : null,
  fridayMealPage: typeof FridayMealPageModule !== 'undefined' ? FridayMealPageModule : null,
  smsAlert: typeof SMSAlertModule !== 'undefined' ? SMSAlertModule : null,
  aiControl: typeof AIControlModule !== 'undefined' ? AIControlModule : null,

  /**
   * Synchronize DOM layout based on role
   * Admin: page-dashboard shows Dining Overview (overviewContent), page-mymeal shows userDashboardContent
   * Member: page-dashboard shows userDashboardContent, page-overview shows overviewContent
   */
  syncRoleLayout(role) {
    try {
      const currentRole = role || this.state?.role || (typeof Router !== 'undefined' && Router.getRole && Router.getRole()) || localStorage.getItem('ml_user_role') || 'user';
      const isAdmin = currentRole === 'admin' || currentRole === 'manager';
      const userContent = document.getElementById('userDashboardContent');
      const mymealContainer = document.getElementById('mymealContainer');
      const dashboardSection = document.getElementById('page-dashboard');
      const overviewContent = document.getElementById('overviewContent');
      const managerContainer = document.getElementById('managerOverviewSection');
      const originalOverviewContainer = document.getElementById('overviewOriginalContainer');

      if (isAdmin) {
        // Move userDashboardContent to page-mymeal
        if (userContent && mymealContainer && userContent.parentElement !== mymealContainer) {
          mymealContainer.appendChild(userContent);
        }
        // In My Meal tab for Admin, hide avatar/notification topbar and show clean "My Meal" label
        const mymealUserBar = document.getElementById('mymealUserTopBar');
        const mymealAdminBar = document.getElementById('mymealAdminLabelBar');
        if (mymealUserBar) mymealUserBar.style.setProperty('display', 'none', 'important');
        if (mymealAdminBar) {
          mymealAdminBar.style.setProperty('display', 'flex', 'important');
          mymealAdminBar.classList.remove('hidden');
        }

        // Move overviewContent to managerOverviewSection inside page-dashboard
        if (overviewContent && managerContainer && overviewContent.parentElement !== managerContainer) {
          managerContainer.appendChild(overviewContent);
        }
        if (managerContainer) {
          managerContainer.classList.remove('hidden');
          managerContainer.style.setProperty('display', 'block', 'important');
        }
      } else {
        // Member view: userDashboardContent on dashboard
        if (userContent && dashboardSection && userContent.parentElement !== dashboardSection) {
          dashboardSection.insertBefore(userContent, dashboardSection.firstChild);
        }
        // In Member view, show avatar/notification topbar and hide admin label
        const mymealUserBar = document.getElementById('mymealUserTopBar');
        const mymealAdminBar = document.getElementById('mymealAdminLabelBar');
        if (mymealUserBar) mymealUserBar.style.removeProperty('display');
        if (mymealAdminBar) {
          mymealAdminBar.style.setProperty('display', 'none', 'important');
          mymealAdminBar.classList.add('hidden');
        }

        // Return overviewContent to overview page
        if (overviewContent && originalOverviewContainer && overviewContent.parentElement !== originalOverviewContainer) {
          originalOverviewContainer.appendChild(overviewContent);
        }
        if (managerContainer) {
          managerContainer.classList.add('hidden');
          managerContainer.style.setProperty('display', 'none', 'important');
        }
      }
    } catch (e) {
      console.warn('[Messliner] syncRoleLayout error:', e);
    }
  },

  /**
   * Dynamically update top header with dynamic greeting & user display name on Home
   */
  exitImpersonation() {
    try { sessionStorage.removeItem('ml_impersonate_user_id'); } catch (_) { }
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    window.location.href = isLocal ? 'dashboard.html' : '/dashboard';
  },

  updateHomeHeaderGreeting(userName) {
    const greetingEl = document.getElementById('headerGreeting');
    const titleEl = document.getElementById('headerTitle');
    const pageIconEl = document.getElementById('headerPageIcon');

    if (Router.currentPage === 'dashboard') {
      const hour = new Date().getHours();
      let greeting = 'Good morning,';
      if (hour >= 12 && hour < 17) {
        greeting = 'Good noon,';
      } else if (hour >= 17 && hour < 21) {
        greeting = 'Good evening,';
      } else if (hour >= 21 || hour < 4) {
        greeting = 'Good night,';
      }

      if (greetingEl) {
        greetingEl.textContent = greeting;
        greetingEl.style.display = 'block';
      }

      const displayName = userName || (this.state && this.state.userName) || (UserDashboard && UserDashboard.userData && UserDashboard.userData.name) || 'User';
      if (titleEl) {
        titleEl.textContent = displayName;
      }

      if (pageIconEl) {
        pageIconEl.style.display = 'none';
      }
    } else {
      if (greetingEl) {
        greetingEl.style.display = 'none';
      }
      if (pageIconEl) {
        pageIconEl.style.display = 'flex';
      }
      if (typeof setHeaderIcon === 'function') {
        setHeaderIcon(Router.currentPage);
      }
    }
  },

  /**
   * Safe getter for cached auth token across environment configurations
   */
  _getStoredAuthToken() {
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
  },

  /**
   * Clean up user-specific cached data from localStorage
   * Ensures old dashboard content does not remain for subsequent visits
   */
  _clearUserCache() {
    try {
      const keysToRemove = [];
      const currentTokenKey = (window.__ENV__ && typeof window.__ENV__.getAuthTokenKey === 'function') ? window.__ENV__.getAuthTokenKey() : 'sb-pgnjvtmofglkjplotrha-auth-token';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('ml_cache_v2_') ||
          key.startsWith('ml_map_') ||
          key.startsWith('notif_cache_') ||
          key.startsWith('messliner_ai_sessions_') ||
          key === 'ml_boot_email' ||
          (key.startsWith('sb-') && key.endsWith('-auth-token')) ||
          key === currentTokenKey ||
          key === 'dining_id' ||
          key === 'user_id' ||
          key === 'ml_user_role' ||
          key === 'viewMode' ||
          key === 'messliner_dining_id'
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) { }
      });
      window.__ML_BOOT_USER = null;
      window.__ML_BOOT_MAP = null;
      window.__ML_BOOT_IMP_CACHE = null;
      window.__ML_SESSION_ACTIVE = false;
      document.documentElement.classList.remove('ml-has-cache', 'ml-is-admin');
    } catch (e) {
      console.warn('[Messliner] Error clearing user cache:', e);
    }
  },

  /**
   * Initialize the app — called on dashboard.html load
   */
  async init() {
    console.log('[Messliner] Initializing app...');

    // Safeguard: Ensure modals are injected in background if not already present
    if (!window._modalsLoaded && !document.getElementById('logoutModal')) {
      fetch('views/shared/modals.html')
        .then(res => res.ok ? res.text() : '')
        .then(html => {
          if (html) {
            const mSlot = document.getElementById('modalsContainer') || document.body;
            mSlot.innerHTML = html;
            window._modalsLoaded = true;
          }
        })
        .catch(() => { });
    }

    // Fast synchronous boot check from localStorage / window cache (0ms latency!)
    let syncUser = null;
    let isSessionActive = false;
    try {
      if (window.__ML_BOOT_USER && window.__ML_SESSION_ACTIVE) {
        syncUser = window.__ML_BOOT_USER;
        isSessionActive = true;
      } else {
        const raw = this._getStoredAuthToken();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.user && (parsed.refresh_token || (parsed.expires_at && parsed.expires_at * 1000 > Date.now()))) {
            syncUser = parsed.user;
            syncUser.uid = syncUser.user_metadata?.firebase_uid || syncUser.id;
            isSessionActive = true;
          }
        }
      }
    } catch (_) { }

    if (isSessionActive && syncUser && syncUser.email) {
      console.log('[Messliner] Instant Boot from synchronous session:', syncUser.email);
      this._bootForUser(syncUser);
    }

    // Safety Watchdog: Failsafe if network hangs completely (10s extreme fallback)
    setTimeout(() => {
      if (!this._dataRendered && !document.body.classList.contains('onboarding-active')) {
        console.warn('[Messliner] Watchdog timeout reached before data rendered. Forcing preloader dismissal.');
        this._dismissLoaderFast(true);
      }
    }, 10000);

    // Auth state listener (handles background token verification or logout)
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        // Guard against transient null events during background token refresh:
        try {
          const raw = this._getStoredAuthToken();
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.user && parsed.refresh_token) {
              console.log('[Messliner] Ignoring transient auth null — refresh token active.');
              return;
            }
          }
        } catch (_) { }

        // Truly not authenticated — clean up cached data and redirect to login
        console.log('[Messliner] Auth session null. Cleaning up cached user data...');
        this._clearUserCache();
        window.location.replace((window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'login.html' : '/login');
        return;
      }
      this._bootForUser(user);
    });
  },

  /**
   * Fast boot and parallel hydration engine
   */
  async _bootForUser(user) {
    const userUid = user.uid || user.id;
    if (this._isInitializing || (this._initialized && this.state.userId && this._lastAuthedUid === userUid)) {
      return;
    }
    this._isInitializing = true;
    this._lastAuthedUid = userUid;

    this.state.user = user;
    console.log('[Messliner] Booting for user:', user.email);

    const appShellEl = document.getElementById('appShell');
    if (appShellEl && !document.body.classList.contains('onboarding-active')) {
      appShellEl.style.display = 'flex';
    }

    const emailKey = Utils.encodeEmail(user.email);
    const urlParams = new URLSearchParams(window.location.search);
    let impersonateUserId = urlParams.get('impersonate');
    if (impersonateUserId) {
      try { sessionStorage.setItem('ml_impersonate_user_id', impersonateUserId); } catch (_) { }
    } else {
      try { impersonateUserId = sessionStorage.getItem('ml_impersonate_user_id'); } catch (_) { }
    }
    const cacheKey = impersonateUserId ? `ml_cache_v2_imp_${impersonateUserId}` : `ml_cache_v2_${emailKey}`;

    // ── Check if session is active before hydrating cache ──
    let isSessionActive = false;
    try {
      if (window.__ML_SESSION_ACTIVE) {
        isSessionActive = true;
      } else {
        const rawToken = this._getStoredAuthToken();
        if (rawToken) {
          const parsedToken = JSON.parse(rawToken);
          if (parsedToken && parsedToken.user && (parsedToken.refresh_token || (parsedToken.expires_at && parsedToken.expires_at * 1000 > Date.now()))) {
            isSessionActive = true;
          }
        }
      }
    } catch (_) { }

    // If verified by Supabase adapter runtime (e.g. fresh getSession/onAuthStateChange), mark session active
    if (window._currentSupabaseUser && (window._currentSupabaseUser.uid === userUid || window._currentSupabaseUser.id === userUid)) {
      isSessionActive = true;
    }

    // ── FAST PATH: Instant Cache Hydration (< 50ms) ──
    let hasHydratedFromCache = false;
    if (isSessionActive) {
      try {
        let cachedRaw = null;
        if (impersonateUserId) {
          cachedRaw = window.__ML_BOOT_IMP_CACHE ? JSON.stringify(window.__ML_BOOT_IMP_CACHE) : localStorage.getItem(cacheKey);
        } else {
          cachedRaw = localStorage.getItem(cacheKey);
        }
        if (cachedRaw) {
          const cached = typeof cachedRaw === 'object' ? cachedRaw : JSON.parse(cachedRaw);
          if (cached && cached.mapping && cached.userData) {
            if (!impersonateUserId || (cached.mapping && cached.mapping.userId === impersonateUserId)) {
              console.log('[Messliner] Fast Boot: Instant cache hydration in 0.05s...');
              hasHydratedFromCache = true;
              this._renderDashboardPayload(cached, true);
              this._dismissLoaderFast();
            }
          }
        }
      } catch (e) {
        console.warn('[Messliner] Cache parse error:', e);
      }
    } else {
      console.log('[Messliner] Session token absent or expired. Skipping instant cache hydration.');
    }

    // ── FRESH DATA FETCH & BACKGROUND REVALIDATION ──
    try {
      // Ensure Firebase Auth session has finished syncing before performing protected queries
      if (typeof window.ensureFirebaseSession === 'function') {
        try {
          await window.ensureFirebaseSession(5000);
        } catch (_) { }
      } else if (window._firebaseSyncPromise) {
        try {
          await Promise.race([
            window._firebaseSyncPromise,
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
        } catch (_) { }
      }

      const mappingCacheKey = `ml_map_${emailKey}`;
      const altKey = `ml_map_${(user.email || '').toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_')}`;
      let mapping = window.__ML_BOOT_MAP || null;
      if (!mapping) {
        try {
          const cachedMapRaw = localStorage.getItem(mappingCacheKey) || localStorage.getItem(altKey);
          if (cachedMapRaw) mapping = JSON.parse(cachedMapRaw);
        } catch (_) { }
      }

      // If no cached mapping, fetch it first
      if (!mapping || !mapping.diningId) {
        try {
          const mappingSnap = await db.ref(`userMappings/emailToDining/${emailKey}`).once('value');
          mapping = mappingSnap.val();
          if (mapping && mapping.diningId) {
            try {
              localStorage.setItem(mappingCacheKey, JSON.stringify(mapping));
              localStorage.setItem(altKey, JSON.stringify(mapping));
            } catch (_) { }
          }
        } catch (mapErr) {
          console.warn('[Messliner] Mapping query notice:', mapErr.message);
          mapping = null;
        }
      } else {
        // If cached mapping exists, revalidate in background
        db.ref(`userMappings/emailToDining/${emailKey}`).once('value').then(snap => {
          const freshMap = snap.val();
          if (freshMap && freshMap.diningId) {
            try {
              localStorage.setItem(mappingCacheKey, JSON.stringify(freshMap));
              localStorage.setItem(altKey, JSON.stringify(freshMap));
            } catch (_) { }
          }
        }).catch(() => { });
      }

      // Auto-Discovery: If mapping is missing, look through dinings to find user's mess
      if (!mapping || !mapping.diningId) {
        try {
          console.log('[Messliner] Searching for user dining by email:', user.email);
          const diningsSnap = await db.ref('dinings').once('value');
          const allDinings = diningsSnap.val() || {};
          const targetEmail = (user.email || '').toLowerCase().trim();

          for (const [dId, dData] of Object.entries(allDinings)) {
            if (dData && dData.users) {
              for (const [uId, uObj] of Object.entries(dData.users)) {
                if (uObj && uObj.email && uObj.email.toLowerCase().trim() === targetEmail) {
                  console.log(`[Messliner] 🎯 Found existing mess for ${targetEmail}: diningId=${dId}, userId=${uId}`);
                  this._discoveredDiningData = dData;
                  mapping = {
                    diningId: dId,
                    userId: uId,
                    email: user.email,
                    role: uObj.role || 'user'
                  };
                  try {
                    localStorage.setItem(mappingCacheKey, JSON.stringify(mapping));
                    const altKey = `ml_map_${(user.email || '').toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_')}`;
                    localStorage.setItem(altKey, JSON.stringify(mapping));
                    await db.ref(`userMappings/emailToDining/${emailKey}`).set(mapping);
                    console.log('[Messliner] ⚡ Auto-healed userMappings/emailToDining in Firebase!');
                  } catch (_) { }
                  break;
                }
              }
              if (mapping && mapping.diningId) break;
            }
          }
        } catch (discErr) {
          console.warn('[Messliner] Dining auto-discovery notice:', discErr.message);
        }
      }

      if (!mapping || !mapping.diningId) {
        // Guard: If we already hydrated successfully from cache with a valid diningId, never kick user to onboarding
        if (hasHydratedFromCache && this.state.diningId) {
          console.warn('[Messliner] Background mapping fetch failed or timed out, but cached dining is active. Preserving dashboard.');
          return;
        }
        console.log('[Messliner] No dining mapping found. Showing onboarding...');
        document.body.classList.add('onboarding-active');
        let profile = {
          name: user.displayName || (user.user_metadata && user.user_metadata.name) || 'User',
          email: user.email,
          phone: (user.user_metadata && user.user_metadata.phone) || ''
        };
        try {
          const userProfileSnap = await db.ref(`users/${user.uid}`).once('value');
          if (userProfileSnap.exists()) {
            profile = userProfileSnap.val() || profile;
          }
        } catch (_) { }
        this._dismissLoaderFast(true);
        const onboardingPage = document.getElementById('onboardingPage');
        if (onboardingPage) onboardingPage.style.display = 'flex';
        const appShell = document.getElementById('appShell');
        if (appShell) appShell.style.display = 'none';
        const bottomNav = document.getElementById('bottomNav');
        if (bottomNav) bottomNav.style.setProperty('display', 'none', 'important');

        if (window.Onboarding) {
          Onboarding.init({ uid: user.uid, name: profile.name, email: profile.email, phone: profile.phone || '' });
        }
        return;
      }

      // Support impersonation
      let activeUserId = mapping.userId;
      if (impersonateUserId) {
        const targetSnap = await db.ref(`dinings/${mapping.diningId}/users/${impersonateUserId}`).once('value');
        if (targetSnap.exists()) {
          activeUserId = impersonateUserId;
          console.log('[Messliner] Impersonating member:', impersonateUserId);
        } else {
          try { sessionStorage.removeItem('ml_impersonate_user_id'); } catch (_) { }
          impersonateUserId = null;
        }
      }

      const diningId = mapping.diningId;
      const userId = activeUserId;

      // Safe timeout fetcher (prevents hanging indefinitely on slow mobile networks / WebViews)
      const safeFetch = (refPath, timeoutMs = 8000) => {
        return Promise.race([
          db.ref(refPath).once('value').catch(() => ({ val: () => null })),
          new Promise(res => setTimeout(() => res({ val: () => null }), timeoutMs))
        ]);
      };

      // Check if user is currently loading directly into a bills/ledger subpage
      const initialActivePage = (window.Router?.currentPage || (window.location.hash || '').replace(/^[#\/]+/, '').split('?')[0] || sessionStorage.getItem('ml_current_page') || '').toLowerCase();
      const isBillsPage = ['user-bills', 'bills', 'ledger'].includes(initialActivePage);

      // ── STAGE 1 (CRITICAL PATH): Fetch Home Page & Subpages essential data ──
      // ── Admin-First Subscription Fetch: check Central Admin RTDB first -> fallback to User DB ──
      const subPromise = (async () => {
        try {
          if (window.adminDb) {
            const adminSnap = await window.adminDb.ref(`subscriptions/${diningId}`).once('value');
            if (adminSnap.exists() && adminSnap.val()) {
              const adminSub = adminSnap.val();
              // Dual-sync to User DB as backup
              if (window.db) window.db.ref(`dinings/${diningId}/subscription`).set(adminSub).catch(() => { });
              return { val: () => adminSub };
            }
            const adminDiningSnap = await window.adminDb.ref(`dinings/${diningId}/subscription`).once('value');
            if (adminDiningSnap.exists() && adminDiningSnap.val()) {
              const adminSub = adminDiningSnap.val();
              if (window.db) window.db.ref(`dinings/${diningId}/subscription`).set(adminSub).catch(() => { });
              return { val: () => adminSub };
            }
          }
        } catch (err) {
          console.warn('[Messliner] Admin DB subscription fetch notice:', err.message);
        }

        // Backup check in User RTDB if not found in Admin RTDB
        try {
          const userSubSnap = await safeFetch(`dinings/${diningId}/subscription`);
          if (userSubSnap && userSubSnap.val && userSubSnap.val()) {
            const userSub = userSubSnap.val();
            // Dual-sync to Admin DB for permanence
            if (window.adminDb) {
              window.adminDb.ref(`subscriptions/${diningId}`).set(userSub).catch(() => { });
              window.adminDb.ref(`dinings/${diningId}/subscription`).set(userSub).catch(() => { });
            }
            return userSubSnap;
          }
        } catch (err) {
          console.warn('[Messliner] User DB subscription fetch notice:', err.message);
        }

        return { val: () => null };
      })();

      const [
        userSnap,
        bazarSnap,
        mealsSnap,
        usersSnap,
        settingsSnap,
        depositsSnap,
        infoSnap,
        subSnap,
        billsSnap,
        prSnap
      ] = await Promise.all([
        safeFetch(`dinings/${diningId}/users/${userId}`),
        safeFetch(`dinings/${diningId}/bazar`),
        safeFetch(`dinings/${diningId}/meals`),
        safeFetch(`dinings/${diningId}/users`),
        safeFetch(`dinings/${diningId}/settings`),
        safeFetch(`dinings/${diningId}/deposits`),
        safeFetch(`dinings/${diningId}/info`),
        subPromise,
        isBillsPage ? safeFetch(`dinings/${diningId}/bills`) : Promise.resolve({ val: () => null }),
        isBillsPage ? safeFetch(`dinings/${diningId}/paymentRequests`) : Promise.resolve({ val: () => null })
      ]);

      const fallbackDining = this._discoveredDiningData || {};
      const fallbackUsers = fallbackDining.users || {};
      const fallbackUser = fallbackUsers[userId] || null;

      const freshPayload = {
        mapping: { diningId, userId },
        userData: userSnap.val() || fallbackUser || {
          name: user.displayName || (user.user_metadata && user.user_metadata.name) || 'User',
          email: user.email,
          role: mapping.role || 'user',
          status: 'active'
        },
        bazar: bazarSnap.val() || fallbackDining.bazar || {},
        meals: mealsSnap.val() || fallbackDining.meals || {},
        users: usersSnap.val() || fallbackDining.users || {},
        settings: settingsSnap.val() || fallbackDining.settings || {},
        deposits: depositsSnap.val() || fallbackDining.deposits || {},
        info: infoSnap.val() || fallbackDining.info || {},
        subscription: subSnap.val() || fallbackDining.subscription || null,
        bills: billsSnap ? (billsSnap.val() || fallbackDining.bills || {}) : (fallbackDining.bills || {}),
        paymentRequests: prSnap ? (prSnap.val() || fallbackDining.paymentRequests || {}) : (fallbackDining.paymentRequests || {})
      };

      // 🚀 RENDER HOME PAGE & ACTIVATE 4 USER TABS IMMEDIATELY!
      this._renderDashboardPayload(freshPayload, false);

      // 🚀 DISMISS PRELOADER IMMEDIATELY — User sees Home Page right away!
      this._dismissLoaderFast();

      // ── STAGE 2: Non-blocking Background Hydration for Bills & Secondary Modules ──
      const billsHydrationPromise = isBillsPage && billsSnap && prSnap && billsSnap.val() !== null
        ? Promise.resolve([billsSnap, prSnap])
        : Promise.all([
          db.ref(`dinings/${diningId}/bills`).once('value'),
          db.ref(`dinings/${diningId}/paymentRequests`).once('value')
        ]);

      billsHydrationPromise.then(([bSnap, pSnap]) => {
        freshPayload.bills = bSnap.val() || {};
        freshPayload.paymentRequests = pSnap.val() || {};
        if (window.UserBillsModule) {
          UserBillsModule.bills = freshPayload.bills;
          UserBillsModule.paymentRequests = freshPayload.paymentRequests;
          UserBillsModule.renderOverview();
          UserBillsModule.renderBills();
          UserBillsModule.renderHistory();
          if (UserBillsModule._resolveReady) {
            UserBillsModule._resolveReady();
            UserBillsModule._resolveReady = null;
          }
        }
        // Save complete payload to cache for subsequent 0.05s loads
        this._saveToCache(cacheKey, freshPayload);
      }).catch(err => {
        console.warn('[Messliner] Stage 2 background load error:', err);
        this._saveToCache(cacheKey, freshPayload);
      });

      // Setup live listeners once
      if (!this._liveListenersAttached) {
        this._liveListenersAttached = true;
        this._setupLiveListeners(diningId);
        this._setupConnectivity();
      }

    } catch (error) {
      console.error('[Messliner] Init error:', error);
      this._initError = true;
      this._dismissLoaderFast(true);
      if (!hasHydratedFromCache) {
        Notifications.toast('error', 'Error', 'Failed to load your dining data.');
      }
    } finally {
      this._isInitializing = false;
      this._initialized = true;
    }
  },

  /**
   * Fast loader dismissal with smooth CSS fade-out
   * On mobile member panel, guarantees at least 1.5s shimmer skeleton preview on reload,
   * and waits for subpage data (Meal Chart, Bazar, Summary, Friday Meal) to fully render before dismissing
   */
  async _dismissLoaderFast(force = false) {
    const loaderEl = document.getElementById('pageLoader');
    if (!loaderEl) return;
    if (this._loaderDismissing || loaderEl.classList.contains('fade-out')) return;

    // Safety guard: On dashboard, never dismiss the shimmer screen until UI data is actually rendered,
    // unless explicitly forced (e.g. fatal timeout / onboarding / error)
    const isOnboarding = document.body.classList.contains('onboarding-active') || (document.getElementById('onboardingPage')?.style?.display === 'flex');
    if (!force && !this._dataRendered && !isOnboarding && !this._initError) {
      console.log('[Messliner] _dismissLoaderFast held back — awaiting dashboard data render...');
      return;
    }

    const isMobile = window.innerWidth <= 768;
    let isMember = true;
    if (this.state && this.state.role === 'admin') isMember = false;
    if (document.documentElement.classList.contains('ml-is-admin') || document.body.classList.contains('role-admin')) isMember = false;

    // Minimum display time on reload for mobile member shimmer: 1.5 seconds (1500ms)
    const minDuration = (isMobile && isMember) ? 1500 : 0;
    const startTime = window.__ML_LOAD_START_TIME || Date.now();
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(0, minDuration - elapsed);

    // Check if user is currently loading directly into a subpage
    const activePage = (window.Router?.currentPage || (window.location.hash || '').replace(/^[#\/]+/, '').split('?')[0] || sessionStorage.getItem('ml_current_page') || '').toLowerCase();
    let subpagePromise = null;
    if (activePage === 'mealchart' && window.MealChartModule?.readyPromise) {
      subpagePromise = window.MealChartModule.readyPromise;
    } else if (activePage === 'fridaymeal' && window.FridayMealPageModule?.readyPromise) {
      subpagePromise = window.FridayMealPageModule.readyPromise;
    } else if ((activePage === 'bazar' || activePage === 'bazarhistory') && window.BazarHistoryModule?.readyPromise) {
      subpagePromise = window.BazarHistoryModule.readyPromise;
    } else if (activePage === 'summary' && window.SummaryModule?.readyPromise) {
      subpagePromise = window.SummaryModule.readyPromise;
    } else if (['user-bills', 'bills', 'ledger'].includes(activePage) && window.UserBillsModule?.readyPromise) {
      subpagePromise = window.UserBillsModule.readyPromise;
    }

    this._loaderDismissing = true;

    // Guaranteed minimum 1.5s delay
    const delayPromise = new Promise(resolve => setTimeout(resolve, remainingDelay));
    // Safety timeout: max 2.5s so loader never hangs under poor network
    const safetyTimeout = new Promise(resolve => setTimeout(resolve, 2500));

    try {
      if (subpagePromise) {
        await Promise.all([delayPromise, Promise.race([subpagePromise, safetyTimeout])]);
      } else {
        await delayPromise;
      }
    } catch (_) { }

    if (loaderEl) {
      loaderEl.classList.add('fade-out');
      const shellEl = document.getElementById('appShell');
      if (shellEl && !document.body.classList.contains('onboarding-active')) {
        shellEl.style.display = 'flex';
      }
      try { loaderEl.style.setProperty('display', 'none', 'important'); } catch (_) { loaderEl.style.display = 'none'; }
      setTimeout(() => {
        try { loaderEl.style.setProperty('display', 'none', 'important'); } catch (_) { loaderEl.style.display = 'none'; }
        this._loaderDismissing = false;
      }, 220);
    } else {
      this._loaderDismissing = false;
    }
  },

  /**
   * Safe localStorage caching with automatic quota management
   */
  _saveToCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('[Messliner] LocalStorage full, pruning old months for fast cache...');
      try {
        const prunedMeals = {};
        const cur = Utils.currentMonth();
        if (data.meals && data.meals[cur]) {
          prunedMeals[cur] = data.meals[cur];
        }
        const pruned = { ...data, meals: prunedMeals };
        localStorage.setItem(key, JSON.stringify(pruned));
      } catch (_) { }
    }
  },

  /**
   * Core UI & Module Population Engine (Used for both Instant Cache and Fresh Network Data)
   */
  _renderDashboardPayload(data, isFromCache) {
    this._dataRendered = true;
    window.__ML_DASHBOARD_READY = true;
    const diningId = data.mapping.diningId;
    const userId = data.mapping.userId;
    this.state.diningId = diningId;
    this.state.userId = userId;

    const userData = data.userData || { name: 'User', role: 'user', status: 'active' };
    const rawRole = userData.role || (data.mapping && data.mapping.role) || 'user';
    const isActualAdmin = (rawRole === 'admin' || rawRole === 'manager');
    this.state.actualRole = isActualAdmin ? 'admin' : 'user';
    this.state.userData = userData;

    const impActive = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ml_impersonate_user_id')) || new URLSearchParams(window.location.search).get('impersonate');
    if (impActive) {
      this.state.role = userData.role || 'user';
      this.state.isImpersonating = true;
      this.state.impersonatedUserId = impActive;
    } else if (isActualAdmin) {
      // For actual admins: check viewMode switch (admin <-> user)
      const viewPref = localStorage.getItem('viewMode') || sessionStorage.getItem('viewMode') || 'admin';
      this.state.role = (viewPref === 'user') ? 'user' : 'admin';
      this.state.isImpersonating = false;
    } else {
      // Strictly regular dining member - completely block admin mode & clear viewMode
      this.state.role = 'user';
      this.state.isImpersonating = false;
      try {
        localStorage.removeItem('viewMode');
        sessionStorage.removeItem('viewMode');
      } catch (_) { }
    }
    if (this.state.role === 'admin') {
      try { localStorage.setItem('ml_user_role', 'admin'); } catch (_) { }
      document.documentElement.classList.add('ml-is-admin');
      document.body.classList.add('role-admin');
      document.body.classList.remove('role-user');
    } else {
      try { localStorage.setItem('ml_user_role', 'user'); } catch (_) { }
      document.documentElement.classList.remove('ml-is-admin');
      document.body.classList.remove('role-admin');
      document.body.classList.add('role-user');
    }
    if (window.Router && typeof Router.setRole === 'function') {
      Router.setRole(this.state.role);
    }
    this.syncRoleLayout(this.state.role);
    this.state.userJoinedAt = userData.createdAt || null;

    // ── Step 3: Pre-calculate meal rate so stats show correct values immediately ──
    const allUsers = data.users || {};
    this.state.users = allUsers;
    this.state.diningId = diningId;
    const settings = data.settings || {};
    const isManagerMealEnabled = !!settings.managerMealEnabled;
    const rateMode = settings.rateMode || 'market';
    const currentMonth = Utils.currentMonth();

    const bazars = data.bazar || {};
    const meals = data.meals || {};

    let monthlyBazar = 0;
    Object.values(bazars).forEach(b => {
      if (Utils.isItemInMonth(b, currentMonth)) monthlyBazar += Utils.num(b.amount);
    });
    this.state.monthlyBazar = monthlyBazar;

    if (rateMode === 'fixed') {
      const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      const fixedRates = settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 };
      let fullMealRate = 0;
      if (trackedMeals.breakfast !== false) fullMealRate += (fixedRates.breakfast || 0);
      if (trackedMeals.lunch !== false) fullMealRate += (fixedRates.lunch || 0);
      if (trackedMeals.dinner !== false) fullMealRate += (fixedRates.dinner || 0);

      this.state.mealRate = fullMealRate;
      this.state.monthlyMealRate = fullMealRate;
    } else {
      let totalBazar = 0, totalMeals = 0;
      let monthlyMeals = 0;

      Object.values(bazars).forEach(b => {
        totalBazar += Utils.num(b.amount);
      });
      Object.values(meals).forEach(monthData => {
        if (!monthData || typeof monthData !== 'object') return;
        Object.values(monthData).forEach(dayData => {
          if (!dayData || typeof dayData !== 'object') return;
          Object.values(dayData).forEach(typeData => {
            if (typeof typeData === 'object' && typeData) {
              Object.entries(typeData).forEach(([uId, c]) => {
                const u = allUsers[uId];
                if (u && u.role === 'admin' && !isManagerMealEnabled) return;
                totalMeals += parseFloat(c) || 0;
              });
            }
          });
        });
      });
      const monthData = meals[currentMonth] || {};
      Object.values(monthData).forEach(dayData => {
        if (!dayData || typeof dayData !== 'object') return;
        Object.values(dayData).forEach(typeData => {
          if (typeof typeData === 'object' && typeData) {
            Object.entries(typeData).forEach(([uId, c]) => {
              const u = allUsers[uId];
              if (u && u.role === 'admin' && !isManagerMealEnabled) return;
              monthlyMeals += parseFloat(c) || 0;
            });
          }
        });
      });

      this.state.mealRate = Utils.calcMealRate(totalBazar, totalMeals);
      this.state.totalMeals = totalMeals;
      this.state.totalBazar = totalBazar;
      this.state.monthlyMealRate = monthlyMeals > 0 ? monthlyBazar / monthlyMeals : 0;
    }

    // Pre-calculate total deposits
    let totalDeposit = 0;
    const allDeposits = data.deposits || {};
    Object.values(allDeposits).forEach(d => {
      if (d && d.type === 'deposit') totalDeposit += Utils.num(d.amount);
    });
    this.state.totalDeposit = totalDeposit;

    // ── Step 4: Setup UI & modules ──
    const diningInfo = data.info || {};
    this.state.diningName = diningInfo.name || this.state.diningName || 'Messliner';
    this.state.diningCode = diningInfo.code || this.state.diningCode || '';
    this.state.settings = settings;
    this._setupUI(userData, diningInfo, settings);
    try {
      this._initModules(diningId, userId, meals, data);
    } catch (modErr) {
      console.error('[Messliner] _initModules error:', modErr);
    }

    // ── Step 4b: Inject data directly into UserDashboard ──
    try {
      UserDashboard.userData = userData;
      UserDashboard.settings = settings;
      UserDashboard.diningInfo = diningInfo;
      UserDashboard.monthlyBazar = monthlyBazar;

      // Process per-user monthly deposits
      {
        let mDeposit = 0, mOtherCost = 0, mDeduction = 0;
        const uDepositsArr = [];
        Object.values(allDeposits).forEach(d => {
          if (d && d.userId === userId) {
            uDepositsArr.push(d);
            if (Utils.isItemInMonth(d, currentMonth)) {
              const amt = Math.abs(Utils.num(d.amount));
              if (d.type === 'deposit') mDeposit += amt;
              else if (d.type === 'other_costing') mOtherCost += amt;
              else if (d.type === 'deduction' || d.type === 'friday_meal') mDeduction += amt;
              else mDeduction += amt;
            }
          }
        });
        UserDashboard.userDepositsData = uDepositsArr;
        UserDashboard.monthlyDeposit = mDeposit;
        UserDashboard.monthlyOtherCosting = mOtherCost;
        UserDashboard.monthlyDeduction = mDeduction;
      }

      // Process per-user monthly meals
      {
        const monthMealsData = meals[currentMonth] || {};
        UserDashboard.monthMealsData = monthMealsData;
        let mMeals = 0;
        const mBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
        Object.values(monthMealsData).forEach(dayData => {
          if (!dayData || typeof dayData !== 'object') return;
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeof typeData === 'object' && typeData && typeData[userId] !== undefined) {
              const count = parseFloat(typeData[userId]) || 0;
              mMeals += count;
              if (mBreakdown[type] !== undefined) mBreakdown[type] += count;
            }
          });
        });
        UserDashboard.monthlyMeals = mMeals;
        UserDashboard.monthlyMealsBreakdown = mBreakdown;
      }

      // Hydrate and listen to notifications early so badge is accurate from 0ms
      if (window.Notifications && typeof Notifications.initListener === 'function') {
        Notifications.initListener(diningId, userId, userData.createdAt || null);
      }

      UserDashboard._activityDataReady = true;
      UserDashboard.renderStats();
      UserDashboard.renderMealToggles();
      UserDashboard.renderRecentActivity(diningId);
      if (typeof UserDashboard.updateMyMealVisibility === 'function') {
        UserDashboard.updateMyMealVisibility();
      }
    } catch (dashErr) {
      console.error('[Messliner] UserDashboard render error:', dashErr);
    }

    // ── Step 4c: Inject data directly into HistoryModule ──
    try {
      HistoryModule.currentUserData = userData;
      HistoryModule.settings = settings;
      HistoryModule.diningInfo = data.info || {};
      HistoryModule.usersMap = allUsers;
      HistoryModule.cachedMeals = meals;
      if (typeof HistoryModule.applyAiAssistantSettings === 'function') {
        HistoryModule.applyAiAssistantSettings();
      }

      {
        const uDepositsArr = [];
        Object.values(allDeposits).forEach(d => {
          if (d && d.userId === userId) {
            uDepositsArr.push(d);
          }
        });
        uDepositsArr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        HistoryModule.userDepositsList = uDepositsArr;
      }

      {
        const mBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
        Object.values(meals).forEach(monthData => {
          if (!monthData || typeof monthData !== 'object') return;
          Object.values(monthData).forEach(dayData => {
            if (!dayData || typeof dayData !== 'object') return;
            Object.entries(dayData).forEach(([type, typeData]) => {
              if (typeof typeData === 'object' && typeData && typeData[userId] !== undefined) {
                const count = parseFloat(typeData[userId]) || 0;
                if (mBreakdown[type] !== undefined) {
                  mBreakdown[type] += count;
                }
              }
            });
          });
        });
        HistoryModule.mealsBreakdown = mBreakdown;
      }

      HistoryModule.renderProfile(userData);
      if (HistoryModule.userDepositsList) {
        HistoryModule.renderDepositHistory(HistoryModule.userDepositsList);
      }
    } catch (histErr) {
      console.error('[Messliner] HistoryModule render error:', histErr);
    }

    // ── Step 4d: Inject data directly into UserBillsModule ──
    try {
      if (window.UserBillsModule) {
        UserBillsModule.bills = data.bills || {};
        UserBillsModule.paymentRequests = data.paymentRequests || {};
        UserBillsModule.userDeposits = allDeposits;
        UserBillsModule.mealsData = meals;
        UserBillsModule.paymentMethods = settings?.paymentMethods || {};
        UserBillsModule.historyStartDate = settings?.historyStartDate || null;
        UserBillsModule.renderOverview();
        UserBillsModule.renderBills();
        UserBillsModule.renderHistory();
      }
    } catch (billsErr) {
      console.error('[Messliner] UserBillsModule render error:', billsErr);
    }

    // ── Step 5: Show app shell & Router ──
    document.body.classList.remove('onboarding-active');
    const onboardingPage = document.getElementById('onboardingPage');
    if (onboardingPage) onboardingPage.style.display = 'none';
    const appShell = document.getElementById('appShell');
    if (appShell) appShell.style.display = 'flex';
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.style.removeProperty('display');

    if (window.Router) {
      if (typeof Router.setRole === 'function') {
        Router.setRole(this.state.role);
      }
      if (!Router.currentPage) {
        Router.init(this.state.role);
      } else {
        const initialPage = typeof Router.getPageFromUrl === 'function' ? Router.getPageFromUrl() : null;
        if (initialPage && initialPage !== 'dashboard' && Router.currentPage === 'dashboard') {
          Router.navigate(initialPage, true);
        }
      }
    }

    if (typeof HistoryPageModule !== 'undefined') {
      HistoryPageModule.init(diningId);
    }

    if (this.state.role === 'admin' && window.OverviewModule) {
      OverviewModule.refresh(data);
    }

    // ── Step 5: Evaluate Subscription & Licensing ──
    const subData = data.subscription || null;
    let subInfo = { canWrite: true, isExpired: false, isGracePeriod: false, status: 'active', membersLimit: 25 };
    if (window.MesslinerSubscription && typeof MesslinerSubscription.evaluateSubscription === 'function') {
      subInfo = MesslinerSubscription.evaluateSubscription(subData);
    }
    this.state.subscription = subInfo;
    window.currentSubInfo = subInfo;
    this._renderSubscriptionUI(subInfo);

    // If new mess / unconfigured (no subscription in Admin DB or User DB), auto-record Free Trial
    if (!subData && subInfo && subInfo.isTrial) {
      const trialRecord = {
        plan: 'trial',
        planName: '30-Day Free Trial',
        status: 'active',
        billingCycle: 'monthly',
        startDate: Date.now(),
        expiresAt: subInfo.expiresAt,
        graceEndsAt: subInfo.graceEndsAt,
        membersLimit: 25,
        isTrial: true,
        createdAt: Date.now()
      };
      if (window.adminDb && mapping.diningId) {
        window.adminDb.ref(`subscriptions/${mapping.diningId}`).set(trialRecord).catch(() => { });
        window.adminDb.ref(`dinings/${mapping.diningId}/subscription`).set(trialRecord).catch(() => { });
      }
      if (window.db && mapping.diningId) {
        window.db.ref(`dinings/${mapping.diningId}/subscription`).set(trialRecord).catch(() => { });
      }
    }
  },

  /**
   * Render Grace Period & Subscription Expired Locks and Admin Plan Banner Card
   */
  _renderSubscriptionUI(subInfo) {
    if (!subInfo) return;

    const isAdmin = this.state.role === 'admin' || this.state.role === 'manager';
    const subCard = document.getElementById('dynamicSubCard') || document.querySelector('.premium-banner-card');
    const titleEl = document.getElementById('subCardTitle');
    const badgeEl = document.getElementById('subCardBadge');
    const badgeTextEl = document.getElementById('subCardBadgeText');
    const subtitleEl = document.getElementById('subCardSubtitle');
    const iconEl = document.getElementById('subCardIcon');

    if (subCard) {
      const isMobile = window.innerWidth <= 1024;
      if (isAdmin && !isMobile) {
        subCard.classList.remove('hidden');
        subCard.style.setProperty('display', 'flex', 'important');

        // Reset all theme classes
        subCard.classList.remove('sub-theme-trial', 'sub-theme-active', 'sub-theme-grace', 'sub-theme-expired');

        // Format expiration date nicely
        let expiryFormatted = '';
        if (subInfo.expiresAt) {
          try {
            const d = new Date(subInfo.expiresAt);
            expiryFormatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch (_) { }
        }

        // Logic strictly aligned with checkout.html
        if (subInfo.isExpired) {
          subCard.classList.add('sub-theme-expired');
          subCard.href = 'checkout.html?plan=pro';
          if (titleEl) titleEl.textContent = 'Subscription Expired';
          if (badgeEl) {
            badgeEl.style.display = 'inline-flex';
            if (badgeTextEl) badgeTextEl.textContent = 'Expired · Renewal Due';
          }
          if (subtitleEl) subtitleEl.textContent = 'Mess access is in read-only mode · Renew to reactivate write access';
          if (iconEl) {
            iconEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          `;
          }
        } else if (subInfo.isGracePeriod) {
          subCard.classList.add('sub-theme-grace');
          subCard.href = 'checkout.html?plan=pro';
          if (titleEl) titleEl.textContent = 'Grace Period Active';
          if (badgeEl) {
            badgeEl.style.display = 'inline-flex';
            if (badgeTextEl) badgeTextEl.textContent = `⚠️ ${subInfo.graceDaysLeft}d Grace Remaining`;
          }
          if (subtitleEl) subtitleEl.textContent = `Plan expired${expiryFormatted ? ' on ' + expiryFormatted : ''} · Renew now to prevent lockout`;
          if (iconEl) {
            iconEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          `;
          }
        } else if (subInfo.isTrial) {
          subCard.classList.add('sub-theme-trial');
          subCard.href = 'checkout.html?plan=pro';
          if (titleEl) titleEl.textContent = 'Free Trial Active';
          if (badgeEl) {
            badgeEl.style.display = 'inline-flex';
            if (badgeTextEl) badgeTextEl.textContent = `${subInfo.daysLeft}D LEFT`;
          }
          if (subtitleEl) {
            subtitleEl.textContent = expiryFormatted
              ? `Active until ${expiryFormatted} · Upgrade to Premium for unlimited members & priority support`
              : 'Upgrade to Premium for unlimited members, AI assist & priority support';
          }
          if (iconEl) {
            iconEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
            </svg>
          `;
          }
        } else if (subInfo.plan === 'pro') {
          subCard.classList.add('sub-theme-active');
          subCard.href = 'checkout.html?plan=pro';
          if (titleEl) titleEl.textContent = 'Messliner Pro';
          if (badgeEl) {
            badgeEl.style.display = 'inline-flex';
            if (badgeTextEl) badgeTextEl.textContent = `✓ Active · ${subInfo.daysLeft}d Left`;
          }
          if (subtitleEl) subtitleEl.textContent = `Active until ${expiryFormatted || 'Renewal'} · Unlimited members & priority support`;
          if (iconEl) {
            iconEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          `;
          }
        } else if (subInfo.plan === 'pay_as_you_go') {
          subCard.classList.add('sub-theme-active');
          subCard.href = 'checkout.html?plan=pay_as_you_go';
          if (titleEl) titleEl.textContent = 'Pay As You Go';
          if (badgeEl) {
            badgeEl.style.display = 'inline-flex';
            if (badgeTextEl) badgeTextEl.textContent = `✓ Active · ${subInfo.daysLeft}d Left`;
          }
          if (subtitleEl) subtitleEl.textContent = `Active until ${expiryFormatted || 'Renewal'} · ${subInfo.membersLimit || 25} members allocated`;
          if (iconEl) {
            iconEl.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <polyline points="17 11 19 13 23 9"></polyline>
            </svg>
          `;
          }
        }
      } else {
        subCard.classList.add('hidden');
        subCard.style.setProperty('display', 'none', 'important');
      }
    }

    // 1. Grace Period Notice Banner
    let graceBanner = document.getElementById('subGracePeriodBanner');
    if (subInfo.isGracePeriod) {
      if (!graceBanner) {
        graceBanner = document.createElement('div');
        graceBanner.id = 'subGracePeriodBanner';
        graceBanner.style.cssText = 'background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border-bottom: 1.5px solid #F59E0B; color: #92400E; padding: 10px 16px; font-size: 0.82rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 9999; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);';
        document.body.prepend(graceBanner);
      }
      graceBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.1rem;">⚠️</span>
        <span>Your plan has expired! You are in a <strong>3-Day Grace Period (${subInfo.graceDaysLeft} day${subInfo.graceDaysLeft > 1 ? 's' : ''} remaining)</strong>. Please renew to keep full mess access.</span>
      </div>
      <a href="checkout.html?plan=pro" style="background: #D97706; color: #ffffff; padding: 5px 14px; border-radius: 8px; text-decoration: none; font-size: 0.78rem; font-weight: 800; white-space: nowrap; margin-left: 12px; box-shadow: 0 2px 6px rgba(217, 119, 6, 0.3);">Renew Now</a>
    `;
      graceBanner.style.display = 'flex';
    } else if (graceBanner) {
      graceBanner.style.display = 'none';
    }

    // 2. Completely Expired Lock Modal
    const lockModal = document.getElementById('subExpiredLockModal');
    if (subInfo.isExpired && !subInfo.canWrite) {
      document.body.classList.add('sub-expired-lock');
      if (lockModal) {
        lockModal.style.display = 'flex';
        lockModal.classList.add('active');
        const planNameEl = document.getElementById('subLockPlanName');
        if (planNameEl) planNameEl.textContent = subInfo.planName || 'Plan';
      }
    } else {
      document.body.classList.remove('sub-expired-lock');
      if (lockModal) {
        lockModal.style.display = 'none';
        lockModal.classList.remove('active');
      }
    }
  },

  /**
   * Setup UI elements (sidebar, header, etc.)
   */
  _setupUI(userData, diningInfo = null, settings = null) {
    const role = this.state.role;
    const isAdmin = role === 'admin' || role === 'manager';
    this.state.userName = userData.name || 'User';

    document.body.classList.toggle('role-admin', isAdmin);
    document.body.classList.toggle('role-user', !isAdmin);
    if (isAdmin) {
      document.documentElement.classList.add('ml-is-admin');
      try { localStorage.setItem('ml_user_role', 'admin'); } catch (_) { }
    } else {
      document.documentElement.classList.remove('ml-is-admin');
      try { localStorage.setItem('ml_user_role', 'user'); } catch (_) { }
    }

    // Sync role-based layout immediately (Admin = Overview on Dashboard; Member = My Meal on Dashboard)
    this.syncRoleLayout(role);

    // Early show app shell so layout is visible
    const appShellEarly = document.getElementById('appShell');
    if (appShellEarly && appShellEarly.style.display === 'none') {
      appShellEarly.style.display = 'flex';
    }

    // Update dynamic top header greeting
    this.updateHomeHeaderGreeting(userData.name);

    // Sidebar brand & Home page Mess Info — instant zero-latency population
    const name = (diningInfo && diningInfo.name) || this.state.diningName || 'Messliner';
    const code = (diningInfo && diningInfo.code) || this.state.diningCode || '';
    this.state.diningName = name;
    this.state.diningCode = code;
    Utils.setText('sidebarDiningName', name);
    document.title = `Messliner — ${name}`;

    const messInfoText = code ? `${name} · ${code}` : name;
    Utils.setText('mymealMessInfo', messInfoText);

    // Live listener if mess name changes
    if (!this._diningNameListenerBound) {
      this._diningNameListenerBound = true;
      db.ref(`dinings/${this.state.diningId}/info/name`).on('value', (snap) => {
        const liveName = snap.val();
        if (liveName) {
          this.state.diningName = liveName;
          Utils.setText('sidebarDiningName', liveName);
          document.title = `Messliner — ${liveName}`;
          const currentCode = this.state.diningCode || '';
          Utils.setText('mymealMessInfo', currentCode ? `${liveName} · ${currentCode}` : liveName);
        }
      });
    }

    // Sidebar role label
    Utils.setText('sidebarRole', isAdmin ? 'Admin Panel' : 'Member Panel');

    // User info in sidebar & header
    Utils.setText('sidebarUserName', userData.name || 'User');
    Utils.setText('sidebarUserRole', isAdmin ? 'Meal Manager' : 'Member');
    Utils.setText('sidebarAvatar', Utils.initials(userData.name));

    Utils.setText('headerUserName', userData.name || 'User');
    Utils.setText('headerUserRole', userData.email || (isAdmin ? 'Meal Manager' : 'Member'));
    Utils.setText('headerAvatar', Utils.initials(userData.name));

    // Keyboard shortcut (Cmd+F / Ctrl+F) for top header search bar
    if (!window._headerSearchShortcutBound) {
      window._headerSearchShortcutBound = true;
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
          const searchInput = document.getElementById('headerSearchInput');
          if (searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
          }
        }
      });
    }

    // Show/hide admin nav
    const adminNav = document.getElementById('adminNav');
    if (adminNav) adminNav.style.display = isAdmin ? 'block' : 'none';

    // Show/hide admin quick actions on dashboard
    const quickActions = document.getElementById('adminQuickActions');
    if (quickActions) quickActions.classList.toggle('hidden', !isAdmin);

    // Hide Dining Overview nav item for Admin since it's on their Dashboard
    const overviewNavBtn = document.querySelector('.sidebar-nav button[data-page="overview"]');
    if (overviewNavBtn) {
      overviewNavBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    // Hide Bills nav item for Admin since Admin has Ledger in adminNav
    const billsNavBtn = document.getElementById('nav-item-bills') || document.querySelector('.sidebar-nav button[data-page="user-bills"]');
    if (billsNavBtn) {
      billsNavBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    // Show/hide AI Assistant nav item based on admin role or dining settings
    const activeSettings = settings || this.state.settings || (window.HistoryModule && HistoryModule.settings) || {};
    const isAiEnabled = activeSettings.aiAssistantEnabled !== false;
    const aiNavBtn = document.getElementById('nav-item-aiassistant');
    if (aiNavBtn) {
      aiNavBtn.style.display = (isAdmin || isAiEnabled) ? 'flex' : 'none';
    }

    // Mobile bottom navigation role sync
    // Admin: 1. Dashboard, 2. Meals, 3. Finance, 4. My Meal, 5. More
    // User:  1. Home, 2. Dining, 3. Bills, 4. Profile
    const navMyMeal = document.getElementById('navMyMeal');
    const bottomNavMyMeal = document.getElementById('bottomNavMyMeal');
    if (navMyMeal) navMyMeal.style.display = (isAdmin && !!activeSettings.managerMealEnabled) ? 'flex' : 'none';
    if (bottomNavMyMeal) bottomNavMyMeal.style.display = isAdmin ? 'flex' : 'none';

    const bottomOverviewBtn = document.getElementById('bottomNavOverview') || document.querySelector('.bottom-nav-item[data-page="overview"]');
    if (bottomOverviewBtn) {
      bottomOverviewBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    const bottomMealsBtn = document.getElementById('bottomNavMeals') || document.querySelector('.bottom-nav-item[data-page="meals"]');
    if (bottomMealsBtn) {
      bottomMealsBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    const bottomFinanceBtn = document.getElementById('bottomNavFinance') || document.querySelector('.bottom-nav-item[data-page="finance"]');
    if (bottomFinanceBtn) {
      bottomFinanceBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    const bottomBillsBtn = document.getElementById('bottomNavBills') || document.querySelector('.bottom-nav-item[data-page="user-bills"]');
    if (bottomBillsBtn) {
      bottomBillsBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    const bottomProfileBtn = document.getElementById('bottomNavProfile') || document.querySelector('.bottom-nav-item[data-page="profile"]');
    if (bottomProfileBtn) {
      bottomProfileBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    const bottomMoreBtn = document.getElementById('bottomNavMore');
    if (bottomMoreBtn) {
      bottomMoreBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    const bottomHomeLabel = document.getElementById('bottomNavHomeLabel');
    if (bottomHomeLabel) {
      bottomHomeLabel.textContent = isAdmin ? 'Dashboard' : 'Home';
    }

    const bottomAssistBtn = document.querySelector('.bottom-nav-item[data-page="aiassistant"]');
    if (bottomAssistBtn) {
      bottomAssistBtn.style.display = 'none'; // Assist removed as requested
    }

    if (window.Router && typeof Router.updateBottomNavIndicator === 'function') {
      Router.updateBottomNavIndicator(true);
    }

    // Hide mobile menu button (hamburger menu on the left) for non-admin
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    if (mobileMenuBtn) {
      mobileMenuBtn.classList.toggle('hidden', !isAdmin);
    }

    // Hide History nav button & member nav cards for non-admin
    const historyNavBtn = document.getElementById('nav-item-history');
    if (historyNavBtn) {
      historyNavBtn.style.display = isAdmin ? 'flex' : 'none';
    }
    const historyMemberCard = document.querySelector('.member-nav-card[onclick*="history"]');
    if (historyMemberCard) {
      historyMemberCard.style.display = isAdmin ? 'flex' : 'none';
    }

    // Role-based Bazar view toggling (Admin -> Management / Routine, User -> Clean History List)
    const bazarUserView = document.getElementById('bazarUserViewContainer');
    const bazarAdminView = document.getElementById('bazarAdminViewContainer');
    if (bazarUserView) bazarUserView.style.display = isAdmin ? 'none' : 'block';
    if (bazarAdminView) bazarAdminView.style.display = isAdmin ? 'block' : 'none';
  },

  /**
   * Open Mobile Manager Panel More Sheet
   */
  openMoreSheet() {
    const overlay = document.getElementById('moreSheetOverlay');
    const sheet = document.getElementById('moreBottomSheet');
    if (!overlay || !sheet) return;
    this._moreSheetOpenedAt = Date.now();
    overlay.classList.add('active');
    sheet.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  /**
   * Toggle Mobile Manager Panel More Sheet
   */
  toggleMoreSheet() {
    const overlay = document.getElementById('moreSheetOverlay');
    const sheet = document.getElementById('moreBottomSheet');
    if (!overlay || !sheet) return;
    const isActive = overlay.classList.contains('active');
    if (isActive) {
      this.closeMoreSheet();
    } else {
      this.openMoreSheet();
    }
  },

  /**
   * Close Mobile Manager Panel More Sheet
   */
  closeMoreSheet(force = false) {
    if (!force && this._moreSheetOpenedAt && (Date.now() - this._moreSheetOpenedAt < 350)) {
      return;
    }
    const overlay = document.getElementById('moreSheetOverlay');
    const sheet = document.getElementById('moreBottomSheet');
    if (overlay) overlay.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    document.body.style.removeProperty('overflow');
  },

  /**
   * Initialize all modules
   */
  _initModules(diningId, userId, mealsData, initialData) {
    const isAdmin = this.state.role === 'admin';

    // Always init these
    if (window.Notifications && typeof Notifications.initListener === 'function') {
      Notifications.initListener(diningId, userId, this.state.userJoinedAt);
    }
    UsersModule.init(diningId, initialData);
    UserDashboard.init(diningId, userId, initialData);
    HistoryModule.init(diningId, userId);
    OverviewModule.init(diningId, initialData);
    if (window.MealChartModule) MealChartModule.init(diningId, userId);
    if (window.BazarHistoryModule) {
      BazarHistoryModule.init(diningId, userId, initialData);
      Messliner.bazarHistory = BazarHistoryModule;
    }
    if (window.SummaryModule) {
      SummaryModule.init(diningId, userId);
      Messliner.summary = SummaryModule;
    }
    if (window.BazarModule) {
      BazarModule.init(diningId, userId, initialData);
      Messliner.bazar = BazarModule;
    }
    if (window.UserBillsModule) {
      UserBillsModule.init(diningId, userId, initialData);
      Messliner.userBills = UserBillsModule;
    }

    // Admin-only modules
    if (isAdmin) {
      MealsModule.init(diningId);
      FinanceModule.init(diningId, initialData);
      if (window.LedgerModule) {
        LedgerModule.init(diningId, initialData);
        Messliner.ledger = LedgerModule;
      }
      SettingsModule.init(diningId, initialData);
      UserDashboard.renderAdminQuickActions();
      if (window.FridayMealsModule) {
        FridayMealsModule.init(diningId);
        Messliner.fridayMeals = FridayMealsModule;
      }
      if (window.SMSAlertModule) {
        SMSAlertModule.init(diningId);
        Messliner.smsAlert = SMSAlertModule;
      }
      if (Messliner.aiControl) {
        Messliner.aiControl.init(diningId);
      }
    }

    // Friday Meal Page (available to all roles)
    if (window.FridayMealPageModule) {
      FridayMealPageModule.init(diningId, userId);
      Messliner.fridayMealPage = FridayMealPageModule;
    }

    // Recent activity
    UserDashboard.renderRecentActivity(diningId);

    // Meal history for profile
    HistoryModule.renderMealHistory(diningId, userId, mealsData);
  },

  /**
   * Setup reactive Firebase listeners for live updates after initial load.
   * These run in the background and recalculate/re-render when data changes.
   */
  _setupLiveListeners(diningId) {
    // ── Reactive Subscription State Listeners (Realtime synchronization with Messliner_Admin & Payments) ──
    // 1. Primary: Central Admin RTDB Listener (instant response when Super Admin activates/modifies in Messliner_Admin)
    if (window.adminDb) {
      window.adminDb.ref(`subscriptions/${diningId}`).on('value', (snap) => {
        const freshSub = snap.val();
        if (freshSub) {
          if (window.MesslinerSubscription && typeof MesslinerSubscription.evaluateSubscription === 'function') {
            const subInfo = MesslinerSubscription.evaluateSubscription(freshSub);
            this.state.subscription = subInfo;
            window.currentSubInfo = subInfo;
            this._renderSubscriptionUI(subInfo);
            // Dual-sync to User DB backup
            if (window.db) window.db.ref(`dinings/${diningId}/subscription`).set(freshSub).catch(() => { });
          }
        }
      });
    }

    // 2. Backup: User RTDB Listener
    db.ref(`dinings/${diningId}/subscription`).on('value', (snap) => {
      const freshSub = snap.val();
      if (freshSub) {
        if (window.MesslinerSubscription && typeof MesslinerSubscription.evaluateSubscription === 'function') {
          const subInfo = MesslinerSubscription.evaluateSubscription(freshSub);
          this.state.subscription = subInfo;
          window.currentSubInfo = subInfo;
          this._renderSubscriptionUI(subInfo);
        }
      }
    });

    db.ref(`dinings/${diningId}/bazar`).on('value', () => this._recalcMealRate());
    db.ref(`dinings/${diningId}/meals`).on('value', () => this._recalcMealRate());
    db.ref(`dinings/${diningId}/deposits`).on('value', () => this._recalcDeposits());
    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      const freshSettings = snap.val() || {};
      this.state.settings = freshSettings;
      const isAdmin = this.state.role === 'admin';
      const isAiEnabled = freshSettings.aiAssistantEnabled !== false;

      const aiNavBtn = document.getElementById('nav-item-aiassistant');
      if (aiNavBtn) {
        aiNavBtn.style.display = (isAdmin || isAiEnabled) ? 'flex' : 'none';
      }

      if (window.HistoryModule) {
        HistoryModule.settings = freshSettings;
        if (typeof HistoryModule.applyAiAssistantSettings === 'function') {
          HistoryModule.applyAiAssistantSettings();
        }
      }

      if (window.UserDashboard) {
        UserDashboard.settings = freshSettings;
        if (typeof UserDashboard.updateMyMealVisibility === 'function') {
          UserDashboard.updateMyMealVisibility();
        }
      }

      if (!isAdmin && !isAiEnabled && window.Router && Router.currentPage === 'aiassistant') {
        Router.navigate('dashboard');
      }
    });
  },

  /**
   * Calculate meal rate from bazar and total meals
   */
  async _calcMealRate() {
    try {
      const [bazarSnap, mealsSnap, usersSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${this.state.diningId}/bazar`).once('value'),
        db.ref(`dinings/${this.state.diningId}/meals`).once('value'),
        db.ref(`dinings/${this.state.diningId}/users`).once('value'),
        db.ref(`dinings/${this.state.diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const isManagerMealEnabled = !!settings.managerMealEnabled;

      let totalBazar = 0;
      let totalMeals = 0;

      const bazars = bazarSnap.val() || {};
      Object.values(bazars).forEach(b => { totalBazar += Utils.num(b.amount); });

      const meals = mealsSnap.val() || {};
      Object.values(meals).forEach(monthData => {
        Object.values(monthData).forEach(dayData => {
          Object.values(dayData).forEach(typeData => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uId, c]) => {
                const user = users[uId];
                if (user && user.role === 'admin' && !isManagerMealEnabled) {
                  return; // Skip manager meals
                }
                totalMeals += parseInt(c) || 0;
              });
            }
          });
        });
      });

      const rateMode = settings.rateMode || 'market';
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        const fixedRates = settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 };
        let fullMealRate = 0;
        if (trackedMeals.breakfast !== false) fullMealRate += (fixedRates.breakfast || 0);
        if (trackedMeals.lunch !== false) fullMealRate += (fixedRates.lunch || 0);
        if (trackedMeals.dinner !== false) fullMealRate += (fixedRates.dinner || 0);

        this.state.mealRate = fullMealRate;
        this.state.totalMeals = totalMeals;
        this.state.totalBazar = totalBazar;
        this.state.monthlyMealRate = fullMealRate;
      } else {
        this.state.mealRate = Utils.calcMealRate(totalBazar, totalMeals);
        this.state.totalMeals = totalMeals;
        this.state.totalBazar = totalBazar;

        // Calculate current-month meal rate
        const _currentMonth = Utils.currentMonth();
        let _monthlyBazar = 0;
        let _monthlyMeals = 0;
        Object.values(bazars).forEach(b => {
          if (Utils.isItemInMonth(b, _currentMonth)) _monthlyBazar += Utils.num(b.amount);
        });
        const _monthData = meals[_currentMonth] || {};
        Object.values(_monthData).forEach(dayData => {
          Object.values(dayData).forEach(typeData => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uId, c]) => {
                const user = users[uId];
                if (user && user.role === 'admin' && !isManagerMealEnabled) return;
                _monthlyMeals += parseFloat(c) || 0;
              });
            }
          });
        });
        this.state.monthlyMealRate = _monthlyMeals > 0 ? _monthlyBazar / _monthlyMeals : 0;
      }

      // Also calculate total deposits
      const depositsSnap = await db.ref(`dinings/${this.state.diningId}/deposits`).once('value');
      let totalDeposit = 0;
      const deposits = depositsSnap.val() || {};
      Object.values(deposits).forEach(d => {
        if (d.type === 'deposit') totalDeposit += Utils.num(d.amount);
      });
      this.state.totalDeposit = totalDeposit;

      console.log('[Messliner] Meal Rate:', this.state.mealRate.toFixed(2), '| Monthly:', this.state.monthlyMealRate.toFixed(2));

      // Re-render user dashboard stats with correct rate
      UserDashboard.renderStats();

    } catch (error) {
      console.error('[Messliner] Meal rate calc error:', error);
    }

    // Live listeners are now set up separately via _setupLiveListeners()
  },

  /**
   * Recalculate meal rate (debounced)
   */
  _recalcMealRate: Utils.debounce(async function () {
    try {
      const [bazarSnap, mealsSnap, usersSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${Messliner.state.diningId}/bazar`).once('value'),
        db.ref(`dinings/${Messliner.state.diningId}/meals`).once('value'),
        db.ref(`dinings/${Messliner.state.diningId}/users`).once('value'),
        db.ref(`dinings/${Messliner.state.diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const isManagerMealEnabled = !!settings.managerMealEnabled;

      let totalBazar = 0;
      let totalMeals = 0;

      Object.values(bazarSnap.val() || {}).forEach(b => { totalBazar += Utils.num(b.amount); });
      Object.values(mealsSnap.val() || {}).forEach(monthData => {
        Object.values(monthData).forEach(dayData => {
          Object.values(dayData).forEach(typeData => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uId, c]) => {
                const user = users[uId];
                if (user && user.role === 'admin' && !isManagerMealEnabled) {
                  return; // Skip manager meals
                }
                totalMeals += parseFloat(c) || 0;
              });
            }
          });
        });
      });

      Messliner.state.mealRate = Utils.calcMealRate(totalBazar, totalMeals);
      Messliner.state.totalMeals = totalMeals;
      Messliner.state.totalBazar = totalBazar;

      // Recalculate current-month meal rate
      const _cm = Utils.currentMonth();
      let _mBazar = 0;
      let _mMeals = 0;
      Object.values(bazarSnap.val() || {}).forEach(b => {
        if (Utils.isItemInMonth(b, _cm)) _mBazar += Utils.num(b.amount);
      });
      const _md = (mealsSnap.val() || {})[_cm] || {};
      Object.values(_md).forEach(dayData => {
        Object.values(dayData).forEach(typeData => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, c]) => {
              const user = users[uId];
              if (user && user.role === 'admin' && !isManagerMealEnabled) return;
              _mMeals += parseFloat(c) || 0;
            });
          }
        });
      });
      Messliner.state.monthlyMealRate = _mMeals > 0 ? _mBazar / _mMeals : 0;

      // Refresh current page
      if (Router.currentPage === 'dashboard') UserDashboard.renderStats();
      if (Router.currentPage === 'profile') HistoryModule.refresh();
    } catch (e) {
      console.error('Recalc error:', e);
    }
  }, 500),

  /**
   * Recalculate total deposits
   */
  _recalcDeposits: Utils.debounce(async function () {
    try {
      const snap = await db.ref(`dinings/${Messliner.state.diningId}/deposits`).once('value');
      let total = 0;
      Object.values(snap.val() || {}).forEach(d => {
        if (d.type === 'deposit') total += Utils.num(d.amount);
      });
      Messliner.state.totalDeposit = total;
      if (Router.currentPage === 'dashboard') UserDashboard.renderStats();
    } catch (e) {
      console.error('Deposit recalc error:', e);
    }
  }, 500),

  /**
   * Setup online/offline connectivity indicator
   */
  _setupConnectivity() {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;

    // Firebase connectivity
    const connRef = db.ref('.info/connected');
    connRef.on('value', (snap) => {
      const connected = snap.val() === true;
      indicator.className = `sync-indicator ${connected ? 'connected' : 'disconnected'}`;
      indicator.querySelector('span').textContent = connected ? 'Live' : 'Offline';
    });
  }
};

// ======== AUTO-INIT on dashboard.html ========
// Early instant layout sync before full init to prevent any flicker of member view
(function () {
  try {
    const viewMode = localStorage.getItem('viewMode') || sessionStorage.getItem('viewMode');
    const rawToken = localStorage.getItem('sb-pgnjvtmofglkjplotrha-auth-token');
    const em = rawToken ? JSON.parse(rawToken)?.user?.email : null;
    let role = localStorage.getItem('ml_user_role');
    if (!role && em) {
      const c = localStorage.getItem('ml_cache_v2_' + em.replace(/\./g, ',')) || localStorage.getItem('ml_cache_v2_' + em.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_'));
      if (c) role = JSON.parse(c)?.userData?.role;
      if (!role) {
        const m = localStorage.getItem('ml_map_' + em.replace(/\./g, ',')) || localStorage.getItem('ml_map_' + em.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_'));
        if (m) role = JSON.parse(m)?.role;
      }
    }
    const isActualAdmin = (role === 'admin' || role === 'manager');
    if (isActualAdmin && viewMode === 'user') {
      role = 'user';
    }
    if ((role === 'admin' || role === 'manager' || document.documentElement.classList.contains('ml-is-admin')) && viewMode !== 'user') {
      document.documentElement.classList.add('ml-is-admin');
      document.body.classList.add('role-admin');
      document.body.classList.remove('role-user');
      if (window.Messliner && typeof window.Messliner.syncRoleLayout === 'function') {
        window.Messliner.syncRoleLayout('admin');
      }
    } else {
      document.documentElement.classList.remove('ml-is-admin');
      document.body.classList.remove('role-admin');
      document.body.classList.add('role-user');
      if (window.Messliner && typeof window.Messliner.syncRoleLayout === 'function') {
        window.Messliner.syncRoleLayout('user');
      }
    }
  } catch (_) { }
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('appShell')) {
      Messliner.init();
    }
  });
} else {
  if (document.getElementById('appShell')) {
    Messliner.init();
  }
}

// Global Custom Dropdowns Manager (Scrolling to selected option, closing on click-outside, exclusive toggles)
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.custom-dropdown-trigger');
  const customDropdown = e.target.closest('.custom-dropdown');

  if (trigger) {
    const dropdown = trigger.parentElement;
    // Close all other dropdowns
    document.querySelectorAll('.custom-dropdown.active').forEach(dd => {
      if (dd !== dropdown) {
        dd.classList.remove('active');
      }
    });
    // Scroll selected item into view after dropdown opens
    setTimeout(() => {
      if (dropdown.classList.contains('active')) {
        const selected = dropdown.querySelector('.custom-dropdown-item.selected');
        if (selected) {
          selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    }, 50);
  } else if (!customDropdown) {
    // Clicked outside any custom dropdown - close all active ones
    document.querySelectorAll('.custom-dropdown.active').forEach(dd => {
      dd.classList.remove('active');
    });
  }
}, true);

// Global Cursor-Tracking Spotlight Effect for Stat Cards
document.addEventListener('mousemove', (e) => {
  const card = e.target.closest('.stat-card');
  if (card) {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  }
});
console.log('[Messliner] App module loaded');
