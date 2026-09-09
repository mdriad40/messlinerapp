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

  /**
   * Preset category icons matching admin ledger
   */
  categoryIcons: {
    cook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
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
    return Messliner.state?.userId || this.userId || (typeof App !== 'undefined' ? App.state?.userId : null);
  },

  /**
   * Initialize module with Firebase listeners and pre-fetched data
   */
  init(diningId, userId, initialData) {
    this.diningId = diningId || this.getDiningId();
    this.userId = userId || this.getUserId();
    this.currentCycle = Utils.currentMonth();

    if (initialData?.bills) {
      this.bills = initialData.bills;
    }
    if (initialData?.deposits) {
      this.userDeposits = initialData.deposits;
    }
    if (initialData?.meals) {
      this.mealsData = initialData.meals;
    }
    if (initialData?.settings?.paymentMethods) {
      this.paymentMethods = initialData.settings.paymentMethods;
    }

    if (!this.diningId) {
      console.warn('[UserBillsModule] No active diningId available during init');
      return;
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
    const diningId = this.getDiningId();
    if (!diningId || this._listenersAttached) return;
    this._listenersAttached = true;

    // 1. Listen to Bills in real-time
    db.ref(`dinings/${diningId}/bills`).on('value', (snap) => {
      this.bills = snap.val() || {};
      if (Router.currentPage === 'user-bills') {
        this.render();
      }
    });

    // 2. Listen to Deposits
    db.ref(`dinings/${diningId}/deposits`).on('value', (snap) => {
      this.userDeposits = snap.val() || {};
      if (Router.currentPage === 'user-bills') {
        this.render();
      }
    });

    // 3. Listen to Payment Requests
    db.ref(`dinings/${diningId}/paymentRequests`).on('value', (snap) => {
      this.paymentRequests = snap.val() || {};
      if (Router.currentPage === 'user-bills') {
        this.render();
      }
    });

    // 4. Listen to Meals
    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      this.mealsData = snap.val() || {};
      if (Router.currentPage === 'user-bills') {
        this.render();
      }
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
   * Navigate to previous month cycle
   */
  prevMonth() {
    if (!this.currentCycle) this.currentCycle = Utils.currentMonth();
    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    this.currentCycle = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.renderBills();
  },

  /**
   * Navigate to next month cycle
   */
  nextMonth() {
    if (!this.currentCycle) this.currentCycle = Utils.currentMonth();
    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    this.currentCycle = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.renderBills();
  },

  /**
   * Switch between Overview, Bills, and History tabs
   */
  switchTab(tab) {
    this.activeTab = tab;

    document.querySelectorAll('.user-bills-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const secOverview = document.getElementById('userBillsSecOverview');
    const secBills = document.getElementById('userBillsSecBills');
    const secHistory = document.getElementById('userBillsSecHistory');

    if (secOverview) secOverview.style.display = tab === 'overview' ? 'block' : 'none';
    if (secBills) secBills.style.display = tab === 'bills' ? 'block' : 'none';
    if (secHistory) secHistory.style.display = tab === 'history' ? 'block' : 'none';

    this.render();
  },

  /**
   * Main render method
   */
  async render() {
    this.diningId = this.getDiningId();
    this.userId = this.getUserId();
    this.attachListeners();

    // If bills are still empty, fetch immediately once
    if (this.diningId && (!this.bills || Object.keys(this.bills).length === 0)) {
      try {
        const bSnap = await db.ref(`dinings/${this.diningId}/bills`).once('value');
        if (bSnap.exists()) {
          this.bills = bSnap.val() || {};
        }
      } catch (e) {
        console.warn('Bills prefetch notice:', e);
      }
    }

    this.renderOverview();
    this.renderBills();
    this.renderHistory();
  },

  /**
   * Helper: Calculate user financial numbers (balance, meal cost, deposits)
   */
  getUserFinancialMetrics() {
    const currentMonth = Utils.currentMonth();
    const userId = this.getUserId();

    let userDeposit = 0;
    let otherCost = 0;
    let deduction = 0;

    // 1. Calculate from user deposits
    Object.values(this.userDeposits || {}).forEach(d => {
      if (d && d.userId === userId && Utils.isItemInMonth(d, currentMonth)) {
        const amt = Math.abs(Utils.num(d.amount));
        if (d.type === 'deposit') {
          userDeposit += amt;
        } else if (d.type === 'other_costing') {
          otherCost += amt;
        } else {
          deduction += amt;
        }
      }
    });

    // 2. Calculate user meals and meal cost
    let mealCost = 0;
    if (UserDashboard?.userData && UserDashboard.userId === userId && UserDashboard.monthlyDeposit !== undefined) {
      userDeposit = UserDashboard.monthlyDeposit;
      otherCost = UserDashboard.monthlyOtherCosting || 0;
      deduction = UserDashboard.monthlyDeduction || 0;
      const mealRate = Messliner.state?.monthlyMealRate || Messliner.state?.mealRate || 0;
      const rateMode = UserDashboard.settings?.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (UserDashboard.settings?.fixedRates || null) : null;
      mealCost = Utils.calcMealCost(mealRate, UserDashboard.monthlyMeals || 0, UserDashboard.monthlyMealsBreakdown || {}, fixedRates);
    } else {
      // Calculate from raw meals
      const mMonth = this.mealsData?.[currentMonth] || {};
      let userMealCount = 0;
      Object.values(mMonth).forEach(day => {
        if (typeof day === 'object') {
          ['breakfast', 'lunch', 'dinner'].forEach(t => {
            if (day[t] && typeof day[t] === 'object' && day[t][userId]) {
              userMealCount += parseFloat(day[t][userId]) || 0;
            }
          });
        }
      });
      const mealRate = Messliner.state?.monthlyMealRate || Messliner.state?.mealRate || 0;
      mealCost = userMealCount * mealRate;
    }

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

    // Calculate unpaid bills for this user
    let unpaidBillsTotal = 0;
    let unpaidBillsCount = 0;

    Object.values(this.bills || {}).forEach(bill => {
      if (!bill) return;
      const userMember = bill.members?.[userId];
      if (userMember && userMember.status !== 'collected') {
        unpaidBillsTotal += Utils.num(userMember.amount);
        unpaidBillsCount++;
      }
    });

    // Update Overview UI Elements
    const monthEl = document.getElementById('userBillsOverviewMonth');
    if (monthEl) monthEl.textContent = monthShort;

    const balanceNumEl = document.getElementById('userBillsBalanceNum');
    const balanceStatusEl = document.getElementById('userBillsBalanceStatus');
    const isDue = balance < 0;
    const displayBalance = Math.abs(Math.round(balance));

    if (balanceNumEl) {
      balanceNumEl.textContent = `৳ ${displayBalance.toLocaleString('en-US')}`;
      balanceNumEl.style.color = isDue ? '#F87171' : '#10B981';
    }
    if (balanceStatusEl) {
      balanceStatusEl.textContent = isDue ? 'due' : 'credit';
      balanceStatusEl.className = `user-balance-badge ${isDue ? 'due' : 'credit'}`;
    }

    const billsDueEl = document.getElementById('userBillsOverviewBillsDue');
    if (billsDueEl) {
      billsDueEl.textContent = unpaidBillsCount > 0 ? Utils.currency(unpaidBillsTotal) : '৳0';
    }

    const mealCostEl = document.getElementById('userBillsOverviewMealCost');
    if (mealCostEl) mealCostEl.textContent = Utils.currency(mealCost);

    const daysLeftEl = document.getElementById('userBillsOverviewDaysLeft');
    if (daysLeftEl) daysLeftEl.textContent = String(daysLeft);

    const outstandingEl = document.getElementById('userBillsOutstandingRow');
    if (outstandingEl) {
      const totalOut = (isDue ? Math.abs(balance) : 0) + unpaidBillsTotal;
      outstandingEl.innerHTML = `
        <span class="user-outstanding-icon">ⓘ</span>
        <span>Total outstanding · ${Utils.currency(totalOut)}</span>
      `;
    }

    // Pending payment requests count banner
    const pendingRequests = Object.values(this.paymentRequests || {}).filter(
      r => r && r.userId === userId && r.status === 'pending'
    );
    const bannerEl = document.getElementById('userBillsPendingRequestBanner');
    if (bannerEl) {
      if (pendingRequests.length > 0) {
        const totalPendingReq = pendingRequests.reduce((sum, r) => sum + (Utils.num(r.amount)), 0);
        bannerEl.style.display = 'flex';
        bannerEl.innerHTML = `
          <div class="user-bills-banner-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="user-bills-banner-text">
            <strong>Payment Pending Review:</strong> ৳${totalPendingReq.toLocaleString()} (${pendingRequests.length} request${pendingRequests.length > 1 ? 's' : ''})
          </div>
        `;
      } else {
        bannerEl.style.display = 'none';
      }
    }
  },

  /**
   * Render Bills Tab (All shared bills with cycle selector & cards)
   */
  renderBills() {
    const container = document.getElementById('userBillsListContainer');
    if (!container) return;

    if (!this.currentCycle) {
      this.currentCycle = Utils.currentMonth();
    }

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
        const totalFormatted = `৳${Utils.num(b.totalAmount)} total`;

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
                <div class="user-bill-clean-amount">৳${Utils.num(b.myShare)}</div>
                <div class="user-bill-clean-share-label">your share</div>
              </div>
            </div>

            <div class="user-bill-clean-bottom">
              <div class="user-bill-clean-badge-wrap">
                ${isPaid ? `
                  <span class="user-bill-status-pill paid">Paid</span>
                ` : isPending ? `
                  <span class="user-bill-status-pill pending">Pending</span>
                ` : `
                  <span class="user-bill-status-pill unpaid">Unpaid</span>
                `}
              </div>

              <div class="user-bill-clean-action-wrap">
                ${isPaid ? `
                  <button type="button" class="btn user-bill-action-btn paid" disabled>
                    Paid ✓
                  </button>
                ` : isPending ? `
                  <button type="button" class="btn user-bill-action-btn pending" disabled>
                    Pending ⏳
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
          <p class="user-bills-sec-sub">${shortMonth} cycle</p>
        </div>
      </div>

      <!-- Month Navigation Controller -->
      <div class="user-bills-cycle-nav">
        <button type="button" class="user-bills-cycle-btn" onclick="Messliner.userBills.prevMonth()" title="Previous Month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="user-bills-cycle-display">${cycleDisplay}</span>
        <button type="button" class="user-bills-cycle-btn" onclick="Messliner.userBills.nextMonth()" title="Next Month">
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
   * Render History Tab (Payment Requests + Bill Deductions)
   */
  renderHistory() {
    const container = document.getElementById('userBillsHistoryListContainer');
    if (!container) return;

    const userId = this.getUserId();

    // Filter payment requests for this user
    const myRequests = Object.entries(this.paymentRequests || {})
      .filter(([_, r]) => r && r.userId === userId)
      .map(([id, r]) => ({
        id,
        ...r,
        itemType: 'paymentRequest',
        sortTime: r.createdAt || (r.timestamp ? new Date(r.timestamp).getTime() : 0)
      }));

    // Filter user's deposit/deduction records
    const myDeposits = Object.entries(this.userDeposits || {})
      .filter(([_, d]) => d && d.userId === userId)
      .map(([id, d]) => ({
        id,
        ...d,
        itemType: 'depositRecord',
        sortTime: d.timestamp || 0
      }));

    // Combine and sort newest first
    const allHistory = [...myRequests, ...myDeposits].sort((a, b) => b.sortTime - a.sortTime);

    if (allHistory.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <div class="empty-state-icon" style="background: rgba(16, 185, 129, 0.1); color: #059669;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h4 style="margin: 12px 0 4px; font-weight: 700; color: #0F2E1E;">No History Yet</h4>
          <p style="color: #64748B; font-size: 0.85rem;">Your bill payments and balance top-ups will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = allHistory.map(item => {
      if (item.itemType === 'paymentRequest') {
        const isApproved = item.status === 'approved';
        const isRejected = item.status === 'rejected';
        const isBillPay = item.type === 'bill_payment';

        const titleText = isBillPay
          ? `Bill: ${item.billTitle || 'Shared Bill'} (${(item.method || 'cash').toUpperCase()})`
          : `Add Money (${(item.method || 'cash').toUpperCase()})`;

        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently';

        return `
          <div class="user-history-card paymentRequest ${item.status}">
            <div class="user-history-top">
              <div class="user-history-left">
                <div class="user-history-icon-badge ${item.method || 'cash'}">
                  ${item.method === 'bkash' ? 'bK' : item.method === 'nagad' ? 'Nag' : '৳'}
                </div>
                <div>
                  <div class="user-history-title">${titleText}</div>
                  <div class="user-history-time">${dateStr}</div>
                </div>
              </div>
              <div class="user-history-right">
                <div class="user-history-amount ${isBillPay ? 'negative' : 'positive'}">
                  ${isBillPay ? '-' : '+'}${Utils.currency(item.amount)}
                </div>
                <span class="user-history-status-pill ${item.status}">
                  ${isApproved ? 'Approved ✓' : isRejected ? 'Rejected ✕' : 'Pending Review ⏳'}
                </span>
              </div>
            </div>

            ${item.trxId ? `
              <div class="user-history-detail-row">
                <span class="user-history-detail-label">TrxID:</span>
                <code class="user-history-trx">${item.trxId}</code>
              </div>
            ` : ''}

            ${item.note ? `
              <div class="user-history-detail-row">
                <span class="user-history-detail-label">Note:</span>
                <span class="user-history-detail-val">${item.note}</span>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        // Deposit Record
        const isDeduction = item.amount < 0 || item.type === 'deduction';
        const amtVal = Math.abs(item.amount);
        const dateStr = item.date ? Utils.formatDate(item.date) : 'Recently';

        return `
          <div class="user-history-card deposit ${isDeduction ? 'deduction' : 'deposit'}">
            <div class="user-history-top">
              <div class="user-history-left">
                <div class="user-history-icon-badge ${isDeduction ? 'deduction' : 'deposit'}">
                  ${isDeduction ? '−' : '+'}
                </div>
                <div>
                  <div class="user-history-title">${item.note || (isDeduction ? 'Bill Deduction' : 'Deposit Added')}</div>
                  <div class="user-history-time">${dateStr}</div>
                </div>
              </div>
              <div class="user-history-right">
                <div class="user-history-amount ${isDeduction ? 'negative' : 'positive'}">
                  ${isDeduction ? '-' : '+'}${Utils.currency(amtVal)}
                </div>
                <span class="user-history-status-pill ${isDeduction ? 'collected' : 'approved'}">
                  ${isDeduction ? 'Deducted' : 'Credited'}
                </span>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  },

  /**
   * Open "Pay Bill" Modal (Screenshot 3 style)
   */
  async openPayBillModal(billId) {
    const bill = this.bills[billId];
    if (!bill) {
      Notifications.toast('error', 'Error', 'Bill details not found.');
      return;
    }

    this.selectedBillId = billId;
    const userId = this.getUserId();
    const userMember = bill.members?.[userId];
    const amount = userMember ? Utils.num(userMember.amount) : Utils.num(bill.totalAmount);

    const titleEl = document.getElementById('payBillModalTitle');
    const amtEl = document.getElementById('payBillModalAmount');
    if (titleEl) titleEl.textContent = bill.title || 'Shared Bill';
    if (amtEl) amtEl.textContent = `৳${amount}`;

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

    this.selectedPayBillMethod = 'cash';
    this.renderPayBillMethodPills();
    this.updatePayBillMethodView();

    openModal('payBillModal');
  },

  /**
   * Render payment method pills in Pay Bill Modal
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

    container.innerHTML = methods.map(m => `
      <button type="button" class="pay-bill-method-pill ${this.selectedPayBillMethod === m.id ? 'active' : ''}"
              onclick="Messliner.userBills.selectPayBillMethod('${m.id}')">
        <span>${m.name || m.platform || 'Method'}</span>
      </button>
    `).join('');
  },

  /**
   * Select payment method in Pay Bill modal
   */
  selectPayBillMethod(methodId) {
    this.selectedPayBillMethod = methodId;
    this.renderPayBillMethodPills();
    this.updatePayBillMethodView();
  },

  /**
   * Update view based on selected method in Pay Bill modal
   */
  updatePayBillMethodView() {
    const bill = this.bills[this.selectedBillId];
    const userId = this.getUserId();
    const userMember = bill?.members?.[userId];
    const amount = userMember ? Utils.num(userMember.amount) : (bill ? Utils.num(bill.totalAmount) : 0);

    const bodyEl = document.getElementById('payBillMethodBody');
    const submitBtn = document.getElementById('btnConfirmPayBill');
    if (!bodyEl) return;

    if (this.selectedPayBillMethod === 'cash') {
      bodyEl.innerHTML = `
        <div class="pay-bill-cash-box">
          <div class="pay-bill-cash-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
              <circle cx="12" cy="15" r="2" fill="currentColor"></circle>
            </svg>
          </div>
          <div class="pay-bill-cash-text">
            <div class="pay-bill-cash-title">Hand ৳${amount} in cash</div>
            <div class="pay-bill-cash-sub">Give the cash directly to the admin. A confirmation is sent for approval.</div>
          </div>
        </div>
      `;

      if (submitBtn) {
        submitBtn.textContent = 'Confirm cash payment';
      }
    } else {
      const method = (this.payBillMethodsList || []).find(m => m.id === this.selectedPayBillMethod) || {};
      const num = method.number || 'Not configured';
      const name = method.name || method.platform || 'Digital';
      const charge = parseFloat(method.charge) || 0;
      const desc = method.description || '';

      bodyEl.innerHTML = `
        <div class="add-money-instruction-card" style="margin-bottom: 14px;">
          <div class="ami-card-header">
            <div class="ami-card-title-wrap">
              <div class="ami-card-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <span class="ami-card-label">${name} number to send ৳${amount}</span>
            </div>
            ${desc ? `<span class="ami-card-type-badge">${desc}</span>` : ''}
          </div>

          <div class="ami-number-row">
            <div class="ami-number-text">${num}</div>
            <button type="button" class="ami-copy-btn" onclick="Messliner.userBills.copyNumber('${num}', this)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="ami-copy-text">Copy</span>
            </button>
          </div>

          ${charge > 0 ? `
            <div class="ami-fee-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>Note: ${charge}% fee applies to ${name} transfers.</span>
            </div>
          ` : ''}

          <div class="ami-footer-tip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Send money to the number above & enter TrxID below</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label" for="payBillTrxIdInput" style="font-size: 0.84rem; font-weight: 700; margin-bottom: 4px;">Transaction ID</label>
          <div class="add-money-input-wrapper">
            <span class="add-money-currency-icon font-mono">#</span>
            <input type="text" id="payBillTrxIdInput" class="form-input" placeholder="e.g. 8N4K2L9P" required autocomplete="off" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 6px;">
          <label class="form-label" for="payBillNoteInput" style="font-size: 0.84rem; font-weight: 700; margin-bottom: 4px;">Note (Optional)</label>
          <input type="text" id="payBillNoteInput" class="form-input" placeholder="e.g. Bill share paid" />
        </div>
      `;

      if (submitBtn) {
        submitBtn.textContent = `Confirm ${name} payment`;
      }
    }
  },

  /**
   * Submit Bill Payment Request
   */
  async submitBillPayment() {
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

    const bill = this.bills[this.selectedBillId];
    if (!bill) {
      Notifications.toast('error', 'Error', 'Bill not found.');
      return;
    }

    const userMember = bill.members?.[userId];
    const amount = userMember ? Utils.num(userMember.amount) : Utils.num(bill.totalAmount);
    const method = this.selectedPayBillMethod || 'cash';

    const trxId = document.getElementById('payBillTrxIdInput')?.value.trim();
    const note = document.getElementById('payBillNoteInput')?.value.trim();

    if (method !== 'cash' && !trxId) {
      Notifications.toast('warning', 'Missing TrxID', 'Please enter the Transaction ID.');
      return;
    }

    const user = Messliner.users?.users?.[userId] || Messliner.state?.user || {};
    const userName = user.name || 'Member';

    const submitBtn = document.getElementById('btnConfirmPayBill');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const reqRef = db.ref(`dinings/${diningId}/paymentRequests`).push();
      const reqPayload = {
        type: 'bill_payment',
        billId: this.selectedBillId,
        billTitle: bill.title || 'Shared Bill',
        userId: userId,
        userName: userName,
        amount: amount,
        method: method,
        trxId: trxId || null,
        note: note || `Payment for ${bill.title || 'bill'}`,
        status: 'pending',
        month: bill.month || this.currentCycle || Utils.currentMonth(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await reqRef.set(reqPayload);

      // Notify Dining Admins
      const admins = Object.entries(Messliner.users?.users || {}).filter(([_, u]) => u.role === 'admin');
      for (const [adminId, _] of admins) {
        await Notifications.create(
          diningId,
          'Bill Payment Request',
          `${userName} submitted ৳${amount} for "${bill.title}" via ${method.toUpperCase()}`,
          adminId,
          'deposit'
        );
      }

      Notifications.toast('success', 'Payment Submitted', 'Your payment request was sent to the admin for approval.');
      closeModal('payBillModal');
      this.render();

    } catch (err) {
      console.error('Submit bill payment error:', err);
      Notifications.toast('error', 'Error', 'Failed to submit payment request.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm payment';
      }
    }
  },

  /**
   * Open Add Money to Balance Modal
   */
  async openAddMoneyModal() {
    this.selectedMethod = 'cash';
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
    this.updatePaymentMethodView();
    openModal('addMoneyModal');
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

    container.innerHTML = methods.map(m => `
      <button type="button" class="add-money-method-pill ${this.selectedMethod === m.id ? 'active' : ''}"
              onclick="Messliner.userBills.selectPaymentMethod('${m.id}')">
        <span>${m.name || m.platform || 'Method'}</span>
      </button>
    `).join('');
  },

  /**
   * Select a payment method
   */
  selectPaymentMethod(methodId) {
    this.selectedMethod = methodId;
    this.renderPaymentMethodPills();
    this.updatePaymentMethodView();
  },

  /**
   * Update view based on selected payment method in Add Money Modal
   */
  updatePaymentMethodView() {
    const instructionsBox = document.getElementById('addMoneyInstructionsBox');
    const trxIdGroup = document.getElementById('addMoneyTrxIdGroup');
    const trxIdInput = document.getElementById('addMoneyTrxIdInput');
    const submitBtn = document.getElementById('btnSubmitAddMoney');

    if (this.selectedMethod === 'cash') {
      if (instructionsBox) instructionsBox.style.display = 'none';
      if (trxIdGroup) trxIdGroup.style.display = 'none';
      if (trxIdInput) trxIdInput.required = false;
      if (submitBtn) {
        submitBtn.className = 'btn btn-primary btn-block add-money-submit-btn';
        submitBtn.textContent = 'Submit request';
      }
    } else {
      const method = (this.availableMethodsList || []).find(m => m.id === this.selectedMethod) || this.paymentMethods[this.selectedMethod] || {};
      const num = method.number || 'Not configured';
      const name = method.name || method.platform || 'Digital';
      const charge = parseFloat(method.charge) || 0;
      const desc = method.description || '';

      if (submitBtn) {
        submitBtn.className = 'btn btn-primary btn-block add-money-submit-btn';
        submitBtn.textContent = 'Submit request';
      }

      if (instructionsBox) {
        instructionsBox.style.display = 'block';
        instructionsBox.innerHTML = `
          <div class="add-money-instruction-card">
            <div class="ami-card-header">
              <div class="ami-card-title-wrap">
                <div class="ami-card-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                </div>
                <span class="ami-card-label">${name} number to send money</span>
              </div>
              ${desc ? `<span class="ami-card-type-badge">${desc}</span>` : ''}
            </div>

            <div class="ami-number-row">
              <div class="ami-number-text">${num}</div>
              <button type="button" class="ami-copy-btn" onclick="Messliner.userBills.copyNumber('${num}', this)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span class="ami-copy-text">Copy</span>
              </button>
            </div>

            ${charge > 0 ? `
              <div class="ami-fee-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Note: ${charge}% fee applies to ${name} transfers.</span>
              </div>
            ` : ''}

            <div class="ami-footer-tip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Send money to the number above & enter TrxID below</span>
            </div>
          </div>
        `;
      }
      if (trxIdGroup) trxIdGroup.style.display = 'block';
      if (trxIdInput) trxIdInput.required = true;
    }
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
      return;
    }

    if (this.selectedMethod !== 'cash' && !trxId) {
      Notifications.toast('warning', 'Missing TrxID', 'Please enter the Transaction ID for verification.');
      return;
    }

    const user = Messliner.users?.users?.[userId] || Messliner.state?.user || {};
    const userName = user.name || 'Member';

    const submitBtn = document.getElementById('btnSubmitAddMoney');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const reqRef = db.ref(`dinings/${diningId}/paymentRequests`).push();
      const reqPayload = {
        userId: userId,
        userName: userName,
        amount: amount,
        method: this.selectedMethod,
        trxId: trxId || null,
        note: note || '',
        status: 'pending',
        month: Utils.currentMonth(),
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await reqRef.set(reqPayload);

      // Notify Dining Admin
      const admins = Object.entries(Messliner.users?.users || {}).filter(([_, u]) => u.role === 'admin');
      for (const [adminId, _] of admins) {
        await Notifications.create(
          diningId,
          'Add Money Request',
          `${userName} requested ৳${amount} via ${(this.selectedMethod).toUpperCase()}`,
          adminId,
          'deposit'
        );
      }

      Notifications.toast('success', 'Request Submitted', 'Your request is sent to the admin for approval.');
      closeModal('addMoneyModal');
      this.switchTab('history');

    } catch (err) {
      console.error('Submit add money error:', err);
      Notifications.toast('error', 'Error', 'Failed to submit request.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
      }
    }
  }
};

console.log('[Messliner] UserBills module loaded');
