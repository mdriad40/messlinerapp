/* ============================================
   Messliner — Client-Side Router (router.js)
   ============================================ */

const Router = {
  currentPage: 'dashboard',
  adminPages: ['users', 'meals', 'finance', 'settings', 'mymeal', 'more', 'aicontrol'],
  // Note: 'fridaymeal' is accessible to all roles
  scrollPositions: {},

  /**
   * Initialize the router
   */
  init(role) {
    this.role = role;

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      const page = location.hash.replace('#', '') || 'dashboard';
      this._showPage(page);
    });

    // Navigate to initial page from URL hash
    const initialPage = location.hash.replace('#', '') || 'dashboard';
    this._showPage(initialPage);
  },

  /**
   * Navigate to a page
   */
  navigate(page) {
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

    location.hash = page;
    this._showPage(page);

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  },

  /**
   * Show a specific page section and update nav state
   */
  _showPage(page) {
    // If leaving export-slip page, clean up its special layout class
    if (this.currentPage === 'export-slip' && page !== 'export-slip') {
      if (Messliner.overview && Messliner.overview._leaveExportPage) {
        Messliner.overview._leaveExportPage();
      }
    }

    // Save scroll position of current page before switching (skip export-slip — it uses overflow:hidden)
    const contentArea = document.querySelector('.content-area');
    if (this.currentPage && this.currentPage !== 'export-slip') {
      const scrollY = window.scrollY || document.documentElement.scrollTop || (contentArea ? contentArea.scrollTop : 0);
      this.scrollPositions[this.currentPage] = scrollY;
    }

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

    this.currentPage = page;

    // Hide all page sections
    document.querySelectorAll('.page-section').forEach(s => {
      s.classList.remove('active');
    });

    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.add('active');
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

    // Update page title in header
    const titles = {
      dashboard: 'Dashboard',
      users: 'Members',
      meals: 'Meal Management',
      finance: 'Finance',
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
      aicontrol: 'AI Control Panel',
      aiassistant: 'Messliner AI'
    };
    if (page === 'dashboard') {
      if (typeof Messliner !== 'undefined' && Messliner.updateHomeHeaderGreeting) {
        Messliner.updateHomeHeaderGreeting();
      }
      const subtitle = document.getElementById('headerSubtitle');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    } else if (page === 'aiassistant') {
      const greetingEl = document.getElementById('headerGreeting');
      if (greetingEl) greetingEl.style.display = 'none';
      const headerTitle = document.getElementById('headerTitle');
      if (headerTitle) {
        headerTitle.textContent = 'Messliner AI';
      }
      const subtitle = document.getElementById('headerSubtitle');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    } else {
      const greetingEl = document.getElementById('headerGreeting');
      if (greetingEl) greetingEl.style.display = 'none';
      Utils.setText('headerTitle', titles[page] || 'Dashboard');
      const subtitle = document.getElementById('headerSubtitle');
      if (subtitle) {
        subtitle.textContent = '';
        subtitle.style.display = 'none';
      }
    }
    // Update the green icon pill in the header
    if (typeof setHeaderIcon === 'function') setHeaderIcon(page);

    // Toggle header back button and mobile menu button visibility
    const backBtn = document.getElementById('headerBackBtn');
    if (backBtn) {
      const showBack = (page === 'mealchart' || page === 'bazar' || page === 'summary' || page === 'history' || page === 'notifications' || page === 'export-slip' || page === 'fridaymeal');
      backBtn.style.display = showBack ? 'inline-flex' : 'none';

      // Set onclick dynamically to handle navigation flow
      if (page === 'notifications') {
        backBtn.onclick = () => window.history.back();
      } else if (page === 'export-slip') {
        backBtn.onclick = () => Messliner.router.navigate('overview');
      } else {
        backBtn.onclick = () => Messliner.router.navigate('overview');
      }

      const menuBtn = document.querySelector('.mobile-menu-btn');
      if (menuBtn) {
        if (showBack) {
          menuBtn.style.setProperty('display', 'none', 'important');
        } else {
          menuBtn.style.removeProperty('display');
        }
      }
    }

    // Determine which nav page should be highlighted
    let activeNavPage = page;
    if (page === 'mealchart' || page === 'bazar' || page === 'summary' || page === 'history' || page === 'export-slip' || page === 'fridaymeal') {
      activeNavPage = 'overview';
    }

    // Update sidebar nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === activeNavPage);
    });

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === activeNavPage);
    });

    // Trigger page-specific init
    this._onPageEnter(page);

    // Restore scroll position for the new page
    // Skip scroll restoration for export-slip — initExportPage forces scrollTop=0 itself
    if (page !== 'export-slip') {
      const savedScroll = this.scrollPositions[page] || 0;

      // Temporarily disable smooth scrolling to scroll instantly
      const htmlEl = document.documentElement;
      const prevScrollBehavior = htmlEl.style.scrollBehavior;
      htmlEl.style.scrollBehavior = 'auto';

      if (contentArea) {
        contentArea.scrollTop = savedScroll;
      }
      window.scrollTo(0, savedScroll);

      // Reinforced fallback to handle dynamic rendering or layout reflows
      requestAnimationFrame(() => {
        if (contentArea) {
          contentArea.scrollTop = savedScroll;
        }
        window.scrollTo(0, savedScroll);

        // Restore previous scroll behavior
        setTimeout(() => {
          htmlEl.style.scrollBehavior = prevScrollBehavior;
        }, 50);
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
      case 'bazar':
        if (Messliner.bazarHistory) Messliner.bazarHistory.refresh();
        break;
      case 'summary':
        if (Messliner.summary) Messliner.summary.refresh();
        break;
      case 'history':
        if (Messliner.history) Messliner.history.refreshHistoryPage();
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
      case 'aicontrol':
        if (Messliner.aiControl) Messliner.aiControl.setupListeners();
        break;
      case 'aiassistant':
        if (Messliner.history) Messliner.history.refresh();
        break;
    }
  }
};

console.log('[Messliner] Router loaded');
