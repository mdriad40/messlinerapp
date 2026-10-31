/* ============================================
   Messliner — Meal Management (admin/meals.js)
   ============================================ */

const MealsModule = {
  selectedTypes: new Set(['breakfast']),
  selectedUsers: new Set(),
  currentDate: Utils.today(),
  mealsData: {},
  targetMealsData: {},
  selectedLockedMeals: [],
  activeMealMembersMap: {},
  activeAdminTab: 'locked-meals',
  extraSlipEntries: {},

  /**
   * Switch active navigation tab in Admin Meal Management
   */
  switchAdminMealTab(tabName) {
    this.activeAdminTab = tabName || 'locked-meals';

    const tabMap = {
      'locked-meals': { btnId: 'tabBtnLockedMeals', viewId: 'tabViewLockedMeals' },
      'manual-add': { btnId: 'tabBtnManualAdd', viewId: 'tabViewManualAdd' },
      'friday-meal': { btnId: 'tabBtnFridayMeal', viewId: 'tabViewFridayMeal' },
      'saved-slips': { btnId: 'tabBtnSavedSlips', viewId: 'tabViewSavedSlips' },
      'meal-settings': { btnId: 'tabBtnMealSettings', viewId: 'tabViewMealSettings' }
    };

    Object.entries(tabMap).forEach(([key, cfg]) => {
      const btn = document.getElementById(cfg.btnId);
      const view = document.getElementById(cfg.viewId);
      const isActive = key === this.activeAdminTab;

      if (btn) btn.classList.toggle('active', isActive);
      if (view) {
        view.style.display = isActive ? 'block' : 'none';
        if (isActive) {
          view.classList.add('active');
        } else {
          view.classList.remove('active');
        }
      }
    });

    if (this.activeAdminTab === 'friday-meal' && typeof Messliner !== 'undefined' && Messliner.fridayMeals) {
      Messliner.fridayMeals.refresh();
    }
    if (this.activeAdminTab === 'meal-settings') {
      this.initMealSettingsView();
    }
    if (this.activeAdminTab === 'saved-slips') {
      this.initDownloadSlip();
    }
  },

  /**
   * Initialize Meal Settings tab view (Populate dropdowns & render active members / extra slips)
   */
  initMealSettingsView() {
    const now = new Date();
    const currentDateMonth = this.currentDate ? this.currentDate.substring(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = currentDateMonth.split('-').map(Number);

    this._populateYearDropdown('activeMembersYearSelect', y);
    this._populateMonthDropdown('activeMembersMonthSelect', m);

    this.renderActiveMembersList();
    this.renderExtraSlipEntriesList();
  },

  /**
   * Check if a member's meal is active for a given date or month string (YYYY-MM)
   */
  isUserActiveForMonth(userId, dateOrMonthStr) {
    if (!userId) return false;
    const monthStr = dateOrMonthStr ? dateOrMonthStr.substring(0, 7) : (this.currentDate ? this.currentDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
    const monthConfig = this.activeMealMembersMap?.[monthStr];

    // If no configuration is explicitly set for this month yet, default all users to true (active)
    if (!monthConfig || Object.keys(monthConfig).length === 0) {
      return true;
    }

    if (monthConfig[userId] !== undefined) {
      return !!monthConfig[userId];
    }

    return true;
  },

  /**
   * Get the "target date" for Complete Locked Meals.
   *
   * Normal case  → tomorrow (meals for tomorrow get locked tonight).
   * Overnight case → today, when we are past midnight but still BEFORE the
   *   earliest meal deadline of the current day.  In that window today's meals
   *   were locked last night and may still be pending completion, so the admin
   *   must be able to act on TODAY, not on tomorrow.
   *
   * Example: deadline = 23:15.  At 00:47 the next day:
   *   isPastDeadline("23:15") → false  (00:47 < 23:15)  ← old bug: showed Open
   *   New logic: if today's meals are not yet completed AND current hour is
   *   before the earliest deadline, return today so the locked status is
   *   correctly derived from "deadline passed yesterday night".
   */
  getTargetDate() {
    return Utils.today() || '';
  },

  /**
   * Check if a meal is "locked" for the given targetDate.
   * - If targetDate === today: deadline passed YESTERDAY (overnight window),
   *   so we don't use isPastDeadline (which would return false after midnight).
   *   Instead we always treat it as locked (deadline already passed last night).
   * - If targetDate === tomorrow: deadline passes today, use isPastDeadline normally.
   */
  _isMealLocked(mealType, deadlineStr, targetDate) {
    const s = Messliner.settings?.getSettings() || {};
    const locks = s.locks || {};
    const manualLock = locks[mealType];
    if (manualLock === 'locked') return true;
    if (manualLock === 'unlocked') return false;

    const autoEnabled = s.autoMealEnabled !== false;
    if (!autoEnabled) return false;

    const todayStr = Utils.today();
    if (targetDate === todayStr) {
      // Overnight window: deadline was last night — always locked
      return true;
    }
    // Normal case: check if today's time has passed the deadline
    return Utils.isPastDeadline(deadlineStr);
  },

  /**
   * Helper to parse meal value into a numeric count (handles number, boolean, numeric string)
   */
  _parseMealVal(val) {
    if (val === true || val === 'true') return 1;
    if (typeof val === 'number') return val > 0 ? val : 0;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return (!isNaN(parsed) && parsed > 0) ? parsed : 0;
    }
    return 0;
  },

  /**
   * Get meal data for a specific date (handles current/target month boundaries)
   */
  getDayData(dateStr) {
    if (!dateStr) return {};
    const month = dateStr.substring(0, 7);
    const day = Utils.dayKey(dateStr);
    const unpaddedDay = String(parseInt(day, 10));
    const currentMonth = this.currentDate.substring(0, 7);

    if (month === currentMonth) {
      return this.mealsData[day] || this.mealsData[unpaddedDay] || {};
    } else {
      return (this.targetMealsData && (this.targetMealsData[day] || this.targetMealsData[unpaddedDay])) || {};
    }
  },

  /**
   * Initialize meals module
   */
  init(diningId) {
    this.diningId = diningId;
    this.switchAdminMealTab(this.activeAdminTab || 'locked-meals');

    // Set date input & display
    const dateInput = document.getElementById('mealDateInput');
    if (dateInput) {
      dateInput.value = this.currentDate;
    }
    this.updateDateDisplay();

    // Attach global click listener to close custom calendar when clicking outside
    if (!this._globalCalClickAttached) {
      this._globalCalClickAttached = true;
      document.addEventListener('click', (e) => {
        const wrap = document.getElementById('customDatePickerWrap');
        if (wrap && !wrap.contains(e.target)) {
          this.closeCalendarPopup();
        }
        const slipWrap = document.getElementById('slipDatePickerWrap');
        if (slipWrap && !slipWrap.contains(e.target)) {
          this.closeSlipCalendarPopup();
        }
      });
    }

    // Setup listener for manual lock type dropdown change
    const typeSelect = document.getElementById('manualLockMealType');
    const stateSelect = document.getElementById('manualLockState');
    if (typeSelect && stateSelect) {
      typeSelect.addEventListener('change', () => {
        const mealType = typeSelect.value;
        const s = Messliner.settings?.getSettings() || {};
        const locks = s.locks || {};
        stateSelect.value = locks[mealType] || 'auto';
      });
    }

    // Render tabs dynamically based on settings
    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      const s = snap.val() || {};
      const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      this.trackedMeals = trackedMeals;

      // Update lock overrides dropdown to match current DB settings
      const typeSelectInner = document.getElementById('manualLockMealType');
      const stateSelectInner = document.getElementById('manualLockState');
      if (typeSelectInner && stateSelectInner) {
        const mealType = typeSelectInner.value;
        const locks = s.locks || {};
        stateSelectInner.value = locks[mealType] || 'auto';
      }

      const tabContainer = document.getElementById('mealTypeTabs');
      if (tabContainer) {
        tabContainer.innerHTML = '';
        const mealsList = [
          {
            type: 'breakfast',
            label: 'Breakfast',
            iconHtml: `<div class="meal-tab-glass-icon glass-breakfast">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" fill="rgba(245, 158, 11, 0.4)"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
            </div>`
          },
          {
            type: 'lunch',
            label: 'Lunch',
            iconHtml: `<div class="meal-tab-glass-icon glass-lunch">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0" fill="rgba(16, 185, 129, 0.3)"/>
              </svg>
            </div>`
          },
          {
            type: 'dinner',
            label: 'Dinner',
            iconHtml: `<div class="meal-tab-glass-icon glass-dinner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="rgba(124, 58, 237, 0.35)"/>
              </svg>
            </div>`
          }
        ];

        let firstActive = null;
        mealsList.forEach(m => {
          if (trackedMeals[m.type] !== false) {
            if (!firstActive) firstActive = m.type;
            const activeClass = this.selectedTypes.has(m.type) ? 'active' : '';
            tabContainer.innerHTML += `
              <button class="meal-type-tab ${activeClass}" data-type="${m.type}"
                onclick="Messliner.meals.selectType('${m.type}')">
                ${m.iconHtml}
                <span class="meal-tab-label">${m.label}</span>
              </button>
            `;
          }
        });

        // If current selected types are all disabled, switch to first active
        let hasActiveSelected = false;
        this.selectedTypes.forEach(t => {
          if (trackedMeals[t] !== false) hasActiveSelected = true;
          else this.selectedTypes.delete(t);
        });
        if (!hasActiveSelected && firstActive) {
          this.selectedTypes.clear();
          this.selectedTypes.add(firstActive);
          this.renderUserGrid();
        }
      }
    });

    // Setup listener for active meal members per month
    db.ref(`dinings/${diningId}/settings/activeMealMembers`).on('value', (snap) => {
      this.activeMealMembersMap = snap.val() || {};
      if (typeof Router !== 'undefined' && (Router.currentPage === 'meals' || Router.currentPage === 'dashboard')) {
        this.renderUserGrid();
        this.renderMealLog();
        this.updateCompleteMealSelect();
      }
    });

    // Setup listener for extra slip entries (cook/staff/guest slip presets)
    db.ref(`dinings/${diningId}/settings/extraSlipEntries`).on('value', (snap) => {
      this.extraSlipEntries = snap.val() || {};
      if (typeof Router !== 'undefined' && Router.currentPage === 'meals') {
        this.renderExtraSlipEntriesList();
      }
    });

    // Setup realtime listener for current month's meals
    this._listenMeals();
  },

  /**
   * Listen to meals for current month (and target month if they differ)
   */
  _listenMeals() {
    const currentMonth = this.currentDate.substring(0, 7);
    const targetDate = this.getTargetDate();
    const targetMonth = targetDate.substring(0, 7);

    // Clean up previous listeners if they exist
    if (this._currentMonthRef && this._currentMonthCallback) {
      this._currentMonthRef.off('value', this._currentMonthCallback);
    }
    if (this._targetMonthRef && this._targetMonthCallback) {
      this._targetMonthRef.off('value', this._targetMonthCallback);
    }

    this.mealsData = {};
    this.targetMealsData = {};

    this._currentMonthRef = db.ref(`dinings/${this.diningId}/meals/${currentMonth}`);
    this._currentMonthCallback = this._currentMonthRef.on('value', (snap) => {
      this.mealsData = snap.val() || {};
      this._triggerRender();
    });

    if (currentMonth !== targetMonth) {
      this._targetMonthRef = db.ref(`dinings/${this.diningId}/meals/${targetMonth}`);
      this._targetMonthCallback = this._targetMonthRef.on('value', (snap) => {
        this.targetMealsData = snap.val() || {};
        this._triggerRender();
      });
    } else {
      this._targetMonthRef = null;
      this._targetMonthCallback = null;
      this.targetMealsData = {};
    }
  },

  /**
   * Trigger rendering of meals views if current page is meals
   */
  _triggerRender() {
    if (Router.currentPage === 'meals') {
      this.renderUserGrid();
      this.renderMealLog();
      this.updateCompleteMealSelect();

      // Keep downloader in sync if it is set to the active date
      const dateInput = document.getElementById('downloadSlipDateInput');
      if (dateInput && dateInput.value === this.currentDate) {
        this.loadDownloadSlipOptions();
      }
    }
  },

  /**
   * Select / deselect meal type tab (supports multi-select)
   */
  selectType(type) {
    if (this.selectedTypes.has(type)) {
      this.selectedTypes.delete(type);
    } else {
      this.selectedTypes.add(type);
    }

    document.querySelectorAll('.meal-type-tab').forEach(tab => {
      tab.classList.toggle('active', this.selectedTypes.has(tab.dataset.type));
    });
    this.renderUserGrid();
  },

  /**
   * Render user selection grid for meals
   */
  renderUserGrid() {
    const grid = document.getElementById('mealUsersGrid');
    if (!grid) return;

    const users = Messliner.users.users;
    const isManagerMealEnabled = !!(Messliner.settings.getSettings().managerMealEnabled);
    const monthStr = this.currentDate ? this.currentDate.substring(0, 7) : Utils.today().substring(0, 7);

    const userEntries = Object.entries(users).filter(([id, user]) => {
      if (user.role === 'admin' && !isManagerMealEnabled) {
        return false;
      }
      return this.isUserActiveForMonth(id, monthStr);
    });

    if (userEntries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/></svg>
          </div>
          <h3>No Active Meal Members</h3>
          <p>Select monthly active members or add members first.</p>
        </div>
      `;
      return;
    }

    // Get existing meals for this date
    const day = Utils.dayKey(this.currentDate);

    grid.innerHTML = userEntries.map(([id, user]) => {
      // Read saved meal count from Firebase for display in spinner
      let savedMealCount = null;
      this.selectedTypes.forEach(type => {
        const typeMeals = this.mealsData[day]?.[type] || {};
        if (typeMeals[id] !== undefined) {
          const val = parseInt(typeMeals[id]);
          if (!isNaN(val)) {
            if (savedMealCount === null || val > savedMealCount) {
              savedMealCount = val;
            }
          }
        }
      });

      // selectedUsers is the ONLY source of truth for visual selection.
      // We never auto-select here — the admin's explicit selection is preserved.
      const selected = this.selectedUsers.has(id);

      // Spinner shows: if user has a saved count in DB (even 0), show it.
      // If user has no saved count in DB yet: show 1 if selected, 0 if not selected.
      const spinnerValue = (savedMealCount !== null)
        ? savedMealCount
        : (selected ? 1 : 0);

      return `
        <div class="meal-user-chip ${selected ? 'selected' : ''}" onclick="Messliner.meals.toggleUser('${id}', this)" data-userid="${id}">
          <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
          <span class="meal-user-chip-name">${user.name}</span>
          <div class="number-spinner" style="margin-left: auto;" onclick="event.stopPropagation()">
            <button type="button" onclick="Messliner.meals.decrementUserCount('${id}')">−</button>
            <input type="number" class="user-meal-count" value="${spinnerValue}" min="0" max="10"
                   oninput="Messliner.meals.handleUserCountInput('${id}', this)" data-user-count="${id}">
            <button type="button" onclick="Messliner.meals.incrementUserCount('${id}')">+</button>
          </div>
        </div>
      `;
    }).join('');

    this._updateSelectedCount();
  },

  /**
   * Toggle user selection
   */
  toggleUser(userId, chipEl) {
    const countInput = chipEl.querySelector(`[data-user-count="${userId}"]`);
    const day = Utils.dayKey(this.currentDate);

    if (this.selectedUsers.has(userId)) {
      this.selectedUsers.delete(userId);
      chipEl.classList.remove('selected');
      // Show saved DB count when deselecting so the admin can see existing data
      if (countInput) {
        let savedCount = 0;
        this.selectedTypes.forEach(type => {
          const val = this.mealsData[day]?.[type]?.[userId];
          if (val !== undefined) {
            const parsed = parseInt(val);
            if (!isNaN(parsed) && parsed > savedCount) savedCount = parsed;
          }
        });
        countInput.value = savedCount;
      }
    } else {
      this.selectedUsers.add(userId);
      chipEl.classList.add('selected');
    }
    this._updateSelectedCount();
  },

  /**
   * Decrement user count spinner
   */
  decrementUserCount(userId) {
    const input = document.querySelector(`[data-user-count="${userId}"]`);
    if (input) {
      let val = parseInt(input.value);
      if (isNaN(val)) val = 0;
      if (val > 0) {
        input.value = val - 1;
        this.handleUserCountInput(userId, input);
      } else {
        input.value = 0;
        this.handleUserCountInput(userId, input);
      }
    }
  },

  /**
   * Increment user count spinner
   */
  incrementUserCount(userId) {
    const input = document.querySelector(`[data-user-count="${userId}"]`);
    if (input) {
      let val = parseInt(input.value);
      if (isNaN(val)) val = 0;
      if (val < 10) {
        input.value = val + 1;
        this.handleUserCountInput(userId, input);
      }
    }
  },

  /**
   * Handle manual input on user count field
   */
  handleUserCountInput(userId, inputEl) {
    let val = parseInt(inputEl.value);
    if (isNaN(val) || val < 0) {
      val = 0;
      inputEl.value = 0;
    }
    const chip = inputEl.closest('.meal-user-chip');

    // Selecting/editing a member's spinner should automatically SELECT the member card
    // so that their chosen meal count (including 0) will be saved to Firebase!
    if (!this.selectedUsers.has(userId)) {
      this.selectedUsers.add(userId);
      if (chip) chip.classList.add('selected');
      this._updateSelectedCount();
    }
  },

  /**
   * Toggle select all
   */
  toggleSelectAll(checked) {
    const users = Messliner.users.users;
    this.selectedUsers.clear();

    if (checked) {
      const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);
      const monthStr = this.currentDate ? this.currentDate.substring(0, 7) : Utils.today().substring(0, 7);
      Object.entries(users).forEach(([id, user]) => {
        if (user.role === 'admin' && !isManagerMealEnabled) {
          return;
        }
        if (!this.isUserActiveForMonth(id, monthStr)) {
          return;
        }
        this.selectedUsers.add(id);
      });
    }

    const day = Utils.dayKey(this.currentDate);
    document.querySelectorAll('.meal-user-chip').forEach(chip => {
      const userId = chip.dataset.userid;
      chip.classList.toggle('selected', checked);
      const input = chip.querySelector('.user-meal-count');
      if (input) {
        if (checked) {
          // If selected, show at least 1 (or saved value)
          if (parseInt(input.value) === 0) {
            // Try to get the saved count from mealsData
            let savedCount = 0;
            this.selectedTypes.forEach(type => {
              const val = this.mealsData[day]?.[type]?.[userId];
              if (val !== undefined && val > savedCount) savedCount = val;
            });
            input.value = savedCount > 0 ? savedCount : 1;
          }
        } else {
          // When deselecting: show saved count from DB (not 0)
          let savedCount = 0;
          this.selectedTypes.forEach(type => {
            const val = this.mealsData[day]?.[type]?.[userId];
            if (val !== undefined && val > savedCount) savedCount = val;
          });
          input.value = savedCount;
        }
      }
    });

    this._updateSelectedCount();
  },


  /**
   * Update selected count badge
   */
  _updateSelectedCount() {
    const badge = document.getElementById('selectedMealCount');
    if (badge) {
      const count = this.selectedUsers.size;
      badge.textContent = `${count} selected`;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  },

  /**
   * Decrement bulk count spinner
   */
  decrementBulkCount() {
    const input = document.getElementById('bulkMealCount');
    if (input) {
      let val = parseInt(input.value) || 0;
      if (val > 0) {
        input.value = val - 1;
      }
    }
  },

  /**
   * Increment bulk count spinner
   */
  incrementBulkCount() {
    const input = document.getElementById('bulkMealCount');
    if (input) {
      let val = parseInt(input.value) || 0;
      if (val < 10) {
        input.value = val + 1;
      }
    }
  },

  /**
   * Save bulk meals to database
   */
  async saveBulkMeals() {
    if (this.selectedTypes.size === 0) {
      Notifications.toast('warning', 'No Meal Type Selected', 'Please select at least one meal type (Breakfast, Lunch, Dinner).');
      return;
    }
    if (this.selectedUsers.size === 0) {
      Notifications.toast('warning', 'No Users Selected', 'Please select at least one member.');
      return;
    }

    const btn = document.getElementById('saveMealsBtn');
    btn.disabled = true;

    try {
      const month = this.currentDate.substring(0, 7);
      const day = Utils.dayKey(this.currentDate);
      const rawBulk = parseInt(document.getElementById('bulkMealCount').value);
      const bulkCount = !isNaN(rawBulk) && rawBulk >= 0 ? rawBulk : 1;
      const isBulkOverride = document.getElementById('overrideWithBulkCount')?.checked;
      const updates = {};
      const users = Messliner.users.users;

      // Unique ID for this save batch — all meal_updated logs in this save share it
      // so the activity feed can group them into a single entry per save operation.
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Get existing meals BEFORE updating the database
      const dayMeals = {};
      this.selectedTypes.forEach(type => {
        dayMeals[type] = { ...(this.mealsData[day]?.[type] || {}) };
      });

      // Build meal updates for all selected meal types
      // Only update users who are explicitly selected — do NOT touch other members' meals
      this.selectedTypes.forEach(mealType => {
        this.selectedUsers.forEach(userId => {
          let count = bulkCount;
          if (!isBulkOverride) {
            const countInput = document.querySelector(`[data-user-count="${userId}"]`);
            if (countInput) {
              const val = parseInt(countInput.value);
              count = !isNaN(val) && val >= 0 ? val : bulkCount;
            }
          }
          updates[`dinings/${this.diningId}/meals/${month}/${day}/${mealType}/${userId}`] = count;
        });
      });

      await db.ref().update(updates);

      // Recalculate totals
      await this._recalculateTotals();

      const typesLabel = Array.from(this.selectedTypes)
        .map(t => t.charAt(0).toUpperCase() + t.slice(1))
        .join(' & ');

      Notifications.toast('success', 'Meals Saved', `${typesLabel} meals updated for ${this.currentDate}.`);

      // Only send notification when BULK meals are added (more than 1 member selected)
      // Single meal update sends NO notification
      const diningId = this.diningId || Messliner.state?.diningId;
      if (this.selectedUsers.size > 1) {
        const d = new Date(this.currentDate + 'T00:00:00');
        const dayNum = !isNaN(d.getTime()) ? d.getDate() : '';
        const monthShort = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short' }) : '';
        const notifTitle = dayNum && monthShort ? `${dayNum}, ${monthShort} Meal Added` : `${this.currentDate} Meal Added`;
        const notifSubtitle = 'You can change the next meal status.';

        await Notifications.create(
          diningId,
          notifTitle,
          notifSubtitle,
          'all',
          'meal'
        );
      }
      await Notifications.log(diningId, 'meals_updated', `${typesLabel} meals updated for ${this.currentDate}`, Messliner.state.userId);

      // Log individual meal updates for selected users — all tagged with the same batchId
      const logPromises = [];
      for (const mealType of this.selectedTypes) {
        for (const userId of this.selectedUsers) {
          const user = users[userId];
          if (!user) continue;

          let newCount = bulkCount;
          if (!isBulkOverride) {
            const countInput = document.querySelector(`[data-user-count="${userId}"]`);
            if (countInput) {
              const val = parseInt(countInput.value);
              newCount = !isNaN(val) && val >= 0 ? val : bulkCount;
            }
          }

          const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
          const detail = `${newCount} ${mealLabel} saved`;
          // Always log this save — whether count changed or not.
          // batchId ensures this entry is grouped with other logs from the same save.
          logPromises.push(
            Notifications.log(
              this.diningId,
              'meal_updated',
              detail,
              Messliner.state.userId,
              userId,
              this.selectedTypes.size === 1,
              batchId
            )
          );
        }
      }

      await Promise.allSettled(logPromises);

      // Do NOT clear selectedUsers — preserve the admin's selection after save
      // so they can continue editing without re-selecting members.
      // renderUserGrid will re-render with updated counts from Firebase.
      this.renderUserGrid();

    } catch (error) {
      console.error('Save meals error:', error);
      Notifications.toast('error', 'Error', 'Failed to save meals.');
    } finally {
      btn.disabled = false;
    }
  },

  /**
   * Recalculate total meals for all users
   */
  async _recalculateTotals() {
    const mealsSnap = await db.ref(`dinings/${this.diningId}/meals`).once('value');
    const allMeals = mealsSnap.val() || {};
    const users = Messliner.users.users;
    const userTotals = {};

    // Initialize totals
    Object.keys(users).forEach(uid => { userTotals[uid] = 0; });

    // Sum all meals across all months/days/types
    let grandTotal = 0;
    Object.values(allMeals).forEach(monthData => {
      Object.values(monthData).forEach(dayData => {
        Object.values(dayData).forEach(typeData => {
          if (typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uid, count]) => {
              const c = parseInt(count) || 0;
              if (userTotals[uid] !== undefined) {
                userTotals[uid] += c;
              }
              grandTotal += c;
            });
          }
        });
      });
    });

    // Update user totals in database
    const updates = {};
    Object.entries(userTotals).forEach(([uid, total]) => {
      updates[`dinings/${this.diningId}/users/${uid}/totalMeals`] = total;
    });

    await db.ref().update(updates);

    // Update state
    Messliner.state.totalMeals = grandTotal;
  },

  renderMealLog() {
    const mainContainer = document.getElementById('mealLogTable');
    const lockedContainer = document.getElementById('lockedMealLogTable');

    if (!mainContainer && !lockedContainer) return;

    const buildLogHtml = (dateStr) => {
      if (!dateStr) return '<div class="empty-state" style="padding:var(--space-6);"><p style="color:var(--text-tertiary);">No date selected.</p></div>';

      const day = Utils.dayKey(dateStr);
      const dayData = this.getDayData(dateStr);
      const users = Messliner.users.users;

      // Get tracked meals from settings (defaults to all true)
      const tracked = this.trackedMeals || Messliner.settings?.getSettings()?.trackedMeals || { breakfast: true, lunch: true, dinner: true };

      // Meal metadata & custom glass icons for table headers
      const mealMeta = [
        {
          key: 'breakfast',
          label: 'Breakfast',
          iconHtml: `<div class="meal-tab-glass-icon glass-breakfast" style="width:22px;height:22px;padding:2px;display:inline-flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4" fill="rgba(245, 158, 11, 0.4)"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          </div>`
        },
        {
          key: 'lunch',
          label: 'Lunch',
          iconHtml: `<div class="meal-tab-glass-icon glass-lunch" style="width:22px;height:22px;padding:2px;display:inline-flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0" fill="rgba(16, 185, 129, 0.3)"/>
            </svg>
          </div>`
        },
        {
          key: 'dinner',
          label: 'Dinner',
          iconHtml: `<div class="meal-tab-glass-icon glass-dinner" style="width:22px;height:22px;padding:2px;display:inline-flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="rgba(124, 58, 237, 0.35)"/>
            </svg>
          </div>`
        }
      ];

      // Active enabled meal types according to settings
      const enabledMeals = mealMeta.filter(m => tracked[m.key] !== false);
      const hasAnyMeal = enabledMeals.some(m => dayData[m.key] && Object.keys(dayData[m.key]).length > 0);

      if (!hasAnyMeal) {
        return `
          <div class="empty-state" style="padding:var(--space-6);">
            <p style="color:var(--text-tertiary);">No meals recorded for ${Utils.formatDate(dateStr)}.</p>
          </div>
        `;
      }

      let headerColsHtml = enabledMeals.map(m => `
        <th style="text-align: center;">
          <div class="flex items-center justify-center gap-1.5 select-none">
            ${m.iconHtml}
            <span>${m.label.toUpperCase()}</span>
          </div>
        </th>
      `).join('');

      let html = `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="text-align: left;">Member</th>
                ${headerColsHtml}
                <th style="text-align: center;">Total</th>
              </tr>
            </thead>
            <tbody>
      `;

      const grandTotals = {};
      enabledMeals.forEach(m => { grandTotals[m.key] = 0; });

      Object.entries(users).forEach(([uid, user]) => {
        const counts = {};
        let total = 0;

        enabledMeals.forEach(m => {
          const val = parseInt(dayData[m.key]?.[uid]) || 0;
          counts[m.key] = val;
          total += val;
        });

        if (total > 0) {
          enabledMeals.forEach(m => {
            grandTotals[m.key] += counts[m.key];
          });

          let rowCellsHtml = enabledMeals.map(m => `
            <td style="text-align: center;">
              ${counts[m.key] > 0 ? `<span class="badge badge-accent">${counts[m.key]}</span>` : '<span style="color:var(--text-tertiary);">—</span>'}
            </td>
          `).join('');

          html += `
            <tr>
              <td style="text-align: left;">
                <div class="flex items-center gap-2">
                  <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
                  ${user.name}
                </div>
              </td>
              ${rowCellsHtml}
              <td style="text-align: center;"><strong>${total}</strong></td>
            </tr>
          `;
        }
      });

      let overallGrandTotal = 0;
      let footerCellsHtml = enabledMeals.map(m => {
        const g = grandTotals[m.key];
        overallGrandTotal += g;
        return `<td style="text-align: center; padding: var(--space-3) var(--space-4);">${g > 0 ? `<span class="badge badge-primary">${g}</span>` : '0'}</td>`;
      }).join('');

      html += `
            </tbody>
            <tfoot>
              <tr style="font-weight:var(--weight-bold); background:var(--gray-50); border-top: 2px solid var(--border-color);">
                <td style="text-align: left; padding: var(--space-3) var(--space-4);">Total Meals</td>
                ${footerCellsHtml}
                <td style="text-align: center; padding: var(--space-3) var(--space-4);"><strong>${overallGrandTotal}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
      return html;
    };

    if (mainContainer) {
      mainContainer.innerHTML = buildLogHtml(this.currentDate);
    }

    if (lockedContainer) {
      const targetDate = this.getTargetDate() || this.currentDate;
      lockedContainer.innerHTML = buildLogHtml(targetDate);
    }
  },
  /**
   * Load meals for current date
   */
  loadMeals() {
    this.selectedUsers.clear();
    this._listenMeals();
    this.updateCompleteMealSelect();
    this.initDownloadSlip();
  },

  /**
   * Update date display text with clean formatting (e.g. Wed, Aug 26, 2026)
   */
  updateDateDisplay() {
    const hiddenInput = document.getElementById('mealDateInput');
    if (hiddenInput) hiddenInput.value = this.currentDate;
    const textEl = document.getElementById('mealDateDisplayText');
    if (textEl && this.currentDate) {
      try {
        const [y, m, d] = this.currentDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        textEl.textContent = dt.toLocaleDateString('en-US', options);
      } catch (err) {
        textEl.textContent = Utils.formatDate(this.currentDate);
      }
    }
  },

  /**
   * Toggle custom calendar popup modal
   */
  toggleCalendarPopup(e) {
    if (e && e.target && e.target.closest('.date-nav-btn, .date-today-chip')) return;
    const popup = document.getElementById('customCalendarPopup');
    if (!popup) return;
    const isOpen = popup.style.display !== 'none';
    if (isOpen) {
      this.closeCalendarPopup();
    } else {
      this.openCalendarPopup();
    }
  },

  /**
   * Open calendar popup
   */
  openCalendarPopup() {
    const popup = document.getElementById('customCalendarPopup');
    if (!popup) return;
    const curDate = this.currentDate || Utils.today();
    const [y, m] = curDate.split('-').map(Number);
    this.calViewYear = y;
    this.calViewMonth = m - 1;
    this.renderCalendarPopup();
    popup.style.display = 'block';
  },

  /**
   * Close calendar popup
   */
  closeCalendarPopup() {
    const popup = document.getElementById('customCalendarPopup');
    if (popup) popup.style.display = 'none';
  },

  /**
   * Navigate month (-1 / +1)
   */
  navCalendarMonth(dir, e) {
    if (e) e.stopPropagation();
    this.calViewMonth += dir;
    if (this.calViewMonth < 0) {
      this.calViewMonth = 11;
      this.calViewYear--;
    } else if (this.calViewMonth > 11) {
      this.calViewMonth = 0;
      this.calViewYear++;
    }
    this.renderCalendarPopup();
  },

  /**
   * Render days grid for custom calendar popup (matches user reference image)
   */
  renderCalendarPopup() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const titleEl = document.getElementById('calMonthYearTitle');
    if (titleEl) {
      titleEl.textContent = `${monthNames[this.calViewMonth]} ${this.calViewYear}`;
    }

    const gridEl = document.getElementById('calDaysGrid');
    if (!gridEl) return;

    const selectedDate = this.currentDate || Utils.today();
    const todayDate = Utils.today();

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
      html += `<div class="cal-day-cell muted" onclick="Messliner.meals.selectCalendarDate('${dateStr}', event)">${dNum}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayDate;
      let classes = 'cal-day-cell';
      if (isSelected) classes += ' selected';
      if (isToday) classes += ' today';
      html += `<div class="${classes}" onclick="Messliner.meals.selectCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    // Next month leading days
    const totalCells = firstDayIndex + daysInMonth;
    const remainingCells = (totalCells > 35 ? 42 : 35) - totalCells;
    for (let d = 1; d <= remainingCells; d++) {
      let nextM = month + 1;
      let nextY = year;
      if (nextM > 11) { nextM = 0; nextY++; }
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.meals.selectCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    gridEl.innerHTML = html;
  },

  /**
   * Select date from custom calendar cell
   */
  selectCalendarDate(dateStr, e) {
    if (e) e.stopPropagation();
    this.currentDate = dateStr;
    this.updateDateDisplay();
    this.closeCalendarPopup();
    this.loadMeals();
  },

  /**
   * Shift date by +/- N days
   */
  changeDateByDays(days, e) {
    if (e) e.stopPropagation();
    const curVal = this.currentDate || Utils.today();
    const [y, m, d] = curVal.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    const newStr = `${ny}-${nm}-${nd}`;
    this.currentDate = newStr;
    this.updateDateDisplay();
    this.loadMeals();
  },

  /**
   * Set date picker straight to today
   */
  setTodayDate(e) {
    if (e) e.stopPropagation();
    const todayStr = Utils.today();
    this.currentDate = todayStr;
    this.updateDateDisplay();
    this.loadMeals();
  },

  /**
   * Refresh meals page.
   * If mealsData is already populated, render immediately.
   * If it's empty (Firebase hasn't responded yet on initial load),
   * call _listenMeals() which will render once data arrives.
   */
  refresh() {
    this.switchAdminMealTab(this.activeAdminTab || 'locked-meals');

    // Sync currentDate from the date input element
    const dateInput = document.getElementById('mealDateInput');
    if (dateInput && dateInput.value) {
      this.currentDate = dateInput.value;
    } else if (dateInput) {
      dateInput.value = this.currentDate;
    }

    // If mealsData has already been populated by the Firebase listener, render now.
    // Otherwise, (re-)attach the listener — it will render once data arrives.
    const hasData = Object.keys(this.mealsData).length > 0;
    if (hasData) {
      this.renderUserGrid();
      this.renderMealLog();
      this.updateCompleteMealSelect();
    } else {
      // Firebase hasn't responded yet — re-attach listener.
      // The on('value') callback will call render once the data arrives.
      this._listenMeals();
    }
  },


  /**
   * Update the Complete Locked Meals select options dynamically
   */
  updateCompleteMealSelect() {
    const container = document.getElementById('lockedMealsOptions');
    if (!container) return;

    const s = Messliner.settings?.getSettings() || {};
    const isToday = true; // Always true for Complete Locked Meals since it is evaluated against actual current day/deadlines, independent of top date picker
    const autoEnabled = !!s.autoMealEnabled;

    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    let meals = [
      {
        key: 'breakfast',
        label: 'Breakfast',
        deadline: s.breakfastDeadline || '04:00',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" fill="rgba(245, 158, 11, 0.35)"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>`
      },
      {
        key: 'lunch',
        label: 'Lunch',
        deadline: s.lunchDeadline || '10:00',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0" fill="rgba(16, 185, 129, 0.25)"/>
        </svg>`
      },
      {
        key: 'dinner',
        label: 'Dinner',
        deadline: s.dinnerDeadline || '16:00',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="rgba(124, 58, 237, 0.3)"/>
        </svg>`
      }
    ].filter(m => trackedMeals[m.key] !== false);

    // Render and sync Quick Lock Override matrix
    this.renderQuickLockOverrideGrid();

    const targetDate = this.getTargetDate();
    const targetDayData = this.getDayData(targetDate);
    const completed = targetDayData.completed || {};
    const users = Messliner.users?.users || {};
    const isManagerMealEnabled = !!s.managerMealEnabled;

    const subtitle = document.getElementById('completeLockedMealsSubtitle');
    if (subtitle) {
      subtitle.innerHTML = `Select multiple locked meals to complete for <strong style="color:var(--text-primary); font-weight:600;">${Utils.formatDate(targetDate)}</strong>`;
    }

    // Filter selectedLockedMeals to only keep valid locked meals
    const validLockedMeals = [];
    meals.forEach(m => {
      const isLocked = isToday && this._isMealLocked(m.key, m.deadline, targetDate);
      const isAlreadyCompleted = !!completed[m.key];
      if (isLocked && !isAlreadyCompleted) {
        validLockedMeals.push(m.key);
      }
    });
    this.selectedLockedMeals = (this.selectedLockedMeals || []).filter(key => validLockedMeals.includes(key));

    // Clear and build the HTML
    container.innerHTML = '';

    meals.forEach(m => {
      const isLocked = isToday && this._isMealLocked(m.key, m.deadline, targetDate);
      const isAlreadyCompleted = !!completed[m.key];

      let statusClass = 'status-open';
      let statusLabel = 'Open';
      let clickAttr = '';
      let isSelected = false;

      if (isAlreadyCompleted) {
        statusClass = 'status-completed';
        statusLabel = 'Completed';
        clickAttr = '';
      } else if (isLocked) {
        statusClass = 'status-locked';
        statusLabel = 'Locked';
        isSelected = this.selectedLockedMeals.includes(m.key);
        if (isSelected) {
          statusClass += ' selected';
        }
        clickAttr = `onclick="Messliner.meals.toggleLockedMealSelection('${m.key}')"`;
      }

      // Calculate meal count for this type
      let mealCount = 0;
      if (isAlreadyCompleted) {
        const mealEntries = targetDayData[m.key] || {};
        Object.values(mealEntries).forEach(val => {
          if (typeof val === 'number') mealCount += val;
          else if (val === true) mealCount += 1;
        });
      } else {
        Object.entries(users).forEach(([userId, user]) => {
          if (user.role === 'admin' && !isManagerMealEnabled) {
            return;
          }
          if (!this.isUserActiveForMonth(userId, targetDate)) {
            return;
          }
          const mealStatus = user.mealStatus || { breakfast: true, lunch: true, dinner: true };
          const statusVal = mealStatus[m.key];
          if (statusVal === true || statusVal === undefined) {
            mealCount += 1;
          } else if (typeof statusVal === 'number' && statusVal > 0) {
            mealCount += statusVal;
          }
        });
      }

      const statusBadgeIcon = isAlreadyCompleted
        ? `<span class="glass-status-badge badge-completed"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Completed</span></span>`
        : (isLocked
          ? `<span class="glass-status-badge badge-locked"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Locked</span><span class="badge-sep">•</span><span>Deadline ${m.deadline}</span></span>`
          : `<span class="glass-status-badge badge-open"><span class="open-dot"></span><span>Open</span><span class="badge-sep">•</span><span>Deadline ${m.deadline}</span></span>`);

      const checkBadgeHtml = isSelected
        ? `<div class="glass-selected-check-badge">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           </div>`
        : '';

      const cardTitle = `${m.label} is currently ${statusLabel}`;

      container.innerHTML += `
        <div class="glass-option-row card-${m.key} ${statusClass}" ${clickAttr} title="${cardTitle}">
          ${checkBadgeHtml}
          <div class="glass-option-left">
            <div class="glass-option-circle circle-${m.key}">
              ${m.icon}
            </div>
            <div class="glass-option-info">
              <span class="glass-option-label">${m.label}</span>
              <div class="glass-option-sub-wrap">
                ${statusBadgeIcon}
              </div>
            </div>
          </div>
          <div class="glass-option-count-box">
            ${mealCount}
          </div>
        </div>
      `;
    });

    const btn = document.getElementById('btnCompleteMeal');
    if (btn) {
      const count = (this.selectedLockedMeals || []).length;
      btn.disabled = count === 0;
      const btnSpan = btn.querySelector('span');
      if (btnSpan) {
        btnSpan.textContent = count > 0 ? `Complete Selected (${count})` : 'Complete Selected';
      }
    }

    const btnZero = document.getElementById('btnCompleteWithoutMeal');
    if (btnZero) {
      const count = (this.selectedLockedMeals || []).length;
      btnZero.disabled = count === 0;
      const btnZeroSpan = btnZero.querySelector('span');
      if (btnZeroSpan) {
        btnZeroSpan.textContent = count > 0 ? `Complete (0 Meals) (${count})` : 'Complete (0 Meals)';
      }
    }

    const completedMeals = meals.filter(m => !!completed[m.key]);
    const btnUndo = document.getElementById('btnUndoMeal');
    if (btnUndo) {
      btnUndo.disabled = completedMeals.length === 0;
      const btnUndoSpan = btnUndo.querySelector('span');
      if (btnUndoSpan) {
        btnUndoSpan.textContent = completedMeals.length > 0
          ? `Undo Meal (${completedMeals.length})`
          : 'Undo Meal';
      }
    }

    const previewBtn = document.getElementById('btnPreviewMeal');
    if (previewBtn) {
      previewBtn.disabled = false;
      const hasLockedMeals = validLockedMeals.length > 0 || (this.selectedLockedMeals || []).length > 0;
      if (hasLockedMeals) {
        previewBtn.classList.remove('state-unlocked');
        previewBtn.classList.add('state-locked');
        previewBtn.title = 'Preview meal slip (Locked)';
      } else {
        previewBtn.classList.remove('state-locked');
        previewBtn.classList.add('state-unlocked');
        previewBtn.title = 'Preview live meal status slip (Unlocked)';
      }
    }
  },

  /**
   * Toggle a locked meal option selection
   */
  toggleLockedMealSelection(mealKey) {
    const index = this.selectedLockedMeals.indexOf(mealKey);
    if (index > -1) {
      this.selectedLockedMeals.splice(index, 1);
    } else {
      this.selectedLockedMeals.push(mealKey);
    }
    this.updateCompleteMealSelect();
  },

  /**
   * Complete all locked meals for the day using members' current mealStatus
   */
  async completeLockedMeal() {
    if (!this.selectedLockedMeals || this.selectedLockedMeals.length === 0) return;

    const btn = document.getElementById('btnCompleteMeal');
    let btnHtmlBackup = '';
    if (btn) {
      btnHtmlBackup = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: var(--space-1);">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" style="opacity: 0.25; fill: none;"></circle>
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style="opacity: 0.75;"></path>
        </svg>
        <span>Completing...</span>
      `;
    }

    try {
      const targetDate = this.getTargetDate();
      const month = targetDate.substring(0, 7);
      const day = Utils.dayKey(targetDate);
      const users = Messliner.users.users;
      const updates = {};
      const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);

      // Build DB updates and collect per-user counts in one pass (used for logging below)
      const logCounts = {}; // { mealType: { userId: count } }

      for (const mealType of this.selectedLockedMeals) {
        logCounts[mealType] = {};

        Object.entries(users).forEach(([userId, user]) => {
          if (user.role === 'admin' && !isManagerMealEnabled) return;
          if (!this.isUserActiveForMonth(userId, targetDate)) return;

          const mealStatus = user.mealStatus || { breakfast: true, lunch: true, dinner: true };
          const statusVal = mealStatus[mealType];

          let count = 0;
          if (statusVal === true || statusVal === undefined) {
            count = 1;
          } else if (typeof statusVal === 'number' && statusVal > 0) {
            count = statusVal;
          }

          if (count > 0) {
            updates[`dinings/${this.diningId}/meals/${month}/${day}/${mealType}/${userId}`] = count;
            logCounts[mealType][userId] = count;
          } else {
            updates[`dinings/${this.diningId}/meals/${month}/${day}/${mealType}/${userId}`] = null;
          }
        });

        updates[`dinings/${this.diningId}/meals/${month}/${day}/completed/${mealType}`] = true;
      }

      await db.ref().update(updates);
      await this._recalculateTotals();

      // Immediately update local in-memory cache for instant real-time UI responsiveness
      const unpaddedDay = String(parseInt(day, 10));
      const updateLocalCacheCompleted = (cache) => {
        if (!cache) return;
        [day, unpaddedDay].forEach(dKey => {
          if (!cache[dKey]) cache[dKey] = {};
          if (!cache[dKey].completed) cache[dKey].completed = {};
          this.selectedLockedMeals.forEach(m => {
            cache[dKey].completed[m] = true;
          });
        });
      };
      updateLocalCacheCompleted(this.mealsData);
      updateLocalCacheCompleted(this.targetMealsData);

      // One batchId for this entire operation so all per-user log entries
      // group into a single "Meals" activity card on each member's dashboard.
      const completeBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const totalMealTypes = this.selectedLockedMeals.length;

      // Toast + global notification for completed locked meals
      const diningId = this.diningId || Messliner.state?.diningId;
      const mealsLabel = this.selectedLockedMeals
        .map(m => m.charAt(0).toUpperCase() + m.slice(1))
        .join(' & ');
      const d = new Date(targetDate + 'T00:00:00');
      const dayNum = !isNaN(d.getTime()) ? d.getDate() : '';
      const monthShort = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short' }) : '';
      const notifTitle = dayNum && monthShort ? `${dayNum}, ${monthShort} Meal Added` : `${targetDate} Meal Added`;
      const notifSubtitle = 'You can change the next meal status.';

      Notifications.toast('success', 'Meal Completed', `${mealsLabel || 'Selected'} meals completed.`);

      // Send the broadcast notification immediately
      await Notifications.create(
        diningId,
        notifTitle,
        notifSubtitle,
        'all',
        'meal'
      );

      const notifPromises = [];
      for (const mealType of this.selectedLockedMeals) {
        const capitalizedMeal = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        notifPromises.push(
          Notifications.log(diningId, 'meal_completed', `Completed ${capitalizedMeal} meals for ${targetDate}`, Messliner.state.userId)
        );
      }

      // Per-user activity log — one entry per user per meal type,
      // all sharing completeBatchId so they appear as one grouped card in the activity feed.
      for (const [mealType, userCounts] of Object.entries(logCounts)) {
        const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        for (const [userId, count] of Object.entries(userCounts)) {
          notifPromises.push(
            Notifications.log(
              this.diningId,
              'meal_updated',
              `${count} ${mealLabel} added`,
              Messliner.state.userId,
              userId,
              totalMealTypes === 1,
              completeBatchId
            )
          );
        }
      }

      await Promise.allSettled(notifPromises);

      // Clear selection
      this.selectedLockedMeals = [];
      this.updateCompleteMealSelect();

    } catch (error) {

      console.error('Error completing meals:', error);
      Notifications.toast('error', 'Error', 'Failed to complete locked meals.');
    } finally {
      if (btn) {
        btn.innerHTML = btnHtmlBackup;
      }
      this.updateCompleteMealSelect();
    }
  },

  /**
   * Show Zero Meal Confirmation Modal for regular locked meals
   */
  showZeroMealConfirmModal() {
    if (!this.selectedLockedMeals || this.selectedLockedMeals.length === 0) {
      Notifications.toast('warning', 'No Meal Selected', 'Please select at least one locked meal to complete.');
      return;
    }

    const modal = document.getElementById('zeroMealConfirmModal');
    if (!modal) {
      this.executeCompleteWithoutMeal();
      return;
    }

    const targetDate = this.getTargetDate();
    const formattedDate = Utils.formatDate ? Utils.formatDate(targetDate) : targetDate;
    const mealNames = this.selectedLockedMeals.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ');

    const users = Messliner.users?.users || {};
    const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);
    const activeMembers = Object.entries(users).filter(([uid, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      return this.isUserActiveForMonth(uid, targetDate);
    });

    const titleEl = document.getElementById('zeroConfirmTitle');
    const subEl = document.getElementById('zeroConfirmSubtitle');
    const warnEl = document.getElementById('zeroConfirmWarningText');
    const dateEl = document.getElementById('zeroConfirmDate');
    const mealsEl = document.getElementById('zeroConfirmMeals');
    const membersEl = document.getElementById('zeroConfirmMembers');
    const confirmBtn = document.getElementById('btnZeroModalConfirmAction');

    if (titleEl) titleEl.textContent = 'Complete 0 Meals?';
    if (subEl) subEl.textContent = 'Please confirm this off-day / zero meal completion';
    if (warnEl) warnEl.textContent = 'No meals will be counted or charged for this date. Auto meal will not re-add meals automatically.';
    if (dateEl) dateEl.textContent = formattedDate;
    if (mealsEl) mealsEl.textContent = mealNames;
    if (membersEl) membersEl.textContent = `${activeMembers.length} Members`;

    if (confirmBtn) {
      confirmBtn.onclick = () => Messliner.meals.executeCompleteWithoutMeal();
      const confirmBtnText = document.getElementById('btnZeroModalConfirmActionText');
      if (confirmBtnText) confirmBtnText.textContent = 'Complete 0 Meals';
    }

    if (typeof openModal === 'function') {
      openModal('zeroMealConfirmModal');
    } else {
      modal.classList.add('active');
    }
  },

  /**
   * Close Zero Meal Confirmation Modal
   */
  closeZeroMealModal(event) {
    if (event && event.target !== event.currentTarget) return;
    if (typeof closeModal === 'function') {
      closeModal('zeroMealConfirmModal');
    } else {
      const modal = document.getElementById('zeroMealConfirmModal');
      if (modal) modal.classList.remove('active');
    }
  },

  /**
   * Trigger modal from button
   */
  completeWithoutMeal() {
    this.showZeroMealConfirmModal();
  },

  /**
   * Complete selected locked meals WITHOUT adding any meal counts (0 meals / off-day).
   * Marks completed[mealType] = true in Firebase so user dashboard unlocks for next date
   * and admin panel advances to next day, without charging or logging positive meals.
   */
  async executeCompleteWithoutMeal() {
    if (!this.selectedLockedMeals || this.selectedLockedMeals.length === 0) return;

    const modalBtn = document.getElementById('btnZeroModalConfirmAction');
    const mainBtn = document.getElementById('btnCompleteWithoutMeal');
    let modalBtnBackup = '';
    let mainBtnBackup = '';

    if (modalBtn) {
      modalBtnBackup = modalBtn.innerHTML;
      modalBtn.disabled = true;
      modalBtn.innerHTML = `<span>Completing 0...</span>`;
    }
    if (mainBtn) {
      mainBtnBackup = mainBtn.innerHTML;
      mainBtn.disabled = true;
      mainBtn.innerHTML = `<span>Completing...</span>`;
    }

    try {
      const targetDate = this.getTargetDate();
      const month = targetDate.substring(0, 7);
      const day = Utils.dayKey(targetDate);
      const users = Messliner.users.users;
      const updates = {};
      const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);

      for (const mealType of this.selectedLockedMeals) {
        // Clear per-user meal entries for this meal type (0 count)
        Object.entries(users).forEach(([userId, user]) => {
          if (user.role === 'admin' && !isManagerMealEnabled) return;
          if (!this.isUserActiveForMonth(userId, targetDate)) return;
          updates[`dinings/${this.diningId}/meals/${month}/${day}/${mealType}/${userId}`] = null;
        });

        // Mark completed = true so targetDate advances and user controls unlock
        updates[`dinings/${this.diningId}/meals/${month}/${day}/completed/${mealType}`] = true;
      }

      await db.ref().update(updates);
      await this._recalculateTotals();

      // Immediately update local in-memory cache for instant real-time UI responsiveness
      const unpaddedDayZero = String(parseInt(day, 10));
      const updateLocalZeroCompleted = (cache) => {
        if (!cache) return;
        [day, unpaddedDayZero].forEach(dKey => {
          if (!cache[dKey]) cache[dKey] = {};
          if (!cache[dKey].completed) cache[dKey].completed = {};
          this.selectedLockedMeals.forEach(m => {
            cache[dKey].completed[m] = true;
          });
        });
      };
      updateLocalZeroCompleted(this.mealsData);
      updateLocalZeroCompleted(this.targetMealsData);

      const diningId = this.diningId || Messliner.state?.diningId;
      const mealsLabel = this.selectedLockedMeals
        .map(m => m.charAt(0).toUpperCase() + m.slice(1))
        .join(' & ');
      const d = new Date(targetDate + 'T00:00:00');
      const dayNum = !isNaN(d.getTime()) ? d.getDate() : '';
      const monthShort = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short' }) : '';
      const notifTitle = dayNum && monthShort ? `${dayNum}, ${monthShort} Meal Off (Off-day)` : `${targetDate} Meal Off (Off-day)`;
      const notifSubtitle = 'You can change the next meal status.';

      // Close modal immediately
      this.closeZeroMealModal();

      // Clear selection & refresh UI immediately
      this.selectedLockedMeals = [];
      this.updateCompleteMealSelect();
      this.renderUserGrid();
      this.renderMealLog();

      Notifications.toast('success', 'Completed (0 Meals)', `${mealsLabel || 'Selected'} completed with 0 meals.`);

      await Notifications.create(
        diningId,
        notifTitle,
        notifSubtitle,
        'all',
        'meal'
      );

      const notifPromises = [];
      for (const mealType of this.selectedLockedMeals) {
        const capitalizedMeal = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        notifPromises.push(
          Notifications.log(diningId, 'meal_completed', `Completed ${capitalizedMeal} with 0 meals for ${targetDate}`, Messliner.state.userId)
        );
      }
      await Promise.allSettled(notifPromises);

    } catch (error) {
      console.error('Error completing without meal:', error);
      Notifications.toast('error', 'Error', 'Failed to mark meal as completed.');
    } finally {
      if (modalBtn) {
        modalBtn.disabled = false;
        modalBtn.innerHTML = modalBtnBackup;
      }
      if (mainBtn) {
        mainBtn.innerHTML = mainBtnBackup;
      }
      this.updateCompleteMealSelect();
    }
  },

  /**
   * Show Undo Meal Confirmation Modal for completed meals of targetDate
   */
  showUndoMealConfirmModal() {
    const targetDate = this.getTargetDate();
    const targetDayData = this.getDayData(targetDate);
    const completed = targetDayData.completed || {};

    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const allMealTypes = [
      { key: 'breakfast', label: 'Breakfast', icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>` },
      { key: 'lunch', label: 'Lunch', icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>` },
      { key: 'dinner', label: 'Dinner', icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>` }
    ].filter(m => trackedMeals[m.key] !== false);

    const completedMeals = allMealTypes.filter(m => !!completed[m.key]);

    if (completedMeals.length === 0) {
      Notifications.toast('info', 'No Completed Meals', 'There are no completed meals to undo for this date.');
      return;
    }

    // Default select all completed meals so user can deselect or adjust
    this._selectedUndoMeals = completedMeals.map(m => m.key);
    this._availableUndoMeals = completedMeals;
    this._undoTargetDate = targetDate;

    const modal = document.getElementById('undoMealConfirmModal');
    if (!modal) {
      this.executeUndoMeal();
      return;
    }

    const formattedDate = Utils.formatDate ? Utils.formatDate(targetDate) : targetDate;
    const dateEl = document.getElementById('undoConfirmDate');
    if (dateEl) dateEl.textContent = formattedDate;

    this.renderUndoModalMealList();

    const confirmBtn = document.getElementById('btnUndoModalConfirmAction');
    if (confirmBtn) {
      confirmBtn.onclick = () => this.executeUndoMeal();
    }

    if (typeof openModal === 'function') {
      openModal('undoMealConfirmModal');
    } else {
      modal.classList.add('active');
    }
  },

  /**
   * Render dynamic checklist of completed meals inside the undo popup
   */
  renderUndoModalMealList() {
    const container = document.getElementById('undoModalMealList');
    if (!container) return;

    const targetDate = this.getTargetDate();
    const targetDayData = this.getDayData(targetDate);
    const available = this._availableUndoMeals || [];
    const selected = this._selectedUndoMeals || [];

    container.innerHTML = available.map(m => {
      const isSelected = selected.includes(m.key);
      const mealEntries = targetDayData[m.key] || {};
      let mealCount = 0;
      Object.values(mealEntries).forEach(val => {
        if (typeof val === 'number') mealCount += val;
        else if (val === true) mealCount += 1;
      });

      return `
        <div class="undo-meal-select-row ${isSelected ? 'selected' : ''}" 
             onclick="Messliner.meals.toggleUndoMealSelection('${m.key}')">
          <div class="undo-meal-row-left">
            <div class="undo-checkbox">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="undo-meal-icon-circle">
              ${m.icon}
            </div>
            <div class="undo-meal-label-wrap">
              <span class="undo-meal-row-name">${m.label}</span>
              <span class="undo-meal-row-count">${mealCount > 0 ? `${mealCount} meals recorded` : '0 meals (off-day)'}</span>
            </div>
          </div>
          <span class="undo-meal-row-badge">${isSelected ? 'Will Revert' : 'Keep'}</span>
        </div>
      `;
    }).join('');

    this._updateUndoModalConfirmBtn();
  },

  /**
   * Toggle a meal selection inside the undo popup
   */
  toggleUndoMealSelection(mealKey) {
    if (!this._selectedUndoMeals) this._selectedUndoMeals = [];
    const idx = this._selectedUndoMeals.indexOf(mealKey);
    if (idx > -1) {
      this._selectedUndoMeals.splice(idx, 1);
    } else {
      this._selectedUndoMeals.push(mealKey);
    }
    this.renderUndoModalMealList();
  },

  /**
   * Update action button inside undo popup based on selection count
   */
  _updateUndoModalConfirmBtn() {
    const confirmBtn = document.getElementById('btnUndoModalConfirmAction');
    const confirmBtnText = document.getElementById('btnUndoModalConfirmActionText');
    const count = (this._selectedUndoMeals || []).length;

    if (confirmBtn) {
      confirmBtn.disabled = count === 0;
      confirmBtn.onclick = () => this.executeUndoMeal();
    }
    if (confirmBtnText) {
      confirmBtnText.textContent = count > 0 
        ? `Revert & Undo (${count} Meal${count > 1 ? 's' : ''})` 
        : 'Select Meal to Undo';
    }
  },

  /**
   * Close Undo Meal Confirmation Modal
   */
  closeUndoMealModal(event) {
    if (event && event.target !== event.currentTarget) return;
    if (typeof closeModal === 'function') {
      closeModal('undoMealConfirmModal');
    } else {
      const modal = document.getElementById('undoMealConfirmModal');
      if (modal) modal.classList.remove('active');
    }
    this._selectedUndoMeals = [];
    this._availableUndoMeals = [];
  },

  /**
   * Execute Undo: remove completed flag and member meal counts for target meals
   */
  async executeUndoMeal() {
    const mealsToUndo = this._selectedUndoMeals || [];
    if (!mealsToUndo || mealsToUndo.length === 0) {
      Notifications.toast('warning', 'No Meal Selected', 'Please select at least one meal to undo.');
      return;
    }

    const modalBtn = document.getElementById('btnUndoModalConfirmAction');
    const mainBtn = document.getElementById('btnUndoMeal');
    let modalBtnBackup = '';
    let mainBtnBackup = '';

    if (modalBtn) {
      modalBtnBackup = modalBtn.innerHTML;
      modalBtn.disabled = true;
      modalBtn.innerHTML = `<span>Undoing...</span>`;
    }
    if (mainBtn) {
      mainBtnBackup = mainBtn.innerHTML;
      mainBtn.disabled = true;
      mainBtn.innerHTML = `<span>Undoing...</span>`;
    }

    try {
      const diningId = this.diningId || Messliner.state?.diningId;
      const targetDate = this._undoTargetDate || this.getTargetDate();
      const month = targetDate.substring(0, 7);
      const day = Utils.dayKey(targetDate);
      const unpaddedDay = String(parseInt(day, 10));
      const updates = {};

      mealsToUndo.forEach(mealType => {
        // 1. Remove completed flag (both padded and unpadded day)
        updates[`dinings/${diningId}/meals/${month}/${day}/completed/${mealType}`] = null;
        updates[`dinings/${diningId}/meals/${month}/${unpaddedDay}/completed/${mealType}`] = null;
        // 2. Clear all member meal counts for this meal type on this date
        updates[`dinings/${diningId}/meals/${month}/${day}/${mealType}`] = null;
        updates[`dinings/${diningId}/meals/${month}/${unpaddedDay}/${mealType}`] = null;
      });

      await db.ref().update(updates);
      await this._recalculateTotals();

      // Immediately clean local in-memory cache so UI updates synchronously in real time
      const cleanupLocal = (cache) => {
        if (!cache) return;
        [day, unpaddedDay].forEach(dKey => {
          if (cache[dKey]) {
            if (cache[dKey].completed) {
              mealsToUndo.forEach(m => {
                delete cache[dKey].completed[m];
              });
            }
            mealsToUndo.forEach(m => {
              delete cache[dKey][m];
            });
          }
        });
      };
      cleanupLocal(this.mealsData);
      cleanupLocal(this.targetMealsData);

      const mealsLabel = mealsToUndo.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' & ');
      Notifications.toast('info', 'Meal Undone', `${mealsLabel} meal for ${Utils.formatDate(targetDate)} has been reverted.`);

      await Notifications.log(
        diningId,
        'meal_undone',
        `Reverted ${mealsLabel} meal for ${targetDate}`,
        Messliner.state.userId
      );

      // Close modal
      this.closeUndoMealModal();

      // Refresh UI immediately
      this.selectedLockedMeals = [];
      this.updateCompleteMealSelect();
      this.renderUserGrid();
      this.renderMealLog();

      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

      if (typeof Notifications !== 'undefined' && Notifications.fetchAndRender) {
        Notifications.fetchAndRender();
      }

    } catch (error) {
      console.error('[MealsModule] Undo meal error:', error);
      Notifications.toast('error', 'Error', 'Failed to undo completed meal.');
    } finally {
      if (modalBtn) {
        modalBtn.disabled = false;
        modalBtn.innerHTML = modalBtnBackup;
      }
      if (mainBtn) {
        mainBtn.innerHTML = mainBtnBackup;
      }
      this.updateCompleteMealSelect();
    }
  },

  /**
   * Helper to format and render slip table headers, user rows, and totals
   * according to trackedMeals settings (hiding untracked/disabled meals)
   */
  _renderSlipModalContent({ targetDate, selectedMeals, listData, grandTotal, totalBreakfast, totalLunch, totalDinner, emptyMessage, isSpecialMeal }) {
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    const slipDiningName = document.getElementById('slipDiningName');
    if (slipDiningName) {
      slipDiningName.textContent = document.getElementById('sidebarDiningName')?.textContent || 'Messliner';
    }

    const slipDate = document.getElementById('slipDate');
    if (slipDate) {
      slipDate.textContent = Utils.formatDate(targetDate);
    }

    const year = parseInt(targetDate.substring(0, 4), 10);
    const month = parseInt(targetDate.substring(5, 7), 10);
    const getFridayDates = (y, m) => {
      const dates = [];
      const d = new Date(y, m - 1, 1);
      while (d.getDay() !== 5) { d.setDate(d.getDate() + 1); }
      while (d.getMonth() === m - 1 && dates.length < 4) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        dates.push(`${y}-${mm}-${dd}`);
        d.setDate(d.getDate() + 7);
      }
      return dates;
    };
    const fridayDates = getFridayDates(year, month);
    const fridayIndex = fridayDates.indexOf(targetDate);
    const isFriday = fridayIndex !== -1;

    let isFridaySpecial = false;
    if (typeof isSpecialMeal === 'boolean') {
      isFridaySpecial = isSpecialMeal;
    } else if (isFriday) {
      const wk = `w${fridayIndex + 1}`;
      const fMeals = Messliner.fridayMeals?.fridayMealsData?.[wk] || (typeof FridayMealsModule !== 'undefined' ? FridayMealsModule.fridayMealsData?.[wk] : null) || {};
      const fBazar = Messliner.fridayMeals?.fridayBazarData?.[wk] || (typeof FridayMealsModule !== 'undefined' ? FridayMealsModule.fridayBazarData?.[wk] : null) || {};

      const hasSpecialMeals = Object.values(fMeals).some(v => parseInt(v, 10) > 0);
      const hasSpecialBazar = (parseFloat(fBazar.amount) > 0) || (!!fBazar.date && fBazar.date === targetDate);

      isFridaySpecial = hasSpecialMeals || hasSpecialBazar;
    }

    const activeSelectedMeals = (selectedMeals || []).filter(m => trackedMeals[m] !== false);
    const slipMealTypes = document.getElementById('slipMealTypes');
    if (slipMealTypes) {
      slipMealTypes.textContent = activeSelectedMeals.map(m => {
        if (isFridaySpecial && m === 'lunch') return 'Lunch (Friday Special)';
        return m.charAt(0).toUpperCase() + m.slice(1);
      }).join(', ');
    }

    // Populate total counts
    const slipTotalBreakfast = document.getElementById('slipTotalBreakfast');
    if (slipTotalBreakfast) slipTotalBreakfast.textContent = totalBreakfast;

    const slipTotalLunch = document.getElementById('slipTotalLunch');
    if (slipTotalLunch) {
      slipTotalLunch.textContent = totalLunch;
      const labelEl = slipTotalLunch.previousElementSibling;
      if (labelEl) {
        labelEl.textContent = isFridaySpecial ? 'Total Lunch (Friday Special):' : 'Total Lunch (L):';
      }
    }

    const slipTotalDinner = document.getElementById('slipTotalDinner');
    if (slipTotalDinner) slipTotalDinner.textContent = totalDinner;

    const slipTotalCount = document.getElementById('slipTotalCount');
    if (slipTotalCount) slipTotalCount.textContent = grandTotal;

    // Toggle total summary rows based on trackedMeals
    const rowB = slipTotalBreakfast?.closest('.slip-total-row');
    if (rowB) rowB.style.display = trackedMeals.breakfast !== false ? 'flex' : 'none';

    const rowL = slipTotalLunch?.closest('.slip-total-row');
    if (rowL) rowL.style.display = trackedMeals.lunch !== false ? 'flex' : 'none';

    const rowD = slipTotalDinner?.closest('.slip-total-row');
    if (rowD) rowD.style.display = trackedMeals.dinner !== false ? 'flex' : 'none';

    const slipGeneratedAt = document.getElementById('slipGeneratedAt');
    if (slipGeneratedAt) {
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      slipGeneratedAt.textContent = `Print at ${timeStr}`;
    }

    // Render Table Header dynamically (hiding disabled meal columns)
    const tableEl = document.querySelector('.slip-table-element');
    if (tableEl) {
      const thead = tableEl.querySelector('thead');
      if (thead) {
        let thHtml = '<tr class="slip-table-header-row"><th class="col-name">Name</th>';
        if (trackedMeals.breakfast !== false) thHtml += '<th class="col-qty">B</th>';
        if (trackedMeals.lunch !== false) thHtml += '<th class="col-qty">L</th>';
        if (trackedMeals.dinner !== false) thHtml += '<th class="col-qty">D</th>';
        thHtml += '<th class="col-qty">T</th></tr>';
        thead.innerHTML = thHtml;
      }
    }

    // Render Table Body
    const memberListEl = document.getElementById('slipMemberList');
    if (memberListEl) {
      if (listData.length === 0) {
        let colSpan = 2; // Name + T
        if (trackedMeals.breakfast !== false) colSpan++;
        if (trackedMeals.lunch !== false) colSpan++;
        if (trackedMeals.dinner !== false) colSpan++;

        memberListEl.innerHTML = `
          <tr>
            <td colspan="${colSpan}" style="padding: var(--space-4); text-align: center; color: var(--text-tertiary);">
              ${emptyMessage || 'No saved meals found for this selection.'}
            </td>
          </tr>
        `;
      } else {
        memberListEl.innerHTML = listData.map((item, idx) => {
          const isManager = item.role === 'admin';
          const isExtra = item.isExtra;
          const rowClass = isExtra ? 'slip-extra' : (isManager ? 'slip-manager' : '');

          const bTd = trackedMeals.breakfast !== false ? `<td class="col-qty">${item.breakfast > 0 ? item.breakfast : '—'}</td>` : '';
          const lTd = trackedMeals.lunch !== false ? `<td class="col-qty">${item.lunch > 0 ? item.lunch : '—'}</td>` : '';
          const dTd = trackedMeals.dinner !== false ? `<td class="col-qty">${item.dinner > 0 ? item.dinner : '—'}</td>` : '';

          const badge = isExtra ? '<span class="slip-manager-badge" style="background:#ECFDF5; color:#059669; border-color:#A7F3D0;">*EXTRA</span>' : (isManager ? '<span class="slip-manager-badge">*MGR</span>' : '');

          return `
            <tr class="slip-table-row-tr ${rowClass}">
              <td class="col-name">
                <span class="slip-row-index">${idx + 1}.</span>
                <span class="slip-row-name">${item.name}</span>
                ${badge}
              </td>
              ${bTd}
              ${lTd}
              ${dTd}
              <td class="col-qty col-total">${item.total}</td>
            </tr>
          `;
        }).join('');
      }
    }

    const modal = document.getElementById('mealSlipModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  /**
   * Open the professional meal slip preview modal
   */
  previewLockedMeal() {
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const activeTrackedKeys = ['breakfast', 'lunch', 'dinner'].filter(k => trackedMeals[k] !== false);

    let selectedMeals = (this.selectedLockedMeals || []).filter(k => trackedMeals[k] !== false);
    if (selectedMeals.length === 0) {
      selectedMeals = activeTrackedKeys;
    }
    if (selectedMeals.length === 0) {
      Notifications.toast('warning', 'No Meal Configured', 'No active tracked meals found in settings.');
      return;
    }

    const targetDate = this.getTargetDate();
    const isManagerMealEnabled = !!s.managerMealEnabled;
    const users = Messliner.users?.users || {};

    const listData = [];
    Object.entries(users).forEach(([userId, user], index) => {
      if (user.role === 'admin' && !isManagerMealEnabled) return;
      if (!this.isUserActiveForMonth(userId, targetDate)) return;

      const mealStatus = user.mealStatus || { breakfast: true, lunch: true, dinner: true };

      let breakfastCount = 0;
      let lunchCount = 0;
      let dinnerCount = 0;

      if (selectedMeals.includes('breakfast') && trackedMeals.breakfast !== false) {
        const statusVal = mealStatus.breakfast;
        breakfastCount = (statusVal === true || statusVal === undefined) ? 1 : (typeof statusVal === 'number' && statusVal > 0 ? statusVal : 0);
      }
      if (selectedMeals.includes('lunch') && trackedMeals.lunch !== false) {
        const statusVal = mealStatus.lunch;
        lunchCount = (statusVal === true || statusVal === undefined) ? 1 : (typeof statusVal === 'number' && statusVal > 0 ? statusVal : 0);
      }
      if (selectedMeals.includes('dinner') && trackedMeals.dinner !== false) {
        const statusVal = mealStatus.dinner;
        dinnerCount = (statusVal === true || statusVal === undefined) ? 1 : (typeof statusVal === 'number' && statusVal > 0 ? statusVal : 0);
      }

      const total = breakfastCount + lunchCount + dinnerCount;
      if (total > 0) {
        listData.push({
          id: userId,
          name: user.name || 'Unknown Member',
          role: user.role || 'member',
          avatarColor: Messliner.users?._avatarColor(user.name) || '#ccc',
          initials: Utils.initials(user.name),
          breakfast: breakfastCount,
          lunch: lunchCount,
          dinner: dinnerCount,
          total: total,
          createdAt: user.createdAt || user.timestamp || user.joinedAt || 0,
          joinOrder: index
        });
      }
    });

    // Append extra slip entries (e.g. Mess Khala / Staff / Guests)
    const extraEntries = Object.entries(this.extraSlipEntries || {});
    extraEntries.forEach(([entryId, entry]) => {
      let breakfastCount = 0;
      let lunchCount = 0;
      let dinnerCount = 0;

      if (selectedMeals.includes('breakfast') && trackedMeals.breakfast !== false) {
        breakfastCount = parseInt(entry.breakfast, 10) || 0;
      }
      if (selectedMeals.includes('lunch') && trackedMeals.lunch !== false) {
        lunchCount = parseInt(entry.lunch, 10) || 0;
      }
      if (selectedMeals.includes('dinner') && trackedMeals.dinner !== false) {
        dinnerCount = parseInt(entry.dinner, 10) || 0;
      }

      const total = breakfastCount + lunchCount + dinnerCount;
      if (total > 0) {
        listData.push({
          id: entryId,
          name: entry.name || 'Extra Entry',
          role: 'extra',
          avatarColor: '#10B981',
          initials: 'EX',
          breakfast: breakfastCount,
          lunch: lunchCount,
          dinner: dinnerCount,
          total: total,
          createdAt: 9999999999999,
          joinOrder: 99999,
          isExtra: true
        });
      }
    });

    // Sort: members first (manager first), extra entries at the very end
    listData.sort((a, b) => {
      if (a.isExtra !== b.isExtra) {
        return a.isExtra ? 1 : -1;
      }
      const roleA = a.role === 'admin' ? 0 : 1;
      const roleB = b.role === 'admin' ? 0 : 1;
      if (roleA !== roleB) return roleA - roleB;

      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeA - timeB;
      }
      return a.joinOrder - b.joinOrder;
    });

    const grandTotal = listData.reduce((sum, item) => sum + item.total, 0);
    const totalBreakfast = listData.reduce((sum, item) => sum + item.breakfast, 0);
    const totalLunch = listData.reduce((sum, item) => sum + item.lunch, 0);
    const totalDinner = listData.reduce((sum, item) => sum + item.dinner, 0);

    this._renderSlipModalContent({
      targetDate,
      selectedMeals,
      listData,
      grandTotal,
      totalBreakfast,
      totalLunch,
      totalDinner,
      emptyMessage: 'No meals to complete for this selection.'
    });
  },

  /**
   * Close the meal slip preview modal
   */
  closeMealSlipModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('mealSlipModal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  /**
   * Download slip as JPG
   */
  async downloadMealSlip(triggerBtn) {
    const element = document.getElementById('mealSlipContent');
    if (!element) return;

    const btn = triggerBtn || document.getElementById('btnMealSlipDownload') || document.querySelector('#mealSlipModal .btn-slip-download');
    const originalBtnHtml = btn ? btn.innerHTML : '';

    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.85';
      btn.style.pointerEvents = 'none';
      btn.innerHTML = `
        <svg class="slip-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        <span>Downloading...</span>
      `;
    }

    Notifications.toast('info', 'Rendering Slip', 'Generating JPG download, please wait...');

    // Clone element to an off-screen container so the on-screen modal does NOT resize, expand or flicker
    const width = element.offsetWidth || 360;
    const clone = element.cloneNode(true);
    clone.id = 'mealSlipClone';
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${width}px`;
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.zIndex = '-9999';
    clone.style.boxShadow = 'none';
    clone.style.transform = 'none';
    clone.style.margin = '0';
    clone.style.background = '#ffffff';

    document.body.appendChild(clone);

    try {
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        allowTaint: true,
        width: clone.offsetWidth,
        height: clone.scrollHeight,
        scrollX: 0,
        scrollY: 0
      });

      if (clone.parentNode) {
        document.body.removeChild(clone);
      }

      canvas.toBlob(blob => {
        if (!blob) {
          Notifications.toast('error', 'Error', 'Failed to generate JPG image.');
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.innerHTML = originalBtnHtml;
          }
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStr = this.getTargetDate();
        const diningName = (document.getElementById('sidebarDiningName')?.textContent || 'Messliner').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `${diningName}_meal_slip_${dateStr}.jpg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        Notifications.toast('success', 'Download Complete', 'Meal slip downloaded successfully.');

        if (btn) {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Downloaded!</span>
          `;
          setTimeout(() => {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.innerHTML = originalBtnHtml;
          }, 1500);
        }
      }, 'image/jpeg', 0.95);
    } catch (err) {
      if (clone.parentNode) {
        document.body.removeChild(clone);
      }
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        btn.innerHTML = originalBtnHtml;
      }
      console.error('Error generating slip:', err);
      Notifications.toast('error', 'Error', 'Failed to generate JPG download.');
    }
  },

  /**
 * Render or update Quick Lock Override interactive matrix
 */
  renderQuickLockOverrideGrid() {
    const grid = document.getElementById('quickLockOverrideGrid');
    if (!grid) return;

    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const locks = s.locks || {};

    const mealDefs = [
      {
        key: 'breakfast',
        label: 'Breakfast',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
        colorClass: 'meal-breakfast'
      },
      {
        key: 'lunch',
        label: 'Lunch',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
        colorClass: 'meal-lunch'
      },
      {
        key: 'dinner',
        label: 'Dinner',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
        colorClass: 'meal-dinner'
      }
    ];

    const activeDefs = mealDefs.filter(m => trackedMeals[m.key] !== false);

    const svgIcons = {
      auto: `<svg class="custom-lock-svg icon-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      locked: `<svg class="custom-lock-svg icon-locked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="3" ry="3"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>`,
      unlocked: `<svg class="custom-lock-svg icon-unlocked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="3" ry="3"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>`
    };

    grid.innerHTML = activeDefs.map(m => {
      const currentState = locks[m.key] || 'auto';

      let stateBadge = '';
      if (currentState === 'locked') {
        stateBadge = `<span class="quick-lock-status-badge badge-locked">${svgIcons.locked}<span>Locked</span></span>`;
      } else if (currentState === 'unlocked') {
        stateBadge = `<span class="quick-lock-status-badge badge-unlocked">${svgIcons.unlocked}<span>Unlocked</span></span>`;
      } else {
        stateBadge = `<span class="quick-lock-status-badge badge-auto">${svgIcons.auto}<span>Auto (Deadline)</span></span>`;
      }

      return `
        <div class="quick-lock-card ${m.colorClass} state-${currentState}">
          <div class="quick-lock-card-left">
            <div class="quick-lock-meal-icon">
              ${m.icon}
            </div>
            <div class="quick-lock-meal-info">
              <span class="quick-lock-meal-name">${m.label}</span>
              ${stateBadge}
            </div>
          </div>
          
          <div class="quick-lock-segmented-pill">
            <button type="button" class="lock-seg-btn seg-auto ${currentState === 'auto' ? 'active' : ''}"
              onclick="Messliner.meals.setMealLock('${m.key}', 'auto')" title="Set ${m.label} to Auto (Deadline)">
              ${svgIcons.auto}
              <span>Auto</span>
            </button>
            <button type="button" class="lock-seg-btn seg-locked ${currentState === 'locked' ? 'active' : ''}"
              onclick="Messliner.meals.setMealLock('${m.key}', 'locked')" title="Force Lock ${m.label} now">
              ${svgIcons.locked}
              <span>Locked</span>
            </button>
            <button type="button" class="lock-seg-btn seg-unlocked ${currentState === 'unlocked' ? 'active' : ''}"
              onclick="Messliner.meals.setMealLock('${m.key}', 'unlocked')" title="Force Open / Unlock ${m.label}">
              ${svgIcons.unlocked}
              <span>Unlocked</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Set single meal lock override instantly
   */
  async setMealLock(mealType, state) {
    try {
      await db.ref(`dinings/${this.diningId}/settings/locks/${mealType}`).set(state);

      if (Messliner.settings) {
        const s = Messliner.settings.getSettings() || {};
        if (!s.locks) s.locks = {};
        s.locks[mealType] = state;
      }

      this.updateCompleteMealSelect();

      const cap = mealType.charAt(0).toUpperCase() + mealType.slice(1);
      const stateLabel = state === 'auto' ? 'Auto (Deadline)' : state.toUpperCase();
      Notifications.toast('success', `${cap} Lock Updated`, `${cap} lock state set to ${stateLabel}.`);
    } catch (err) {
      console.error('Error updating meal lock:', err);
      Notifications.toast('error', 'Error', 'Failed to update lock state.');
    }
  },

  /**
   * Batch set all active meals lock override in 1-click
   */
  async setAllLocks(state) {
    try {
      const s = Messliner.settings?.getSettings() || {};
      const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      const activeKeys = ['breakfast', 'lunch', 'dinner'].filter(k => trackedMeals[k] !== false);

      const updates = {};
      if (!s.locks) s.locks = {};

      activeKeys.forEach(k => {
        updates[`dinings/${this.diningId}/settings/locks/${k}`] = state;
        s.locks[k] = state;
      });

      await db.ref().update(updates);
      this.updateCompleteMealSelect();

      const stateLabel = state === 'auto' ? 'Auto (Deadline)' : state.toUpperCase();
      Notifications.toast('success', 'All Locks Updated', `All meals lock override set to ${stateLabel}.`);
    } catch (err) {
      console.error('Error setting all locks:', err);
      Notifications.toast('error', 'Error', 'Failed to update all lock states.');
    }
  },

  /**
   * Initialize saved meal slip downloader inputs
   */
  initDownloadSlip() {
    if (!this.slipDate) {
      this.slipDate = Utils.today();
    }
    this.updateSlipDateDisplay();
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const activeTrackedKeys = ['breakfast', 'lunch', 'dinner'].filter(k => trackedMeals[k] !== false);
    this.selectedDownloadSlipMeals = [...activeTrackedKeys];
    this.loadDownloadSlipOptions();
  },

  updateSlipDateDisplay() {
    if (!this.slipDate) this.slipDate = Utils.today();
    const hiddenInput = document.getElementById('downloadSlipDateInput');
    if (hiddenInput) hiddenInput.value = this.slipDate;

    const textEl = document.getElementById('slipDateDisplayText');
    if (textEl && this.slipDate) {
      try {
        const [y, m, d] = this.slipDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        textEl.textContent = dt.toLocaleDateString('en-US', options);
      } catch (err) {
        textEl.textContent = Utils.formatDate(this.slipDate);
      }
    }
  },

  toggleSlipCalendarPopup(e) {
    if (e && e.target && e.target.closest('.date-nav-btn, .date-today-pill')) return;
    const popup = document.getElementById('slipCustomCalendarPopup');
    if (!popup) return;
    const isOpen = popup.style.display !== 'none';
    if (isOpen) {
      this.closeSlipCalendarPopup();
    } else {
      this.openSlipCalendarPopup();
    }
  },

  openSlipCalendarPopup() {
    const popup = document.getElementById('slipCustomCalendarPopup');
    if (!popup) return;
    const curDate = this.slipDate || Utils.today();
    const [y, m] = curDate.split('-').map(Number);
    this.slipCalViewYear = y;
    this.slipCalViewMonth = m - 1;
    this.renderSlipCalendarPopup();
    popup.style.display = 'block';

    const panel = document.getElementById('savedMealSlipPanel');
    if (panel) {
      panel.style.marginBottom = '140px';
    }
  },

  closeSlipCalendarPopup() {
    const popup = document.getElementById('slipCustomCalendarPopup');
    if (popup) popup.style.display = 'none';

    const panel = document.getElementById('savedMealSlipPanel');
    if (panel) {
      panel.style.marginBottom = '';
    }
  },

  navSlipCalendarMonth(dir, e) {
    if (e) e.stopPropagation();
    if (this.slipCalViewMonth === undefined) this.slipCalViewMonth = new Date().getMonth();
    if (this.slipCalViewYear === undefined) this.slipCalViewYear = new Date().getFullYear();

    this.slipCalViewMonth += dir;
    if (this.slipCalViewMonth < 0) {
      this.slipCalViewMonth = 11;
      this.slipCalViewYear--;
    } else if (this.slipCalViewMonth > 11) {
      this.slipCalViewMonth = 0;
      this.slipCalViewYear++;
    }
    this.renderSlipCalendarPopup();
  },

  renderSlipCalendarPopup() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const titleEl = document.getElementById('slipCalMonthYearTitle');
    if (titleEl) {
      titleEl.textContent = `${monthNames[this.slipCalViewMonth]} ${this.slipCalViewYear}`;
    }

    const gridEl = document.getElementById('slipCalDaysGrid');
    if (!gridEl) return;

    const selectedDate = this.slipDate || Utils.today();
    const todayDate = Utils.today();

    const year = this.slipCalViewYear;
    const month = this.slipCalViewMonth;

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
      html += `<div class="cal-day-cell muted" onclick="Messliner.meals.selectSlipCalendarDate('${dateStr}', event)">${dNum}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayDate;
      let classes = 'cal-day-cell';
      if (isSelected) classes += ' selected';
      if (isToday) classes += ' today';
      html += `<div class="${classes}" onclick="Messliner.meals.selectSlipCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    // Next month leading days
    const totalCells = firstDayIndex + daysInMonth;
    const remainingCells = (totalCells > 35 ? 42 : 35) - totalCells;
    for (let d = 1; d <= remainingCells; d++) {
      let nextM = month + 1;
      let nextY = year;
      if (nextM > 11) { nextM = 0; nextY++; }
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.meals.selectSlipCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    gridEl.innerHTML = html;
  },

  selectSlipCalendarDate(dateStr, e) {
    if (e) e.stopPropagation();
    this.slipDate = dateStr;
    this.updateSlipDateDisplay();
    this.closeSlipCalendarPopup();
    this.loadDownloadSlipOptions();
  },

  changeSlipDateByDays(days, e) {
    if (e) e.stopPropagation();
    const curVal = this.slipDate || Utils.today();
    const [y, m, d] = curVal.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    this.slipDate = `${ny}-${nm}-${nd}`;
    this.updateSlipDateDisplay();
    this.loadDownloadSlipOptions();
  },

  setSlipTodayDate(e) {
    if (e) e.stopPropagation();
    this.slipDate = Utils.today();
    this.updateSlipDateDisplay();
    this.loadDownloadSlipOptions();
  },

  /**
   * Load saved meals for the chosen date and display options
   */
  async loadDownloadSlipOptions() {
    const targetDate = this.slipDate || document.getElementById('downloadSlipDateInput')?.value || Utils.today();
    if (!targetDate) return;

    const dayKey = Utils.dayKey(targetDate);
    const monthKey = targetDate.substring(0, 7);

    const container = document.getElementById('downloadSlipMealsOptions');
    if (!container) return;

    // Show loading
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 12px; color: var(--text-tertiary); font-size: var(--font-xs);">
        Loading saved meals...
      </div>
    `;

    try {
      let dayData = null;
      if (this.diningId) {
        const snap = await db.ref(`dinings/${this.diningId}/meals/${monthKey}/${dayKey}`).once('value');
        dayData = snap.val();

        // Fallback: check unpadded dayKey (e.g. "3" vs "03")
        if (!dayData) {
          const unpaddedDayKey = String(parseInt(dayKey, 10));
          if (unpaddedDayKey !== dayKey) {
            const snapAlt = await db.ref(`dinings/${this.diningId}/meals/${monthKey}/${unpaddedDayKey}`).once('value');
            dayData = snapAlt.val();
          }
        }
      }

      // Fallback to memory mealsData if DB once() returns nothing
      if (!dayData || Object.keys(dayData).length === 0) {
        dayData = this.getDayData(targetDate) || {};
      }

      // Cache day data
      this._downloadSlipDayData = dayData;

      const users = Messliner.users?.users || {};
      const s = Messliner.settings?.getSettings() || {};
      const isManagerMealEnabled = !!s.managerMealEnabled;
      const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

      const meals = [
        {
          key: 'breakfast',
          label: 'Breakfast',
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
        },
        {
          key: 'lunch',
          label: 'Lunch',
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0"/></svg>`
        },
        {
          key: 'dinner',
          label: 'Dinner',
          icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
        }
      ].filter(m => trackedMeals[m.key] !== false);

      container.innerHTML = '';

      const activeTrackedKeys = meals.map(m => m.key);
      if (!this.selectedDownloadSlipMeals || !this.selectedDownloadSlipMeals.some(k => activeTrackedKeys.includes(k))) {
        this.selectedDownloadSlipMeals = [...activeTrackedKeys];
      } else {
        this.selectedDownloadSlipMeals = this.selectedDownloadSlipMeals.filter(k => activeTrackedKeys.includes(k));
      }

      let totalDayMealCount = 0;
      const mealCountsMap = {};

      meals.forEach(m => {
        let count = 0;
        const mealEntries = dayData[m.key] || {};
        Object.entries(users).forEach(([userId, user]) => {
          if (user.role === 'admin' && !isManagerMealEnabled) return;
          const val = mealEntries[userId];
          count += this._parseMealVal(val);
        });
        mealCountsMap[m.key] = count;
        totalDayMealCount += count;
      });

      const previewBtn = document.getElementById('btnPreviewDownloadSlip');

      // If NO meals were added/run on this day for anyone
      if (totalDayMealCount === 0) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 24px 16px; background: rgba(239, 246, 255, 0.5); border: 1px dashed rgba(37, 99, 235, 0.25); border-radius: var(--radius-lg);">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); color: var(--danger-600); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #1e3a8a;">No Meals Saved on This Day</h4>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-tertiary);">No member meals were saved or run on this date (${Utils.formatDate(targetDate)}). Meal slip preview is disabled.</p>
          </div>
        `;

        if (previewBtn) {
          previewBtn.disabled = true;
          previewBtn.title = "No meals were run on this date";
        }
        return;
      }

      container.innerHTML = '';

      meals.forEach(m => {
        const mealCount = mealCountsMap[m.key] || 0;
        const isCompleted = !!dayData.completed?.[m.key];
        const subLabelText = isCompleted ? 'Completed' : (mealCount > 0 ? 'Saved (Not Completed)' : 'No Saved Meals');

        const isSelected = this.selectedDownloadSlipMeals.includes(m.key);
        const statusClass = isSelected ? 'selected' : 'status-open';

        container.innerHTML += `
          <div class="glass-option-row slip-option-row ${statusClass}" onclick="Messliner.meals.toggleDownloadSlipMealSelection('${m.key}')" title="${m.label}">
            <div class="glass-option-left">
              <div class="glass-option-circle circle-${m.key}">
                ${m.icon}
              </div>
              <div class="glass-option-info">
                <span class="glass-option-label">${m.label}</span>
                <span class="glass-option-sublabel">${subLabelText}</span>
              </div>
            </div>
            <div class="glass-option-count-box">
              ${mealCount}
            </div>
          </div>
        `;
      });

      if (previewBtn) {
        previewBtn.disabled = (this.selectedDownloadSlipMeals || []).length === 0;
      }

    } catch (err) {
      console.error('Error fetching download slip options:', err);
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 12px; color: var(--danger-600); font-size: var(--font-xs);">
          Failed to load saved meals.
        </div>
      `;
    }
  },

  /**
   * Toggle meal selection for the downloader slip
   */
  toggleDownloadSlipMealSelection(mealType) {
    if (!this.selectedDownloadSlipMeals) {
      this.selectedDownloadSlipMeals = [];
    }
    const idx = this.selectedDownloadSlipMeals.indexOf(mealType);
    if (idx > -1) {
      this.selectedDownloadSlipMeals.splice(idx, 1);
    } else {
      this.selectedDownloadSlipMeals.push(mealType);
    }
    this.loadDownloadSlipOptions();
  },

  /**
   * Render and open the meal slip preview modal using chosen date's saved data
   */
  previewDownloadSlip() {
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const activeTrackedKeys = ['breakfast', 'lunch', 'dinner'].filter(k => trackedMeals[k] !== false);

    let selectedMeals = (this.selectedDownloadSlipMeals || []).filter(k => trackedMeals[k] !== false);
    if (selectedMeals.length === 0) {
      selectedMeals = activeTrackedKeys;
    }

    const dateInput = document.getElementById('downloadSlipDateInput');
    if (!dateInput) return;
    const targetDate = dateInput.value;

    let dayData = this._downloadSlipDayData;
    if (!dayData || Object.keys(dayData).length === 0) {
      dayData = this.getDayData(targetDate) || {};
    }

    const isManagerMealEnabled = !!s.managerMealEnabled;
    const users = Messliner.users?.users || {};

    let totalSelectedMealsCount = 0;
    selectedMeals.forEach(mKey => {
      const mealEntries = dayData[mKey] || {};
      Object.entries(users).forEach(([userId, user]) => {
        if (user.role === 'admin' && !isManagerMealEnabled) return;
        totalSelectedMealsCount += this._parseMealVal(mealEntries[userId]);
      });
    });

    if (totalSelectedMealsCount === 0) {
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('warning', 'No Meals Saved', 'No meals were saved or run on this date to generate a slip.');
      }
      return;
    }

    const buildList = (mealTypesToInclude) => {
      const list = [];
      Object.entries(users).forEach(([userId, user], index) => {
        if (user.role === 'admin' && !isManagerMealEnabled) return;
        if (!this.isUserActiveForMonth(userId, targetDate)) return;

        let breakfastCount = 0;
        let lunchCount = 0;
        let dinnerCount = 0;

        const dayBreakfast = dayData.breakfast || {};
        const dayLunch = dayData.lunch || {};
        const dayDinner = dayData.dinner || {};

        if (mealTypesToInclude.includes('breakfast') && trackedMeals.breakfast !== false) {
          breakfastCount = this._parseMealVal(dayBreakfast[userId]);
        }
        if (mealTypesToInclude.includes('lunch') && trackedMeals.lunch !== false) {
          lunchCount = this._parseMealVal(dayLunch[userId]);
        }
        if (mealTypesToInclude.includes('dinner') && trackedMeals.dinner !== false) {
          dinnerCount = this._parseMealVal(dayDinner[userId]);
        }

        const total = breakfastCount + lunchCount + dinnerCount;
        if (total > 0) {
          list.push({
            id: userId,
            name: user.name || 'Unknown Member',
            role: user.role || 'member',
            avatarColor: Messliner.users?._avatarColor(user.name) || '#ccc',
            initials: Utils.initials(user.name),
            breakfast: breakfastCount,
            lunch: lunchCount,
            dinner: dinnerCount,
            total: total,
            createdAt: user.createdAt || user.timestamp || user.joinedAt || 0,
            joinOrder: index
          });
        }
      });

      // Append extra slip entries (e.g. Mess Khala / Staff / Guests)
      const extraEntries = Object.entries(this.extraSlipEntries || {});
      extraEntries.forEach(([entryId, entry]) => {
        let breakfastCount = 0;
        let lunchCount = 0;
        let dinnerCount = 0;

        if (mealTypesToInclude.includes('breakfast') && trackedMeals.breakfast !== false) {
          breakfastCount = parseInt(entry.breakfast, 10) || 0;
        }
        if (mealTypesToInclude.includes('lunch') && trackedMeals.lunch !== false) {
          lunchCount = parseInt(entry.lunch, 10) || 0;
        }
        if (mealTypesToInclude.includes('dinner') && trackedMeals.dinner !== false) {
          dinnerCount = parseInt(entry.dinner, 10) || 0;
        }

        const total = breakfastCount + lunchCount + dinnerCount;
        if (total > 0) {
          list.push({
            id: entryId,
            name: entry.name || 'Extra Entry',
            role: 'extra',
            avatarColor: '#10B981',
            initials: 'EX',
            breakfast: breakfastCount,
            lunch: lunchCount,
            dinner: dinnerCount,
            total: total,
            createdAt: 9999999999999,
            joinOrder: 99999,
            isExtra: true
          });
        }
      });

      return list;
    };

    let listData = buildList(selectedMeals);

    // Smart Fallback: If specific selection yields 0 members, but other active tracked meal types have saved meals on targetDate,
    // evaluate all active tracked meal types automatically.
    if (listData.length === 0 && selectedMeals.length < activeTrackedKeys.length) {
      const fallbackList = buildList(activeTrackedKeys);
      if (fallbackList.length > 0) {
        listData = fallbackList;
        selectedMeals = activeTrackedKeys;
      }
    }

    // Sort: members first (manager first), extra entries at the very end
    listData.sort((a, b) => {
      if (a.isExtra !== b.isExtra) {
        return a.isExtra ? 1 : -1;
      }
      const roleA = a.role === 'admin' ? 0 : 1;
      const roleB = b.role === 'admin' ? 0 : 1;
      if (roleA !== roleB) return roleA - roleB;

      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      if (timeA && timeB && timeA !== timeB) {
        return timeA - timeB;
      }
      return a.joinOrder - b.joinOrder;
    });

    const grandTotal = listData.reduce((sum, item) => sum + item.total, 0);
    const totalBreakfast = listData.reduce((sum, item) => sum + item.breakfast, 0);
    const totalLunch = listData.reduce((sum, item) => sum + item.lunch, 0);
    const totalDinner = listData.reduce((sum, item) => sum + item.dinner, 0);

    this._renderSlipModalContent({
      targetDate,
      selectedMeals,
      listData,
      grandTotal,
      totalBreakfast,
      totalLunch,
      totalDinner,
      emptyMessage: 'No saved meals found for this selection.'
    });
  },

  /* ==========================================================================
     EXTRA SLIP ENTRIES MANAGEMENT (COOK / STAFF / GUEST PRESETS)
     ========================================================================== */

  showExtraSlipModal() {
    this.switchAdminMealTab('meal-settings');
  },

  closeExtraSlipModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('extraSlipModal');
    if (modal) modal.style.display = 'none';
  },

  async saveExtraSlipEntry(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('extraSlipNameInput');
    const bInput = document.getElementById('extraSlipBCount');
    const lInput = document.getElementById('extraSlipLCount');
    const dInput = document.getElementById('extraSlipDCount');

    const name = nameInput?.value?.trim();
    if (!name) {
      Notifications.toast('warning', 'Name Required', 'Please enter a name for the extra slip person.');
      return;
    }

    const b = parseInt(bInput?.value, 10) || 0;
    const l = parseInt(lInput?.value, 10) || 0;
    const d = parseInt(dInput?.value, 10) || 0;

    if (b === 0 && l === 0 && d === 0) {
      Notifications.toast('warning', 'Meal Count Required', 'Please specify at least 1 meal count for Breakfast, Lunch, or Dinner.');
      return;
    }

    const entryId = `extra_${Date.now()}`;
    try {
      await db.ref(`dinings/${this.diningId}/settings/extraSlipEntries/${entryId}`).set({
        name: name,
        breakfast: b,
        lunch: l,
        dinner: d,
        createdAt: Date.now()
      });

      if (nameInput) nameInput.value = '';
      if (bInput) bInput.value = '0';
      if (lInput) lInput.value = '1';
      if (dInput) dInput.value = '1';

      Notifications.toast('success', 'Added', `${name} added to extra slip entries.`);
    } catch (err) {
      console.error('Error adding extra slip entry:', err);
      Notifications.toast('error', 'Error', 'Failed to add extra slip entry.');
    }
  },

  async deleteExtraSlipEntry(entryId) {
    if (!entryId) return;
    try {
      await db.ref(`dinings/${this.diningId}/settings/extraSlipEntries/${entryId}`).remove();
      Notifications.toast('info', 'Removed', 'Extra slip entry removed.');
    } catch (err) {
      console.error('Error removing extra slip entry:', err);
      Notifications.toast('error', 'Error', 'Failed to remove extra slip entry.');
    }
  },

  adjustExtraSlipCount(inputId, delta) {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseInt(input.value, 10) || 0;
    const min = parseInt(input.getAttribute('min'), 10) || 0;
    const max = parseInt(input.getAttribute('max'), 10) || 10;
    val = Math.max(min, Math.min(max, val + delta));
    input.value = val;
  },

  updateExtraSlipFormVisibility() {
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    const bCol = document.getElementById('extraSlipBCol');
    const lCol = document.getElementById('extraSlipLCol');
    const dCol = document.getElementById('extraSlipDCol');
    const grid = document.getElementById('extraSlipMealGrid');

    let activeCount = 0;

    if (bCol) {
      const show = trackedMeals.breakfast !== false;
      bCol.style.display = show ? 'flex' : 'none';
      if (show) activeCount++;
    }

    if (lCol) {
      const show = trackedMeals.lunch !== false;
      lCol.style.display = show ? 'flex' : 'none';
      if (show) activeCount++;
    }

    if (dCol) {
      const show = trackedMeals.dinner !== false;
      dCol.style.display = show ? 'flex' : 'none';
      if (show) activeCount++;
    }

    if (grid) {
      grid.style.gridTemplateColumns = `repeat(${Math.max(1, activeCount)}, 1fr)`;
    }
  },

  renderExtraSlipEntriesList() {
    const container = document.getElementById('extraSlipEntriesList');
    if (!container) return;

    this.updateExtraSlipFormVisibility();

    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    const entries = Object.entries(this.extraSlipEntries || {});
    if (entries.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 14px; color: var(--text-tertiary); font-size: 12.5px; background: rgba(0,0,0,0.02); border-radius: 12px; border: 1px dashed rgba(0,0,0,0.08);">
          No extra slip entries saved yet.
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(([id, entry]) => {
      const b = entry.breakfast || 0;
      const l = entry.lunch || 0;
      const d = entry.dinner || 0;

      let badgesHtml = '';

      if (trackedMeals.breakfast !== false) {
        badgesHtml += `
          <span class="ese-badge-b" title="Breakfast">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            B: ${b}
          </span>
        `;
      }

      if (trackedMeals.lunch !== false) {
        badgesHtml += `
          <span class="ese-badge-l" title="Lunch">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0"/></svg>
            L: ${l}
          </span>
        `;
      }

      if (trackedMeals.dinner !== false) {
        badgesHtml += `
          <span class="ese-badge-d" title="Dinner">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            D: ${d}
          </span>
        `;
      }

      return `
        <div class="ese-entry-item">
          <div>
            <div class="ese-entry-name">${entry.name}</div>
            <div class="ese-entry-badges">
              ${badgesHtml}
            </div>
          </div>
          <button type="button" class="ese-del-btn" onclick="Messliner.meals.deleteExtraSlipEntry('${id}')" title="Remove Entry">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
    }).join('');
  },

  /* ==========================================================================
     MONTHLY ACTIVE MEMBERS MANAGEMENT
     ========================================================================== */

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /**
   * Show Monthly Active Meal Members modal
   */
  showActiveMembersModal() {
    this.switchAdminMealTab('meal-settings');
  },

  _getHistoryDateRange() {
    const now = new Date();
    const startYear = now.getFullYear();
    const startMonth = now.getMonth() + 1; // Current month (1 to 12)

    // End month = current month + 1 month (Next month)
    const endObj = new Date(startYear, now.getMonth() + 1, 1);
    const endYear = endObj.getFullYear();
    const endMonth = endObj.getMonth() + 1; // 1 to 12

    return { startYear, startMonth, endYear, endMonth };
  },

  _populateYearDropdown(selectId, defaultYear) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const range = this._getHistoryDateRange();
    const currentYear = new Date().getFullYear();
    const targetYear = defaultYear || parseInt(select.value, 10) || currentYear;

    let html = '';
    for (let y = range.startYear; y <= range.endYear; y++) {
      const isSel = (y === targetYear);
      html += `<option value="${y}" ${isSel ? 'selected' : ''}>${y}</option>`;
    }
    select.innerHTML = html;

    if (targetYear >= range.startYear && targetYear <= range.endYear) {
      select.value = String(targetYear);
    } else {
      select.value = String(range.endYear);
    }

    select.onchange = () => {
      this._populateMonthDropdown('activeMembersMonthSelect');
      this.renderActiveMembersList();
    };

    this.renderCustomPillDropdown(selectId);
  },

  _populateMonthDropdown(selectId, defaultMonth) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const range = this._getHistoryDateRange();
    const yearSelect = document.getElementById('activeMembersYearSelect');
    const selectedYear = yearSelect ? (parseInt(yearSelect.value, 10) || new Date().getFullYear()) : new Date().getFullYear();

    let minMonth = 1;
    let maxMonth = 12;

    if (selectedYear === range.startYear) {
      minMonth = range.startMonth;
    }
    if (selectedYear === range.endYear) {
      maxMonth = range.endMonth;
    }

    const currentMonthVal = parseInt(select.value, 10);
    let targetMonth = defaultMonth || currentMonthVal || (new Date().getMonth() + 1);

    if (targetMonth < minMonth) targetMonth = minMonth;
    if (targetMonth > maxMonth) targetMonth = maxMonth;

    let html = '';
    this.monthNames.forEach((name, index) => {
      const m = index + 1;
      if (m >= minMonth && m <= maxMonth) {
        const isSel = (m === targetMonth);
        html += `<option value="${m}" ${isSel ? 'selected' : ''}>${name}</option>`;
      }
    });
    select.innerHTML = html;
    select.value = String(targetMonth);

    this.renderCustomPillDropdown(selectId);
  },

  /**
   * Render custom pill dropdown UI matching screenshot
   */
  renderCustomPillDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.style.display = 'none';

    let customWrap = select.parentElement.querySelector('.ss-dropdown-container');
    if (!customWrap) {
      customWrap = document.createElement('div');
      customWrap.className = 'ss-dropdown-container';
      customWrap.style.position = 'relative';
      customWrap.style.width = '100%';
      select.parentElement.appendChild(customWrap);
    }

    const selectedOption = select.options[select.selectedIndex] || select.options[0];
    const selectedText = selectedOption ? selectedOption.text : '';

    let itemsHtml = '';
    Array.from(select.options).forEach(opt => {
      const isSel = String(opt.value) === String(select.value);
      itemsHtml += `
        <div class="ss-dropdown-item ${isSel ? 'is-selected' : ''}" 
             data-value="${opt.value}"
             onclick="Messliner.meals.selectCustomPillOption('${selectId}', '${opt.value}', event)">
          ${opt.text}
        </div>
      `;
    });

    customWrap.innerHTML = `
      <button type="button" class="ss-dropdown-pill" id="pill_btn_${selectId}" onclick="Messliner.meals.toggleCustomPillDropdown('${selectId}', event)">
        <span class="ss-dropdown-label">${selectedText}</span>
        <span class="ss-dropdown-caret" id="pill_caret_${selectId}">▼</span>
      </button>
      <div class="ss-dropdown-popover" id="pill_popover_${selectId}" style="display:none;">
        ${itemsHtml}
      </div>
    `;

    if (!window._ssDropdownGlobalClickAttached) {
      window._ssDropdownGlobalClickAttached = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.ss-dropdown-popover').forEach(pop => {
          pop.style.display = 'none';
        });
        document.querySelectorAll('.ss-dropdown-pill').forEach(b => {
          b.classList.remove('is-open');
        });
        document.querySelectorAll('.ss-dropdown-caret').forEach(c => {
          c.textContent = '▼';
        });
      });
    }
  },

  toggleCustomPillDropdown(selectId, event) {
    if (event) event.stopPropagation();
    const btn = document.getElementById(`pill_btn_${selectId}`);
    const popover = document.getElementById(`pill_popover_${selectId}`);
    const caret = document.getElementById(`pill_caret_${selectId}`);
    if (!popover || !btn) return;

    const isOpen = popover.style.display !== 'none';

    document.querySelectorAll('.ss-dropdown-popover').forEach(pop => {
      pop.style.display = 'none';
    });
    document.querySelectorAll('.ss-dropdown-pill').forEach(b => {
      b.classList.remove('is-open');
    });
    document.querySelectorAll('.ss-dropdown-caret').forEach(c => {
      c.textContent = '▼';
    });

    if (!isOpen) {
      popover.style.display = 'block';
      btn.classList.add('is-open');
      if (caret) caret.textContent = '▲';
    }
  },

  selectCustomPillOption(selectId, value, event) {
    if (event) event.stopPropagation();
    const select = document.getElementById(selectId);
    if (!select) return;

    select.value = value;
    select.dispatchEvent(new Event('change'));
    this.renderCustomPillDropdown(selectId);
  },

  /**
   * Render list of members in Monthly Active Members (NO AVATARS)
   */
  renderActiveMembersList() {
    const yearSelect = document.getElementById('activeMembersYearSelect');
    const monthSelect = document.getElementById('activeMembersMonthSelect');
    if (!yearSelect || !monthSelect) return;

    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    const searchQuery = (document.getElementById('activeMembersSearchInput')?.value || '').toLowerCase().trim();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const container = document.getElementById('activeMembersChecklist');
    if (!container) return;

    const users = Messliner.users?.users || {};
    const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);

    const userEntries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      if (searchQuery) {
        return (u.name || '').toLowerCase().includes(searchQuery);
      }
      return true;
    });

    if (userEntries.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px 16px;color:var(--text-tertiary);font-size:13px;font-weight:500;">No members found matching your search</div>';
      return;
    }

    container.innerHTML = userEntries.map(([id, u]) => {
      const isActive = this.isUserActiveForMonth(id, monthStr);
      const dotClass = isActive ? 'mamm-status-dot-active' : 'mamm-status-dot-inactive';
      const statusClass = isActive ? 'mamm-status-active' : 'mamm-status-inactive';
      const statusLabel = isActive ? 'Meal Active' : 'Inactive this month';

      return `
        <div class="mamm-member-row ${isActive ? 'is-selected' : ''}" onclick="document.getElementById('active_mem_${id}').click();">
          <div class="mamm-member-info">
            <div class="mamm-member-name">${u.name}</div>
            <div class="mamm-member-status ${statusClass}">
              <span class="mamm-status-dot ${dotClass}"></span>
              <span>${statusLabel}</span>
            </div>
          </div>
          <label class="mamm-toggle" onclick="event.stopPropagation()">
            <input type="checkbox" id="active_mem_${id}" value="${id}" class="active-member-cb" ${isActive ? 'checked' : ''} onchange="Messliner.meals.updateActiveMembersSelectAllState(); Messliner.meals.handleMemberRowToggle(this);">
            <span class="mamm-toggle-slider"></span>
          </label>
        </div>
      `;
    }).join('');

    this.updateActiveMembersSelectAllState();
  },

  handleMemberRowToggle(cb) {
    const row = cb.closest('.mamm-member-row');
    if (row) {
      if (cb.checked) {
        row.classList.add('is-selected');
      } else {
        row.classList.remove('is-selected');
      }
    }
  },

  updateActiveMembersSelectAllState() {
    const checkboxes = document.querySelectorAll('.active-member-cb');
    const checked = document.querySelectorAll('.active-member-cb:checked');
    const selectAll = document.getElementById('selectAllActiveMembers');
    if (selectAll) {
      selectAll.checked = (checkboxes.length > 0 && checked.length === checkboxes.length);
      selectAll.indeterminate = (checked.length > 0 && checked.length < checkboxes.length);
    }
  },

  toggleSelectAllActiveMembers(source) {
    const checkboxes = document.querySelectorAll('.active-member-cb');
    checkboxes.forEach(cb => {
      cb.checked = source.checked;
      this.handleMemberRowToggle(cb);
    });
    this.updateActiveMembersSelectAllState();
  },

  /**
   * Save Active Members for the selected month
   */
  async saveActiveMembers() {
    const year = parseInt(document.getElementById('activeMembersYearSelect').value);
    const month = parseInt(document.getElementById('activeMembersMonthSelect').value);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const monthName = this.monthNames[month - 1];

    const checkboxes = document.querySelectorAll('.active-member-cb');
    const activeMap = {};

    checkboxes.forEach(cb => {
      activeMap[cb.value] = cb.checked;
    });

    try {
      await db.ref(`dinings/${this.diningId}/settings/activeMealMembers/${monthStr}`).set(activeMap);

      if (!this.activeMealMembersMap) this.activeMealMembersMap = {};
      this.activeMealMembersMap[monthStr] = activeMap;

      const activeCount = Object.values(activeMap).filter(Boolean).length;
      Notifications.toast('success', 'Active Members Saved', `${activeCount} active member(s) set for ${monthName} ${year}.`);

      if (document.getElementById('activeMembersModal')) {
        try { closeModal('activeMembersModal'); } catch (e) { }
      }

      // Refresh UI
      this.renderUserGrid();
      this.renderMealLog();
      this.updateCompleteMealSelect();

      if (typeof OverviewModule !== 'undefined' && OverviewModule.refresh) {
        OverviewModule.refresh();
      }

    } catch (error) {
      console.error('[ActiveMembers] Save error:', error);
      Notifications.toast('error', 'Error', 'Failed to save active members.');
    }
  }

};

window.MealsModule = MealsModule;
if (typeof Messliner !== 'undefined') {
  Messliner.meals = MealsModule;
}

console.log('[Messliner] Meals module loaded');
