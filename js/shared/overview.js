/* ============================================
   Messliner — Dining Overview (shared/overview.js)
   ============================================ */

const OverviewModule = {
  diningId: null,
  createdDate: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  selectedUserId: null,

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /**
   * Initialize overview with realtime data
   */
  async init(diningId, initialData) {
    this.diningId = diningId;
    this.selectedUserId = null;

    const now = new Date();
    this.selectedYear = now.getFullYear();
    this.selectedMonth = now.getMonth() + 1;

    let startDateStr = initialData?.settings?.historyStartDate;
    let createdAt = initialData?.info?.createdAt;
    if (startDateStr) {
      this.createdDate = new Date(startDateStr);
    } else if (createdAt) {
      this.createdDate = new Date(createdAt);
    } else {
      this.createdDate = new Date(2026, 0, 1);
    }

    if (!startDateStr && !createdAt) {
      db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value').then(startRef => {
        let sd = startRef.val();
        if (sd) {
          this.createdDate = new Date(sd);
          this.populateYearDropdown();
          this.populateMonthDropdown();
        } else {
          db.ref(`dinings/${this.diningId}/info/createdAt`).once('value').then(infoSnap => {
            let ca = infoSnap.val();
            if (ca) this.createdDate = new Date(ca);
            this.populateYearDropdown();
            this.populateMonthDropdown();
          }).catch(() => { });
        }
      }).catch(() => { });
    }

    this.populateYearDropdown();
    this.populateMonthDropdown();

    if (initialData) {
      this.cachedData = {
        users: initialData.users || {},
        deposits: initialData.deposits || {},
        bazar: initialData.bazar || {},
        meals: initialData.meals || {},
        settings: initialData.settings || {}
      };
    }

    // Keydown listener for Enter key to login as selected member from dashboard
    if (!this._keydownListenerAdded) {
      document.addEventListener('keydown', (e) => {
        const isOverviewVisible = Router.currentPage === 'overview' ||
          (Router.currentPage === 'dashboard' && Messliner.state.role === 'admin') ||
          ((!location.hash || location.hash === '#dashboard' || location.hash === '#') && Messliner.state.role === 'admin');
        if (isOverviewVisible && e.key === 'Enter') {
          if (this.selectedUserId) {
            window.open(`dashboard.html?impersonate=${this.selectedUserId}`, '_blank');
          }
        }
      });
      this._keydownListenerAdded = true;
    }

    const triggerRefresh = () => {
      const isOverviewVisible = Router.currentPage === 'overview' ||
        (Router.currentPage === 'dashboard' && Messliner.state.role === 'admin');
      if (isOverviewVisible) {
        this.refresh();
      }
    };

    // Firebase listeners update cachedData and trigger refresh
    db.ref(`dinings/${diningId}/users`).on('value', (snap) => {
      if (!this.cachedData) this.cachedData = {};
      this.cachedData.users = snap.val() || {};
      triggerRefresh();
    });
    db.ref(`dinings/${diningId}/deposits`).on('value', (snap) => {
      if (!this.cachedData) this.cachedData = {};
      this.cachedData.deposits = snap.val() || {};
      triggerRefresh();
    });
    db.ref(`dinings/${diningId}/bazar`).on('value', (snap) => {
      if (!this.cachedData) this.cachedData = {};
      this.cachedData.bazar = snap.val() || {};
      triggerRefresh();
    });
    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      if (!this.cachedData) this.cachedData = {};
      this.cachedData.meals = snap.val() || {};
      triggerRefresh();
    });
    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      if (!this.cachedData) this.cachedData = {};
      this.cachedData.settings = snap.val() || {};
      triggerRefresh();
    });

    if (initialData) {
      this.refresh(this.cachedData);
    }
  },

  /**
   * Populate Year dropdown
   */
  populateYearDropdown() {
    const valueEl = document.getElementById('overviewYearValue');
    const menuEl = document.getElementById('overviewYearMenu');
    const valueMobEl = document.getElementById('overviewYearValueMob');
    const menuMobEl = document.getElementById('overviewYearMenuMob');

    const startYear = this.createdDate ? this.createdDate.getFullYear() : 2026;
    const endYear = new Date().getFullYear();

    let html = '';
    for (let y = startYear; y <= endYear; y++) {
      const sel = y === this.selectedYear ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${y}"
                    onclick="Messliner.overview.selectYear(${y})">${y}</div>`;
    }
    if (menuEl) menuEl.innerHTML = html;
    if (valueEl) valueEl.textContent = this.selectedYear;
    if (menuMobEl) menuMobEl.innerHTML = html;
    if (valueMobEl) valueMobEl.textContent = this.selectedYear;
  },

  toggleMobileDropdown(event, dropdownId) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const target = document.getElementById(dropdownId);
    if (!target) return;
    const isCurrentlyActive = target.classList.contains('active');

    // Close all custom dropdowns first
    document.querySelectorAll('.custom-dropdown.active').forEach(dd => dd.classList.remove('active'));

    // If target was not active, open it
    if (!isCurrentlyActive) {
      target.classList.add('active');
      setTimeout(() => {
        const selected = target.querySelector('.custom-dropdown-item.selected');
        if (selected) {
          selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 40);
    }
  },

  selectYear(year) {
    this.selectedYear = year;
    document.querySelectorAll('.custom-dropdown.active').forEach(dd => dd.classList.remove('active'));
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.refresh();
  },

  /**
   * Populate Month dropdown
   */
  populateMonthDropdown() {
    const valueEl = document.getElementById('overviewMonthValue');
    const menuEl = document.getElementById('overviewMonthMenu');
    const valueMobEl = document.getElementById('overviewMonthValueMob');
    const menuMobEl = document.getElementById('overviewMonthMenuMob');

    const startYear = this.createdDate ? this.createdDate.getFullYear() : 2026;
    const currentYear = new Date().getFullYear();

    let startMonth = 1;
    let endMonth = 12;

    if (this.selectedYear === startYear && this.createdDate) {
      startMonth = this.createdDate.getMonth() + 1;
    }
    if (this.selectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    if (this.selectedMonth < startMonth) this.selectedMonth = startMonth;
    if (this.selectedMonth > endMonth) this.selectedMonth = endMonth;

    let html = '';
    for (let m = startMonth; m <= endMonth; m++) {
      const sel = m === this.selectedMonth ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${m}"
                    onclick="Messliner.overview.selectMonth(${m})">${this.monthNames[m - 1]}</div>`;
    }
    if (menuEl) menuEl.innerHTML = html;
    if (valueEl) valueEl.textContent = this.monthNames[this.selectedMonth - 1];
    if (menuMobEl) menuMobEl.innerHTML = html;
    if (valueMobEl) valueMobEl.textContent = this.monthNames[this.selectedMonth - 1];
  },

  selectMonth(month) {
    this.selectedMonth = month;
    document.querySelectorAll('.custom-dropdown.active').forEach(dd => dd.classList.remove('active'));
    this.populateMonthDropdown();
    this.refresh();
  },

  /**
   * Refresh all overview sections
   */
  async refresh(dataToUse) {
    try {
      if (Router.currentPage === 'overview') {
        const overviewContent = document.getElementById('overviewContent');
        const originalContainer = document.getElementById('overviewOriginalContainer');
        if (overviewContent && originalContainer && overviewContent.parentElement !== originalContainer) {
          originalContainer.appendChild(overviewContent);
        }
      }

      if (!this.selectedYear || !this.selectedMonth) {
        const now = new Date();
        this.selectedYear = now.getFullYear();
        this.selectedMonth = now.getMonth() + 1;
      }

      this.populateYearDropdown();
      this.populateMonthDropdown();

      const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;

      let users, deposits, bazars, allMeals, settings;

      if (dataToUse) {
        users = dataToUse.users || {};
        deposits = dataToUse.deposits || {};
        bazars = dataToUse.bazar || {};
        allMeals = dataToUse.meals || {};
        settings = dataToUse.settings || {};
      } else if (this.cachedData && this.cachedData.users) {
        users = this.cachedData.users || {};
        deposits = this.cachedData.deposits || {};
        bazars = this.cachedData.bazar || {};
        allMeals = this.cachedData.meals || {};
        settings = this.cachedData.settings || {};
      } else {
        const [usersSnap, depositsSnap, bazarSnap, mealsSnap, settingsSnap] = await Promise.all([
          db.ref(`dinings/${this.diningId}/users`).once('value'),
          db.ref(`dinings/${this.diningId}/deposits`).once('value'),
          db.ref(`dinings/${this.diningId}/bazar`).once('value'),
          db.ref(`dinings/${this.diningId}/meals`).once('value'),
          db.ref(`dinings/${this.diningId}/settings`).once('value')
        ]);

        users = usersSnap.val() || {};
        deposits = depositsSnap.val() || {};
        bazars = bazarSnap.val() || {};
        allMeals = mealsSnap.val() || {};
        settings = settingsSnap.val() || {};

        this.cachedData = { users, deposits, bazar: bazars, meals: allMeals, settings };
      }

      this.managerMealEnabled = !!settings.managerMealEnabled;

      // Helper for matching month of deposit/bazar entry
      const isSelectedMonth = (item) => {
        if (!item) return false;
        if (item.date && typeof item.date === 'string') {
          return item.date.startsWith(formattedMonth);
        }
        if (item.timestamp && typeof item.timestamp === 'number') {
          const dt = new Date(item.timestamp);
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}` === formattedMonth;
        }
        return false;
      };

      // Calculate totals for selected month
      let totalDeposit = 0;
      let totalDeductions = 0;
      let totalOtherCosting = 0;
      let totalBazar = 0;
      let totalMeals = 0;

      const filteredDeposits = {};
      Object.entries(deposits).forEach(([id, d]) => {
        if (isSelectedMonth(d)) {
          filteredDeposits[id] = d;
          if (d.type === 'deposit') totalDeposit += Utils.num(d.amount);
          else if (d.type === 'other_costing') totalOtherCosting += Math.abs(Utils.num(d.amount));
          else if (d.type === 'deduction' || d.type === 'friday_meal') totalDeductions += Math.abs(Utils.num(d.amount));
          else totalDeductions += Math.abs(Utils.num(d.amount));
        }
      });
      this.deposits = filteredDeposits;

      const filteredBazars = {};
      Object.entries(bazars).forEach(([id, b]) => {
        if (isSelectedMonth(b)) {
          filteredBazars[id] = b;
          totalBazar += Utils.num(b.amount);
        }
      });

      // Count total meals and breakdown for selected month
      const monthMeals = allMeals[formattedMonth] || {};
      const userMealsBreakdown = {};
      const userTotalMeals = {};

      Object.values(monthMeals).forEach(dayData => {
        Object.entries(dayData).forEach(([type, typeData]) => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, count]) => {
              const u = users[uId];
              if (u && u.role === 'admin' && !this.managerMealEnabled) {
                return; // Skip manager meals
              }
              const c = parseInt(count) || 0;
              totalMeals += c;
              if (!userMealsBreakdown[uId]) {
                userMealsBreakdown[uId] = { breakfast: 0, lunch: 0, dinner: 0 };
              }
              if (userMealsBreakdown[uId][type] !== undefined) {
                userMealsBreakdown[uId][type] += c;
              }
              userTotalMeals[uId] = (userTotalMeals[uId] || 0) + c;
            });
          }
        });
      });
      this.userMealsBreakdown = userMealsBreakdown;
      this.userTotalMeals = userTotalMeals;

      // Calculate meal rate
      const rateMode = settings.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
      let mealRate = 0;
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        let fullMealRate = 0;
        if (trackedMeals.breakfast !== false) fullMealRate += (fixedRates.breakfast || 0);
        if (trackedMeals.lunch !== false) fullMealRate += (fixedRates.lunch || 0);
        if (trackedMeals.dinner !== false) fullMealRate += (fixedRates.dinner || 0);
        mealRate = fullMealRate;
      } else {
        mealRate = Utils.calcMealRate(totalBazar, totalMeals);
      }

      // Meal Cost (previously Total Bazar)
      const totalMealCost = totalBazar;
      const totalCost = totalMealCost + totalOtherCosting;
      const netBalance = totalDeposit - totalCost - totalDeductions;

      // Update global state
      Messliner.state.mealRate = mealRate;
      Messliner.state.totalMeals = totalMeals;
      Messliner.state.totalBazar = totalBazar;

      // Render overview stats
      this.renderStats(totalDeposit, totalMeals, mealRate, totalMealCost, totalDeductions, totalOtherCosting, totalCost, netBalance, totalBazar);

      const isAdmin = Messliner.state.role === 'admin';
      const memberStatsSection = document.getElementById('overviewMemberStatsSection');
      const bazarHistorySection = document.getElementById('overviewBazarHistorySection');
      const memberNavGrid = document.getElementById('memberNavGridSection');

      if (memberStatsSection) {
        memberStatsSection.style.display = isAdmin ? 'block' : 'none';
      }
      if (bazarHistorySection) {
        bazarHistorySection.style.display = isAdmin ? 'block' : 'none';
      }
      if (memberNavGrid) {
        memberNavGrid.style.display = isAdmin ? 'none' : 'block';
        memberNavGrid.classList.toggle('hidden', isAdmin);
      }

      if (isAdmin) {
        // Render member stats table
        this.renderMemberStats(users, mealRate, fixedRates);

        // Render bazar history
        this.renderBazarHistory(filteredBazars);
      }

    } catch (error) {
      console.error('Overview refresh error:', error);
    }
  },

  /**
   * Render overview stat cards
   */
  renderStats(totalDeposit, totalMeals, mealRate, totalMealCost, totalDeductions, totalOtherCosting, totalCost, netBalance, totalBazar) {
    const container = document.getElementById('overviewStats');
    if (!container) return;

    const bazarCost = totalBazar !== undefined ? totalBazar : totalMealCost;

    // Custom Minimal Professional SVG Icons
    const icons = {
      deposit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3.5" fill="currentColor" fill-opacity="0.12"/><path d="M2 10h20" stroke-width="1.5"/><path d="M6 15h4" stroke-width="2"/><path d="M16 16.5l2.5-2.5 2.5 2.5m-2.5-2.5v5" stroke-width="2"/></svg>`,
      meals: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor"/><path d="M12 4.5v2"/><path d="M3 18a9 9 0 0 1 18 0H3z" fill="currentColor" fill-opacity="0.12"/><line x1="2" y1="18" x2="22" y2="18" stroke-width="2"/><path d="M8 21h8" stroke-width="1.8"/></svg>`,
      mealRate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.1"/><polyline points="12 7 12 12 15.5 14" stroke-width="2"/><path d="M16.5 6.5l3-3m-3 0h3v3" stroke-width="1.8"/></svg>`,
      bazar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1.6 10.4A2 2 0 0 1 16.4 21H7.6a2 2 0 0 1-1.98-1.6L4 9z" fill="currentColor" fill-opacity="0.1"/><path d="M8 9V6a4 4 0 0 1 8 0v3" stroke-width="2"/><line x1="9" y1="13" x2="15" y2="13" stroke-width="1.8"/></svg>`,
      mealCost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity="0.08"/><circle cx="12" cy="12" r="5.5" stroke-width="1.5"/><path d="M12 9v6m-2-4.5h4" stroke-width="2"/></svg>`,
      otherCost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" fill-opacity="0.15"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/><path d="M17 14h4m-2-2v4" stroke-width="1.8"/></svg>`,
      deduction: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3.5" fill="currentColor" fill-opacity="0.1"/><line x1="7.5" y1="12" x2="16.5" y2="12" stroke-width="2.5"/><path d="M17 8.5l2-2" stroke-width="1.8"/></svg>`,
      totalCost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fill-opacity="0.08"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12" stroke-width="2"/><line x1="8" y1="16" x2="13" y2="16" stroke-width="2"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></svg>`,
      balance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3.5" fill="currentColor" fill-opacity="0.1"/><path d="M16 12.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0" fill="currentColor" fill-opacity="0.25"/><path d="M3 10h18" stroke-width="1.5"/><path d="M7 15h3" stroke-width="2"/></svg>`
    };

    container.innerHTML = `
      <!-- Desktop layout: 9 individual stat cards -->
      <div class="overview-desktop-stats">
        <div class="stat-card theme-deposit">
          <div class="stat-icon theme-deposit-icon">
            ${icons.deposit}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Deposit</div>
            <div class="stat-value">${Utils.tk(totalDeposit)}</div>
          </div>
        </div>

        <div class="stat-card theme-meals">
          <div class="stat-icon theme-meals-icon">
            ${icons.meals}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Meals</div>
            <div class="stat-value">${Utils.formatNumber(totalMeals)}</div>
          </div>
        </div>

        <div class="stat-card theme-meal-rate">
          <div class="stat-icon theme-meal-rate-icon">
            ${icons.mealRate}
          </div>
          <div class="stat-info">
            <div class="stat-label">Meal Rate</div>
            <div class="stat-value">${Utils.tk(mealRate)}</div>
          </div>
        </div>

        <div class="stat-card theme-bazar">
          <div class="stat-icon theme-bazar-icon">
            ${icons.bazar}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Bazar</div>
            <div class="stat-value">${Utils.tk(bazarCost)}</div>
          </div>
        </div>

        <div class="stat-card theme-meal-cost">
          <div class="stat-icon theme-meal-cost-icon">
            ${icons.mealCost}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Meal Cost</div>
            <div class="stat-value">${Utils.tk(totalMealCost)}</div>
          </div>
        </div>

        <div class="stat-card theme-other-cost">
          <div class="stat-icon theme-other-cost-icon">
            ${icons.otherCost}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Other Cost</div>
            <div class="stat-value">${Utils.tk(totalOtherCosting)}</div>
          </div>
        </div>

        <div class="stat-card theme-deduction">
          <div class="stat-icon theme-deduction-icon">
            ${icons.deduction}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Deduction</div>
            <div class="stat-value">${Utils.tk(totalDeductions)}</div>
          </div>
        </div>

        <div class="stat-card theme-total-cost">
          <div class="stat-icon theme-total-cost-icon">
            ${icons.totalCost}
          </div>
          <div class="stat-info">
            <div class="stat-label">Total Cost</div>
            <div class="stat-value">${Utils.tk(totalCost)}</div>
          </div>
        </div>

        <div class="stat-card theme-net-balance ${netBalance >= 0 ? 'net-positive' : 'net-negative'}">
          <div class="stat-icon theme-net-balance-icon">
            ${icons.balance}
          </div>
          <div class="stat-info">
            <div class="stat-label">Net Balance</div>
            <div class="stat-value ${netBalance >= 0 ? 'val-positive' : 'val-negative'}">${Utils.tk(netBalance)}</div>
          </div>
        </div>
      </div>

      <!-- Mobile layout: Dark Forest Green Hero Card matching User Panel Home -->
      <div class="overview-mobile-stats">
        <div class="mymeal-mobile-hero-wrapper" style="margin-bottom: 16px;">
          <div class="mymeal-ambient-circle circle-1"></div>
          <div class="mymeal-ambient-circle circle-2"></div>

          <!-- Dining Overview Mobile Topbar -->
          <div class="overview-mobile-topbar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 2px 2px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.35); display: flex; align-items: center; justify-content: center; color: #34d399; flex-shrink: 0;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="3" ry="3"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <span style="font-size: 0.95rem; font-weight: 700; color: #ffffff; letter-spacing: 0.01em;">Dining Overview</span>
              </div>
            </div>
          </div>

          <div class="mymeal-hero-card">
            <!-- Card Top Header -->
            <div class="mymeal-hero-top">
              <div class="mymeal-hero-badge-tag">
                <span class="mymeal-hero-tag-text">NET BALANCE</span>
              </div>
              <div class="overview-hero-selectors" style="display: flex; align-items: center; gap: 6px;">
                <div class="custom-dropdown" id="overviewMonthDropdownMob">
                  <button type="button" class="overview-hero-pill-btn" onclick="Messliner.overview.toggleMobileDropdown(event, 'overviewMonthDropdownMob')">
                    <span id="overviewMonthValueMob">${this.monthNames[this.selectedMonth - 1]}</span>
                    <svg width="7" height="6" viewBox="0 0 8 6" fill="currentColor" style="margin-left: 4px; opacity: 0.85; flex-shrink: 0;"><polygon points="0,0 8,0 4,6"/></svg>
                  </button>
                  <div class="custom-dropdown-menu" id="overviewMonthMenuMob" style="z-index: 100; min-width: 120px;"></div>
                </div>
                <div class="custom-dropdown" id="overviewYearDropdownMob">
                  <button type="button" class="overview-hero-pill-btn" onclick="Messliner.overview.toggleMobileDropdown(event, 'overviewYearDropdownMob')">
                    <span id="overviewYearValueMob">${this.selectedYear}</span>
                    <svg width="7" height="6" viewBox="0 0 8 6" fill="currentColor" style="margin-left: 4px; opacity: 0.85; flex-shrink: 0;"><polygon points="0,0 8,0 4,6"/></svg>
                  </button>
                  <div class="custom-dropdown-menu" id="overviewYearMenuMob" style="z-index: 100; min-width: 90px;"></div>
                </div>
              </div>
            </div>

            <!-- Main Hero Metric (Net Balance) -->
            <div class="mymeal-hero-main-stat">
              <div class="mymeal-hero-val-wrap ${netBalance < 0 ? 'is-negative' : ''}">
                <span class="mymeal-hero-currency">${netBalance < 0 ? '−' : ''}<span class="tk-symbol"></span></span>
                <span class="mymeal-hero-big-number">${Math.abs(netBalance).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <!-- Unified Stats Shelf (Metrics ending with Total Cost) -->
            <div class="mymeal-hero-stats-shelf">
              <div class="mymeal-shelf-row">
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Total Deposit</div>
                  <div class="mymeal-shelf-val">${Utils.tk(totalDeposit)}</div>
                </div>
                <div class="mymeal-shelf-divider"></div>
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Total Meals</div>
                  <div class="mymeal-shelf-val">${Utils.formatNumber(totalMeals)}</div>
                </div>
                <div class="mymeal-shelf-divider"></div>
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Total Bazar</div>
                  <div class="mymeal-shelf-val">${Utils.tk(bazarCost)}</div>
                </div>
              </div>
              <div class="mymeal-shelf-h-divider"></div>
              <div class="mymeal-shelf-row">
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Meal Rate</div>
                  <div class="mymeal-shelf-val"><span class="tk-symbol"></span>${(mealRate || 0).toFixed(2)}</div>
                </div>
                <div class="mymeal-shelf-divider"></div>
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Meal Cost</div>
                  <div class="mymeal-shelf-val">${Utils.tk(totalMealCost)}</div>
                </div>
                <div class="mymeal-shelf-divider"></div>
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Other Cost</div>
                  <div class="mymeal-shelf-val">${Utils.tk(totalOtherCosting)}</div>
                </div>
              </div>
              <div class="mymeal-shelf-h-divider"></div>
              <div class="mymeal-shelf-row">
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Deduction</div>
                  <div class="mymeal-shelf-val">${Utils.tk(totalDeductions)}</div>
                </div>
                <div class="mymeal-shelf-divider"></div>
                <div class="mymeal-shelf-col">
                  <div class="mymeal-shelf-label">Total Cost</div>
                  <div class="mymeal-shelf-val">${Utils.tk(totalCost)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Populate mobile dropdowns
    this.populateMonthDropdown();
    this.populateYearDropdown();
  },

  /**
   * Render member stats table
   */
  renderMemberStats(users, mealRate, fixedRates) {
    const tbody = document.getElementById('memberStatsBody');
    if (!tbody) return;

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const entries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !this.managerMealEnabled) {
        return false;
      }
      if (typeof MealsModule !== 'undefined' && MealsModule.isUserActiveForMonth) {
        return MealsModule.isUserActiveForMonth(id, formattedMonth);
      }
      return true;
    });
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6" style="color:var(--text-tertiary);">No active members for this month</td></tr>';
      return;
    }

    const uDeposits = {};
    const uOtherCosts = {};
    const uDeductions = {};

    Object.values(this.deposits || {}).forEach(d => {
      if (!d.userId) return;
      const amt = Math.abs(Utils.num(d.amount));
      if (d.type === 'deposit') {
        uDeposits[d.userId] = (uDeposits[d.userId] || 0) + amt;
      } else if (d.type === 'other_costing') {
        uOtherCosts[d.userId] = (uOtherCosts[d.userId] || 0) + amt;
      } else if (d.type === 'deduction' || d.type === 'friday_meal') {
        uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
      } else {
        uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
      }
    });

    tbody.innerHTML = entries.map(([id, u]) => {
      const uBreakdown = this.userMealsBreakdown[id] || { breakfast: 0, lunch: 0, dinner: 0 };
      const userMealsCount = (this.userTotalMeals && this.userTotalMeals[id] !== undefined) ? this.userTotalMeals[id] : 0;
      const mealCost = Utils.calcMealCost(mealRate, userMealsCount, uBreakdown, fixedRates);

      const deposit = uDeposits[id] || 0;
      const otherCost = uOtherCosts[id] || 0;
      const deduction = uDeductions[id] || 0;
      const balance = deposit - mealCost - otherCost - deduction;

      const statusBadge = balance >= 0
        ? `<span class="member-status-badge status-paid"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Paid</span>`
        : `<span class="member-status-badge status-due"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Due</span>`;

      const isSelected = id === this.selectedUserId ? 'selected' : '';

      return `
        <tr class="member-stat-row ${isSelected}" data-user-id="${id}" onclick="Messliner.overview.selectUser('${id}', this)">
          <td class="member-info-td">
            <div class="flex items-center gap-3">
              <div class="avatar avatar-sm avatar-tia">${Utils.initials(u.name)}</div>
              <div>
                <div class="member-name-text">${u.name}</div>
              </div>
            </div>
          </td>
          <td class="numeric-td meals-count-val">${userMealsCount}</td>
          <td class="numeric-td deposit-val">${Utils.tk(deposit)}</td>
          <td class="numeric-td meal-cost-val">${Utils.tk(mealCost)}</td>
          <td class="numeric-td balance-val ${balance >= 0 ? 'bal-positive' : 'bal-negative'}">${Utils.tk(balance)}</td>
          <td class="status-td">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Set selected user in overview and highlight row (toggle select / deselect on single click)
   */
  selectUser(id, el) {
    if (this.selectedUserId === id) {
      this.selectedUserId = null;
      document.querySelectorAll('#memberStatsTable .member-stat-row').forEach(r => r.classList.remove('selected'));
    } else {
      this.selectedUserId = id;
      document.querySelectorAll('#memberStatsTable .member-stat-row').forEach(r => r.classList.remove('selected'));
      if (el) {
        el.classList.add('selected');
      } else {
        const targetRow = document.querySelector(`#memberStatsTable .member-stat-row[data-user-id="${id}"]`);
        if (targetRow) targetRow.classList.add('selected');
      }
    }
  },


  /**
   * Render bazar history
   */
  renderBazarHistory(bazars) {
    if (!bazars && this.bazarData) bazars = this.bazarData;
    this.bazarData = bazars;

    if (window.HistoryPageModule) {
      if (!HistoryPageModule.rawBazarData && this.cachedData && this.cachedData.bazar) {
        HistoryPageModule.rawBazarData = this.cachedData.bazar;
      }
      HistoryPageModule.renderBazarForSelectedMonth();
    }

    const container = document.getElementById('bazarHistory');
    if (!container) return;

    const entries = Object.values(bazars || {}).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const html = entries.length === 0 ? `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
          </div>
          <h3>No Bazar Records</h3>
          <p>Bazar expenses will appear here.</p>
        </div>
    ` : entries.slice(0, 30).map(b => `
      <div class="timeline-item">
        <div class="timeline-dot warning"></div>
        <div class="timeline-content">
          <div class="timeline-date">${Utils.formatDate(b.date)} · ${Utils.timeAgo(b.timestamp)}</div>
          <div class="flex items-center justify-between" style="gap: var(--space-3);">
            <div style="min-width: 0; flex: 1;">
              <div class="timeline-title">${Utils.formatBazarItems(b.items)}</div>
              <div class="timeline-desc">By ${b.shopperName || 'N/A'}</div>
            </div>
            <div style="font-weight:var(--weight-bold);color:var(--warning-600);white-space:nowrap; flex-shrink: 0; text-align: right;">
              ${Utils.tk(b.amount)}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;
  },


  /**
   * Show Export Modal with Member Selection & Format Selection
   */
  exportSelectedYear: new Date().getFullYear(),
  exportSelectedMonth: new Date().getMonth() + 1,
  exportData: null,

  /**
   * Load and calculate stats for a specific month for the export modal
   */
  async loadExportDataForMonth(year, month) {
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);
    this.exportSelectedYear = y;
    this.exportSelectedMonth = m;

    const formattedMonth = `${y}-${String(m).padStart(2, '0')}`;

    try {
      const [usersSnap, depositsSnap, bazarSnap, mealsSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${this.diningId}/users`).once('value'),
        db.ref(`dinings/${this.diningId}/deposits`).once('value'),
        db.ref(`dinings/${this.diningId}/bazar`).once('value'),
        db.ref(`dinings/${this.diningId}/meals/${formattedMonth}`).once('value'),
        db.ref(`dinings/${this.diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const deposits = depositsSnap.val() || {};
      const bazars = bazarSnap.val() || {};
      const monthMeals = mealsSnap.val() || {};
      const settings = settingsSnap.val() || {};

      const managerMealEnabled = !!settings.managerMealEnabled;
      const rateMode = settings.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;

      const isSelectedMonth = (item) => {
        if (!item) return false;
        if (item.date && typeof item.date === 'string') {
          return item.date.startsWith(formattedMonth);
        }
        if (item.timestamp && typeof item.timestamp === 'number') {
          const dt = new Date(item.timestamp);
          const itemY = dt.getFullYear();
          const itemM = String(dt.getMonth() + 1).padStart(2, '0');
          return `${itemY}-${itemM}` === formattedMonth;
        }
        return false;
      };

      const uDeposits = {};
      const uOtherCosts = {};
      const uDeductions = {};
      let overallDeposit = 0;
      let overallDeductions = 0;
      let overallOtherCosting = 0;

      Object.values(deposits).forEach(d => {
        if (isSelectedMonth(d)) {
          if (d.type === 'deposit') overallDeposit += Utils.num(d.amount);
          else if (d.type === 'other_costing') overallOtherCosting += Math.abs(Utils.num(d.amount));
          else if (d.type === 'deduction' || d.type === 'friday_meal') overallDeductions += Math.abs(Utils.num(d.amount));
          else overallDeductions += Math.abs(Utils.num(d.amount));

          if (d.userId) {
            const amt = Math.abs(Utils.num(d.amount));
            if (d.type === 'deposit') uDeposits[d.userId] = (uDeposits[d.userId] || 0) + amt;
            else if (d.type === 'other_costing') uOtherCosts[d.userId] = (uOtherCosts[d.userId] || 0) + amt;
            else if (d.type === 'deduction' || d.type === 'friday_meal') uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
            else uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
          }
        }
      });

      let totalBazar = 0;
      Object.values(bazars).forEach(b => {
        if (isSelectedMonth(b)) {
          totalBazar += Utils.num(b.amount);
        }
      });

      let totalMeals = 0;
      const userMealsBreakdown = {};
      const userTotalMeals = {};

      Object.values(monthMeals).forEach(dayData => {
        Object.entries(dayData).forEach(([type, typeData]) => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, count]) => {
              const u = users[uId];
              if (u && u.role === 'admin' && !managerMealEnabled) {
                return;
              }
              const c = parseInt(count) || 0;
              totalMeals += c;
              if (!userMealsBreakdown[uId]) {
                userMealsBreakdown[uId] = { breakfast: 0, lunch: 0, dinner: 0 };
              }
              if (userMealsBreakdown[uId][type] !== undefined) {
                userMealsBreakdown[uId][type] += c;
              }
              userTotalMeals[uId] = (userTotalMeals[uId] || 0) + c;
            });
          }
        });
      });

      let mealRate = 0;
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        let fullMealRate = 0;
        if (trackedMeals.breakfast !== false) fullMealRate += (fixedRates.breakfast || 0);
        if (trackedMeals.lunch !== false) fullMealRate += (fixedRates.lunch || 0);
        if (trackedMeals.dinner !== false) fullMealRate += (fixedRates.dinner || 0);
        mealRate = fullMealRate;
      } else {
        mealRate = Utils.calcMealRate(totalBazar, totalMeals);
      }

      this.exportData = {
        year: y,
        month: m,
        formattedMonth,
        users,
        deposits: uDeposits,
        otherCosts: uOtherCosts,
        deductions: uDeductions,
        totalBazar,
        userMealsBreakdown,
        userTotalMeals,
        totalMeals,
        mealRate,
        fixedRates,
        rateMode,
        managerMealEnabled,
        overallDeposit,
        overallDeductions,
        overallOtherCosting,
        overallNetBalance: overallDeposit - (totalBazar + overallOtherCosting) - overallDeductions
      };
    } catch (err) {
      console.error('[Overview] loadExportDataForMonth error:', err);
    }
  },

  /**
   * Populate Year and Month dropdowns in Export Modal
   */
  populateExportMonthYearDropdowns() {
    const yearSelect = document.getElementById('exportYearSelect');
    const monthSelect = document.getElementById('exportMonthSelect');
    if (!yearSelect || !monthSelect) return;

    const startYear = this.createdDate ? this.createdDate.getFullYear() : 2026;
    const currentYear = new Date().getFullYear();

    let yearHTML = '';
    for (let y = startYear; y <= currentYear; y++) {
      const sel = y === this.exportSelectedYear ? 'selected' : '';
      yearHTML += `<option value="${y}" ${sel}>${y}</option>`;
    }
    yearSelect.innerHTML = yearHTML;

    let startMonth = 1;
    let endMonth = 12;

    if (this.exportSelectedYear === startYear && this.createdDate) {
      startMonth = this.createdDate.getMonth() + 1;
    }
    if (this.exportSelectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    if (this.exportSelectedMonth < startMonth) this.exportSelectedMonth = startMonth;
    if (this.exportSelectedMonth > endMonth) this.exportSelectedMonth = endMonth;

    let monthHTML = '';
    for (let m = startMonth; m <= endMonth; m++) {
      const sel = m === this.exportSelectedMonth ? 'selected' : '';
      monthHTML += `<option value="${m}" ${sel}>${this.monthNames[m - 1]}</option>`;
    }
    monthSelect.innerHTML = monthHTML;
  },

  /**
   * Handler when Month or Year dropdown changes in Export Page
   */
  async onExportMonthYearChange() {
    const yearSelect = document.getElementById('exportYearSelect');
    const monthSelect = document.getElementById('exportMonthSelect');
    if (!yearSelect || !monthSelect) return;

    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);

    this.exportSelectedYear = year;
    this.exportSelectedMonth = month;

    this.populateExportMonthYearDropdowns();

    // Update hero label
    const periodLabel = document.getElementById('exportPagePeriodLabel');
    if (periodLabel) {
      periodLabel.textContent = `${this.monthNames[month - 1]} ${year} — Financial Statement`;
    }

    const previewContainer = document.getElementById('exportSlipLivePreview');
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div style="padding:60px 20px;text-align:center;color:#64748b;">
          <div style="width:36px;height:36px;border:3px solid #059669;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-bottom:12px;"></div>
          <div style="font-weight:600;font-size:14px;color:#0f172a;">Loading ${this.monthNames[month - 1]} ${year}...</div>
        </div>
      `;
    }

    await this.loadExportDataForMonth(year, month);
    this.renderExportChecklist();
    this.renderExportPreview();
    this._updateExportPreviewStats();
  },

  /**
   * Render member selection checklist for export page
   */
  renderExportChecklist() {
    const checklist = document.getElementById('exportMembersChecklist');
    const selectAll = document.getElementById('exportSelectAllMembers');
    if (selectAll) selectAll.checked = true;

    const users = this.exportData?.users || Messliner.users?.users || {};
    const formattedMonth = this.exportData?.formattedMonth || `${this.exportSelectedYear}-${String(this.exportSelectedMonth).padStart(2, '0')}`;
    const managerMealEnabled = this.exportData?.managerMealEnabled ?? this.managerMealEnabled;

    const entries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !managerMealEnabled) return false;
      if (typeof MealsModule !== 'undefined' && MealsModule.isUserActiveForMonth) {
        return MealsModule.isUserActiveForMonth(id, formattedMonth);
      }
      return true;
    });

    if (entries.length === 0) {
      if (checklist) {
        checklist.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--text-tertiary);">No active members for this month</div>';
      }
      return;
    }

    if (checklist) {
      checklist.innerHTML = entries.map(([id, u]) => {
        const uBreakdown = (this.exportData?.userMealsBreakdown || {})[id] || { breakfast: 0, lunch: 0, dinner: 0 };
        const totalMeals = (this.exportData?.userTotalMeals || {})[id] || 0;
        const deposit = (this.exportData?.deposits || {})[id] || 0;
        const mealRate = this.exportData?.mealRate || 0;
        const fixedRates = this.exportData?.fixedRates || null;
        const mealCost = Utils.calcMealCost(mealRate, totalMeals, uBreakdown, fixedRates);
        const balance = deposit - mealCost - ((this.exportData?.otherCosts || {})[id] || 0) - ((this.exportData?.deductions || {})[id] || 0);
        const isPaid = balance >= 0;
        return `
          <label class="export-member-item" for="export_check_${id}">
            <div class="export-member-avatar" style="background:${UsersModule._avatarColor(u.name)};">
              ${Utils.initials(u.name)}
            </div>
            <div class="export-member-info">
              <div class="export-member-name">${u.name}</div>
              <div class="export-member-meta">${totalMeals} meals · <span style="color:${isPaid ? 'var(--primary-600)' : 'var(--danger-600)'}; font-weight:700;">${isPaid ? 'Paid' : 'Due'}</span></div>
            </div>
            <input type="checkbox" id="export_check_${id}" value="${id}" class="export-member-checkbox" checked onchange="Messliner.overview.renderExportPreview(); Messliner.overview._updateExportPreviewStats();">
          </label>
        `;
      }).join('');
    }
  },

  /**
   * Navigate to full Export Slip Page instead of opening modal
   */
  showExportPage() {
    this.exportSelectedYear = this.selectedYear || new Date().getFullYear();
    this.exportSelectedMonth = this.selectedMonth || (new Date().getMonth() + 1);
    Messliner.router.navigate('export-slip');
  },

  /**
   * Remove export-page-active class when leaving (called by router) — no-op now
   */
  _leaveExportPage() {
    // Fixed-position CSS handles layout; nothing to clean up
  },

  /**
   * Called by router when export-slip page becomes active
   */
  async initExportPage() {
    // Scroll the preview canvas to top on re-entry
    const previewCanvas = document.querySelector('.export-preview-canvas');
    if (previewCanvas) previewCanvas.scrollTop = 0;
    this.exportSelectedYear = this.exportSelectedYear || this.selectedYear || new Date().getFullYear();
    this.exportSelectedMonth = this.exportSelectedMonth || this.selectedMonth || (new Date().getMonth() + 1);

    // Update hero subtitle
    const periodLabel = document.getElementById('exportPagePeriodLabel');
    if (periodLabel) {
      periodLabel.textContent = `${this.monthNames[(this.exportSelectedMonth || 1) - 1]} ${this.exportSelectedYear} — Financial Statement`;
    }

    this.populateExportMonthYearDropdowns();

    // Show loading in preview
    const previewContainer = document.getElementById('exportSlipLivePreview');
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div style="padding:60px 20px;text-align:center;color:#64748b;">
          <div style="width:36px;height:36px;border:3px solid #059669;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;margin-bottom:12px;"></div>
          <div style="font-weight:600;font-size:14px;color:#0f172a;">Preparing statement preview...</div>
          <div style="font-size:12px;margin-top:4px;color:#64748b;">Loading ${this.monthNames[(this.exportSelectedMonth || 1) - 1]} ${this.exportSelectedYear} data</div>
        </div>
      `;
    }

    await this.loadExportDataForMonth(this.exportSelectedYear, this.exportSelectedMonth);
    this.renderExportChecklist();
    this.updateExportFormatUI();
    this.renderExportPreview();
    this._updateExportPreviewStats();
  },

  /**
   * Render live preview inside export modal
   */
  renderExportPreview() {
    const previewContainer = document.getElementById('exportSlipLivePreview');
    if (!previewContainer) return;

    const selectedCheckboxes = document.querySelectorAll('#exportMembersChecklist .export-member-checkbox:checked');
    const selectedUserIds = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedUserIds.length === 0) {
      previewContainer.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:#64748b;">
          <div style="font-size:24px;margin-bottom:6px;">⚠️</div>
          <div style="font-weight:700;font-size:14px;color:#1e293b;">No Members Selected</div>
          <div style="font-size:12px;margin-top:2px;">Please check at least one member above to generate preview statement.</div>
        </div>
      `;
      return;
    }

    previewContainer.innerHTML = this._buildCorporateSlipHTML(selectedUserIds);
  },

  /**
   * Toggle select all members in export checklist
   */
  toggleSelectAllExportMembers(source) {
    const checkboxes = document.querySelectorAll('#exportMembersChecklist .export-member-checkbox');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
    this.renderExportPreview();
    this._updateExportPreviewStats();
  },
  /**
   * Highlight active export format card and update download button label
   */
  updateExportFormatUI() {
    const selectedFormat = document.querySelector('input[name="exportFormat"]:checked')?.value || 'jpg';
    const formatLabels = { jpg: 'as JPG Image', pdf: 'as PDF Document' };
    const formatSubEl = document.getElementById('exportDownloadFormatLabel');
    if (formatSubEl) formatSubEl.textContent = formatLabels[selectedFormat] || 'as JPG Image';

    ['jpg', 'pdf'].forEach(fmt => {
      const label = document.getElementById(`exportFormatLabel${fmt.charAt(0).toUpperCase() + fmt.slice(1)}`);
      if (label) {
        const isActive = fmt === selectedFormat;
        label.classList.toggle('export-format-card--active', isActive);
      }
    });
  },

  /**
   * Generate & Download Corporate Member Statistics Slip (JPG or PDF)
   */
  async downloadMemberStatsSlip() {
    const selectedCheckboxes = document.querySelectorAll('#exportMembersChecklist .export-member-checkbox:checked');
    const selectedUserIds = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedUserIds.length === 0) {
      Notifications.toast('warning', 'Selection Required', 'Please select at least one member to include in the statement.');
      return;
    }

    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'jpg';
    const btn = document.getElementById('btnDownloadMemberSlip');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <div class="export-download-btn-icon">
          <span style="width:20px;height:20px;border:2px solid rgba(255,255,255,0.5);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite;"></span>
        </div>
        <div class="export-download-btn-text">
          <span class="export-download-btn-label">Generating...</span>
          <span class="export-download-btn-sub">Please wait</span>
        </div>
      `;
    }

    try {
      const slipHTML = this._buildCorporateSlipHTML(selectedUserIds);

      // Render HTML into temporary off-screen DOM element for html2canvas
      const container = document.createElement('div');
      container.id = 'corporateSlipExportContainer';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '-9999px';
      container.style.width = '820px';
      container.style.background = '#ffffff';
      container.style.zIndex = '-9999';
      container.innerHTML = slipHTML;
      document.body.appendChild(container);

      // Give images/fonts time to calculate layout
      await new Promise(res => setTimeout(res, 300));

      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: 820
      });

      document.body.removeChild(container);

      const diningName = (document.getElementById('sidebarDiningName')?.textContent || 'Mess').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const monthNameStr = (this.monthNames[(this.exportSelectedMonth || 1) - 1] || '').toLowerCase();
      const fileName = `${diningName}_member_statement_${monthNameStr}_${this.exportSelectedYear || new Date().getFullYear()}`;

      if (format === 'jpg') {
        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `${fileName}.jpg`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          Notifications.toast('success', 'Downloaded', 'Statement exported as JPG image.');
        }, 'image/jpeg', 0.95);
      } else if (format === 'pdf') {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          throw new Error('jsPDF library not loaded properly.');
        }
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${fileName}.pdf`);
        Notifications.toast('success', 'Downloaded', 'Statement exported as PDF document.');
      }

    } catch (err) {
      console.error('[Overview] Export slip error:', err);
      Notifications.toast('error', 'Export Failed', 'Failed to generate statement. Please try again.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    }
  },

  /**
   * Update the live preview stats bar (member count, total balance)
   */
  _updateExportPreviewStats() {
    const statsEl = document.getElementById('exportPreviewStats');
    if (!statsEl) return;
    const checkboxes = document.querySelectorAll('#exportMembersChecklist .export-member-checkbox:checked');
    const count = checkboxes.length;
    const data = this.exportData || {};
    const users = data.users || Messliner.users?.users || {};
    const managerMealEnabled = data.managerMealEnabled ?? this.managerMealEnabled;
    const formattedMonth = data.formattedMonth || `${data.year || this.exportSelectedYear}-${String(data.month || this.exportSelectedMonth || 1).padStart(2, '0')}`;

    const activeUserCount = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !managerMealEnabled) return false;
      if (typeof MealsModule !== 'undefined' && MealsModule.isUserActiveForMonth) {
        return MealsModule.isUserActiveForMonth(id, formattedMonth);
      }
      return true;
    }).length;

    const isAllSelected = count === activeUserCount;
    const mealRate = data.mealRate || 0;
    const fixedRates = data.fixedRates || null;

    let totalBalance = 0;
    if (isAllSelected && data.overallNetBalance !== undefined) {
      totalBalance = data.overallNetBalance;
    } else {
      Array.from(checkboxes).forEach(cb => {
        const id = cb.value;
        const uBreakdown = (data.userMealsBreakdown || {})[id] || { breakfast: 0, lunch: 0, dinner: 0 };
        const totalMeals = (data.userTotalMeals || {})[id] || 0;
        const deposit = (data.deposits || {})[id] || 0;
        const mealCost = Utils.calcMealCost(mealRate, totalMeals, uBreakdown, fixedRates);
        const otherCost = (data.otherCosts || {})[id] || 0;
        const deduction = (data.deductions || {})[id] || 0;
        totalBalance += deposit - mealCost - otherCost - deduction;
      });
    }

    const isPosBalance = totalBalance >= 0;
    statsEl.innerHTML = `
      <span class="export-preview-stat">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${count} member${count !== 1 ? 's' : ''}
      </span>
      <span class="export-preview-stat ${isPosBalance ? 'export-preview-stat--positive' : 'export-preview-stat--negative'}">
        ${isPosBalance ? '▲' : '▼'} ${Utils.currency(Math.abs(totalBalance))} net
      </span>
    `;
  },

  /**
   * Build Executive Corporate Financial Statement HTML
   */
  _buildCorporateSlipHTML(selectedUserIds) {
    const data = this.exportData || {};
    const users = data.users || Messliner.users?.users || {};
    const diningName = document.getElementById('sidebarDiningName')?.textContent || 'Messliner Enterprise';

    const monthName = this.monthNames[(data.month || this.exportSelectedMonth || 1) - 1];
    const year = data.year || this.exportSelectedYear || new Date().getFullYear();
    const statementPeriod = `${monthName.toUpperCase()} ${year}`;

    const mealRate = data.mealRate || 0;
    const rateMode = data.rateMode || 'market';
    const fixedRates = data.fixedRates || null;

    const uDeposits = data.deposits || {};
    const uOtherCosts = data.otherCosts || {};
    const uDeductions = data.deductions || {};
    const uBreakdowns = data.userMealsBreakdown || {};
    const uMeals = data.userTotalMeals || {};
    const managerMealEnabled = data.managerMealEnabled ?? this.managerMealEnabled;
    const formattedMonth = data.formattedMonth || `${year}-${String(data.month || this.exportSelectedMonth || 1).padStart(2, '0')}`;

    let totalSelectedDeposit = 0;
    let totalSelectedMeals = 0;
    let totalSelectedMealCost = 0;
    let totalSelectedOtherCosts = 0;
    let totalSelectedBalance = 0;

    const tableRows = selectedUserIds.map((id, index) => {
      const u = users[id] || { name: 'Member' };
      const uBreakdown = uBreakdowns[id] || { breakfast: 0, lunch: 0, dinner: 0 };
      const totalMeals = uMeals[id] || 0;
      const mealCost = Utils.calcMealCost(mealRate, totalMeals, uBreakdown, fixedRates);

      const deposit = uDeposits[id] || 0;
      const otherCost = uOtherCosts[id] || 0;
      const deduction = uDeductions[id] || 0;
      const balance = deposit - mealCost - otherCost - deduction;

      totalSelectedDeposit += deposit;
      totalSelectedMeals += totalMeals;
      totalSelectedMealCost += mealCost;
      totalSelectedOtherCosts += (otherCost + deduction);
      totalSelectedBalance += balance;

      const isPaid = balance >= 0;
      const statusBadge = isPaid
        ? `<span style="color:#059669;font-weight:800;font-size:12px;letter-spacing:0.3px;">Paid</span>`
        : `<span style="color:#dc2626;font-weight:800;font-size:12px;letter-spacing:0.3px;">Due</span>`;

      return `
        <tr style="border-bottom:1px solid #e2e8f0;${index % 2 === 1 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
          <td style="padding:10px 12px;font-size:12px;color:#64748b;text-align:center;font-weight:600;vertical-align:middle;">${index + 1}</td>
          <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#0f172a;vertical-align:middle;">${u.name}</td>
          <td style="padding:10px 12px;font-size:13px;color:#334155;text-align:center;font-weight:600;vertical-align:middle;">${totalMeals}</td>
          <td style="padding:10px 12px;font-size:13px;color:#059669;text-align:right;font-weight:700;vertical-align:middle;">${Utils.currency(deposit)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#d97706;text-align:right;font-weight:600;vertical-align:middle;">${Utils.currency(mealCost)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#64748b;text-align:right;font-weight:600;vertical-align:middle;">${Utils.currency(otherCost + deduction)}</td>
          <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:800;color:${balance >= 0 ? '#059669' : '#dc2626'};vertical-align:middle;">${Utils.currency(balance)}</td>
          <td style="padding:10px 12px;text-align:center;vertical-align:middle;">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    const activeUserCount = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !managerMealEnabled) return false;
      if (typeof MealsModule !== 'undefined' && MealsModule.isUserActiveForMonth) {
        return MealsModule.isUserActiveForMonth(id, formattedMonth);
      }
      return true;
    }).length;

    const isAllSelected = selectedUserIds.length === activeUserCount;

    const displayDeposit = isAllSelected ? (data.overallDeposit ?? totalSelectedDeposit) : totalSelectedDeposit;
    const displayMeals = isAllSelected ? (data.totalMeals ?? totalSelectedMeals) : totalSelectedMeals;
    const displayMealCost = isAllSelected ? (data.totalBazar ?? totalSelectedMealCost) : totalSelectedMealCost;
    const displayOtherCost = isAllSelected ? ((data.overallOtherCosting ?? 0) + (data.overallDeductions ?? 0)) : totalSelectedOtherCosts;
    const displayNetBalance = isAllSelected ? (data.overallNetBalance ?? totalSelectedBalance) : totalSelectedBalance;

    return `
      <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;color:#0f172a;background:#ffffff;padding:32px 36px;max-width:820px;margin:0 auto;box-sizing:border-box;">
        
        <!-- Corporate Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:20px;">
          <div>
            <div style="margin-bottom:4px;">
              <h1 style="margin:0;font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#0f172a;text-transform:uppercase;">${diningName}</h1>
            </div>
            <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.5px;">FINANCIAL & MEAL STATISTICS STATEMENT — ${statementPeriod}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;color:#0f172a;font-weight:700;">Date: ${Utils.formatDate(Utils.today())}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Period: ${statementPeriod}</div>
          </div>
        </div>

        <!-- Executive Summary Cards -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:12px;margin-bottom:20px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">${isAllSelected ? 'Total Deposits' : 'Total Selected Deposits'}</div>
            <div style="font-size:16px;font-weight:800;color:#059669;">${Utils.currency(displayDeposit)}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">${isAllSelected ? 'Total Meals' : 'Total Selected Meals'}</div>
            <div style="font-size:16px;font-weight:800;color:#2563eb;">${displayMeals}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Monthly Meal Rate</div>
            <div style="font-size:16px;font-weight:800;color:#d97706;">${Utils.currency(mealRate)}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Net Balance</div>
            <div style="font-size:16px;font-weight:800;color:${displayNetBalance >= 0 ? '#059669' : '#dc2626'};">${Utils.currency(displayNetBalance)}</div>
          </div>
        </div>

        <!-- Statement Table -->
        <div style="margin-bottom:12px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#0f172a;color:#ffffff;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                <th style="padding:10px 12px;text-align:center;width:40px;vertical-align:middle;">SL#</th>
                <th style="padding:10px 12px;text-align:left;vertical-align:middle;">Member Name</th>
                <th style="padding:10px 12px;text-align:center;vertical-align:middle;">Meals</th>
                <th style="padding:10px 12px;text-align:right;vertical-align:middle;">Deposit</th>
                <th style="padding:10px 12px;text-align:right;vertical-align:middle;">Meal Cost</th>
                <th style="padding:10px 12px;text-align:right;vertical-align:middle;">Other Cost</th>
                <th style="padding:10px 12px;text-align:right;vertical-align:middle;">Net Balance</th>
                <th style="padding:10px 12px;text-align:center;vertical-align:middle;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="background:#f1f5f9;border-top:2px solid #0f172a;font-weight:800;font-size:13px;">
                <td colspan="2" style="padding:12px;color:#0f172a;text-transform:uppercase;vertical-align:middle;">Grand Total Summary</td>
                <td style="padding:12px;text-align:center;color:#2563eb;vertical-align:middle;">${displayMeals}</td>
                <td style="padding:12px;text-align:right;color:#059669;vertical-align:middle;">${Utils.currency(displayDeposit)}</td>
                <td style="padding:12px;text-align:right;color:#d97706;vertical-align:middle;">${Utils.currency(displayMealCost)}</td>
                <td style="padding:12px;text-align:right;color:#64748b;vertical-align:middle;">${Utils.currency(displayOtherCost)}</td>
                <td style="padding:12px;text-align:right;color:${displayNetBalance >= 0 ? '#059669' : '#dc2626'};vertical-align:middle;">${Utils.currency(displayNetBalance)}</td>
                <td style="padding:12px;text-align:center;font-size:11px;color:#475569;vertical-align:middle;">—</td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    `;
  }
};

console.log('[Messliner] Overview module loaded');
