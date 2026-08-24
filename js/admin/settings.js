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
    if (bf) bf.value = s.breakfastDeadline || '04:00';
    if (lf) lf.value = s.lunchDeadline || '10:00';
    if (df) df.value = s.dinnerDeadline || '16:00';

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
      startDateInput.value = s.historyStartDate || '';
    }

    // Mess Code display
    const codeDisplay = document.getElementById('settingsMessCodeDisplay');
    if (codeDisplay && this.info) {
      codeDisplay.textContent = this.info.messCode || '-';
    }
  },

  /**
   * Populate dining info fields
   */
  _populateDiningInfo() {
    const nameInput = document.getElementById('settingsDiningName');
    const managerInput = document.getElementById('settingsManagerName');
    if (nameInput) nameInput.value = this.info?.name || '';
    if (managerInput) managerInput.value = this.info?.managerName || '';
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
   * Save dining info
   */
  async saveDiningInfo() {
    const name = document.getElementById('settingsDiningName').value.trim();
    const manager = document.getElementById('settingsManagerName').value.trim();

    if (!name) {
      Notifications.toast('warning', 'Missing', 'Dining name is required.');
      return;
    }

    try {
      await db.ref(`dinings/${this.diningId}/info`).update({
        name,
        managerName: manager
      });

      // Update sidebar
      Utils.setText('sidebarDiningName', name);
      Notifications.toast('success', 'Saved', 'Dining information updated.');
      await Notifications.log(this.diningId, 'settings_updated', `Dining info updated: ${name}`, Messliner.state.userId);
    } catch (error) {
      Notifications.toast('error', 'Error', 'Failed to save dining info.');
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

console.log('[Messliner] Settings module loaded');
