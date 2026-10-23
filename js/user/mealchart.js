/* ============================================
   Messliner — Meal Chart Module (user/mealchart.js)
   ============================================ */

const MealChartModule = {
  diningId: null,
  userId: null,
  createdDate: null, // Date object of account creation
  selectedYear: 2026,
  selectedMonth: 7,  // 1-12
  selectedDay: 6,    // 1-31
  mealsData: {},

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  readyPromise: null,
  _resolveReady: null,

  /**
   * Initialize Meal Chart
   */
  async init(diningId, userId) {
    this.diningId = diningId;
    this.userId = userId;

    if (!this.readyPromise) {
      this.readyPromise = new Promise(res => { this._resolveReady = res; });
    }

    // Set default selected date to today (present date)
    const now = new Date();
    this.selectedYear = now.getFullYear();
    this.selectedMonth = now.getMonth() + 1;
    this.selectedDay = now.getDate();
    this.createdDate = this.createdDate || new Date(2026, 0, 1);

    // Immediately populate dropdowns synchronously so dates are fixed with zero loading delay
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.populateDayDropdown();

    try {
      // Fetch history start date or dining creation date
      const startRef = await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value');
      let startDateStr = startRef.val();
      if (startDateStr) {
        this.createdDate = new Date(startDateStr);
      } else {
        const infoSnap = await db.ref(`dinings/${this.diningId}/info/createdAt`).once('value');
        const createdAt = infoSnap.val();
        if (createdAt) {
          this.createdDate = new Date(createdAt);
        } else {
          // Fallback to Jan 1, 2026
          this.createdDate = new Date(2026, 0, 1);
        }
      }
    } catch (e) {
      console.error('[MealChartModule] Fetch start date error, falling back:', e);
      this.createdDate = new Date(2026, 0, 1);
    }

    // Populate dropdowns initially and load details
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.populateDayDropdown();
    await this.loadMonthData();
  },

  /**
   * Populate Year dropdown starting from creation year to current year
   */
  populateYearDropdown() {
    const valueEl = document.getElementById('mealChartYearValue');
    const menuEl = document.getElementById('mealChartYearMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate.getFullYear();
    const endYear = new Date().getFullYear();

    let itemsHTML = '';
    for (let y = startYear; y <= endYear; y++) {
      const isSelected = y === this.selectedYear;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${y}" 
             onclick="Messliner.mealChart.selectYear(${y})">
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
    const dropdown = document.getElementById('mealChartYearDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateYearDropdown();
    this.onYearChange();
  },

  /**
   * Populate Month dropdown dynamically based on selected year
   */
  populateMonthDropdown() {
    const valueEl = document.getElementById('mealChartMonthValue');
    const menuEl = document.getElementById('mealChartMonthMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate.getFullYear();
    const currentYear = new Date().getFullYear();

    let startMonth = 1;
    let endMonth = 12;

    // If selected year is creation year, restrict starting month
    if (this.selectedYear === startYear) {
      startMonth = this.createdDate.getMonth() + 1;
    }
    // If selected year is current year, restrict ending month to current month
    if (this.selectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    // Handle selected month bounds
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
             onclick="Messliner.mealChart.selectMonth(${m})">
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
    const dropdown = document.getElementById('mealChartMonthDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateMonthDropdown();
    this.onMonthChange();
  },

  /**
   * Populate Day dropdown dynamically based on selected year and month
   */
  populateDayDropdown() {
    const valueEl = document.getElementById('mealChartDayValue');
    const menuEl = document.getElementById('mealChartDayMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate.getFullYear();
    const startMonth = this.createdDate.getMonth() + 1;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    let startDay = 1;
    let endDay = new Date(this.selectedYear, this.selectedMonth, 0).getDate();

    // Restrict starting day if selected year & month is creation date
    if (this.selectedYear === startYear && this.selectedMonth === startMonth) {
      startDay = this.createdDate.getDate();
    }
    // Restrict ending day if selected year & month is today's date
    if (this.selectedYear === currentYear && this.selectedMonth === currentMonth) {
      endDay = new Date().getDate();
    }

    // Handle selected day bounds
    if (this.selectedDay < startDay) {
      this.selectedDay = startDay;
    } else if (this.selectedDay > endDay) {
      this.selectedDay = endDay;
    }

    let itemsHTML = '';
    for (let d = startDay; d <= endDay; d++) {
      const dayStr = String(d).padStart(2, '0');
      const isSelected = d === this.selectedDay;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${d}" 
             onclick="Messliner.mealChart.selectDay(${d})">
          ${dayStr}
        </div>
      `;
    }
    menuEl.innerHTML = itemsHTML;
    valueEl.textContent = String(this.selectedDay).padStart(2, '0');
  },

  /**
   * Action when a Day item is clicked
   */
  selectDay(day) {
    this.selectedDay = day;
    const dropdown = document.getElementById('mealChartDayDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.loadDayMeals();
  },

  /**
   * Actions on year change
   */
  onYearChange() {
    this.populateMonthDropdown();
    this.populateDayDropdown();
    this.loadMonthData();
  },

  /**
   * Actions on month change
   */
  onMonthChange() {
    this.populateDayDropdown();
    this.loadMonthData();
  },

  /**
   * Render shimmer skeleton for meal chart table
   */
  renderSkeleton() {
    // Kept clean so the main Shimmer Effect handles the preloading without double-flicker
  },

  /**
   * Load entire month's data and update daily breakdown
   */
  async loadMonthData() {
    if (!this.diningId && window.Messliner && Messliner.state) {
      this.diningId = Messliner.state.diningId;
    }
    if (!this.diningId) return;

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;

    try {
      const snap = await db.ref(`dinings/${this.diningId}/meals/${formattedMonth}`).once('value');
      this.mealsData = snap.val() || {};
      this._dataLoaded = true;
      await this.renderDailyDetails();
    } catch (e) {
      console.error('[MealChartModule] Load month data error:', e);
      if (this._resolveReady) { this._resolveReady(); this._resolveReady = null; }
    }
  },

  /**
   * Just load details for selected day and refresh day dropdown text
   */
  loadDayMeals() {
    this.populateDayDropdown();
    this.renderDailyDetails();
  },

  /**
   * Render daily logs table
   */
  async renderDailyDetails() {
    const tbody = document.getElementById('mealChartDetailsBody');
    if (!tbody) return;

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const formattedDay = String(this.selectedDay).padStart(2, '0');
    const formattedDate = `${formattedMonth}-${formattedDay}`;

    const detailsDate = document.getElementById('mealChartDetailsDate');
    if (detailsDate) {
      detailsDate.textContent = Utils.formatDate(formattedDate);
    }

    try {
      // Fetch users and settings
      const [usersSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${this.diningId}/users`).once('value'),
        db.ref(`dinings/${this.diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const isManagerMealEnabled = !!settings.managerMealEnabled;
      const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };

      let colCount = 1;
      if (trackedMeals.breakfast !== false) colCount++;
      if (trackedMeals.lunch !== false) colCount++;
      if (trackedMeals.dinner !== false) colCount++;

      // Update table headers dynamically
      const tableEl = document.querySelector('.meal-chart-table');
      if (tableEl) {
        const thead = tableEl.querySelector('thead');
        if (thead) {
          let headersHTML = '<tr><th>Member</th>';
          if (trackedMeals.breakfast !== false) headersHTML += '<th class="text-center" style="width: 120px;">Breakfast</th>';
          if (trackedMeals.lunch !== false) headersHTML += '<th class="text-center" style="width: 120px;">Lunch</th>';
          if (trackedMeals.dinner !== false) headersHTML += '<th class="text-center" style="width: 120px;">Dinner</th>';
          headersHTML += '</tr>';
          thead.innerHTML = headersHTML;
        }
      }

      const userEntries = Object.entries(users).filter(([id, user]) => {
        if (user.role === 'admin') {
          return isManagerMealEnabled;
        }
        return true;
      });

      if (userEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-6" style="color:var(--text-tertiary);">No members in dining.</td></tr>`;
        return;
      }

      const dayMeals = this.mealsData[formattedDay] || {};
      const breakfast = dayMeals.breakfast || {};
      const lunch = dayMeals.lunch || {};
      const dinner = dayMeals.dinner || {};

      // Filter only members who had at least one meal on this day (exclude members with 0 meals)
      const activeEntries = userEntries.filter(([id]) => {
        const b = trackedMeals.breakfast !== false ? (parseFloat(breakfast[id]) || 0) : 0;
        const l = trackedMeals.lunch !== false ? (parseFloat(lunch[id]) || 0) : 0;
        const d = trackedMeals.dinner !== false ? (parseFloat(dinner[id]) || 0) : 0;
        return (b + l + d) > 0;
      });

      if (activeEntries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-6" style="color:var(--text-tertiary);">No meals recorded for this date.</td></tr>`;
        return;
      }

      tbody.innerHTML = activeEntries.map(([id, u]) => {
        const bCount = parseFloat(breakfast[id]) || 0;
        const lCount = parseFloat(lunch[id]) || 0;
        const dCount = parseFloat(dinner[id]) || 0;

        const bBadge = bCount > 0
          ? `<span class="meal-badge active">${bCount}</span>`
          : `<span class="meal-badge inactive">—</span>`;

        const lBadge = lCount > 0
          ? `<span class="meal-badge active">${lCount}</span>`
          : `<span class="meal-badge inactive">—</span>`;

        const dBadge = dCount > 0
          ? `<span class="meal-badge active">${dCount}</span>`
          : `<span class="meal-badge inactive">—</span>`;

        let rowHTML = `
          <tr>
            <td>
              <span style="font-weight:var(--weight-semibold); color:var(--text-primary);">${u.name || 'Member'}</span>
            </td>`;
        if (trackedMeals.breakfast !== false) rowHTML += `<td class="text-center">${bBadge}</td>`;
        if (trackedMeals.lunch !== false) rowHTML += `<td class="text-center">${lBadge}</td>`;
        if (trackedMeals.dinner !== false) rowHTML += `<td class="text-center">${dBadge}</td>`;
        rowHTML += `</tr>`;
        return rowHTML;
      }).join('');

    } catch (e) {
      console.error('[MealChartModule] Detail render error:', e);
      tbody.innerHTML = `<tr><td colspan="4" class="text-center p-6" style="color:var(--text-tertiary);">Failed to load meal logs.</td></tr>`;
    } finally {
      if (this._resolveReady) {
        this._resolveReady();
        this._resolveReady = null;
      }
    }
  },

  /**
   * Refresh module data
   */
  refresh() {
    if (!this.diningId && window.Messliner && Messliner.state) {
      this.diningId = Messliner.state.diningId;
    }
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.populateDayDropdown();
    this.loadMonthData();
  }
};

window.MealChartModule = MealChartModule;
