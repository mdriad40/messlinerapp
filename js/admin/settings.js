/* ============================================
   Messliner — Settings (admin/settings.js)
   ============================================ */

const SettingsModule = {
  settings: {},

  /**
   * Initialize settings with realtime listener
   */
  init(diningId, initialData) {
    this.diningId = diningId;

    if (initialData?.settings) {
      this.settings = initialData.settings;
      this._populateUI();
    }
    if (initialData?.info) {
      this.info = initialData.info;
      this._populateDiningInfo();
    }

    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      this.settings = snap.val() || {};
      this._populateUI();
    });

    db.ref(`dinings/${diningId}/info`).on('value', (snap) => {
      this.info = snap.val() || {};
      this._populateDiningInfo();
    });

    db.ref(`dinings/${diningId}/rules`).on('value', (snap) => {
      this.rules = snap.val() || [];
      this._populateRulesUI();
    });
  },

  /**
   * Populate settings UI from database values
   */
  _populateUI() {
    const s = this.settings;
    const autoToggle = document.getElementById('autoMealToggle');
    if (autoToggle) autoToggle.checked = !!s.autoMealEnabled;

    const managerToggle = document.getElementById('managerMealToggle');
    if (managerToggle) managerToggle.checked = !!s.managerMealEnabled;

    const bf = document.getElementById('breakfastDeadline');
    const lf = document.getElementById('lunchDeadline');
    const df = document.getElementById('dinnerDeadline');
    if (bf) {
      bf.value = s.breakfastDeadline || '04:00';
      const bfd = document.getElementById('breakfastDeadline_display');
      if (bfd && window.Utils) bfd.textContent = Utils.formatTime(bf.value);
    }
    if (lf) {
      lf.value = s.lunchDeadline || '10:00';
      const lfd = document.getElementById('lunchDeadline_display');
      if (lfd && window.Utils) lfd.textContent = Utils.formatTime(lf.value);
    }
    if (df) {
      df.value = s.dinnerDeadline || '16:00';
      const dfd = document.getElementById('dinnerDeadline_display');
      if (dfd && window.Utils) dfd.textContent = Utils.formatTime(df.value);
    }

    // Tracked Meals checkboxes
    const tracked = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const tb = document.getElementById('settingsTrackedBreakfast');
    const tl = document.getElementById('settingsTrackedLunch');
    const td = document.getElementById('settingsTrackedDinner');
    if (tb) tb.checked = tracked.breakfast !== false;
    if (tl) tl.checked = tracked.lunch !== false;
    if (td) td.checked = tracked.dinner !== false;

    // Rate Mode selector
    const rateMode = s.rateMode || 'market';
    const rateModeSelect = document.getElementById('settingsRateMode');
    if (rateModeSelect) rateModeSelect.value = rateMode;
    const rateDisplay = document.getElementById('rateModeDisplay');
    if (rateDisplay) rateDisplay.textContent = rateMode === 'fixed' ? 'Fixed Rate' : 'Market Rate';
    const dropdown = document.getElementById('rateModeDropdown');
    if (dropdown) {
      dropdown.querySelectorAll('.m3-dropdown-item').forEach(item => {
        if (item.getAttribute('data-value') === rateMode) item.classList.add('active');
        else item.classList.remove('active');
      });
    }

    // Fixed Rates pricing fields
    const fixedRatesSection = document.getElementById('settingsFixedRatesSection');
    if (fixedRatesSection) {
      fixedRatesSection.style.display = rateMode === 'fixed' ? 'block' : 'none';
    }
    const fixedRates = s.fixedRates || { breakfast: 30, lunch: 60, dinner: 60 };
    const frb = document.getElementById('settingsFixedRateBreakfast');
    const frl = document.getElementById('settingsFixedRateLunch');
    const frd = document.getElementById('settingsFixedRateDinner');
    if (frb) frb.value = fixedRates.breakfast || 0;
    if (frl) frl.value = fixedRates.lunch || 0;
    if (frd) frd.value = fixedRates.dinner || 0;

    this._updateFixedRateRowsVisibility(tracked);
    this._updateFixedRateFullMealDisplay();

    // Due Limit Auto-Lock settings
    const dueLimitToggle = document.getElementById('settingsDueLimitToggle');
    if (dueLimitToggle) {
      dueLimitToggle.checked = s.dueLimitEnabled !== false && parseFloat(s.dueLimit) > 0;
    }
    const dueLimitAmount = document.getElementById('settingsDueLimitAmount');
    if (dueLimitAmount) {
      dueLimitAmount.value = (s.dueLimit !== undefined && s.dueLimit !== null) ? s.dueLimit : '';
    }

    // Manager Bazar Duty toggle
    const managerBazarToggle = document.getElementById('settingsManagerBazarToggle');
    if (managerBazarToggle) managerBazarToggle.checked = s.managerBazarEnabled !== false;

    // AI Assistant toggle states
    const aiAssistantToggle = document.getElementById('settingsAiAssistantToggle');
    if (aiAssistantToggle) aiAssistantToggle.checked = s.aiAssistantEnabled !== false;

    const aiFileUploadToggle = document.getElementById('settingsAiFileUploadToggle');
    if (aiFileUploadToggle) aiFileUploadToggle.checked = s.aiFileUploadEnabled !== false;

    // Active History Start Date
    const startDateInput = document.getElementById('settingsHistoryStartDate');
    if (startDateInput) {
      const val = s.historyStartDate || '';
      startDateInput.value = val;
      const displayEl = document.getElementById('historyStartDateDisplayText');
      if (displayEl) {
        displayEl.textContent = val ? this.formatDateDisplay(val) : 'Select Date';
      }
    }

    // Mess Code display
    const codeDisplay = document.getElementById('settingsMessCodeDisplay');
    if (codeDisplay && this.info) {
      codeDisplay.textContent = this.info.messCode || '-';
    }
  },

  initialDiningInfo: null,

  /**
   * Populate dining info fields
   */
  _populateDiningInfo() {
    const nameInput = document.getElementById('settingsDiningName');
    const managerInput = document.getElementById('settingsManagerName');
    const startDateInput = document.getElementById('settingsHistoryStartDate');

    const name = this.info?.name || '';
    const manager = this.info?.managerName || '';
    const startDate = this.settings?.historyStartDate || '';

    if (nameInput) nameInput.value = name;
    if (managerInput) managerInput.value = manager;
    if (startDateInput) startDateInput.value = startDate;

    const displayEl = document.getElementById('historyStartDateDisplayText');
    if (displayEl) {
      displayEl.textContent = startDate ? this.formatDateDisplay(startDate) : 'Select Date';
    }

    // Save initial snapshot to compare against
    this.initialDiningInfo = {
      name,
      managerName: manager,
      historyStartDate: startDate
    };

    this.checkDiningInfoChanges();
  },

  /**
   * Check if any Dining Information input has changed from initial value
   */
  checkDiningInfoChanges() {
    const btn = document.getElementById('saveDiningInfoBtn');
    if (!btn) return;

    if (!this.initialDiningInfo) {
      btn.disabled = true;
      btn.classList.add('disabled-btn');
      return;
    }

    const currentName = (document.getElementById('settingsDiningName')?.value || '').trim();
    const currentManager = (document.getElementById('settingsManagerName')?.value || '').trim();
    const currentStartDate = (document.getElementById('settingsHistoryStartDate')?.value || '').trim();

    const isChanged = (
      currentName !== this.initialDiningInfo.name ||
      currentManager !== this.initialDiningInfo.managerName ||
      currentStartDate !== this.initialDiningInfo.historyStartDate
    );

    btn.disabled = !isChanged;
    if (isChanged) {
      btn.classList.remove('disabled-btn');
    } else {
      btn.classList.add('disabled-btn');
    }
  },

  /**
   * Toggle auto meal system
   */
  async toggleAutoMeal(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/autoMealEnabled`).set(enabled);
      Notifications.toast('success', 'Auto Meal', enabled ? 'Auto meal system enabled.' : 'Auto meal system disabled.');
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to update setting.');
    }
  },

  /**
   * Toggle manager meal visibility on dashboard
   */
  async toggleManagerMeal(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/managerMealEnabled`).set(enabled);

      // If disabled, also turn OFF manager's own meal status in DB
      if (!enabled) {
        const userId = Messliner.state.userId;
        if (userId) {
          await db.ref(`dinings/${this.diningId}/users/${userId}/mealStatus`).set({
            breakfast: false,
            lunch: false,
            dinner: false
          });
        }
      }

      Notifications.toast('success', 'My Meal', enabled ? 'My meal section enabled.' : 'My meal section disabled.');
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to update setting.');
    }
  },

  /**
   * Save a deadline value
   */
  async saveDeadline(mealType, time) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/${mealType}Deadline`).set(time);
      Notifications.toast('info', 'Deadline Updated', `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} deadline set to ${Utils.formatTime(time)}.`);
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to save deadline.');
    }
  },

  /**
   * Toggle due limit auto-lock
   */
  async toggleDueLimit(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/dueLimitEnabled`).set(enabled);
      Notifications.toast('success', 'Due Limit Auto-Lock', enabled ? 'Due limit auto-lock enabled.' : 'Due limit auto-lock disabled.');
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to update due limit setting.');
    }
  },

  /**
   * Save due limit amount
   */
  async saveDueLimit(amount) {
    const val = Math.max(0, parseFloat(amount) || 0);
    try {
      await db.ref(`dinings/${this.diningId}/settings/dueLimit`).set(val);
      if (val > 0) {
        await db.ref(`dinings/${this.diningId}/settings/dueLimitEnabled`).set(true);
        const toggle = document.getElementById('settingsDueLimitToggle');
        if (toggle) toggle.checked = true;
      }
      Notifications.toast('success', 'Due Limit Saved', `Maximum due limit set to ৳${val}.`);
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to save due limit amount.');
    }
  },

  calViewYear: new Date().getFullYear(),
  calViewMonth: new Date().getMonth(),

  /**
   * Format YYYY-MM-DD date to nice readable string e.g. "Fri, 28 Aug 2026"
   */
  formatDateDisplay(dateStr) {
    if (!dateStr) return 'Select Date';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts.map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return dateStr;
    return `${days[dt.getDay()]}, ${d} ${months[m - 1]} ${y}`;
  },

  /**
   * Toggle custom calendar popup for Active History Start Date
   */
  toggleHistoryCalendarPopup(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('historyCalendarPopup');
    if (!popup) return;
    const isOpen = popup.style.display !== 'none';
    if (isOpen) {
      this.closeHistoryCalendarPopup();
    } else {
      this.openHistoryCalendarPopup();
    }
  },

  /**
   * Open calendar popup
   */
  openHistoryCalendarPopup() {
    const popup = document.getElementById('historyCalendarPopup');
    if (!popup) return;
    const val = document.getElementById('settingsHistoryStartDate')?.value || (window.Utils ? Utils.today() : new Date().toISOString().substring(0, 10));
    const parts = val.split('-');
    if (parts.length === 3) {
      this.calViewYear = Number(parts[0]);
      this.calViewMonth = Number(parts[1]) - 1;
    }
    this.renderHistoryCalendarPopup();
    popup.style.display = 'block';
  },

  /**
   * Close calendar popup
   */
  closeHistoryCalendarPopup() {
    const popup = document.getElementById('historyCalendarPopup');
    if (popup) popup.style.display = 'none';
  },

  /**
   * Navigate calendar month (-1 / +1)
   */
  navHistoryCalendarMonth(dir, e) {
    if (e) e.stopPropagation();
    this.calViewMonth += dir;
    if (this.calViewMonth < 0) {
      this.calViewMonth = 11;
      this.calViewYear--;
    } else if (this.calViewMonth > 11) {
      this.calViewMonth = 0;
      this.calViewYear++;
    }
    this.renderHistoryCalendarPopup();
  },

  /**
   * Render custom calendar popup days grid (identical to Meals page)
   */
  renderHistoryCalendarPopup() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const titleEl = document.getElementById('historyCalMonthYearTitle');
    if (titleEl) {
      titleEl.textContent = `${monthNames[this.calViewMonth]} ${this.calViewYear}`;
    }

    const gridEl = document.getElementById('historyCalDaysGrid');
    if (!gridEl) return;

    const selectedDate = document.getElementById('settingsHistoryStartDate')?.value || (window.Utils ? Utils.today() : new Date().toISOString().substring(0, 10));
    const todayDate = window.Utils ? Utils.today() : new Date().toISOString().substring(0, 10);

    const year = this.calViewYear;
    const month = this.calViewMonth;

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
      html += `<div class="cal-day-cell muted" onclick="Messliner.settings.selectHistoryCalendarDate('${dateStr}', event)">${dNum}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayDate;
      let classes = 'cal-day-cell';
      if (isSelected) classes += ' selected';
      if (isToday) classes += ' today';
      html += `<div class="${classes}" onclick="Messliner.settings.selectHistoryCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    // Next month leading days
    const totalCells = firstDayIndex + daysInMonth;
    const remainingCells = (totalCells > 35 ? 42 : 35) - totalCells;
    for (let d = 1; d <= remainingCells; d++) {
      let nextM = month + 1;
      let nextY = year;
      if (nextM > 11) { nextM = 0; nextY++; }
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.settings.selectHistoryCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    gridEl.innerHTML = html;
  },

  /**
   * Select date from custom calendar cell
   */
  selectHistoryCalendarDate(dateStr, e) {
    if (e) e.stopPropagation();
    const input = document.getElementById('settingsHistoryStartDate');
    if (input) input.value = dateStr;
    const displayEl = document.getElementById('historyStartDateDisplayText');
    if (displayEl) displayEl.textContent = this.formatDateDisplay(dateStr);
    this.closeHistoryCalendarPopup();
    this.checkDiningInfoChanges();
  },

  /**
   * Save dining info
   */
  async saveDiningInfo() {
    const name = document.getElementById('settingsDiningName').value.trim();
    const manager = document.getElementById('settingsManagerName').value.trim();
    const historyStartDate = (document.getElementById('settingsHistoryStartDate')?.value || '').trim();

    if (!name) {
      Notifications.toast('warning', 'Missing', 'Dining name is required.');
      return;
    }

    try {
      await db.ref(`dinings/${this.diningId}/info`).update({
        name,
        managerName: manager
      });

      if (historyStartDate !== undefined) {
        await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).set(historyStartDate || null);
        if (this.settings) this.settings.historyStartDate = historyStartDate;
      }

      if (this.info) {
        this.info.name = name;
        this.info.managerName = manager;
      }

      // Update initial snapshot
      this.initialDiningInfo = {
        name,
        managerName: manager,
        historyStartDate
      };

      // Update sidebar
      Utils.setText('sidebarDiningName', name);
      Notifications.toast('success', 'Saved', 'Dining information updated.');
      await Notifications.log(this.diningId, 'settings_updated', `Dining info updated: ${name}`, Messliner.state.userId);

      // Disable save button until new changes are made
      this.checkDiningInfoChanges();
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to save dining info.');
    }
  },

  /**
   * Copy mess join code to clipboard
   */
  copyMessCode() {
    const codeDisplay = document.getElementById('settingsMessCodeDisplay');
    const code = this.info?.messCode || (codeDisplay ? codeDisplay.textContent : '');
    if (code && code !== '-') {
      navigator.clipboard.writeText(code);
      Notifications.toast('success', 'Copied!', 'Mess join code copied to clipboard.');
    }
  },

  /**
   * Open Reset Data Security Verification Modal
   */
  openResetSecurityModal() {
    const codeDisplay = document.getElementById('settingsMessCodeDisplay');
    const expectedCode = (this.info?.messCode || (codeDisplay ? codeDisplay.textContent : '') || '').trim();
    
    const targetTextEl = document.getElementById('resetSecurityCodeTargetText');
    if (targetTextEl) {
      targetTextEl.textContent = expectedCode || '------';
    }

    const input = document.getElementById('resetSecurityCodeInput');
    if (input) {
      input.value = '';
      input.style.borderColor = '#CBD5E1';
    }

    const errorMsg = document.getElementById('resetSecurityErrorMsg');
    if (errorMsg) {
      errorMsg.style.display = 'none';
    }

    const btn = document.getElementById('btnExecuteResetData');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M3 6h18"/>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
        <span>Verify &amp; Reset</span>
      `;
    }

    openModal('resetDataSecurityModal');
    if (input) {
      setTimeout(() => input.focus(), 150);
    }
  },

  closeResetSecurityModal() {
    closeModal('resetDataSecurityModal');
  },

  onResetCodeInput(val) {
    const errorMsg = document.getElementById('resetSecurityErrorMsg');
    const input = document.getElementById('resetSecurityCodeInput');
    if (errorMsg && errorMsg.style.display !== 'none') {
      errorMsg.style.display = 'none';
    }
    if (input) {
      input.style.borderColor = '#DC2626';
    }
  },

  /**
   * Confirm and execute Reset Data with code verification
   */
  async confirmResetSecurity() {
    const input = document.getElementById('resetSecurityCodeInput');
    const errorMsg = document.getElementById('resetSecurityErrorMsg');
    const btn = document.getElementById('btnExecuteResetData');

    const enteredCode = (input ? input.value : '').trim().toUpperCase();

    // Get expected mess code from local state or fetch fresh from DB
    let expectedCode = (this.info?.messCode || '').trim().toUpperCase();
    if (!expectedCode) {
      try {
        const snap = await db.ref(`dinings/${this.diningId}/info/messCode`).once('value');
        expectedCode = (snap.val() || '').trim().toUpperCase();
      } catch (e) {
        console.error('Error fetching mess code for verification:', e);
      }
    }

    if (!enteredCode || enteredCode !== expectedCode) {
      if (errorMsg) {
        errorMsg.textContent = !enteredCode 
          ? 'Please enter your mess code to confirm.' 
          : 'Invalid mess code. Code does not match!';
        errorMsg.style.display = 'block';
      }
      if (input) {
        input.style.borderColor = '#DC2626';
        input.focus();
      }
      return;
    }

    // Code verified! Execute reset
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block; width:14px; height:14px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span><span>Resetting Data...</span>`;
    }

    try {
      await this.resetData();
      this.closeResetSecurityModal();
    } catch (error) {
      console.error('Security reset execution error:', error);
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }
  },

  /**
   * Trigger Security Verification Modal
   */
  confirmReset() {
    this.openResetSecurityModal();
  },

  /**
   * Reset all financial + meal data
   */
  async resetData() {
    try {
      const updates = {};
      updates[`dinings/${this.diningId}/meals`] = null;
      updates[`dinings/${this.diningId}/deposits`] = null;
      updates[`dinings/${this.diningId}/bazar`] = null;
      updates[`dinings/${this.diningId}/logs`] = null;
      updates[`dinings/${this.diningId}/notifications`] = null;
      updates[`dinings/${this.diningId}/summary`] = null;

      // Reset user totals
      const users = Messliner.users.users;
      if (users && typeof users === 'object') {
        Object.keys(users).forEach(uid => {
          updates[`dinings/${this.diningId}/users/${uid}/totalDeposit`] = 0;
          updates[`dinings/${this.diningId}/users/${uid}/totalMeals`] = 0;
          updates[`dinings/${this.diningId}/users/${uid}/mealCost`] = 0;
          updates[`dinings/${this.diningId}/users/${uid}/balance`] = 0;
        });
      }

      await db.ref().update(updates);

      Notifications.toast('success', 'Data Reset Complete', 'All mess data has been wiped successfully.');

    } catch (error) {
      console.error('Reset error:', error);
      Notifications.toast('error', 'Error', 'Failed to reset mess data.');
      throw error;
    }
  },

  _updateFixedRateRowsVisibility(tracked = { breakfast: true, lunch: true, dinner: true }) {
    const bRow = document.getElementById('fixedRateBreakfastRow');
    const lRow = document.getElementById('fixedRateLunchRow');
    const dRow = document.getElementById('fixedRateDinnerRow');

    if (bRow) bRow.style.display = tracked.breakfast !== false ? 'flex' : 'none';
    if (lRow) lRow.style.display = tracked.lunch !== false ? 'flex' : 'none';
    if (dRow) dRow.style.display = tracked.dinner !== false ? 'flex' : 'none';

    this._updateFixedRateFullMealDisplay();
  },

  _updateFixedRateFullMealDisplay() {
    const tracked = this.settings?.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const frb = parseFloat(document.getElementById('settingsFixedRateBreakfast')?.value) || 0;
    const frl = parseFloat(document.getElementById('settingsFixedRateLunch')?.value) || 0;
    const frd = parseFloat(document.getElementById('settingsFixedRateDinner')?.value) || 0;

    let fullMeal = 0;
    if (tracked.breakfast !== false) fullMeal += frb;
    if (tracked.lunch !== false) fullMeal += frl;
    if (tracked.dinner !== false) fullMeal += frd;

    const displayEl = document.getElementById('fixedRatesFullMealDisplay');
    if (displayEl) {
      displayEl.innerHTML = `Full Meal: <span style="font-size: 0.95rem; font-weight: 800; color: #064E3B;">৳${fullMeal}</span>`;
    }
  },

  async updateTrackedMeals() {
    const b = document.getElementById('settingsTrackedBreakfast').checked;
    const l = document.getElementById('settingsTrackedLunch').checked;
    const d = document.getElementById('settingsTrackedDinner').checked;

    if (!b && !l && !d) {
      Notifications.toast('warning', 'Invalid Input', 'At least one meal time must be active.');
      this._populateUI(); // Reset UI
      return;
    }

    this._updateFixedRateRowsVisibility({ breakfast: b, lunch: l, dinner: d });

    try {
      await db.ref(`dinings/${this.diningId}/settings/trackedMeals`).set({
        breakfast: b,
        lunch: l,
        dinner: d
      });
      Notifications.toast('success', 'Settings Saved', 'Tracked meals updated.');
    } catch (e) {
      Notifications.toast('error', 'Error', 'Failed to update tracked meals.');
    }
  },

  async updateRateMode(mode) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/rateMode`).set(mode);
      // Toggle inputs visibility
      const fixedRatesSection = document.getElementById('settingsFixedRatesSection');
      if (fixedRatesSection) {
        fixedRatesSection.style.display = mode === 'fixed' ? 'block' : 'none';
      }
      this._updateFixedRateFullMealDisplay();
      Notifications.toast('success', 'Settings Saved', `Rate mode changed to ${mode === 'fixed' ? 'Fixed Rate' : 'Market Rate'}.`);
    } catch (e) {
      Notifications.toast('error', 'Error', 'Failed to update rate mode.');
    }
  },

  async saveFixedRates() {
    const btn = document.getElementById('btnSaveFixedRates');
    const oldBtnContent = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block; width:13px; height:13px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span><span>Saving...</span>';
    }

    const b = parseFloat(document.getElementById('settingsFixedRateBreakfast')?.value) || 0;
    const l = parseFloat(document.getElementById('settingsFixedRateLunch')?.value) || 0;
    const d = parseFloat(document.getElementById('settingsFixedRateDinner')?.value) || 0;

    try {
      await db.ref(`dinings/${this.diningId}/settings/fixedRates`).set({
        breakfast: b,
        lunch: l,
        dinner: d
      });
      if (!this.settings) this.settings = {};
      this.settings.fixedRates = { breakfast: b, lunch: l, dinner: d };
      this._updateFixedRateFullMealDisplay();
      Notifications.toast('success', 'Prices Saved', 'Fixed meal rates updated successfully.');
    } catch (e) {
      console.error('[Settings] Error saving fixed rates:', e);
      Notifications.toast('error', 'Error', 'Failed to update fixed meal prices.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldBtnContent;
      }
    }
  },

  async toggleManagerBazar(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/managerBazarEnabled`).set(enabled);
      Notifications.toast('success', 'Settings Saved', enabled ? 'Manager added to bazar rotation.' : 'Manager removed from bazar rotation.');
    } catch (e) {
      Notifications.toast('error', 'Error', 'Failed to update setting.');
    }
  },

  async toggleAiAssistant(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/aiAssistantEnabled`).set(enabled);
      Notifications.toast('success', 'AI Assistant', enabled ? 'AI Assistant enabled.' : 'AI Assistant disabled.');
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to update setting.');
    }
  },

  async toggleAiFileUpload(enabled) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/aiFileUploadEnabled`).set(enabled);
      Notifications.toast('success', 'AI File Upload', enabled ? 'AI File Upload enabled.' : 'AI File Upload disabled.');
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to update setting.');
    }
  },

  async saveHistoryStartDate(dateStr) {
    const input = document.getElementById('settingsHistoryStartDate');
    const val = (dateStr !== undefined) ? dateStr : (input ? input.value : '');

    try {
      await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).set(val || null);
      Notifications.toast('success', 'Settings Saved', 'Active history start date updated.');
    } catch (e) {
      console.error('[Settings] Error saving start date:', e);
      Notifications.toast('error', 'Error', 'Failed to update start date.');
    }
  },

  /**
   * Populate rules input
   */
  _populateRulesUI() {
    const rulesInput = document.getElementById('settingsRulesInput');
    if (rulesInput && this.rules) {
      let rulesArr = this.rules;
      if (typeof rulesArr === 'object' && !Array.isArray(rulesArr)) {
        rulesArr = Object.values(rulesArr);
      }
      rulesInput.value = rulesArr.join('\n');
    }
  },

  /**
   * Save mess rules to Firebase
   */
  async saveMessRules() {
    const rulesInput = document.getElementById('settingsRulesInput');
    if (!rulesInput) return;
    const rulesText = rulesInput.value.trim();
    const rulesList = rulesText.split('\n').map(r => r.trim()).filter(r => r.length > 0);

    try {
      await db.ref(`dinings/${this.diningId}/rules`).set(rulesList);
      Notifications.toast('success', 'Rules Saved', 'Mess rules and guidelines updated.');
      await Notifications.log(this.diningId, 'rules_updated', 'Mess rules updated by admin', Messliner.state.userId);
    } catch (error) {
      console.error('Error saving rules:', error);
      Notifications.toast('error', 'Error', 'Failed to save mess rules.');
    }
  },

  _transferMembersList: [],
  _selectedTransferUserId: null,

  /**
   * Open Transfer Ownership Modal
   */
  async openTransferOwnershipModal() {
    const selectEl = document.getElementById('transferOwnershipMemberSelect');
    const listEl = document.getElementById('transferOwnershipMemberList');
    const searchInput = document.getElementById('transferOwnershipSearchInput');
    const btn = document.getElementById('confirmTransferOwnershipBtn');

    this._selectedTransferUserId = null;
    this._transferMembersList = [];

    if (searchInput) searchInput.value = '';
    if (selectEl) selectEl.innerHTML = '<option value="">Loading members...</option>';
    if (listEl) {
      listEl.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: #94A3B8; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span style="display:inline-block; width:16px; height:16px; border:2px solid #CBD5E1; border-top-color:#3B82F6; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
          <span>Loading members...</span>
        </div>
      `;
    }
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.55';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
        </svg>
        <span>Confirm Transfer</span>
      `;
    }

    if (typeof openModal === 'function') {
      openModal('transferOwnershipModal');
    }

    try {
      const diningId = this.diningId || (window.Messliner && Messliner.state ? Messliner.state.diningId : null);
      const snap = await db.ref(`dinings/${diningId}/users`).once('value');
      const users = snap.val() || {};
      const currentUserId = window.Messliner && Messliner.state ? Messliner.state.userId : null;

      const eligibleMembers = Object.entries(users)
        .filter(([uid, u]) => {
          return uid !== currentUserId && u && u.status !== 'inactive' && u.status !== 'left';
        })
        .map(([uid, u]) => ({
          uid,
          name: u.name || u.displayName || 'Member',
          email: u.email || '',
          phone: u.phone || '',
          avatar: u.photoURL || u.avatar || '',
          role: u.role || 'member'
        }));

      this._transferMembersList = eligibleMembers;

      if (eligibleMembers.length === 0) {
        if (selectEl) selectEl.innerHTML = '<option value="">No other members found in mess</option>';
        if (listEl) {
          listEl.innerHTML = `
            <div style="padding: 24px 16px; text-align: center; color: #94A3B8; font-size: 0.85rem;">
              No other active members found in this mess.
            </div>
          `;
        }
        return;
      }

      if (selectEl) {
        selectEl.innerHTML = '<option value="">-- Select New Manager / Owner --</option>' +
          eligibleMembers.map(m => {
            const extra = m.email ? ` (${m.email})` : (m.phone ? ` (${m.phone})` : '');
            return `<option value="${m.uid}">${m.name}${extra}</option>`;
          }).join('');
      }

      this.renderTransferMembersList(eligibleMembers);
    } catch (err) {
      console.error('[Settings] Error loading members for transfer:', err);
      if (selectEl) selectEl.innerHTML = '<option value="">Failed to load members</option>';
      if (listEl) {
        listEl.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: #EF4444; font-size: 0.85rem;">
            Failed to load members. Please try again.
          </div>
        `;
      }
    }
  },

  /**
   * Filter members list by search query
   */
  filterTransferMembers(query = '') {
    const q = (query || '').toLowerCase().trim();
    if (!this._transferMembersList) return;

    if (!q) {
      this.renderTransferMembersList(this._transferMembersList);
      return;
    }

    const filtered = this._transferMembersList.filter(m => {
      const name = (m.name || '').toLowerCase();
      const email = (m.email || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });

    this.renderTransferMembersList(filtered, q);
  },

  /**
   * Select a member for transfer
   */
  selectTransferMember(userId) {
    this._selectedTransferUserId = userId;
    const selectEl = document.getElementById('transferOwnershipMemberSelect');
    if (selectEl) selectEl.value = userId;

    // Update list card UI
    const listEl = document.getElementById('transferOwnershipMemberList');
    if (listEl) {
      const items = listEl.querySelectorAll('.transfer-member-item');
      items.forEach(item => {
        const isSelected = item.getAttribute('data-uid') === userId;
        if (isSelected) {
          item.style.borderColor = '#059669';
          item.style.background = '#ECFDF5';
          const radioDot = item.querySelector('.transfer-radio-dot');
          if (radioDot) {
            radioDot.style.borderColor = '#059669';
            radioDot.style.background = '#059669';
            radioDot.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          }
        } else {
          item.style.borderColor = '#F1F5F9';
          item.style.background = '#FFFFFF';
          const radioDot = item.querySelector('.transfer-radio-dot');
          if (radioDot) {
            radioDot.style.borderColor = '#CBD5E1';
            radioDot.style.background = 'transparent';
            radioDot.innerHTML = '';
          }
        }
      });
    }

    // Enable confirm button
    const btn = document.getElementById('confirmTransferOwnershipBtn');
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  },

  /**
   * Render searchable member cards
   */
  renderTransferMembersList(members, query = '') {
    const listEl = document.getElementById('transferOwnershipMemberList');
    if (!listEl) return;

    if (!members || members.length === 0) {
      const safeQ = query ? String(query).replace(/[<>&"]/g, '') : '';
      listEl.innerHTML = `
        <div style="padding: 28px 16px; text-align: center; color: #94A3B8; font-size: 0.85rem;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 8px; display: block;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          No members found matching "${safeQ}"
        </div>
      `;
      return;
    }

    listEl.innerHTML = members.map(m => {
      const isSelected = m.uid === this._selectedTransferUserId;
      const initials = (window.Utils && Utils.initials) ? Utils.initials(m.name || 'Member') : (m.name || 'M').charAt(0).toUpperCase();
      const subInfo = m.phone || m.email || 'Mess member';
      const safeName = String(m.name || 'Member').replace(/[<>&"]/g, '');
      const safeSub = String(subInfo).replace(/[<>&"]/g, '');

      const borderStyle = isSelected ? 'border-color: #059669; background: #ECFDF5;' : 'border-color: #F1F5F9; background: #FFFFFF;';
      const radioContent = isSelected
        ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '';
      const radioBg = isSelected ? 'border-color: #059669; background: #059669;' : 'border-color: #CBD5E1; background: transparent;';

      return `
        <div class="transfer-member-item" data-uid="${m.uid}"
          onclick="Messliner.settings.selectTransferMember('${m.uid}')"
          style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 12px; border: 1.5px solid; ${borderStyle} cursor: pointer; transition: all 0.18s ease; user-select: none;"
          onmouseenter="if(this.getAttribute('data-uid') !== Messliner.settings._selectedTransferUserId) { this.style.borderColor='#E2E8F0'; this.style.background='#F8FAFC'; }"
          onmouseleave="if(this.getAttribute('data-uid') !== Messliner.settings._selectedTransferUserId) { this.style.borderColor='#F1F5F9'; this.style.background='#FFFFFF'; }">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
            <div class="member-tia-avatar" style="width: 38px !important; height: 38px !important; border-radius: 50% !important; background: #dcfce7 !important; color: #15803d !important; font-weight: 800 !important; font-size: 0.875rem !important; display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0; user-select: none; box-shadow: none !important; border: none !important;">
              ${initials}
            </div>
            <div style="min-width: 0; overflow: hidden; text-overflow: ellipsis;">
              <div style="font-weight: 700; font-size: 0.9rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${safeName}
              </div>
              <div style="font-size: 0.76rem; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">
                ${safeSub}
              </div>
            </div>
          </div>
          <div class="transfer-radio-dot" style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid; ${radioBg} display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.18s ease;">
            ${radioContent}
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Execute Transfer Ownership
   */
  async executeTransferOwnership() {
    const selectEl = document.getElementById('transferOwnershipMemberSelect');
    const newManagerId = this._selectedTransferUserId || (selectEl ? selectEl.value : null);

    if (!newManagerId) {
      Notifications.toast('warning', 'Select Member', 'Please select a member to transfer ownership to.');
      return;
    }

    const currentUserId = window.Messliner && Messliner.state ? Messliner.state.userId : null;
    const diningId = this.diningId || (window.Messliner && Messliner.state ? Messliner.state.diningId : null);
    if (!currentUserId || !diningId) return;

    const btn = document.getElementById('confirmTransferOwnershipBtn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.innerHTML = `
        <span style="display:inline-block; width:14px; height:14px; border:2px solid #FFFFFF; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
        <span>Transferring...</span>
      `;
    }

    try {
      const userSnap = await db.ref(`dinings/${diningId}/users/${newManagerId}`).once('value');
      const newManager = userSnap.val() || {};
      const newManagerName = newManager.name || newManager.displayName || 'New Manager';

      const updates = {};
      updates[`dinings/${diningId}/users/${newManagerId}/role`] = 'admin';
      updates[`dinings/${diningId}/users/${currentUserId}/role`] = 'member';
      updates[`dinings/${diningId}/info/managerName`] = newManagerName;
      updates[`dinings/${diningId}/info/managerId`] = newManagerId;

      await db.ref().update(updates);

      // Audit log
      if (window.Notifications && Notifications.log) {
        await Notifications.log(
          diningId,
          'ownership_transferred',
          `Ownership transferred from ${Messliner.state.userName || 'Admin'} to ${newManagerName}`,
          currentUserId
        );
      }

      if (typeof closeModal === 'function') {
        closeModal('transferOwnershipModal');
      }
      Notifications.toast('success', 'Ownership Transferred', `Mess ownership transferred to ${newManagerName} successfully.`);

      Messliner.state.role = 'member';
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('[Settings] Transfer Ownership Error:', err);
      Notifications.toast('error', 'Transfer Failed', 'Failed to transfer ownership.');
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
          </svg>
          <span>Confirm Transfer</span>
        `;
      }
    }
  },

  /**
   * Get current settings (for other modules)
   */
  getSettings() {
    return this.settings;
  },

  /**
   * Refresh settings page
   */
  refresh() {
    this._populateUI();
    this._populateDiningInfo();
    this._populateRulesUI();
  }
};

// Close history calendar popup on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#historyDatePickerWrap')) {
    if (window.Messliner && Messliner.settings && Messliner.settings.closeHistoryCalendarPopup) {
      Messliner.settings.closeHistoryCalendarPopup();
    }
  }
});

console.log('[Messliner] Settings module loaded');
