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
  extraSlipEntries: {},

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
    const todayStr = Utils.today();
    if (!todayStr) return '';

    // Helper: build a date string that is N days offset from todayStr
    const offsetDate = (n) => {
      const [year, month, day] = todayStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + n);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dv = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dv}`;
    };

    // Check if we are in the "overnight window":
    // Current time is before the earliest deadline of today
    // (meaning yesterday's lock deadline has passed but today's hasn't yet)
    const s = Messliner.settings?.getSettings() || {};
    const autoEnabled = !!s.autoMealEnabled;
    if (autoEnabled) {
      const deadlines = [
        s.breakfastDeadline || '04:00',
        s.lunchDeadline || '10:00',
        s.dinnerDeadline || '16:00'
      ];
      // Find earliest deadline (in minutes from midnight)
      const deadlineMinutes = deadlines.map(dl => {
        const [h, mn] = dl.split(':').map(Number);
        return h * 60 + mn;
      });
      const earliestMinutes = Math.min(...deadlineMinutes);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // If current time is before today's earliest deadline, we are in the
      // overnight window — today's meals may still need completing.
      // Check if today's meals are already completed; if not, return today.
      if (nowMinutes < earliestMinutes) {
        const todayData = this.getDayData(todayStr);
        const todayCompleted = todayData.completed || {};
        // If at least one meal type is not yet completed for today, return today
        const mealKeys = ['breakfast', 'lunch', 'dinner'];
        const allDone = mealKeys.every(k => !!todayCompleted[k]);
        if (!allDone) {
          return todayStr; // overnight: complete today's meals first
        }
      }
    }

    // Default: tomorrow
    return offsetDate(1);
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

    // Set date input
    const dateInput = document.getElementById('mealDateInput');
    if (dateInput) {
      dateInput.value = this.currentDate;
      dateInput.addEventListener('change', (e) => {
        this.currentDate = e.target.value;
        this.loadMeals();
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
          { type: 'breakfast', label: '☀️ Breakfast' },
          { type: 'lunch', label: '🍱 Lunch' },
          { type: 'dinner', label: '🌙 Dinner' }
        ];

        let firstActive = null;
        mealsList.forEach(m => {
          if (trackedMeals[m.type] !== false) {
            if (!firstActive) firstActive = m.type;
            const activeClass = this.selectedTypes.has(m.type) ? 'active' : '';
            tabContainer.innerHTML += `
              <button class="meal-type-tab ${activeClass}" data-type="${m.type}"
                onclick="Messliner.meals.selectType('${m.type}')">${m.label}</button>
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
   * Select meal type tab (supports multi-select toggle)
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
          <div class="avatar avatar-sm" style="background:${Messliner.users._avatarColor(user.name)};">${Utils.initials(user.name)}</div>
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
      await Notifications.create(
        this.diningId,
        'Meals Updated',
        `${typesLabel} meals updated for ${Utils.formatDate(this.currentDate)}.`,
        'all',
        'meal'
      );
      await Notifications.log(this.diningId, 'meals_updated', `${typesLabel} meals updated for ${this.currentDate}`, Messliner.state.userId);

      // Log individual meal updates for selected users — all tagged with the same batchId
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
          await Notifications.log(
            this.diningId,
            'meal_updated',
            detail,
            Messliner.state.userId,
            userId,
            this.selectedTypes.size === 1,
            batchId
          );
        }
      }

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
    const container = document.getElementById('mealLogTable');
    if (!container) return;

    const day = Utils.dayKey(this.currentDate);
    const dayData = this.mealsData[day] || {};
    const users = Messliner.users.users;
    const types = ['breakfast', 'lunch', 'dinner'];
    const hasAnyMeal = types.some(t => dayData[t] && Object.keys(dayData[t]).length > 0);

    if (!hasAnyMeal) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6);">
          <p style="color:var(--text-tertiary);">No meals recorded for ${Utils.formatDate(this.currentDate)}.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="text-align: left;">Member</th>
              <th style="text-align: center;">☀️ Breakfast</th>
              <th style="text-align: center;">🍱 Lunch</th>
              <th style="text-align: center;">🌙 Dinner</th>
              <th style="text-align: center;">Total</th>
            </tr>
          </thead>
          <tbody>
    `;

    let grandB = 0;
    let grandL = 0;
    let grandD = 0;

    Object.entries(users).forEach(([uid, user]) => {
      const b = parseInt(dayData.breakfast?.[uid]) || 0;
      const l = parseInt(dayData.lunch?.[uid]) || 0;
      const d = parseInt(dayData.dinner?.[uid]) || 0;
      const total = b + l + d;

      if (total > 0) {
        grandB += b;
        grandL += l;
        grandD += d;
        html += `
          <tr>
            <td style="text-align: left;">
              <div class="flex items-center gap-2">
                <div class="avatar avatar-sm" style="background:${Messliner.users._avatarColor(user.name)};">${Utils.initials(user.name)}</div>
                ${user.name}
              </div>
            </td>
            <td style="text-align: center;">${b > 0 ? `<span class="badge badge-accent">${b}</span>` : '<span style="color:var(--text-tertiary);">—</span>'}</td>
            <td style="text-align: center;">${l > 0 ? `<span class="badge badge-accent">${l}</span>` : '<span style="color:var(--text-tertiary);">—</span>'}</td>
            <td style="text-align: center;">${d > 0 ? `<span class="badge badge-accent">${d}</span>` : '<span style="color:var(--text-tertiary);">—</span>'}</td>
            <td style="text-align: center;"><strong>${total}</strong></td>
          </tr>
        `;
      }
    });

    const grandTotal = grandB + grandL + grandD;

    html += `
          </tbody>
          <tfoot>
            <tr style="font-weight:var(--weight-bold); background:var(--gray-50); border-top: 2px solid var(--border-color);">
              <td style="text-align: left; padding: var(--space-3) var(--space-4);">Total Meals</td>
              <td style="text-align: center; padding: var(--space-3) var(--space-4);">${grandB > 0 ? `<span class="badge badge-primary">${grandB}</span>` : '0'}</td>
              <td style="text-align: center; padding: var(--space-3) var(--space-4);">${grandL > 0 ? `<span class="badge badge-primary">${grandL}</span>` : '0'}</td>
              <td style="text-align: center; padding: var(--space-3) var(--space-4);">${grandD > 0 ? `<span class="badge badge-primary">${grandD}</span>` : '0'}</td>
              <td style="text-align: center; padding: var(--space-3) var(--space-4);"><strong>${grandTotal}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    container.innerHTML = html;
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
   * Refresh meals page.
   * If mealsData is already populated, render immediately.
   * If it's empty (Firebase hasn't responded yet on initial load),
   * call _listenMeals() which will render once data arrives.
   */
  refresh() {
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

    const meals = [
      { key: 'breakfast', label: 'Breakfast', deadline: s.breakfastDeadline || '04:00', icon: '☀️' },
      { key: 'lunch', label: 'Lunch', deadline: s.lunchDeadline || '10:00', icon: '🍱' },
      { key: 'dinner', label: 'Dinner', deadline: s.dinnerDeadline || '16:00', icon: '🌙' }
    ];

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

      if (isAlreadyCompleted) {
        statusClass = 'status-completed';
        statusLabel = 'Completed';
      } else if (isLocked) {
        statusClass = 'status-locked';
        statusLabel = 'Locked';
        const isSelected = this.selectedLockedMeals.includes(m.key);
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

      const subLabelText = isAlreadyCompleted
        ? 'Already Completed'
        : (isLocked ? `Locked • Deadline ${m.deadline}` : `Open • Deadline ${m.deadline}`);

      container.innerHTML += `
        <div class="glass-option-row ${statusClass}" ${clickAttr} title="${m.label} is currently ${statusLabel}">
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

    const btn = document.getElementById('btnCompleteMeal');
    if (btn) {
      const count = (this.selectedLockedMeals || []).length;
      btn.disabled = count === 0;
      const btnSpan = btn.querySelector('span');
      if (btnSpan) {
        btnSpan.textContent = count > 0 ? `Complete Selected (${count})` : 'Complete Selected';
      }
    }

    const previewBtn = document.getElementById('btnPreviewMeal');
    if (previewBtn) {
      previewBtn.disabled = (this.selectedLockedMeals || []).length === 0;
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

      // One batchId for this entire operation so all per-user log entries
      // group into a single "Meals" activity card on each member's dashboard.
      const completeBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const totalMealTypes = this.selectedLockedMeals.length;

      // Toast + global notification per meal type
      for (const mealType of this.selectedLockedMeals) {
        const capitalizedMeal = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        Notifications.toast('success', 'Meal Completed', `${capitalizedMeal} meals completed.`);
        await Notifications.create(
          this.diningId,
          'Meal Logged',
          `${capitalizedMeal} meals have been completed by manager for ${Utils.formatDate(targetDate)}.`,
          'all',
          'meal'
        );
        await Notifications.log(this.diningId, 'meal_completed', `Completed ${capitalizedMeal} meals for ${targetDate}`, Messliner.state.userId);
      }

      // Per-user activity log — one entry per user per meal type,
      // all sharing completeBatchId so they appear as one grouped card in the activity feed.
      for (const [mealType, userCounts] of Object.entries(logCounts)) {
        const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
        for (const [userId, count] of Object.entries(userCounts)) {
          await Notifications.log(
            this.diningId,
            'meal_updated',
            `${count} ${mealLabel} added`,
            Messliner.state.userId,
            userId,
            totalMealTypes === 1,
            completeBatchId
          );
        }
      }

      // Clear selection
      this.selectedLockedMeals = [];
      this.updateCompleteMealSelect();

    } catch (error) {

      console.error('Error completing meals:', error);
      Notifications.toast('error', 'Error', 'Failed to complete locked meals.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btnHtmlBackup;
      }
    }
  },

  /**
   * Helper to format and render slip table headers, user rows, and totals
   * according to trackedMeals settings (hiding untracked/disabled meals)
   */
  _renderSlipModalContent({ targetDate, selectedMeals, listData, grandTotal, totalBreakfast, totalLunch, totalDinner, emptyMessage }) {
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
    const isFriday = fridayDates.includes(targetDate);

    const activeSelectedMeals = (selectedMeals || []).filter(m => trackedMeals[m] !== false);
    const slipMealTypes = document.getElementById('slipMealTypes');
    if (slipMealTypes) {
      slipMealTypes.textContent = activeSelectedMeals.map(m => {
        if (isFriday && m === 'lunch') return 'Lunch (Friday Special)';
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
        labelEl.textContent = isFriday ? 'Total Lunch (Friday Special):' : 'Total Lunch (L):';
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

    const selectedMeals = (this.selectedLockedMeals || []).filter(k => trackedMeals[k] !== false);
    if (selectedMeals.length === 0) {
      Notifications.toast('warning', 'No Meal Selected', 'Please select at least one locked meal to preview.');
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
  downloadMealSlip() {
    const element = document.getElementById('mealSlipContent');
    const wrapper = document.querySelector('.meal-slip-preview-wrapper');
    const container = document.querySelector('.meal-slip-modal-container');
    if (!element || !wrapper || !container) return;

    Notifications.toast('info', 'Rendering Slip', 'Generating JPG download, please wait...');

    // Save original styles and scroll position
    const originalWrapperOverflow = wrapper.style.overflow;
    const originalWrapperHeight = wrapper.style.height;
    const originalWrapperMaxHeight = wrapper.style.maxHeight;
    const originalContainerMaxHeight = container.style.maxHeight;
    const originalContainerOverflow = container.style.overflow;
    const originalScrollTop = wrapper.scrollTop;

    // Temporarily expand height and disable overflow clipping so html2canvas renders full element
    wrapper.style.overflow = 'visible';
    wrapper.style.height = 'auto';
    wrapper.style.maxHeight = 'none';
    container.style.maxHeight = 'none';
    container.style.overflow = 'visible';
    wrapper.scrollTop = 0;

    setTimeout(() => {
      html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: element.offsetWidth,
        height: element.scrollHeight,
        scrollX: 0,
        scrollY: 0
      }).then(canvas => {
        // Restore styles and scroll position immediately
        wrapper.style.overflow = originalWrapperOverflow;
        wrapper.style.height = originalWrapperHeight;
        wrapper.style.maxHeight = originalWrapperMaxHeight;
        container.style.maxHeight = originalContainerMaxHeight;
        container.style.overflow = originalContainerOverflow;
        wrapper.scrollTop = originalScrollTop;

        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const dateStr = this.getTargetDate();
          const diningName = (document.getElementById('sidebarDiningName')?.textContent || 'Messliner').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          link.download = `${diningName}_meal_slip_${dateStr}.jpg`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          Notifications.toast('success', 'Download Started', 'Meal slip downloaded successfully.');
        }, 'image/jpeg', 0.95);
      }).catch(err => {
        // Restore styles and scroll position in case of error
        wrapper.style.overflow = originalWrapperOverflow;
        wrapper.style.height = originalWrapperHeight;
        wrapper.style.maxHeight = originalWrapperMaxHeight;
        container.style.maxHeight = originalContainerMaxHeight;
        container.style.overflow = originalContainerOverflow;
        wrapper.scrollTop = originalScrollTop;

        console.error('Error generating slip:', err);
        Notifications.toast('error', 'Error', 'Failed to generate JPG download.');
      });
    }, 150);
  },

  /**
   * Save a manual lock override for a meal type in settings
   */
  async saveManualLockOverride(event) {
    const mealType = document.getElementById('manualLockMealType')?.value;
    const state = document.getElementById('manualLockState')?.value;
    if (!mealType || !state) return;

    const btn = event?.currentTarget || document.querySelector('.manual-lock-overrides button');
    let btnHtmlBackup = '';
    if (btn) {
      btnHtmlBackup = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      await db.ref(`dinings/${this.diningId}/settings/locks/${mealType}`).set(state);
      Notifications.toast('success', 'Override Saved', `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} lock override set to ${state.toUpperCase()}.`);
    } catch (error) {
      console.error('Error saving lock override:', error);
      Notifications.toast('error', 'Error', 'Failed to save lock override.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btnHtmlBackup;
      }
    }
  },

  /**
   * Initialize saved meal slip downloader inputs
   */
  initDownloadSlip() {
    const dateInput = document.getElementById('downloadSlipDateInput');
    if (dateInput) {
      dateInput.value = this.currentDate;
    }
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    const activeTrackedKeys = ['breakfast', 'lunch', 'dinner'].filter(k => trackedMeals[k] !== false);
    this.selectedDownloadSlipMeals = [...activeTrackedKeys];
    this.loadDownloadSlipOptions();
  },

  /**
   * Load saved meals for the chosen date and display options
   */
  async loadDownloadSlipOptions() {
    const dateInput = document.getElementById('downloadSlipDateInput');
    if (!dateInput) return;
    const targetDate = dateInput.value;
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
        { key: 'breakfast', label: 'Breakfast', icon: '☀️' },
        { key: 'lunch', label: 'Lunch', icon: '🍱' },
        { key: 'dinner', label: 'Dinner', icon: '🌙' }
      ].filter(m => trackedMeals[m.key] !== false);

      container.innerHTML = '';

      const activeTrackedKeys = meals.map(m => m.key);
      if (!this.selectedDownloadSlipMeals || !this.selectedDownloadSlipMeals.some(k => activeTrackedKeys.includes(k))) {
        this.selectedDownloadSlipMeals = [...activeTrackedKeys];
      } else {
        this.selectedDownloadSlipMeals = this.selectedDownloadSlipMeals.filter(k => activeTrackedKeys.includes(k));
      }

      meals.forEach(m => {
        let mealCount = 0;
        const mealEntries = dayData[m.key] || {};
        Object.entries(users).forEach(([userId, user]) => {
          if (user.role === 'admin' && !isManagerMealEnabled) return;
          const val = mealEntries[userId];
          mealCount += this._parseMealVal(val);
        });

        const isCompleted = !!dayData.completed?.[m.key];
        const subLabelText = isCompleted ? 'Completed' : (mealCount > 0 ? 'Saved (Not Completed)' : 'No Saved Meals');

        const isSelected = this.selectedDownloadSlipMeals.includes(m.key);
        const statusClass = isSelected ? 'status-locked selected' : 'status-open';

        container.innerHTML += `
          <div class="glass-option-row ${statusClass}" onclick="Messliner.meals.toggleDownloadSlipMealSelection('${m.key}')" title="${m.label}">
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

      const previewBtn = document.getElementById('btnPreviewDownloadSlip');
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
    this.renderExtraSlipEntriesList();
    const modal = document.getElementById('extraSlipModal');
    if (modal) modal.style.display = 'flex';
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

  renderExtraSlipEntriesList() {
    const container = document.getElementById('extraSlipEntriesList');
    if (!container) return;

    const entries = Object.entries(this.extraSlipEntries || {});
    if (entries.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 12px; color: var(--text-tertiary); font-size: var(--font-xs); background: rgba(0,0,0,0.02); border-radius: var(--radius-md);">
          No extra slip entries saved yet.
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(([id, entry]) => {
      const b = entry.breakfast || 0;
      const l = entry.lunch || 0;
      const d = entry.dinner || 0;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <div>
            <div style="font-size: var(--font-sm); font-weight: 600; color: var(--text-primary);">${entry.name}</div>
            <div style="font-size: 11px; color: var(--text-tertiary); display: flex; gap: 8px; margin-top: 2px;">
              <span>☀️ B: ${b}</span>
              <span>🍱 L: ${l}</span>
              <span>🌙 D: ${d}</span>
            </div>
          </div>
          <button type="button" onclick="Messliner.meals.deleteExtraSlipEntry('${id}')" style="background: none; border: none; cursor: pointer; color: var(--danger-600); padding: 4px;" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
    const now = new Date();
    const currentDateMonth = this.currentDate ? this.currentDate.substring(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = currentDateMonth.split('-').map(Number);

    this._populateYearDropdown('activeMembersYearSelect', y);
    this._populateMonthDropdown('activeMembersMonthSelect', m);

    const searchInput = document.getElementById('activeMembersSearchInput');
    if (searchInput) searchInput.value = '';

    this.renderActiveMembersList();
    openModal('activeMembersModal');
  },

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
   * Render list of members in Monthly Active Members modal
   */
  renderActiveMembersList() {
    const year = parseInt(document.getElementById('activeMembersYearSelect').value);
    const month = parseInt(document.getElementById('activeMembersMonthSelect').value);
    const searchQuery = (document.getElementById('activeMembersSearchInput')?.value || '').toLowerCase().trim();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const container = document.getElementById('activeMembersChecklist');
    if (!container) return;

    const users = Messliner.users?.users || {};
    const isManagerMealEnabled = !!(Messliner.settings?.getSettings()?.managerMealEnabled);

    const userEntries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      if (searchQuery) {
        return (u.name || '').toLowerCase().includes(searchQuery) || (u.username || '').toLowerCase().includes(searchQuery);
      }
      return true;
    });

    if (userEntries.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">No members found</div>';
      return;
    }

    container.innerHTML = userEntries.map(([id, u]) => {
      const isActive = this.isUserActiveForMonth(id, monthStr);
      return `
        <label class="members-checklist-item" for="active_mem_${id}">
          <div class="members-checklist-avatar" style="background:${Messliner.users._avatarColor(u.name)};">
            ${Utils.initials(u.name)}
          </div>
          <div class="members-checklist-info">
            <div class="members-checklist-name">${u.name}</div>
            <div class="members-checklist-sub">@${u.username || 'member'} · <span style="color:${isActive ? 'var(--accent-600)' : 'var(--text-tertiary)'};">${isActive ? 'Meal Active' : 'Meal Inactive/Off'}</span></div>
          </div>
          <input type="checkbox" id="active_mem_${id}" value="${id}" class="members-checklist-checkbox active-member-cb" ${isActive ? 'checked' : ''} onchange="Messliner.meals.updateActiveMembersSelectAllState()">
        </label>
      `;
    }).join('');

    this.updateActiveMembersSelectAllState();
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
    checkboxes.forEach(cb => { cb.checked = source.checked; });
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

      closeModal('activeMembersModal');

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

console.log('[Messliner] Meals module loaded');
