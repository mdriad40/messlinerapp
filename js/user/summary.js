/* ============================================
   Messliner — Monthly Summary Module (user/summary.js)
   ============================================ */

const SummaryModule = {
  diningId: null,
  userId: null,
  createdDate: new Date(),
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  monthNames: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ],

  /**
   * Initialize Summary Module
   */
  init(diningId, userId) {
    this.diningId = diningId;
    this.userId = userId;

    // Fetch start date/creation date
    Promise.all([
      db.ref(`dinings/${diningId}/settings/historyStartDate`).once('value'),
      db.ref(`dinings/${diningId}/info/createdAt`).once('value')
    ]).then(([startSnap, infoSnap]) => {
      const startDateStr = startSnap.val();
      if (startDateStr) {
        this.createdDate = new Date(startDateStr);
      } else {
        const val = infoSnap.val();
        if (val) {
          this.createdDate = new Date(val);
        } else {
          this.createdDate = new Date();
        }
      }
      this.populateYearDropdown();
      this.populateMonthDropdown();
      this.loadMonthData();
    }).catch(e => {
      console.error('[SummaryModule] Fetch start date error, falling back:', e);
      this.populateYearDropdown();
      this.populateMonthDropdown();
      this.loadMonthData();
    });
  },

  /**
   * Populate Year dropdown
   */
  populateYearDropdown() {
    const valueEl = document.getElementById('summaryYearValue');
    const menuEl = document.getElementById('summaryYearMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate.getFullYear();
    const endYear = new Date().getFullYear();

    let itemsHTML = '';
    for (let y = startYear; y <= endYear; y++) {
      const isSelected = y === this.selectedYear;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${y}" 
             onclick="Messliner.summary.selectYear(${y})">
          ${y}
        </div>
      `;
    }
    menuEl.innerHTML = itemsHTML;
    valueEl.textContent = this.selectedYear;
  },

  /**
   * Action when a Year item is clicked
   */
  selectYear(year) {
    this.selectedYear = year;
    const dropdown = document.getElementById('summaryYearDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateYearDropdown();
    this.onYearChange();
  },

  /**
   * Populate Month dropdown
   */
  populateMonthDropdown() {
    const valueEl = document.getElementById('summaryMonthValue');
    const menuEl = document.getElementById('summaryMonthMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate.getFullYear();
    const currentYear = new Date().getFullYear();

    let startMonth = 1;
    let endMonth = 12;

    if (this.selectedYear === startYear) {
      startMonth = this.createdDate.getMonth() + 1;
    }
    if (this.selectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    if (this.selectedMonth < startMonth) {
      this.selectedMonth = startMonth;
    } else if (this.selectedMonth > endMonth) {
      this.selectedMonth = endMonth;
    }

    let itemsHTML = '';
    for (let m = startMonth; m <= endMonth; m++) {
      const isSelected = m === this.selectedMonth;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${m}" 
             onclick="Messliner.summary.selectMonth(${m})">
          ${this.monthNames[m - 1]}
        </div>
      `;
    }
    menuEl.innerHTML = itemsHTML;
    valueEl.textContent = this.monthNames[this.selectedMonth - 1];
  },

  /**
   * Action when a Month item is clicked
   */
  selectMonth(month) {
    this.selectedMonth = month;
    const dropdown = document.getElementById('summaryMonthDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateMonthDropdown();
    this.loadMonthData();
  },

  /**
   * Actions on year change
   */
  onYearChange() {
    this.populateMonthDropdown();
    this.loadMonthData();
  },

  /**
   * Fetch all records and calculate summary details
   */
  async loadMonthData() {
    const listEl = document.getElementById('summaryList');
    const rateValEl = document.getElementById('summaryMealRate');
    const rateLblEl = document.getElementById('summaryMonthLabel');

    if (!listEl) return;

    // Show skeleton loader
    listEl.innerHTML = `
      <div class="bazar-skeleton" style="grid-column: 1 / -1;">
        <div class="bazar-skeleton-card" style="height:150px; margin-bottom:15px;"></div>
        <div class="bazar-skeleton-card" style="height:150px; margin-bottom:15px;"></div>
      </div>
    `;

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;

    if (rateLblEl) {
      rateLblEl.textContent = `${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}`;
    }

    try {
      // Fetch snapshots
      const [usersSnap, mealsSnap, bazarSnap, depositsSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${this.diningId}/users`).once('value'),
        db.ref(`dinings/${this.diningId}/meals/${formattedMonth}`).once('value'),
        db.ref(`dinings/${this.diningId}/bazar`).once('value'),
        db.ref(`dinings/${this.diningId}/deposits`).once('value'),
        db.ref(`dinings/${this.diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const meals = mealsSnap.val() || {};
      const allBazar = bazarSnap.val() || {};
      const allDeposits = depositsSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const isManagerMealEnabled = !!settings.managerMealEnabled;

      // 1. Calculate Monthly Bazar Total
      let monthBazarTotal = 0;
      Object.values(allBazar).forEach(entry => {
        if (entry.date && entry.date.startsWith(formattedMonth)) {
          monthBazarTotal += parseFloat(entry.amount) || 0;
        }
      });

      // 2. Count Monthly Meals by User
      const userMeals = {};
      const userMealsBreakdown = {};
      let totalMeals = 0;

      // Group meals: meals snapshot has format { "day": { "type": { "userId": count } } }
      Object.entries(meals).forEach(([day, dayData]) => {
        Object.entries(dayData).forEach(([type, typeData]) => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, count]) => {
              const u = users[uId];
              if (u && u.role === 'admin' && !isManagerMealEnabled) {
                return; // Skip manager meals
              }
              const mealCount = parseFloat(count) || 0;
              userMeals[uId] = (userMeals[uId] || 0) + mealCount;
              totalMeals += mealCount;
              
              if (!userMealsBreakdown[uId]) {
                userMealsBreakdown[uId] = { breakfast: 0, lunch: 0, dinner: 0 };
              }
              if (userMealsBreakdown[uId][type] !== undefined) {
                userMealsBreakdown[uId][type] += mealCount;
              }
            });
          }
        });
      });

      // 3. Compute Monthly Meal Rate
      const rateMode = settings.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
      let mealRate = 0;
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        const activeRates = [];
        if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
        if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
        if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);
        mealRate = activeRates.length > 0 ? (activeRates.reduce((a,b) => a+b, 0) / activeRates.length) : 0;
      } else {
        mealRate = totalMeals > 0 ? (monthBazarTotal / totalMeals) : 0;
      }

      if (rateValEl) {
        rateValEl.textContent = Utils.currency(mealRate);
      }

      // 4. Calculate deposits, other costing, and deductions for this month
      const userDeposits = {};
      const userOtherCosts = {};
      const userDeductions = {};

      Object.values(allDeposits).forEach(d => {
        if (!d.userId || !d.date || !d.date.startsWith(formattedMonth)) return;

        const amount = Math.abs(parseFloat(d.amount) || 0);
        if (d.type === 'deposit') {
          userDeposits[d.userId] = (userDeposits[d.userId] || 0) + amount;
        } else if (d.type === 'other_costing') {
          userOtherCosts[d.userId] = (userOtherCosts[d.userId] || 0) + amount;
        } else if (d.type === 'deduction' || d.type === 'friday_meal') {
          userDeductions[d.userId] = (userDeductions[d.userId] || 0) + amount;
        }
      });

      // Filter members to display
      const userEntries = Object.entries(users).filter(([id, u]) => {
        if (u.role === 'admin') {
          return isManagerMealEnabled;
        }
        return true;
      });

      if (userEntries.length === 0) {
        listEl.innerHTML = `
          <div class="bazar-empty-state" style="grid-column: 1 / -1;">
            <div class="bazar-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
            </div>
            <h3>No Members</h3>
            <p>No active members to display in summary.</p>
          </div>
        `;
        return;
      }

      // Render cards
      listEl.innerHTML = userEntries.map(([id, u]) => {
        const uMeals    = userMeals[id] || 0;
        const uMealsBreakdown = userMealsBreakdown[id] || { breakfast: 0, lunch: 0, dinner: 0 };
        const uMealCost = Utils.calcMealCost(mealRate, uMeals, uMealsBreakdown, fixedRates);
        const uDeposit  = userDeposits[id] || 0;   // this month's deposits only
        const uOtherCost = userOtherCosts[id] || 0;
        const uDeduction = userDeductions[id] || 0;
        const uTotalCost = uMealCost + uOtherCost;
        const uBalance   = uDeposit - uTotalCost - uDeduction;   // this month balance
        const isPositive = uBalance >= 0;

        return `
          <div class="sc fade-up">
            <!-- Card Header -->
            <div class="sc-header">
              <div class="sc-name-wrap">
                <div class="sc-name">${u.name}</div>
                <div class="sc-badge ${isPositive ? 'sc-badge-ok' : 'sc-badge-due'}">${isPositive ? 'Settled' : 'Due'}</div>
              </div>
            </div>
            <!-- Stat rows -->
            <div class="sc-body">
              <div class="sc-row">
                <div class="sc-cell">
                  <div class="sc-cell-label">Meals</div>
                  <div class="sc-cell-value">${uMeals.toFixed(1)}</div>
                </div>
                <div class="sc-cell">
                  <div class="sc-cell-label">Meal Cost</div>
                  <div class="sc-cell-value">${Utils.currency(uMealCost)}</div>
                </div>
                <div class="sc-cell">
                  <div class="sc-cell-label">Deposit</div>
                  <div class="sc-cell-value sc-deposit">${Utils.currency(uDeposit)}</div>
                </div>
              </div>
              <div class="sc-row sc-row-alt">
                <div class="sc-cell">
                  <div class="sc-cell-label">Other Cost</div>
                  <div class="sc-cell-value">${Utils.currency(uOtherCost)}</div>
                </div>
                <div class="sc-cell">
                  <div class="sc-cell-label">Deduction</div>
                  <div class="sc-cell-value" style="color:var(--danger-600);">${Utils.currency(uDeduction)}</div>
                </div>
                <div class="sc-cell">
                  <div class="sc-cell-label" style="font-weight:var(--weight-bold);">Balance</div>
                  <div class="sc-cell-value ${isPositive ? 'sc-positive' : 'sc-negative'}" style="font-weight:var(--weight-bold);">${Utils.currency(uBalance)}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (e) {
      console.error('[SummaryModule] Load month data error:', e);
      listEl.innerHTML = `
        <div class="bazar-empty-state" style="grid-column: 1 / -1;">
          <h3>Error</h3>
          <p>Failed to load monthly summary data.</p>
        </div>
      `;
    }
  },

  /**
   * Refresh module
   */
  refresh() {
    this.loadMonthData();
  }
};

window.SummaryModule = SummaryModule;
