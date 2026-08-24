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
  settings: SettingsModule,
  userDashboard: UserDashboard,
  history: HistoryModule,
  overview: OverviewModule,
  notifications: Notifications,
  charts: Charts,
  mealChart: MealChartModule,
  bazarHistory: BazarHistoryModule,
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

    // Auth state listener
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        // Not authenticated — redirect to login
        window.location.href = 'index.html';
        return;
      }

      this.state.user = user;
      console.log('[Messliner] Authenticated:', user.email);

      try {
        // ── Step 1: Fetch mapping + user data (sequential, small payloads) ──
        const emailKey = Utils.encodeEmail(user.email);
        const mappingSnap = await db.ref(`userMappings/emailToDining/${emailKey}`).once('value');
        const mapping = mappingSnap.val();

        if (!mapping) {
          console.log('[Messliner] No dining mapping found. Showing onboarding...');
          const userProfileSnap = await db.ref(`users/${user.uid}`).once('value');
          const profile = userProfileSnap.val() || { name: user.displayName || 'User', email: user.email };
          document.getElementById('pageLoader').style.display = 'none';
          document.getElementById('onboardingPage').style.display = 'flex';
          if (window.Onboarding) {
            Onboarding.init({ uid: user.uid, name: profile.name, email: profile.email, phone: profile.phone || '' });
          }
          return;
        }
        this.state.diningId = mapping.diningId;
        // Support impersonation/impersonating a member
        const urlParams = new URLSearchParams(window.location.search);
        const impersonateUserId = urlParams.get('impersonate');

        if (impersonateUserId) {
          const targetSnap = await db.ref(`dinings/${mapping.diningId}/users/${impersonateUserId}`).once('value');
          if (targetSnap.exists()) {
            this.state.userId = impersonateUserId;
            console.log('[Messliner] Impersonating member:', impersonateUserId);
          } else {
            this.state.userId = mapping.userId;
          }
        } else {
          this.state.userId = mapping.userId;
        }

        const diningId = this.state.diningId;
        const userId = this.state.userId;

        const [
          userSnap,
          bazarSnap,
          mealsSnap,
          usersSnap,
          settingsSnap,
          depositsSnap,
          infoSnap
        ] = await Promise.all([
          db.ref(`dinings/${diningId}/users/${userId}`).once('value'),
          db.ref(`dinings/${diningId}/bazar`).once('value'),
          db.ref(`dinings/${diningId}/meals`).once('value'),
          db.ref(`dinings/${diningId}/users`).once('value'),
          db.ref(`dinings/${diningId}/settings`).once('value'),
          db.ref(`dinings/${diningId}/deposits`).once('value'),
          db.ref(`dinings/${diningId}/info`).once('value')
        ]);

        const userData = userSnap.val();
        if (!userData) {
          console.error('[Messliner] User data not found');
          Notifications.toast('error', 'Error', 'Your account data was not found.');
          auth.signOut();
          return;
        }

        this.state.actualRole = userData.role || 'user';
        const viewMode = sessionStorage.getItem('viewMode');
        if (this.state.actualRole === 'admin' && viewMode === 'user') {
          this.state.role = 'user';
        } else {
          this.state.role = this.state.actualRole;
        }
        this.state.userJoinedAt = userData.createdAt || null;
        console.log('[Messliner] Role:', this.state.role, '| Actual Role:', this.state.actualRole, '| Dining:', diningId);

        // ── Step 3: Pre-calculate meal rate so stats show correct values immediately ──
        const allUsers = usersSnap.val() || {};
        const settings = settingsSnap.val() || {};
        const isManagerMealEnabled = !!settings.managerMealEnabled;
        const rateMode = settings.rateMode || 'market';
        const currentMonth = Utils.currentMonth();

        const bazars = bazarSnap.val() || {};
        const meals = mealsSnap.val() || {};

        if (rateMode === 'fixed') {
          const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
          const fixedRates = settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 };
          const activeRates = [];
          if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
          if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
          if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);
          const avgRate = activeRates.length > 0
            ? activeRates.reduce((a, b) => a + b, 0) / activeRates.length : 0;
          this.state.mealRate = avgRate;
          this.state.monthlyMealRate = avgRate;
        } else {
          let totalBazar = 0, totalMeals = 0;
          let monthlyBazar = 0, monthlyMeals = 0;

          Object.values(bazars).forEach(b => {
            totalBazar += Utils.num(b.amount);
            if (b.date && b.date.startsWith(currentMonth)) monthlyBazar += Utils.num(b.amount);
          });
          Object.values(meals).forEach(monthData => {
            Object.values(monthData).forEach(dayData => {
              Object.values(dayData).forEach(typeData => {
                if (typeof typeData === 'object') {
                  Object.entries(typeData).forEach(([uId, c]) => {
                    const u = allUsers[uId];
                    if (u && u.role === 'admin' && !isManagerMealEnabled) return;
                    totalMeals += parseInt(c) || 0;
                  });
                }
              });
            });
          });
          const monthData = meals[currentMonth] || {};
          Object.values(monthData).forEach(dayData => {
            Object.values(dayData).forEach(typeData => {
              if (typeof typeData === 'object') {
                Object.entries(typeData).forEach(([uId, c]) => {
                  const u = allUsers[uId];
                  if (u && u.role === 'admin' && !isManagerMealEnabled) return;
                  monthlyMeals += parseInt(c) || 0;
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
        const allDeposits = depositsSnap.val() || {};
        Object.values(allDeposits).forEach(d => {
          if (d.type === 'deposit') totalDeposit += Utils.num(d.amount);
        });
        this.state.totalDeposit = totalDeposit;

        console.log('[Messliner] Meal Rate (prefetched):', this.state.mealRate.toFixed(2),
          '| Monthly:', this.state.monthlyMealRate.toFixed(2));

        // ── Step 4: Setup UI & modules ──
        const initialData = {
          users: usersSnap.val() || {},
          deposits: depositsSnap.val() || {},
          bazar: bazarSnap.val() || {},
          meals: mealsSnap.val() || {},
          settings: settingsSnap.val() || {},
          info: infoSnap.val() || {}
        };

        this._setupUI(userData);
        this._initModules(diningId, userId, mealsSnap.val() || {}, initialData);

        // ── Step 4b: Inject prefetched data directly into UserDashboard ──
        // _initModules() → UserDashboard.init() resets all data (userData=null, monthly=0 etc.)
        // and sets up Firebase .on() listeners that fire async (300-500ms later).
        // We bypass this wait by directly seeding the already-fetched data so the first
        // render shows complete data with no intermediate "Loading..." / skeleton state.
        UserDashboard.userData = userData;
        UserDashboard.settings = settings;

        // Process per-user monthly deposits from the already-fetched deposits snapshot
        {
          let mDeposit = 0, mOtherCost = 0, mDeduction = 0;
          const uDepositsArr = [];
          const allDepsObj = depositsSnap.val() || {};
          Object.values(allDepsObj).forEach(d => {
            if (d.userId === userId) {
              uDepositsArr.push(d);
              if (d.date && d.date.startsWith(currentMonth)) {
                const amt = Math.abs(Utils.num(d.amount));
                if (d.type === 'deposit') mDeposit += amt;
                else if (d.type === 'other_costing') mOtherCost += amt;
                else if (d.type === 'deduction') mDeduction += amt;
              }
            }
          });
          UserDashboard.userDepositsData = uDepositsArr;
          UserDashboard.monthlyDeposit = mDeposit;
          UserDashboard.monthlyOtherCosting = mOtherCost;
          UserDashboard.monthlyDeduction = mDeduction;
        }

        // Process per-user monthly meals from the already-fetched meals snapshot
        {
          const monthMealsData = (mealsSnap.val() || {})[currentMonth] || {};
          UserDashboard.monthMealsData = monthMealsData;
          let mMeals = 0;
          const mBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
          Object.values(monthMealsData).forEach(dayData => {
            Object.entries(dayData).forEach(([type, typeData]) => {
              if (typeof typeData === 'object' && typeData[userId] !== undefined) {
                const count = parseFloat(typeData[userId]) || 0;
                mMeals += count;
                if (mBreakdown[type] !== undefined) mBreakdown[type] += count;
              }
            });
          });
          UserDashboard.monthlyMeals = mMeals;
          UserDashboard.monthlyMealsBreakdown = mBreakdown;
        }

        // Mark activity as ready — Firebase listeners will update it once they fire.
        // Setting this true prevents the skeleton from showing on the first paint.
        UserDashboard._activityDataReady = true;

        // Trigger immediate renders with the seeded data — no waiting for Firebase callbacks
        UserDashboard.renderStats();
        UserDashboard.renderMealToggles();
        UserDashboard.renderRecentActivity(diningId);

        // ── Step 4c: Inject prefetched data directly into HistoryModule ──
        // This prevents "Loading..." placeholders on the Profile page when refreshing the page on the Profile tab.
        HistoryModule.currentUserData = userData;
        HistoryModule.settings = settings;
        HistoryModule.diningInfo = infoSnap.val() || {};
        HistoryModule.usersMap = usersSnap.val() || {};
        HistoryModule.cachedMeals = mealsSnap.val() || {};

        // Process per-user deposits list (filter and sort descending by timestamp)
        {
          const uDepositsArr = [];
          const allDepsObj = depositsSnap.val() || {};
          Object.values(allDepsObj).forEach(d => {
            if (d.userId === userId) {
              uDepositsArr.push(d);
            }
          });
          uDepositsArr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          HistoryModule.userDepositsList = uDepositsArr;
        }

        // Process per-user meals breakdown (for all months, matching HistoryModule.init logic)
        {
          const mBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
          const allMeals = mealsSnap.val() || {};
          Object.values(allMeals).forEach(monthData => {
            Object.values(monthData).forEach(dayData => {
              Object.entries(dayData).forEach(([type, typeData]) => {
                if (typeof typeData === 'object' && typeData[userId] !== undefined) {
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

        // Trigger immediate render of profile elements and deposit history if they are present
        HistoryModule.renderProfile(userData);
        if (HistoryModule.userDepositsList) {
          HistoryModule.renderDepositHistory(HistoryModule.userDepositsList);
        }

        // ── Step 5: Show app shell, initialize router, and perform instant initial renders ──
        document.getElementById('appShell').style.display = 'flex';
        Router.init(this.state.role);

        if (this.state.role === 'admin') {
          OverviewModule.refresh(initialData);
        }

        // Setup reactive listeners for live updates
        this._setupLiveListeners(diningId);

        // Setup online/offline detection
        this._setupConnectivity();

        // ── Step 6: Smoothly hide loader after browser DOM paint ──
        const loaderEl = document.getElementById('pageLoader');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (loaderEl) {
              loaderEl.classList.add('fade-out');
              setTimeout(() => {
                loaderEl.style.display = 'none';
              }, 230);
            }
          });
        });

      } catch (error) {
        console.error('[Messliner] Init error:', error);
        Notifications.toast('error', 'Error', 'Failed to load your dining data.');
        const loaderEl = document.getElementById('pageLoader');
        if (loaderEl) loaderEl.style.display = 'none';
      }
    });
  },

  /**
   * Setup UI elements (sidebar, header, etc.)
   */
  _setupUI(userData) {
    const role = this.state.role;
    const isAdmin = role === 'admin';
    this.state.userName = userData.name || 'User';

    // Update dynamic top header greeting
    this.updateHomeHeaderGreeting(userData.name);

    // Sidebar brand
    db.ref(`dinings/${this.state.diningId}/info/name`).on('value', (snap) => {
      const name = snap.val() || 'Messliner';
      Utils.setText('sidebarDiningName', name);
      document.title = `Messliner — ${name}`;
    });

    // Sidebar role label
    Utils.setText('sidebarRole', isAdmin ? 'Admin Panel' : 'Member Panel');

    // User info in sidebar
    Utils.setText('sidebarUserName', userData.name || 'User');
    Utils.setText('sidebarUserRole', isAdmin ? 'Meal Manager' : 'Member');
    Utils.setText('sidebarAvatar', Utils.initials(userData.name));

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
    const bottomAssistBtn = document.querySelector('.bottom-nav-item[data-page="aiassistant"]');
    if (bottomAssistBtn) {
      bottomAssistBtn.style.display = isAdmin ? 'none' : 'flex';
    }

    // Hide mobile menu button (hamburger menu on the left) for non-admin
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    if (mobileMenuBtn) {
      mobileMenuBtn.classList.toggle('hidden', !isAdmin);
    }
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
    if (window.BazarHistoryModule) BazarHistoryModule.init(diningId, userId);
    if (window.SummaryModule) SummaryModule.init(diningId, userId);

    // Admin-only modules
    if (isAdmin) {
      MealsModule.init(diningId);
      FinanceModule.init(diningId, initialData);
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
        const activeRates = [];
        if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
        if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
        if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);

        const avgRate = activeRates.length > 0 ? (activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
        this.state.mealRate = avgRate;
        this.state.totalMeals = totalMeals;
        this.state.totalBazar = totalBazar;
        this.state.monthlyMealRate = avgRate;
      } else {
        this.state.mealRate = Utils.calcMealRate(totalBazar, totalMeals);
        this.state.totalMeals = totalMeals;
        this.state.totalBazar = totalBazar;

        // Calculate current-month meal rate
        const _currentMonth = Utils.currentMonth();
        let _monthlyBazar = 0;
        let _monthlyMeals = 0;
        Object.values(bazars).forEach(b => {
          if (b.date && b.date.startsWith(_currentMonth)) _monthlyBazar += Utils.num(b.amount);
        });
        const _monthData = meals[_currentMonth] || {};
        Object.values(_monthData).forEach(dayData => {
          Object.values(dayData).forEach(typeData => {
            if (typeof typeData === 'object') {
              Object.entries(typeData).forEach(([uId, c]) => {
                const user = users[uId];
                if (user && user.role === 'admin' && !isManagerMealEnabled) return;
                _monthlyMeals += parseInt(c) || 0;
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
                totalMeals += parseInt(c) || 0;
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
        if (b.date && b.date.startsWith(_cm)) _mBazar += Utils.num(b.amount);
      });
      const _md = (mealsSnap.val() || {})[_cm] || {};
      Object.values(_md).forEach(dayData => {
        Object.values(dayData).forEach(typeData => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, c]) => {
              const user = users[uId];
              if (user && user.role === 'admin' && !isManagerMealEnabled) return;
              _mMeals += parseInt(c) || 0;
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
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('appShell')) {
    Messliner.init();
  }
});

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

console.log('[Messliner] App module loaded');
