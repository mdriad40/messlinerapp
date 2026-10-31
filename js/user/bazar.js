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
    if (this._settingsRef) this._settingsRef.off();

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

    // 6. Settings listener (for managerBazarEnabled)
    this._settingsRef = db.ref(`dinings/${this.diningId}/settings`);
    this._settingsRef.on('value', snap => {
      this.settings = snap.val() || {};
    });
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
    this.renderCalendar();
    this.renderDutyDistribution();
    this.renderExpenseLogs();
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
      const formattedNum = Number(totalExpense || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      totalExpEl.innerHTML = `<span class="bazar-curr-symbol">৳</span>${formattedNum}`;
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
    if (percentEl) {
      percentEl.textContent = `${percentSpent}% Spent`;
      if (percentSpent > 90) {
        percentEl.className = 'bazar-progress-badge badge-danger';
      } else if (percentSpent > 70) {
        percentEl.className = 'bazar-progress-badge badge-warning';
      } else {
        percentEl.className = 'bazar-progress-badge badge-success';
      }
    }

    const progressFillEl = document.getElementById('bazarStatProgressFill');
    if (progressFillEl) {
      progressFillEl.style.width = `${Math.min(100, Math.max(0, percentSpent))}%`;
      progressFillEl.style.background = 'linear-gradient(90deg, #10B981 0%, #EAB308 55%, #EF4444 100%)';
    }

    const totalDepEl = document.getElementById('bazarStatTotalDeposit');
    if (totalDepEl) totalDepEl.textContent = Utils.currency(effectiveDeposit);

    const remainingBalEl = document.getElementById('bazarStatRemainingBalance');
    if (remainingBalEl) {
      remainingBalEl.textContent = Utils.currency(realRemainingBalance);
      if (realRemainingBalance < 0) {
        remainingBalEl.style.color = '#DC2626';
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
    if (monthSchedule[dateStr]) {
      const entry = monthSchedule[dateStr];
      if (entry.userId) {
        const user = this.users[entry.userId] || { name: entry.userName || 'Member' };
        return {
          userId: entry.userId,
          userName: user.name || entry.userName || 'Member',
          userAvatar: user.avatarUrl || user.photoURL || null,
          note: entry.note || '',
          isOverride: true,
          members: [{
            userId: entry.userId,
            userName: user.name || entry.userName || 'Member',
            userAvatar: user.avatarUrl || user.photoURL || null
          }]
        };
      }
    }

    // 2. Weekly Recurring Routine (with Auto-Swipe / Round-Robin 1 member per week across month)
    const weekly = this.rawWeeklyRoutine || {};
    let dayVal = weekly[dayOfWeek];
    if (dayVal === undefined || dayVal === null) dayVal = weekly[String(dayOfWeek)];
    if (dayVal === undefined || dayVal === null) dayVal = weekly[Number(dayOfWeek)];
    if (dayVal) {
      const uids = Array.isArray(dayVal) ? dayVal : [dayVal];
      const validMembers = uids.map(uid => {
        const u = this.users[uid];
        return u ? { userId: uid, userName: u.name || 'Member', userAvatar: u.avatarUrl || u.photoURL || null } : null;
      }).filter(Boolean);

      if (validMembers.length > 0) {
        if (validMembers.length === 1) {
          return {
            userId: validMembers[0].userId,
            userName: validMembers[0].userName,
            userAvatar: validMembers[0].userAvatar,
            note: 'Weekly Routine',
            isOverride: false,
            members: [validMembers[0]],
            allRotationMembers: validMembers,
            isRotated: false
          };
        } else {
          // Multi-member: Auto-Swipe across month weeks (0 = 1st week occurrence, 1 = 2nd week, etc.)
          const dayOfMonth = parseInt(dateStr.slice(8, 10), 10);
          const occurrenceIndex = Math.floor((dayOfMonth - 1) / 7);
          const assignedMemberIndex = occurrenceIndex % validMembers.length;
          const selectedMember = validMembers[assignedMemberIndex];

          return {
            userId: selectedMember.userId,
            userName: selectedMember.userName,
            userAvatar: selectedMember.userAvatar,
            note: `Auto-Swipe Roster (Week ${occurrenceIndex + 1})`,
            isOverride: false,
            members: [selectedMember],
            allRotationMembers: validMembers,
            rotationIndex: assignedMemberIndex,
            occurrenceIndex: occurrenceIndex,
            isRotated: true
          };
        }
      }
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
   * Helper to get 2-letter uppercase initials from name
   */
  getInitials(name) {
    if (!name) return '--';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  },

  /**
   * Render Compact Modern Minimal Calendar
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

    // Day of week column headers: S M T W T F S
    const miniDayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    miniDayHeaders.forEach((dName) => {
      html += `<div class="bazar-cal-header-cell">${dName}</div>`;
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
      const isPast = (dateStr < todayStr);
      const duty = this.resolveDutyForDate(dateStr, dayOfWeek);
      const bazarEntries = grouped[dateStr] || [];
      const isBazarDone = bazarEntries.length > 0;

      let cellStatusClass = 'unassigned';
      let isMissed = false;

      if (duty) {
        if (isBazarDone) {
          cellStatusClass = 'status-done';
        } else if (isPast) {
          cellStatusClass = 'status-missed';
          isMissed = true;
        } else {
          cellStatusClass = 'status-assigned';
        }
      }

      const initials = duty ? this.getInitials(duty.userName) : '';

      html += `
        <div class="bazar-cal-cell ${cellStatusClass} ${isToday ? 'is-today' : ''}" 
             onclick="Messliner.bazar.onCalendarDateClick('${dateStr}', ${dayOfWeek})">
          
          <div class="bazar-cal-cell-top">
            <span class="bazar-cal-date-num">${day}</span>
            ${isMissed ? `
              <span class="bazar-cal-warning-badge" title="Missed Bazar Duty">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L1 21h22L12 2zm0 3.5L20.3 19H3.7L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                </svg>
              </span>
            ` : ''}
          </div>

          <div class="bazar-cal-duty-slot">
            ${duty ? `
              <div style="display: flex; gap: 2px; width: 100%; justify-content: center; align-items: center; min-width: 0;">
                ${(duty.members && duty.members.length > 0 ? duty.members : [{ userName: duty.userName }]).slice(0, 2).map(m => `
                  <div class="bazar-cal-member-pill ${cellStatusClass}" style="${duty.members && duty.members.length > 1 ? 'flex: 1; min-width: 14px; font-size: 0.58rem; padding: 0 1px;' : ''}" title="${m.userName}">
                    ${this.getInitials(m.userName)}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="bazar-cal-empty-pill">
                <span>+</span>
              </div>
            `}
          </div>

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

    // Update Calendar Month/Year Center Title
    const monthYearTitleEl = document.getElementById('bazarCalMonthYear');
    if (monthYearTitleEl) {
      monthYearTitleEl.textContent = `${this.monthNames[month - 1].slice(0, 3)} ${year}`;
    }

    // Update Calendar Subtitle if exists
    const calSubtitleEl = document.getElementById('bazarCalSubtitle');
    if (calSubtitleEl) {
      calSubtitleEl.textContent = `Tap any day to assign a member`;
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
   * Render Expense Logs & Receipts Tab (Same format as Bazar History page)
   */
  renderExpenseLogs() {
    const listEl = document.getElementById('bazarExpenseLogsContainer');
    if (!listEl) return;

    const { grouped } = this.getMonthBazarData();
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

    const html = sortedDates.map(date => this._buildExpenseDayCard(date, grouped[date])).join('');
    listEl.innerHTML = html;
  },

  /**
   * Build the HTML for a single day accordion card in Expense History tab
   */
  _buildExpenseDayCard(date, entries) {
    const dayTotal = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Collect unique shoppers
    const shoppers = [...new Set(entries.map(e => e.shopperName || (this.users[e.userId]?.name) || e.userName).filter(s => s && s !== 'N/A'))];
    const shopperLabel = shoppers.length > 0 ? shoppers.join(', ') : 'N/A';

    // Combine all items into one preview string
    const allItemsText = entries.map(e => (e.items || e.title || e.name || '').replace(/\r?\n/g, ', ')).filter(Boolean).join(', ');
    const shortPreview = allItemsText.length > 42 ? allItemsText.slice(0, 42) + '…' : allItemsText;

    const dateObj = new Date(date + 'T00:00:00');
    const dayNum = String(dateObj.getDate()).padStart(2, '0');
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const formattedDate = Utils.formatDate(date);

    // Build detail item rows for the expanded panel
    const itemRows = entries.map((e, idx) => {
      const shopperName = e.shopperName || (this.users[e.userId]?.name) || e.userName || 'N/A';
      const itemsFormatted = Utils.formatBazarItems(e.items || e.title || e.name || 'Bazar Item');
      return `
        <div class="bazar-item-row">
          <div class="bazar-item-index">${idx + 1}</div>
          <div class="bazar-item-info">
            <div class="bazar-item-name">${itemsFormatted}</div>
            <div class="bazar-item-shopper">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${shopperName}
            </div>
          </div>
          <div class="bazar-item-amount">${Utils.currency(parseFloat(e.amount) || 0)}</div>
        </div>
      `;
    }).join('');

    const cardId = `bazar-exp-card-${date.replace(/-/g, '')}`;
    const isExpanded = this.expandedCard === date;

    return `
      <div class="bazar-day-card ${isExpanded ? 'expanded' : ''}" id="${cardId}">

        <!-- Clickable header row -->
        <div class="bazar-day-card-header" onclick="Messliner.bazar.toggleExpenseCard('${date}', '${cardId}')">

          <!-- Date badge -->
          <div class="bazar-date-badge">${dayNum}</div>

          <!-- Middle: date text + shopper + items -->
          <div class="bazar-card-info">
            <div class="bazar-card-top-row">
              <span class="bazar-card-weekday">${dayOfWeek}</span>
              <span class="bazar-card-fulldate">${formattedDate}</span>
            </div>
            <div class="bazar-card-shopper">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>${shopperLabel}</span>
            </div>
            <div class="bazar-card-preview">${shortPreview || '—'}</div>
          </div>

          <!-- Right: amount + entries + chevron (pushed to far right) -->
          <div class="bazar-card-right">
            <div class="bazar-card-amount">${Utils.currency(dayTotal)}</div>
            <div class="bazar-card-entries">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</div>
            <div class="bazar-chevron">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Expandable detail panel -->
        <div class="bazar-day-card-body">
          <div class="bazar-items-list">
            <div class="bazar-items-header">
              <span>Items &amp; Shopper</span>
              <span>Amount</span>
            </div>
            ${itemRows}
            <div class="bazar-items-total-row">
              <span>Day Total</span>
              <span>${Utils.currency(dayTotal)}</span>
            </div>
          </div>
        </div>

      </div>
    `;
  },

  /**
   * Toggle accordion card expand/collapse in Expense tab
   */
  toggleExpenseCard(date, cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const isCurrentlyExpanded = this.expandedCard === date;

    // Collapse all open cards first
    document.querySelectorAll('#bazarExpenseLogsContainer .bazar-day-card.expanded').forEach(c => {
      c.classList.remove('expanded');
    });

    if (isCurrentlyExpanded) {
      this.expandedCard = null;
    } else {
      card.classList.add('expanded');
      this.expandedCard = date;
    }
  },

  /* ============================================================
     MODALS & ASSIGNMENT ACTIONS
     ============================================================ */

  /**
   * Fetch fresh settings and dining info from Firebase to guarantee accurate managerBazarEnabled state
   */
  async _ensureFreshSettings() {
    const diningId = this.diningId || Messliner.state?.diningId;
    if (!diningId || typeof db === 'undefined') return;

    try {
      const [settingsSnap, infoSnap, usersSnap] = await Promise.all([
        db.ref(`dinings/${diningId}/settings`).once('value'),
        db.ref(`dinings/${diningId}/info`).once('value'),
        db.ref(`dinings/${diningId}/users`).once('value')
      ]);

      const s = settingsSnap.val();
      if (s) {
        this.settings = Object.assign(this.settings || {}, s);
        if (Messliner.state) Messliner.state.settings = Object.assign(Messliner.state.settings || {}, s);
      }

      const info = infoSnap.val();
      if (info) {
        this.diningInfo = info;
        if (info.managerId) this.managerId = info.managerId;
        if (info.adminId) this.adminId = info.adminId;
      }

      const dbUsers = usersSnap.val();
      if (dbUsers) {
        this.users = Object.assign(this.users || {}, dbUsers);
        if (Messliner.state) Messliner.state.users = Object.assign(Messliner.state.users || {}, dbUsers);
      }
    } catch (e) {
      console.warn('[BazarModule] Error fetching fresh settings:', e);
    }
  },

  /**
   * Open Assign Bazar Duty Modal for a specific date
   */
  async openAssignModal(prefillDate) {
    closeModal('bazarDayDetailsModal');
    const modal = document.getElementById('bazarAssignModal');
    if (!modal) return;

    const dateInput = document.getElementById('bazarAssignDate');
    if (dateInput) {
      dateInput.value = prefillDate || new Date().toISOString().slice(0, 10);
    }

    const noteInput = document.getElementById('bazarAssignNote');
    if (noteInput) noteInput.value = '';

    // Populate immediately with cached data, then refresh with fresh db settings
    this.populateMemberSelect('bazarAssignUserSelect');
    openModal('bazarAssignModal');

    await this._ensureFreshSettings();
    this.populateMemberSelect('bazarAssignUserSelect');
  },

  /**
   * Helper to get active members eligible for bazar duty
   * Sorted chronologically by mess joining date (earliest joined first)
   * Respects managerBazarEnabled setting (excludes admin/manager if off)
   */
  getEligibleBazarMembers() {
    const settings = Object.assign(
      {},
      Messliner.settings?.settingsData || {},
      Messliner.state?.settings || {},
      Messliner.diningData?.settings || {},
      Messliner.userDashboard?.settings || {},
      this.settings || {}
    );

    // Check if manager/admin bazar duty is enabled
    const isManagerBazarEnabled = !(
      settings.managerBazarEnabled === false ||
      settings.managerBazarEnabled === 'false' ||
      settings.managerBazar === false ||
      settings.managerBazar === 'false' ||
      settings.bazarRatio === false ||
      settings.bazarRatio === 'false' ||
      settings.bazarDuty === false ||
      settings.bazarDuty === 'false' ||
      settings.joinBazarRotation === false ||
      settings.joinBazarRotation === 'false'
    );

    const managerId = this.managerId || this.adminId || this.diningInfo?.managerId || this.diningInfo?.adminId || Messliner.state?.managerId || Messliner.state?.adminId || Messliner.auth?.userDining?.managerId;

    const parseJoinTimestamp = (u) => {
      const val = u?.createdAt || u?.joinedAt || u?.timestamp || u?.joinDate || u?.created_at || null;
      if (!val) return Number.MAX_SAFE_INTEGER;
      if (typeof val === 'number') return val;
      const t = new Date(val).getTime();
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };

    const eligible = [];
    Object.entries(this.users || {}).forEach(([uid, u]) => {
      if (!u || typeof u !== 'object') return;

      // Filter out inactive / left / removed members
      const status = String(u.status || '').toLowerCase();
      if (status === 'inactive' || status === 'left' || status === 'removed' || status === 'banned' || status === 'blocked') {
        return;
      }
      if (u.isActive === false) return;

      const role = String(u.role || '').toLowerCase();
      const isManager = (
        role === 'admin' ||
        role === 'manager' ||
        u.isAdmin === true ||
        u.isManager === true ||
        (managerId && uid === managerId) ||
        (Messliner.state?.role === 'admin' && uid === Messliner.state?.userId) ||
        (this.role === 'admin' && uid === this.userId)
      );

      // If admin/manager bazar duty is off in settings, exclude admin/manager
      if (isManager && !isManagerBazarEnabled) {
        return;
      }

      // If user has specific bazar duty exclusion flags
      if (
        u.bazarEnabled === false ||
        u.bazarDuty === false ||
        u.managerBazarEnabled === false ||
        u.excludeFromBazar === true ||
        u.isExcludedFromBazar === true
      ) {
        return;
      }

      eligible.push([uid, u, parseJoinTimestamp(u)]);
    });

    // Sort by mess joining date (earliest joined member first)
    eligible.sort((a, b) => {
      if (a[2] !== b[2]) return a[2] - b[2];
      return (a[1]?.name || '').localeCompare(b[1]?.name || '');
    });

    return eligible.map(([uid, u]) => [uid, u]);
  },

  /**
   * Populate a select dropdown with dining members (earliest join first)
   */
  populateMemberSelect(selectId, selectedUserId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const eligibleUsers = this.getEligibleBazarMembers();
    let html = '<option value="">-- Select Member --</option>';
    eligibleUsers.forEach(([uid, u]) => {
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
   * Open Weekly Routine Modal (7-Day Recurring Schedule with Multi-Member Support)
   */
  async openWeeklyRoutineModal() {
    closeModal('bazarDayDetailsModal');
    const weekly = this.rawWeeklyRoutine || {};

    // Copy to temporary state for multi-member editing
    this._tempWeeklyRoutine = {};
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      let val = weekly[dayIdx];
      if (val === undefined || val === null) val = weekly[String(dayIdx)];
      if (val === undefined || val === null) val = weekly[Number(dayIdx)];

      if (!val) {
        this._tempWeeklyRoutine[dayIdx] = [];
      } else if (Array.isArray(val)) {
        this._tempWeeklyRoutine[dayIdx] = [...val];
      } else if (typeof val === 'string') {
        this._tempWeeklyRoutine[dayIdx] = [val];
      } else {
        this._tempWeeklyRoutine[dayIdx] = [];
      }
    }

    this.renderWeeklyRoutineEditor();
    openModal('bazarWeeklyRoutineModal');

    await this._ensureFreshSettings();
    this.renderWeeklyRoutineEditor();
  },

  /**
   * Render Multi-Member Weekly Routine Editor with Auto-Swipe Sequence
   */
  renderWeeklyRoutineEditor() {
    const eligibleUsers = this.getEligibleBazarMembers();

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const selectedUids = this._tempWeeklyRoutine[dayIdx] || [];
      const chipsEl = document.getElementById(`bazarWeeklyChips_${dayIdx}`);
      const selectEl = document.getElementById(`bazarWeeklySelect_${dayIdx}`);
      const countEl = document.getElementById(`bazarWeeklyCount_${dayIdx}`);

      if (countEl) {
        if (selectedUids.length === 0) {
          countEl.innerHTML = `<span class="bazar-weekly-count-tag neutral">No duty</span>`;
        } else if (selectedUids.length === 1) {
          countEl.innerHTML = `<span class="bazar-weekly-count-tag single">1 Member</span>`;
        } else {
          countEl.innerHTML = `
            <button type="button" class="bazar-btn-swipe-order" onclick="Messliner.bazar.shiftWeeklyDayOrder(${dayIdx})" title="Swipe / Shift Rotation Order">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
              <span>Swipe Order</span>
            </button>
          `;
        }
      }

      if (chipsEl) {
        if (selectedUids.length === 0) {
          chipsEl.innerHTML = `<span class="bazar-weekly-empty-text">No member assigned</span>`;
        } else {
          chipsEl.innerHTML = selectedUids.map((uid, idx) => {
            const u = this.users[uid];
            const name = u?.name || 'Member';
            const weekLabel = selectedUids.length > 1 ? `<span class="bazar-weekly-chip-week-badge" title="Duty assigned on Week ${idx + 1} of the month">W${idx + 1}</span>` : '';
            return `
              <span class="bazar-weekly-member-chip">
                ${weekLabel}
                <span class="bazar-weekly-chip-name">${name}</span>
                <button type="button" class="bazar-weekly-chip-remove" onclick="Messliner.bazar.onRemoveMemberFromWeeklyDay(${dayIdx}, '${uid}')" title="Remove">✕</button>
              </span>
            `;
          }).join('');
        }
      }

      if (selectEl) {
        // Filter out already selected members for this day
        const availableUsers = eligibleUsers.filter(([uid]) => !selectedUids.includes(uid));
        let optHtml = `<option value="">+ Add Member</option>`;
        availableUsers.forEach(([uid, u]) => {
          optHtml += `<option value="${uid}">${u?.name || 'Member'}</option>`;
        });
        selectEl.innerHTML = optHtml;
      }
    }
  },

  /**
   * Shift/Swipe rotation order for a specific day in weekly routine editor
   */
  async shiftWeeklyDayOrder(dayIdx) {
    const uids = this._tempWeeklyRoutine[dayIdx];
    if (!uids || uids.length <= 1) return;
    const first = uids.shift();
    uids.push(first);
    this.renderWeeklyRoutineEditor();

    // Prepare full current routine object with normalized keys
    const newRoutine = {};
    for (let d = 0; d < 7; d++) {
      const arr = this._tempWeeklyRoutine[d] || [];
      if (arr.length > 0) newRoutine[d] = [...arr];
    }
    this.rawWeeklyRoutine = newRoutine;
    this.render(); // Instantly update Calendar, Duty Distribution, and Today's Duty in real-time!

    if (this.diningId) {
      try {
        await db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`).set(newRoutine);
      } catch (e) {
        console.error('[BazarModule] Auto-sync swipe error:', e);
      }
    }
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    Notifications.toast('info', 'Roster Swiped', `Shifted weekly rotation order for ${dayNames[dayIdx]}.`);
  },

  /**
   * Shift/Swipe all multi-member weekly days at once
   */
  async shiftAllWeeklyDaysOrder() {
    let shiftedCount = 0;
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const uids = this._tempWeeklyRoutine[dayIdx];
      if (uids && uids.length > 1) {
        const first = uids.shift();
        uids.push(first);
        shiftedCount++;
      }
    }
    this.renderWeeklyRoutineEditor();

    if (shiftedCount > 0) {
      const newRoutine = {};
      for (let d = 0; d < 7; d++) {
        const arr = this._tempWeeklyRoutine[d] || [];
        if (arr.length > 0) newRoutine[d] = [...arr];
      }
      this.rawWeeklyRoutine = newRoutine;
      this.render(); // Instantly update Calendar, Duty Distribution, and Today's Duty in real-time!

      if (this.diningId) {
        try {
          await db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`).set(newRoutine);
        } catch (e) {
          console.error('[BazarModule] Auto-sync swipe error:', e);
        }
      }
      Notifications.toast('info', 'All Rosters Swiped', 'Shifted rotation order for all multi-member days.');
    } else {
      Notifications.toast('warning', 'No Multi-Member Days', 'Add 2 or more members to any day to swipe rotation.');
    }
  },

  /**
   * Quick swipe/shift rotation order directly in Firebase database
   */
  async quickSwipeWeeklyDay(dayOfWeek) {
    if (!this.diningId) return;
    const weekly = this.rawWeeklyRoutine || {};
    let val = weekly[dayOfWeek];
    if (val === undefined || val === null) val = weekly[String(dayOfWeek)];
    if (val === undefined || val === null) val = weekly[Number(dayOfWeek)];
    if (!val || !Array.isArray(val) || val.length <= 1) return;

    const uids = [...val];
    const first = uids.shift();
    uids.push(first);

    const newRoutine = typeof weekly === 'object' ? { ...weekly } : {};
    newRoutine[dayOfWeek] = uids;
    this.rawWeeklyRoutine = newRoutine;
    this.render();

    try {
      await db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`).set(newRoutine);
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      Notifications.toast('success', 'Roster Swiped', `Shifted weekly rotation order for ${dayNames[dayOfWeek]}.`);
      closeModal('bazarDayDetailsModal');
    } catch (err) {
      console.error('[BazarModule] Quick swipe error:', err);
      Notifications.toast('error', 'Error', 'Failed to shift rotation.');
    }
  },

  /**
   * Add member to a specific day in weekly routine
   */
  onAddMemberToWeeklyDay(dayIdx, userId) {
    if (!userId) return;
    if (!this._tempWeeklyRoutine[dayIdx]) {
      this._tempWeeklyRoutine[dayIdx] = [];
    }
    if (!this._tempWeeklyRoutine[dayIdx].includes(userId)) {
      this._tempWeeklyRoutine[dayIdx].push(userId);
    }
    this.renderWeeklyRoutineEditor();
  },

  /**
   * Remove member from a specific day in weekly routine
   */
  onRemoveMemberFromWeeklyDay(dayIdx, userId) {
    if (!this._tempWeeklyRoutine[dayIdx]) return;
    this._tempWeeklyRoutine[dayIdx] = this._tempWeeklyRoutine[dayIdx].filter(uid => uid !== userId);
    this.renderWeeklyRoutineEditor();
  },

  /**
   * Save 7-Day Weekly Routine (Multi-Member support)
   */
  async submitWeeklyRoutine() {
    if (!this.diningId) return;

    const newRoutine = {};
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const uids = this._tempWeeklyRoutine[dayIdx] || [];
      if (uids.length > 0) {
        newRoutine[dayIdx] = [...uids]; // Save as array of member IDs
      }
    }

    this.rawWeeklyRoutine = newRoutine;
    this.render(); // Instant local real-time update

    try {
      await db.ref(`dinings/${this.diningId}/bazarSchedule/weeklyRoutine`).set(newRoutine);
      Notifications.toast('success', 'Weekly Routine Saved', 'Recurring weekly schedule updated with assigned members.');
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
    Utils.setText('bazarDayModalSubtitle', `Bazar duty & expense details`);

    const dutyContainer = document.getElementById('bazarDayModalDutyInfo');
    const entriesContainer = document.getElementById('bazarDayModalEntries');
    const dayTotal = bazarEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const isBazarDone = bazarEntries.length > 0;
    const isAdmin = (this.role === 'admin' || Messliner.state?.role === 'admin');

    if (dutyContainer) {
      dutyContainer.innerHTML = `
        <!-- Section 1: Assigned Duty Member -->
        <div style="margin-bottom: 14px;">
          <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 6px;">
            Duty Assigned
          </div>
          ${duty ? `
            <div style="padding: 10px 14px; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 0.72rem; font-weight: 700; color: #059669;">
                  ${duty.isOverride ? '● Specific Day Assignment' : (duty.isRotated ? `🔄 ${duty.note}` : '● Recurring Weekly Schedule')}
                </span>
                ${isAdmin ? `
                  <div style="display: flex; gap: 6px;">
                    ${duty.allRotationMembers && duty.allRotationMembers.length > 1 && !duty.isOverride ? `
                      <button type="button" class="btn btn-sm btn-outline" style="padding: 3px 8px; font-size: 0.75rem;" onclick="Messliner.bazar.quickSwipeWeeklyDay(${dayOfWeek})" title="Shift weekly rotation sequence">⇄ Swipe Order</button>
                    ` : ''}
                    <button type="button" class="btn btn-sm btn-outline" style="padding: 3px 8px; font-size: 0.75rem;" onclick="Messliner.bazar.openAssignModal('${dateStr}')">Change</button>
                    ${duty.isOverride ? `
                      <button type="button" class="btn btn-sm btn-danger-outline" style="padding: 3px 8px; font-size: 0.75rem;" onclick="Messliner.bazar.removeDateDuty('${dateStr}')">Reset</button>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(duty.members && duty.members.length > 0 ? duty.members : [{ userName: duty.userName, userAvatar: duty.userAvatar }]).map(m => `
                  <div style="display: flex; align-items: center; gap: 10px; background: #ffffff; padding: 6px 10px; border-radius: 8px; border: 1px solid #F1F5F9;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #059669; color: #ffffff; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
                      ${m.userAvatar ? `<img src="${m.userAvatar}" alt="${m.userName}" style="width:100%; height:100%; object-fit:cover;">` : this.getInitials(m.userName)}
                    </div>
                    <div>
                      <h4 style="font-size: 0.88rem; font-weight: 800; color: #0F172A; margin: 0;">${m.userName}</h4>
                    </div>
                  </div>
                `).join('')}
              </div>
              ${duty.allRotationMembers && duty.allRotationMembers.length > 1 && !duty.isOverride ? `
                <div style="font-size: 0.72rem; color: #64748B; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #E2E8F0;">
                  Full Rotation Roster: ${duty.allRotationMembers.map((m, idx) => `<strong style="${idx === duty.rotationIndex ? 'color: #059669;' : 'color: #64748B;'}">W${idx + 1}: ${m.userName}</strong>`).join(' · ')}
                </div>
              ` : (duty.note ? `<p style="font-size: 0.75rem; color: #64748B; margin: 6px 0 0; font-style: italic;">"${duty.note}"</p>` : '')}
            </div>
          ` : `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 14px;">
              <div style="display: flex; align-items: center; gap: 8px; color: #64748B; font-size: 0.84rem; font-weight: 600;">
                <span style="font-size: 1.1rem; opacity: 0.6;">👤</span>
                No member assigned for this date
              </div>
              ${isAdmin ? `
                <button type="button" class="btn btn-sm btn-primary" style="padding: 4px 12px; font-size: 0.78rem;" onclick="Messliner.bazar.openAssignModal('${dateStr}')">+ Assign Duty</button>
              ` : ''}
            </div>
          `}
        </div>

        <!-- Section 2: Bazar Shopping Status -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">
              Bazar Expense Status
            </div>
            ${isBazarDone ? `
              <span style="font-size: 0.72rem; font-weight: 700; color: #059669; background: #ECFDF5; padding: 2px 8px; border-radius: 99px;">
                ✓ Bazar Completed
              </span>
            ` : `
              <span style="font-size: 0.72rem; font-weight: 700; color: #64748B; background: #F1F5F9; padding: 2px 8px; border-radius: 99px;">
                Pending / Not Done
              </span>
            `}
          </div>

          ${isBazarDone ? `
            <div style="background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 14px; padding: 12px 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #E2E8F0;">
                <span style="font-size: 0.82rem; font-weight: 700; color: #475569;">Total Cost for Date:</span>
                <span style="font-size: 1.15rem; font-weight: 800; color: #059669; font-family: monospace;">${Utils.currency(dayTotal)}</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${bazarEntries.map(e => `
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.84rem; background: #ffffff; padding: 8px 10px; border-radius: 8px; border: 1px solid #F1F5F9;">
                    <div>
                      <div style="font-weight: 700; color: #0F172A;">${e.title || e.name || 'Bazar Item'}</div>
                      <div style="font-size: 0.74rem; color: #64748B;">Shopper: ${e.userName || this.users[e.userId]?.name || 'Member'} ${e.quantity ? `• ${e.quantity}` : ''}</div>
                    </div>
                    <span style="font-weight: 800; color: #059669; font-family: monospace;">${Utils.currency(e.amount)}</span>
                  </div>
                `).join('')}
              </div>
              ${isAdmin ? `
                <div style="margin-top: 10px; text-align: right;">
                  <button type="button" class="btn btn-sm btn-outline" style="font-size: 0.76rem;" onclick="Messliner.bazar.quickLogBazarForDate('${dateStr}')">+ Add More Items</button>
                </div>
              ` : ''}
            </div>
          ` : `
            <div style="padding: 18px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; text-align: center;">
              <p style="font-size: 0.82rem; color: #64748B; margin: 0 0 10px;">No grocery expenses have been recorded for this day yet.</p>
              ${isAdmin ? `
                <button type="button" class="btn btn-sm btn-outline" style="padding: 6px 14px; font-size: 0.82rem;" onclick="Messliner.bazar.quickLogBazarForDate('${dateStr}')">+ Log Bazar Expense</button>
              ` : ''}
            </div>
          `}
        </div>
      `;
    }

    if (entriesContainer) {
      entriesContainer.innerHTML = '';
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
      if (dateInput) {
        dateInput.value = targetDate;
        const dateDisplay = document.getElementById('bazarDateFormattedDisplay');
        if (dateDisplay && Messliner.finance?.formatDateToDisplay) {
          dateDisplay.textContent = Messliner.finance.formatDateToDisplay(targetDate);
        }
      }
      if (Messliner.finance && Messliner.finance.populateBazarShopperSelect) {
        Messliner.finance.populateBazarShopperSelect(targetDate);
      }
      if (Messliner.finance && Messliner.finance.validateBazarForm) {
        Messliner.finance.validateBazarForm();
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
