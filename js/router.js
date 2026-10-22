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
      if (window.history.replaceState) {
        history.replaceState(null, '', '#notifications');
        this._showPage('notifications');
      } else {
        this.navigate('notifications');
      }
      return;
    }

    // 3. If currently on Notifications screen: back button returns to origin page or dashboard (never loops back into detail pages!)
    if (this.currentPage === 'notifications') {
      const returnPage = (this.notificationOriginPage && this.notificationOriginPage !== 'overview') ? this.notificationOriginPage : 'dashboard';
      this.notificationOriginPage = null;
      if (window.history.replaceState) {
        history.replaceState(null, '', `#${returnPage}`);
        this._showPage(returnPage);
      } else {
        this.navigate(returnPage);
      }
      return;
    }

    if (this.currentPage === 'export-slip') {
      this.navigate(this.previousPage === 'overview' ? 'overview' : 'dashboard');
    } else if (['mealhistory', 'bazarroster', 'tasks', 'notices'].includes(this.currentPage)) {
      this.navigate(this.role === 'admin' ? 'mymeal' : 'dashboard');
    } else if (['bazar', 'mealchart', 'summary', 'history', 'fridaymeal'].includes(this.currentPage)) {
      if (this.previousPage === 'overview' || this.role !== 'admin') {
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

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      const page = location.hash.replace('#', '') || 'dashboard';
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

    // Navigate to initial page from URL hash
    this._initialNav = true;
    const initialPage = location.hash.replace('#', '') || 'dashboard';
    this._showPage(initialPage);
    this._initialNav = false;

    // Continuously preserve scroll position of active page
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      contentArea.addEventListener('scroll', () => {
        if (this._isRestoringScroll) return; // Prevent spurious collapse/restoration scroll events from wiping saved positions!
        if (this.currentPage && this.currentPage !== 'export-slip') {
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
  navigate(page) {
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
    if (this.role !== 'admin' && this.adminPages.includes(page)) {
      Notifications.toast('warning', 'Access Denied', 'You do not have permission to view this page.');
      return;
    }

    // AI Assistant guard
    if (page === 'aiassistant' && this.role !== 'admin') {
      const settings = Messliner.history ? Messliner.history.settings : null;
      if (settings && settings.aiAssistantEnabled === false) {
        Notifications.toast('warning', 'Access Denied', 'AI Assistant is currently disabled by the manager.');
        return;
      }
    }

    if (this.currentPage && this.currentPage !== page && this.currentPage !== 'notifications') {
      this.previousPage = this.currentPage;
    }

    location.hash = page;
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
    const subpages = ['mealchart', 'bazar', 'summary', 'fridaymeal', 'mealhistory', 'bazarroster', 'tasks', 'notices', 'export-slip'];
    if (subpages.includes(newPage)) {
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
    if (prevPage && prevPage !== 'export-slip' && contentArea) {
      const scrollY = (typeof contentArea.scrollTop === 'number')
        ? contentArea.scrollTop
        : 0;
      this.scrollPositions[prevPage] = scrollY;
    }

    // Flag that we are restoring scroll so spurious DOM collapse scroll events are ignored
    this._isRestoringScroll = true;

    // Validate page
    const section = document.getElementById(`page-${page}`);
    if (!section) {
      page = 'dashboard';
    }

    // Role guard
    if (this.role !== 'admin' && this.adminPages.includes(page)) {
      page = 'dashboard';
    }

    // AI Assistant guard
    if (page === 'aiassistant' && this.role !== 'admin') {
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

      // Instantly restore scroll position synchronously at the moment of activation (zero animation/gliding)
      if (page !== 'export-slip') {
        const savedScroll = this.scrollPositions[page] || 0;
        if (contentArea) {
          contentArea.scrollTop = savedScroll;
        }
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

    // Toggle active class on body for dining subpages (Meal Chart, Bazar, Summary, Friday's Meal)
    const isDiningSubpage = ['mealchart', 'bazar', 'summary', 'fridaymeal'].includes(page);
    document.body.classList.toggle('dining-subpage-active', isDiningSubpage);
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
      mymeal: 'My Meal',
      mealchart: 'Meal Chart',
      bazar: 'Bazar',
      summary: 'Summary',
      history: 'History',
      notifications: 'Notifications',
      fridaymeal: "Friday Meal's",
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
      Utils.setText('headerTitle', titles[page] || 'Meal Chart');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.setProperty('display', 'none', 'important');
      }
    } else if (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices') {
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
    if (pageIcon && (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices' || page === 'dashboard')) {
      pageIcon.style.setProperty('display', 'none', 'important');
    }

    // Toggle header back button and mobile menu button visibility
    const backBtn = document.getElementById('headerBackBtn');
    if (backBtn) {
      const showBack = (this.navigatedFromDesktopPopover || this.navigatedFromMobileNotifScreen || this.navigatedFromNotifications || page === 'mealchart' || page === 'bazar' || page === 'summary' || page === 'history' || page === 'notifications' || page === 'export-slip' || page === 'fridaymeal' || page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices' || page === 'finance' || page === 'ledger');
      backBtn.style.display = showBack ? 'inline-flex' : 'none';

      // Set onclick dynamically to handle navigation flow
      backBtn.onclick = () => this.handleBack();

      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (menuBtn) {
        if (showBack) {
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
    if (page === 'mealchart' || page === 'bazar' || page === 'summary' || page === 'export-slip' || page === 'fridaymeal') {
      activeNavPage = 'overview';
    } else if (page === 'mealhistory' || page === 'bazarroster' || page === 'tasks' || page === 'notices') {
      activeNavPage = (this.role === 'admin' ? 'mymeal' : 'dashboard');
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

    const targetScroll = (page !== 'export-slip') ? (this.scrollPositions[page] || 0) : 0;

    // Trigger page-specific setup and render
    if (this._initialNav) {
      this._onPageEnter(page);
      if (contentArea && contentArea.scrollTop !== targetScroll) {
        contentArea.scrollTop = targetScroll;
      }
      this._isRestoringScroll = false;
    } else {
      this._onPageEnter(page);
      if (contentArea && contentArea.scrollTop !== targetScroll) {
        contentArea.scrollTop = targetScroll;
      }

      // Re-confirm scroll position once layout/DOM settle, then release guard
      requestAnimationFrame(() => {
        if (this.currentPage === page && contentArea && contentArea.scrollTop !== targetScroll) {
          contentArea.scrollTop = targetScroll;
        }
        setTimeout(() => {
          if (this.currentPage === page && contentArea && contentArea.scrollTop !== targetScroll) {
            contentArea.scrollTop = targetScroll;
          }
          this._isRestoringScroll = false;
        }, 60);
      });
    }
  },

  /**
   * Called when a page becomes active — trigger any page-specific setup
   */
  _onPageEnter(page) {
    switch (page) {
      case 'dashboard':
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
        if (Messliner.userDashboard) Messliner.userDashboard.refresh();
        break;
      case 'mealchart':
        // MealChartModule init is called on app start; no refresh needed here
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
        if (e.type === 'pointerdown' && e.button !== 0) return;
        const now = Date.now();
        if (now - lastTrigger < 300) return; // Prevent double trigger from pointerdown + synthetic click
        lastTrigger = now;

        const page = btn.dataset.page;
        if (!page) return;

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
