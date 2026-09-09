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
   * Confirm data reset
   */
  confirmReset() {
    document.getElementById('confirmTitle').textContent = 'Reset All Data?';
    document.getElementById('confirmMessage').textContent = 'This will permanently delete ALL meals, deposits, bazar records, and logs. Users will be kept. This cannot be undone!';
    document.getElementById('confirmActionBtn').textContent = 'Reset Everything';
    document.getElementById('confirmActionBtn').onclick = () => this.resetData();
    openModal('confirmDialog');
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
      Object.keys(users).forEach(uid => {
        updates[`dinings/${this.diningId}/users/${uid}/totalDeposit`] = 0;
        updates[`dinings/${this.diningId}/users/${uid}/totalMeals`] = 0;
        updates[`dinings/${this.diningId}/users/${uid}/mealCost`] = 0;
        updates[`dinings/${this.diningId}/users/${uid}/balance`] = 0;
      });

      await db.ref().update(updates);

      Notifications.toast('success', 'Data Reset', 'All data has been reset successfully.');
      closeModal('confirmDialog');

    } catch (error) {
      console.error('Reset error:', error);
      Notifications.toast('error', 'Error', 'Failed to reset data.');
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
      Notifications.toast('success', 'Settings Saved', `Rate mode changed to ${mode === 'fixed' ? 'Fixed Rate' : 'Market Rate'}.`);
    } catch (e) {
      Notifications.toast('error', 'Error', 'Failed to update rate mode.');
    }
  },

  async saveFixedRates() {
    const b = parseFloat(document.getElementById('settingsFixedRateBreakfast').value) || 0;
    const l = parseFloat(document.getElementById('settingsFixedRateLunch').value) || 0;
    const d = parseFloat(document.getElementById('settingsFixedRateDinner').value) || 0;

    try {
      await db.ref(`dinings/${this.diningId}/settings/fixedRates`).set({
        breakfast: b,
        lunch: l,
        dinner: d
      });
      Notifications.toast('success', 'Prices Saved', 'Fixed meal rates updated.');
    } catch (e) {
      Notifications.toast('error', 'Error', 'Failed to update fixed meal prices.');
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
