/* ============================================
   Messliner — Modern Bazar Module (user/bazar.js)
   ============================================ */

const BazarModule = {
  diningId: null,
  userId: null,
  role: null,
  createdDate: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  activeTab: 'calendar', // 'calendar' or 'logs'

  // Data caches
  rawBazarData: null,
  rawDepositsData: null,
  rawScheduleData: null,
  rawWeeklyRoutine: null,
  users: {},

  _initialized: false,
  _listeningDiningId: null,
  _bazarRef: null,
  _depositsRef: null,
  _scheduleRef: null,
  _weeklyRef: null,
  _usersRef: null,

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

  /**
   * Initialize Bazar Module
   */
  async init(diningId, userId, initialData) {
    this.diningId = diningId || Messliner.state?.diningId || (Messliner.auth?.userDining?.id);
    this.userId = userId || Messliner.state?.userId;
    this.role = Messliner.state?.role || 'member';

    if (initialData) {
      if (initialData.bazar) this.rawBazarData = initialData.bazar;
      if (initialData.deposits) this.rawDepositsData = initialData.deposits;
      if (initialData.users) this.users = initialData.users;
    }

    if (!this._initialized) {
      const now = new Date();
      this.selectedYear = now.getFullYear();
      this.selectedMonth = now.getMonth() + 1;
      this._initialized = true;
    }

    try {
      if (this.diningId) {
        const startRef = await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value');
        let startDateStr = startRef.val();
        if (startDateStr) {
          this.createdDate = new Date(startDateStr);
        } else {
          const infoSnap = await db.ref(`dinings/${this.diningId}/info/createdAt`).once('value');
          const createdAt = infoSnap.val();
          this.createdDate = createdAt ? new Date(createdAt) : new Date(2026, 0, 1);
        }
      } else {
        this.createdDate = new Date(2026, 0, 1);
      }
    } catch (e) {
      console.error('[BazarModule] Fetch start date error:', e);
      this.createdDate = new Date(2026, 0, 1);
    }

    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.setupRealtimeListeners();
    if (initialData && (initialData.bazar || initialData.deposits)) {
      this.render();
    }
  },

  /**
   * Refresh — called by router
   */
  refresh() {
    this.diningId = Messliner.state?.diningId || this.diningId;
    this.userId = Messliner.state?.userId || this.userId;
    this.role = Messliner.state?.role || this.role;

    if (!this._initialized) {
      this.init(this.diningId, this.userId);
      return;
    }

    this.setupRealtimeListeners();
    this.render();
  },

  /**
   * Switch between Calendar Routine & Expense Logs tabs
   */
  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.bazar-view-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    const calView = document.getElementById('bazarCalendarViewSection');
    const logView = document.getElementById('bazarLogsViewSection');
    if (calView) calView.style.display = tab === 'calendar' ? 'block' : 'none';
    if (logView) logView.style.display = tab === 'logs' ? 'block' : 'none';

    if (tab === 'logs') {
      this.renderExpenseLogs();
    } else {
      this.renderCalendar();
    }
  },

  /**
   * Setup Realtime Firebase listeners
   */
  setupRealtimeListeners() {
    if (!this.diningId && Messliner.state?.diningId) {
      this.diningId = Messliner.state.diningId;
    }
    if (!this.diningId) return;

    if (this._listeningDiningId === this.diningId && this._bazarRef) {
      this.render();
      return;
    }

    // Cleanup previous listeners
    if (this._bazarRef) this._bazarRef.off();
    if (this._depositsRef) this._depositsRef.off();
    if (this._scheduleRef) this._scheduleRef.off();
    if (this._weeklyRef) this._weeklyRef.off();
    if (this._usersRef) this._usersRef.off();

    this._listeningDiningId = this.diningId;

    // 1. Bazar expenses listener
    this._bazarRef = db.ref(`dinings/${this.diningId}/bazar`);
    this._bazarRef.on('value', snap => {
      this.rawBazarData = snap.val() || {};
      this.render();
    }, err => console.error('[BazarModule] Bazar data err:', err));

    // 2. Specific Month Schedule listener
    this.attachMonthScheduleListener();

    // 3. Weekly Recurring Routine listener
    this._weeklyRef = db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`);
    this._weeklyRef.on('value', snap => {
      this.rawWeeklyRoutine = snap.val() || {};
      this.render();
    }, err => console.error('[BazarModule] Weekly routine err:', err));

    // 4. Users listener
    this._usersRef = db.ref(`dinings/${this.diningId}/users`);
    this._usersRef.on('value', snap => {
      this.users = snap.val() || {};
      this.render();
    }, err => console.error('[BazarModule] Users err:', err));

    // 5. Deposits listener (for current month deposit calculation)
    this._depositsRef = db.ref(`dinings/${this.diningId}/deposits`);
    this._depositsRef.on('value', snap => {
      this.rawDepositsData = snap.val() || {};
      this.render();
    }, err => console.error('[BazarModule] Deposits err:', err));
  },

  /**
   * Listen to current selected month schedule
   */
  attachMonthScheduleListener() {
    if (!this.diningId) return;
    if (this._scheduleRef) this._scheduleRef.off();

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    this._scheduleRef = db.ref(`dinings/${this.diningId}/bazarSchedule/${formattedMonth}`);
    this._scheduleRef.on('value', snap => {
      this.rawScheduleData = snap.val() || {};
      this.render();
    }, err => console.error('[BazarModule] Month schedule err:', err));
  },

  /**
   * Populate Year Dropdown
   */
  populateYearDropdown() {
    const valueEl = document.getElementById('bazarYearValue');
    const menuEl = document.getElementById('bazarYearMenu');
    if (!valueEl || !menuEl) return;

    const startYear = (this.createdDate || new Date(2026, 0, 1)).getFullYear();
    const endYear = new Date().getFullYear() + 1; // allow next year planning

    let html = '';
    for (let y = startYear; y <= endYear; y++) {
      const sel = y === this.selectedYear ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${y}"
                    onclick="Messliner.bazar.selectYear(${y})">${y}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.selectedYear;
  },

  selectYear(year) {
    this.selectedYear = parseInt(year, 10);
    const dd = document.getElementById('bazarYearDropdown');
    if (dd) dd.classList.remove('active');
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.attachMonthScheduleListener();
    this.render();
  },

  /**
   * Populate Month Dropdown
   */
  populateMonthDropdown() {
    const valueEl = document.getElementById('bazarMonthValue');
    const menuEl = document.getElementById('bazarMonthMenu');
    if (!valueEl || !menuEl) return;

    let html = '';
    for (let m = 1; m <= 12; m++) {
      const sel = m === this.selectedMonth ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${m}"
                    onclick="Messliner.bazar.selectMonth(${m})">${this.monthNames[m - 1]}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.monthNames[this.selectedMonth - 1];
  },

  selectMonth(month) {
    this.selectedMonth = parseInt(month, 10);
    const dd = document.getElementById('bazarMonthDropdown');
    if (dd) dd.classList.remove('active');
    this.populateMonthDropdown();
    this.attachMonthScheduleListener();
    this.render();
  },

  prevMonth() {
    let m = this.selectedMonth - 1;
    let y = this.selectedYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    this.selectedYear = y;
    this.selectedMonth = m;
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.attachMonthScheduleListener();
    this.render();
  },

  nextMonth() {
    let m = this.selectedMonth + 1;
    let y = this.selectedYear;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    this.selectedYear = y;
    this.selectedMonth = m;
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.attachMonthScheduleListener();
    this.render();
  },

  setTodayMonth() {
    const now = new Date();
    this.selectedYear = now.getFullYear();
    this.selectedMonth = now.getMonth() + 1;
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.attachMonthScheduleListener();
    this.render();
  },

  /**
   * Primary Render Coordinator
   */
  render() {
    this.renderTopStats();
    if (this.activeTab === 'calendar') {
      this.renderCalendar();
      this.renderDutyDistribution();
    } else {
      this.renderExpenseLogs();
    }
    this.updateAdminControls();
  },

  /**
   * Update visibility of admin controls
   */
  updateAdminControls() {
    const isAdmin = (this.role === 'admin' || Messliner.state?.role === 'admin');
    document.querySelectorAll('.bazar-admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  },

  /**
   * Get days in selected month
   */
  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  },

  /**
   * Filter and group Bazar records for current month
   */
  getMonthBazarData() {
    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const allBazar = this.rawBazarData || {};
    const grouped = {}; // dateStr -> array of entries

    let totalExpense = 0;
    const shoppingDaysSet = new Set();

    Object.entries(allBazar).forEach(([key, entry]) => {
      if (!entry) return;

      // Extract date string
      let entryDate = entry.date;
      if (!entryDate && entry.timestamp) {
        if (typeof entry.timestamp === 'number') {
          const dt = new Date(entry.timestamp);
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          entryDate = `${y}-${m}-${d}`;
        } else {
          entryDate = new Date(entry.timestamp).toISOString().slice(0, 10);
        }
      }

      // Check if entry belongs to selected month
      let isMatch = false;
      if (entryDate && typeof entryDate === 'string' && entryDate.startsWith(formattedMonth)) {
        isMatch = true;
      } else if (Utils.isItemInMonth(entry, formattedMonth)) {
        isMatch = true;
      }

      if (!isMatch) return;

      const amt = parseFloat(entry.amount) || Utils.num(entry.amount) || 0;
      totalExpense += amt;
      if (entryDate) shoppingDaysSet.add(entryDate);

      const grpKey = entryDate || formattedMonth;
      if (!grouped[grpKey]) grouped[grpKey] = [];
      grouped[grpKey].push({ key, ...entry, date: entryDate || grpKey, amount: amt });
    });

    return {
      grouped,
      totalExpense,
      daysShoppedCount: shoppingDaysSet.size,
      shoppingDaysSet
    };
  },

  /**
   * Render Top Analytics Banner & Progress Bar Card
   */
  renderTopStats() {
    const monthDaysCount = this.getDaysInMonth(this.selectedYear, this.selectedMonth);
    const { totalExpense, daysShoppedCount } = this.getMonthBazarData();

    // 1. Days Shopped
    const daysShoppedEl = document.getElementById('bazarStatDaysShopped');
    if (daysShoppedEl) {
      daysShoppedEl.innerHTML = `<strong>${daysShoppedCount}</strong> <span class="bazar-stat-total-days">/ ${monthDaysCount} Days</span>`;
    }

    // 2. Total Expense
    const totalExpEl = document.getElementById('bazarStatTotalExpense');
    if (totalExpEl) {
      totalExpEl.textContent = Utils.currency(totalExpense);
    }

    // 3. Total Balance & Progress Bar Calculation for Selected Month
    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    let totalDeposit = 0;
    let totalOtherCosting = 0;
    let totalDeductions = 0;
    const allDeposits = this.rawDepositsData || {};

    const isMatchMonth = (item) => {
      if (!item) return false;
      if (item.date && typeof item.date === 'string' && item.date.startsWith(formattedMonth)) return true;
      return Utils.isItemInMonth(item, formattedMonth);
    };

    Object.values(allDeposits).forEach(d => {
      if (!isMatchMonth(d)) return;
      if (d.type === 'deposit') {
        totalDeposit += Utils.num(d.amount);
      } else if (d.type === 'other_costing') {
        totalOtherCosting += Math.abs(Utils.num(d.amount));
      } else if (d.type === 'deduction' || d.type === 'friday_meal') {
        totalDeductions += Math.abs(Utils.num(d.amount));
      } else {
        totalDeductions += Math.abs(Utils.num(d.amount));
      }
    });

    // Available Deposit Balance for Bazar (Total Deposit minus all other costs & deductions, WITHOUT subtracting bazar cost)
    const effectiveDeposit = totalDeposit - totalOtherCosting - totalDeductions;

    // Real Final Remaining Balance (Deposit balance minus Bazar Expense = Net Balance of Dining)
    const realRemainingBalance = effectiveDeposit - totalExpense;

    // Calculate percentage spent of available budget/deposit for this month
    const percentSpent = effectiveDeposit > 0 
      ? Math.min(100, Math.max(0, Math.round((totalExpense / effectiveDeposit) * 100))) 
      : (totalExpense > 0 ? 100 : 0);

    const percentEl = document.getElementById('bazarStatPercentSpent');
    if (percentEl) percentEl.textContent = `${percentSpent}% Spent`;

    const progressFillEl = document.getElementById('bazarStatProgressFill');
    if (progressFillEl) {
      progressFillEl.style.width = `${Math.min(100, Math.max(0, percentSpent))}%`;
      // Dynamic color tone based on consumption
      if (percentSpent > 85) {
        progressFillEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
      } else if (percentSpent > 60) {
        progressFillEl.style.background = 'linear-gradient(90deg, #10b981, #f59e0b)';
      } else {
        progressFillEl.style.background = 'linear-gradient(90deg, #059669, #10b981)';
      }
    }

    const totalDepEl = document.getElementById('bazarStatTotalDeposit');
    if (totalDepEl) totalDepEl.textContent = Utils.currency(effectiveDeposit);

    const remainingBalEl = document.getElementById('bazarStatRemainingBalance');
    if (remainingBalEl) {
      remainingBalEl.textContent = Utils.currency(realRemainingBalance);
      if (realRemainingBalance < 0) {
        remainingBalEl.style.color = '#dc2626';
      } else {
        remainingBalEl.style.color = '#059669';
      }
    }

    // 4. Today's Duty Chip
    this.renderTodayDutyChip();
  },

  /**
   * Resolve who is assigned for a given date
   */
  resolveDutyForDate(dateStr, dayOfWeek) {
    // 1. Day-wise override takes highest priority
    const monthSchedule = this.rawScheduleData || {};
    if (monthSchedule[dateStr] && monthSchedule[dateStr].userId) {
      const entry = monthSchedule[dateStr];
      const user = this.users[entry.userId] || { name: entry.userName || 'Member' };
      return {
        userId: entry.userId,
        userName: user.name || entry.userName || 'Member',
        userAvatar: user.avatarUrl || user.photoURL || null,
        note: entry.note || '',
        isOverride: true
      };
    }

    // 2. Weekly Recurring Routine
    const weekly = this.rawWeeklyRoutine || {};
    const weeklyUserId = weekly[dayOfWeek];
    if (weeklyUserId && this.users[weeklyUserId]) {
      const user = this.users[weeklyUserId];
      return {
        userId: weeklyUserId,
        userName: user.name || 'Member',
        userAvatar: user.avatarUrl || user.photoURL || null,
        note: 'Weekly Routine',
        isOverride: false
      };
    }

    return null;
  },

  /**
   * Render Today's Duty Tag in Top Banner
   */
  renderTodayDutyChip() {
    const todayChipContainer = document.getElementById('bazarTodayDutyContainer');
    if (!todayChipContainer) return;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todayDayOfWeek = today.getDay();

    const duty = this.resolveDutyForDate(todayStr, todayDayOfWeek);
    const { grouped } = this.getMonthBazarData();
    const todayBazarList = grouped[todayStr] || [];
    const isDone = todayBazarList.length > 0;
    const todayTotal = todayBazarList.reduce((sum, e) => sum + (e.amount || 0), 0);

    if (duty) {
      todayChipContainer.innerHTML = `
        <div class="bazar-today-badge ${isDone ? 'done' : 'assigned'}">
          <div class="bazar-today-avatar">
            ${duty.userAvatar ? `<img src="${duty.userAvatar}" alt="${duty.userName}">` : duty.userName.charAt(0).toUpperCase()}
          </div>
          <div class="bazar-today-info">
            <span class="bazar-today-label">Today's Duty</span>
            <strong class="bazar-today-name">${duty.userName}</strong>
          </div>
          ${isDone ? `<span class="bazar-today-status done">৳${todayTotal.toLocaleString()} Done ✓</span>` : `<span class="bazar-today-status upcoming">On Duty</span>`}
        </div>
      `;
    } else {
      todayChipContainer.innerHTML = `
        <div class="bazar-today-badge unassigned" onclick="Messliner.bazar.openAssignModal('${todayStr}')">
          <div class="bazar-today-avatar empty">?</div>
          <div class="bazar-today-info">
            <span class="bazar-today-label">Today's Duty</span>
            <strong class="bazar-today-name" style="color: #64748b;">No one assigned</strong>
          </div>
          <button type="button" class="bazar-btn-quick-assign">+ Assign</button>
        </div>
      `;
    }
  },

  /**
   * Render Spacious Modern Interactive Calendar
   */
  renderCalendar() {
    const gridEl = document.getElementById('bazarCalendarGrid');
    if (!gridEl) return;

    const year = this.selectedYear;
    const month = this.selectedMonth; // 1-indexed
    const daysInMonth = this.getDaysInMonth(year, month);

    // First day of month (0 = Sunday, 1 = Monday, ...)
    const firstDayIndex = new Date(year, month - 1, 1).getDay();

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDate = today.getDate();
    const todayStr = `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;

    const { grouped } = this.getMonthBazarData();
    const formattedMonth = `${year}-${String(month).padStart(2, '0')}`;

    let html = '';

    // Day of week column headers
    this.dayNamesShort.forEach((dName, idx) => {
      const isWeekend = (idx === 5 || idx === 6); // Fri/Sat in BD context or weekend styling
      html += `<div class="bazar-cal-header-cell ${isWeekend ? 'weekend' : ''}">${dName}</div>`;
    });

    // Previous month padding cells
    const prevMonthDays = new Date(year, month - 1, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDateNum = prevMonthDays - i;
      html += `
        <div class="bazar-cal-cell empty-prev">
          <span class="bazar-cal-date-num faint">${prevDateNum}</span>
        </div>
      `;
    }

    // Current Month Date Cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${formattedMonth}-${String(day).padStart(2, '0')}`;
      const cellDate = new Date(year, month - 1, day);
      const dayOfWeek = cellDate.getDay();

      const isToday = (year === todayYear && month === todayMonth && day === todayDate);
      const isPast = (cellDate < new Date(todayYear, todayMonth - 1, todayDate));

      const duty = this.resolveDutyForDate(dateStr, dayOfWeek);
      const bazarEntries = grouped[dateStr] || [];
      const isBazarDone = bazarEntries.length > 0;
      const dayTotalBazar = bazarEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

      html += `
        <div class="bazar-cal-cell ${isToday ? 'is-today' : ''} ${isBazarDone ? 'has-bazar' : ''}" 
             onclick="Messliner.bazar.onCalendarDateClick('${dateStr}', ${dayOfWeek})">
          
          <div class="bazar-cal-cell-top">
            <span class="bazar-cal-date-num ${isToday ? 'today-pill' : ''}">
              ${day} ${isToday ? '<span class="today-text-tag">TODAY</span>' : ''}
            </span>

            ${isBazarDone ? `
              <span class="bazar-cal-cost-badge" title="Total Bazar: ৳${dayTotalBazar}">
                ৳${dayTotalBazar >= 1000 ? (dayTotalBazar / 1000).toFixed(1) + 'k' : dayTotalBazar}
              </span>
            ` : ''}
          </div>

          <div class="bazar-cal-duty-slot">
            ${duty ? `
              <div class="bazar-cal-member-card ${isBazarDone ? 'done' : (isToday ? 'active' : 'assigned')}">
                <div class="bazar-cal-member-avatar">
                  ${duty.userAvatar ? `<img src="${duty.userAvatar}" alt="${duty.userName}">` : duty.userName.charAt(0).toUpperCase()}
                </div>
                <div class="bazar-cal-member-info">
                  <span class="bazar-cal-member-name">${duty.userName}</span>
                  ${duty.isOverride ? `<span class="bazar-cal-override-dot" title="Custom day assignment">●</span>` : ''}
                </div>
              </div>
            ` : `
              <div class="bazar-cal-unassigned-slot">
                <span class="bazar-cal-plus-icon">+</span>
                <span class="bazar-cal-unassigned-text">Assign</span>
              </div>
            `}
          </div>

          ${isBazarDone ? `
            <div class="bazar-cal-status-indicator done">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Bazar Done (${bazarEntries.length})</span>
            </div>
          ` : (duty && isToday ? `
            <div class="bazar-cal-status-indicator today-due">
              <span>Today's Roster</span>
            </div>
          ` : '')}

        </div>
      `;
    }

    // Trailing padding cells to complete 7-column grid
    const totalCells = firstDayIndex + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
      html += `
        <div class="bazar-cal-cell empty-next">
          <span class="bazar-cal-date-num faint">${i}</span>
        </div>
      `;
    }

    gridEl.innerHTML = html;

    // Update Calendar Subtitle
    const calSubtitleEl = document.getElementById('bazarCalSubtitle');
    if (calSubtitleEl) {
      calSubtitleEl.textContent = `${this.monthNames[month - 1]} ${year} — Roster & Duties`;
    }
  },

  /**
   * Handle Click on Calendar Date Cell
   */
  onCalendarDateClick(dateStr, dayOfWeek) {
    const duty = this.resolveDutyForDate(dateStr, dayOfWeek);
    const { grouped } = this.getMonthBazarData();
    const bazarList = grouped[dateStr] || [];

    // Open detailed day modal
    this.openDayDetailsModal(dateStr, dayOfWeek, duty, bazarList);
  },

  /**
   * Render Member Duty Fairness & Distribution Counter
   */
  renderDutyDistribution() {
    const listEl = document.getElementById('bazarDutyFairnessList');
    if (!listEl) return;

    const allUsers = Object.entries(this.users || {});
    if (allUsers.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-slate-400">Loading members...</div>`;
      return;
    }

    const year = this.selectedYear;
    const month = this.selectedMonth;
    const daysInMonth = this.getDaysInMonth(year, month);
    const formattedMonth = `${year}-${String(month).padStart(2, '0')}`;

    // Count duties per user in this month
    const dutyCounts = {};
    allUsers.forEach(([uid]) => { dutyCounts[uid] = { assigned: 0, completed: 0 }; });

    const { grouped } = this.getMonthBazarData();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${formattedMonth}-${String(day).padStart(2, '0')}`;
      const cellDate = new Date(year, month - 1, day);
      const dayOfWeek = cellDate.getDay();

      const duty = this.resolveDutyForDate(dateStr, dayOfWeek);
      if (duty && duty.userId && dutyCounts[duty.userId]) {
        dutyCounts[duty.userId].assigned += 1;
        if (grouped[dateStr] && grouped[dateStr].length > 0) {
          dutyCounts[duty.userId].completed += 1;
        }
      }
    }

    // Sort by most assigned duties
    const sorted = allUsers.map(([uid, u]) => ({
      uid,
      name: u?.name || 'Member',
      avatarUrl: u?.avatarUrl || u?.photoURL || null,
      assigned: dutyCounts[uid]?.assigned || 0,
      completed: dutyCounts[uid]?.completed || 0
    })).sort((a, b) => b.assigned - a.assigned);

    listEl.innerHTML = sorted.map(m => `
      <div class="bazar-fairness-item">
        <div class="bazar-fairness-user">
          <div class="bazar-fairness-avatar">
            ${m.avatarUrl ? `<img src="${m.avatarUrl}" alt="${m.name}">` : m.name.charAt(0).toUpperCase()}
          </div>
          <div class="bazar-fairness-info">
            <span class="bazar-fairness-name">${m.name}</span>
            <span class="bazar-fairness-sub">${m.completed} Completed</span>
          </div>
        </div>
        <div class="bazar-fairness-count-badge" title="${m.assigned} duties assigned this month">
          <strong>${m.assigned}</strong> <span>duties</span>
        </div>
      </div>
    `).join('');
  },

  /**
   * Render Expense Logs & Receipts Tab
   */
  renderExpenseLogs() {
    const listEl = document.getElementById('bazarExpenseLogsContainer');
    if (!listEl) return;

    const { grouped, totalExpense } = this.getMonthBazarData();
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    if (sortedDates.length === 0) {
      listEl.innerHTML = `
        <div class="bazar-empty-state">
          <div class="bazar-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </div>
          <h3>No Bazar Records</h3>
          <p>No bazar expenses found for <strong>${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}</strong>.</p>
        </div>`;
      return;
    }

    let html = '';
    sortedDates.forEach(dateStr => {
      const entries = grouped[dateStr];
      const dayTotal = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
      const dateObj = new Date(dateStr + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      html += `
        <div class="bazar-log-day-card">
          <div class="bazar-log-day-header">
            <div class="bazar-log-day-left">
              <div class="bazar-log-calendar-tag">
                <span class="bazar-log-tag-month">${dateObj.toLocaleDateString('en-US', { month: 'short' })}</span>
                <span class="bazar-log-tag-day">${dateObj.getDate()}</span>
              </div>
              <div>
                <h4 class="bazar-log-day-title">${formattedDate}</h4>
                <span class="bazar-log-day-count">${entries.length} ${entries.length === 1 ? 'item entry' : 'item entries'}</span>
              </div>
            </div>
            <div class="bazar-log-day-total">
              ${Utils.currency(dayTotal)}
            </div>
          </div>

          <div class="bazar-log-items-table-wrapper">
            <table class="bazar-log-items-table">
              <thead>
                <tr>
                  <th>Item / Description</th>
                  <th>Quantity</th>
                  <th>Shopper</th>
                  <th style="text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map(item => {
        const shopperName = item.userName || this.users[item.userId]?.name || 'Member';
        return `
                    <tr>
                      <td class="font-medium text-slate-800">${item.title || item.name || 'Bazar Item'}</td>
                      <td class="text-slate-500">${item.quantity || item.qty || '—'}</td>
                      <td>
                        <span class="bazar-shopper-pill">${shopperName}</span>
                      </td>
                      <td style="text-align:right; font-weight:700; color:#059669;">
                        ${Utils.currency(item.amount)}
                      </td>
                    </tr>
                  `;
      }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  },

  /* ============================================================
     MODALS & ASSIGNMENT ACTIONS
     ============================================================ */

  /**
   * Open Assign Bazar Duty Modal for a specific date
   */
  openAssignModal(prefillDate) {
    const modal = document.getElementById('bazarAssignModal');
    if (!modal) return;

    const dateInput = document.getElementById('bazarAssignDate');
    if (dateInput) {
      dateInput.value = prefillDate || new Date().toISOString().slice(0, 10);
    }

    this.populateMemberSelect('bazarAssignUserSelect');

    const noteInput = document.getElementById('bazarAssignNote');
    if (noteInput) noteInput.value = '';

    openModal('bazarAssignModal');
  },

  /**
   * Populate a select dropdown with dining members
   */
  populateMemberSelect(selectId, selectedUserId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const allUsers = Object.entries(this.users || {}).sort((a, b) => (a[1]?.name || '').localeCompare(b[1]?.name || ''));
    let html = '<option value="">-- Select Member --</option>';
    allUsers.forEach(([uid, u]) => {
      const isSel = (uid === selectedUserId) ? 'selected' : '';
      html += `<option value="${uid}" ${isSel}>${u?.name || 'Member'}</option>`;
    });
    select.innerHTML = html;
  },

  /**
   * Save Single Date Bazar Duty Assignment
   */
  async submitAssignDuty() {
    const dateInput = document.getElementById('bazarAssignDate');
    const userSelect = document.getElementById('bazarAssignUserSelect');
    const noteInput = document.getElementById('bazarAssignNote');

    const dateStr = dateInput?.value;
    const userId = userSelect?.value;
    const note = noteInput?.value?.trim() || '';

    if (!dateStr) {
      Notifications.toast('warning', 'Missing Date', 'Please select a date.');
      return;
    }
    if (!userId) {
      Notifications.toast('warning', 'Select Member', 'Please select a member for duty.');
      return;
    }

    const yearMonth = dateStr.slice(0, 7);
    const user = this.users[userId];

    try {
      const dutyData = {
        userId,
        userName: user?.name || 'Member',
        note,
        assignedBy: this.userId || 'admin',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };

      await db.ref(`dinings/${this.diningId}/bazarSchedule/${yearMonth}/${dateStr}`).set(dutyData);

      Notifications.toast('success', 'Duty Assigned', `Assigned ${user?.name || 'Member'} for ${dateStr}`);
      closeModal('bazarAssignModal');
      closeModal('bazarDayDetailsModal');
    } catch (err) {
      console.error('[BazarModule] Save assignment error:', err);
      Notifications.toast('error', 'Error', 'Failed to save duty assignment.');
    }
  },

  /**
   * Remove Single Date Override Assignment
   */
  async removeDateDuty(dateStr) {
    if (!dateStr || !this.diningId) return;
    const yearMonth = dateStr.slice(0, 7);

    try {
      await db.ref(`dinings/${this.diningId}/bazarSchedule/${yearMonth}/${dateStr}`).remove();
      Notifications.toast('info', 'Duty Cleared', `Cleared custom assignment for ${dateStr}.`);
      closeModal('bazarDayDetailsModal');
    } catch (err) {
      console.error('[BazarModule] Remove duty error:', err);
      Notifications.toast('error', 'Error', 'Failed to clear assignment.');
    }
  },

  /**
   * Open Weekly Routine Modal (Sun through Sat defaults)
   */
  openWeeklyRoutineModal() {
    const weekly = this.rawWeeklyRoutine || {};

    // Populate all 7 day dropdowns
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const selectId = `bazarWeeklySelect_${dayIdx}`;
      this.populateMemberSelect(selectId, weekly[dayIdx] || null);
    }

    openModal('bazarWeeklyRoutineModal');
  },

  /**
   * Save 7-Day Weekly Routine
   */
  async submitWeeklyRoutine() {
    if (!this.diningId) return;

    const newRoutine = {};
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const select = document.getElementById(`bazarWeeklySelect_${dayIdx}`);
      const val = select?.value;
      if (val) {
        newRoutine[dayIdx] = val;
      }
    }

    try {
      await db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`).set(newRoutine);
      Notifications.toast('success', 'Weekly Routine Saved', 'Recurring weekly schedule updated for all weeks.');
      closeModal('bazarWeeklyRoutineModal');
    } catch (err) {
      console.error('[BazarModule] Save weekly routine error:', err);
      Notifications.toast('error', 'Error', 'Failed to save weekly routine.');
    }
  },

  /**
   * Open Day Details Modal (View duty, bazar entries, reassign or log)
   */
  openDayDetailsModal(dateStr, dayOfWeek, duty, bazarEntries = []) {
    const modal = document.getElementById('bazarDayDetailsModal');
    if (!modal) return;

    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    Utils.setText('bazarDayModalTitle', formattedDate);
    Utils.setText('bazarDayModalSubtitle', `Day duty & bazar expense records`);

    const dutyContainer = document.getElementById('bazarDayModalDutyInfo');
    const dayTotal = bazarEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const isAdmin = (this.role === 'admin' || Messliner.state?.role === 'admin');

    if (dutyContainer) {
      if (duty) {
        dutyContainer.innerHTML = `
          <div class="bazar-day-modal-duty-card">
            <div class="bazar-day-modal-avatar">
              ${duty.userAvatar ? `<img src="${duty.userAvatar}" alt="${duty.userName}">` : duty.userName.charAt(0).toUpperCase()}
            </div>
            <div class="bazar-day-modal-duty-meta">
              <span class="bazar-day-modal-tag">${duty.isOverride ? 'Specific Day Assignment' : 'Recurring Weekly Routine'}</span>
              <h4 class="bazar-day-modal-name">${duty.userName}</h4>
              ${duty.note ? `<p class="bazar-day-modal-note">"${duty.note}"</p>` : ''}
            </div>
            ${isAdmin ? `
              <div class="bazar-day-modal-duty-actions">
                <button type="button" class="btn btn-sm btn-outline" onclick="Messliner.bazar.openAssignModal('${dateStr}')" title="Change member">Change</button>
                ${duty.isOverride ? `
                  <button type="button" class="btn btn-sm btn-danger-outline" onclick="Messliner.bazar.removeDateDuty('${dateStr}')" title="Remove override">Reset</button>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `;
      } else {
        dutyContainer.innerHTML = `
          <div class="bazar-day-modal-empty-duty">
            <span>No duty assigned for this day</span>
            ${isAdmin ? `
              <button type="button" class="btn btn-sm btn-primary" onclick="Messliner.bazar.openAssignModal('${dateStr}')">+ Assign Duty</button>
            ` : ''}
          </div>
        `;
      }
    }

    // Render Bazar entries for this day
    const entriesContainer = document.getElementById('bazarDayModalEntries');
    if (entriesContainer) {
      if (bazarEntries.length > 0) {
        entriesContainer.innerHTML = `
          <div class="bazar-day-modal-bazar-summary">
            <span class="font-bold text-slate-700">Total Bazar Cost:</span>
            <strong class="text-emerald-600 font-extrabold text-base">${Utils.currency(dayTotal)}</strong>
          </div>
          <div class="bazar-day-entries-list">
            ${bazarEntries.map(e => `
              <div class="bazar-day-entry-item">
                <div class="bazar-day-entry-info">
                  <span class="bazar-day-entry-title">${e.title || e.name || 'Bazar Item'}</span>
                  <span class="bazar-day-entry-shopper">By: ${e.userName || this.users[e.userId]?.name || 'Member'} ${e.quantity ? `• ${e.quantity}` : ''}</span>
                </div>
                <strong class="bazar-day-entry-amt">${Utils.currency(e.amount)}</strong>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        entriesContainer.innerHTML = `
          <div class="bazar-day-modal-no-bazar">
            <p>No bazar expense logged for this date.</p>
            ${isAdmin ? `
              <button type="button" class="btn btn-sm btn-outline" onclick="Messliner.bazar.quickLogBazarForDate('${dateStr}')">+ Log Expense</button>
            ` : ''}
          </div>
        `;
      }
    }

    openModal('bazarDayDetailsModal');
  },

  /**
   * Open Add Bazar Entry Modal
   */
  openAddBazarModal(dateStr) {
    if (Messliner.finance && Messliner.finance.showBazarModal) {
      Messliner.finance.showBazarModal(dateStr);
    } else {
      document.getElementById('bazarForm')?.reset();
      const dateInput = document.getElementById('bazarDateInput');
      const targetDate = dateStr || Utils.today();
      if (dateInput) dateInput.value = targetDate;
      if (Messliner.finance && Messliner.finance.populateBazarShopperSelect) {
        Messliner.finance.populateBazarShopperSelect(targetDate);
      }
      openModal('bazarModal');
    }
  },

  /**
   * Quick link to log bazar from day modal
   */
  quickLogBazarForDate(dateStr) {
    closeModal('bazarDayDetailsModal');
    this.openAddBazarModal(dateStr);
  }
};

// Global attachment
window.BazarModule = BazarModule;
console.log('[Messliner] BazarModule loaded');
