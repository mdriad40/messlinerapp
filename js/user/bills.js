/**
 * Messliner — User Bills & Ledger Module (js/user/bills.js)
 * Allows dining members to view their individual bills, balance overview,
 * pay shared bills (Cash / bKash / Nagad), request money top-ups (Add Money),
 * and track payment request history.
 */

const UserBillsModule = {
  diningId: null,
  userId: null,
  activeTab: 'overview', // 'overview' | 'bills' | 'history'
  currentCycle: null,    // e.g. '2026-09'
  bills: {},
  paymentRequests: {},
  paymentMethods: {},
  userDeposits: {},
  mealsData: {},
  selectedMethod: 'cash',
  selectedBillId: null,
  selectedPayBillMethod: 'cash',

  readyPromise: null,
  _resolveReady: null,

  /**
   * Preset category icons matching admin ledger
   */
  categoryIcons: {
    cook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="1" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
    electricity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    water: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
    gas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  },

  /**
   * Safely get current dining ID
   */
  getDiningId() {
    return this.diningId || Messliner.state?.diningId || (typeof App !== 'undefined' ? App.state?.diningId : null);
  },

  /**
   * Safely get current user ID (supports impersonation)
   */
  getUserId() {
    return Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid) || (typeof App !== 'undefined' ? App.state?.userId : null);
  },

  /**
   * Initialize module with Firebase listeners and pre-fetched data
   */
  init(diningId, userId, initialData) {
    this.diningId = diningId || this.getDiningId();
    this.userId = userId || this.getUserId();
    this.currentCycle = Utils.currentMonth();

    if (!this.readyPromise) {
      this.readyPromise = new Promise(res => { this._resolveReady = res; });
    }

    if (initialData?.bills) {
      this.bills = initialData.bills;
    }
    if (initialData?.deposits) {
      this.userDeposits = initialData.deposits;
    }
    if (initialData?.paymentRequests) {
      this.paymentRequests = initialData.paymentRequests;
    }
    if (initialData?.meals) {
      this.mealsData = initialData.meals;
    }
    if (initialData?.settings?.paymentMethods) {
      this.paymentMethods = initialData.settings.paymentMethods;
    }
    if (initialData?.settings?.historyStartDate) {
      this.historyStartDate = initialData.settings.historyStartDate;
    }

    if (!this.diningId) {
      console.warn('[UserBillsModule] No active diningId available during init');
      if (this._resolveReady) { this._resolveReady(); this._resolveReady = null; }
      return;
    }

    // Fetch historyStartDate if not preloaded (non-blocking)
    if (!this.historyStartDate) {
      this.fetchHistoryStartDate();
    }

    // Close cycle dropdown on outside click
    if (!this._docClickListenerAdded) {
      this._docClickListenerAdded = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#userBillsCycleDropdownContainer')) {
          const container = document.getElementById('userBillsCycleDropdownContainer');
          if (container) container.classList.remove('open');
        }
      });
    }

    // Synchronously render preloaded/cached data immediately so DOM is complete before shimmer dismisses
    this.renderOverview();
    this.renderBills();
    this.renderHistory();

    if (this._resolveReady && (this.bills && Object.keys(this.bills).length > 0 || this.userDeposits && Object.keys(this.userDeposits).length > 0)) {
      this._resolveReady();
      this._resolveReady = null;
    }

    // Attach Live Listeners
    this.attachListeners();

    // Trigger initial render
    if (Router.currentPage === 'user-bills') {
      this.render();
    }
  },

  /**
   * Ensure real-time Firebase listeners are connected
   */
  attachListeners() {
    this.attachDropdownListeners();

    const diningId = this.getDiningId();
    if (!diningId) return;
    if (this._firebaseListenersAttached && this._attachedDiningId === diningId) return;

    this._firebaseListenersAttached = true;
    this._attachedDiningId = diningId;

    // 1. Listen to Bills in real-time
    db.ref(`dinings/${diningId}/bills`).on('value', (snap) => {
      this.bills = snap.val() || {};
      this.renderOverview();
      this.renderBills();
      this.renderHistory();
      if (this._resolveReady) { this._resolveReady(); this._resolveReady = null; }
    });

    // 2. Listen to Deposits
    db.ref(`dinings/${diningId}/deposits`).on('value', (snap) => {
      this.userDeposits = snap.val() || {};
      this.renderOverview();
      this.renderHistory();
      if (this._resolveReady) { this._resolveReady(); this._resolveReady = null; }
    });

    // 3. Listen to Payment Requests
    db.ref(`dinings/${diningId}/paymentRequests`).on('value', (snap) => {
      this.paymentRequests = snap.val() || {};
      this.renderOverview();
      this.renderBills();
      this.renderHistory();
      if (this._resolveReady) { this._resolveReady(); this._resolveReady = null; }
    });

    // 4. Listen to Meals
    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      this.mealsData = snap.val() || {};
      this.renderOverview();
    });

    // 5. Listen to Payment Methods config
    db.ref(`dinings/${diningId}/settings/paymentMethods`).on('value', (snap) => {
      this.paymentMethods = snap.val() || {};
      if (document.getElementById('addMoneyModal')?.classList.contains('active')) {
        this.renderPaymentMethodPills();
        this.updatePaymentMethodView();
      }
      if (document.getElementById('payBillModal')?.classList.contains('active')) {
        this.renderPayBillMethodPills();
        this.updatePayBillMethodView();
      }
    });

    // 6. Listen to Settings historyStartDate
    db.ref(`dinings/${diningId}/settings/historyStartDate`).on('value', (snap) => {
      this.historyStartDate = snap.val() || null;
      if (this.activeTab === 'bills' && Router.currentPage === 'user-bills') {
        this.renderBills();
      }
    });

    // 7. Initialize swipe gesture support for switching tabs
    this.initSwipeGestures();
  },

  /**
   * Fetch history start date from admin settings (with fallback to dining info or 2026-01-01)
   */
  async fetchHistoryStartDate() {
    const diningId = this.getDiningId();
    if (!diningId) return;
    try {
      const snap = await db.ref(`dinings/${diningId}/settings/historyStartDate`).once('value');
      const val = snap.val();
      if (val) {
        this.historyStartDate = val;
      } else {
        const infoSnap = await db.ref(`dinings/${diningId}/info/createdAt`).once('value');
        this.historyStartDate = infoSnap.val() || '2026-01-01';
      }
    } catch (e) {
      if (!this.historyStartDate) this.historyStartDate = '2026-01-01';
    }
    if (this.activeTab === 'bills' && Router.currentPage === 'user-bills') {
      this.renderBills();
    }
  },

  /**
   * Touch swipe gesture listeners on Ledger page to allow smooth swiping between tabs
   */
  initSwipeGestures() {
    const page = document.getElementById('page-user-bills');
    if (!page || this._swipeAttached) return;
    this._swipeAttached = true;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    page.addEventListener('touchstart', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      // Do not trigger swipe on form elements or active modals
      if (e.target.closest('.modal-overlay.active, .modal-sheet.active, input, textarea, select, button, .user-bills-tabs')) return;
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    page.addEventListener('touchend', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      if (e.target.closest('.modal-overlay.active, .modal-sheet.active, input, textarea, select, button, .user-bills-tabs')) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      // Swiped horizontally: at least 45px, predominantly horizontal, within 550ms
      if (elapsed < 550 && Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        const TABS = ['overview', 'bills', 'history'];
        const currentTab = this.activeTab || 'overview';
        const currentIndex = TABS.indexOf(currentTab);

        if (diffX < 0) {
          // Swipe left -> advance to next tab
          if (currentIndex >= 0 && currentIndex < TABS.length - 1) {
            this.switchTab(TABS[currentIndex + 1]);
          }
        } else {
          // Swipe right -> return to previous tab
          if (currentIndex > 0) {
            this.switchTab(TABS[currentIndex - 1]);
          }
        }
      }
    }, { passive: true });
  },

  /**
   * Format cycle string "2026-09" to readable "Sep 2026"
   */
  formatCycle(cycle) {
    if (!cycle) return '';
    const [year, month] = cycle.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  },

  /**
   * Safe due date formatter: "15 Sep" or "Sep 15"
   */
  formatDueDate(dateVal) {
    if (!dateVal) return 'No date';
    try {
      if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        const [y, m, d] = dateVal.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      }
      const dt = new Date(dateVal);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      }
      return String(dateVal);
    } catch (e) {
      return 'No date';
    }
  },

  /**
   * Get cycle limits:
   * Minimum: admin panel historyStartDate (or fallback to createdAt or 2026-01)
   * Maximum: current month + 1 next month
   */
  getCycleBounds() {
    let minYear = 2026;
    let minMonth = 1;
    if (this.historyStartDate) {
      const d = new Date(this.historyStartDate);
      if (!isNaN(d.getTime())) {
        minYear = d.getFullYear();
        minMonth = d.getMonth() + 1;
      }
    }
    const minCycle = `${minYear}-${String(minMonth).padStart(2, '0')}`;

    // Current month + 1 next month
    const now = new Date();
    let maxYear = now.getFullYear();
    let maxMonth = now.getMonth() + 2; // +1 for 1-based, +1 for 1 month in advance
    if (maxMonth > 12) {
      maxMonth -= 12;
      maxYear += 1;
    }
    const maxCycle = `${maxYear}-${String(maxMonth).padStart(2, '0')}`;

    return { minCycle, maxCycle, minYear, minMonth, maxYear, maxMonth };
  },

  /**
   * Return an array of all allowed cycles from minCycle to maxCycle
   */
  getAllowedCycles() {
    const { minYear, minMonth, maxYear, maxMonth } = this.getCycleBounds();
    const cycles = [];
    let y = minYear;
    let m = minMonth;

    while (y < maxYear || (y === maxYear && m <= maxMonth)) {
      cycles.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return cycles;
  },

  /**
   * Navigate to previous month cycle (bounded by historyStartDate)
   */
  prevMonth() {
    const { minCycle } = this.getCycleBounds();
    if (!this.currentCycle) this.currentCycle = Utils.currentMonth();
    if (this.currentCycle <= minCycle) return;

    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    const target = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.currentCycle = target < minCycle ? minCycle : target;
    this.renderBills();
  },

  /**
   * Navigate to next month cycle (bounded by current month + 1 next month)
   */
  nextMonth() {
    const { maxCycle } = this.getCycleBounds();
    if (!this.currentCycle) this.currentCycle = Utils.currentMonth();
    if (this.currentCycle >= maxCycle) return;

    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const target = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.currentCycle = target > maxCycle ? maxCycle : target;
    this.renderBills();
  },

  /**
   * Select a specific cycle from dropdown
   */
  selectCycle(cycle) {
    const { minCycle, maxCycle } = this.getCycleBounds();
    if (cycle < minCycle) cycle = minCycle;
    if (cycle > maxCycle) cycle = maxCycle;
    this.currentCycle = cycle;
    this.closeCycleDropdown();
    this.renderBills();
  },

  /**
   * Toggle month selection dropdown
   */
  toggleCycleDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = document.getElementById('userBillsCycleDropdownContainer');
    if (container) {
      container.classList.toggle('open');
    }
  },

  /**
   * Close month selection dropdown
   */
  closeCycleDropdown() {
    const container = document.getElementById('userBillsCycleDropdownContainer');
    if (container) {
      container.classList.remove('open');
    }
  },

  currentHistoryCycle: null,
  historyItemsMap: {},

  /**
   * Navigate to previous month cycle for History
   */
  prevHistoryMonth() {
    const { minCycle } = this.getCycleBounds();
    if (!this.currentHistoryCycle) this.currentHistoryCycle = Utils.currentMonth();
    if (this.currentHistoryCycle <= minCycle) return;

    const [year, month] = this.currentHistoryCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    const target = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.currentHistoryCycle = target < minCycle ? minCycle : target;
    this.renderHistory();
  },

  /**
   * Navigate to next month cycle for History
   */
  nextHistoryMonth() {
    const { maxCycle } = this.getCycleBounds();
    if (!this.currentHistoryCycle) this.currentHistoryCycle = Utils.currentMonth();
    if (this.currentHistoryCycle >= maxCycle) return;

    const [year, month] = this.currentHistoryCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const target = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.currentHistoryCycle = target > maxCycle ? maxCycle : target;
    this.renderHistory();
  },

  /**
   * Select a specific cycle from History dropdown
   */
  selectHistoryCycle(cycle) {
    const { minCycle, maxCycle } = this.getCycleBounds();
    if (cycle < minCycle) cycle = minCycle;
    if (cycle > maxCycle) cycle = maxCycle;
    this.currentHistoryCycle = cycle;
    this.closeHistoryCycleDropdown();
    this.renderHistory();
  },

  /**
   * Toggle month selection dropdown for History
   */
  toggleHistoryCycleDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = document.getElementById('userBillsHistoryCycleDropdownContainer');
    if (container) {
      container.classList.toggle('open');
    }
  },

  /**
   * Close month selection dropdown for History
   */
  closeHistoryCycleDropdown() {
    const container = document.getElementById('userBillsHistoryCycleDropdownContainer');
    if (container) {
      container.classList.remove('open');
    }
  },

  /**
   * Attach global document click listeners for cycle dropdowns
   */
  attachDropdownListeners() {
    if (this._dropdownListenersAttached) return;
    this._dropdownListenersAttached = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#userBillsCycleDropdownContainer')) {
        this.closeCycleDropdown();
      }
      if (!e.target.closest('#userBillsHistoryCycleDropdownContainer')) {
        this.closeHistoryCycleDropdown();
      }
    });
  },

  /**
   * Switch between Overview, Bills, and History tabs with smooth directional slide transition & sliding glider indicator
   */
  switchTab(tab) {
    const previousTab = this.activeTab || 'overview';
    const tabsContainer = document.getElementById('userBillsTabsContainer');

    // Always keep segmented indicator attribute synced
    if (tabsContainer) {
      tabsContainer.dataset.active = tab;
    }

    if (this.activeTab === tab) return;

    const TAB_ORDER = { overview: 0, bills: 1, history: 2 };
    const oldIndex = TAB_ORDER[previousTab] ?? 0;
    const newIndex = TAB_ORDER[tab] ?? 0;
    const animClass = newIndex >= oldIndex ? 'slide-from-right' : 'slide-from-left';

    this.activeTab = tab;

    document.querySelectorAll('.user-bills-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const sections = {
      overview: document.getElementById('userBillsSecOverview'),
      bills: document.getElementById('userBillsSecBills'),
      history: document.getElementById('userBillsSecHistory')
    };

    Object.entries(sections).forEach(([key, sec]) => {
      if (!sec) return;
      if (key === tab) {
        sec.style.display = 'block';
        sec.classList.remove('slide-from-right', 'slide-from-left');
        void sec.offsetWidth; // Force reflow to restart animation smoothly
        sec.classList.add(animClass);
      } else {
        sec.style.display = 'none';
        sec.classList.remove('slide-from-right', 'slide-from-left');
      }
    });

    this.render();
  },

  /**
   * Helper: Return clean, professional SVG status pill without emojis
   */
  getStatusPillHtml(status, type = 'req', isDetail = false) {
    const s = String(status || '').toLowerCase();

    // 1. Deposits / Credit Records from Finance (Already completed transactions)
    if (type === 'deposit_record' || s === 'deposit') {
      return `
        <span class="user-history-status-pill approved">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Deposit</span>
        </span>
      `;
    }

    // 2. Deduction Records (Admin expense deduction / friday meal)
    if (type === 'deduction' || s === 'deducted') {
      return `
        <span class="user-history-status-pill collected">
          <span>Deducted</span>
        </span>
      `;
    }

    // 3. Approved / Collected State
    if (s === 'approved' || s === 'collected' || s === 'completed' || s === 'paid') {
      const isBill = type === 'bill_payment';
      const label = isBill ? 'Cleared' : (type === 'deposit_record' ? 'Deposit' : 'Approved');
      return `
        <span class="user-history-status-pill approved ${isBill ? 'ledger-cleared' : ''}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>${label}</span>
        </span>
      `;
    }

    // 4. Rejected State
    if (s === 'rejected') {
      return `
        <span class="user-history-status-pill rejected">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span>Rejected</span>
        </span>
      `;
    }

    // 5. Pending State (Only for pending payment requests)
    const label = isDetail ? 'Pending Review' : 'Pending';
    return `
      <span class="user-history-status-pill pending">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 15 14"/>
        </svg>
        <span>${label}</span>
      </span>
    `;
  },

  /**
   * Main render method
   */
  async render() {
    this.diningId = this.getDiningId();
    this.userId = this.getUserId();
    this.attachListeners();

    const fetchPromises = [];
    if (this.diningId && (!this.paymentRequests || Object.keys(this.paymentRequests).length === 0)) {
      fetchPromises.push(
        db.ref(`dinings/${this.diningId}/paymentRequests`).once('value').then(pSnap => {
          if (pSnap.exists()) this.paymentRequests = pSnap.val() || {};
        }).catch(e => { console.warn('PaymentRequests prefetch notice:', e); })
      );
    }

    if (this.diningId && (!this.paymentMethods || Object.keys(this.paymentMethods).length === 0)) {
      fetchPromises.push(
        db.ref(`dinings/${this.diningId}/settings/paymentMethods`).once('value').then(pmSnap => {
          if (pmSnap.exists()) this.paymentMethods = pmSnap.val() || {};
        }).catch(e => { console.warn('PaymentMethods prefetch notice:', e); })
      );
    }

    if (this.diningId && (!this.bills || Object.keys(this.bills).length === 0)) {
      fetchPromises.push(
        db.ref(`dinings/${this.diningId}/bills`).once('value').then(bSnap => {
          if (bSnap.exists()) this.bills = bSnap.val() || {};
        }).catch(e => { console.warn('Bills prefetch notice:', e); })
      );
    }

    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }

    this.renderOverview();
    this.renderBills();
    this.renderHistory();

    if (this._resolveReady) {
      this._resolveReady();
      this._resolveReady = null;
    }
  },

  /**
   * Helper: Calculate user financial numbers (balance, meal cost, deposits)
   */
  getUserFinancialMetrics() {
    const currentMonth = Utils.currentMonth();
    const userId = this.getUserId();

    // 1. If UserDashboard is initialized with user data & deposits, use its canonical getDueInfo()
    if (UserDashboard?.userData && UserDashboard.userId === userId && UserDashboard.monthlyDeposit !== undefined) {
      const dueInfo = UserDashboard.getDueInfo();
      return {
        balance: dueInfo.balance,
        mealCost: (UserDashboard.monthlyDeposit || 0) - (UserDashboard.monthlyOtherCosting || 0) - (UserDashboard.monthlyDeduction || 0) - dueInfo.balance,
        userDeposit: UserDashboard.monthlyDeposit || 0
      };
    }

    // 2. Standalone calculation from available data
    let userDeposit = 0;
    let otherCost = 0;
    let deduction = 0;

    // Calculate from user deposits
    Object.values(this.userDeposits || {}).forEach(d => {
      if (d && d.userId === userId && Utils.isItemInMonth(d, currentMonth)) {
        const amt = Math.abs(Utils.num(d.amount));
        if (d.type === 'deposit') {
          userDeposit += amt;
        } else if (d.type === 'other_costing') {
          otherCost += amt;
        } else if (d.type === 'deduction' || d.type === 'friday_meal') {
          deduction += amt;
        } else {
          deduction += amt;
        }
      }
    });

    const settings = Messliner.state?.settings || UserDashboard.settings || {};
    const rateMode = settings.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || null) : null;

    let mealRate = Messliner.state?.monthlyMealRate || Messliner.state?.mealRate || 0;
    if (!mealRate && rateMode !== 'fixed' && Messliner.state?.monthlyTotalMeals > 0) {
      mealRate = (Messliner.state?.monthlyBazar || 0) / Messliner.state.monthlyTotalMeals;
    }

    const mMonth = this.mealsData?.[currentMonth] || {};
    let userMealCount = 0;
    const breakdown = { breakfast: 0, lunch: 0, dinner: 0 };
    Object.values(mMonth).forEach(day => {
      if (typeof day === 'object') {
        ['breakfast', 'lunch', 'dinner'].forEach(t => {
          if (day[t] && typeof day[t] === 'object' && day[t][userId] !== undefined) {
            const count = parseFloat(day[t][userId]) || 0;
            userMealCount += count;
            if (breakdown[t] !== undefined) breakdown[t] += count;
          }
        });
      }
    });

    const mealCost = Utils.calcMealCost(mealRate, userMealCount, breakdown, fixedRates);
    const totalCost = mealCost + otherCost;
    const balance = userDeposit - totalCost - deduction;

    return {
      balance,
      mealCost,
      userDeposit
    };
  },

  /**
   * Render Overview Tab (Balance card, metrics, quick action)
   */
  renderOverview() {
    const userId = this.getUserId();
    const { balance, mealCost } = this.getUserFinancialMetrics();
    const monthShort = new Date().toLocaleString('en-US', { month: 'short' });

    // Days left in current month
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, lastDayOfMonth - now.getDate());

    // Calculate unpaid bills and paid bills for this user
    let unpaidBillsTotal = 0;
    let unpaidBillsCount = 0;
    let paidBillsTotal = 0;
    let paidBillsCount = 0;

    const currentMonth = Utils.currentMonth();

    Object.values(this.bills || {}).forEach(bill => {
      if (!bill) return;
      const billMonth = bill.month || bill.cycle;
      const isCurrentCycle = !billMonth || billMonth === currentMonth;
      const userMember = bill.members?.[userId];
      if (userMember) {
        const amt = Utils.num(userMember.amount);
        if (userMember.status === 'collected') {
          if (isCurrentCycle) {
            paidBillsTotal += amt;
            paidBillsCount++;
          }
        } else {
          unpaidBillsTotal += amt;
          unpaidBillsCount++;
        }
      }
    });

    // Update Overview UI Elements
    const monthEl = document.getElementById('userBillsOverviewMonth');
    if (monthEl) monthEl.textContent = monthShort;

    const balanceMainEl = document.querySelector('.user-balance-main');
    const balanceCurrencyEl = document.getElementById('userBillsBalanceCurrency');
    const balanceNumEl = document.getElementById('userBillsBalanceNum');
    const balanceStatusEl = document.getElementById('userBillsBalanceStatus');
    const isDue = balance < 0;
    const displayBalance = Math.abs(Math.round(balance));

    if (balanceMainEl) {
      balanceMainEl.classList.toggle('is-due', isDue);
    }
    if (balanceCurrencyEl) {
      balanceCurrencyEl.style.color = isDue ? '#fca5a5' : '#a7f3d0';
    }
    if (balanceNumEl) {
      balanceNumEl.textContent = displayBalance.toLocaleString('en-US');
      balanceNumEl.style.color = isDue ? '#fca5a5' : '#ffffff';
    }
    if (balanceStatusEl) {
      balanceStatusEl.textContent = isDue ? 'Due' : 'Current';
      balanceStatusEl.className = `user-balance-badge ${isDue ? 'due' : 'credit'}`;
    }

    // 1. Paid Bill (First column)
    const paidBillsEl = document.getElementById('userBillsOverviewPaidBills');
    if (paidBillsEl) {
      paidBillsEl.innerHTML = `<span class="tk-symbol"></span>${paidBillsTotal.toLocaleString('en-US')}`;
      if (paidBillsTotal > 0) {
        paidBillsEl.classList.add('has-paid');
      } else {
        paidBillsEl.classList.remove('has-paid');
      }
    }

    // 2. Due Bill (Second column)
    const billsDueEl = document.getElementById('userBillsOverviewBillsDue');
    if (billsDueEl) {
      billsDueEl.innerHTML = `<span class="tk-symbol"></span>${unpaidBillsTotal.toLocaleString('en-US')}`;
      if (unpaidBillsTotal > 0) {
        billsDueEl.classList.add('has-due');
      } else {
        billsDueEl.classList.remove('has-due');
      }
    }

    // 3. In Process (Pending bill payment & add money requests)
    const currentUid = String(userId || '').trim();
    const pendingRequests = Object.values(this.paymentRequests || {}).filter(
      r => r && String(r.userId || '').trim() === currentUid && String(r.status || '').toLowerCase() === 'pending'
    );
    const inProcessCount = pendingRequests.length;
    const inProcessEl = document.getElementById('userBillsOverviewInProcess');
    if (inProcessEl) {
      inProcessEl.textContent = String(inProcessCount);
      if (inProcessCount > 0) {
        inProcessEl.classList.add('has-pending');
      } else {
        inProcessEl.classList.remove('has-pending');
      }
    }

    // Pending payment requests count banner
    const bannerEl = document.getElementById('userBillsPendingRequestBanner');
    if (bannerEl) {
      if (pendingRequests.length > 0) {
        const totalPendingReq = pendingRequests.reduce((sum, r) => sum + (Utils.num(r.amount)), 0);
        bannerEl.classList.remove('hidden');
        bannerEl.style.display = 'flex';
        bannerEl.setAttribute('onclick', "Messliner.userBills.switchTab('history')");
        bannerEl.setAttribute('role', 'button');
        bannerEl.setAttribute('tabindex', '0');
        bannerEl.setAttribute('title', 'Click to view transaction history');
        bannerEl.setAttribute('onkeydown', "if(event.key==='Enter'||event.key===' ') { event.preventDefault(); Messliner.userBills.switchTab('history'); }");
        bannerEl.innerHTML = `
          <div class="user-bills-pending-left">
            <div class="user-bills-pending-icon-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 15 14"/>
              </svg>
            </div>
            <div class="user-bills-pending-info">
              <div class="user-bills-pending-title">
                <span>Pending Review</span>
                <span class="user-bills-pending-count-pill">${pendingRequests.length} request${pendingRequests.length > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div class="user-bills-pending-right">
            <span class="user-bills-pending-amount">
              <span class="tk-symbol"></span>${totalPendingReq.toLocaleString()}
            </span>
            <svg class="user-bills-pending-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        `;
      } else {
        bannerEl.classList.add('hidden');
        bannerEl.style.display = 'none';
        bannerEl.removeAttribute('onclick');
        bannerEl.removeAttribute('role');
        bannerEl.removeAttribute('tabindex');
        bannerEl.removeAttribute('title');
        bannerEl.removeAttribute('onkeydown');
        bannerEl.innerHTML = '';
      }
    }
  },

  /**
   * Render Bills Tab (All shared bills with cycle selector & cards)
   */
  renderBills() {
    const container = document.getElementById('userBillsListContainer');
    if (!container) return;

    const { minCycle, maxCycle } = this.getCycleBounds();
    const currentMonthStr = Utils.currentMonth();

    if (!this.currentCycle) {
      this.currentCycle = currentMonthStr;
    }
    if (this.currentCycle < minCycle) this.currentCycle = minCycle;
    if (this.currentCycle > maxCycle) this.currentCycle = maxCycle;

    const canPrev = this.currentCycle > minCycle;
    const canNext = this.currentCycle < maxCycle;
    const allowedCycles = this.getAllowedCycles();

    const userId = this.getUserId();
    const cycleDisplay = this.formatCycle(this.currentCycle);
    const [cYear, cMonth] = this.currentCycle.split('-');
    const cycleDate = new Date(parseInt(cYear, 10), parseInt(cMonth, 10) - 1, 1);
    const shortMonth = cycleDate.toLocaleDateString('en-US', { month: 'short' });

    // Filter bills for this cycle assigned to this user
    const myBills = [];
    Object.entries(this.bills || {}).forEach(([billId, bill]) => {
      if (!bill) return;
      const billMonth = bill.month || bill.cycle;
      if (billMonth && billMonth !== this.currentCycle) {
        return;
      }
      const userMember = bill.members?.[userId];
      if (userMember) {
        // Check if there is a pending payment request for this bill
        const hasPendingRequest = Object.values(this.paymentRequests || {}).some(
          r => r && r.userId === userId && r.billId === billId && r.status === 'pending'
        );

        myBills.push({
          id: billId,
          ...bill,
          myShare: userMember.amount,
          myStatus: userMember.status || 'pending',
          hasPendingRequest: hasPendingRequest,
          collectedAt: userMember.collectedAt || null
        });
      }
    });

    // Sort newest first
    myBills.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    let cardsHtml = '';
    if (myBills.length === 0) {
      cardsHtml = `
        <div class="user-bills-empty-state">
          <div class="user-bills-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h4 class="user-bills-empty-title">No bills this cycle</h4>
          <p class="user-bills-empty-sub">You have no shared expenses assigned for ${cycleDisplay}.</p>
        </div>
      `;
    } else {
      cardsHtml = myBills.map(b => {
        const isPaid = b.myStatus === 'collected';
        const isPending = !isPaid && b.hasPendingRequest;

        // Icon lookup
        const catKey = (b.category || b.title || '').toLowerCase().trim();
        let iconSvg = this.categoryIcons.default;
        if (catKey.includes('elect') || catKey.includes('current')) iconSvg = this.categoryIcons.electricity;
        else if (catKey.includes('wifi') || catKey.includes('net')) iconSvg = this.categoryIcons.wifi;
        else if (catKey.includes('cook') || catKey.includes('khala')) iconSvg = this.categoryIcons.cook;
        else if (catKey.includes('water')) iconSvg = this.categoryIcons.water;
        else if (catKey.includes('gas')) iconSvg = this.categoryIcons.gas;

        const dueFormatted = b.dueDate ? `Due ${this.formatDueDate(b.dueDate)}` : 'No due date';
        const totalFormatted = `<span class="tk-symbol"></span>${Utils.num(b.totalAmount)} total`;

        return `
          <div class="user-bill-clean-card fade-up">
            <div class="user-bill-clean-top">
              <div class="user-bill-clean-left">
                <div class="user-bill-clean-icon">
                  ${iconSvg}
                </div>
                <div class="user-bill-clean-info">
                  <h4 class="user-bill-clean-title">${b.title || 'Shared Bill'}</h4>
                  <div class="user-bill-clean-sub">
                    <span>${dueFormatted}</span>
                    <span class="user-bill-clean-dot">·</span>
                    <span>${totalFormatted}</span>
                  </div>
                </div>
              </div>
              <div class="user-bill-clean-right">
                <div class="user-bill-clean-amount"><span class="tk-symbol"></span>${Utils.num(b.myShare)}</div>
                <div class="user-bill-clean-share-label">your share</div>
              </div>
            </div>

            <div class="user-bill-clean-bottom">
              <div class="user-bill-clean-badge-wrap">
                ${isPaid ? `
                  <span class="user-bill-status-pill paid">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Paid</span>
                  </span>
                ` : isPending ? `
                  <span class="user-bill-status-pill pending">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 15 14"/>
                    </svg>
                    <span>Pending</span>
                  </span>
                ` : `
                  <span class="user-bill-status-pill unpaid">
                    <span>Unpaid</span>
                  </span>
                `}
              </div>

              <div class="user-bill-clean-action-wrap">
                ${isPaid ? `
                  <button type="button" class="btn user-bill-action-btn paid" disabled>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Paid</span>
                  </button>
                ` : isPending ? `
                  <button type="button" class="btn user-bill-action-btn pending"
                          onclick="Messliner.userBills.switchTab('history')"
                          title="Click to view payment request in history">
                    <span>In review</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ` : `
                  <button type="button" class="btn btn-primary user-bill-action-btn pay-now"
                          onclick="Messliner.userBills.openPayBillModal('${b.id}')">
                    Pay now
                  </button>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = `
      <!-- Shared bills section header -->
      <div class="user-bills-tab-header">
        <div class="user-bills-header-left-block">
          <h3 class="user-bills-sec-title">Shared bills</h3>
        </div>
      </div>

      <!-- Month Navigation Controller -->
      <div class="user-bills-cycle-nav">
        <button type="button" class="user-bills-cycle-btn ${canPrev ? '' : 'disabled'}" 
                onclick="Messliner.userBills.prevMonth()" 
                ${canPrev ? '' : 'disabled'}
                title="${canPrev ? 'Previous Month' : 'First month reached'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div class="user-bills-cycle-dropdown-container" id="userBillsCycleDropdownContainer">
          <button type="button" class="user-bills-cycle-display-btn" onclick="Messliner.userBills.toggleCycleDropdown(event)" title="Select month">
            <span>${cycleDisplay}</span>
            <svg class="user-bills-cycle-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          
          <div class="user-bills-cycle-menu" id="userBillsCycleMenu">
            ${allowedCycles.map(c => {
      const isSelected = c === this.currentCycle;
      const isCurrent = c === currentMonthStr;
      const label = this.formatCycle(c) + (isCurrent ? ' (Current)' : '');
      return `
                <div class="user-bills-cycle-item ${isSelected ? 'active' : ''}" 
                     onclick="Messliner.userBills.selectCycle('${c}')">
                  <span>${label}</span>
                  ${isSelected ? '<span class="cycle-check">✓</span>' : ''}
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <button type="button" class="user-bills-cycle-btn ${canNext ? '' : 'disabled'}" 
                onclick="Messliner.userBills.nextMonth()" 
                ${canNext ? '' : 'disabled'}
                title="${canNext ? 'Next Month' : 'Latest month reached'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <!-- List of bills -->
      <div class="user-bills-list-items">
        ${cardsHtml}
      </div>
    `;
  },

  /**
   * Render History Tab (Payment Requests + Bill Deductions with Month Navigation and Compact Single-Line Cards)
   */
  renderHistory() {
    const container = document.getElementById('userBillsHistoryListContainer');
    if (!container) return;

    const { minCycle, maxCycle } = this.getCycleBounds();
    const currentMonthStr = Utils.currentMonth();

    if (!this.currentHistoryCycle) {
      this.currentHistoryCycle = currentMonthStr;
    }
    if (this.currentHistoryCycle < minCycle) this.currentHistoryCycle = minCycle;
    if (this.currentHistoryCycle > maxCycle) this.currentHistoryCycle = maxCycle;

    const canPrev = this.currentHistoryCycle > minCycle;
    const canNext = this.currentHistoryCycle < maxCycle;
    const allowedCycles = this.getAllowedCycles();
    const cycleDisplay = this.formatCycle(this.currentHistoryCycle);

    const userId = this.getUserId();
    const currentUid = String(userId || '').trim();
    const targetMonth = this.currentHistoryCycle;

    // Helper to check if an item/timestamp matches targetMonth
    const isMatchTargetMonth = (item) => {
      if (!item) return false;
      if (item.month && item.month === targetMonth) return true;
      if (Utils.isItemInMonth(item, targetMonth)) return true;
      const ts = item.createdAt || item.timestamp || item.collectedAt;
      if (ts) {
        const d = new Date(typeof ts === 'number' ? ts : (ts.seconds ? ts.seconds * 1000 : ts));
        if (!isNaN(d.getTime())) {
          const [ty, tm] = targetMonth.split('-').map(Number);
          if (d.getFullYear() === ty && (d.getMonth() + 1) === tm) return true;
        }
      }
      return false;
    };

    // 1. Filter payment requests for this user in selected month
    const myRequests = Object.entries(this.paymentRequests || {})
      .filter(([_, r]) => {
        if (!r || String(r.userId || '').trim() !== currentUid) return false;
        return isMatchTargetMonth(r);
      })
      .map(([id, r]) => {
        // If it's a bill payment and the bill member status is already collected, mark as approved
        let status = r.status || 'pending';
        if (r.type === 'bill_payment' && r.billId && this.bills?.[r.billId]) {
          const mStatus = this.bills[r.billId]?.members?.[userId]?.status;
          if (mStatus === 'collected' || mStatus === 'paid') {
            status = 'approved';
          }
        }
        return {
          id,
          ...r,
          status,
          itemType: 'paymentRequest',
          sortTime: r.createdAt || (r.timestamp ? new Date(r.timestamp).getTime() : 0)
        };
      });

    // 2. Also check if user paid any bill via Pay Request that has paymentRequestId in this.bills but missing from paymentRequests
    const coveredReqBillIds = new Set(
      myRequests
        .filter(r => r.type === 'bill_payment' && r.billId)
        .map(r => r.billId)
    );

    const paidByRequestBills = [];
    Object.entries(this.bills || {}).forEach(([bId, b]) => {
      if (!b || !b.members) return;
      const m = b.members[userId];
      // STRICT FILTER: Only bills that were paid via payment request (has paymentRequestId and NOT a balance deduction)
      if (!m || !m.paymentRequestId || m.depositKey) return;
      if (m.status !== 'collected' && m.status !== 'paid') return;

      const isInMonth = isMatchTargetMonth(b) || (m.collectedAt && isMatchTargetMonth({ timestamp: m.collectedAt }));
      if (!isInMonth) return;

      if (coveredReqBillIds.has(bId)) return;
      coveredReqBillIds.add(bId);

      const billAmt = Utils.num(m.amount || b.totalAmount);
      paidByRequestBills.push({
        id: `bill_req_${bId}`,
        billId: bId,
        billTitle: b.title || 'Shared Bill',
        itemType: 'paymentRequest',
        type: 'bill_payment',
        amount: billAmt,
        method: m.paymentMethod || 'cash',
        status: 'approved',
        note: m.note || `Paid via Ledger (${b.title || 'Shared Bill'})`,
        createdAt: m.collectedAt || b.createdAt || Date.now(),
        sortTime: m.collectedAt || b.createdAt || (b.date ? new Date(b.date).getTime() : Date.now()),
        month: b.month || targetMonth
      });
    });

    // 3. User's deposit/deduction records in selected month (Admin deductions, account balance deductions)
    // Deduplicate Add Money records that are already shown as approved paymentRequests
    const approvedAddMoneyKeys = new Set(
      myRequests
        .filter(r => r.type !== 'bill_payment' && (r.status === 'approved' || r.status === 'collected'))
        .map(r => `${Math.round(Utils.num(r.amount))}_${String(r.method || 'cash').toLowerCase()}`)
    );

    const myDeposits = Object.entries(this.userDeposits || {})
      .filter(([_, d]) => {
        if (!d || String(d.userId || '').trim() !== currentUid) return false;

        // If this is an Add Money deposit record created when admin approved an Add Money request, skip duplicate
        if (d.type === 'deposit' && d.note && d.note.toLowerCase().includes('add money')) {
          const mMatch = (d.note.match(/\((.*?)\)/) || [])[1]?.toLowerCase() || '';
          const key = `${Math.round(Math.abs(Utils.num(d.amount)))}_${mMatch}`;
          if (approvedAddMoneyKeys.has(key)) {
            return false;
          }
        }

        return isMatchTargetMonth(d);
      })
      .map(([id, d]) => ({
        id,
        ...d,
        itemType: 'depositRecord',
        sortTime: d.timestamp || (d.date ? new Date(d.date).getTime() : 0)
      }));

    // Combine all and sort newest first:
    // - Payment Requests (including Pay Bill via Pay Now button) -> Render as special [BILL] card
    // - Deposits / Balance Deductions (including Admin bill deductions) -> Render as standard deposit / deduction card
    const allHistory = [...myRequests, ...paidByRequestBills, ...myDeposits].sort((a, b) => b.sortTime - a.sortTime);

    // Cache items for modal detail lookup
    this.historyItemsMap = {};
    allHistory.forEach(item => {
      this.historyItemsMap[item.id] = item;
    });

    // Month Navigation Controller HTML
    const navHtml = `
      <div class="user-bills-cycle-nav">
        <button type="button" class="user-bills-cycle-btn ${canPrev ? '' : 'disabled'}" 
                onclick="Messliner.userBills.prevHistoryMonth()" 
                ${canPrev ? '' : 'disabled'}
                title="${canPrev ? 'Previous Month' : 'First month reached'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div class="user-bills-cycle-dropdown-container" id="userBillsHistoryCycleDropdownContainer">
          <button type="button" class="user-bills-cycle-display-btn" onclick="Messliner.userBills.toggleHistoryCycleDropdown(event)" title="Select month">
            <span>${cycleDisplay}</span>
            <svg class="user-bills-cycle-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          
          <div class="user-bills-cycle-menu" id="userBillsHistoryCycleMenu">
            ${allowedCycles.map(c => {
      const isSelected = c === this.currentHistoryCycle;
      const isCurrent = c === currentMonthStr;
      const label = this.formatCycle(c) + (isCurrent ? ' (Current)' : '');
      return `
                <div class="user-bills-cycle-item ${isSelected ? 'active' : ''}" 
                     onclick="Messliner.userBills.selectHistoryCycle('${c}')">
                   <span>${label}</span>
                   ${isSelected ? '<span class="cycle-check">✓</span>' : ''}
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <button type="button" class="user-bills-cycle-btn ${canNext ? '' : 'disabled'}" 
                onclick="Messliner.userBills.nextHistoryMonth()" 
                ${canNext ? '' : 'disabled'}
                title="${canNext ? 'Next Month' : 'Latest month reached'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    `;

    if (allHistory.length === 0) {
      container.innerHTML = `
        ${navHtml}
        <div class="user-bills-empty-state" style="padding: 34px 16px;">
          <div class="user-bills-empty-icon">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h4 class="user-bills-empty-title">No transactions in ${cycleDisplay}</h4>
          <p class="user-bills-empty-sub">No deposits, deductions, or payment records found for this month.</p>
        </div>
      `;
      return;
    }

    const cardsHtml = allHistory.map(item => {
      if (item.itemType === 'paymentRequest') {
        const isApproved = item.status === 'approved';
        const isRejected = item.status === 'rejected';
        const isBillPay = item.type === 'bill_payment';

        if (isBillPay) {
          // Distinct Ledger Bill Payment Card
          const billTitle = item.billTitle || 'Shared Bill';
          const methodLabel = item.method
            ? (item.method.charAt(0).toUpperCase() + item.method.slice(1))
            : 'Cash';

          const dateStr = item.createdAt
            ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : (item.date || 'Recently');

          const statusLabel = isApproved ? 'Ledger Cleared ✓' : (isRejected ? 'Rejected ✕' : 'Pending ⏳');
          const statusClass = isApproved ? 'ledger-cleared' : (isRejected ? 'rejected' : 'pending');

          return `
            <div class="user-history-card single-line ledger-bill-payment ${statusClass}"
                 onclick="Messliner.userBills.openHistoryDetailModal('${item.id}')"
                 title="Click to view ledger payment details">
              <div class="user-history-left">
                <div class="user-history-icon-badge ledger-bill" title="Paid from Ledger">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <path d="M9 15l2 2 4-4"></path>
                  </svg>
                  <span class="user-history-badge-subtext">Bill</span>
                </div>
                <div class="user-history-info">
                  <div class="user-history-title" title="${billTitle}">
                    ${billTitle}
                  </div>
                  <div class="user-history-time">
                    ${dateStr}
                  </div>
                </div>
              </div>
              <div class="user-history-right">
                <div class="user-history-amount negative">
                  -<span class="tk-symbol"></span>${Utils.num(item.amount)}
                </div>
                ${this.getStatusPillHtml(isApproved ? 'approved' : (isRejected ? 'rejected' : 'pending'), 'bill_payment', false)}
              </div>
            </div>
          `;
        }

        // Add Money / Other Payment Request
        const titleText = 'Add Money';
        const dateStr = item.createdAt
          ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : (item.date || 'Recently');

        return `
          <div class="user-history-card single-line paymentRequest ${item.status}"
               onclick="Messliner.userBills.openHistoryDetailModal('${item.id}')"
               title="Click to view details">
            <div class="user-history-left">
              <div class="user-history-icon-badge deposit">
                +
              </div>
              <div class="user-history-info">
                <div class="user-history-title" title="${titleText}">${titleText}</div>
                <div class="user-history-time">${dateStr}</div>
              </div>
            </div>
            <div class="user-history-right">
              <div class="user-history-amount positive">
                +${Utils.tk(item.amount)}
              </div>
              ${this.getStatusPillHtml(isApproved ? 'approved' : (isRejected ? 'rejected' : 'pending'), 'add_money', false)}
            </div>
          </div>
        `;
      } else {
        // Deposit Record
        const isDeduction = item.amount < 0 || item.type === 'deduction' || item.type === 'other_costing';
        const amtVal = Math.abs(item.amount);
        const dateStr = item.date ? Utils.formatDate(item.date) : (item.timestamp ? new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently');
        const titleText = item.note || (isDeduction ? 'Bill Deduction' : 'Deposit Added');

        return `
          <div class="user-history-card single-line deposit ${isDeduction ? 'deduction' : 'deposit'}"
               onclick="Messliner.userBills.openHistoryDetailModal('${item.id}')"
               title="Click to view details">
            <div class="user-history-left">
              <div class="user-history-icon-badge ${isDeduction ? 'deduction' : 'deposit'}">
                ${isDeduction ? '−' : '+'}
              </div>
              <div class="user-history-info">
                <div class="user-history-title" title="${titleText}">${titleText}</div>
                <div class="user-history-time">${dateStr}</div>
              </div>
            </div>
            <div class="user-history-right">
              <div class="user-history-amount ${isDeduction ? 'negative' : 'positive'}">
                ${isDeduction ? '-' : '+'}${Utils.tk(amtVal)}
              </div>
              ${this.getStatusPillHtml(isDeduction ? 'deducted' : 'deposit', isDeduction ? 'deduction' : 'deposit_record', false)}
            </div>
          </div>
        `;
      }
    }).join('');

    container.innerHTML = `
      ${navHtml}
      <div class="user-history-items-list" style="display: flex; flex-direction: column; gap: 8px;">
        ${cardsHtml}
      </div>
    `;
  },

  /**
   * Open Transaction Detail Modal when clicking on any history card
   */
  async openHistoryDetailModal(id) {
    const item = this.historyItemsMap?.[id];
    if (!item) return;

    const modal = document.getElementById('userHistoryDetailModal');
    const modalBody = document.getElementById('userHistoryDetailModalBody');
    if (!modal || !modalBody) return;

    const diningId = this.getDiningId();
    if (diningId && (!this.paymentMethods || Object.keys(this.paymentMethods).length === 0)) {
      try {
        const snap = await db.ref(`dinings/${diningId}/settings/paymentMethods`).once('value');
        if (snap.exists()) {
          this.paymentMethods = snap.val() || {};
        }
      } catch (err) {
        console.warn('Error fetching paymentMethods in modal:', err);
      }
    }

    const isReq = item.itemType === 'paymentRequest';
    const isBillPay = isReq && item.type === 'bill_payment';
    const isDeduction = !isReq && (item.amount < 0 || item.type === 'deduction' || item.type === 'other_costing');

    const rawAmt = Math.abs(Utils.num(item.amount));
    const isPositive = !isBillPay && !isDeduction;
    const sign = isPositive ? '+' : '-';
    const amountFormatted = `${sign}${Utils.tk(rawAmt)}`;

    const statusPillHtml = this.getStatusPillHtml(
      !isReq ? (isDeduction ? 'deducted' : 'deposit') : (item.status || 'pending'),
      isBillPay ? 'bill_payment' : (isReq ? 'add_money' : (isDeduction ? 'deduction' : 'deposit_record')),
      true
    );

    const titleText = isReq
      ? (isBillPay ? `Bill: ${item.billTitle || 'Shared Bill'}` : 'Add Money')
      : (item.note || (isDeduction ? 'Expense Deduction' : 'Deposit Added'));

    let fullDateStr = 'Recently';
    if (item.createdAt) {
      fullDateStr = new Date(item.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } else if (item.timestamp) {
      fullDateStr = new Date(item.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } else if (item.date) {
      fullDateStr = Utils.formatDate(item.date);
    }

    const monthStr = this.formatCycle(item.month || this.currentHistoryCycle || Utils.currentMonth());

    let typeText = 'Deposit';
    if (isBillPay) typeText = 'Ledger Bill Payment';
    else if (isReq) typeText = 'Balance Top-up Request';
    else if (item.type === 'friday_meal') typeText = 'Friday Meal Deduction';
    else if (isDeduction) typeText = 'Account Deduction';

    // Resolve human-friendly Payment Method name (e.g. Cash, bKash, Nagad, Rocket)
    let methodText = item.methodName || '';
    if (!methodText) {
      const raw = String(item.method || item.paymentMethod || '').toLowerCase();
      if (raw.includes('bkash')) {
        methodText = 'bKash';
      } else if (raw.includes('nagad')) {
        methodText = 'Nagad';
      } else if (raw.includes('rocket')) {
        methodText = 'Rocket';
      } else if (raw.includes('cash')) {
        methodText = 'Cash';
      } else {
        const allMethodsObj = this.paymentMethods?.methods || this.paymentMethods || {};
        const methodId = String(item.method || item.paymentMethod || '');
        let found = allMethodsObj[methodId] || (this.availableMethodsList || []).find(m => m.id === methodId);
        if (!found) {
          found = Object.values(allMethodsObj).find(m => m && (m.id === methodId || m.platform === methodId));
        }
        if (!found && Messliner.state?.paymentMethods) {
          const stateMethods = Messliner.state.paymentMethods.methods || Messliner.state.paymentMethods;
          found = stateMethods[methodId] || Object.values(stateMethods).find(m => m && (m.id === methodId || m.platform === methodId));
        }
        if (found) {
          methodText = found.name || (found.platform ? found.platform.charAt(0).toUpperCase() + found.platform.slice(1) : '');
        }
      }

      if (!methodText && item.note) {
        const noteLower = item.note.toLowerCase();
        if (noteLower.includes('bkash')) methodText = 'bKash';
        else if (noteLower.includes('nagad')) methodText = 'Nagad';
        else if (noteLower.includes('rocket')) methodText = 'Rocket';
        else if (noteLower.includes('cash')) methodText = 'Cash';
      }

      // If still not resolved or if it's an internal ID like method_..., display friendly configured method name or bKash
      if (!methodText || methodText.toLowerCase().startsWith('method_')) {
        const configured = Object.values(this.paymentMethods?.methods || this.paymentMethods || {}).find(m => m && m.name);
        if (configured && configured.name) {
          methodText = configured.name;
        } else {
          methodText = 'bKash';
        }
      }
    }

    modalBody.innerHTML = `
      <!-- Hero Amount & Status Card -->
      <div class="uhd-hero-card">
        <div class="uhd-hero-amount ${isPositive ? 'positive' : 'negative'}">
          ${amountFormatted}
        </div>
        ${statusPillHtml}
      </div>

      <!-- Details List -->
      <div class="uhd-details-list">
        <div class="uhd-detail-row">
          <span class="uhd-label">Category / Type</span>
          <span class="uhd-val">${typeText}</span>
        </div>

        ${isBillPay && item.billTitle ? `
          <div class="uhd-detail-row">
            <span class="uhd-label">Shared Bill</span>
            <span class="uhd-val font-semibold">${item.billTitle}</span>
          </div>
          <div class="uhd-detail-row">
            <span class="uhd-label">Bill Status</span>
            <span class="uhd-val font-semibold" style="color: ${item.status === 'approved' ? '#059669' : '#64748B'};">
              ${item.status === 'approved' ? 'Cleared ✓' : 'Pending Review'}
            </span>
          </div>
        ` : ''}

        <div class="uhd-detail-row">
          <span class="uhd-label">Date & Time</span>
          <span class="uhd-val">${fullDateStr}</span>
        </div>

        <div class="uhd-detail-row">
          <span class="uhd-label">Month Cycle</span>
          <span class="uhd-val">${monthStr}</span>
        </div>

        <div class="uhd-detail-row">
          <span class="uhd-label">Payment Method</span>
          <span class="uhd-val">${methodText}</span>
        </div>

        ${item.fee ? `
          <div class="uhd-detail-row">
            <span class="uhd-label">Processing Fee</span>
            <span class="uhd-val">${Utils.tk(item.fee)}</span>
          </div>
          <div class="uhd-detail-row">
            <span class="uhd-label">Total Payable</span>
            <span class="uhd-val font-semibold">${Utils.tk(item.totalPayable || (rawAmt + item.fee))}</span>
          </div>
        ` : ''}

        ${item.trxId ? `
          <div class="uhd-detail-row">
            <span class="uhd-label">Transaction ID</span>
            <span class="uhd-val">
              <span class="uhd-trx-box">
                <code>${item.trxId}</code>
                <button type="button" class="uhd-copy-btn" onclick="Messliner.userBills.copyNumber('${item.trxId}', this)" title="Copy TrxID">
                  Copy
                </button>
              </span>
            </span>
          </div>
        ` : ''}

        ${item.note ? `
          <div class="uhd-detail-row note-row">
            <span class="uhd-label">Note / Remarks</span>
            <div class="uhd-val note-val">${item.note}</div>
          </div>
        ` : ''}
      </div>
    `;

    openModal('userHistoryDetailModal');
  },

  /**
   * Open "Pay Bill" Modal (Two-Step Flow matching Add Money, with fixed amount)
   */
  async openPayBillModal(billId) {
    const bill = this.bills[billId];
    if (!bill) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('error', 'Error', 'Bill details not found.');
      }
      return;
    }

    this.selectedBillId = billId;
    const userId = this.getUserId();
    const userMember = bill.members?.[userId];
    const amount = userMember ? Utils.num(userMember.amount) : Utils.num(bill.totalAmount);
    this.currentPayBillFixedAmount = amount;

    // Reset form fields
    const trxInput = document.getElementById('payBillTrxIdInput');
    const noteInput = document.getElementById('payBillNoteInput');
    if (trxInput) trxInput.value = '';
    if (noteInput) noteInput.value = '';

    const billTitle = bill.title || 'Shared Bill';
    const titleEl = document.getElementById('payBillModalTitle');
    const targetNameEl = document.getElementById('payBillTargetName');
    const fixedAmtInput = document.getElementById('payBillFixedAmountInput');

    if (titleEl) titleEl.textContent = 'Pay bill';
    if (targetNameEl) targetNameEl.textContent = billTitle;
    if (fixedAmtInput) {
      fixedAmtInput.value = Number(amount).toLocaleString('en-US');
    }

    const diningId = this.getDiningId();
    if (diningId && (!this.paymentMethods || Object.keys(this.paymentMethods).length === 0)) {
      try {
        const snap = await db.ref(`dinings/${diningId}/settings/paymentMethods`).once('value');
        if (snap.exists()) {
          this.paymentMethods = snap.val() || {};
        }
      } catch (err) {
        console.warn('Failed to pre-fetch payment methods:', err);
      }
    }

    this.selectedPayBillMethod = this.selectedPayBillMethod || 'bkash';
    this.renderPayBillMethodPills();
    this.goToPayBillStep(1);

    openModal('payBillModal');
  },

  /**
   * Transition between Step 1 (Fixed Amount & Method) and Step 2 (Instructions & TrxID) for Pay Bill
   */
  goToPayBillStep(step) {
    this.currentPayBillStep = step;
    const modal = document.getElementById('payBillModal');
    const step1 = document.getElementById('payBillStep1');
    const step2 = document.getElementById('payBillStep2');
    const backBtn = document.getElementById('payBillBackBtn');
    const closeBtn = document.getElementById('payBillCloseBtn');
    const titleEl = document.getElementById('payBillModalTitle');
    const badgeStep1 = document.getElementById('payBillStepBadgeStep1');
    const badgeStep2 = document.getElementById('payBillStepBadgeStep2');

    if (modal) {
      modal.classList.toggle('step-1-active', step === 1);
      modal.classList.toggle('step-2-active', step === 2);
    }

    if (step === 1) {
      if (step1) {
        step1.style.display = 'block';
        step1.classList.add('active');
      }
      if (step2) {
        step2.style.display = 'none';
        step2.classList.remove('active');
      }
      if (backBtn) backBtn.style.setProperty('display', 'none', 'important');
      if (closeBtn) closeBtn.style.setProperty('display', 'flex', 'important');
      if (badgeStep1) badgeStep1.style.setProperty('display', 'inline-flex', 'important');
      if (badgeStep2) badgeStep2.style.setProperty('display', 'none', 'important');
      if (titleEl) titleEl.textContent = 'Pay bill';
    } else if (step === 2) {
      if (step1) {
        step1.style.display = 'none';
        step1.classList.remove('active');
      }
      if (step2) {
        step2.style.display = 'block';
        step2.classList.add('active');
      }
      if (backBtn) backBtn.style.setProperty('display', 'inline-flex', 'important');
      if (closeBtn) closeBtn.style.setProperty('display', 'none', 'important');
      if (badgeStep1) badgeStep1.style.setProperty('display', 'none', 'important');
      if (badgeStep2) badgeStep2.style.setProperty('display', 'inline-flex', 'important');
      if (titleEl) titleEl.textContent = 'Payment Details';

      this.renderPayBillStep2Details();
      setTimeout(() => {
        if (this.selectedPayBillMethod !== 'cash') {
          document.getElementById('payBillTrxIdInput')?.focus();
        }
      }, 50);
    }
  },

  /**
   * Continue from Step 1 to Step 2 in Pay Bill Modal
   */
  continueToPayBillStep2() {
    this.goToPayBillStep(2);
  },

  /**
   * Render payment method pills in Pay Bill Modal (Matching Add Money pills style)
   */
  renderPayBillMethodPills() {
    const container = document.getElementById('payBillMethodPills');
    if (!container) return;

    const methods = [];
    const raw = this.paymentMethods || {};
    const seenIds = new Set();

    if (raw.methods && typeof raw.methods === 'object') {
      Object.entries(raw.methods).forEach(([id, m]) => {
        if (m && m.active !== false && m.number) {
          methods.push({ id, ...m });
          seenIds.add(id);
          if (m.platform) seenIds.add(m.platform.toLowerCase());
        }
      });
    }

    Object.entries(raw).forEach(([key, val]) => {
      if (key === 'methods') return;
      if (val && typeof val === 'object' && val.number && (val.active !== false && val.enabled !== false)) {
        const platform = (val.platform || key).toLowerCase();
        const id = val.id || key;
        if (!seenIds.has(key) && !seenIds.has(id) && !seenIds.has(platform)) {
          methods.push({
            id: id,
            platform: platform,
            name: val.name || (key.charAt(0).toUpperCase() + key.slice(1)),
            number: val.number,
            charge: parseFloat(val.charge) || 0,
            description: val.description || (val.type ? `${val.type} account` : ''),
            available: true
          });
          seenIds.add(key);
          seenIds.add(id);
          seenIds.add(platform);
        }
      }
    });

    // Always include Cash
    methods.push({ id: 'cash', name: 'Cash', available: true });
    this.payBillMethodsList = methods;

    if (!methods.some(m => m.id === this.selectedPayBillMethod)) {
      this.selectedPayBillMethod = methods[0]?.id || 'cash';
    }

    container.innerHTML = methods.map(m => {
      const methodKey = `${m.platform || ''} ${m.id || ''} ${m.name || ''}`.toLowerCase();
      const brandClass = methodKey.includes('bkash') ? 'bkash' : (methodKey.includes('nagad') ? 'nagad' : (methodKey.includes('rocket') ? 'rocket' : ''));
      return `
        <button type="button" class="add-money-method-pill ${brandClass} ${this.selectedPayBillMethod === m.id ? 'active' : ''}"
                onclick="Messliner.userBills.selectPayBillMethod('${m.id}')">
          <span>${m.name || m.platform || 'Method'}</span>
        </button>
      `;
    }).join('');
  },

  /**
   * Select payment method in Pay Bill modal
   */
  selectPayBillMethod(methodId) {
    this.selectedPayBillMethod = methodId;
    this.renderPayBillMethodPills();
    if (this.currentPayBillStep === 2) {
      this.renderPayBillStep2Details();
    }
  },

  /**
   * Render Section 2 Details for Pay Bill (Unified compact card matching Add Money)
   */
  renderPayBillStep2Details() {
    const container = document.getElementById('payBillStep2Details');
    const trxGroup = document.getElementById('payBillTrxIdGroup');
    const trxInput = document.getElementById('payBillTrxIdInput');
    const submitBtn = document.getElementById('btnSubmitPayBill');
    const submitText = document.getElementById('btnSubmitPayBillText');

    const bill = this.bills[this.selectedBillId];
    const billTitle = bill?.title || 'Shared Bill';
    const amount = this.currentPayBillFixedAmount || 0;

    const method = (this.payBillMethodsList || []).find(m => m.id === this.selectedPayBillMethod) || this.paymentMethods[this.selectedPayBillMethod] || {};
    const name = method.name || method.platform || (this.selectedPayBillMethod === 'cash' ? 'Cash' : 'Digital');
    const num = method.number || '';
    const charge = parseFloat(method.charge) || 0;
    const desc = method.description || (method.type ? `${method.type} account` : '');

    let fee = 0;
    if (charge > 0 && this.selectedPayBillMethod !== 'cash') {
      fee = (amount * charge) / 100;
    }
    const totalPayable = amount + fee;

    const formattedAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formattedFee = Number(fee).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formattedTotal = Number(totalPayable).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    this.payBillCalculatedFee = fee;
    this.payBillCalculatedTotal = totalPayable;

    // Set submit button HTML with custom Taka symbol
    const payBtnHtml = `Pay <span class="tk-symbol"></span>${formattedTotal}`;
    if (submitText) {
      submitText.innerHTML = payBtnHtml;
    } else if (submitBtn) {
      submitBtn.innerHTML = payBtnHtml;
    }

    if (this.selectedPayBillMethod === 'cash') {
      if (trxGroup) trxGroup.style.display = 'none';
      if (trxInput) trxInput.required = false;

      if (container) {
        container.innerHTML = `
          <!-- Single Unified Cash Card -->
          <div class="add-money-unified-card cash">
            <div class="amu-account-header">
              <div class="amu-account-left">
                <span class="amu-account-provider cash">Cash Payment</span>
                <span class="amu-account-type cash">In Hand</span>
              </div>
            </div>

            <div class="amu-breakdown-wrap" style="margin-top: 4px;">
              <div class="amu-row">
                <span class="amu-row-label">Bill (${billTitle})</span>
                <span class="amu-row-val font-semibold"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
              <div class="amu-subdivider"></div>
              <div class="amu-row total-row">
                <span class="amu-total-label">Total Amount</span>
                <span class="amu-total-val"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
            </div>

            <div class="amu-divider"></div>

            <div class="amu-cash-note">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <circle cx="12" cy="12" r="2"></circle>
                <path d="M6 12h.01M18 12h.01"></path>
              </svg>
              <span>Hand over <strong><span class="tk-symbol"></span>${formattedAmount}</strong> cash to dining manager.</span>
            </div>
          </div>
        `;
      }
    } else {
      if (trxGroup) trxGroup.style.display = 'block';
      if (trxInput) trxInput.required = true;

      const methodKey = String(this.selectedPayBillMethod).toLowerCase();
      const brandClass = methodKey.includes('bkash') ? 'bkash' : (methodKey.includes('nagad') ? 'nagad' : (methodKey.includes('rocket') ? 'rocket' : 'generic'));

      if (container) {
        container.innerHTML = `
          <!-- Single Unified Minimal Payment & Amount Card -->
          <div class="add-money-unified-card ${brandClass}">
            <!-- 1. Top Section: Account Number & Copy Button -->
            <div class="amu-account-header">
              <div class="amu-account-left">
                <span class="amu-account-provider ${brandClass}">${name} Number</span>
                ${desc ? `<span class="amu-account-type ${brandClass}">${desc}</span>` : `<span class="amu-account-type ${brandClass}">Payment Only</span>`}
              </div>
            </div>

            <div class="amu-number-bar">
              <div class="amu-number-text-wrap">
                <svg class="amu-phone-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                <span class="amu-number-val">${num || 'Not configured'}</span>
              </div>
              ${num ? `
                <button type="button" class="amu-copy-btn ${brandClass}" onclick="Messliner.userBills.copyNumber('${num}', this)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span class="ami-copy-text">Copy</span>
                </button>
              ` : ''}
            </div>

            <!-- Divider -->
            <div class="amu-divider"></div>

            <!-- 2. Bottom Section: Breakdown (Bill Share, Charge, Total Payable) -->
            <div class="amu-breakdown-wrap">
              <div class="amu-row">
                <span class="amu-row-label">Bill Share (${billTitle})</span>
                <span class="amu-row-val font-semibold"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
              ${charge > 0 ? `
                <div class="amu-row fee-row">
                  <span class="amu-row-label">${name} Charge (${charge}%)</span>
                  <span class="amu-row-val fee">+<span class="tk-symbol"></span>${formattedFee}</span>
                </div>
              ` : ''}
              <div class="amu-subdivider"></div>
              <div class="amu-row total-row">
                <span class="amu-total-label">Total Payable</span>
                <span class="amu-total-val"><span class="tk-symbol"></span>${formattedTotal}</span>
              </div>
            </div>
          </div>

          <div class="amu-tip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Send <strong><span class="tk-symbol"></span>${formattedTotal}</strong> to above number & enter TrxID below</span>
          </div>
        `;
      }
    }

    this.handlePayBillTrxIdInput();
  },

  /**
   * Validate TrxID input for Pay Bill modal
   */
  handlePayBillTrxIdInput() {
    const input = document.getElementById('payBillTrxIdInput');
    const submitBtn = document.getElementById('btnSubmitPayBill');
    if (!submitBtn) return;
    if (this.selectedPayBillMethod === 'cash') {
      submitBtn.disabled = false;
      return;
    }
    const val = (input?.value || '').trim();
    submitBtn.disabled = val.length === 0;
  },

  /**
   * Submit Bill Payment Request
   */
  async submitBillPayment() {
    const diningId = this.getDiningId();
    if (!diningId) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      }
      return;
    }
    const userId = this.getUserId();
    if (!userId) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('error', 'Error', 'User ID not found.');
      }
      return;
    }

    const bill = this.bills[this.selectedBillId];
    if (!bill) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('error', 'Error', 'Bill not found.');
      }
      return;
    }

    const userMember = bill.members?.[userId];
    const amount = userMember ? Utils.num(userMember.amount) : Utils.num(bill.totalAmount);
    const method = this.selectedPayBillMethod || 'cash';

    const trxId = document.getElementById('payBillTrxIdInput')?.value.trim();
    const note = document.getElementById('payBillNoteInput')?.value.trim();

    if (method !== 'cash' && !trxId) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('warning', 'Missing TrxID', 'Please enter the Transaction ID.');
      }
      return;
    }

    const user = Messliner.users?.users?.[userId] || Messliner.state?.user || {};
    const userName = user.name || 'Member';

    const submitBtn = document.getElementById('btnSubmitPayBill');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Submitting...';
    }

    const methodObj = (this.availablePayBillMethods || []).find(m => m.id === this.selectedPayBillMethod) || this.paymentMethods?.[this.selectedPayBillMethod] || {};
    const methodBrand = (methodObj.platform || methodObj.name || (this.selectedPayBillMethod === 'cash' ? 'cash' : this.selectedPayBillMethod)).toLowerCase();
    let resolvedMethodName = methodObj.name || (methodBrand.charAt(0).toUpperCase() + methodBrand.slice(1));
    if (methodBrand.includes('bkash')) resolvedMethodName = 'bKash';
    else if (methodBrand.includes('nagad')) resolvedMethodName = 'Nagad';
    else if (methodBrand.includes('rocket')) resolvedMethodName = 'Rocket';
    else if (methodBrand.includes('cash')) resolvedMethodName = 'Cash';

    try {
      const reqRef = db.ref(`dinings/${diningId}/paymentRequests`).push();
      const reqPayload = {
        type: 'bill_payment',
        billId: this.selectedBillId,
        billTitle: bill.title || 'Shared Bill',
        userId: userId,
        userName: userName,
        amount: amount,
        fee: this.payBillCalculatedFee || 0,
        totalPayable: this.payBillCalculatedTotal || amount,
        method: methodBrand,
        methodName: resolvedMethodName,
        trxId: trxId || null,
        note: note || `Payment for ${bill.title || 'bill'}`,
        status: 'pending',
        month: bill.month || this.currentCycle || Utils.currentMonth(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await reqRef.set(reqPayload);

      // Optimistically record into local this.paymentRequests so it is immediately reflected
      this.paymentRequests = this.paymentRequests || {};
      this.paymentRequests[reqRef.key] = {
        id: reqRef.key,
        ...reqPayload,
        createdAt: Date.now()
      };

      // Notify Dining Admins
      const admins = Object.entries(Messliner.users?.users || {}).filter(([_, u]) => u.role === 'admin');
      for (const [adminId, _] of admins) {
        await Notifications.create(
          diningId,
          'Bill Payment Request',
          `${userName} submitted ৳${amount} for "${bill.title}" via ${resolvedMethodName}`,
          adminId,
          'deposit'
        );
      }

      Notifications.toast('success', 'Payment Submitted', 'Your payment request was sent to the admin for approval.');
      closeModal('payBillModal');
      this.renderOverview();
      this.renderBills();
      this.renderHistory();

    } catch (err) {
      console.error('Submit bill payment error:', err);
      Notifications.toast('error', 'Error', 'Failed to submit payment request.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Pay <span class="tk-symbol"></span>${this.payBillCalculatedTotal || amount}`;
      }
    }
  },

  /**
   * Open Add Money to Balance Modal (Two-Step Flow)
   */
  async openAddMoneyModal() {
    this.selectedMethod = 'bkash';
    const form = document.getElementById('addMoneyForm');
    if (form) form.reset();

    const diningId = this.getDiningId();
    if (diningId && (!this.paymentMethods || Object.keys(this.paymentMethods).length === 0)) {
      try {
        const snap = await db.ref(`dinings/${diningId}/settings/paymentMethods`).once('value');
        if (snap.exists()) {
          this.paymentMethods = snap.val() || {};
        }
      } catch (err) {
        console.warn('Failed to pre-fetch payment methods for user bills:', err);
      }
    }

    this.renderPaymentMethodPills();
    this.goToAddMoneyStep(1);
    openModal('addMoneyModal');
  },

  /**
   * Navigate between Section 1 (Amount & Method) and Section 2 (Details & Pay)
   */
  goToAddMoneyStep(step) {
    this.currentAddMoneyStep = step;
    const modal = document.getElementById('addMoneyModal');
    const step1 = document.getElementById('addMoneyStep1');
    const step2 = document.getElementById('addMoneyStep2');
    const backBtn = document.getElementById('addMoneyBackBtn');
    const closeBtn = document.getElementById('addMoneyCloseBtn');
    const titleEl = document.getElementById('addMoneyModalTitle');
    const badgeStep1 = document.getElementById('addMoneyStepBadgeStep1');
    const badgeStep2 = document.getElementById('addMoneyStepBadgeStep2');
    const badgeEl = document.getElementById('addMoneyStepBadge');

    if (modal) {
      modal.classList.toggle('step-1-active', step === 1);
      modal.classList.toggle('step-2-active', step === 2);
    }

    if (step === 1) {
      if (step1) {
        step1.style.display = 'block';
        step1.classList.add('active');
      }
      if (step2) {
        step2.style.display = 'none';
        step2.classList.remove('active');
      }
      if (backBtn) backBtn.style.setProperty('display', 'none', 'important');
      if (closeBtn) closeBtn.style.setProperty('display', 'flex', 'important');
      if (badgeStep1) badgeStep1.style.setProperty('display', 'inline-flex', 'important');
      if (badgeStep2) badgeStep2.style.setProperty('display', 'none', 'important');
      if (titleEl) titleEl.textContent = 'Add money to balance';
      if (badgeEl) {
        badgeEl.textContent = 'Step 1 of 2';
        badgeEl.className = 'add-money-step-badge step-1';
        badgeEl.style.setProperty('display', 'inline-flex', 'important');
      }
      this.onAddMoneyAmountChange();
      setTimeout(() => {
        document.getElementById('addMoneyAmountInput')?.focus();
      }, 50);
    } else if (step === 2) {
      if (step1) {
        step1.style.display = 'none';
        step1.classList.remove('active');
      }
      if (step2) {
        step2.style.display = 'block';
        step2.classList.add('active');
      }
      if (backBtn) backBtn.style.setProperty('display', 'inline-flex', 'important');
      if (closeBtn) closeBtn.style.setProperty('display', 'none', 'important');
      if (badgeStep1) badgeStep1.style.setProperty('display', 'none', 'important');
      if (badgeStep2) badgeStep2.style.setProperty('display', 'inline-flex', 'important');
      if (titleEl) titleEl.textContent = 'Payment Details';
      if (badgeEl) {
        badgeEl.textContent = 'Step 2 of 2';
        badgeEl.className = 'add-money-step-badge step-2';
        badgeEl.style.setProperty('display', 'none', 'important');
      }

      this.renderAddMoneyStep2Details();
      setTimeout(() => {
        if (this.selectedMethod !== 'cash') {
          document.getElementById('addMoneyTrxIdInput')?.focus();
        }
      }, 50);
    }
  },

  /**
   * Enable or disable Continue button based on amount validity
   */
  onAddMoneyAmountChange() {
    const amountInput = document.getElementById('addMoneyAmountInput');
    const btn = document.getElementById('btnContinueAddMoney');
    if (!btn) return;
    const val = parseFloat(amountInput?.value);
    if (val && !isNaN(val) && val > 0) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  },

  /**
   * Validate Step 1 and proceed to Step 2
   */
  continueToAddMoneyStep2() {
    const amountInput = document.getElementById('addMoneyAmountInput');
    const amount = parseFloat(amountInput?.value);

    if (!amount || isNaN(amount) || amount <= 0) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('warning', 'Invalid Amount', 'Please enter a valid amount.');
      } else {
        alert('Please enter a valid amount.');
      }
      if (amountInput) amountInput.focus();
      return;
    }

    this.goToAddMoneyStep(2);
  },

  /**
   * Render dynamic payment method selection pills in Add Money Modal
   */
  renderPaymentMethodPills() {
    const container = document.getElementById('addMoneyMethodPills');
    if (!container) return;

    const methods = [];
    const raw = this.paymentMethods || {};
    const seenIds = new Set();

    if (raw.methods && typeof raw.methods === 'object') {
      Object.entries(raw.methods).forEach(([id, m]) => {
        if (m && m.active !== false && m.number) {
          methods.push({ id, ...m });
          seenIds.add(id);
          if (m.platform) seenIds.add(m.platform.toLowerCase());
        }
      });
    }

    Object.entries(raw).forEach(([key, val]) => {
      if (key === 'methods') return;
      if (val && typeof val === 'object' && val.number && (val.active !== false && val.enabled !== false)) {
        const platform = (val.platform || key).toLowerCase();
        const id = val.id || key;
        if (!seenIds.has(key) && !seenIds.has(id) && !seenIds.has(platform)) {
          methods.push({
            id: id,
            platform: platform,
            name: val.name || (key.charAt(0).toUpperCase() + key.slice(1)),
            number: val.number,
            charge: parseFloat(val.charge) || 0,
            description: val.description || (val.type ? `${val.type} account` : ''),
            available: true
          });
          seenIds.add(key);
          seenIds.add(id);
          seenIds.add(platform);
        }
      }
    });

    methods.push({ id: 'cash', name: 'Cash', available: true });
    this.availableMethodsList = methods;

    if (!methods.some(m => m.id === this.selectedMethod)) {
      this.selectedMethod = methods[0]?.id || 'cash';
    }

    container.innerHTML = methods.map(m => {
      const methodKey = `${m.platform || ''} ${m.id || ''} ${m.name || ''}`.toLowerCase();
      const brandClass = methodKey.includes('bkash') ? 'bkash' : (methodKey.includes('nagad') ? 'nagad' : (methodKey.includes('rocket') ? 'rocket' : ''));
      return `
        <button type="button" class="add-money-method-pill ${brandClass} ${this.selectedMethod === m.id ? 'active' : ''}"
                onclick="Messliner.userBills.selectPaymentMethod('${m.id}')">
          <span>${m.name || m.platform || 'Method'}</span>
        </button>
      `;
    }).join('');
  },

  /**
   * Select a payment method
   */
  selectPaymentMethod(methodId) {
    this.selectedMethod = methodId;
    this.renderPaymentMethodPills();
    if (this.currentAddMoneyStep === 2) {
      this.renderAddMoneyStep2Details();
    }
  },

  /**
   * Render Section 2: Charge breakdown, Number with Copy, TrxID & Pay button
   */
  renderAddMoneyStep2Details() {
    const container = document.getElementById('addMoneyStep2Details');
    const trxGroup = document.getElementById('addMoneyTrxIdGroup');
    const trxInput = document.getElementById('addMoneyTrxIdInput');
    const submitBtn = document.getElementById('btnSubmitAddMoney');
    const submitText = document.getElementById('btnSubmitAddMoneyText');

    const amount = parseFloat(document.getElementById('addMoneyAmountInput')?.value) || 0;
    const method = (this.availableMethodsList || []).find(m => m.id === this.selectedMethod) || this.paymentMethods[this.selectedMethod] || {};
    const name = method.name || method.platform || (this.selectedMethod === 'cash' ? 'Cash' : 'Digital');
    const num = method.number || '';
    const charge = parseFloat(method.charge) || 0;
    const desc = method.description || (method.type ? `${method.type} account` : '');

    let fee = 0;
    if (charge > 0 && this.selectedMethod !== 'cash') {
      fee = (amount * charge) / 100;
    }
    const totalPayable = amount + fee;

    const formattedAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formattedFee = Number(fee).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const formattedTotal = Number(totalPayable).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    this.calculatedFee = fee;
    this.calculatedTotalPayable = totalPayable;

    // Set submit button HTML with custom Taka symbol
    const payBtnHtml = `Pay <span class="tk-symbol"></span>${formattedTotal}`;
    if (submitText) {
      submitText.innerHTML = payBtnHtml;
    } else if (submitBtn) {
      submitBtn.innerHTML = payBtnHtml;
    }

    if (this.selectedMethod === 'cash') {
      if (trxGroup) trxGroup.style.display = 'none';
      if (trxInput) trxInput.required = false;

      if (container) {
        container.innerHTML = `
          <!-- Single Unified Cash Card -->
          <div class="add-money-unified-card cash">
            <div class="amu-account-header">
              <div class="amu-account-left">
                <span class="amu-account-provider cash">Cash Payment</span>
                <span class="amu-account-type cash">In Hand</span>
              </div>
            </div>

            <div class="amu-breakdown-wrap" style="margin-top: 4px;">
              <div class="amu-row">
                <span class="amu-row-label">Deposit Amount</span>
                <span class="amu-row-val font-semibold"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
              <div class="amu-subdivider"></div>
              <div class="amu-row total-row">
                <span class="amu-total-label">Total Amount</span>
                <span class="amu-total-val"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
            </div>

            <div class="amu-divider"></div>

            <div class="amu-cash-note">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <circle cx="12" cy="12" r="2"></circle>
                <path d="M6 12h.01M18 12h.01"></path>
              </svg>
              <span>Hand over <strong><span class="tk-symbol"></span>${formattedAmount}</strong> cash to dining manager.</span>
            </div>
          </div>
        `;
      }
    } else {
      if (trxGroup) trxGroup.style.display = 'block';
      if (trxInput) trxInput.required = true;

      const methodKey = String(this.selectedMethod).toLowerCase();
      const brandClass = methodKey.includes('bkash') ? 'bkash' : (methodKey.includes('nagad') ? 'nagad' : (methodKey.includes('rocket') ? 'rocket' : 'generic'));

      if (container) {
        container.innerHTML = `
          <!-- Single Unified Minimal Payment & Amount Card -->
          <div class="add-money-unified-card ${brandClass}">
            <!-- 1. Top Section: Account Number & Copy Button -->
            <div class="amu-account-header">
              <div class="amu-account-left">
                <span class="amu-account-provider ${brandClass}">${name} Number</span>
                ${desc ? `<span class="amu-account-type ${brandClass}">${desc}</span>` : `<span class="amu-account-type ${brandClass}">Payment Only</span>`}
              </div>
            </div>

            <div class="amu-number-bar">
              <div class="amu-number-text-wrap">
                <svg class="amu-phone-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                <span class="amu-number-val">${num || 'Not configured'}</span>
              </div>
              ${num ? `
                <button type="button" class="amu-copy-btn ${brandClass}" onclick="Messliner.userBills.copyNumber('${num}', this)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span class="ami-copy-text">Copy</span>
                </button>
              ` : ''}
            </div>

            <!-- Divider -->
            <div class="amu-divider"></div>

            <!-- 2. Bottom Section: Breakdown (Deposit, Charge, Total Payable) -->
            <div class="amu-breakdown-wrap">
              <div class="amu-row">
                <span class="amu-row-label">Deposit Amount</span>
                <span class="amu-row-val font-semibold"><span class="tk-symbol"></span>${formattedAmount}</span>
              </div>
              ${charge > 0 ? `
                <div class="amu-row fee-row">
                  <span class="amu-row-label">${name} Charge (${charge}%)</span>
                  <span class="amu-row-val fee">+<span class="tk-symbol"></span>${formattedFee}</span>
                </div>
              ` : ''}
              <div class="amu-subdivider"></div>
              <div class="amu-row total-row">
                <span class="amu-total-label">Total Payable</span>
                <span class="amu-total-val"><span class="tk-symbol"></span>${formattedTotal}</span>
              </div>
            </div>
          </div>

          <div class="amu-tip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Send <strong><span class="tk-symbol"></span>${formattedTotal}</strong> to above number & enter TrxID below</span>
          </div>
        `;
      }
    }

    this.handleTrxIdInput();
  },

  /**
   * Validate Transaction ID input (minimum 8 chars) and toggle Pay button disabled state
   */
  handleTrxIdInput() {
    const trxInput = document.getElementById('addMoneyTrxIdInput');
    const submitBtn = document.getElementById('btnSubmitAddMoney');
    if (!submitBtn) return;
    if (this.selectedMethod === 'cash') {
      submitBtn.disabled = false;
      return;
    }
    const val = (trxInput?.value || '').trim();
    submitBtn.disabled = val.length < 8;
  },

  copyNumber(num, btnEl) {
    if (!num) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(num).then(() => {
        Notifications.toast('info', 'Copied', 'Payment number copied to clipboard.');
        if (btnEl) {
          const textSpan = btnEl.querySelector('.ami-copy-text');
          const origText = textSpan ? textSpan.textContent : btnEl.textContent;
          btnEl.classList.add('copied');
          if (textSpan) {
            textSpan.textContent = 'Copied! ✓';
          } else {
            btnEl.textContent = 'Copied! ✓';
          }
          setTimeout(() => {
            btnEl.classList.remove('copied');
            if (textSpan) {
              textSpan.textContent = origText;
            } else {
              btnEl.textContent = origText;
            }
          }, 1800);
        }
      });
    }
  },

  /**
   * Submit Add Money Request to Firebase
   */
  async submitAddMoneyRequest() {
    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }
    const userId = this.getUserId();
    if (!userId) {
      Notifications.toast('error', 'Error', 'User ID not found.');
      return;
    }

    const amount = parseFloat(document.getElementById('addMoneyAmountInput')?.value);
    const trxId = document.getElementById('addMoneyTrxIdInput')?.value.trim();
    const note = document.getElementById('addMoneyNoteInput')?.value.trim();

    if (!amount || amount <= 0) {
      Notifications.toast('warning', 'Invalid Amount', 'Please enter a valid amount.');
      this.goToAddMoneyStep(1);
      return;
    }

    if (this.selectedMethod !== 'cash' && (!trxId || trxId.length < 8)) {
      Notifications.toast('warning', 'Invalid TrxID', 'Please enter a valid Transaction ID (minimum 8 characters).');
      document.getElementById('addMoneyTrxIdInput')?.focus();
      return;
    }

    const user = Messliner.users?.users?.[userId] || Messliner.state?.user || {};
    const userName = user.name || 'Member';

    const submitBtn = document.getElementById('btnSubmitAddMoney');
    const submitText = document.getElementById('btnSubmitAddMoneyText');
    const origBtnText = submitText ? submitText.textContent : (submitBtn?.textContent || 'Pay');
    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'Submitting...';
      else submitBtn.textContent = 'Submitting...';
    }

    try {
      const fee = this.calculatedFee || 0;
      const totalPayable = this.calculatedTotalPayable || amount;

      const methodObj = (this.availableMethodsList || []).find(m => m.id === this.selectedMethod) || this.paymentMethods?.[this.selectedMethod] || {};
      const methodBrand = (methodObj.platform || methodObj.name || (this.selectedMethod === 'cash' ? 'cash' : this.selectedMethod)).toLowerCase();
      let resolvedMethodName = methodObj.name || (methodBrand.charAt(0).toUpperCase() + methodBrand.slice(1));
      if (methodBrand.includes('bkash')) resolvedMethodName = 'bKash';
      else if (methodBrand.includes('nagad')) resolvedMethodName = 'Nagad';
      else if (methodBrand.includes('rocket')) resolvedMethodName = 'Rocket';
      else if (methodBrand.includes('cash')) resolvedMethodName = 'Cash';

      const reqRef = db.ref(`dinings/${diningId}/paymentRequests`).push();
      const reqPayload = {
        userId: userId,
        userName: userName,
        amount: amount,
        fee: fee,
        totalPayable: totalPayable,
        method: methodBrand,
        methodName: resolvedMethodName,
        trxId: trxId || null,
        note: note || '',
        status: 'pending',
        month: Utils.currentMonth(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await reqRef.set(reqPayload);

      // Optimistically record into local this.paymentRequests so it is immediately reflected
      this.paymentRequests = this.paymentRequests || {};
      this.paymentRequests[reqRef.key] = {
        id: reqRef.key,
        ...reqPayload,
        createdAt: Date.now()
      };

      // Notify Dining Admin
      const admins = Object.entries(Messliner.users?.users || {}).filter(([_, u]) => u.role === 'admin');
      for (const [adminId, _] of admins) {
        await Notifications.create(
          diningId,
          'Add Money Request',
          `${userName} requested ৳${amount} via ${resolvedMethodName}`,
          adminId,
          'deposit'
        );
      }

      Notifications.toast('success', 'Request Submitted', 'Your request is sent to the admin for approval.');
      closeModal('addMoneyModal');
      this.goToAddMoneyStep(1);
      this.switchTab('history');
      this.renderOverview();
      this.renderHistory();

    } catch (err) {
      console.error('Submit add money error:', err);
      Notifications.toast('error', 'Error', 'Failed to submit request.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitText) submitText.textContent = origBtnText;
        else submitBtn.textContent = origBtnText;
      }
    }
  }
};
if (typeof window !== 'undefined') {
  window.UserBillsModule = UserBillsModule;
  if (typeof Messliner !== 'undefined') {
    Messliner.userBills = UserBillsModule;
  }
}

console.log('[Messliner] UserBills module loaded');
