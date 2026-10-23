/* ============================================
   Messliner — Main App Entry Point (app.js)
   ============================================ */

/**
 * Global Messliner namespace
 * All modules are attached here for cross-module access
 */
window.Messliner = window.DineDesk = {
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
        await auth.signOut();
        window.location.href = 'index.html';
      } catch (error) {
        console.error('Logout error:', error);
        Notifications.toast('error', 'Error', 'Failed to sign out.');
      }
    }
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
  smsAlert: null,

  /**
   * Dynamically update top header with dynamic greeting & user display name on Home
   */
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
   * Initialize the app — called on dashboard.html load
   */
  async init() {
    console.log('[Messliner] Initializing app...');

    // Fast synchronous boot check from localStorage / window cache (0ms latency!)
    let syncUser = null;
    try {
      if (window.__ML_BOOT_USER) {
        syncUser = window.__ML_BOOT_USER;
      } else {
        const raw = localStorage.getItem('sb-pgnjvtmofglkjplotrha-auth-token');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.user) {
            syncUser = parsed.user;
            syncUser.uid = syncUser.user_metadata?.firebase_uid || syncUser.id;
          }
        }
      }
    } catch (_) { }

    if (syncUser && syncUser.email) {
      console.log('[Messliner] Instant Boot from synchronous session:', syncUser.email);
      this._bootForUser(syncUser);
    }

    // Guaranteed Failsafe Watchdog: Under NO circumstance should preloader hang more than 2.5s
    setTimeout(() => {
      this._dismissLoaderFast();
    }, 2500);

    // Auth state listener (handles background token verification or logout)
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        // Guard against transient null events during background token refresh:
        try {
          const raw = localStorage.getItem('sb-pgnjvtmofglkjplotrha-auth-token');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.user) {
              console.log('[Messliner] Ignoring transient auth null — session active in localStorage.');
              return;
            }
          }
        } catch (_) { }

        // Truly not authenticated — redirect to login
        window.location.replace('index.html');
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

    const emailKey = Utils.encodeEmail(user.email);
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateUserId = urlParams.get('impersonate');
    const cacheKey = impersonateUserId ? `ml_cache_v2_imp_${impersonateUserId}` : `ml_cache_v2_${emailKey}`;

    // ── FAST PATH: Instant Cache Hydration (< 50ms) ──
    let hasHydratedFromCache = false;
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

    // ── FRESH DATA FETCH & BACKGROUND REVALIDATION ──
    try {
      const mappingCacheKey = `ml_map_${emailKey}`;
      let mapping = window.__ML_BOOT_MAP || null;
      if (!mapping) {
        try {
          const cachedMapRaw = localStorage.getItem(mappingCacheKey);
          if (cachedMapRaw) mapping = JSON.parse(cachedMapRaw);
        } catch (_) { }
      }

      // If no cached mapping, fetch it first
      if (!mapping || !mapping.diningId) {
        const mappingSnap = await db.ref(`userMappings/emailToDining/${emailKey}`).once('value');
        mapping = mappingSnap.val();
        if (mapping && mapping.diningId) {
          try { localStorage.setItem(mappingCacheKey, JSON.stringify(mapping)); } catch (_) { }
        }
      } else {
        // If cached mapping exists, revalidate in background
        db.ref(`userMappings/emailToDining/${emailKey}`).once('value').then(snap => {
          const freshMap = snap.val();
          if (freshMap && freshMap.diningId) {
            try { localStorage.setItem(mappingCacheKey, JSON.stringify(freshMap)); } catch (_) { }
          }
        }).catch(() => { });
      }

      if (!mapping || !mapping.diningId) {
        console.log('[Messliner] No dining mapping found. Showing onboarding...');
        const userProfileSnap = await db.ref(`users/${user.uid}`).once('value');
        const profile = userProfileSnap.val() || {
          name: user.displayName || (user.user_metadata && user.user_metadata.name) || 'User',
          email: user.email,
          phone: (user.user_metadata && user.user_metadata.phone) || ''
        };
        this._dismissLoaderFast();
        document.getElementById('onboardingPage').style.display = 'flex';
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

      // ── STAGE 1 (CRITICAL PATH): Fetch Home Page & 4 User Tabs essential data ──
      const [
        userSnap,
        bazarSnap,
        mealsSnap,
        usersSnap,
        settingsSnap,
        depositsSnap,
        infoSnap
      ] = await Promise.all([
        safeFetch(`dinings/${diningId}/users/${userId}`),
        safeFetch(`dinings/${diningId}/bazar`),
        safeFetch(`dinings/${diningId}/meals`),
        safeFetch(`dinings/${diningId}/users`),
        safeFetch(`dinings/${diningId}/settings`),
        safeFetch(`dinings/${diningId}/deposits`),
        safeFetch(`dinings/${diningId}/info`)
      ]);

      const freshPayload = {
        mapping: { diningId, userId },
        userData: userSnap.val(),
        bazar: bazarSnap.val() || {},
        meals: mealsSnap.val() || {},
        users: usersSnap.val() || {},
        settings: settingsSnap.val() || {},
        deposits: depositsSnap.val() || {},
        info: infoSnap.val() || {},
        bills: {},
        paymentRequests: {}
      };

      if (!freshPayload.userData) {
        console.warn('[Messliner] User profile was not returned in this pass.');
        this._dismissLoaderFast();
        // If we already hydrated from cache, keep using active cached data! Never sign out!
        if (hasHydratedFromCache || (this.state && this.state.userId)) {
          console.log('[Messliner] Session remains active with existing cached state.');
          return;
        }
        // Fallback user profile to avoid kicking user out on network hiccup
        freshPayload.userData = {
          name: user.displayName || (user.user_metadata && user.user_metadata.name) || 'User',
          email: user.email,
          role: 'user',
          status: 'active'
        };
      }

      // 🚀 RENDER HOME PAGE & ACTIVATE 4 USER TABS IMMEDIATELY!
      this._renderDashboardPayload(freshPayload, false);

      // 🚀 DISMISS PRELOADER IMMEDIATELY — User sees Home Page right away!
      this._dismissLoaderFast();

      // ── STAGE 2: Non-blocking Background Hydration for Bills & Secondary Modules ──
      Promise.all([
        db.ref(`dinings/${diningId}/bills`).once('value'),
        db.ref(`dinings/${diningId}/paymentRequests`).once('value')
      ]).then(([billsSnap, prSnap]) => {
        freshPayload.bills = billsSnap.val() || {};
        freshPayload.paymentRequests = prSnap.val() || {};
        if (window.UserBillsModule) {
          UserBillsModule.bills = freshPayload.bills;
          UserBillsModule.paymentRequests = freshPayload.paymentRequests;
          UserBillsModule.renderOverview();
          UserBillsModule.renderBills();
          UserBillsModule.renderHistory();
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
      this._dismissLoaderFast();
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
   */
  _dismissLoaderFast() {
    const loaderEl = document.getElementById('pageLoader');
    if (loaderEl && loaderEl.style.display !== 'none') {
      loaderEl.classList.add('fade-out');
      setTimeout(() => {
        loaderEl.style.display = 'none';
      }, 200);
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
    const diningId = data.mapping.diningId;
    const userId = data.mapping.userId;
    this.state.diningId = diningId;
    this.state.userId = userId;

    const userData = data.userData;
    this.state.actualRole = userData.role || 'user';
    const viewMode = localStorage.getItem('viewMode') || sessionStorage.getItem('viewMode');
    if (this.state.actualRole === 'admin' && viewMode === 'user') {
      this.state.role = 'user';
    } else {
      this.state.role = this.state.actualRole;
    }
    this.state.userJoinedAt = userData.createdAt || null;

    // ── Step 3: Pre-calculate meal rate so stats show correct values immediately ──
    const allUsers = data.users || {};
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
    this._initModules(diningId, userId, meals, data);

    // ── Step 4b: Inject data directly into UserDashboard ──
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

    UserDashboard._activityDataReady = true;
    UserDashboard.renderStats();
    UserDashboard.renderMealToggles();
    UserDashboard.renderRecentActivity(diningId);
    if (typeof UserDashboard.updateMyMealVisibility === 'function') {
      UserDashboard.updateMyMealVisibility();
    }

    // ── Step 4c: Inject data directly into HistoryModule ──
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

    // ── Step 4d: Inject data directly into UserBillsModule ──
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

    // ── Step 5: Show app shell & Router ──
    const appShell = document.getElementById('appShell');
    if (appShell) appShell.style.display = 'flex';

    if (!Router.currentPage) {
      Router.init(this.state.role);
    }

    if (typeof HistoryPageModule !== 'undefined') {
      HistoryPageModule.init(diningId);
    }

    if (this.state.role === 'admin' && window.OverviewModule) {
      OverviewModule.refresh(data);
    }
  },

  /**
   * Setup UI elements (sidebar, header, etc.)
   */
  _setupUI(userData, diningInfo = null, settings = null) {
    const role = this.state.role;
    const isAdmin = role === 'admin';
    this.state.userName = userData.name || 'User';

    document.body.classList.toggle('role-admin', isAdmin);
    document.body.classList.toggle('role-user', !isAdmin);

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

    // Show/hide My Meal tab for Admin based on managerMealEnabled setting
    const showMyMeal = isAdmin && !!activeSettings.managerMealEnabled;
    const navMyMeal = document.getElementById('navMyMeal');
    const bottomNavMyMeal = document.getElementById('bottomNavMyMeal');
    if (navMyMeal) navMyMeal.style.display = showMyMeal ? 'flex' : 'none';
    if (bottomNavMyMeal) bottomNavMyMeal.style.display = showMyMeal ? 'flex' : 'none';
    const bottomOverviewBtn = document.querySelector('.bottom-nav-item[data-page="overview"]');
    if (bottomOverviewBtn) {
      bottomOverviewBtn.style.display = isAdmin ? 'none' : 'flex';
      const overviewSpan = bottomOverviewBtn.querySelector('span');
      if (overviewSpan) {
        overviewSpan.textContent = isAdmin ? 'Overview' : 'Dining';
      }
    }

    const bottomMealsBtn = document.querySelector('.bottom-nav-item[data-page="meals"]');
    if (bottomMealsBtn) {
      bottomMealsBtn.style.display = isAdmin ? 'flex' : 'none';
    }
    const bottomFinanceBtn = document.querySelector('.bottom-nav-item[data-page="finance"]');
    if (bottomFinanceBtn) {
      bottomFinanceBtn.style.display = isAdmin ? 'flex' : 'none';
    }
    const bottomBillsBtn = document.querySelector('.bottom-nav-item[data-page="user-bills"]');
    if (bottomBillsBtn) {
      bottomBillsBtn.style.display = isAdmin ? 'none' : 'flex';
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
   * Initialize all modules
   */
  _initModules(diningId, userId, mealsData, initialData) {
    const isAdmin = this.state.role === 'admin';

    // Always init these
    UsersModule.init(diningId, initialData);
    UserDashboard.init(diningId, userId);
    HistoryModule.init(diningId, userId);
    OverviewModule.init(diningId, initialData);
    Notifications.initListener(diningId, userId, this.state.userJoinedAt);
    if (window.MealChartModule) MealChartModule.init(diningId, userId);
    if (window.BazarHistoryModule) {
      BazarHistoryModule.init(diningId, userId);
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
