/* ============================================
   Messliner — Finance Management (admin/finance.js)
   ============================================ */

const FinanceModule = {
  deposits: {},
  bazarList: {},
  currentFilter: 'all',
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  createdDate: null,
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /**
   * Initialize finance module with realtime listeners
   */
  init(diningId, initialData) {
    this.diningId = diningId;

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

    // Realtime listener for historyStartDate setting updates
    db.ref(`dinings/${diningId}/settings/historyStartDate`).on('value', snap => {
      const val = snap.val();
      if (val) {
        this.createdDate = new Date(val);
      } else {
        const ca = Messliner.diningData?.info?.createdAt || initialData?.info?.createdAt;
        this.createdDate = ca ? new Date(ca) : new Date(2026, 0, 1);
      }
      this.populateDropdowns();
      if (Router.currentPage === 'finance') {
        this.renderTransactions();
      }
    });

    if (!startDateStr && !createdAt) {
      db.ref(`dinings/${diningId}/info/createdAt`).once('value').then(infoSnap => {
        const ca = infoSnap.val();
        if (ca && !this.createdDate) {
          this.createdDate = new Date(ca);
          this.populateDropdowns();
        }
      }).catch(() => {});
    }

    if (initialData?.deposits) {
      this.deposits = initialData.deposits;
    } else {
      this.deposits = {};
    }
    if (initialData?.bazar) {
      this.bazarList = initialData.bazar;
    } else {
      this.bazarList = {};
    }

    this.populateDropdowns();

    if (Router.currentPage === 'finance' && (Object.keys(this.deposits).length > 0 || Object.keys(this.bazarList).length > 0)) {
      this.refresh();
    }

    // Listen to deposits
    db.ref(`dinings/${diningId}/deposits`).orderByChild('timestamp').on('value', (snap) => {
      this.deposits = {};
      snap.forEach(child => {
        this.deposits[child.key] = child.val();
      });
      if (Router.currentPage === 'finance') {
        this.refresh();
      }
    });

    // Listen to bazar costs
    db.ref(`dinings/${diningId}/bazar`).orderByChild('timestamp').on('value', (snap) => {
      this.bazarList = {};
      snap.forEach(child => {
        this.bazarList[child.key] = child.val();
      });
      if (Router.currentPage === 'finance') {
        this.refresh();
      }
    });
  },

  /**
   * Show deposit modal
   */
  showDepositModal() {
    this._isSavingDeposit = false;
    document.getElementById('depositForm')?.reset();
    const btn = document.getElementById('depositSubmitBtn');
    this.resetBtnInstantLoading(btn, 'Add Deposit');
    const titleEl = document.getElementById('depositModalTitle');
    if (titleEl) titleEl.textContent = 'Add deposit';
    this.selectDepositUser('');
    this._populateUserSelect('depositUserSelect');
    this.validateDepositForm();
    openModal('depositModal');
  },

  /**
   * Show deduct modal
   */
  showDeductModal() {
    this._isSavingDeduct = false;
    document.getElementById('deductForm')?.reset();
    const btn = document.getElementById('deductSubmitBtn');
    this.resetBtnInstantLoading(btn, 'Deduct Balance');
    this.selectDeductUser('');
    this._populateUserSelect('deductUserSelect');
    this.validateDeductForm();
    openModal('deductModal');
  },

  /**
   * Format YYYY-MM-DD to DD-MMM-YYYY (e.g. 08-Oct-2026)
   */
  formatDateToDisplay(dateStr) {
    if (!dateStr) return 'Select Date';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          const dayFormatted = String(d.getDate()).padStart(2, '0');
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return `${dayFormatted}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
        }
      }
    } catch (e) {
      console.warn('Date formatting error:', e);
    }
    return dateStr;
  },

  bazarCalViewYear: undefined,
  bazarCalViewMonth: undefined,

  /**
   * Toggle custom calendar popup for Bazar modal
   */
  toggleBazarCalendar(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('bazarDateCalendarPopup');
    if (!popup) return;
    if (popup.style.display !== 'none') {
      this.closeBazarCalendar();
    } else {
      this.openBazarCalendar();
    }
  },

  openBazarCalendar() {
    const popup = document.getElementById('bazarDateCalendarPopup');
    if (!popup) return;
    const curDate = document.getElementById('bazarDateInput')?.value || Utils.today();
    const [y, m] = curDate.split('-').map(Number);
    this.bazarCalViewYear = y || new Date().getFullYear();
    this.bazarCalViewMonth = (m !== undefined && !isNaN(m)) ? (m - 1) : new Date().getMonth();
    this.renderBazarCalendarPopup();
    popup.style.display = 'block';
  },

  closeBazarCalendar() {
    const popup = document.getElementById('bazarDateCalendarPopup');
    if (popup) popup.style.display = 'none';
  },

  navBazarCalendarMonth(dir, e) {
    if (e) e.stopPropagation();
    if (this.bazarCalViewMonth === undefined) this.bazarCalViewMonth = new Date().getMonth();
    if (this.bazarCalViewYear === undefined) this.bazarCalViewYear = new Date().getFullYear();

    this.bazarCalViewMonth += dir;
    if (this.bazarCalViewMonth < 0) {
      this.bazarCalViewMonth = 11;
      this.bazarCalViewYear--;
    } else if (this.bazarCalViewMonth > 11) {
      this.bazarCalViewMonth = 0;
      this.bazarCalViewYear++;
    }
    this.renderBazarCalendarPopup();
  },

  renderBazarCalendarPopup() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const titleEl = document.getElementById('bazarCalMonthYearTitle');
    if (titleEl) {
      titleEl.textContent = `${monthNames[this.bazarCalViewMonth]} ${this.bazarCalViewYear}`;
    }

    const gridEl = document.getElementById('bazarCalDaysGrid');
    if (!gridEl) return;

    const selectedDate = document.getElementById('bazarDateInput')?.value || Utils.today();
    const todayDate = Utils.today();

    const year = this.bazarCalViewYear;
    const month = this.bazarCalViewMonth;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let html = '';

    // Prev month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = daysInPrevMonth - i;
      let prevM = month - 1;
      let prevY = year;
      if (prevM < 0) { prevM = 11; prevY--; }
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.finance.selectBazarCalendarDate('${dateStr}', event)">${dNum}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayDate;

      let cls = 'cal-day-cell';
      if (isSelected) cls += ' selected';
      if (isToday) cls += ' today';

      html += `<div class="${cls}" onclick="Messliner.finance.selectBazarCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    // Next month leading days
    const totalCells = firstDayIndex + daysInMonth;
    const nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let j = 1; j <= nextDays; j++) {
      let nextM = month + 1;
      let nextY = year;
      if (nextM > 11) { nextM = 0; nextY++; }
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.finance.selectBazarCalendarDate('${dateStr}', event)">${j}</div>`;
    }

    gridEl.innerHTML = html;
  },

  selectBazarCalendarDate(dateStr, e) {
    if (e) e.stopPropagation();
    this.setBazarDate(dateStr);
    this.closeBazarCalendar();
  },

  setBazarDate(dateStr) {
    if (!dateStr) dateStr = Utils.today();
    const dateInput = document.getElementById('bazarDateInput');
    if (dateInput) dateInput.value = dateStr;
    const dateDisplay = document.getElementById('bazarDateFormattedDisplay');
    if (dateDisplay) {
      dateDisplay.textContent = this.formatDateToDisplay(dateStr);
    }
    this.populateBazarShopperSelect(dateStr);
    this.validateBazarForm();
  },

  setBazarTodayDate(e) {
    if (e) e.stopPropagation();
    this.selectBazarCalendarDate(Utils.today(), e);
  },

  triggerBazarDatePicker(e) {
    this.toggleBazarCalendar(e);
  },

  /**
   * Reset bazar modal state back to default Add mode
   */
  resetBazarModal() {
    const editKeyInput = document.getElementById('bazarEditKey');
    if (editKeyInput) editKeyInput.value = '';
    const modalTitle = document.getElementById('bazarModalTitle');
    if (modalTitle) modalTitle.textContent = 'Log bazar';
    const modalSubtitle = document.getElementById('bazarModalSubtitle');
    if (modalSubtitle) modalSubtitle.textContent = 'Rate recalculates automatically once saved';
    const submitBtn = document.getElementById('bazarSubmitBtn');
    if (submitBtn) {
      submitBtn.classList.remove('btn-loading-state');
      submitBtn.innerHTML = 'Add Bazar';
    }
  },

  /**
   * Show bazar modal
   */
  showBazarModal(dateStr) {
    document.getElementById('bazarForm')?.reset();
    const dd = document.getElementById('bazarShopperDropdown');
    if (dd) dd.classList.remove('active');
    this.closeBazarCalendar();
    this.resetBazarModal();

    const targetDate = dateStr || Utils.today();
    const dateInput = document.getElementById('bazarDateInput');
    const dateDisplay = document.getElementById('bazarDateFormattedDisplay');
    if (dateInput) dateInput.value = targetDate;
    if (dateDisplay) dateDisplay.textContent = this.formatDateToDisplay(targetDate);

    this.populateBazarShopperSelect(targetDate);
    this.validateBazarForm();
    openModal('bazarModal');
  },

  /**
   * Show edit modal for existing bazar record
   */
  async showEditBazarModal(bazarKey, entryData) {
    if (!bazarKey) return;

    const diningId = this.diningId || Messliner.state?.diningId;
    let entry = entryData;
    if (!entry) {
      if (Messliner.bazar?.rawBazarData && Messliner.bazar.rawBazarData[bazarKey]) {
        entry = Messliner.bazar.rawBazarData[bazarKey];
      } else if (diningId && typeof db !== 'undefined') {
        try {
          const snap = await db.ref(`dinings/${diningId}/bazar/${bazarKey}`).once('value');
          entry = snap.val();
        } catch (e) {
          console.error('[Finance] Error fetching bazar entry for edit:', e);
        }
      }
    }

    if (!entry) {
      Notifications.toast('error', 'Not Found', 'Bazar record could not be found.');
      return;
    }

    // Reset calendar & dropdown
    const dd = document.getElementById('bazarShopperDropdown');
    if (dd) dd.classList.remove('active');
    this.closeBazarCalendar();

    // Set Edit Mode
    let editKeyInput = document.getElementById('bazarEditKey');
    if (!editKeyInput) {
      const form = document.getElementById('bazarForm');
      if (form) {
        editKeyInput = document.createElement('input');
        editKeyInput.type = 'hidden';
        editKeyInput.id = 'bazarEditKey';
        form.appendChild(editKeyInput);
      }
    }
    if (editKeyInput) editKeyInput.value = bazarKey;

    const modalTitle = document.getElementById('bazarModalTitle');
    if (modalTitle) modalTitle.textContent = 'Edit Bazar';
    const modalSubtitle = document.getElementById('bazarModalSubtitle');
    if (modalSubtitle) modalSubtitle.textContent = 'Modify details and save updates';

    const submitBtn = document.getElementById('bazarSubmitBtn');
    if (submitBtn) {
      submitBtn.classList.remove('btn-loading-state');
      submitBtn.innerHTML = 'Save Changes';
    }

    // Date
    const targetDate = entry.date || (entry.timestamp ? new Date(entry.timestamp).toISOString().slice(0, 10) : Utils.today());
    const dateInput = document.getElementById('bazarDateInput');
    const dateDisplay = document.getElementById('bazarDateFormattedDisplay');
    if (dateInput) dateInput.value = targetDate;
    if (dateDisplay) dateDisplay.textContent = this.formatDateToDisplay(targetDate);

    // Find shopper userId if missing
    let targetShopperUserId = entry.userId || '';
    if (!targetShopperUserId && entry.shopperName) {
      const allUsers = (Messliner.users && Messliner.users.users) ||
        (window.UsersModule && window.UsersModule.users) ||
        (Messliner.bazar && Messliner.bazar.users) ||
        (Messliner.state && Messliner.state.users) || {};
      const found = Object.entries(allUsers).find(([uid, u]) => (u.name || '').toLowerCase() === (entry.shopperName || '').toLowerCase());
      if (found) targetShopperUserId = found[0];
    }

    await this.populateBazarShopperSelect(targetDate, targetShopperUserId);

    if (!targetShopperUserId && entry.shopperName) {
      const shopperInput = document.getElementById('bazarShopperInput');
      const valueEl = document.getElementById('bazarShopperValue');
      if (shopperInput) shopperInput.value = entry.shopperName;
      if (valueEl) valueEl.textContent = entry.shopperName;
    }

    // Amount & Items
    const amtInput = document.getElementById('bazarAmountInput');
    if (amtInput) amtInput.value = entry.amount || '';

    const itemsInput = document.getElementById('bazarItemsInput');
    if (itemsInput) itemsInput.value = entry.items || entry.title || entry.name || '';

    this.validateBazarForm();
    openModal('bazarModal');
  },

  /**
   * Populate Shopper member dropdown (sorted by join time, showing only name) and auto-select assigned duty member
   */
  async populateBazarShopperSelect(targetDate, forceUserId = null) {
    const menuEl = document.getElementById('bazarShopperMenu');
    const valueEl = document.getElementById('bazarShopperValue');
    const userIdInput = document.getElementById('bazarShopperUserId');
    const shopperInput = document.getElementById('bazarShopperInput');
    if (!menuEl) return;

    const diningId = this.diningId || Messliner.state?.diningId;
    let users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    if (Object.keys(users).length === 0 && diningId && typeof db !== 'undefined') {
      try {
        const uSnap = await db.ref(`dinings/${diningId}/users`).once('value');
        if (uSnap.val()) users = uSnap.val();
      } catch (e) {}
    }

    const dateStr = targetDate || document.getElementById('bazarDateInput')?.value || Utils.today();
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = isNaN(d.getDay()) ? (new Date()).getDay() : d.getDay();
    const yearMonth = dateStr.slice(0, 7);

    // Fetch or check settings for managerBazarEnabled
    let settings = Object.assign(
      {},
      Messliner.settings?.settingsData || {},
      Messliner.state?.settings || {},
      Messliner.diningData?.settings || {},
      Messliner.userDashboard?.settings || {}
    );
    let managerId = Messliner.state?.managerId || Messliner.state?.adminId || Messliner.diningData?.info?.managerId || Messliner.diningData?.info?.adminId;

    if (diningId && typeof db !== 'undefined') {
      try {
        const [sSnap, infoSnap] = await Promise.all([
          db.ref(`dinings/${diningId}/settings`).once('value'),
          db.ref(`dinings/${diningId}/info`).once('value')
        ]);
        if (sSnap.val()) settings = Object.assign(settings, sSnap.val());
        if (infoSnap.val()) {
          const info = infoSnap.val();
          if (info.managerId) managerId = info.managerId;
          if (info.adminId) managerId = info.adminId;
        }
      } catch (e) {}
    }

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

    // Filter and sort users by join date (earliest join first)
    const userEntries = Object.entries(users).filter(([id, u]) => {
      if (!u || typeof u !== 'object') return false;
      const status = String(u.status || '').toLowerCase();
      if (status === 'inactive' || status === 'left' || status === 'removed' || status === 'banned' || status === 'blocked') {
        return false;
      }
      if (u.isActive === false) return false;

      const role = String(u.role || '').toLowerCase();
      const isManager = (
        role === 'admin' ||
        role === 'manager' ||
        u.isAdmin === true ||
        u.isManager === true ||
        (managerId && id === managerId) ||
        (Messliner.state?.role === 'admin' && id === Messliner.state?.userId)
      );
      if (isManager && !isManagerBazarEnabled) {
        return false;
      }
      if (u.bazarEnabled === false || u.bazarDuty === false || u.managerBazarEnabled === false || u.excludeFromBazar === true || u.isExcludedFromBazar === true) {
        return false;
      }
      return true;
    });

    userEntries.sort((a, b) => {
      const timeA = a[1].createdAt ? new Date(a[1].createdAt).getTime() : (a[1].joinedAt ? new Date(a[1].joinedAt).getTime() : (a[1].timestamp || 0));
      const timeB = b[1].createdAt ? new Date(b[1].createdAt).getTime() : (b[1].joinedAt ? new Date(b[1].joinedAt).getTime() : (b[1].timestamp || 0));
      if (timeA !== timeB) return timeA - timeB;
      return (a[1].name || '').localeCompare(b[1].name || '');
    });

    // Try synchronous duty resolution first
    let assignedUserId = forceUserId || '';
    if (!assignedUserId && Messliner.bazar && typeof Messliner.bazar.resolveDutyForDate === 'function') {
      try {
        const duty = Messliner.bazar.resolveDutyForDate(dateStr, dayOfWeek);
        if (duty && duty.userId) {
          assignedUserId = duty.userId;
        }
      } catch (e) {
        console.warn('Error resolving duty for date:', e);
      }
    }

    const renderItems = (activeUserId) => {
      let html = `
        <div class="custom-dropdown-item ${!activeUserId ? 'selected' : ''}" data-value=""
             onclick="Messliner.finance.selectBazarShopper('')">Select Member</div>
      `;

      userEntries.forEach(([id, u]) => {
        const isSel = (id === activeUserId);
        const selClass = isSel ? 'selected' : '';
        const memberName = u.name || 'Member';
        html += `
          <div class="custom-dropdown-item ${selClass}" data-value="${id}"
               onclick="Messliner.finance.selectBazarShopper('${id}')">${memberName}</div>
        `;
      });

      menuEl.innerHTML = html;

      if (activeUserId && users[activeUserId]) {
        const u = users[activeUserId];
        const memberName = u.name || 'Member';
        if (valueEl) valueEl.textContent = memberName;
        if (userIdInput) userIdInput.value = activeUserId;
        if (shopperInput) shopperInput.value = memberName;
      } else {
        if (valueEl) valueEl.textContent = 'Select Member';
        if (userIdInput) userIdInput.value = '';
        if (shopperInput) shopperInput.value = '';
      }
      this.validateBazarForm();
    };

    renderItems(assignedUserId);

    // If no assigned user found synchronously, or if schedule data might not be loaded in BazarModule for this month, fetch from Firebase
    if (!forceUserId && diningId && typeof db !== 'undefined') {
      try {
        const daySnap = await db.ref(`dinings/${diningId}/bazarSchedule/${yearMonth}/${dateStr}`).once('value');
        const dayDuty = daySnap.val();
        if (dayDuty && dayDuty.userId && users[dayDuty.userId]) {
          if (dayDuty.userId !== (userIdInput ? userIdInput.value : '')) {
            renderItems(dayDuty.userId);
          }
          return;
        }

        // If no day override, check weekly routine
        if (!assignedUserId) {
          const weeklySnap = await db.ref(`dinings/${diningId}/bazarSchedule/weeklyRoutine/${dayOfWeek}`).once('value');
          const weeklyUserId = weeklySnap.val();
          if (weeklyUserId && users[weeklyUserId]) {
            if (weeklyUserId !== (userIdInput ? userIdInput.value : '')) {
              renderItems(weeklyUserId);
            }
          }
        }
      } catch (err) {
        console.warn('Error fetching duty schedule:', err);
      }
    }
  },

  /**
   * Select a member from the custom dropdown in Bazar modal
   */
  selectBazarShopper(userId) {
    const dd = document.getElementById('bazarShopperDropdown');
    if (dd) dd.classList.remove('active');

    const users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    const valueEl = document.getElementById('bazarShopperValue');
    const userIdInput = document.getElementById('bazarShopperUserId');
    const shopperInput = document.getElementById('bazarShopperInput');
    const menuEl = document.getElementById('bazarShopperMenu');

    if (userId && users[userId]) {
      const u = users[userId];
      const memberName = u.name || 'Member';
      if (valueEl) valueEl.textContent = memberName;
      if (userIdInput) userIdInput.value = userId;
      if (shopperInput) shopperInput.value = memberName;
    } else {
      if (valueEl) valueEl.textContent = 'Select Member';
      if (userIdInput) userIdInput.value = '';
      if (shopperInput) shopperInput.value = '';
    }

    if (menuEl) {
      menuEl.querySelectorAll('.custom-dropdown-item').forEach(item => {
        item.classList.toggle('selected', item.getAttribute('data-value') === (userId || ''));
      });
    }

    this.validateBazarForm();
  },

  /**
   * Triggered when Bazar date input changes
   */
  onBazarDateChange(newVal) {
    const dateInput = document.getElementById('bazarDateInput');
    const val = newVal || (dateInput ? dateInput.value : '');
    const dateDisplay = document.getElementById('bazarDateFormattedDisplay');
    if (dateDisplay) {
      dateDisplay.textContent = this.formatDateToDisplay(val);
    }
    if (val) {
      this.populateBazarShopperSelect(val);
    }
    this.validateBazarForm();
  },

  /**
   * Filter keydown events on amount input to only allow numbers and decimal point
   */
  filterNumberKey(e) {
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) ||
      (e.ctrlKey === true || e.metaKey === true)) {
      return;
    }
    if ((e.key < '0' || e.key > '9') && e.key !== '.') {
      e.preventDefault();
      return;
    }
    if (e.key === '.' && e.target.value.includes('.')) {
      e.preventDefault();
    }
  },

  /**
   * Sanitize amount input to strictly contain only numbers and at most one decimal point
   */
  sanitizeAmountInput(input) {
    if (!input) return;
    let val = input.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }
    if (input.value !== val) {
      input.value = val;
    }
    this.validateBazarForm();
  },

  /**
   * Validate Bazar Form and toggle Add Bazar submit button disabled state
   */
  validateBazarForm() {
    const date = document.getElementById('bazarDateInput')?.value;
    const shopperUserId = document.getElementById('bazarShopperUserId')?.value;
    const shopperInput = document.getElementById('bazarShopperInput')?.value;
    const amountVal = parseFloat(document.getElementById('bazarAmountInput')?.value);
    const items = document.getElementById('bazarItemsInput')?.value.trim();

    const isValid = Boolean(
      date &&
      (shopperUserId || shopperInput) &&
      !isNaN(amountVal) && amountVal > 0 &&
      items && items.length > 0
    );

    const submitBtn = document.getElementById('bazarSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = !isValid;
    }
    return isValid;
  },

  /**
   * Show Other Costing modal
   */
  async showOtherCostingModal() {
    this._isSavingOtherCosting = false;
    document.getElementById('otherCostingForm')?.reset();
    const btn = document.getElementById('otherCostingSubmitBtn');
    this.resetBtnInstantLoading(btn, 'Apply Costing');
    const splitInfo = document.getElementById('otherCostingSplitInfo');
    if (splitInfo) splitInfo.style.display = 'none';

    const checklist = document.getElementById('otherCostingMembersChecklist');
    const selectAll = document.getElementById('otherCostingSelectAll');
    if (selectAll) selectAll.checked = false;

    const diningId = this.diningId || Messliner.state?.diningId;
    let users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    if (Object.keys(users).length === 0 && diningId && typeof db !== 'undefined') {
      try {
        const uSnap = await db.ref(`dinings/${diningId}/users`).once('value');
        if (uSnap.val()) users = uSnap.val();
      } catch (e) {}
    }

    const settings = (window.UsersModule && UsersModule.settings) || Messliner.state?.settings || {};
    const isManagerMealEnabled = !!settings.managerMealEnabled;

    if (!users || Object.keys(users).length === 0) {
      Notifications.toast('warning', 'No Members', 'No members found. Please add members first.');
      return;
    }

    if (checklist) {
      checklist.innerHTML = Object.entries(users)
        .filter(([id, u]) => (u.role !== 'admin' || isManagerMealEnabled) && u.status !== 'left' && u.status !== 'removed')
        .map(([id, u]) => {
          return `
            <label class="members-checklist-item" for="member_check_${id}" style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid #E2E8F0;cursor:pointer;">
              <div class="members-checklist-avatar member-tia-avatar" style="width:32px;height:32px;border-radius:50%;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;">
                ${Utils.initials(u.name)}
              </div>
              <div class="members-checklist-info" style="flex:1;min-width:0;">
                <div class="members-checklist-name" style="font-size:0.9rem;font-weight:600;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
              </div>
              <input type="checkbox" id="member_check_${id}" value="${id}" class="members-checklist-checkbox"
                onchange="Messliner.finance.updateOtherCostingSplit(); Messliner.finance.validateOtherCostingForm();" style="accent-color:#059669;cursor:pointer;width:16px;height:16px;">
            </label>
          `;
        }).join('');
    }

    openModal('otherCostingModal');
    this.validateOtherCostingForm();
  },

  /**
   * Toggle Select All checkboxes for Other Costing
   */
  toggleSelectAllOtherCosting(source) {
    const checkboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
    this.updateOtherCostingSplit();
    this.validateOtherCostingForm();
  },

  /**
   * Update real-time split info preview
   */
  updateOtherCostingSplit() {
    const amountVal = document.getElementById('otherCostingAmountInput')?.value?.replace(/,/g, '') || '';
    const amount = parseFloat(amountVal) || 0;
    const checkboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox:checked');
    const count = checkboxes.length;
    const splitInfo = document.getElementById('otherCostingSplitInfo');
    const splitText = document.getElementById('otherCostingSplitText');
    const selectAll = document.getElementById('otherCostingSelectAll');

    // Sync select-all checkbox
    const allCheckboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox');
    if (selectAll && allCheckboxes.length > 0) {
      selectAll.checked = (count === allCheckboxes.length && count > 0);
      selectAll.indeterminate = (count > 0 && count < allCheckboxes.length);
    }

    if (splitInfo && splitText) {
      if (amount > 0 && count > 0) {
        const splitAmount = amount / count;
        splitInfo.style.display = 'flex';
        splitText.textContent = `${Utils.currency(amount)} ÷ ${count} member${count > 1 ? 's' : ''} = ${Utils.currency(splitAmount)} each`;
      } else {
        splitInfo.style.display = amount > 0 || count > 0 ? 'flex' : 'none';
        if (amount <= 0 && count > 0) {
          splitText.textContent = 'Enter an amount to see the split';
        } else if (amount > 0 && count === 0) {
          splitText.textContent = 'Select at least one member';
        }
      }
    }

    this.validateOtherCostingForm();
  },

  /**
   * Validate Other Costing Form and toggle Apply Costing submit button disabled state
   */
  validateOtherCostingForm() {
    const amountVal = parseFloat(document.getElementById('otherCostingAmountInput')?.value?.replace(/,/g, ''));
    const reason = document.getElementById('otherCostingReasonInput')?.value?.trim() || '';
    const checkedCount = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox:checked').length;

    const isValid = Boolean(
      checkedCount > 0 &&
      !isNaN(amountVal) && amountVal > 0 &&
      reason.length > 0
    );

    const submitBtn = document.getElementById('otherCostingSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = !isValid;
    }
    return isValid;
  },

  /**
   * Save Other Costing - splits equally across selected members
   */
  async saveOtherCosting() {
    if (this._isSavingOtherCosting) return;

    if (window.MesslinerSubscription && typeof MesslinerSubscription.assertCanWrite === 'function') {
      if (!MesslinerSubscription.assertCanWrite()) return;
    }

    const amountVal = document.getElementById('otherCostingAmountInput')?.value?.replace(/,/g, '') || '';
    const amount = parseFloat(amountVal);
    const reason = document.getElementById('otherCostingReasonInput')?.value?.trim();
    const checkboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox:checked');
    const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);
    const submitBtn = document.getElementById('otherCostingSubmitBtn');

    if (!amount || isNaN(amount) || amount <= 0) {
      this.resetBtnInstantLoading(submitBtn, 'Apply Costing');
      this.validateOtherCostingForm();
      Notifications.toast('warning', 'Invalid Input', 'Please enter a valid total amount.');
      return;
    }
    if (!reason) {
      this.resetBtnInstantLoading(submitBtn, 'Apply Costing');
      this.validateOtherCostingForm();
      Notifications.toast('warning', 'Invalid Input', 'Please enter a reason / description.');
      return;
    }
    if (selectedUserIds.length === 0) {
      this.resetBtnInstantLoading(submitBtn, 'Apply Costing');
      this.validateOtherCostingForm();
      Notifications.toast('warning', 'No Members Selected', 'Please select at least one member.');
      return;
    }

    const diningId = this.diningId || Messliner.state?.diningId;
    if (!diningId) {
      this.resetBtnInstantLoading(submitBtn, 'Apply Costing');
      Notifications.toast('error', 'Error', 'Dining group not found.');
      return;
    }

    this._isSavingOtherCosting = true;
    if (submitBtn) {
      submitBtn.classList.add('btn-loading-state');
      submitBtn.innerHTML = `<span class="bazar-btn-spinner"></span><span>Applying Costing...</span>`;
    }

    const splitAmount = amount / selectedUserIds.length;
    let users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    if (Object.keys(users).length === 0 && typeof db !== 'undefined') {
      try {
        const uSnap = await db.ref(`dinings/${diningId}/users`).once('value');
        if (uSnap.val()) users = uSnap.val();
      } catch (e) {}
    }

    const today = Utils.today();

    try {
      const batchId = 'oc_' + Date.now();
      const updates = {};
      const now = firebase.database.ServerValue.TIMESTAMP;

      // Prepare atomic multi-path update for instant write
      selectedUserIds.forEach(userId => {
        const user = users[userId] || {};
        const currentDeposit = Utils.num(user.totalDeposit);
        const newKey = db.ref(`dinings/${diningId}/deposits`).push().key;

        updates[`dinings/${diningId}/deposits/${newKey}`] = {
          batchId,
          userId,
          userName: user.name || 'Unknown',
          amount: -splitAmount,
          type: 'other_costing',
          note: reason,
          date: today,
          timestamp: now
        };
        updates[`dinings/${diningId}/users/${userId}/totalDeposit`] = currentDeposit - splitAmount;
      });

      await db.ref().update(updates);

      Notifications.toast('success', 'Other Costing Applied',
        `${Utils.currency(amount)} split among ${selectedUserIds.length} member${selectedUserIds.length > 1 ? 's' : ''} (${Utils.currency(splitAmount)} each).`);
      closeModal('otherCostingModal');
      document.getElementById('otherCostingForm')?.reset();

      if (window.UserDashboard && typeof UserDashboard.renderStats === 'function') {
        UserDashboard.renderStats();
      }
      if (window.OverviewModule && typeof OverviewModule.refresh === 'function') {
        OverviewModule.refresh();
      }

      // Non-blocking notifications & activity log
      try {
        const memberNames = selectedUserIds.map(id => users[id]?.name || 'Unknown').join(', ');
        Notifications.log(
          diningId, 'other_costing_added',
          `Other Costing ৳${amount} (${reason}) split among: ${memberNames}`,
          Messliner.state?.userId
        ).catch(() => {});
      } catch (e) {}

      selectedUserIds.forEach(userId => {
        try {
          Notifications.create(
            diningId, 'Other Costing Applied',
            `${Utils.currency(splitAmount)} charged to you for: ${reason}`,
            userId, 'finance'
          ).catch(() => {});
        } catch (e) {}
      });

    } catch (error) {
      console.error('Save other costing error:', error);
      Notifications.toast('error', 'Error', 'Failed to apply other costing.');
    } finally {
      this._isSavingOtherCosting = false;
      this.resetBtnInstantLoading(submitBtn, 'Apply Costing');
      this.validateOtherCostingForm();
    }
  },

  /**
   * Populate user select dropdown
   */
  async _populateUserSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const diningId = this.diningId || Messliner.state?.diningId;
    let users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    if (Object.keys(users).length === 0 && diningId && typeof db !== 'undefined') {
      try {
        const uSnap = await db.ref(`dinings/${diningId}/users`).once('value');
        if (uSnap.val()) users = uSnap.val();
      } catch (e) {}
    }

    if (select.tagName === 'SELECT') {
      select.innerHTML = '<option value="">Choose a member...</option>' +
        Object.entries(users)
          .filter(([_, u]) => u && u.status !== 'left' && u.status !== 'removed')
          .map(([id, u]) => `<option value="${id}">${u.name || 'Member'}</option>`).join('');
    }

    if (selectId === 'depositUserSelect') {
      const menuEl = document.getElementById('depositUserMenu');
      if (menuEl) {
        let html = `<div class="custom-dropdown-item selected" data-value="" onclick="Messliner.finance.selectDepositUser('')">Select Member</div>`;
        Object.entries(users)
          .filter(([_, u]) => u && u.status !== 'left' && u.status !== 'removed')
          .forEach(([id, u]) => {
            html += `<div class="custom-dropdown-item" data-value="${id}" onclick="Messliner.finance.selectDepositUser('${id}')">${u.name || 'Member'}</div>`;
          });
        menuEl.innerHTML = html;
      }
    }

    if (selectId === 'deductUserSelect') {
      const menuEl = document.getElementById('deductUserMenu');
      if (menuEl) {
        let html = `<div class="custom-dropdown-item selected" data-value="" onclick="Messliner.finance.selectDeductUser('')">Select Member</div>`;
        Object.entries(users)
          .filter(([_, u]) => u && u.status !== 'left' && u.status !== 'removed')
          .forEach(([id, u]) => {
            html += `<div class="custom-dropdown-item" data-value="${id}" onclick="Messliner.finance.selectDeductUser('${id}')">${u.name || 'Member'}</div>`;
          });
        menuEl.innerHTML = html;
      }
    }
  },

  /**
   * Select a member in Deposit modal custom dropdown
   */
  selectDepositUser(userId) {
    const dd = document.getElementById('depositUserDropdown');
    if (dd) dd.classList.remove('active');

    const users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    const valueEl = document.getElementById('depositUserValue');
    const inputEl = document.getElementById('depositUserSelect');
    const menuEl = document.getElementById('depositUserMenu');

    if (userId && users[userId]) {
      const u = users[userId];
      const memberName = u.name || 'Member';
      if (valueEl) valueEl.textContent = memberName;
      if (inputEl) inputEl.value = userId;
    } else {
      if (valueEl) valueEl.textContent = 'Select Member';
      if (inputEl) inputEl.value = '';
    }

    if (menuEl) {
      menuEl.querySelectorAll('.custom-dropdown-item').forEach(item => {
        if (item.getAttribute('data-value') === (userId || '')) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
    this.validateDepositForm();
  },

  /**
   * Select a member in Deduct modal custom dropdown
   */
  selectDeductUser(userId) {
    const dd = document.getElementById('deductUserDropdown');
    if (dd) dd.classList.remove('active');

    const users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    const valueEl = document.getElementById('deductUserValue');
    const inputEl = document.getElementById('deductUserSelect');
    const menuEl = document.getElementById('deductUserMenu');

    if (userId && users[userId]) {
      const u = users[userId];
      const memberName = u.name || 'Member';
      if (valueEl) valueEl.textContent = memberName;
      if (inputEl) inputEl.value = userId;
    } else {
      if (valueEl) valueEl.textContent = 'Select Member';
      if (inputEl) inputEl.value = '';
    }

    if (menuEl) {
      menuEl.querySelectorAll('.custom-dropdown-item').forEach(item => {
        if (item.getAttribute('data-value') === (userId || '')) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
    this.validateDeductForm();
  },

  /**
   * Validate Deposit Form and toggle Add Deposit submit button disabled state
   */
  validateDepositForm() {
    const userId = document.getElementById('depositUserSelect')?.value;
    const amountVal = parseFloat(document.getElementById('depositAmountInput')?.value?.replace(/,/g, ''));
    const isValid = Boolean(userId && !isNaN(amountVal) && amountVal > 0);
    const submitBtn = document.getElementById('depositSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = !isValid;
    }
    return isValid;
  },

  /**
   * Validate Deduct Form and toggle Deduct Balance submit button disabled state
   */
  validateDeductForm() {
    const userId = document.getElementById('deductUserSelect')?.value;
    const amountVal = parseFloat(document.getElementById('deductAmountInput')?.value?.replace(/,/g, ''));
    const isValid = Boolean(userId && !isNaN(amountVal) && amountVal > 0);
    const submitBtn = document.getElementById('deductSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = !isValid;
    }
    return isValid;
  },

  /**
   * Instantly trigger ash loading spinner on submit button on pointerdown/touch
   */
  showBtnInstantLoading(btn, text) {
    if (!btn || btn.disabled || btn.dataset.submitting === 'true') return;
    btn.dataset.submitting = 'true';
    btn.classList.add('btn-loading-state');
    btn.innerHTML = `<span class="bazar-btn-spinner"></span><span>${text}</span>`;
    if (btn.form) {
      if (typeof btn.form.requestSubmit === 'function') {
        try {
          btn.form.requestSubmit(btn);
        } catch (e) {
          btn.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      } else {
        btn.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  },

  /**
   * Reset submit button from loading state
   */
  resetBtnInstantLoading(btn, defaultText) {
    if (!btn) return;
    delete btn.dataset.submitting;
    btn.classList.remove('btn-loading-state');
    btn.innerHTML = defaultText;
  },

  /**
   * Save deposit
   */
  async saveDeposit() {
    if (this._isSavingDeposit) return;

    if (window.MesslinerSubscription && typeof MesslinerSubscription.assertCanWrite === 'function') {
      if (!MesslinerSubscription.assertCanWrite()) return;
    }

    const userId = document.getElementById('depositUserSelect')?.value;
    const amountVal = document.getElementById('depositAmountInput')?.value?.replace(/,/g, '') || '';
    const amount = parseFloat(amountVal);
    const note = document.getElementById('depositNoteInput')?.value?.trim();
    const submitBtn = document.getElementById('depositSubmitBtn');

    if (!userId || !amount || isNaN(amount) || amount <= 0) {
      this.resetBtnInstantLoading(submitBtn, 'Add Deposit');
      this.validateDepositForm();
      Notifications.toast('warning', 'Invalid Input', 'Please select a member and enter a valid amount.');
      return;
    }

    const diningId = this.diningId || Messliner.state?.diningId;
    if (!diningId) {
      this.resetBtnInstantLoading(submitBtn, 'Add Deposit');
      Notifications.toast('error', 'Error', 'Dining group not found.');
      return;
    }

    this._isSavingDeposit = true;
    if (submitBtn) {
      submitBtn.classList.add('btn-loading-state');
      submitBtn.innerHTML = `<span class="bazar-btn-spinner"></span><span>Adding Deposit...</span>`;
    }

    try {
      let users = (Messliner.users && Messliner.users.users) ||
        (window.UsersModule && window.UsersModule.users) ||
        (Messliner.bazar && Messliner.bazar.users) ||
        (window.UserDashboard && window.UserDashboard.allUsers) ||
        (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
        (Messliner.state && Messliner.state.users) || {};

      const user = users[userId] || {};
      const currentDeposit = Utils.num(user?.totalDeposit);
      const newBalance = currentDeposit + amount;

      // Prepare atomic multi-path update for instant database write
      const newKey = db.ref(`dinings/${diningId}/deposits`).push().key;
      const updates = {};
      updates[`dinings/${diningId}/deposits/${newKey}`] = {
        userId,
        userName: user?.name || 'Unknown',
        amount,
        type: 'deposit',
        note: note || 'Deposit',
        date: Utils.today(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      updates[`dinings/${diningId}/users/${userId}/totalDeposit`] = newBalance;

      await db.ref().update(updates);

      // Instant UI response: close modal and notify user immediately
      Notifications.toast('success', 'Deposit Added', `${Utils.currency(amount)} added for ${user?.name || 'Member'}.`);
      closeModal('depositModal');
      document.getElementById('depositForm')?.reset();

      if (window.UserDashboard && typeof UserDashboard.renderStats === 'function') {
        UserDashboard.renderStats();
      }
      if (window.OverviewModule && typeof OverviewModule.refresh === 'function') {
        OverviewModule.refresh();
      }

      // Non-blocking background notification and SMS
      Notifications.create(diningId, 'Deposit Received', `${Utils.currency(amount)} deposited for ${user?.name || 'User'}.`, userId, 'deposit').catch(() => {});
      Notifications.log(diningId, 'deposit_added', `Deposit ৳${amount} for ${user?.name || 'Member'}`, Messliner.state?.userId, userId).catch(() => {});

      if (typeof SMSAlertModule !== 'undefined' && SMSAlertModule.sendDepositSMS) {
        SMSAlertModule.sendDepositSMS({
          userId,
          userName: user?.name || 'Unknown',
          amount,
          newBalance,
          note: note || 'Deposit',
          diningId,
        }).catch(e => console.warn('[SMS] send error:', e));
      }

    } catch (error) {
      console.error('Save deposit error:', error);
      Notifications.toast('error', 'Error', 'Failed to save deposit.');
    } finally {
      this._isSavingDeposit = false;
      this.resetBtnInstantLoading(submitBtn, 'Add Deposit');
      this.validateDepositForm();
    }
  },

  /**
   * Save deduction
   */
  async saveDeduction() {
    if (this._isSavingDeduct) return;

    const userId = document.getElementById('deductUserSelect')?.value;
    const amountVal = document.getElementById('deductAmountInput')?.value?.replace(/,/g, '') || '';
    const amount = parseFloat(amountVal);
    const reasonInput = document.getElementById('deductReasonInput')?.value?.trim();
    const reason = reasonInput || 'Deduction';
    const submitBtn = document.getElementById('deductSubmitBtn');

    if (!userId || !amount || isNaN(amount) || amount <= 0) {
      this.resetBtnInstantLoading(submitBtn, 'Deduct Balance');
      this.validateDeductForm();
      Notifications.toast('warning', 'Invalid Input', 'Please select a member and enter a valid amount.');
      return;
    }

    const diningId = this.diningId || Messliner.state?.diningId;
    if (!diningId) {
      this.resetBtnInstantLoading(submitBtn, 'Deduct Balance');
      Notifications.toast('error', 'Error', 'Dining group not found.');
      return;
    }

    this._isSavingDeduct = true;
    if (submitBtn) {
      submitBtn.classList.add('btn-loading-state');
      submitBtn.innerHTML = `<span class="bazar-btn-spinner"></span><span>Deducting...</span>`;
    }

    try {
      let users = (Messliner.users && Messliner.users.users) ||
        (window.UsersModule && window.UsersModule.users) ||
        (Messliner.bazar && Messliner.bazar.users) ||
        (window.UserDashboard && window.UserDashboard.allUsers) ||
        (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
        (Messliner.state && Messliner.state.users) || {};

      const user = users[userId] || {};
      const currentDeposit = Utils.num(user?.totalDeposit);
      const newBalance = currentDeposit - amount;

      // Prepare atomic multi-path update for instant database write
      const newKey = db.ref(`dinings/${diningId}/deposits`).push().key;
      const updates = {};
      updates[`dinings/${diningId}/deposits/${newKey}`] = {
        userId,
        userName: user?.name || 'Unknown',
        amount: -amount,
        type: 'deduction',
        note: reason,
        date: Utils.today(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      updates[`dinings/${diningId}/users/${userId}/totalDeposit`] = newBalance;

      await db.ref().update(updates);

      // Instant UI response: close modal and notify user immediately
      Notifications.toast('success', 'Deduction Applied', `${Utils.currency(amount)} deducted from ${user?.name || 'Member'}.`);
      closeModal('deductModal');
      document.getElementById('deductForm')?.reset();

      if (window.UserDashboard && typeof UserDashboard.renderStats === 'function') {
        UserDashboard.renderStats();
      }
      if (window.OverviewModule && typeof OverviewModule.refresh === 'function') {
        OverviewModule.refresh();
      }

      // Non-blocking background notification & log
      Notifications.create(diningId, 'Balance Deducted', `${Utils.currency(amount)} deducted from ${user?.name || 'Member'}. Reason: ${reason}`, userId, 'deposit').catch(() => {});
      Notifications.log(diningId, 'deduction_added', `Deducted ৳${amount} from ${user?.name || 'Member'}: ${reason}`, Messliner.state?.userId, userId).catch(() => {});

    } catch (error) {
      console.error('Save deduction error:', error);
      Notifications.toast('error', 'Error', 'Failed to apply deduction.');
    } finally {
      this._isSavingDeduct = false;
      this.resetBtnInstantLoading(submitBtn, 'Deduct Balance');
      this.validateDeductForm();
    }
  },

  /**
   * Save bazar cost
   */
  async saveBazar() {
    if (window.MesslinerSubscription && typeof MesslinerSubscription.assertCanWrite === 'function') {
      if (!MesslinerSubscription.assertCanWrite()) return;
    }

    const date = document.getElementById('bazarDateInput')?.value;
    const amount = parseFloat(document.getElementById('bazarAmountInput')?.value);
    const items = document.getElementById('bazarItemsInput')?.value.trim() || '';
    const shopperUserId = document.getElementById('bazarShopperUserId')?.value ||
      document.getElementById('bazarShopperSelect')?.value || '';

    const users = (Messliner.users && Messliner.users.users) ||
      (window.UsersModule && window.UsersModule.users) ||
      (Messliner.bazar && Messliner.bazar.users) ||
      (window.UserDashboard && window.UserDashboard.allUsers) ||
      (Messliner.overview && Messliner.overview.cachedData && Messliner.overview.cachedData.users) ||
      (Messliner.state && Messliner.state.users) || {};

    let shopper = '';
    if (shopperUserId && users[shopperUserId]) {
      shopper = users[shopperUserId].name || '';
    } else {
      shopper = document.getElementById('bazarShopperInput')?.value.trim() || '';
    }

    if (!date || isNaN(amount) || amount <= 0 || (!shopperUserId && !shopper) || !items) {
      Notifications.toast('warning', 'Invalid Input', 'Please select date, shopper, enter valid amount and items.');
      return;
    }

    const diningId = this.diningId || Messliner.state?.diningId;
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Dining group not found.');
      return;
    }

    if (Object.keys(users).length === 0 && typeof db !== 'undefined') {
      try {
        const uSnap = await db.ref(`dinings/${diningId}/users`).once('value');
        if (uSnap.val()) users = uSnap.val();
      } catch (e) {}
    }

    const editKey = document.getElementById('bazarEditKey')?.value;

    const submitBtn = document.getElementById('bazarSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading-state');
      submitBtn.innerHTML = `<span class="bazar-btn-spinner"></span><span>${editKey ? 'Updating...' : 'Saving...'}</span>`;
    }

    try {
      const entryItems = items || 'Bazar Expense';

      if (editKey) {
        // 1. Update existing bazar expense record
        const record = {
          amount,
          items: entryItems,
          shopperName: shopper || 'N/A',
          userId: shopperUserId || '',
          date,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref(`dinings/${diningId}/bazar/${editKey}`).update(record);

        // Update local cache in BazarModule if present
        if (Messliner.bazar && Messliner.bazar.rawBazarData && Messliner.bazar.rawBazarData[editKey]) {
          Messliner.bazar.rawBazarData[editKey] = {
            ...Messliner.bazar.rawBazarData[editKey],
            ...record
          };
        }

        // 2. Duty schedule update (best-effort, non-blocking)
        if (shopperUserId && users[shopperUserId]) {
          try {
            const yearMonth = date.slice(0, 7);
            const dutyData = {
              userId: shopperUserId,
              userName: shopper,
              note: 'Bazar Shopper',
              assignedBy: Messliner.state?.userId || 'admin',
              updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            await db.ref(`dinings/${diningId}/bazarSchedule/${yearMonth}/${date}`).set(dutyData);
          } catch (schedErr) {
            console.warn('[Finance] bazarSchedule assignment skipped/failed:', schedErr);
          }
        }

        // 3. Activity Log (best-effort, non-blocking)
        try {
          await Notifications.log(diningId, 'bazar_updated', `Updated Bazar ৳${amount}: ${entryItems}`, Messliner.state?.userId);
        } catch (logErr) {
          console.warn('[Finance] Bazar activity log skipped/failed:', logErr);
        }

        Notifications.toast('success', 'Bazar Updated', `Bazar of ৳${amount.toLocaleString('en-BD')} updated successfully.`);
      } else {
        // 1. Save new primary bazar expense record
        const record = {
          amount,
          items: entryItems,
          shopperName: shopper || 'N/A',
          userId: shopperUserId || '',
          date,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await db.ref(`dinings/${diningId}/bazar`).push().set(record);

        // 2. Automatically assign member to duty schedule for this specific day (best-effort, non-blocking)
        if (shopperUserId && users[shopperUserId]) {
          try {
            const yearMonth = date.slice(0, 7);
            const dutyData = {
              userId: shopperUserId,
              userName: shopper,
              note: 'Bazar Shopper',
              assignedBy: Messliner.state?.userId || 'admin',
              updatedAt: firebase.database.ServerValue.TIMESTAMP
            };
            await db.ref(`dinings/${diningId}/bazarSchedule/${yearMonth}/${date}`).set(dutyData);
          } catch (schedErr) {
            console.warn('[Finance] bazarSchedule assignment skipped/failed:', schedErr);
          }
        }

        // 3. Notifications & Activity Log (best-effort, non-blocking)
        try {
          await Notifications.create(diningId, "Today's Bazar Added", `Today's bazar has been recorded (${Utils.currency(amount)}).`, 'all', 'bazar');
        } catch (notifErr) {
          console.warn('[Finance] Bazar notification skipped/failed:', notifErr);
        }

        try {
          await Notifications.log(diningId, 'bazar_added', `Bazar ৳${amount}: ${entryItems}`, Messliner.state?.userId);
        } catch (logErr) {
          console.warn('[Finance] Bazar activity log skipped/failed:', logErr);
        }

        Notifications.toast('success', 'Bazar Added', `Bazar of ৳${amount.toLocaleString('en-BD')} recorded successfully.`);
      }

      closeModal('bazarModal');
      document.getElementById('bazarForm')?.reset();
      this.resetBazarModal();

      if (window.BazarModule && typeof BazarModule.render === 'function') {
        BazarModule.render();
      }
      if (window.BazarHistoryModule && typeof BazarHistoryModule.renderMonthData === 'function') {
        BazarHistoryModule.renderMonthData();
      }
      if (window.HistoryModule && typeof HistoryModule.loadBazarHistory === 'function') {
        HistoryModule.loadBazarHistory();
      }
      if (window.UserDashboard && typeof UserDashboard.renderStats === 'function') {
        UserDashboard.renderStats();
      }
      if (window.OverviewModule && typeof OverviewModule.refresh === 'function') {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('Save bazar error:', error);
      Notifications.toast('error', 'Error', 'Failed to save bazar cost.');
    } finally {
      this.resetBazarModal();
      this.validateBazarForm();
    }
  },

  /**
   * Render finance summary cards
   */
  renderSummary() {
    const container = document.getElementById('financeSummary');
    if (!container) return;

    let totalDeposits = 0;
    let totalDeductions = 0;
    let totalOtherCosting = 0;
    let totalBazar = 0;

    Object.values(this.deposits).forEach(d => {
      if (d.type === 'deposit') totalDeposits += Utils.num(d.amount);
      else if (d.type === 'deduction' || d.type === 'friday_meal') totalDeductions += Math.abs(Utils.num(d.amount));
      else if (d.type === 'other_costing') totalOtherCosting += Math.abs(Utils.num(d.amount));
    });

    Object.values(this.bazarList).forEach(b => {
      totalBazar += Utils.num(b.amount);
    });

    // Meal Cost is tracked through bazar (Meal Rate * Total Meals) — use bazar as proxy
    const totalMealCost = totalBazar;
    const totalCost = totalMealCost + totalOtherCosting;
    const netBalance = totalDeposits - totalDeductions - totalCost;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Deposits</div>
          <div class="stat-value">${Utils.currency(totalDeposits)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Meal Cost (Bazar)</div>
          <div class="stat-value">${Utils.currency(totalMealCost)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--warning-100);color:var(--warning-700);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Other Costing</div>
          <div class="stat-value">${Utils.currency(totalOtherCosting)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Deductions</div>
          <div class="stat-value">${Utils.currency(totalDeductions)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--danger-100);color:var(--danger-700);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8H8m8 4H8m4 4H8"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Cost</div>
          <div class="stat-value">${Utils.currency(totalCost)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${netBalance >= 0 ? 'primary' : 'danger'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Net Balance</div>
          <div class="stat-value" style="color:${netBalance >= 0 ? 'var(--accent-600)' : 'var(--danger-600)'};">${Utils.currency(netBalance)}</div>
        </div>
      </div>
    `;

    // Update global state
    Messliner.state.totalBazar = totalBazar;
    Messliner.state.totalDeposit = totalDeposits;
    Messliner.state.totalOtherCosting = totalOtherCosting;
    Messliner.state.totalDeductions = totalDeductions;
  },

  /**
   * Get merged & sorted list of all transactions (deposits, deductions, bazar, other costing)
   */
  _getMergedTransactions() {
    let transactions = [];

    // Group other costings (Amber/Warning)
    const otherCostGroups = this._groupOtherCostings(this.deposits || {});
    // Group bill deductions from ledger (Red/Danger)
    const billGroups = this._groupBillDeductions(this.deposits || {});

    // Helper to sort member items by mess join date / createdAt ascending
    const sortGroupItems = (items) => {
      return [...items].sort((a, b) => {
        const uA = (Messliner.users?.users && Messliner.users.users[a.userId]) || {};
        const uB = (Messliner.users?.users && Messliner.users.users[b.userId]) || {};
        const joinA = (uA.createdAt ? new Date(uA.createdAt).getTime() : 0) || (uA.timestamp ? new Date(uA.timestamp).getTime() : 0) || (a.timestamp || 0);
        const joinB = (uB.createdAt ? new Date(uB.createdAt).getTime() : 0) || (uB.timestamp ? new Date(uB.timestamp).getTime() : 0) || (b.timestamp || 0);
        if (joinA !== joinB) {
          return joinA - joinB;
        }
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
    };

    // 1. Other Costing groups
    otherCostGroups.forEach(group => {
      const totalAmount = group.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
      const sortedItems = sortGroupItems(group.items);

      const memberNames = sortedItems.map(item => {
        const u = (Messliner.users?.users && Messliner.users.users[item.userId]);
        return (u && u.name) || item.userName || 'Member';
      });
      const uniqueNames = [...new Set(memberNames)];

      transactions.push({
        id: group.groupId || (group.items[0] && group.items[0].key) || ('oc_' + group.timestamp),
        batchId: group.batchId || group.groupId,
        type: 'other_costing',
        category: 'other_costing',
        isGrouped: true,
        amount: -totalAmount,
        note: group.note,
        date: group.date,
        timestamp: group.timestamp,
        items: sortedItems,
        memberNames: uniqueNames,
        memberCount: group.items.length,
        splitAmount: group.items.length > 0 ? (totalAmount / group.items.length) : totalAmount
      });
    });

    // 2. Bill Deduction groups (from Ledger)
    billGroups.forEach(group => {
      const totalAmount = group.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
      const sortedItems = sortGroupItems(group.items);

      const memberNames = sortedItems.map(item => {
        const u = (Messliner.users?.users && Messliner.users.users[item.userId]);
        return (u && u.name) || item.userName || 'Member';
      });
      const uniqueNames = [...new Set(memberNames)];

      transactions.push({
        id: group.groupId || (group.items[0] && group.items[0].key) || ('bill_' + group.timestamp),
        batchId: group.billId || group.groupId,
        type: 'deduction',
        isBillGroup: true,
        isGrouped: true,
        category: 'bill',
        amount: -totalAmount,
        note: group.note,
        date: group.date,
        timestamp: group.timestamp,
        items: sortedItems,
        memberNames: uniqueNames,
        memberCount: group.items.length,
        splitAmount: group.items.length > 0 ? (totalAmount / group.items.length) : totalAmount
      });
    });

    // Track keys that have been grouped so they are not duplicated
    const groupedKeys = new Set();
    otherCostGroups.forEach(g => g.items.forEach(i => groupedKeys.add(i.key)));
    billGroups.forEach(g => g.items.forEach(i => groupedKeys.add(i.key)));

    // 3. Other non-grouped deposits (deposits, single manual deductions, friday_meals, etc.)
    Object.entries(this.deposits || {}).forEach(([id, d]) => {
      if (!groupedKeys.has(id) && d.type !== 'other_costing') {
        transactions.push({ id, ...d, category: d.type });
      }
    });

    // Filter by selected year and month
    if (this.selectedYear && this.selectedMonth) {
      const targetMonthKey = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
      transactions = transactions.filter(t => Utils.isItemInMonth(t, targetMonthKey));
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return transactions;
  },

  /**
   * Render list of timeline items HTML
   */
  _renderTransactionItemsHTML(transactions, showUndo = true) {
    if (!transactions || transactions.length === 0) {
      const monthLabel = (this.monthNames && this.selectedMonth) ? `${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}` : 'this period';
      return `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <h3>No Transactions</h3>
          <p>No financial transactions found for ${monthLabel}.</p>
        </div>
      `;
    }

    return transactions.map(t => {
      const isDeposit = t.type === 'deposit';
      const isBazar = t.type === 'bazar';
      const isOtherCosting = t.type === 'other_costing';
      const isBillGroup = !!t.isBillGroup;
      const isDeduction = t.type === 'deduction';

      let dotClass, amountColor, sign, typeLabel;
      if (isDeposit) {
        dotClass = 'accent'; amountColor = 'var(--accent-600)'; sign = '+'; typeLabel = 'Deposit';
      } else if (isBazar) {
        dotClass = 'warning'; amountColor = 'var(--warning-600)'; sign = '-'; typeLabel = 'Bazar';
      } else if (isOtherCosting) {
        dotClass = 'warning'; amountColor = 'var(--warning-600)'; sign = '-';
        typeLabel = t.memberCount ? `Other Costing · ${t.memberCount} Members` : 'Other Costing';
      } else if (isBillGroup) {
        dotClass = 'danger'; amountColor = 'var(--danger-600)'; sign = '-';
        typeLabel = t.memberCount ? `Bill · ${t.memberCount} Members` : 'Bill Deduction';
      } else {
        dotClass = 'danger'; amountColor = 'var(--danger-600)'; sign = '-'; typeLabel = 'Deduction';
      }

      const amount = Math.abs(Utils.num(t.amount));

      let titleHTML = '';
      let descHTML = '';

      if (isOtherCosting || isBillGroup) {
        titleHTML = `<div class="timeline-title">${t.note || (isOtherCosting ? 'Other Costing' : 'Bill')}</div>`;
        const membersList = t.memberNames || [];
        const count = t.memberCount || membersList.length || 1;
        const split = t.splitAmount ? Utils.currency(t.splitAmount) : '';
        const uniqueId = 'grouped-cost-members-' + Math.random().toString(36).substr(2, 9);

        const chipsHTML = membersList.map(name =>
          `<span class="other-cost-member-chip">${name}</span>`
        ).join('');

        descHTML = `
          <div class="timeline-desc" style="margin-top: 4px;">
            <div style="font-size: 11.5px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
              <span style="color: var(--text-tertiary); font-weight: 500;">
                Split among ${count} member${count > 1 ? 's' : ''}${split ? ` (${split} each)` : ''}:
              </span>
              <div style="position: relative; display: flex; flex-direction: column; align-items: flex-start; width: 100%;">
                <div id="${uniqueId}" class="other-cost-members-list">
                  ${chipsHTML}
                </div>
                <button id="${uniqueId}-btn" class="other-cost-toggle-btn" type="button" style="display: none;" onclick="event.stopPropagation(); const el = document.getElementById('${uniqueId}'); const btn = this; if (el.classList.contains('collapsed')) { el.classList.remove('collapsed'); btn.innerHTML = 'Show Less <span>↑</span>'; } else { el.classList.add('collapsed'); btn.innerHTML = 'Show More <span>↓</span>'; }">
                  Show More <span>↓</span>
                </button>
              </div>
            </div>
          </div>
        `;
      } else {
        titleHTML = `<div class="timeline-title">${(t.userId && Messliner.users?.users && Messliner.users.users[t.userId]?.name) || t.userName || 'Unknown'}</div>`;
        descHTML = `<div class="timeline-desc">${t.type === 'bazar' ? Utils.formatBazarItems(t.note) : (t.note || t.type)}</div>`;
      }

      const undoButtonHTML = showUndo ? `
        <button class="btn btn-sm btn-ghost text-danger" style="padding: 2px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"
          onclick="Messliner.finance.revertTransaction('${t.id}', '${t.type}', '${t.batchId || ''}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Undo
        </button>
      ` : '';

      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <div class="timeline-date">${Utils.formatDate(t.date)} · ${Utils.timeAgo(t.timestamp)}</div>
            <div class="flex items-center justify-between" style="gap: var(--space-3);">
              <div style="min-width: 0; flex: 1;">
                ${titleHTML}
                ${descHTML}
              </div>
              <div style="font-weight:var(--weight-bold);color:${amountColor};font-size:var(--font-md);white-space:nowrap; flex-shrink: 0; text-align: right;">
                ${sign}${Utils.currency(amount)}
              </div>
            </div>
            <div class="flex items-center justify-between" style="margin-top:var(--space-2); border-top: 1px dashed var(--border-color); padding-top:var(--space-2);">
              <span class="badge badge-${dotClass}">${typeLabel}</span>
              ${undoButtonHTML}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Populate Year and Month dropdowns for transaction history
   */
  populateDropdowns() {
    this.populateYearDropdown();
    this.populateMonthDropdown();
  },

  populateYearDropdown() {
    const valueEl = document.getElementById('financeYearValue');
    const menuEl = document.getElementById('financeYearMenu');
    if (!valueEl || !menuEl) return;

    const createdDate = this.createdDate || new Date(2026, 0, 1);
    const startYear = createdDate.getFullYear();
    const endYear = new Date().getFullYear();

    if (this.selectedYear < startYear) this.selectedYear = startYear;
    if (this.selectedYear > endYear) this.selectedYear = endYear;

    let html = '';
    for (let y = startYear; y <= endYear; y++) {
      const sel = y === this.selectedYear ? 'active selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${y}"
                    onclick="Messliner.finance.selectYear(${y}, this)">${y}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.selectedYear;
  },

  populateMonthDropdown() {
    const valueEl = document.getElementById('financeMonthValue');
    const menuEl = document.getElementById('financeMonthMenu');
    if (!valueEl || !menuEl) return;

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
      const sel = m === this.selectedMonth ? 'active selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${m}"
                    onclick="Messliner.finance.selectMonth(${m}, this)">${this.monthNames[m - 1]}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.monthNames[this.selectedMonth - 1] || 'Month';
  },

  selectYear(year, el) {
    this.selectedYear = parseInt(year, 10);
    const dd = document.getElementById('financeYearDropdown');
    if (dd) dd.classList.remove('active');
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.renderTransactions();
  },

  selectMonth(month, el) {
    this.selectedMonth = parseInt(month, 10);
    const dd = document.getElementById('financeMonthDropdown');
    if (dd) dd.classList.remove('active');
    this.populateMonthDropdown();
    this.renderTransactions();
  },

  /**
   * Render transaction history timeline
   */
  renderTransactions() {
    const container = document.getElementById('transactionHistory');
    if (!container) return;

    let transactions = this._getMergedTransactions();

    // Apply filter
    if (this.currentFilter && this.currentFilter !== 'all') {
      const f = this.currentFilter.toLowerCase();
      transactions = transactions.filter(t => {
        if (f === 'bill' || f === 'bills') {
          return t.category === 'bill' || t.isBillGroup === true || (t.type === 'deduction' && (t.billId || (t.note && /^Bill:/i.test(t.note))));
        }
        if (f === 'other_cost' || f === 'other_costing' || f === 'other_costs') {
          return t.category === 'other_costing' || t.category === 'other_cost' || t.type === 'other_costing';
        }
        if (f === 'deposit' || f === 'deposits') {
          return t.category === 'deposit' || t.type === 'deposit';
        }
        if (f === 'deduction' || f === 'deductions') {
          return (t.category === 'deduction' || t.type === 'deduction') && !t.isBillGroup && t.category !== 'bill';
        }
        if (f === 'bazar') {
          return t.category === 'bazar' || t.type === 'bazar';
        }
        return t.category === f || t.type === f;
      });
    }

    container.innerHTML = this._renderTransactionItemsHTML(transactions, false);
    this._initCollapsibleMemberLists(container);
  },

  /**
   * Automatically detect and collapse member chip lists exceeding 2 lines
   */
  _initCollapsibleMemberLists(container) {
    if (!container) return;
    const checkAndApply = () => {
      const lists = container.querySelectorAll('.other-cost-members-list');
      lists.forEach(el => {
        const btn = document.getElementById(el.id + '-btn');
        const isCurrentlyExpanded = btn && btn.textContent.includes('Show Less');
        if (!isCurrentlyExpanded) {
          el.classList.remove('collapsed');
          // If natural wrapped height is more than 2 lines (> 52px)
          if (el.scrollHeight > 52) {
            el.classList.add('collapsed');
            if (btn) btn.style.display = 'inline-flex';
          } else {
            el.classList.remove('collapsed');
            if (btn) btn.style.display = 'none';
          }
        }
      });
    };
    requestAnimationFrame(checkAndApply);
    setTimeout(checkAndApply, 60);
  },

  /**
   * Filter transactions
   */
  filterTransactions(filter) {
    this.currentFilter = filter;
    this.renderTransactions();
  },

  /**
   * Select filter type from custom dropdown
   */
  selectFilterType(filter, label, el) {
    const dropdown = document.getElementById('financeFilterDropdown');
    if (dropdown) dropdown.classList.remove('active');
    const valEl = document.getElementById('financeFilterValue');
    if (valEl) valEl.textContent = label;
    const menu = document.getElementById('financeFilterMenu');
    if (menu) {
      menu.querySelectorAll('.custom-dropdown-item').forEach(item => item.classList.remove('active'));
    }
    if (el) el.classList.add('active');

    const nativeSelect = document.getElementById('financeFilter');
    if (nativeSelect) nativeSelect.value = filter;

    this.filterTransactions(filter);
  },

  /**
   * Show Finance Fix Modal
   */
  async showFinanceFixModal() {
    try {
      const snap = await db.ref(`dinings/${this.diningId}/deposits`).once('value');
      this.deposits = {};
      snap.forEach(child => {
        this.deposits[child.key] = child.val();
      });
    } catch (e) {
      console.warn('[FinanceFix] Failed to fetch latest deposits snapshot, using cached');
    }
    this.renderFinanceFixList();
    openModal('financeFixModal');
  },

  /**
   * Group deposits by batchId or timestamp/note/date
   */
  _groupOtherCostings(deposits) {
    const list = Object.entries(deposits || {})
      .map(([key, val]) => ({ key, ...val }))
      .filter(item => item.type === 'other_costing');

    // Sort by timestamp descending
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const groupsMap = {};
    list.forEach(item => {
      let gId = item.batchId;
      if (!gId) {
        // Find existing group with same note, date, and close timestamp (<= 15 seconds)
        for (const existingId in groupsMap) {
          const g = groupsMap[existingId];
          if (!g.batchId && g.note === item.note && g.date === item.date) {
            const timeDiff = Math.abs((g.timestamp || 0) - (item.timestamp || 0));
            if (timeDiff <= 15000) {
              gId = existingId;
              break;
            }
          }
        }
      }

      if (!gId) {
        gId = `group_${item.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      }

      if (!groupsMap[gId]) {
        groupsMap[gId] = {
          groupId: gId,
          batchId: item.batchId || null,
          note: item.note || 'Other Costing',
          date: item.date || Utils.today(),
          timestamp: item.timestamp || 0,
          items: []
        };
      }
      groupsMap[gId].items.push(item);
    });

    const groups = Object.values(groupsMap);
    groups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return groups;
  },

  /**
   * Group bill deductions by billId or timestamp/note/date
   */
  _groupBillDeductions(deposits) {
    const list = Object.entries(deposits || {})
      .map(([key, val]) => ({ key, ...val }))
      .filter(item => {
        if (item.type !== 'deduction') return false;
        if (item.billId) return true;
        if (item.note && /^Bill:\s*/i.test(item.note)) return true;
        return false;
      });

    // Sort by timestamp descending
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const groupsMap = {};
    list.forEach(item => {
      let gId = item.billId;
      if (!gId) {
        for (const existingId in groupsMap) {
          const g = groupsMap[existingId];
          if (!g.billId && g.rawNote === item.note && g.date === item.date) {
            const timeDiff = Math.abs((g.timestamp || 0) - (item.timestamp || 0));
            if (timeDiff <= 30000) {
              gId = existingId;
              break;
            }
          }
        }
      }

      if (!gId) {
        gId = `bill_${item.timestamp || Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      }

      if (!groupsMap[gId]) {
        const cleanNote = item.note ? item.note.replace(/^Bill:\s*/i, '').trim() : 'Bill';
        groupsMap[gId] = {
          groupId: gId,
          billId: item.billId || null,
          note: cleanNote || 'Bill',
          rawNote: item.note || 'Bill',
          date: item.date || Utils.today(),
          timestamp: item.timestamp || 0,
          items: []
        };
      }
      groupsMap[gId].items.push(item);
    });

    const groups = Object.values(groupsMap);
    groups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return groups;
  },

  /**
   * Render list inside Finance Fix modal
   */
  renderFinanceFixList() {
    const container = document.getElementById('financeFixList');
    if (!container) return;

    let transactions = this._getMergedTransactions();
    container.innerHTML = this._renderTransactionItemsHTML(transactions);
    this._initCollapsibleMemberLists(container);
  },

  /**
   * Confirm deletion of an Other Costing entry
   */
  confirmDeleteOtherCosting(groupId) {
    const group = window._pendingFixGroups ? window._pendingFixGroups[groupId] : null;
    if (!group) {
      Notifications.toast('error', 'Error', 'Entry not found.');
      return;
    }

    const totalAmount = group.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
    const memberCount = group.items.length;
    const splitAmount = memberCount > 0 ? (totalAmount / memberCount) : 0;

    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const btnEl = document.getElementById('confirmActionBtn');

    if (titleEl && msgEl && btnEl) {
      titleEl.textContent = 'Delete & Revert Other Costing?';
      msgEl.textContent = `Are you sure you want to delete "${group.note}" (Total ৳${totalAmount})? This will refund ${Utils.currency(splitAmount)} to each of the ${memberCount} affected member(s) and completely erase this costing record.`;
      btnEl.textContent = 'Yes, Delete & Refund';
      btnEl.className = 'btn btn-danger';
      btnEl.onclick = () => {
        closeModal('confirmDialog');
        this.deleteOtherCostingGroup(groupId);
      };
      openModal('confirmDialog');
    } else {
      if (confirm(`Are you sure you want to delete "${group.note}" (৳${totalAmount})? This will refund ${Utils.currency(splitAmount)} to ${memberCount} member(s).`)) {
        this.deleteOtherCostingGroup(groupId);
      }
    }
  },

  /**
   * Delete an Other Costing group and refund affected members
   */
  async deleteOtherCostingGroup(groupId) {
    const group = window._pendingFixGroups ? window._pendingFixGroups[groupId] : null;
    if (!group || !group.items || group.items.length === 0) {
      Notifications.toast('error', 'Error', 'Failed to locate costing group items.');
      return;
    }

    const totalAmount = group.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
    const users = Messliner.users.users || {};

    try {
      // 1. Calculate refund per user in this group
      const userRefunds = {};
      group.items.forEach(item => {
        const uId = item.userId;
        const refundAmt = Math.abs(Utils.num(item.amount));
        userRefunds[uId] = (userRefunds[uId] || 0) + refundAmt;
      });

      // 2. Revert user totalDeposit in Firebase
      for (const [uId, refundAmt] of Object.entries(userRefunds)) {
        const userSnap = await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).once('value');
        const currentDeposit = Utils.num(userSnap.val());
        await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).set(currentDeposit + refundAmt);
      }

      // 3. Remove deposit records from Firebase
      const deletePromises = group.items.map(item =>
        db.ref(`dinings/${this.diningId}/deposits/${item.key}`).remove()
      );
      await Promise.all(deletePromises);

      // 4. Remove local copy from this.deposits
      group.items.forEach(item => {
        delete this.deposits[item.key];
      });

      // 5. Log audit trail
      const memberNames = Object.keys(userRefunds).map(id => users[id]?.name || 'Member').join(', ');
      await Notifications.log(
        this.diningId,
        'other_costing_deleted',
        `Undid/Deleted Other Costing ৳${totalAmount} (${group.note}). Refunded: ${memberNames}`,
        Messliner.state.userId
      );

      // 6. Notify users of refund
      for (const [uId, refundAmt] of Object.entries(userRefunds)) {
        await Notifications.create(
          this.diningId,
          'Other Costing Refunded',
          `${Utils.currency(refundAmt)} refunded to your balance (Other Costing "${group.note}" removed).`,
          uId,
          'finance'
        );
      }

      Notifications.toast(
        'success',
        'Finance Fix Applied',
        `Deleted "${group.note}" (৳${totalAmount}) and refunded ${Object.keys(userRefunds).length} member balance(s).`
      );

      // Re-render
      this.renderFinanceFixList();
      this.refresh();
      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('[FinanceFix] Delete error:', error);
      Notifications.toast('error', 'Error', 'Failed to delete Other Costing. Please try again.');
    }
  },

  /**
   * Revert a transaction (Deposit, Deduction, Bazar, Other Costing group, or Bill Deduction group)
   */
  async revertTransaction(id, type, batchId = '') {
    let message = '';
    if (type === 'deposit') {
      message = 'Are you sure you want to undo this deposit? The amount will be deducted from the member\'s balance, and the record will be deleted.';
    } else if (type === 'deduction' && batchId) {
      message = 'Are you sure you want to undo this bill deduction? The amount will be refunded to all affected members\' balance, and the record will be deleted.';
    } else if (type === 'deduction') {
      message = 'Are you sure you want to undo this deduction? The amount will be refunded to the member\'s balance, and the record will be deleted.';
    } else if (type === 'bazar') {
      message = 'Are you sure you want to delete this bazar expense? The record will be permanently deleted and the total bazar calculation will update.';
    } else if (type === 'other_costing') {
      message = 'Are you sure you want to undo this other costing charge? This will delete the group costing and refund the split amount to all affected members.';
    }

    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const btnEl = document.getElementById('confirmActionBtn');

    const performRevert = async () => {
      try {
        if (type === 'deduction' && batchId) {
          // Revert grouped bill deduction
          const snap = await db.ref(`dinings/${this.diningId}/deposits`).once('value');
          this.deposits = {};
          snap.forEach(child => {
            this.deposits[child.key] = child.val();
          });

          const billGroups = this._groupBillDeductions(this.deposits);
          const foundGroup = billGroups.find(g => g.groupId === id || g.billId === batchId || g.groupId === batchId || g.items.some(item => item.key === id));

          if (foundGroup && foundGroup.items.length > 0) {
            const userRefunds = {};
            foundGroup.items.forEach(item => {
              const uId = item.userId;
              const refundAmt = Math.abs(Utils.num(item.amount));
              userRefunds[uId] = (userRefunds[uId] || 0) + refundAmt;
            });

            for (const [uId, refundAmt] of Object.entries(userRefunds)) {
              const userSnap = await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).once('value');
              const currentDeposit = Utils.num(userSnap.val());
              await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).set(currentDeposit + refundAmt);
            }

            const deletePromises = foundGroup.items.map(item =>
              db.ref(`dinings/${this.diningId}/deposits/${item.key}`).remove()
            );
            await Promise.all(deletePromises);

            if (foundGroup.billId) {
              for (const item of foundGroup.items) {
                await db.ref(`dinings/${this.diningId}/bills/${foundGroup.billId}/members/${item.userId}`).update({
                  status: 'pending',
                  collectedAt: null,
                  depositKey: null
                });
              }
            }

            foundGroup.items.forEach(item => {
              delete this.deposits[item.key];
            });

            const totalAmount = foundGroup.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
            const logMsg = `Undid Bill Deduction ৳${totalAmount} (${foundGroup.note}). Refunded ${Object.keys(userRefunds).length} member(s).`;
            await Notifications.log(this.diningId, 'bill_deduction_reverted', logMsg, Messliner.state.userId);

            Notifications.toast('success', 'Bill Deduction Undone', logMsg);
          } else {
            // Fallback individual deduction
            const snap = await db.ref(`dinings/${this.diningId}/deposits/${id}`).once('value');
            const transaction = snap.val();
            if (transaction) {
              const { userId, amount, userName } = transaction;
              const userSnap = await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).once('value');
              const currentDeposit = Utils.num(userSnap.val());
              await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(currentDeposit - Utils.num(amount));
              await db.ref(`dinings/${this.diningId}/deposits/${id}`).remove();
              delete this.deposits[id];
              Notifications.toast('success', 'Deduction Undone', `Undid Deduction ৳${Math.abs(amount)} from ${userName || 'User'}`);
            }
          }
        }
        else if (type === 'deposit' || type === 'deduction') {
          const snap = await db.ref(`dinings/${this.diningId}/deposits/${id}`).once('value');
          const transaction = snap.val();
          if (!transaction) {
            Notifications.toast('error', 'Error', 'Transaction record not found.');
            return;
          }

          const { userId, amount, userName } = transaction;

          const userSnap = await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).once('value');
          const currentDeposit = Utils.num(userSnap.val());
          const updatedDeposit = currentDeposit - Utils.num(amount);

          await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(updatedDeposit);
          await db.ref(`dinings/${this.diningId}/deposits/${id}`).remove();

          const logAction = type === 'deposit' ? 'deposit_reverted' : 'deduction_reverted';
          const logMsg = type === 'deposit'
            ? `Undid Deposit ৳${Math.abs(amount)} for ${userName || 'User'}`
            : `Undid Deduction ৳${Math.abs(amount)} from ${userName || 'User'}`;

          await Notifications.log(this.diningId, logAction, logMsg, Messliner.state.userId, userId);
          await Notifications.create(this.diningId, type === 'deposit' ? 'Deposit Reverted' : 'Deduction Reverted', logMsg, userId, 'finance');

          Notifications.toast('success', 'Transaction Undone', logMsg);
        }
        else if (type === 'bazar') {
          const snap = await db.ref(`dinings/${this.diningId}/bazar/${id}`).once('value');
          const bazarItem = snap.val();
          if (!bazarItem) {
            Notifications.toast('error', 'Error', 'Bazar record not found.');
            return;
          }

          await db.ref(`dinings/${this.diningId}/bazar/${id}`).remove();

          const logMsg = `Deleted Bazar expense ৳${bazarItem.amount} for items: ${bazarItem.items}`;
          await Notifications.log(this.diningId, 'bazar_deleted', logMsg, Messliner.state.userId);
          await Notifications.create(this.diningId, 'Bazar Deleted', logMsg, 'all', 'bazar');

          Notifications.toast('success', 'Bazar Cost Deleted', 'Bazar expense record deleted.');
        }
        else if (type === 'other_costing') {
          let groupId = batchId || id;
          const groups = this._groupOtherCostings(this.deposits);
          const foundGroup = groups.find(g => g.groupId === id || g.batchId === batchId || g.groupId === batchId || g.items.some(item => item.key === id));
          if (foundGroup) {
            groupId = foundGroup.groupId;
          }

          if (groupId) {
            const snap = await db.ref(`dinings/${this.diningId}/deposits`).once('value');
            this.deposits = {};
            snap.forEach(child => {
              this.deposits[child.key] = child.val();
            });

            const groups = this._groupOtherCostings(this.deposits);
            window._pendingFixGroups = window._pendingFixGroups || {};
            groups.forEach(g => {
              window._pendingFixGroups[g.groupId] = g;
            });

            if (window._pendingFixGroups[groupId]) {
              await this.deleteOtherCostingGroup(groupId);
            } else {
              Notifications.toast('error', 'Error', 'Could not locate other costing group details.');
            }
          } else {
            const snap = await db.ref(`dinings/${this.diningId}/deposits/${id}`).once('value');
            const transaction = snap.val();
            if (transaction) {
              const { userId, amount, userName, note } = transaction;
              const userSnap = await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).once('value');
              const currentDeposit = Utils.num(userSnap.val());
              const updatedDeposit = currentDeposit - Utils.num(amount);

              await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(updatedDeposit);
              await db.ref(`dinings/${this.diningId}/deposits/${id}`).remove();

              const logMsg = `Undid Other Costing charge ৳${Math.abs(amount)} (${note}) for ${userName || 'User'}`;
              await Notifications.log(this.diningId, 'other_costing_reverted', logMsg, Messliner.state.userId, userId);

              Notifications.toast('success', 'Other Costing Undone', logMsg);
            } else {
              Notifications.toast('error', 'Error', 'Transaction record not found.');
            }
          }
        }

        this.refresh();
        if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
          OverviewModule.refresh();
        }
      } catch (error) {
        console.error('[RevertTransaction] Error:', error);
        Notifications.toast('error', 'Error', 'Failed to undo transaction.');
      }
    };

    if (titleEl && msgEl && btnEl) {
      titleEl.textContent = 'Undo Transaction?';
      msgEl.textContent = message;
      btnEl.textContent = 'Yes, Undo';
      btnEl.className = 'btn btn-danger';
      btnEl.onclick = () => {
        closeModal('confirmDialog');
        performRevert();
      };
      openModal('confirmDialog');
    } else {
      if (confirm(message)) {
        await performRevert();
      }
    }
  },

  /* ==========================================================================
     BALANCE TRANSFER & MONTH CARRYOVER SYSTEM
     ========================================================================== */

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /**
   * Show Balance Transfer & Carryover Modal
   */
  async showBalanceTransferModal() {
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1; // 1-indexed

    // Calculate previous month
    let prevYear = currYear;
    let prevMonth = currMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = currYear - 1;
    }

    // Populate dropdowns for Bulk tab
    this._populateYearDropdown('bulkSourceYear', prevYear);
    this._populateMonthDropdown('bulkSourceMonth', prevMonth);
    this._populateYearDropdown('bulkTargetYear', currYear);
    this._populateMonthDropdown('bulkTargetMonth', currMonth);

    // Populate dropdowns for Single tab
    this._populateYearDropdown('singleSourceYear', prevYear);
    this._populateMonthDropdown('singleSourceMonth', prevMonth);
    this._populateYearDropdown('singleTargetYear', currYear);
    this._populateMonthDropdown('singleTargetMonth', currMonth);
    this._populateUserSelect('singleUserSelect');

    // Populate user selects for User-to-User tab
    this._populateUserSelect('userTransferFromSelect');
    this._populateUserSelect('userTransferToSelect');
    this._populateYearDropdown('userTransferYear', currYear);
    this._populateMonthDropdown('userTransferMonth', currMonth);

    // Reset inputs
    const amountInput = document.getElementById('userTransferAmountInput');
    const noteInput = document.getElementById('userTransferNoteInput');
    if (amountInput) amountInput.value = '';
    if (noteInput) noteInput.value = '';

    // Switch to default tab (Bulk)
    this.switchTransferTab('bulk');

    openModal('balanceTransferModal');
  },

  /**
   * Populate year dropdown helper
   */
  _populateYearDropdown(selectId, defaultYear) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;
    const endYear = currentYear + 1;
    let html = '';
    for (let y = startYear; y <= endYear; y++) {
      html += `<option value="${y}" ${y === defaultYear ? 'selected' : ''}>${y}</option>`;
    }
    select.innerHTML = html;
  },

  /**
   * Populate month dropdown helper
   */
  _populateMonthDropdown(selectId, defaultMonth) {
    const select = document.getElementById(selectId);
    if (!select) return;
    let html = '';
    this.monthNames.forEach((name, index) => {
      const m = index + 1;
      html += `<option value="${m}" ${m === defaultMonth ? 'selected' : ''}>${name}</option>`;
    });
    select.innerHTML = html;
  },

  /**
   * Switch active tab in Balance Transfer modal
   */
  switchTransferTab(tabName) {
    const tabs = ['bulk', 'single', 'user'];
    tabs.forEach(t => {
      const btn = document.getElementById(`transferTabBtn_${t}`);
      const content = document.getElementById(`transferTabContent_${t}`);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (content) content.classList.toggle('active', t === tabName);
    });

    if (tabName === 'bulk') {
      this.previewBulkCarryover();
    } else if (tabName === 'single') {
      this.previewSingleMemberShift();
    }
  },

  /**
   * Calculate exact monthly metrics & net balance for all users in a given year & month
   */
  async calculateAllUsersMonthBalances(year, month) {
    const formattedMonth = `${year}-${String(month).padStart(2, '0')}`;

    const [usersSnap, depositsSnap, bazarSnap, mealsSnap, settingsSnap] = await Promise.all([
      db.ref(`dinings/${this.diningId}/users`).once('value'),
      db.ref(`dinings/${this.diningId}/deposits`).once('value'),
      db.ref(`dinings/${this.diningId}/bazar`).once('value'),
      db.ref(`dinings/${this.diningId}/meals`).once('value'),
      db.ref(`dinings/${this.diningId}/settings`).once('value')
    ]);

    const users = usersSnap.val() || {};
    const deposits = depositsSnap.val() || {};
    const bazars = bazarSnap.val() || {};
    const allMeals = mealsSnap.val() || {};
    const settings = settingsSnap.val() || {};
    const isManagerMealEnabled = !!settings.managerMealEnabled;

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

    // Calculate deposits, other costing, deductions per user
    const uDeposits = {};
    const uOtherCosts = {};
    const uDeductions = {};

    Object.values(deposits).forEach(d => {
      if (!d || !d.userId || !isSelectedMonth(d)) return;
      const amt = Math.abs(Utils.num(d.amount));
      if (d.type === 'deposit') {
        uDeposits[d.userId] = (uDeposits[d.userId] || 0) + amt;
      } else if (d.type === 'other_costing') {
        uOtherCosts[d.userId] = (uOtherCosts[d.userId] || 0) + amt;
      } else if (d.type === 'deduction' || d.type === 'friday_meal') {
        uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
      }
    });

    // Calculate bazar & meals for month
    let totalBazar = 0;
    Object.values(bazars).forEach(b => {
      if (isSelectedMonth(b)) {
        totalBazar += Utils.num(b.amount);
      }
    });

    const monthMeals = allMeals[formattedMonth] || {};
    const userMealsBreakdown = {};
    const userTotalMeals = {};
    let totalMealsCount = 0;

    Object.values(monthMeals).forEach(dayData => {
      Object.entries(dayData).forEach(([type, typeData]) => {
        if (typeof typeData === 'object') {
          Object.entries(typeData).forEach(([uId, count]) => {
            const u = users[uId];
            if (u && u.role === 'admin' && !isManagerMealEnabled) {
              return; // Skip manager meal if disabled
            }
            const c = parseInt(count) || 0;
            totalMealsCount += c;
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
      mealRate = Utils.calcMealRate(totalBazar, totalMealsCount);
    }

    const results = {};
    Object.entries(users).forEach(([id, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return;

      const uBreakdown = userMealsBreakdown[id] || { breakfast: 0, lunch: 0, dinner: 0 };
      const uMealCount = userTotalMeals[id] || 0;
      const mealCost = Utils.calcMealCost(mealRate, uMealCount, uBreakdown, fixedRates);

      const deposit = uDeposits[id] || 0;
      const otherCost = uOtherCosts[id] || 0;
      const deduction = uDeductions[id] || 0;
      const netBalance = deposit - mealCost - otherCost - deduction;

      results[id] = {
        userId: id,
        userName: u.name,
        deposit,
        mealCost,
        otherCost,
        deduction,
        netBalance: Math.round(netBalance * 100) / 100,
        userMealsCount: uMealCount,
        user: u
      };
    });

    return results;
  },

  /**
   * Render preview table for Bulk Carryover
   */
  async previewBulkCarryover() {
    const sourceYear = parseInt(document.getElementById('bulkSourceYear').value);
    const sourceMonth = parseInt(document.getElementById('bulkSourceMonth').value);
    const targetYear = parseInt(document.getElementById('bulkTargetYear').value);
    const targetMonth = parseInt(document.getElementById('bulkTargetMonth').value);

    const sourceMonthName = this.monthNames[sourceMonth - 1];
    const notePreviewEl = document.getElementById('bulkNotePreviewText');
    if (notePreviewEl) {
      notePreviewEl.textContent = `Balance from ${sourceMonthName} ${sourceYear}`;
    }

    const container = document.getElementById('bulkPreviewTableBody');
    if (!container) return;

    container.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color:var(--text-tertiary);">Calculating balances...</td></tr>';

    try {
      const balances = await this.calculateAllUsersMonthBalances(sourceYear, sourceMonth);
      const entries = Object.values(balances);

      if (entries.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center p-4" style="color:var(--text-tertiary);">No members found for this month</td></tr>';
        return;
      }

      this._lastBulkBalances = balances;

      container.innerHTML = entries.map(b => {
        const isPaid = b.netBalance > 0;
        const isDue = b.netBalance < 0;
        const isZero = b.netBalance === 0;

        let badgeClass = isPaid ? 'badge-paid' : (isDue ? 'badge-due' : 'badge-zero');
        let statusText = isPaid ? 'Credit Balance' : (isDue ? 'Outstanding Due' : 'Zero Balance');
        let balanceColor = isPaid ? 'var(--accent-600)' : (isDue ? 'var(--danger-600)' : 'var(--text-tertiary)');
        let disabledAttr = isZero ? 'disabled' : '';
        let checkedAttr = (isPaid || isDue) ? 'checked' : '';

        return `
          <tr>
            <td style="width:36px;text-align:center;">
              <input type="checkbox" value="${b.userId}" class="bulk-carryover-checkbox" ${checkedAttr} ${disabledAttr} onchange="Messliner.finance.updateBulkSelectedCount()">
            </td>
            <td>
              <div style="font-weight:600;color:var(--text-primary);">${b.userName}</div>
              <div style="font-size:11px;color:var(--text-tertiary);">Meals: ${b.userMealsCount} · Dep: ৳${b.deposit}</div>
            </td>
            <td style="font-weight:700;color:${balanceColor};white-space:nowrap;">
              ${b.netBalance >= 0 ? '+' : ''}৳${b.netBalance}
            </td>
            <td>
              <span class="badge ${badgeClass}" style="font-size:11px;padding:2px 8px;">${statusText}</span>
            </td>
            <td style="font-size:11px;color:var(--text-secondary);">
              ${isZero ? 'Skipped (0-balance)' : (isPaid ? 'Deposit in target' : 'Deducted/Due in target')}
            </td>
          </tr>
        `;
      }).join('');

      this.updateBulkSelectedCount();

    } catch (e) {
      console.error('[BulkCarryover] Preview error:', e);
      container.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-danger">Failed to calculate balances</td></tr>';
    }
  },

  /**
   * Update count of selected members for bulk carryover
   */
  updateBulkSelectedCount() {
    const checked = document.querySelectorAll('.bulk-carryover-checkbox:checked');
    const all = document.querySelectorAll('.bulk-carryover-checkbox:not([disabled])');
    const selectAllCb = document.getElementById('selectAllBulkCarryover');
    if (selectAllCb) {
      selectAllCb.checked = (all.length > 0 && checked.length === all.length);
      selectAllCb.indeterminate = (checked.length > 0 && checked.length < all.length);
    }
    const btn = document.getElementById('btnExecuteBulkCarryover');
    if (btn) {
      btn.textContent = `Transfer Selected (${checked.length})`;
      btn.disabled = checked.length === 0;
    }
  },

  /**
   * Toggle select all checkboxes for bulk carryover
   */
  toggleSelectAllBulkCarryover(source) {
    const checkboxes = document.querySelectorAll('.bulk-carryover-checkbox:not([disabled])');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
    this.updateBulkSelectedCount();
  },

  /**
   * Execute Bulk Month Carryover
   */
  async executeBulkCarryover() {
    const sourceYear = parseInt(document.getElementById('bulkSourceYear').value);
    const sourceMonth = parseInt(document.getElementById('bulkSourceMonth').value);
    const targetYear = parseInt(document.getElementById('bulkTargetYear').value);
    const targetMonth = parseInt(document.getElementById('bulkTargetMonth').value);

    // Validation: Source and target month must be different
    if (sourceYear === targetYear && sourceMonth === targetMonth) {
      Notifications.toast('warning', 'Invalid Selection', 'Source month and target month must be different.');
      return;
    }

    const checkedNodes = document.querySelectorAll('.bulk-carryover-checkbox:checked');
    const selectedUserIds = Array.from(checkedNodes).map(cb => cb.value);

    if (selectedUserIds.length === 0) {
      Notifications.toast('warning', 'No Members Selected', 'Please select at least one member with a non-zero balance.');
      return;
    }

    const sourceMonthName = this.monthNames[sourceMonth - 1];
    const targetMonthName = this.monthNames[targetMonth - 1];
    const noteText = `Balance from ${sourceMonthName}`;
    const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;

    const balances = this._lastBulkBalances || await this.calculateAllUsersMonthBalances(sourceYear, sourceMonth);
    const users = Messliner.users.users || {};

    let transferredCount = 0;
    let totalCreditSum = 0;
    let totalDueSum = 0;

    try {
      const promises = selectedUserIds.map(async (uId) => {
        const b = balances[uId];
        if (!b || b.netBalance === 0) return; // Prevent 0-to-0 transaction

        const user = users[uId] || b.user;
        const currentDeposit = Utils.num(user?.totalDeposit);
        const amount = b.netBalance;

        if (amount > 0) {
          // Deposit record for credit balance
          await db.ref(`dinings/${this.diningId}/deposits`).push().set({
            userId: uId,
            userName: user?.name || b.userName || 'Unknown',
            amount: amount,
            type: 'deposit',
            note: noteText,
            date: targetDate,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
          // Update total deposit
          await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).set(currentDeposit + amount);
          totalCreditSum += amount;

        } else if (amount < 0) {
          // Deduction record for due balance
          await db.ref(`dinings/${this.diningId}/deposits`).push().set({
            userId: uId,
            userName: user?.name || b.userName || 'Unknown',
            amount: amount, // negative value
            type: 'deduction',
            note: noteText,
            date: targetDate,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
          // Update total deposit (adding negative value reduces total deposit / updates due)
          await db.ref(`dinings/${this.diningId}/users/${uId}/totalDeposit`).set(currentDeposit + amount);
          totalDueSum += Math.abs(amount);
        }

        transferredCount++;

        // Notify member
        const formattedAmt = Utils.currency(Math.abs(amount));
        const statusMsg = amount > 0 ? `Credit of ${formattedAmt}` : `Due of ${formattedAmt}`;
        await Notifications.create(
          this.diningId,
          `Balance Shift (${sourceMonthName} → ${targetMonthName})`,
          `${statusMsg} carried over from ${sourceMonthName} to ${targetMonthName}. Note: ${noteText}`,
          uId,
          'finance'
        );
      });

      await Promise.all(promises);

      // Audit Log
      await Notifications.log(
        this.diningId,
        'bulk_balance_transfer',
        `Bulk balance carry-over executed from ${sourceMonthName} ${sourceYear} to ${targetMonthName} ${targetYear} for ${transferredCount} members. (Credits: ৳${totalCreditSum}, Dues: ৳${totalDueSum})`,
        Messliner.state.userId
      );

      Notifications.toast(
        'success',
        'Carryover Completed',
        `Successfully transferred balances for ${transferredCount} members to ${targetMonthName} ${targetYear}.`
      );

      closeModal('balanceTransferModal');
      this.refresh();
      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('[BulkCarryover] Execution error:', error);
      Notifications.toast('error', 'Execution Error', 'Failed to complete bulk balance carryover.');
    }
  },

  /**
   * Preview single member shift
   */
  async previewSingleMemberShift() {
    const userId = document.getElementById('singleUserSelect').value;
    const sourceYear = parseInt(document.getElementById('singleSourceYear').value);
    const sourceMonth = parseInt(document.getElementById('singleSourceMonth').value);

    const container = document.getElementById('singleUserPreviewCard');
    if (!container) return;

    if (!userId) {
      container.style.display = 'none';
      return;
    }

    try {
      const balances = await this.calculateAllUsersMonthBalances(sourceYear, sourceMonth);
      const b = balances[userId];
      const sourceMonthName = this.monthNames[sourceMonth - 1];

      if (!b) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      const isPaid = b.netBalance > 0;
      const isDue = b.netBalance < 0;
      const isZero = b.netBalance === 0;

      let badgeClass = isPaid ? 'badge-paid' : (isDue ? 'badge-due' : 'badge-zero');
      let statusLabel = isPaid ? 'Paid / Credit Balance' : (isDue ? 'Outstanding Due' : 'Zero Balance');
      let valColor = isPaid ? 'var(--accent-600)' : (isDue ? 'var(--danger-600)' : 'var(--text-tertiary)');

      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-weight:700;font-size:14px;color:var(--text-primary);">${b.userName}'s Balance (${sourceMonthName} ${sourceYear})</div>
          <span class="badge ${badgeClass}">${statusLabel}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;font-size:12px;text-align:center;background:#fff;padding:8px;border-radius:8px;border:1px solid var(--border-color);">
          <div>
            <div style="color:var(--text-muted);font-size:11px;">Deposits</div>
            <div style="font-weight:700;color:var(--accent-600);">৳${b.deposit}</div>
          </div>
          <div>
            <div style="color:var(--text-muted);font-size:11px;">Meal Cost</div>
            <div style="font-weight:700;color:var(--warning-600);">৳${b.mealCost}</div>
          </div>
          <div>
            <div style="color:var(--text-muted);font-size:11px;">Other Cost</div>
            <div style="font-weight:700;color:var(--warning-600);">৳${b.otherCost + b.deduction}</div>
          </div>
          <div>
            <div style="color:var(--text-muted);font-size:11px;">Net Balance</div>
            <div style="font-weight:800;color:${valColor};">৳${b.netBalance}</div>
          </div>
        </div>
        ${isZero ? '<div style="font-size:11px;color:var(--danger-600);margin-top:6px;font-weight:600;">⚠️ Net balance is 0. Shift operation cannot be executed for 0 balance.</div>' : ''}
      `;

      const btn = document.getElementById('btnExecuteSingleShift');
      if (btn) btn.disabled = isZero;

    } catch (e) {
      console.error('[SingleShift] Preview error:', e);
    }
  },

  /**
   * Execute Single Member Month Shift
   */
  async executeSingleMemberShift() {
    const userId = document.getElementById('singleUserSelect').value;
    const sourceYear = parseInt(document.getElementById('singleSourceYear').value);
    const sourceMonth = parseInt(document.getElementById('singleSourceMonth').value);
    const targetYear = parseInt(document.getElementById('singleTargetYear').value);
    const targetMonth = parseInt(document.getElementById('singleTargetMonth').value);

    if (!userId) {
      Notifications.toast('warning', 'Invalid Input', 'Please select a member.');
      return;
    }
    if (sourceYear === targetYear && sourceMonth === targetMonth) {
      Notifications.toast('warning', 'Invalid Selection', 'Source and target months must be different.');
      return;
    }

    try {
      const balances = await this.calculateAllUsersMonthBalances(sourceYear, sourceMonth);
      const b = balances[userId];
      if (!b || b.netBalance === 0) {
        Notifications.toast('warning', 'Zero Balance', 'Member has 0 net balance in source month. No transaction needed.');
        return;
      }

      const user = Messliner.users.users[userId] || b.user;
      const amount = b.netBalance;
      const sourceMonthName = this.monthNames[sourceMonth - 1];
      const targetMonthName = this.monthNames[targetMonth - 1];
      const noteText = `Balance from ${sourceMonthName}`;
      const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const currentDeposit = Utils.num(user?.totalDeposit);

      if (amount > 0) {
        await db.ref(`dinings/${this.diningId}/deposits`).push().set({
          userId,
          userName: user?.name || 'Unknown',
          amount: amount,
          type: 'deposit',
          note: noteText,
          date: targetDate,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(currentDeposit + amount);
      } else {
        await db.ref(`dinings/${this.diningId}/deposits`).push().set({
          userId,
          userName: user?.name || 'Unknown',
          amount: amount, // negative number
          type: 'deduction',
          note: noteText,
          date: targetDate,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(currentDeposit + amount);
      }

      await Notifications.log(
        this.diningId,
        'single_balance_shift',
        `Shifted balance of ৳${amount} for ${user?.name} from ${sourceMonthName} ${sourceYear} to ${targetMonthName} ${targetYear}`,
        Messliner.state.userId,
        userId
      );

      await Notifications.create(
        this.diningId,
        `Balance Shift Applied`,
        `${Utils.currency(Math.abs(amount))} (${amount >= 0 ? 'Credit' : 'Due'}) carried over from ${sourceMonthName} to ${targetMonthName}. Note: ${noteText}`,
        userId,
        'finance'
      );

      Notifications.toast('success', 'Balance Shifted', `Shifted ${Utils.currency(amount)} for ${user?.name} to ${targetMonthName}.`);
      closeModal('balanceTransferModal');
      this.refresh();
      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('[SingleShift] Error:', error);
      Notifications.toast('error', 'Error', 'Failed to shift member balance.');
    }
  },

  /**
   * Execute User to User Transfer
   */
  async executeUserToUserTransfer() {
    const fromUserId = document.getElementById('userTransferFromSelect').value;
    const toUserId = document.getElementById('userTransferToSelect').value;
    const amount = parseFloat(document.getElementById('userTransferAmountInput').value);
    const targetYear = parseInt(document.getElementById('userTransferYear').value);
    const targetMonth = parseInt(document.getElementById('userTransferMonth').value);
    const customNote = document.getElementById('userTransferNoteInput').value.trim();

    if (!fromUserId || !toUserId) {
      Notifications.toast('warning', 'Invalid Input', 'Please select both sender and receiver members.');
      return;
    }

    if (fromUserId === toUserId) {
      Notifications.toast('warning', 'Invalid Transfer', 'Cannot transfer balance to the same member.');
      return;
    }

    if (!amount || amount <= 0) {
      Notifications.toast('warning', 'Invalid Amount', 'Please enter a valid transfer amount greater than 0.');
      return;
    }

    const users = Messliner.users.users || {};
    const fromUser = users[fromUserId];
    const toUser = users[toUserId];

    if (!fromUser || !toUser) {
      Notifications.toast('error', 'Error', 'Selected member details not found.');
      return;
    }

    const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const fromNote = customNote ? `Transfer to ${toUser.name} (${customNote})` : `Transfer to ${toUser.name}`;
    const toNote = customNote ? `Transfer from ${fromUser.name} (${customNote})` : `Transfer from ${fromUser.name}`;

    try {
      const fromDeposit = Utils.num(fromUser.totalDeposit);
      const toDeposit = Utils.num(toUser.totalDeposit);

      // 1. Deduct from Sender
      await db.ref(`dinings/${this.diningId}/deposits`).push().set({
        userId: fromUserId,
        userName: fromUser.name,
        amount: -amount,
        type: 'deduction',
        note: fromNote,
        date: targetDate,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`dinings/${this.diningId}/users/${fromUserId}/totalDeposit`).set(fromDeposit - amount);

      // 2. Deposit to Receiver
      await db.ref(`dinings/${this.diningId}/deposits`).push().set({
        userId: toUserId,
        userName: toUser.name,
        amount: amount,
        type: 'deposit',
        note: toNote,
        date: targetDate,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`dinings/${this.diningId}/users/${toUserId}/totalDeposit`).set(toDeposit + amount);

      // 3. Audit & Notifications
      await Notifications.log(
        this.diningId,
        'user_to_user_transfer',
        `Transferred ৳${amount} from ${fromUser.name} to ${toUser.name}.`,
        Messliner.state.userId
      );

      await Notifications.create(
        this.diningId,
        'Balance Transferred Out',
        `৳${amount} transferred from your balance to ${toUser.name}.`,
        fromUserId,
        'finance'
      );

      await Notifications.create(
        this.diningId,
        'Balance Received',
        `৳${amount} transferred to your balance from ${fromUser.name}.`,
        toUserId,
        'finance'
      );

      Notifications.toast('success', 'Transfer Successful', `Transferred ৳${amount} from ${fromUser.name} to ${toUser.name}.`);
      closeModal('balanceTransferModal');
      this.refresh();
      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('[UserToUserTransfer] Error:', error);
      Notifications.toast('error', 'Error', 'Failed to complete user-to-user balance transfer.');
    }
  },

  /**
   * Refresh finance page
   */
  refresh() {
    if (!this.selectedYear || !this.selectedMonth) {
      const now = new Date();
      this.selectedYear = now.getFullYear();
      this.selectedMonth = now.getMonth() + 1;
    }

    if ((!this.deposits || Object.keys(this.deposits).length === 0)) {
      this.deposits = Messliner.state?.diningData?.deposits || Messliner.state?.deposits || (window.OverviewModule?.cachedData?.deposits) || {};
    }
    if ((!this.bazarList || Object.keys(this.bazarList).length === 0)) {
      this.bazarList = Messliner.state?.diningData?.bazar || Messliner.state?.bazar || (window.OverviewModule?.cachedData?.bazar) || {};
    }

    this.populateDropdowns();
    try { this.renderSummary(); } catch (e) { console.warn('[Finance] renderSummary error:', e); }
    try { this.renderTransactions(); } catch (e) { console.warn('[Finance] renderTransactions error:', e); }
    if (document.getElementById('financeFixModal')?.classList.contains('active')) {
      try { this.renderFinanceFixList(); } catch (_) {}
    }
  },

  /**
   * Show User Statement Modal
   */
  async showUserStatementModal() {
    this._populateUserSelect('userStatementUserSelect');
    this._populateStatementDropdowns();
    openModal('userStatementModal');
    const userSelect = document.getElementById('userStatementUserSelect');
    if (userSelect && userSelect.options.length > 1) {
      userSelect.selectedIndex = 1;
    }
    this.generateUserStatement();
  },

  /**
   * Populate Month and Year dropdowns for Statement modal
   */
  _populateStatementDropdowns() {
    const monthSelect = document.getElementById('userStatementMonthSelect');
    const yearSelect = document.getElementById('userStatementYearSelect');
    if (!monthSelect || !yearSelect) return;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    monthSelect.innerHTML = monthNames.map((name, i) => {
      const m = i + 1;
      return `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${name}</option>`;
    }).join('');

    let yearHTML = '';
    for (let y = currentYear; y >= currentYear - 3; y--) {
      yearHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }
    yearSelect.innerHTML = yearHTML;
  },

  /**
   * Generate bank-statement style transaction view for selected user & month
   */
  async generateUserStatement() {
    const userId = document.getElementById('userStatementUserSelect')?.value;
    const month = parseInt(document.getElementById('userStatementMonthSelect')?.value) || (new Date().getMonth() + 1);
    const year = parseInt(document.getElementById('userStatementYearSelect')?.value) || new Date().getFullYear();
    const container = document.getElementById('userStatementPreviewContent');

    if (!container) return;

    if (!userId) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px; opacity:0.6;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <h4 style="margin:0 0 6px 0; color:#475569; font-weight:600;">No Member Selected</h4>
          <p style="margin:0; font-size:13px;">Please select a member above to generate and view their transaction statement.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:#64748b;">
        <div class="spinner" style="margin:0 auto 12px auto; width:32px; height:32px; border:3px solid #e2e8f0; border-top-color:#059669; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <p style="margin:0; font-size:13px; font-weight:500;">Generating Bank Statement...</p>
      </div>
    `;

    const formattedMonth = `${year}-${String(month).padStart(2, '0')}`;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = `${monthNames[month - 1]} ${year}`;

    try {
      const [userSnap, depositsSnap, mealsSnap, bazarSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${this.diningId}/users/${userId}`).once('value'),
        db.ref(`dinings/${this.diningId}/deposits`).once('value'),
        db.ref(`dinings/${this.diningId}/meals/${formattedMonth}`).once('value'),
        db.ref(`dinings/${this.diningId}/bazar`).once('value'),
        db.ref(`dinings/${this.diningId}/settings`).once('value')
      ]);

      const user = userSnap.val() || {};
      const allDeposits = depositsSnap.val() || {};
      const monthMeals = mealsSnap.val() || {};
      const allBazar = bazarSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const diningName = document.getElementById('sidebarDiningName')?.textContent || 'Messliner Mess';

      let userMealCount = 0;
      let totalMessMeals = 0;
      let userMealsBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };

      Object.entries(monthMeals).forEach(([day, dayData]) => {
        Object.entries(dayData).forEach(([type, typeData]) => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, count]) => {
              const countNum = parseFloat(count) || 0;
              if (uId === userId) {
                userMealCount += countNum;
                if (userMealsBreakdown[type] !== undefined) {
                  userMealsBreakdown[type] += countNum;
                }
              }
              totalMessMeals += countNum;
            });
          }
        });
      });

      let monthBazarTotal = 0;
      Object.values(allBazar).forEach(b => {
        if (Utils.isItemInMonth(b, formattedMonth)) {
          monthBazarTotal += parseFloat(b.amount) || 0;
        }
      });

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
        mealRate = totalMessMeals > 0 ? (monthBazarTotal / totalMessMeals) : 0;
      }

      const totalMealCost = Utils.calcMealCost(mealRate, userMealCount, userMealsBreakdown, fixedRates);

      let userTxns = [];
      let totalCredit = 0;
      let totalDebit = 0;

      Object.entries(allDeposits).forEach(([id, d]) => {
        if (d.userId !== userId) return;
        if (!Utils.isItemInMonth(d, formattedMonth)) return;

        const rawAmount = parseFloat(d.amount) || 0;
        const absAmount = Math.abs(rawAmount);

        let category = d.type || 'transaction';
        let isCredit = d.type === 'deposit';

        let particularsTitle = 'Transaction';
        if (d.type === 'deposit') particularsTitle = 'Deposit';
        else if (d.type === 'deduction' || d.type === 'friday_meal') particularsTitle = 'Deduction';
        else if (d.type === 'other_costing') particularsTitle = 'Other Cost';

        if (isCredit) {
          totalCredit += absAmount;
        } else {
          totalDebit += absAmount;
        }

        userTxns.push({
          id,
          date: d.date || Utils.today(),
          timestamp: d.timestamp || 0,
          particulars: particularsTitle,
          note: d.note || (isCredit ? 'Cash Deposit' : 'Account Deduction'),
          type: category,
          isCredit,
          amount: absAmount
        });
      });

      if (userMealCount > 0) {
        totalDebit += totalMealCost;
        userTxns.push({
          id: 'meal_charge_' + formattedMonth,
          date: `${formattedMonth}-28`,
          timestamp: new Date(year, month - 1, 28).getTime(),
          particulars: 'Meal Charge',
          note: `${userMealCount} meals`,
          type: 'meal_cost',
          isCredit: false,
          amount: totalMealCost
        });
      }

      userTxns.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

      let runningBalance = 0;
      userTxns.forEach(t => {
        if (t.isCredit) {
          runningBalance += t.amount;
        } else {
          runningBalance -= t.amount;
        }
        t.balance = runningBalance;
      });

      const netBalance = totalCredit - totalDebit;

      let tableRowsHTML = '';
      if (userTxns.length === 0) {
        tableRowsHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">
              No transactions recorded for this member in ${monthLabel}.
            </td>
          </tr>
        `;
      } else {
        tableRowsHTML = userTxns.map((t, idx) => {
          let typeBadge = '';
          if (t.type === 'deposit') {
            typeBadge = `<span style="display:inline-block; height:20px; line-height:20px; padding:0 10px; border-radius:10px; background:#dcfce7; color:#15803d; font-size:11px; font-weight:700; text-align:center; box-sizing:border-box;">Deposit</span>`;
          } else if (t.type === 'meal_cost') {
            typeBadge = `<span style="display:inline-block; height:20px; line-height:20px; padding:0 10px; border-radius:10px; background:#fef3c7; color:#b45309; font-size:11px; font-weight:700; text-align:center; box-sizing:border-box;">Meal Charge</span>`;
          } else if (t.type === 'other_costing') {
            typeBadge = `<span style="display:inline-block; height:20px; line-height:20px; padding:0 10px; border-radius:10px; background:#e0e7ff; color:#4338ca; font-size:11px; font-weight:700; text-align:center; box-sizing:border-box;">Other Cost</span>`;
          } else {
            typeBadge = `<span style="display:inline-block; height:20px; line-height:20px; padding:0 10px; border-radius:10px; background:#fee2e2; color:#b91c1c; font-size:11px; font-weight:700; text-align:center; box-sizing:border-box;">Deduction</span>`;
          }

          return `
            <tr style="border-bottom:1px solid #f1f5f9; ${idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
              <td style="padding:10px 12px; font-size:12px; color:#64748b;">${idx + 1}</td>
              <td style="padding:10px 12px; font-size:12px; font-weight:500; color:#334155;">${Utils.formatDate(t.date)}</td>
              <td style="padding:10px 12px; font-size:12px; font-weight:600;">${typeBadge}</td>
              <td style="padding:10px 12px; font-size:12px; color:#1e293b;">${t.note}</td>
              <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#16a34a; text-align:right;">
                ${t.isCredit ? '+' + Utils.currency(t.amount) : '—'}
              </td>
              <td style="padding:10px 12px; font-size:12px; font-weight:600; color:#dc2626; text-align:right;">
                ${!t.isCredit ? '-' + Utils.currency(t.amount) : '—'}
              </td>
              <td style="padding:10px 12px; font-size:12px; font-weight:700; text-align:right; color:${t.balance >= 0 ? '#047857' : '#b91c1c'};">
                ${Utils.currency(t.balance)}
              </td>
            </tr>
          `;
        }).join('');
      }

      const generatedOnStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

      container.innerHTML = `
        <!-- Bank Statement Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #059669; padding-bottom:16px; margin-bottom:20px;">
          <div>
            <h2 style="margin:0; font-size:20px; font-weight:800; color:#0f172a; letter-spacing:-0.02em;">${diningName}</h2>
            <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Dining Statement & Activity Record</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#475569;">Statement Period: <strong>${monthLabel}</strong></div>
            <div style="font-size:10px; color:#94a3b8; margin-top:2px;">Issued On: ${generatedOnStr}</div>
          </div>
        </div>

        <!-- Account Holder Profile Grid -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 18px; margin-bottom:20px;">
          <div>
            <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:#94a3b8; letter-spacing:0.05em; margin-bottom:4px;">Member Account Info</div>
            <div style="font-size:16px; font-weight:700; color:#0f172a;">${user.name || 'Member'}</div>
            <div style="font-size:12px; color:#64748b; margin-top:2px;">Phone: ${user.phone || '—'} · Email: ${user.email || '—'}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; justify-content:center;">
            <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:#94a3b8; letter-spacing:0.05em; margin-bottom:2px;">Current Net Balance</div>
            <div style="font-size:22px; font-weight:800; color:${netBalance >= 0 ? '#059669' : '#dc2626'};">
              ${Utils.currency(netBalance)}
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">Total Account Balance: ৳${(Utils.num(user.totalDeposit) - Utils.num(user.totalCost)).toFixed(2)}</div>
          </div>
        </div>

        <!-- Metric Summary Cards -->
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:20px;">
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;">
            <div style="font-size:10px; font-weight:700; color:#15803d; text-transform:uppercase;">Total Credit (+)</div>
            <div style="font-size:16px; font-weight:800; color:#166534; margin-top:2px;">${Utils.currency(totalCredit)}</div>
          </div>
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px;">
            <div style="font-size:10px; font-weight:700; color:#b91c1c; text-transform:uppercase;">Total Debit (-)</div>
            <div style="font-size:16px; font-weight:800; color:#991b1b; margin-top:2px;">${Utils.currency(totalDebit)}</div>
          </div>
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px;">
            <div style="font-size:10px; font-weight:700; color:#b45309; text-transform:uppercase;">Total Meals</div>
            <div style="font-size:16px; font-weight:800; color:#92400e; margin-top:2px;">${userMealCount} meals</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px;">
            <div style="font-size:10px; font-weight:700; color:#475569; text-transform:uppercase;">Meal Rate</div>
            <div style="font-size:16px; font-weight:800; color:#334155; margin-top:2px;">${Utils.currency(mealRate)}/meal</div>
          </div>
        </div>

        <!-- Transactions Table -->
        <h4 style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:#334155; text-transform:uppercase; letter-spacing:0.04em;">Detailed Transaction Ledger</h4>
        <div style="border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:20px;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">
                <th style="padding:10px 12px; width:35px;">#</th>
                <th style="padding:10px 12px; width:95px;">Date</th>
                <th style="padding:10px 12px; width:120px;">Particulars</th>
                <th style="padding:10px 12px;">Root</th>
                <th style="padding:10px 12px; text-align:right; width:100px;">Credit (৳)</th>
                <th style="padding:10px 12px; text-align:right; width:100px;">Debit (৳)</th>
                <th style="padding:10px 12px; text-align:right; width:110px;">Balance (৳)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHTML}
            </tbody>
            <tfoot>
              <tr style="background:#f8fafc; border-top:2px solid #cbd5e1; font-size:12px; font-weight:700;">
                <td colspan="4" style="padding:12px; color:#1e293b; text-align:right;">Statement Totals:</td>
                <td style="padding:12px; color:#16a34a; text-align:right;">+${Utils.currency(totalCredit)}</td>
                <td style="padding:12px; color:#dc2626; text-align:right;">-${Utils.currency(totalDebit)}</td>
                <td style="padding:12px; color:${netBalance >= 0 ? '#047857' : '#b91c1c'}; text-align:right;">${Utils.currency(netBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Bank Statement Footer -->
        <div style="display:flex; justify-content:flex-end; align-items:center; border-top:1px solid #e2e8f0; padding-top:12px; font-size:11px; color:#94a3b8;">
          <div style="font-weight:600; color:#64748b;">Page 1 of 1</div>
        </div>
      `;

    } catch (err) {
      console.error('[UserStatement] Error generating statement:', err);
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:#ef4444;">
          <p style="margin:0; font-weight:600;">Failed to generate statement.</p>
          <p style="margin:4px 0 0 0; font-size:12px;">Please check network connection and try again.</p>
        </div>
      `;
    }
  },

  /**
   * Download user statement as PDF or JPG
   */
  async downloadUserStatement() {
    const format = document.getElementById('userStatementFormatSelect')?.value || 'pdf';
    const container = document.getElementById('userStatementPrintArea');
    const userSelect = document.getElementById('userStatementUserSelect');
    const btn = document.getElementById('btnDownloadUserStatement');

    if (!container || !userSelect || !userSelect.value) {
      Notifications.toast('warning', 'No User Selected', 'Please select a member before downloading.');
      return;
    }

    const userName = (userSelect.options[userSelect.selectedIndex]?.text || 'User').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const month = document.getElementById('userStatementMonthSelect')?.value || '01';
    const year = document.getElementById('userStatementYearSelect')?.value || '2026';
    const fileName = `${userName}_statement_${month}_${year}`;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:14px; height:14px; margin-right:6px; border-width:2px;"></span> Exporting ${format.toUpperCase()}...`;
    }

    try {
      await new Promise(res => setTimeout(res, 200));

      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });

      if (format === 'jpg') {
        canvas.toBlob(blob => {
          if (!blob) {
            Notifications.toast('error', 'Export Failed', 'Failed to render statement image.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `${fileName}.jpg`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          Notifications.toast('success', 'Statement Downloaded', `Saved as ${fileName}.jpg`);
        }, 'image/jpeg', 0.95);
      } else if (format === 'pdf') {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          throw new Error('jsPDF library not loaded.');
        }
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${fileName}.pdf`);
        Notifications.toast('success', 'Statement Downloaded', `Saved as ${fileName}.pdf`);
      }
    } catch (err) {
      console.error('[UserStatement] Download error:', err);
      Notifications.toast('error', 'Download Failed', 'Failed to generate statement file.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download Statement
        `;
      }
    }
  }
};

// Close bazar date calendar popup on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#bazarDatePickerTrigger') && !e.target.closest('#bazarDateCalendarPopup')) {
    if (window.Messliner && Messliner.finance && typeof Messliner.finance.closeBazarCalendar === 'function') {
      Messliner.finance.closeBazarCalendar();
    }
  }
});

console.log('[Messliner] Finance module loaded');

