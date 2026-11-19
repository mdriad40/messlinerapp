/* ============================================
   Messliner — Client-Side Router (router.js)
   ============================================ */

const Router = {
  currentPage: null,
  previousPage: null,
  navigatedFromNotifications: false,
  navigatedFromMobileNotifScreen: false,
  navigatedFromDesktopPopover: false,
  popoverOriginPage: null,
  notificationOriginPage: null,
  adminPages: ['users', 'meals', 'finance', 'ledger', 'settings', 'mymeal', 'more'],
  // Note: 'fridaymeal' is accessible to all roles
  scrollPositions: {},

  /**
   * Determine current active page from pathname or hash fallback
   */
  getPageFromUrl() {
    try {
      const pathname = window.location.pathname || '';
      // Support clean URLs: /dashboard/history, /dashboard/meals, etc.
      const match = pathname.match(/^\/dashboard(?:\.html)?(?:\/([a-zA-Z0-9_-]+))?/i);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
      // Check hash fallback (e.g. #history, #notifications)
      const rawHash = (window.location.hash || '').replace(/^[#\/]+/, '').split('?')[0].toLowerCase();
      if (rawHash) {
        return rawHash;
      }
    } catch (_) {}
    return null;
  },

  /**
   * Update browser URL with clean path structure without full reload
   */
  updateUrl(page, replace = false) {
    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

      // Preserve search query params (especially ?impersonate=xyz)
      const urlParams = new URLSearchParams(window.location.search);
      const impId = urlParams.get('impersonate') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ml_impersonate_user_id') : null);
      if (impId) {
        urlParams.set('impersonate', impId);
      }
      const searchStr = urlParams.toString() ? ('?' + urlParams.toString()) : '';

      if (!isLocal && window.location.protocol.startsWith('http')) {
        const targetPath = ((page === 'dashboard' || !page) ? '/dashboard' : `/dashboard/${page}`) + searchStr;
        if (window.location.pathname + window.location.search !== targetPath || window.location.hash) {
          if (replace) {
            window.history.replaceState({ page }, '', targetPath);
          } else {
            window.history.pushState({ page }, '', targetPath);
          }
        }
      } else {
        // file:// or localhost / Live Server fallback (keeps dashboard.html in URL so reload F5 works)
        const hash = (!page || page === 'dashboard' || page === 'overview') ? '' : '#' + page;
        const targetUrl = window.location.pathname + searchStr + hash;
        if (window.location.pathname + window.location.search + window.location.hash !== targetUrl) {
          if (replace) {
            window.history.replaceState({ page }, '', targetUrl);
          } else {
            window.history.pushState({ page }, '', targetUrl);
          }
        }
      }
    } catch (_) {
      try { location.hash = page; } catch (_) {}
    }
  },

  /**
   * Set user role explicitly
   */
  setRole(role) {
    if (role) this.role = role;
  },

  /**
   * Resolve user role with maximum resilience (in-memory, state, cache)
   */
  getRole() {
    if (this.role) return this.role;
    if (window.Messliner && window.Messliner.state && window.Messliner.state.role) {
      this.role = window.Messliner.state.role;
      return this.role;
    }
    try {
      const explicitRole = localStorage.getItem('ml_user_role');
      if (explicitRole === 'admin' || explicitRole === 'manager') {
        this.role = 'admin';
        return 'admin';
      }
      if (document.documentElement.classList.contains('ml-is-admin') || document.body?.classList.contains('role-admin')) {
        this.role = 'admin';
        return 'admin';
      }
      const sbRaw = localStorage.getItem('sb-pgnjvtmofglkjplotrha-auth-token');
      const email = sbRaw ? JSON.parse(sbRaw)?.user?.email : null;
      if (email) {
        const k1 = 'ml_cache_v2_' + email.replace(/\./g, ',');
        const k2 = 'ml_cache_v2_' + email.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_');
        const m1 = 'ml_map_' + email.replace(/\./g, ',');
        const m2 = 'ml_map_' + email.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_');
        const cached = localStorage.getItem(k1) || localStorage.getItem(k2);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.userData?.role) {
            this.role = (parsed.userData.role === 'admin' || parsed.userData.role === 'manager') ? 'admin' : parsed.userData.role;
            return this.role;
          }
        }
        const cachedMap = localStorage.getItem(m1) || localStorage.getItem(m2);
        if (cachedMap) {
          const parsedMap = JSON.parse(cachedMap);
          if (parsedMap?.role) {
            this.role = (parsedMap.role === 'admin' || parsedMap.role === 'manager') ? 'admin' : parsedMap.role;
            return this.role;
          }
        }
      }
    } catch (_) {}
    return this.role || null;
  },

  /**
   * Universal back button handler
   */
  handleBack() {
    this._isBackNav = true;
    // 1. If navigated from Desktop Popover: return directly to the exact page they clicked the notification on (defaulting to dashboard)
    if (this.navigatedFromDesktopPopover) {
      this.navigatedFromDesktopPopover = false;
      const targetPage = (this.popoverOriginPage && this.popoverOriginPage !== 'overview') ? this.popoverOriginPage : 'dashboard';
      this.popoverOriginPage = null;
      this.navigate(targetPage);
      setTimeout(() => {
        if (window.innerWidth > 768 && window.Notifications && typeof Notifications.openDesktopPopover === 'function') {
          Notifications.openDesktopPopover();
        }
      }, 160);
      return;
    }

    // 2. If navigated from Mobile Notification Screen: return to notifications without history loop
    if (this.navigatedFromMobileNotifScreen || this.navigatedFromNotifications) {
      this.navigatedFromMobileNotifScreen = false;
      this.navigatedFromNotifications = false;
      this.updateUrl('notifications', true);
      this._showPage('notifications');
      return;
    }

    // 3. If currently on Notifications screen: back button returns to origin page or dashboard (never loops back into detail pages!)
    if (this.currentPage === 'notifications') {
      const returnPage = (this.notificationOriginPage && this.notificationOriginPage !== 'overview') ? this.notificationOriginPage : 'dashboard';
      this.notificationOriginPage = null;
      this.updateUrl(returnPage, true);
      this._showPage(returnPage);
      return;
    }

    if (this.currentPage === 'export-slip') {
      this.navigate(this.previousPage === 'overview' ? 'overview' : 'dashboard');
    } else if (['mealhistory', 'bazarroster', 'tasks', 'notices'].includes(this.currentPage)) {
      this.navigate(this.getRole() === 'admin' ? 'mymeal' : 'dashboard');
    } else if (['bazar', 'mealchart', 'summary', 'history', 'fridaymeal', 'prayer'].includes(this.currentPage)) {
      if (this.previousPage === 'overview' || this.getRole() !== 'admin') {
        this.navigate('overview');
      } else if (this.previousPage && this.previousPage !== this.currentPage && this.previousPage !== 'notifications') {
        this.navigate(this.previousPage);
      } else {
        this.navigate('dashboard');
      }
    } else if (this.currentPage === 'meals') {
      this.navigate(this.previousPage === 'overview' ? 'overview' : 'dashboard');
    } else if (this.previousPage && this.previousPage !== this.currentPage && this.previousPage !== 'notifications') {
      this.navigate(this.previousPage);
    } else {
      this.navigate('dashboard');
    }
  },

  /**
   * Initialize the router
   */
  init(role) {
    this.role = role;

    // Listen for browser Back/Forward navigation (HTML5 History API)
    window.addEventListener('popstate', (e) => {
      const page = (e.state && e.state.page) || this.getPageFromUrl() || 'dashboard';
      if (this.navigatedFromDesktopPopover && this.popoverOriginPage && page === this.popoverOriginPage) {
        this.navigatedFromDesktopPopover = false;
        this.popoverOriginPage = null;
        this._showPage(page);
        setTimeout(() => {
          if (window.innerWidth > 768 && window.Notifications && typeof Notifications.openDesktopPopover === 'function') {
            Notifications.openDesktopPopover();
          }
        }, 120);
        return;
      }
      this._showPage(page);
    });

    // Fallback listener for hash changes
    window.addEventListener('hashchange', () => {
      const page = (location.hash || '').replace(/^[#\/]+/, '').split('?')[0].toLowerCase() || 'dashboard';
      if (this.navigatedFromDesktopPopover && this.popoverOriginPage && page === this.popoverOriginPage) {
        this.navigatedFromDesktopPopover = false;
        this.popoverOriginPage = null;
        this._showPage(page);
        setTimeout(() => {
          if (window.innerWidth > 768 && window.Notifications && typeof Notifications.openDesktopPopover === 'function') {
            Notifications.openDesktopPopover();
          }
        }, 120);
        return;
      }
      if (page && page !== this.currentPage) {
        this.navigate(page);
      }
    });

    // Navigate to initial page from URL path, hash or session
    this._initialNav = true;
    const initialPage = this.getPageFromUrl() || (sessionStorage.getItem('ml_current_page') || '').toLowerCase() || 'dashboard';
    this.updateUrl(initialPage, true);
    this._showPage(initialPage);
    this._initialNav = false;

    // Clean up temporary boot classes once Router has taken full control of page sections
    document.documentElement.classList.remove(
      'ml-dining-subpage-boot',
      'ml-subpage-mealchart',
      'ml-subpage-bazar',
      'ml-subpage-summary',
      'ml-subpage-fridaymeal'
    );


    // Continuously preserve scroll position of active page
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      contentArea.addEventListener('scroll', () => {
        if (!this._isRestoringScroll && this.currentPage && this.currentPage !== 'export-slip') {
          this.scrollPositions[this.currentPage] = contentArea.scrollTop;
        }
      }, { passive: true });
    }

    // Initialize bottom navigation slide indicator
    this.initBottomNavIndicator();
  },

  /**
   * Navigate to a page
   */
  navigate(page, replace = false) {
    // If already on this page, smoothly scroll to top without re-rendering or interrupting transitions
    if (this.currentPage === page) {
      // Prevent synthetic click from scrolling to top immediately after a tab navigation
      if (Date.now() - (this._lastNavTime || 0) < 400) {
        return;
      }
      const contentArea = document.querySelector('.content-area');
      if (contentArea && contentArea.scrollTop > 0) {
        contentArea.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Role-based access
    const userRole = this.getRole();
    if (userRole === 'user' && this.adminPages.includes(page)) {
      Notifications.toast('warning', 'Access Denied', 'You do not have permission to view this page.');
      return;
    }

    // AI Assistant guard
    if (page === 'aiassistant' && userRole === 'user') {
      const settings = Messliner.history ? Messliner.history.settings : null;
      if (settings && settings.aiAssistantEnabled === false) {
        Notifications.toast('warning', 'Access Denied', 'AI Assistant is currently disabled by the manager.');
        return;
      }
    }

    if (this.currentPage && this.currentPage !== page && this.currentPage !== 'notifications') {
      this.previousPage = this.currentPage;
    }

    this.updateUrl(page, replace);
    this._showPage(page);

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  },

  /**
   * Determine transition animation class based on tab sequence and navigation source
   */
  _getTransitionClass(prevPage, newPage) {
    if (this._initialNav || !prevPage || prevPage === newPage) {
      return '';
    }

    if (this._isBackNav) {
      this._isBackNav = false;
      return 'slide-backward';
    }

    // Subpage entries always glide forward
    const subpages = ['mealchart', 'summary', 'fridaymeal', 'mealhistory', 'bazarroster', 'tasks', 'notices', 'export-slip', 'prayer'];
    if (subpages.includes(newPage) || (this.getRole() !== 'admin' && newPage === 'bazar')) {
      return 'slide-forward';
    }

    // Bottom navigation & primary tabs switch instantly like native apps (zero slide lag)
    return '';
  },

  /**
   * Show a specific page section and update nav state
   */
  _showPage(page, force = false) {
    if (!force && this.currentPage === page && !this._initialNav) {
      return;
    }

    this._lastNavTime = Date.now();
    const prevPage = this.currentPage;

    // If leaving export-slip page, clean up its special layout class
    if (prevPage === 'export-slip' && page !== 'export-slip') {
      if (Messliner.overview && Messliner.overview._leaveExportPage) {
        Messliner.overview._leaveExportPage();
      }
    }

    // Save scroll position of current page before switching (skip export-slip — it uses overflow:hidden)
    const contentArea = document.querySelector('.content-area');
    if (prevPage && prevPage !== 'export-slip') {
      const scrollY = (contentArea && typeof contentArea.scrollTop === 'number')
        ? contentArea.scrollTop
        : (window.scrollY || document.documentElement.scrollTop || 0);
      this.scrollPositions[prevPage] = scrollY;
    }
    this._isRestoringScroll = true;

    // Validate page
    let section = document.getElementById(`page-${page}`);
    if (!section && page === 'pro') {
      const contentArea = document.querySelector('.content-area');
      if (contentArea) {
        section = document.createElement('section');
        section.id = 'page-pro';
        section.className = 'page-section';
        section.style.cssText = 'max-width: 900px; margin: 0 auto; padding: 16px 14px 40px;';
        
        // Compute live subscription and member count details
        let currentMemberCount = 0;
        try {
          const userList = (typeof UsersModule !== 'undefined' && UsersModule.users && Object.keys(UsersModule.users).length > 0)
            ? UsersModule.users
            : ((window.UsersModule && UsersModule.users)
            || (window.OverviewModule && OverviewModule.cachedData && OverviewModule.cachedData.users)
            || (window.Messliner && Messliner.state && Messliner.state.users)
            || (window.Messliner && Messliner.diningData && Messliner.diningData.users)
            || {});
          currentMemberCount = Object.keys(userList || {}).length;
        } catch (_) { }
        const subInfo = (window.Dashboard && window.Dashboard.currentSubInfo)
          || (window.Messliner && Messliner.state && Messliner.state.subscription)
          || (window.Messliner && Messliner.diningData && Messliner.diningData.subscription)
          || window.currentSubInfo
          || {};
        const maxLimit = parseInt(subInfo.membersLimit || subInfo.maxMembers) || 25;
        const rawPlan = String(subInfo.plan || 'pro').toLowerCase();
        const planLabel = rawPlan === 'pay_as_you_go' ? 'Pay-As-You-Go' : (rawPlan === 'pro' ? 'Messliner Pro' : 'Free Trial');

        section.innerHTML = `
          <div class="pro-settings-card fade-up" style="background: linear-gradient(135deg, #064E3B 0%, #065F46 45%, #047857 80%, #059669 100%); color: #ffffff; border: none; border-radius: 24px; padding: 24px; position: relative; overflow: hidden; box-shadow: 0 12px 30px rgba(5, 150, 105, 0.25); margin-bottom: 20px;">
            <div style="position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, transparent 70%); border-radius: 50%;"></div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; position: relative; z-index: 2; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <div style="width: 44px; height: 44px; border-radius: 14px; background: rgba(251, 191, 36, 0.2); border: 1.5px solid rgba(251, 191, 36, 0.5); display: flex; align-items: center; justify-content: center; color: #FBBF24; flex-shrink: 0;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
                  </svg>
                </div>
                <div style="min-width: 0;">
                  <h3 style="margin: 0; font-size: 1.22rem; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Messliner Pro</h3>
                  <span style="font-size: 0.75rem; color: #A7F3D0; font-weight: 600; white-space: nowrap; display: block;">Active Membership</span>
                </div>
              </div>
              <span class="sub-status-pill" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 99px; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(4px); font-size: 0.74rem; font-weight: 800; color: #ffffff; flex-shrink: 0; white-space: nowrap;">
                <span class="sub-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #34D399;"></span>
                <span>Active</span>
              </span>
            </div>

            <p style="font-size: 0.9rem; line-height: 1.5; color: rgba(255, 255, 255, 0.9); margin: 0 0 20px 0; position: relative; z-index: 2;">
              Manage your mess dining with seamless member tracking, real-time balances, automated billing slips, SMS alerts, and AI-powered meal tracking.
            </p>

            <div style="display: flex; gap: 10px; flex-wrap: wrap; position: relative; z-index: 2;">
              <a href="checkout.html?plan=pro" class="btn" style="background: #F59E0B; color: #ffffff; border: none; padding: 10px 20px; border-radius: 12px; font-weight: 800; font-size: 0.88rem; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span style="white-space: nowrap;">Renew / Upgrade Plan</span>
              </a>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
            <div class="pro-settings-card" style="margin: 0; padding: 18px; border-radius: 18px; cursor: pointer;" onclick="Messliner.router.navigate('users')">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: #ECFDF5; color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                </div>
                <h4 id="proMemberLimitTitle" style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentMemberCount} out of ${maxLimit} Members Limit</h4>
              </div>
              <p id="proMemberLimitDesc" style="margin: 0; font-size: 0.8rem; color: #64748B; line-height: 1.4;">${currentMemberCount} out of ${maxLimit} member limit used on ${planLabel}. Click to manage members.</p>
            </div>

            <div class="pro-settings-card" style="margin: 0; padding: 18px; border-radius: 18px;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: #EEF2FF; color: #4F46E5; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Instant SMS Notifications</h4>
              </div>
              <p style="margin: 0; font-size: 0.8rem; color: #64748B; line-height: 1.4;">Automated SMS alerts sent to members on meal entries, deposits, and bill dues.</p>
            </div>

            <div class="pro-settings-card" style="margin: 0; padding: 18px; border-radius: 18px;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: #FEF3C7; color: #D97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>
                </div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">AI Assistant &amp; Analysis</h4>
              </div>
              <p style="margin: 0; font-size: 0.8rem; color: #64748B; line-height: 1.4;">Smart assistance for meal analytics, bazar budgeting, and routine image analysis.</p>
            </div>

            <div class="pro-settings-card" style="margin: 0; padding: 18px; border-radius: 18px; cursor: pointer;" onclick="Messliner.router.navigate('export-slip')">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: #FDF2F8; color: #DB2777; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Monthly Statements &amp; Slips</h4>
              </div>
              <p style="margin: 0; font-size: 0.8rem; color: #64748B; line-height: 1.4;">Download professional monthly statements, slips, and financial audit statements.</p>
            </div>
          </div>
        `;
        contentArea.appendChild(section);
      }
    }
    if (!section) {
      page = 'dashboard';
    }

    // Role guard
    const userRole = this.getRole();
    if (userRole === 'user' && this.adminPages.includes(page)) {
      page = 'dashboard';
    }

    // AI Assistant guard
    if (page === 'aiassistant' && userRole === 'user') {
      const settings = Messliner.history ? Messliner.history.settings : null;
      if (settings && settings.aiAssistantEnabled === false) {
        page = 'dashboard';
      }
    }

    if (page === 'notifications') {
      this.navigatedFromNotifications = false;
      this.navigatedFromMobileNotifScreen = false;
      this.navigatedFromDesktopPopover = false;
    }

    // Determine transition direction relative to navigation context
    const transitionClass = this._getTransitionClass(prevPage, page);

    this.currentPage = page;
    try {
      sessionStorage.setItem('ml_current_page', page);
    } catch (_) { }

    let targetLoaderClass = null;
    if (['mealchart', 'fridaymeal'].includes(page)) {
      targetLoaderClass = 'ml-loader-mealchart';
    } else if (['bazar', 'bazarhistory', 'summary'].includes(page)) {
      targetLoaderClass = 'ml-loader-bazar';
    } else if (['overview', 'dining', 'history', 'mealhistory', 'bazarroster', 'tasks', 'notices', 'meals', 'mymeal', 'export-slip'].includes(page)) {
      targetLoaderClass = 'ml-loader-dining';
    } else if (['ledger', 'user-bills', 'bills', 'finance'].includes(page)) {
      targetLoaderClass = 'ml-loader-ledger';
    } else if (['profile', 'userprofile', 'more', 'settings', 'help', 'pro'].includes(page)) {
      targetLoaderClass = 'ml-loader-profile';
    }

    const classesToRemove = ['ml-loader-dining', 'ml-loader-ledger', 'ml-loader-profile', 'ml-loader-mealchart', 'ml-loader-bazar'].filter(c => c !== targetLoaderClass);
    document.documentElement.classList.remove(...classesToRemove);
    if (targetLoaderClass) {
      document.documentElement.classList.add(targetLoaderClass);
    }

    // Hide all page sections
    document.querySelectorAll('.page-section').forEach(s => {
      s.classList.remove('active', 'slide-forward', 'slide-backward', 'slide-fade');
    });

    // Show target page with smooth hardware-accelerated transition
    const target = document.getElementById(`page-${page}`);
    if (target) {
      if (!this._initialNav && transitionClass) {
        target.classList.add(transitionClass);
        target.addEventListener('animationend', () => {
          target.classList.remove('slide-forward', 'slide-backward', 'slide-fade');
        }, { once: true });
      }
      target.classList.add('active');

      if (page === 'pro') {
        try {
          let users = {};
          if (typeof UsersModule !== 'undefined' && UsersModule.users && Object.keys(UsersModule.users).length > 0) {
            users = UsersModule.users;
          } else if (window.UsersModule && window.UsersModule.users && Object.keys(window.UsersModule.users).length > 0) {
            users = window.UsersModule.users;
          } else if (window.OverviewModule && OverviewModule.cachedData && OverviewModule.cachedData.users && Object.keys(OverviewModule.cachedData.users).length > 0) {
            users = OverviewModule.cachedData.users;
          } else if (window.Messliner && Messliner.state && Messliner.state.users && Object.keys(Messliner.state.users).length > 0) {
            users = Messliner.state.users;
          } else if (window.Messliner && Messliner.diningData && Messliner.diningData.users && Object.keys(Messliner.diningData.users).length > 0) {
            users = Messliner.diningData.users;
          }
          let currentMemberCount = Object.keys(users || {}).length;
          const subInfo = (window.Dashboard && window.Dashboard.currentSubInfo)
            || (window.Messliner && Messliner.state && Messliner.state.subscription)
            || (window.Messliner && Messliner.diningData && Messliner.diningData.subscription)
            || window.currentSubInfo
            || {};
          const maxLimit = parseInt(subInfo.membersLimit || subInfo.maxMembers) || 25;
          const rawPlan = String(subInfo.plan || 'pro').toLowerCase();
          const planLabel = rawPlan === 'pay_as_you_go' ? 'Pay-As-You-Go' : (rawPlan === 'pro' ? 'Messliner Pro' : 'Free Trial');

          const titleEl = document.getElementById('proMemberLimitTitle');
          if (titleEl) {
            titleEl.textContent = `${currentMemberCount} out of ${maxLimit} Members Limit`;
          }
          const descEl = document.getElementById('proMemberLimitDesc');
          if (descEl) {
            descEl.textContent = `${currentMemberCount} out of ${maxLimit} member limit used on ${planLabel}. Click to manage members.`;
          }

          // Realtime fallback fetch if not hydrated yet
          const dId = (window.Messliner && Messliner.state && Messliner.state.diningId)
            || (typeof UsersModule !== 'undefined' && UsersModule.diningId)
            || (window.OverviewModule && OverviewModule.diningId);
          if (currentMemberCount === 0 && dId && window.firebase && firebase.database) {
            firebase.database().ref(`dinings/${dId}/users`).once('value').then(snap => {
              if (snap.exists()) {
                const liveUsers = snap.val() || {};
                const liveCount = Object.keys(liveUsers).length;
                if (titleEl) titleEl.textContent = `${liveCount} out of ${maxLimit} Members Limit`;
                if (descEl) descEl.textContent = `${liveCount} out of ${maxLimit} member limit used on ${planLabel}. Click to manage members.`;
              }
            }).catch(() => {});
          }
        } catch (_) { }
      }
    }

    // Toggle active class on body and content-area for AI Assistant
    if (contentArea) {
      if (page === 'aiassistant') {
        contentArea.classList.add('aiassistant-active');
        document.body.classList.add('aiassistant-active-body');
        document.documentElement.classList.add('aiassistant-active-body');
      } else {
        contentArea.classList.remove('aiassistant-active');
        document.body.classList.remove('aiassistant-active-body');
        document.documentElement.classList.remove('aiassistant-active-body');
      }
    }

    // Toggle active class on body for dining subpages (Meal Chart, Summary, Friday's Meal, Prayer, Member Bazar)
    const isAdmin = this.getRole() === 'admin';
    const isMemberBazar = !isAdmin && page === 'bazar';
    const isUserDining = !isAdmin && page === 'overview';
    const isDiningSubpage = ['mealchart', 'summary', 'fridaymeal', 'prayer'].includes(page) || isMemberBazar;
    document.body.classList.toggle('dining-subpage-active', isDiningSubpage);
    document.body.classList.toggle('user-dining-active', isUserDining);
    document.body.classList.toggle('user-bills-active', page === 'user-bills');

    // Update page title and subtitle in header
    const titles = {
      dashboard: 'Dashboard',
      users: 'Members',
      meals: 'Meal Management',
      finance: 'Finance',
      ledger: 'Ledger',
      overview: 'Dining Overview',
      settings: 'Settings',
      profile: 'Profile',
      pro: 'Messliner Pro',
      mymeal: 'My Meal',
      mealchart: 'Meal Chart',
      bazar: 'Bazar',
      summary: 'Summary',
      history: 'History',
      notifications: 'Notifications',
      fridaymeal: "Friday Meal's",
      prayer: 'Prayer',
      'export-slip': 'Export Member Statistics',
      more: 'More Menu',
      aiassistant: 'Messliner AI',
      'user-bills': 'Bills',
      help: 'Help & Knowledge Base',
      mealhistory: 'Toggle History',
      bazarroster: 'Bazar Duty',
      tasks: 'Mess Tasks',
      notices: 'Notice Board'
    };

    const subtitles = {
      pro: 'Membership & Premium Features',
      mealhistory: 'Meal toggle log',
      bazarroster: 'Roster schedule',
      tasks: 'My duties',
      notices: 'Announcements'
    };

    const searchBar = document.querySelector('.header-search-bar');
    const titleContainer = document.getElementById('headerTitleContainer');
    const subtitle = document.getElementById('headerSubtitle');
    const greetingEl = document.getElementById('headerGreeting');

    if (isDiningSubpage) {
      if (searchBar) searchBar.style.setProperty('display', 'none', 'important');
      if (titleContainer) titleContainer.style.setProperty('display', 'flex', 'important');
      if (greetingEl) greetingEl.style.display = 'none';
      Utils.setText('headerTitle', isMemberBazar ? 'Bazar History' : (titles[page] || 'Meal Chart'));
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.setProperty('display', 'none', 'important');
      }
    } else if (isUserDining) {
      if (searchBar) searchBar.style.setProperty('display', 'none', 'important');
      if (titleContainer) titleContainer.style.setProperty('display', 'flex', 'important');
      if (greetingEl) greetingEl.style.display = 'none';
      Utils.setText('headerTitle', 'Dining Overview');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.setProperty('display', 'none', 'important');
      }
    } else if (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices' || page === 'pro') {
      if (searchBar) searchBar.style.setProperty('display', 'none', 'important');
      if (titleContainer) titleContainer.style.setProperty('display', 'flex', 'important');
      if (greetingEl) greetingEl.style.display = 'none';
      Utils.setText('headerTitle', titles[page] || 'Toggle History');
      if (subtitle) {
        subtitle.textContent = subtitles[page] || '';
        subtitle.style.setProperty('display', 'block', 'important');
      }
    } else if (page === 'dashboard') {
      if (searchBar) searchBar.style.removeProperty('display');
      if (titleContainer) titleContainer.style.display = 'none';
      if (typeof Messliner !== 'undefined' && Messliner.updateHomeHeaderGreeting) {
        Messliner.updateHomeHeaderGreeting();
      }
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    } else if (page === 'aiassistant') {
      if (searchBar) searchBar.style.removeProperty('display');
      if (titleContainer) titleContainer.style.display = 'none';
      if (greetingEl) greetingEl.style.display = 'none';
      const headerTitle = document.getElementById('headerTitle');
      if (headerTitle) {
        headerTitle.textContent = 'Messliner AI';
      }
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    } else {
      if (searchBar) searchBar.style.removeProperty('display');
      if (titleContainer) titleContainer.style.display = 'none';
      if (greetingEl) greetingEl.style.display = 'none';
      Utils.setText('headerTitle', titles[page] || 'Dashboard');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    }
    // Update the green icon pill in the header
    if (typeof setHeaderIcon === 'function') setHeaderIcon(page);
    const pageIcon = document.getElementById('headerPageIcon');
    if (pageIcon && (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices' || page === 'dashboard' || page === 'pro')) {
      pageIcon.style.setProperty('display', 'none', 'important');
    }

    // Toggle header back button and mobile menu button visibility
    const backBtn = document.getElementById('headerBackBtn');
    if (backBtn) {
      const isMobile = window.innerWidth <= 768;
      const isAdmin = this.getRole() === 'admin';
      const showBack = (this.navigatedFromDesktopPopover || this.navigatedFromMobileNotifScreen || this.navigatedFromNotifications || page === 'mealchart' || page === 'summary' || page === 'history' || page === 'notifications' || page === 'export-slip' || page === 'fridaymeal' || page === 'prayer' || page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices' || page === 'pro' || (!isAdmin && page === 'bazar') || (isMobile && isAdmin && ['users', 'bazar', 'ledger', 'settings', 'more', 'aiassistant', 'profile', 'help'].includes(page)));
      backBtn.style.display = showBack ? 'inline-flex' : 'none';

      // Set onclick dynamically to handle navigation flow
      backBtn.onclick = () => this.handleBack();

      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (menuBtn) {
        if (showBack || isUserDining) {
          menuBtn.style.setProperty('display', 'none', 'important');
        } else {
          menuBtn.style.removeProperty('display');
        }
      }
    }

    // Toggle user-bills in-page back button if navigated from notifications
    const userBillsBack = document.getElementById('userBillsBackBtn');
    if (userBillsBack) {
      userBillsBack.style.display = (this.navigatedFromDesktopPopover || this.navigatedFromMobileNotifScreen || this.navigatedFromNotifications) ? 'inline-flex' : 'none';
    }

    // Determine which nav page should be highlighted
    let activeNavPage = page;
    const isMobileNav = window.innerWidth <= 768;
    const isAdminRole = this.getRole() === 'admin';
    if (page === 'mealchart' || page === 'bazar' || page === 'summary' || page === 'export-slip' || page === 'fridaymeal') {
      activeNavPage = (isAdminRole && page === 'bazar') ? (isMobileNav ? 'more-sheet' : 'bazar') : 'overview';
    } else if (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices') {
      activeNavPage = (isAdminRole ? (['tasks', 'notices'].includes(page) && isMobileNav ? 'more-sheet' : 'mymeal') : 'dashboard');
    } else if (isAdminRole && ['users', 'ledger', 'settings', 'more', 'aiassistant', 'profile', 'help'].includes(page)) {
      if (isMobileNav) {
        activeNavPage = 'more-sheet';
      }
    }

    // Update sidebar nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === activeNavPage);
    });

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === activeNavPage);
    });

    // Smoothly slide bottom nav indicator to the newly active tab
    this.updateBottomNavIndicator(!!this._initialNav);

    // Sync native status bar color immediately for the newly active page
    if (window.syncMesslinerStatusBar) {
      window.syncMesslinerStatusBar();
    }

    // Trigger page-specific setup and render without blocking the frame
    requestAnimationFrame(() => {
      this._onPageEnter(page);
    });

    // Restore scroll position for the new page directly like a native app (instant jump, zero animation)
    if (page !== 'export-slip') {
      const savedScroll = this.scrollPositions[page] || 0;
      const restoreInstantScroll = () => {
        if (this.currentPage !== page) return;
        if (contentArea) {
          try {
            contentArea.scrollTo({ top: savedScroll, left: 0, behavior: 'instant' });
          } catch (_) { }
          contentArea.scrollTop = savedScroll;
        }
        try {
          window.scrollTo({ top: savedScroll, left: 0, behavior: 'instant' });
        } catch (_) {
          window.scrollTo(0, savedScroll);
        }
      };

      // Restore immediately synchronously before browser paint
      restoreInstantScroll();

      // Re-apply after layout settles without any animation
      requestAnimationFrame(() => {
        restoreInstantScroll();
        this._isRestoringScroll = false;
      });
      setTimeout(() => {
        restoreInstantScroll();
        this._isRestoringScroll = false;
      }, 50);
    } else {
      this._isRestoringScroll = false;
    }
  },

  /**
   * Called when a page becomes active — trigger any page-specific setup
   */
  _onPageEnter(page) {
    switch (page) {
      case 'dashboard':
        if (Messliner.syncRoleLayout) Messliner.syncRoleLayout(this.getRole());
        if (Messliner.userDashboard) Messliner.userDashboard.refresh();
        break;
      case 'users':
        if (Messliner.users) Messliner.users.refresh();
        break;
      case 'meals':
        if (Messliner.meals) Messliner.meals.refresh();
        if (Messliner.fridayMeals) Messliner.fridayMeals.refresh();
        break;
      case 'finance':
        if (Messliner.finance) Messliner.finance.refresh();
        break;
      case 'ledger':
        if (Messliner.ledger) Messliner.ledger.refresh();
        break;
      case 'user-bills':
        if (Messliner.userBills) Messliner.userBills.render();
        break;
      case 'overview':
        if (Messliner.overview) Messliner.overview.refresh();
        break;
      case 'settings':
        if (Messliner.settings) Messliner.settings.refresh();
        break;
      case 'profile':
        if (Messliner.history) Messliner.history.refresh();
        break;
      case 'mymeal':
        if (Messliner.syncRoleLayout) Messliner.syncRoleLayout(this.getRole());
        if (Messliner.userDashboard) Messliner.userDashboard.refresh();
        break;
      case 'mealchart':
        if (window.MealChartModule) MealChartModule.refresh();
        else if (Messliner.mealChart) Messliner.mealChart.refresh();
        break;
      case 'bazar': {
        const isBazarAdmin = Messliner.state?.role === 'admin';
        const userView = document.getElementById('bazarUserViewContainer');
        const adminView = document.getElementById('bazarAdminViewContainer');
        if (userView) userView.style.display = isBazarAdmin ? 'none' : 'block';
        if (adminView) adminView.style.display = isBazarAdmin ? 'block' : 'none';

        if (isBazarAdmin) {
          if (Messliner.bazar) Messliner.bazar.refresh();
        } else {
          if (window.BazarHistoryModule) BazarHistoryModule.refresh();
          else if (Messliner.bazarHistory) Messliner.bazarHistory.refresh();
        }
        break;
      }
      case 'summary':
        if (Messliner.summary) Messliner.summary.refresh();
        break;
      case 'history':
        if (window.HistoryPageModule) HistoryPageModule.init();
        break;
      case 'export-slip':
        if (Messliner.overview) Messliner.overview.initExportPage();
        break;
      case 'fridaymeal':
        if (Messliner.fridayMealPage) Messliner.fridayMealPage.refresh();
        else if (window.FridayMealPageModule) FridayMealPageModule.refresh();
        break;
      case 'more':
        if (Messliner.smsAlert) Messliner.smsAlert.refresh();
        break;
      case 'aiassistant':
        if (Messliner.history) Messliner.history.refresh();
        break;
      case 'mealhistory':
        if (Messliner.userDashboard) {
          if (!Messliner.userDashboard._selectedHistoryMonth) {
            Messliner.userDashboard._selectedHistoryMonth = Utils.currentMonth();
          }
          Messliner.userDashboard.renderMealHistoryModalContent();
        }
        break;
      case 'bazarroster':
        if (Messliner.userDashboard) {
          Messliner.userDashboard.renderBazarRosterPage();
        }
        break;
    }
  },

  /**
   * Update bottom nav sliding indicator capsule position & width
   * @param {boolean} instant - When true, snap without transition animation
   */
  updateBottomNavIndicator(instant = false) {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    if (window.getComputedStyle(nav).display === 'none') return;

    const container = nav.querySelector('.bottom-nav-items');
    if (!container) return;

    let indicator = document.getElementById('bottomNavIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bottomNavIndicator';
      indicator.className = 'bottom-nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      container.prepend(indicator);
    }

    const activeBtn = container.querySelector('.bottom-nav-item.active');
    if (!activeBtn || activeBtn.offsetParent === null || activeBtn.offsetWidth === 0) {
      indicator.style.opacity = '0';
      return;
    }

    const applyPos = (noAnim) => {
      const left = activeBtn.offsetLeft;
      const top = activeBtn.offsetTop;
      const width = activeBtn.offsetWidth;
      const height = activeBtn.offsetHeight;

      if (noAnim) {
        indicator.style.transition = 'none';
      }

      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.opacity = '1';

      if (!nav.classList.contains('has-slider')) {
        nav.classList.add('has-slider');
      }

      if (noAnim) {
        requestAnimationFrame(() => {
          indicator.style.transition = '';
        });
      }
    };

    applyPos(instant);

    // Follow-up RAF only on instant / initial layout settling to prevent interrupting smooth glide
    if (instant) {
      requestAnimationFrame(() => {
        const currentActive = container.querySelector('.bottom-nav-item.active');
        if (currentActive && currentActive.offsetWidth > 0) {
          applyPos(true);
        }
      });
    }
  },

  /**
   * Initialize bottom nav indicator click/pointer triggers and resize observers
   */
  initBottomNavIndicator() {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const container = nav.querySelector('.bottom-nav-items');
    if (!container) return;

    // Fast zero-latency touch response via pointerdown (native mobile app response)
    container.querySelectorAll('.bottom-nav-item').forEach(btn => {
      let lastTrigger = 0;
      const handleTrigger = (e) => {
        const page = btn.dataset.page;
        if (!page) return;

        // Dedicated handling for Mobile Manager "More" Bottom Sheet
        if (page === 'more-sheet' || btn.id === 'bottomNavMore') {
          // Ignore pointerdown to prevent ghost clicks on the overlay during sheet slide-up
          if (e && e.type === 'pointerdown') return;
          if (e) {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch (_) {}
          }
          const now = Date.now();
          if (now - lastTrigger < 350) return; // Debounce clicks
          lastTrigger = now;

          if (window.Messliner && typeof Messliner.toggleMoreSheet === 'function') {
            Messliner.toggleMoreSheet();
          }
          return;
        }

        if (e.type === 'pointerdown' && e.button !== 0) return;
        const now = Date.now();
        if (now - lastTrigger < 300) return; // Prevent double trigger from pointerdown + synthetic click
        lastTrigger = now;

        // Close More sheet if open when tapping any standard nav tab
        if (window.Messliner && typeof Messliner.closeMoreSheet === 'function') {
          Messliner.closeMoreSheet(true);
        }

        // Optimistically update active state immediately for zero latency
        container.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateBottomNavIndicator(false);

        // Immediate navigation trigger
        let targetPage = page;
        if (page === 'meals') {
          targetPage = this.role === 'admin' ? 'meals' : 'overview';
        } else if (page === 'finance') {
          targetPage = this.role === 'admin' ? 'finance' : 'overview';
        }
        if (this.currentPage !== targetPage) {
          this.navigate(targetPage);
        } else {
          // If already on this page and user taps again, smoothly scroll to top
          const contentArea = document.querySelector('.content-area');
          if (contentArea && contentArea.scrollTop > 0) {
            contentArea.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      };

      btn.addEventListener('pointerdown', handleTrigger, { passive: true });
      btn.addEventListener('click', handleTrigger);
    });

    // Auto-realign on window resize or orientation change
    window.addEventListener('resize', () => {
      this.updateBottomNavIndicator(true);
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        this.updateBottomNavIndicator(true);
      });
      ro.observe(container);
    }

    // Initial positioning
    this.updateBottomNavIndicator(true);
  }
};
window.Router = Router;

window.updateBottomNavIndicator = function (instant) {
  if (window.Router && typeof Router.updateBottomNavIndicator === 'function') {
    Router.updateBottomNavIndicator(instant);
  }
};

console.log('[Messliner] Router loaded');
