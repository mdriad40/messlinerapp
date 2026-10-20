/* ============================================
   Messliner — User Dashboard (user/dashboard.js)
   ============================================ */

const UserDashboard = {
  userData: null,
  settings: {},
  countdownInterval: null,
  monthlyDeposit: 0,
  monthlyMeals: 0,
  monthlyBazar: 0,
  _activityRenderTimer: null,
  _activityDataReady: false,  // true once first Firebase activity data has arrived

  /**
   * Get the date currently controlled for a specific meal type (immune to timezone shift)
   */
  getMealControlDate(mealType) {
    const todayStr = Utils.today();
    if (!todayStr) return '';
    const [year, month, day] = todayStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);

    // We check up to 5 days into the future starting from TODAY to find the first uncompleted date
    for (let i = 0; i < 5; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayKey = Utils.dayKey(dateStr);

      let completed = {};
      const currentMonth = todayStr.substring(0, 7);
      const checkMonth = dateStr.substring(0, 7);

      if (this.monthMealsData && currentMonth === checkMonth) {
        completed = (this.monthMealsData[dayKey] && this.monthMealsData[dayKey].completed) || {};
      }

      if (!completed[mealType]) {
        return dateStr;
      }
      d.setDate(d.getDate() + 1);
    }

    // Fallback: today
    return todayStr;
  },

  /**
   * Get the overall date the user is currently controlling (minimum control date of all tracked meals)
   */
  getControlDate() {
    const s = this.settings || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };
    let minDate = null;

    ['breakfast', 'lunch', 'dinner'].forEach(type => {
      if (trackedMeals[type] !== false) {
        const controlDate = this.getMealControlDate(type);
        if (!minDate || controlDate < minDate) {
          minDate = controlDate;
        }
      }
    });

    if (minDate) return minDate;

    // Fallback: today
    return Utils.today();
  },

  /**
   * Dynamically calculate meal rate based on active rateMode (Fixed vs Market)
   */
  _getDynamicMealRate() {
    const rateMode = this.settings?.rateMode || 'market';
    if (rateMode === 'fixed') {
      const fixedRates = this.settings?.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 };
      const tm = this.settings?.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      let fullDailyFixedRate = 0;
      let trackedCount = 0;
      if (tm.breakfast !== false && fixedRates.breakfast) {
        fullDailyFixedRate += parseFloat(fixedRates.breakfast) || 0;
        trackedCount++;
      }
      if (tm.lunch !== false && fixedRates.lunch) {
        fullDailyFixedRate += parseFloat(fixedRates.lunch) || 0;
        trackedCount++;
      }
      if (tm.dinner !== false && fixedRates.dinner) {
        fullDailyFixedRate += parseFloat(fixedRates.dinner) || 0;
        trackedCount++;
      }

      const mealCostTemp = Utils.calcMealCost(0, this.monthlyMeals || 0, this.monthlyMealsBreakdown || {}, fixedRates);
      if (this.monthlyMeals > 0 && mealCostTemp > 0) {
        return mealCostTemp / this.monthlyMeals;
      } else if (trackedCount > 0) {
        return fullDailyFixedRate / trackedCount;
      } else {
        return fullDailyFixedRate;
      }
    } else {
      // Market mode
      let totalDiningMeals = 0;
      if (this.monthMealsData) {
        Object.values(this.monthMealsData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (type === 'completed') return;
            if (typeof typeData === 'object') {
              Object.values(typeData).forEach(count => {
                totalDiningMeals += parseFloat(count) || 0;
              });
            }
          });
        });
      }
      if (!totalDiningMeals && Messliner.state?.monthlyTotalMeals) {
        totalDiningMeals = Messliner.state.monthlyTotalMeals;
      }
      if (totalDiningMeals > 0) {
        return (this.monthlyBazar || 0) / totalDiningMeals;
      }
      return 0;
    }
  },

  /**
   * Determine whether user's meal is locked due to exceeding due limit
   */
  isDueLocked() {
    if (!this.settings) return false;
    const dueLimit = parseFloat(this.settings.dueLimit) || 0;
    const isDueLimitActive = this.settings.dueLimitEnabled !== false && dueLimit > 0;
    if (!isDueLimitActive) return false;

    const mealRate = this._getDynamicMealRate();
    const rateMode = this.settings.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings.fixedRates || null) : null;
    const mealCost = Utils.calcMealCost(mealRate, this.monthlyMeals || 0, this.monthlyMealsBreakdown || null, fixedRates);
    const otherCosting = this.monthlyOtherCosting || 0;
    const deduction = this.monthlyDeduction || 0;
    const totalCost = mealCost + otherCosting;
    const balance = (this.monthlyDeposit || 0) - totalCost - deduction;
    const due = balance < 0 ? Math.abs(balance) : 0;

    return due >= dueLimit;
  },

  /**
   * Get current due calculation information
   */
  getDueInfo() {
    const dueLimit = parseFloat(this.settings?.dueLimit) || 0;
    const isDueLimitActive = this.settings?.dueLimitEnabled !== false && dueLimit > 0;
    const mealRate = this._getDynamicMealRate();
    const rateMode = this.settings?.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings?.fixedRates || null) : null;
    const mealCost = Utils.calcMealCost(mealRate, this.monthlyMeals || 0, this.monthlyMealsBreakdown || null, fixedRates);
    const otherCosting = this.monthlyOtherCosting || 0;
    const deduction = this.monthlyDeduction || 0;
    const totalCost = mealCost + otherCosting;
    const balance = (this.monthlyDeposit || 0) - totalCost - deduction;
    const due = balance < 0 ? Math.abs(balance) : 0;
    const isLocked = isDueLimitActive && due >= dueLimit;

    return {
      due,
      dueLimit,
      balance,
      isDueLimitActive,
      isLocked
    };
  },

  /**
   * Determine whether a meal is locked based on its controlDate and deadline setting (immune to timezone shift)
   */
  isMealLocked(mealType, controlDate) {
    // Check due limit lock first
    if (this.isDueLocked()) {
      return true;
    }

    const s = this.settings || {};

    // Check manual override setting first
    const locks = s.locks || {};
    const manualLock = locks[mealType]; // 'locked', 'unlocked', or undefined/'auto'
    if (manualLock === 'locked') {
      return true;
    }
    if (manualLock === 'unlocked') {
      return false;
    }

    const autoEnabled = s.autoMealEnabled !== false;
    if (!autoEnabled) return false;

    const deadline = s[`${mealType}Deadline`] || (mealType === 'breakfast' ? '04:00' : mealType === 'lunch' ? '10:00' : '16:00');

    // Find locking date (controlDate - 1 day)
    const [year, month, day] = controlDate.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() - 1);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayVal = String(d.getDate()).padStart(2, '0');
    const lockDateStr = `${y}-${m}-${dayVal}`;

    const todayStr = Utils.today();

    if (todayStr > lockDateStr) {
      return true;
    } else if (todayStr === lockDateStr) {
      return Utils.isPastDeadline(deadline);
    } else {
      return false;
    }
  },

  init(diningId, userId) {
    this.diningId = diningId;
    this.userId = userId;

    // Reset/initialize properties
    this.userLogsData = [];
    this.userDepositsData = [];
    this.adminLogsData = [];
    this._activityDataReady = false;  // reset so skeleton shows until data arrives

    // Clean up previous listeners and pending render timer
    if (this._activityRenderTimer) { clearTimeout(this._activityRenderTimer); this._activityRenderTimer = null; }
    if (this._userRef) this._userRef.off();
    if (this._settingsRef) this._settingsRef.off();
    if (this._logsRef) this._logsRef.off();
    if (this._adminLogsRef) this._adminLogsRef.off();

    // Listen to user data
    this._userRef = db.ref(`dinings/${diningId}/users/${userId}`);
    this._userRef.on('value', (snap) => {
      this.userData = snap.val();
      this.renderStats();
      this.renderMealToggles();
      this.updateMyMealVisibility();
    });

    // Listen to settings for deadlines
    this._settingsRef = db.ref(`dinings/${diningId}/settings`);
    this._settingsRef.on('value', (snap) => {
      this.settings = snap.val() || {};
      this.renderStats();
      this.renderMealToggles();
      this.updateMyMealVisibility();
    });

    const role = Messliner.state.role;
    const isMember = role !== 'admin';

    // Listen to user-specific logs (for meal toggle history & user activity)
    if (this._logsRef) this._logsRef.off();
    this._logsRef = db.ref(`dinings/${diningId}/users/${userId}/logs`).orderByChild('timestamp');
    this._logsRef.on('value', (snap) => {
      this.userLogsData = [];
      snap.forEach(child => {
        const val = child.val();
        if (!val) return;
        if (val.timestamp && typeof val.timestamp === 'object') {
          val.timestamp = Date.now();
        }
        this.userLogsData.push(val);
      });
      this.userLogsData.reverse();
      this._activityDataReady = true;
      this._debouncedRenderActivity(diningId);
    });

    if (!isMember) {
      // Admin: Also listen to all dining logs (sorted newest-first)
      if (this._adminLogsRef) this._adminLogsRef.off();
      this._adminLogsRef = db.ref(`dinings/${diningId}/logs`).orderByChild('timestamp');
      this._adminLogsRef.on('value', (snap) => {
        this.adminLogsData = [];
        snap.forEach(child => {
          const val = child.val();
          if (!val) return;
          if (val.timestamp && typeof val.timestamp === 'object') {
            val.timestamp = Date.now();
          }
          this.adminLogsData.push(val);
        });
        this.adminLogsData.reverse();
        this._activityDataReady = true;
        this._debouncedRenderActivity(diningId);
      });
    }

    // Listen to current-month deposits and meals for this user
    this._listenMonthlyData(diningId, userId);

    // Start countdown timer
    this._startCountdown();
  },

  /**
   * Listen to current month deposit + meal data for this user
   */
  _listenMonthlyData(diningId, userId) {
    const currentMonth = Utils.currentMonth();

    // Clean up previous monthly listeners
    if (this._depositsRef) this._depositsRef.off();
    if (this._bazarRef) this._bazarRef.off();
    if (this._mealsRef) this._mealsRef.off();

    // Deposits this month for this user (and all deposits for recent activity)
    this._depositsRef = db.ref(`dinings/${diningId}/deposits`).orderByChild('userId').equalTo(userId);
    this._depositsRef.on('value', (snap) => {
      this.userDepositsData = [];
      let depositTotal = 0;
      let otherCostTotal = 0;
      let deductionTotal = 0;
      snap.forEach(child => {
        const d = child.val();
        this.userDepositsData.push(d);
        if (Utils.isItemInMonth(d, currentMonth)) {
          const amt = Math.abs(Utils.num(d.amount));
          if (d.type === 'deposit') {
            depositTotal += amt;
          } else if (d.type === 'other_costing') {
            otherCostTotal += amt;
          } else if (d.type === 'deduction' || d.type === 'friday_meal') {
            deductionTotal += amt;
          } else {
            deductionTotal += amt;
          }
        }
      });
      this.monthlyDeposit = depositTotal;
      this.monthlyOtherCosting = otherCostTotal;
      this.monthlyDeduction = deductionTotal;
      this.renderStats();
      this._debouncedRenderActivity(diningId);
    });

    // Bazar this month (total bazar spend)
    this._bazarRef = db.ref(`dinings/${diningId}/bazar`);
    this._bazarRef.on('value', (snap) => {
      let bazarTotal = 0;
      snap.forEach(child => {
        const b = child.val();
        if (Utils.isItemInMonth(b, currentMonth)) {
          bazarTotal += Utils.num(b.amount);
        }
      });
      this.monthlyBazar = bazarTotal;
      this.renderStats();
    });

    // Meals this month for this user
    this._mealsRef = db.ref(`dinings/${diningId}/meals/${currentMonth}`);
    this._mealsRef.on('value', (snap) => {
      const monthData = snap.val() || {};
      this.monthMealsData = monthData;
      let total = 0;
      let breakdown = { breakfast: 0, lunch: 0, dinner: 0 };
      Object.values(monthData).forEach(dayData => {
        Object.entries(dayData).forEach(([type, typeData]) => {
          if (type === 'completed') return;
          if (typeof typeData === 'object' && typeData[userId] !== undefined) {
            const count = parseFloat(typeData[userId]) || 0;
            total += count;
            if (breakdown[type] !== undefined) {
              breakdown[type] += count;
            }
          }
        });
      });
      this.monthlyMeals = total;
      this.monthlyMealsBreakdown = breakdown;
      this.renderStats();
      this.renderMealToggles();
    });
  },

  /**
   * Render dashboard stat cards
   */
  renderStats() {
    const container = document.getElementById('dashboardStats');
    if (!container || !this.userData) return;

    const u = this.userData;
    const rateMode = this.settings?.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings?.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;

    // Calculate meal rate dynamically (supports both Fixed Rate & Market Rate)
    const mealRate = this._getDynamicMealRate();
    if (rateMode === 'market') {
      Messliner.state.monthlyMealRate = mealRate;
      Messliner.state.mealRate = mealRate;
    }

    let fixedRateTooltip = '';
    if (rateMode === 'fixed' && fixedRates) {
      const tm = this.settings?.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      const parts = [];
      if (tm.breakfast !== false && fixedRates.breakfast) parts.push(`Breakfast: ৳${fixedRates.breakfast}`);
      if (tm.lunch !== false && fixedRates.lunch) parts.push(`Lunch: ৳${fixedRates.lunch}`);
      if (tm.dinner !== false && fixedRates.dinner) parts.push(`Dinner: ৳${fixedRates.dinner}`);
      fixedRateTooltip = parts.join(', ');
    }

    const mealCost = Utils.calcMealCost(mealRate, this.monthlyMeals, this.monthlyMealsBreakdown, fixedRates);

    const otherCosting = this.monthlyOtherCosting || 0;
    const deduction = this.monthlyDeduction || 0;
    const totalCost = mealCost + otherCosting;
    const balance = this.monthlyDeposit - totalCost - deduction;

    // Update Topbar User Meta
    const userName = u.name || 'Member';
    Utils.setText('mymealUserName', userName);
    Utils.setText('mymealUserAvatar', Utils.initials(userName));

    // Mess Info
    const diningName = document.getElementById('sidebarDiningName')?.textContent || 'Messliner';
    const diningCode = (this.diningInfo && this.diningInfo.code) || Messliner.state.diningCode || '';
    const messInfoText = diningCode ? `${diningName} · ${diningCode}` : diningName;
    Utils.setText('mymealMessInfo', messInfoText);

    // Notification Badge in mymeal topbar
    const mainNotifBadge = document.getElementById('notifBadge');
    const mymealBadge = document.getElementById('mymealNotifBadge');
    if (mymealBadge) {
      const count = parseInt(mainNotifBadge?.textContent || '0', 10);
      if (mainNotifBadge && mainNotifBadge.style.display !== 'none' && !mainNotifBadge.classList.contains('hidden') && count > 0) {
        mymealBadge.textContent = mainNotifBadge.textContent;
        mymealBadge.style.setProperty('display', 'inline-flex', 'important');
        mymealBadge.classList.remove('hidden');
      } else {
        mymealBadge.textContent = '';
        mymealBadge.style.setProperty('display', 'none', 'important');
        mymealBadge.classList.add('hidden');
      }
    }

    // Update Hero Card Rate & Month
    const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();
    Utils.setText('mymealHeroMonth', currentMonthName);

    // Update Hero Big Number: My Balance
    const isNegativeBalance = balance < 0;
    const formattedBalance = Math.abs(balance).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    Utils.setText('mymealHeroBalance', formattedBalance);

    const heroWrap = document.getElementById('mymealHeroValWrap');
    if (heroWrap) {
      if (isNegativeBalance) {
        heroWrap.classList.add('is-negative');
      } else {
        heroWrap.classList.remove('is-negative');
      }
    }

    const heroCurrEl = document.getElementById('mymealHeroCurrency') || document.querySelector('.mymeal-hero-currency');
    if (heroCurrEl) heroCurrEl.innerHTML = (isNegativeBalance ? '−' : '') + '<span class="tk-symbol"></span>';

    Utils.setText('mymealHeroRatePill', rateMode === 'fixed' ? 'Fixed Rate' : 'Market Rate');

    // Render the 6 Stats inside the unified Hero Shelf (plain text with dividers, no white/block background)
    container.innerHTML = `
      <div class="mymeal-shelf-row">
        <div class="mymeal-shelf-col">
          <div class="mymeal-shelf-label">Deposit</div>
          <div class="mymeal-shelf-val">${Utils.tk(this.monthlyDeposit)}</div>
        </div>
        <div class="mymeal-shelf-divider"></div>
        <div class="mymeal-shelf-col">
          <div class="mymeal-shelf-label">My Meal</div>
          <div class="mymeal-shelf-val-wrap">
            <span class="mymeal-shelf-val">${this.monthlyMeals || 0}</span>
            <span id="fridayMealDashLabel" class="friday-meal-dash-badge" style="display:none;">+ 0 Friday Meal</span>
          </div>
        </div>
        <div class="mymeal-shelf-divider"></div>
        <div class="mymeal-shelf-col">
          <div class="mymeal-shelf-label">Meal Cost</div>
          <div class="mymeal-shelf-val">${Utils.tk(mealCost)}</div>
        </div>
      </div>
      <div class="mymeal-shelf-h-divider"></div>
      <div class="mymeal-shelf-row">
        <div class="mymeal-shelf-col">
          <div class="mymeal-shelf-label">Other Cost</div>
          <div class="mymeal-shelf-val">${Utils.tk(otherCosting)}</div>
        </div>
        <div class="mymeal-shelf-divider"></div>
        <div class="mymeal-shelf-col">
          <div class="mymeal-shelf-label">Deduction</div>
          <div class="mymeal-shelf-val">${Utils.tk(deduction)}</div>
        </div>
        <div class="mymeal-shelf-divider"></div>
        <div class="mymeal-shelf-col mymeal-shelf-rate" onclick="UserDashboard.showMealRateInfoModal()" style="cursor: pointer;" title="Click to view Meal Rate details">
          <div class="mymeal-shelf-label" style="display: inline-flex; align-items: center; gap: 4px;">
            <span>Meal Rate</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A7F3D0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; display: inline-block;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div class="mymeal-shelf-val"><span class="tk-symbol"></span>${(mealRate || 0).toFixed(2)}</div>
        </div>
      </div>
    `;

    // Update Friday Meal label chip asynchronously
    if (window.FridayMealPageModule && FridayMealPageModule._updateUserDashboardLabel) {
      FridayMealPageModule._updateUserDashboardLabel();
    }

    // Check Due Limit lock and render notice
    const dueInfo = this.getDueInfo();
    this.renderDueLimitNotice(dueInfo);
    this.renderMealToggles();

    // If due limit is exceeded, automatically turn OFF all meals in DB if any are currently ON
    if (dueInfo.isLocked) {
      const mealStatus = u.mealStatus || {};
      const hasActiveMeals = ['breakfast', 'lunch', 'dinner'].some(t => {
        const v = mealStatus[t];
        return v === true || (typeof v === 'number' && v > 0);
      });
      if (hasActiveMeals) {
        db.ref(`dinings/${this.diningId}/users/${this.userId}/mealStatus`).set({
          breakfast: 0,
          lunch: 0,
          dinner: 0
        }).then(() => {
          Notifications.log(this.diningId, 'meal_toggled', 'All meals turned OFF automatically due to exceeding Due Limit', this.userId, this.userId);
        }).catch(err => console.error('[DueLock] Auto meal off failed:', err));
      }
    }
  },

  /**
   * Show Meal Rate Info Modal
   */
  showMealRateInfoModal() {
    const rateMode = this.settings?.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings?.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
    const trackedMeals = this.settings?.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    const badgeEl = document.getElementById('rateModalModeBadge');
    const contentEl = document.getElementById('rateModalContent');
    if (!contentEl) return;

    if (rateMode === 'fixed' && fixedRates) {
      if (badgeEl) {
        badgeEl.textContent = 'Fixed Rate';
        badgeEl.style.background = '#ECFDF5';
        badgeEl.style.color = '#059669';
      }

      const bRate = parseFloat(fixedRates.breakfast) || 0;
      const lRate = parseFloat(fixedRates.lunch) || 0;
      const dRate = parseFloat(fixedRates.dinner) || 0;
      const isBActive = trackedMeals.breakfast !== false;
      const isLActive = trackedMeals.lunch !== false;
      const isDActive = trackedMeals.dinner !== false;

      let fullDaily = 0;
      let activeCount = 0;
      if (isBActive) { fullDaily += bRate; activeCount++; }
      if (isLActive) { fullDaily += lRate; activeCount++; }
      if (isDActive) { fullDaily += dRate; activeCount++; }

      const mealCostTemp = Utils.calcMealCost(0, this.monthlyMeals || 0, this.monthlyMealsBreakdown || {}, fixedRates);
      let avgRate = 0;
      if (this.monthlyMeals > 0 && mealCostTemp > 0) {
        avgRate = mealCostTemp / this.monthlyMeals;
      } else if (activeCount > 0) {
        avgRate = fullDaily / activeCount;
      } else {
        avgRate = fullDaily;
      }

      const bMeals = (this.monthlyMealsBreakdown && this.monthlyMealsBreakdown.breakfast) || 0;
      const lMeals = (this.monthlyMealsBreakdown && this.monthlyMealsBreakdown.lunch) || 0;
      const dMeals = (this.monthlyMealsBreakdown && this.monthlyMealsBreakdown.dinner) || 0;

      const activeMealRows = [];
      if (isBActive) {
        activeMealRows.push(`
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: #1E293B;">Breakfast</div>
              <div style="font-size: 0.72rem; color: #64748B;">You took: ${bMeals} meals</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.95rem; font-weight: 700; color: #0F172A;">৳${bRate.toFixed(2)}</div>
            </div>
          </div>
        `);
      }
      if (isLActive) {
        activeMealRows.push(`
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: #1E293B;">Lunch</div>
              <div style="font-size: 0.72rem; color: #64748B;">You took: ${lMeals} meals</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.95rem; font-weight: 700; color: #0F172A;">৳${lRate.toFixed(2)}</div>
            </div>
          </div>
        `);
      }
      if (isDActive) {
        activeMealRows.push(`
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
            <div>
              <div style="font-size: 0.88rem; font-weight: 600; color: #1E293B;">Dinner</div>
              <div style="font-size: 0.72rem; color: #64748B;">You took: ${dMeals} meals</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.95rem; font-weight: 700; color: #0F172A;">৳${dRate.toFixed(2)}</div>
            </div>
          </div>
        `);
      }

      const mealRowsHtml = activeMealRows.length > 0
        ? activeMealRows.map((rowHtml, idx) => {
          if (idx === activeMealRows.length - 1) return rowHtml;
          return rowHtml.replace('padding: 6px 0;', 'padding: 6px 0; border-bottom: 1px dashed #E2E8F0;');
        }).join('')
        : '<div style="font-size: 0.8rem; color: #94A3B8; text-align: center; padding: 10px 0;">No active meal types configured.</div>';

      contentEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <!-- Meal Type Cards Grid -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 14px;">
            <div style="font-size: 0.72rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">Meal Rates by Type</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${mealRowsHtml}
            </div>
          </div>

          <!-- Total Calculation Highlight -->
          <div style="background: linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%); border: 1px solid #A7F3D0; border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.84rem; color: #065F46; font-weight: 600;">Full Day Rate</span>
              <span style="font-size: 1.05rem; font-weight: 800; color: #047857;">৳${fullDaily.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.84rem; color: #065F46; font-weight: 600;">Your Effective Rate</span>
              <span style="font-size: 1.05rem; font-weight: 800; color: #047857;">৳${avgRate.toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Market Rate
      if (badgeEl) {
        badgeEl.textContent = 'Market Rate';
        badgeEl.style.background = '#EFF6FF';
        badgeEl.style.color = '#2563EB';
      }

      let totalDiningMeals = 0;
      if (this.monthMealsData) {
        Object.values(this.monthMealsData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (type === 'completed') return;
            if (typeof typeData === 'object') {
              Object.values(typeData).forEach(count => {
                totalDiningMeals += parseFloat(count) || 0;
              });
            }
          });
        });
      }
      if (!totalDiningMeals && Messliner.state?.monthlyTotalMeals) {
        totalDiningMeals = Messliner.state.monthlyTotalMeals;
      }

      const mRate = this._getDynamicMealRate();

      contentEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <!-- Market Stats Box -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 14px;">
            <div style="font-size: 0.72rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">Calculation Breakdown</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #E2E8F0;">
                <span style="font-size: 0.82rem; color: #475569; font-weight: 500;">Total Mess Bazar</span>
                <span style="font-size: 0.9rem; font-weight: 700; color: #0F172A;">৳${(this.monthlyBazar || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #E2E8F0;">
                <span style="font-size: 0.82rem; color: #475569; font-weight: 500;">Total Mess Meals</span>
                <span style="font-size: 0.9rem; font-weight: 700; color: #0F172A;">${totalDiningMeals || '—'}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0;">
                <span style="font-size: 0.82rem; color: #475569; font-weight: 500;">Formula</span>
                <span style="font-size: 0.74rem; font-weight: 600; background: #EEF2FF; color: #4F46E5; padding: 2px 8px; border-radius: 4px;">Total Bazar ÷ Total Meals</span>
              </div>
            </div>
          </div>

          <!-- Highlight Rate Box -->
          <div style="background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); border: 1px solid #A7F3D0; border-radius: 14px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.82rem; font-weight: 700; color: #065F46; text-transform: uppercase;">Current Meal Rate</span>
              <span style="font-size: 1.25rem; font-weight: 800; color: #047857;">৳${(mRate || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    }

    openModal('userMealRateInfoModal');
  },

  /**
   * Show Due Limit Details Modal
   */
  showDueLimitDetailsModal() {
    const dueInfo = this.getDueInfo();
    const rateMode = this.settings?.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings?.fixedRates || null) : null;
    const mealRate = Messliner.state?.monthlyMealRate || 0;
    const mealCost = Utils.calcMealCost(mealRate, this.monthlyMeals || 0, this.monthlyMealsBreakdown || null, fixedRates);
    const otherCosting = this.monthlyOtherCosting || 0;
    const deduction = this.monthlyDeduction || 0;
    const totalCost = mealCost + otherCosting + deduction;

    Utils.setText('dueModalDueAmount', Utils.currency(dueInfo.due));
    Utils.setText('dueModalDueLimit', Utils.currency(dueInfo.dueLimit));
    Utils.setText('dueModalDeposit', Utils.currency(this.monthlyDeposit || 0));
    Utils.setText('dueModalTotalCost', Utils.currency(totalCost));
    Utils.setText('dueModalBalance', Utils.currency(dueInfo.balance));

    const balanceEl = document.getElementById('dueModalBalance');
    if (balanceEl) {
      balanceEl.style.color = dueInfo.balance >= 0 ? 'var(--accent-600)' : '#DC2626';
    }

    openModal('userDueLimitModal');
  },

  /**
   * Render Due Limit Exceeded Warning Notice on User Dashboard (kept clean/empty as notice is rendered in meal strip)
   */
  renderDueLimitNotice(dueInfo) {
    const container = document.getElementById('userDueLimitNotice');
    if (!container) return;
    container.style.display = 'none';
    container.innerHTML = '';
  },

  /**
   * Render meal toggle cards for today
   */
  renderMealToggles() {
    const grid = document.getElementById('mealTogglesGrid');
    if (!grid || !this.userData) return;
    const u = this.userData;
    const mealStatus = u.mealStatus || { breakfast: true, lunch: true, dinner: true };
    const s = this.settings;
    const autoEnabled = !!s.autoMealEnabled;
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    const controlDate = this.getControlDate();

    const meals = [
      {
        type: 'breakfast',
        label: 'Breakfast',
        desc: 'Morning meal',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                 <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                 <line x1="6" y1="1" x2="6" y2="4" />
                 <line x1="10" y1="1" x2="10" y2="4" />
                 <line x1="14" y1="1" x2="14" y2="4" />
               </svg>`,
        iconClass: 'breakfast',
        deadline: s.breakfastDeadline || '04:00'
      },
      {
        type: 'lunch',
        label: 'Lunch',
        desc: 'Mid-day',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
                 <path d="M15 11v11" />
                 <path d="M5 2v7a3 3 0 0 0 3 3v10" />
                 <path d="M9 2v4" />
               </svg>`,
        iconClass: 'lunch',
        deadline: s.lunchDeadline || '10:00'
      },
      {
        type: 'dinner',
        label: 'Dinner',
        desc: 'Evening',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
               </svg>`,
        iconClass: 'dinner',
        deadline: s.dinnerDeadline || '16:00'
      }
    ].filter(m => trackedMeals[m.type] !== false);

    // Update date display to show which date is currently controlled
    Utils.setText('mealDateDisplay', Utils.formatDate(controlDate));

    // Show/hide completed meals warning cards or Due Limit notice in the same strip
    const warningContainer = document.getElementById('mealCompletedWarningContainer');
    if (warningContainer) {
      warningContainer.innerHTML = '';
      let hasAnyWarning = false;
      let latestWarningHtml = '';

      const dueInfo = this.getDueInfo();

      if (dueInfo.isLocked) {
        hasAnyWarning = true;
        latestWarningHtml = `
          <div class="completed-meals-warning-card due-locked-notice-card" onclick="Messliner.userDashboard.showDueLimitDetailsModal()" title="Click to view due limit breakdown">
            <div class="meal-warning-icon-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="rgba(185, 28, 28, 0.08)"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="meal-warning-text">
              <strong>Due limit exceeded.</strong> Meals are locked until due is cleared.
            </div>
            <div class="due-locked-action-pill">
              <span>View</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
        `;
      } else {
        // Check today and up to 4 days into the future
        const todayStr = Utils.today();
        const [year, month, day] = todayStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);

        for (let i = 0; i < 5; i++) {
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const dayKey = Utils.dayKey(dateStr);

          let completedFlags = {};
          const currentMonth = todayStr.substring(0, 7);
          const checkMonth = dateStr.substring(0, 7);

          if (this.monthMealsData && currentMonth === checkMonth) {
            completedFlags = (this.monthMealsData[dayKey] && this.monthMealsData[dayKey].completed) || {};
          }

          const completedMealsList = [];
          if (completedFlags.breakfast) completedMealsList.push('B');
          if (completedFlags.lunch) completedMealsList.push('L');
          if (completedFlags.dinner) completedMealsList.push('D');

          if (completedMealsList.length > 0) {
            hasAnyWarning = true;

            let mealsLabel = '';
            if (completedMealsList.length === 1) {
              mealsLabel = completedMealsList[0];
            } else if (completedMealsList.length === 2) {
              mealsLabel = `${completedMealsList[0]} & ${completedMealsList[1]}`;
            } else if (completedMealsList.length === 3) {
              mealsLabel = `${completedMealsList[0]}, ${completedMealsList[1]} & ${completedMealsList[2]}`;
            }

            const formattedDate = Utils.formatDate(dateStr);

            // Calculate next date (dateStr + 1 day)
            const nextD = new Date(d);
            nextD.setDate(nextD.getDate() + 1);
            const nextDateStr = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-${String(nextD.getDate()).padStart(2, '0')}`;
            const formattedNextDate = Utils.formatDate(nextDateStr);

            const mealsLabelWithSpace = mealsLabel ? ` ${mealsLabel}` : '';

            latestWarningHtml = `
              <div class="completed-meals-warning-card">
                <div class="meal-warning-icon-box">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="rgba(185, 28, 28, 0.08)"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div class="meal-warning-text">
                  <strong>${formattedDate}${mealsLabelWithSpace}</strong> meal has already been added. You may turn the next meal on or off from <strong>${formattedNextDate}</strong>.
                </div>
              </div>
            `;
          }

          d.setDate(d.getDate() + 1);
        }
      }

      if (latestWarningHtml) {
        warningContainer.innerHTML = latestWarningHtml;
      }
      warningContainer.style.display = hasAnyWarning ? 'block' : 'none';
    }

    const isDueLocked = this.isDueLocked();
    grid.className = `meal-toggles-grid meals-count-${meals.length}`;

    grid.innerHTML = meals.map(meal => {
      const mealControlDate = this.getMealControlDate(meal.type);
      const isLocked = isDueLocked || this.isMealLocked(meal.type, mealControlDate);

      const val = mealStatus[meal.type];
      let mealCount = 1;
      if (val === false) {
        mealCount = 0;
      } else if (typeof val === 'number') {
        mealCount = val;
      }

      const isOn = mealCount > 0;
      const cardClass = (isLocked ? 'locked ' : '') + (isOn ? 'on' : 'off');

      let badgeText = '';
      let badgeClass = '';
      if (isLocked) {
        if (isDueLocked) {
          badgeText = `
            <span style="display:inline-flex; align-items:center; gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              OFF & Locked
            </span>
          `;
          badgeClass = 'locked due-locked';
        } else {
          badgeText = isOn ? 'ON & Locked' : 'OFF & Locked';
          badgeClass = isOn ? 'locked on' : 'locked off';
        }
      } else {
        badgeText = isOn ? 'ON' : 'OFF';
        badgeClass = isOn ? 'on' : 'off';
      }

      const subtitleIcon = isDueLocked
        ? `<svg class="error-alert-icon" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; min-width:12px; min-height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color: #DC2626; flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        : (isLocked
          ? `<svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px; height:12px; min-width:12px; min-height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color: var(--text-tertiary); flex-shrink: 0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`
          : `<svg class="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; min-width:12px; min-height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color: var(--text-tertiary); flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`);

      const subtitleText = isDueLocked
        ? `<span style="color: #DC2626; font-weight: 600;">Due limit exceeded (Locked)</span>`
        : (isLocked ? 'Deadline was ' : 'Cutoff: ') + Utils.formatTime(meal.deadline);

      return `
        <div class="meal-toggle-card ${cardClass} ${isDueLocked ? 'due-locked' : ''}">
          <div class="meal-toggle-info">
            <div class="meal-toggle-icon ${meal.iconClass}" style="${isDueLocked ? 'position: relative;' : ''}">
              ${meal.icon}
              ${isDueLocked ? `
                <div style="position: absolute; top: -3px; right: -3px; width: 14px; height: 14px; background: #DC2626; border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff;">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
              ` : ''}
            </div>
            <div class="meal-toggle-text">
              <div class="meal-title-row" style="display:flex; align-items:center; gap:8px; flex-wrap:nowrap;">
                <h4 class="meal-toggle-title" style="margin:0; font-size:1rem; font-weight:600; line-height:1.2; white-space: nowrap; color: #1e293b;">${meal.label}</h4>
                <span class="meal-status-badge ${badgeClass}" style="white-space: nowrap; flex-shrink:0; ${isDueLocked ? 'background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5;' : ''}">
                  ${badgeText}
                </span>
              </div>
              <div class="meal-cutoff-subtitle" style="font-size: var(--font-xs); color: var(--text-tertiary); margin-top: 3px; display: inline-flex; align-items: center; white-space: nowrap; gap: 4px;">
                ${subtitleIcon}
                <span style="white-space: nowrap;">${subtitleText}</span>
              </div>
            </div>
          </div>
          <div class="quantity-selector ${isLocked ? 'disabled' : ''}" style="${isDueLocked ? 'background: #FEF2F2; border-color: #FECACA;' : ''}">
            <button class="qty-btn qty-minus" type="button" 
                    ${isLocked || mealCount <= 0 ? 'disabled' : ''} 
                    onclick="Messliner.userDashboard.adjustMealCount('${meal.type}', -1)">-</button>
            <span class="qty-val" style="${isDueLocked ? 'color: #DC2626; font-weight: 700;' : ''}">${mealCount}</span>
            <button class="qty-btn qty-plus" type="button" 
                    ${isLocked || mealCount >= 4 ? 'disabled' : ''} 
                    onclick="Messliner.userDashboard.adjustMealCount('${meal.type}', 1)">+</button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Adjust meal count (plus/minus)
   */
  async adjustMealCount(mealType, delta) {
    try {
      if (this.isDueLocked()) {
        const dueLimit = parseFloat(this.settings?.dueLimit) || 0;
        Notifications.toast('error', 'Due Limit Exceeded', `Your outstanding due exceeds the limit (৳${dueLimit}). Meals are locked until due is cleared.`);
        return;
      }

      const mealControlDate = this.getMealControlDate(mealType);
      if (this.isMealLocked(mealType, mealControlDate)) {
        Notifications.toast('error', 'Meal Locked', 'The cutoff deadline for this meal has passed.');
        return;
      }

      const u = this.userData;
      const mealStatus = u.mealStatus || { breakfast: true, lunch: true, dinner: true };
      const currentVal = mealStatus[mealType];

      let currentCount = 1;
      if (currentVal === false) {
        currentCount = 0;
      } else if (typeof currentVal === 'number') {
        currentCount = currentVal;
      }

      const newCount = Math.min(4, Math.max(0, currentCount + delta));
      if (newCount === currentCount) return;

      // Update database
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/mealStatus/${mealType}`).set(newCount);

      const label = mealType.charAt(0).toUpperCase() + mealType.slice(1);

      let toastType = 'success';
      let toastTitle = '';
      let toastDesc = '';
      let logMsg = '';

      if (newCount === 0) {
        toastType = 'error';
        toastTitle = `${label} OFF`;
        toastDesc = `Your ${label.toLowerCase()} has been turned off.`;
        logMsg = `${label} OFF`;
      } else if (newCount === 1 && currentCount === 0) {
        toastTitle = `${label} ON`;
        toastDesc = `Your ${label.toLowerCase()} has been turned on.`;
        logMsg = `${label} ON`;
      } else {
        toastTitle = `${label} Updated`;
        toastDesc = `Your ${label.toLowerCase()} count has been set to ${newCount}.`;
        logMsg = `${label} count updated to ${newCount}`;
      }

      Notifications.toast(toastType, toastTitle, toastDesc);
      await Notifications.log(this.diningId, 'meal_toggled', logMsg, this.userId, this.userId);
    } catch (error) {
      console.error('Adjust meal count error:', error);
      Notifications.toast('error', 'Error', 'Failed to update meal status.');
    }
  },

  /**
   * Render admin quick actions
   */
  renderAdminQuickActions() {
    const grid = document.getElementById('quickActionsGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="quick-action-card qa-member" onclick="Messliner.router.navigate('users')" title="Add or manage members">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Add Member</span>
        </div>
      </div>

      <div class="quick-action-card qa-meals" onclick="Messliner.router.navigate('meals')" title="Record daily meals">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/>
              <line x1="10" y1="1" x2="10" y2="4"/>
              <line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Add Meals</span>
        </div>
      </div>

      <div class="quick-action-card qa-deposit" onclick="Messliner.finance.showDepositModal()" title="Record member deposit">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
              <circle cx="16" cy="14" r="1.5" fill="currentColor"/>
              <path d="M6 14h4"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Add Deposit</span>
        </div>
      </div>

      <div class="quick-action-card qa-costing" onclick="Messliner.finance.showOtherCostingModal()" title="Add extra expenses & bills">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
              <line x1="8" y1="8" x2="16" y2="8"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="8" y1="16" x2="12" y2="16"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Other Costing</span>
        </div>
      </div>

      <div class="quick-action-card qa-bazar" onclick="Messliner.finance.showBazarModal()" title="Record bazar shopping cost">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Add Bazar</span>
        </div>
      </div>

      <div class="quick-action-card qa-finance" onclick="Messliner.finance.showFinanceFixModal()" title="Finance settlement & audit">
        <div class="quick-action-icon-wrap">
          <div class="quick-action-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6"/>
              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
            </svg>
          </div>
        </div>
        <div class="quick-action-info">
          <span class="quick-action-title">Finance Fix</span>
        </div>
      </div>
    `;
  },

  /**
   * Normalize old verbose meal log details into short clean format.
   * Handles legacy Firebase records that were written in old format.
   */
  _normalizeMealDetail(detail) {
    if (!detail) return '';

    // Old format: "Dinner meal updated from 1 to 2 on Jul 9, 2026"
    const updatedMatch = detail.match(/^(\w+) meal updated from (\d+) to (\d+) on .+$/i);
    if (updatedMatch) {
      const type = updatedMatch[1].charAt(0).toUpperCase() + updatedMatch[1].slice(1).toLowerCase();
      const newCount = parseInt(updatedMatch[3]);
      if (newCount === 0) return `${type} OFF`;
      if (newCount === 1) return `${type} ON`;
      return `${type} ON (+${newCount - 1})`;
    }

    // Old format: "Dinner meal turned ON" / "Breakfast meal turned OFF"
    const toggledMatch = detail.match(/^(\w+) meal turned (ON|OFF)$/i);
    if (toggledMatch) {
      const type = toggledMatch[1].charAt(0).toUpperCase() + toggledMatch[1].slice(1).toLowerCase();
      return `${type} ${toggledMatch[2].toUpperCase()}`;
    }

    // Old format: "dinner meals updated for 2026-07-09"
    const bulkMatch = detail.match(/^(\w+) meals? updated for .+$/i);
    if (bulkMatch) {
      const type = bulkMatch[1].charAt(0).toUpperCase() + bulkMatch[1].slice(1).toLowerCase();
      return `${type} updated`;
    }

    // New format: "Breakfast count updated to 2" -> "Breakfast ON (+1)"
    const countMatch = detail.match(/^(\w+) count updated to (\d+)$/i);
    if (countMatch) {
      const type = countMatch[1].charAt(0).toUpperCase() + countMatch[1].slice(1).toLowerCase();
      const newCount = parseInt(countMatch[2], 10);
      return `${type} ON (+${newCount - 1})`;
    }

    // Already in new format — return as-is
    return detail;
  },

  /**
   * Group meal logs by batchId (one activity card per save operation).
   * Logs without a batchId are shown as individual entries (legacy support).
   */
  _groupMealLogs(logs) {
    const finalLogs = [];
    const batchGroups = {}; // batchId -> [logs]

    const role = Messliner.state.role;
    const isAdmin = role === 'admin';

    logs.forEach(log => {
      if (log.action === 'meal_updated' || log.action === 'meals_updated') {
        const ts = (typeof log.timestamp === 'number') ? log.timestamp : Date.now();
        const sanitizedLog = { ...log, timestamp: ts };

        if (log.batchId) {
          // Group by batchId — every entry from the same save shares a batchId
          if (!batchGroups[log.batchId]) {
            batchGroups[log.batchId] = [];
          }
          batchGroups[log.batchId].push(sanitizedLog);
        } else {
          // Legacy log without batchId — show as its own entry
          finalLogs.push({
            action: 'meals_updated_group',
            details: `• ${this._normalizeMealDetail(sanitizedLog.details)}`,
            timestamp: ts,
            performedBy: sanitizedLog.performedBy
          });
        }
      } else {
        const ts = (typeof log.timestamp === 'number') ? log.timestamp : Date.now();
        finalLogs.push({ ...log, timestamp: ts });
      }
    });

    // Build one activity card per batchId
    Object.values(batchGroups).forEach(items => {
      // Use the earliest timestamp in the batch as the card's timestamp
      // (first log written is most accurate; items may arrive in any order from Firebase)
      items.sort((a, b) => a.timestamp - b.timestamp);
      const batchTimestamp = items[0].timestamp;

      let combinedDetails = '';
      if (isAdmin) {
        // Admin view: show "MemberName: 1 Breakfast added" per user per meal type
        // Deduplicate by (mealType + targetUserId) in case of duplicates
        const seenKeys = new Set();
        const deduped = items.filter(it => {
          const normalized = this._normalizeMealDetail(it.details);
          const mealType = this._extractMealType(normalized || it.details || '');
          const targetId = it.targetUserId || '';
          const key = (mealType || normalized) + '_' + targetId;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        combinedDetails = deduped
          .map(it => {
            const userName = it.targetUserId ? (UsersModule.users?.[it.targetUserId]?.name || 'Member') : '';
            const prefix = userName ? `${userName}: ` : '';
            return `• ${prefix}${this._normalizeMealDetail(it.details)}`;
          })
          .join('<br>');
      } else {
        // Member view: show one line per meal type (e.g., "• 1 Breakfast added")
        // Deduplicate by meal type in case the same type was logged more than once
        const seenTypes = new Set();
        const deduped = items.filter(it => {
          const normalized = this._normalizeMealDetail(it.details);
          const mealType = this._extractMealType(normalized || it.details || '');
          const key = mealType || normalized;
          if (seenTypes.has(key)) return false;
          seenTypes.add(key);
          return true;
        });

        combinedDetails = deduped
          .map(it => `• ${this._normalizeMealDetail(it.details)}`)
          .join('<br>');
      }

      finalLogs.push({
        action: 'meals_updated_group',
        details: combinedDetails,
        timestamp: batchTimestamp,
        performedBy: items[0].performedBy
      });
    });

    finalLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return finalLogs;
  },


  /**
   * Extract meal type (Breakfast / Lunch / Dinner) from a detail string
   */
  _extractMealType(detail) {
    const types = ['Breakfast', 'Lunch', 'Dinner'];
    for (const t of types) {
      if (detail.toLowerCase().includes(t.toLowerCase())) return t;
    }
    return null;
  },

  /**
   * Debounced wrapper for renderRecentActivity.
   * Firebase on('value') can fire multiple times rapidly for a single atomic write
   * (local optimistic update + server confirmation). Debouncing ensures we only
   * render once the data has fully settled, preventing the "appears separate then
   * merges" flicker in the activity feed.
   */
  _debouncedRenderActivity(diningId) {
    if (this._activityRenderTimer) {
      clearTimeout(this._activityRenderTimer);
    }
    this._activityRenderTimer = setTimeout(() => {
      this._activityRenderTimer = null;
      this.renderRecentActivity(diningId);
      this.renderMealToggleHistory();
    }, 350);
  },

  renderRecentActivity(diningId) {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    // If Firebase hasn't delivered data yet, show a loading skeleton instead
    // of the empty state — prevents the jarring "No Recent Activity" flash on refresh
    if (!this._activityDataReady) {
      container.innerHTML = `
        <div class="activity-skeleton" style="padding:var(--space-4);">
          <div class="skeleton-line" style="width:60%;height:14px;border-radius:6px;background:var(--gray-100);margin-bottom:12px;animation:pulse 1.4s ease-in-out infinite;"></div>
          <div class="skeleton-line" style="width:80%;height:10px;border-radius:6px;background:var(--gray-100);margin-bottom:8px;animation:pulse 1.4s ease-in-out infinite 0.1s;"></div>
          <div class="skeleton-line" style="width:50%;height:10px;border-radius:6px;background:var(--gray-100);margin-bottom:20px;animation:pulse 1.4s ease-in-out infinite 0.2s;"></div>
          <div class="skeleton-line" style="width:70%;height:14px;border-radius:6px;background:var(--gray-100);margin-bottom:12px;animation:pulse 1.4s ease-in-out infinite 0.3s;"></div>
          <div class="skeleton-line" style="width:85%;height:10px;border-radius:6px;background:var(--gray-100);animation:pulse 1.4s ease-in-out infinite 0.4s;"></div>
        </div>
      `;
      return;
    }

    const role = Messliner.state.role;
    const isMember = role !== 'admin';

    if (isMember) {
      const combined = [];

      // Format user logs (only user-specific activities, filtering out duplicates and external join/add events)
      const userLogs = this.userLogsData || [];
      userLogs.forEach(l => {
        if (l.action === 'user_updated' || l.action === 'security_updated' || l.action === 'meal_toggled' || l.action === 'meal_updated') {
          combined.push({
            action: l.action,
            details: l.details,
            timestamp: l.timestamp,
            performedBy: l.performedBy,
            isSingle: l.isSingle,
            batchId: l.batchId   // required for grouping same-save entries into one activity card
          });
        }
      });

      // Format user deposits/deductions
      const userDeposits = this.userDepositsData || [];
      userDeposits.forEach(d => {
        const isDeposit = d.type === 'deposit';
        const isOtherCosting = d.type === 'other_costing';
        combined.push({
          action: isDeposit ? 'deposit_added' : (isOtherCosting ? 'other_costing_added' : 'deduction_added'),
          details: isDeposit
            ? `Deposit ৳${d.amount} (${d.note || 'Regular Deposit'})`
            : (isOtherCosting
              ? `Deducted ৳${Math.abs(d.amount)} for Other Costing: ${d.note || 'No description'}`
              : `Deducted ৳${Math.abs(d.amount)}: ${d.note || 'No reason specified'}`),
          timestamp: d.timestamp || (d.date ? new Date(d.date).getTime() : 0),
          performedBy: 'manager'
        });
      });

      // --- Split: toggle logs go to separate section ---
      const toggleLogs = combined
        .filter(l => l.action === 'meal_toggled')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const nonToggleLogs = combined.filter(l => l.action !== 'meal_toggled');

      // Group meal add/update logs by calendar day
      const groupedLogs = this._groupMealLogs(nonToggleLogs);
      const displayLogs = groupedLogs.slice(0, 10);

      // ---- Render Recent Activity (meals + deposits) ----
      if (displayLogs.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-6);">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3>No Recent Activity</h3>
            <p>Activities will show up here as they happen.</p>
          </div>
        `;
      } else {
        let html = displayLogs.map(log => {
          const dotClass = log.action?.includes('deposit') ? 'accent'
            : log.action?.includes('deduction') ? 'danger'
              : log.action?.includes('other_costing') ? 'danger'
                : log.action?.includes('meal') ? 'warning'
                  : log.action?.includes('bazar') ? ''
                    : log.action?.includes('delete') ? 'danger'
                      : '';

          let title;
          if (log.action === 'meals_updated_group') title = 'Meals';
          else if (log.action === 'deposit_added') title = 'Deposit Added';
          else if (log.action === 'deduction_added') title = 'Deduction';
          else if (log.action === 'other_costing_added') title = 'Deduction : Other Costing';
          else if (log.action === 'bazar_added') title = 'Bazar Added';
          else title = log.action?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Activity';

          return `
            <div class="timeline-item">
              <div class="timeline-dot ${dotClass}"></div>
              <div class="timeline-content">
                <div class="timeline-date">${Utils.timeAgo(log.timestamp)}</div>
                <div class="timeline-title">${title}</div>
                ${log.details ? `<div class="timeline-desc">${log.details}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');

        html += this._setupTimelineCollapse(container, displayLogs.length);
        container.innerHTML = html;
      }

      this.renderMealToggleHistory();
    } else {
      this.renderMealToggleHistory();

      const logs = this.adminLogsData || [];
      const groupedLogs = this._groupMealLogs(logs);
      const displayLogs = groupedLogs.slice(0, 10);

      if (displayLogs.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-6);">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3>No Recent Activity</h3>
            <p>Activities will show up here as they happen.</p>
          </div>
        `;
        // reset flag so next init cycle shows skeleton again
        return;
      }

      let html = displayLogs.map(log => {
        const dotClass = log.action?.includes('deposit') ? 'accent'
          : log.action?.includes('deduction') ? 'danger'
            : log.action?.includes('meal') ? 'warning'
              : log.action?.includes('bazar') ? ''
                : log.action?.includes('delete') ? 'danger'
                  : '';

        let title;
        if (log.action === 'meals_updated_group') {
          title = 'Meals';
        } else if (log.action === 'deposit_added') {
          title = 'Deposit Added';
        } else if (log.action === 'deduction_added') {
          title = 'Deduction';
        } else if (log.action === 'bazar_added') {
          title = 'Bazar Added';
        } else if (log.action === 'meal_toggled') {
          title = 'Meal Status';
        } else {
          title = log.action?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Activity';
        }

        let desc = log.details || '';
        if (log.targetUserId && log.action !== 'meals_updated_group') {
          const userName = UsersModule.users?.[log.targetUserId]?.name || 'Member';
          if (desc && !desc.includes(userName)) {
            desc = `${userName}: ${desc}`;
          }
        }

        return `
          <div class="timeline-item">
            <div class="timeline-dot ${dotClass}"></div>
            <div class="timeline-content">
              <div class="timeline-date">${Utils.timeAgo(log.timestamp)}</div>
              <div class="timeline-title">${title}</div>
              ${desc ? `<div class="timeline-desc">${desc}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      html += this._setupTimelineCollapse(container, displayLogs.length);
      container.innerHTML = html;
    }
  },

  /**
   * Render Meal Toggle History section (for both member and admin on My Meal / Dashboard)
   */
  renderMealToggleHistory() {
    const toggleContainer = document.getElementById('mealToggleHistory');
    const toggleSection = document.getElementById('mealToggleSection');
    if (!toggleContainer) return;

    if (toggleSection) toggleSection.style.display = 'block';

    const userLogs = this.userLogsData || [];
    const adminLogs = (this.adminLogsData || []).filter(l =>
      (l.action === 'meal_toggled' || l.action === 'meal_updated') &&
      (l.targetUserId === this.userId || l.performedBy === this.userId)
    );

    // Primary source is userLogsData; use adminLogs as fallback if userLogsData is empty
    const rawLogs = (userLogs.length > 0) ? userLogs : adminLogs;

    // Filter meal toggle actions and deduplicate using a 5-second window key
    const toggleLogs = [];
    const seenMap = new Map();

    rawLogs.forEach(log => {
      if (log.action === 'meal_toggled') {
        const detail = this._normalizeMealDetail(log.details || '');
        // Group timestamps within 5 seconds of each other for identical details
        const timeKey = Math.round((log.timestamp || 0) / 5000);
        const key = `${detail}_${timeKey}`;
        if (!seenMap.has(key)) {
          seenMap.set(key, true);
          toggleLogs.push(log);
        }
      }
    });

    toggleLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Also update the modal content if it's initialized
    this.renderMealHistoryModalContent();

    if (toggleLogs.length === 0) {
      toggleContainer.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3>No Toggle History</h3>
          <p>Your meal on/off history will appear here.</p>
        </div>
      `;
    } else {
      let html = toggleLogs.map(log => {
        const detail = this._normalizeMealDetail(log.details || '');
        const isOn = !(
          detail.toUpperCase().includes(' OFF') ||
          detail.toUpperCase().includes(' REMOVED') ||
          detail.toUpperCase().includes(' TO 0') ||
          (log.details || '').toUpperCase().includes(' OFF') ||
          (log.details || '').toUpperCase().includes(' REMOVED') ||
          (log.details || '').toUpperCase().includes(' TO 0')
        );
        const mealType = this._extractMealType(detail || log.details || '') || 'Meal';

        // Parse meal count
        let count = 1;
        if (!isOn) {
          count = 0;
        } else {
          const plusMatch = detail.match(/ON\s*\(\+(\d+)\)/i);
          if (plusMatch) {
            count = parseInt(plusMatch[1], 10) + 1;
          } else {
            const match = detail.match(/ON\s*\((\d+)\)/i) ||
              (log.details || '').match(/(?:updated to|set to|ON\s*\(|count\s+is\s+)(\d+)/i) ||
              detail.match(/^(\d+)\s+/);
            if (match) {
              count = parseInt(match[1], 10);
            } else {
              const legacyMatch = (log.details || '').match(/updated from \d+ to (\d+)/i);
              if (legacyMatch) {
                count = parseInt(legacyMatch[1], 10);
              }
            }
          }
        }

        // Format full date + time
        const ts = log.timestamp;
        let dateTimeStr = '';
        if (ts && typeof ts === 'number') {
          const d = new Date(ts);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          dateTimeStr = `${dateStr} · ${timeStr}`;
        }

        const pillColor = isOn
          ? 'background:var(--primary-100);color:var(--primary-700);border:1px solid var(--primary-200);'
          : 'background:#FEE2E2;color:#B91C1C;border:1px solid #FECACA;';

        const iconPath = isOn
          ? '<path d="M5 12l5 5L20 7"/>'
          : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

        const pillText = count > 1 ? `ON (+${count - 1})` : (isOn ? 'ON' : 'OFF');

        return `
          <div class="meal-toggle-history-item">
            <div class="mth-icon-wrap" style="${isOn ? 'background:var(--primary-50);color:var(--primary-600);' : 'background:#FEF2F2;color:#DC2626;'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
            </div>
            <div class="mth-info">
              <div class="mth-meal-type">${mealType}</div>
              <div class="mth-datetime">${dateTimeStr}</div>
            </div>
            <span class="mth-pill" style="${pillColor}">${pillText}</span>
          </div>
        `;
      }).join('');

      html += this._setupToggleHistoryCollapse(toggleContainer, toggleLogs.length);
      toggleContainer.innerHTML = html;
    }
  },

  getMealHistoryMaxMonth() {
    return Utils.currentMonth();
  },

  getMealHistoryMinMonth() {
    const candidates = [];
    if (this.userData?.createdAt) candidates.push(new Date(this.userData.createdAt));
    if (this.userData?.joinedAt) candidates.push(new Date(this.userData.joinedAt));
    if (Messliner.state?.userJoinedAt) candidates.push(new Date(Messliner.state.userJoinedAt));
    if (this.diningInfo?.createdAt) candidates.push(new Date(this.diningInfo.createdAt));
    if (this.diningInfo?.startDate) candidates.push(new Date(this.diningInfo.startDate));
    if (this.createdDate) candidates.push(new Date(this.createdDate));

    if (this.userLogsData && this.userLogsData.length > 0) {
      this.userLogsData.forEach(l => {
        if (l.timestamp && typeof l.timestamp === 'number') {
          candidates.push(new Date(l.timestamp));
        }
      });
    }

    if (candidates.length > 0) {
      const validDates = candidates.filter(d => !isNaN(d.getTime()));
      if (validDates.length > 0) {
        const earliest = new Date(Math.min(...validDates.map(d => d.getTime())));
        return `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    return '2024-01';
  },

  /**
   * Navigate to User Meal History Page
   */
  openMealHistoryModal() {
    const maxMonth = this.getMealHistoryMaxMonth();
    if (!this._selectedHistoryMonth || this._selectedHistoryMonth > maxMonth) {
      this._selectedHistoryMonth = maxMonth;
    }
    if (Messliner.router) {
      Messliner.router.navigate('mealhistory');
    }
    this.renderMealHistoryModalContent();
  },

  /**
   * Change selected month in Meal History (delta: +1 or -1)
   */
  changeMealHistoryMonth(delta) {
    const maxMonth = this.getMealHistoryMaxMonth();
    const minMonth = this.getMealHistoryMinMonth();

    if (!this._selectedHistoryMonth || this._selectedHistoryMonth > maxMonth) {
      this._selectedHistoryMonth = maxMonth;
    }

    const [year, month] = this._selectedHistoryMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    const newMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Prevent navigation to future months
    if (delta > 0 && newMonthStr > maxMonth) {
      return;
    }
    // Prevent navigation prior to minimum month
    if (delta < 0 && newMonthStr < minMonth) {
      return;
    }

    this._selectedHistoryMonth = newMonthStr;
    this.renderMealHistoryModalContent();
  },

  /**
   * Render logs inside Meal History page for this._selectedHistoryMonth
   */
  renderMealHistoryModalContent() {
    const container = document.getElementById('userMealHistoryLogsContainer');
    const labelEl = document.getElementById('mhCurrentMonthLabel');
    const maxMonth = this.getMealHistoryMaxMonth();
    const minMonth = this.getMealHistoryMinMonth();

    if (!this._selectedHistoryMonth || this._selectedHistoryMonth > maxMonth) {
      this._selectedHistoryMonth = maxMonth;
    }

    const [year, month] = this._selectedHistoryMonth.split('-').map(Number);
    const monthDate = new Date(year, month - 1, 1);
    const monthFormatted = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (labelEl) {
      labelEl.textContent = monthFormatted;
    }

    // Update Next and Prev button enabled/disabled states
    const isAtMax = this._selectedHistoryMonth >= maxMonth;
    const isAtMin = this._selectedHistoryMonth <= minMonth;
    const prevBtn = document.getElementById('mhPrevMonthBtn');
    const nextBtn = document.getElementById('mhNextMonthBtn');

    if (nextBtn) {
      nextBtn.disabled = isAtMax;
      nextBtn.style.opacity = isAtMax ? '0.3' : '1';
      nextBtn.style.cursor = isAtMax ? 'not-allowed' : 'pointer';
      nextBtn.style.pointerEvents = isAtMax ? 'none' : 'auto';
    }

    if (prevBtn) {
      prevBtn.disabled = isAtMin;
      prevBtn.style.opacity = isAtMin ? '0.3' : '1';
      prevBtn.style.cursor = isAtMin ? 'not-allowed' : 'pointer';
      prevBtn.style.pointerEvents = isAtMin ? 'none' : 'auto';
    }

    if (!container) return;

    const userLogs = this.userLogsData || [];
    const adminLogs = (this.adminLogsData || []).filter(l =>
      (l.action === 'meal_toggled' || l.action === 'meal_updated') &&
      (l.targetUserId === this.userId || l.performedBy === this.userId)
    );

    const rawLogs = (userLogs.length > 0) ? userLogs : adminLogs;

    // Filter toggle logs
    const toggleLogs = [];
    const seenMap = new Map();

    rawLogs.forEach(log => {
      if (log.action === 'meal_toggled' || log.action === 'meal_updated') {
        const detail = this._normalizeMealDetail(log.details || '');
        const timeKey = Math.round((log.timestamp || 0) / 5000);
        const key = `${detail}_${timeKey}`;
        if (!seenMap.has(key)) {
          seenMap.set(key, true);
          toggleLogs.push(log);
        }
      }
    });

    // Filter by selected month
    const targetMonth = this._selectedHistoryMonth;
    const monthlyLogs = toggleLogs.filter(log => {
      if (!log.timestamp) return false;
      const d = new Date(log.timestamp);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return mStr === targetMonth;
    });

    monthlyLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (monthlyLogs.length === 0) {
      container.innerHTML = `
        <div class="mh-empty-state">
          <div class="mh-empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h4 class="mh-empty-title">No Toggle History</h4>
          <p class="mh-empty-desc">No meal on/off activity recorded in ${monthFormatted}.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = monthlyLogs.map(log => {
      const detail = this._normalizeMealDetail(log.details || '');
      const isOn = !(
        detail.toUpperCase().includes(' OFF') ||
        detail.toUpperCase().includes(' REMOVED') ||
        detail.toUpperCase().includes(' TO 0') ||
        (log.details || '').toUpperCase().includes(' OFF') ||
        (log.details || '').toUpperCase().includes(' REMOVED') ||
        (log.details || '').toUpperCase().includes(' TO 0')
      );
      const mealType = this._extractMealType(detail || log.details || '') || 'Meal';

      let count = 1;
      if (!isOn) {
        count = 0;
      } else {
        const plusMatch = detail.match(/ON\s*\(\+(\d+)\)/i);
        if (plusMatch) {
          count = parseInt(plusMatch[1], 10) + 1;
        } else {
          const match = detail.match(/ON\s*\((\d+)\)/i) ||
            (log.details || '').match(/(?:updated to|set to|ON\s*\(|count\s+is\s+)(\d+)/i) ||
            detail.match(/^(\d+)\s+/);
          if (match) {
            count = parseInt(match[1], 10);
          } else {
            const legacyMatch = (log.details || '').match(/updated from \d+ to (\d+)/i);
            if (legacyMatch) count = parseInt(legacyMatch[1], 10);
          }
        }
      }

      const ts = log.timestamp;
      let dateTimeStr = '';
      if (ts && typeof ts === 'number') {
        const d = new Date(ts);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        dateTimeStr = `${dateStr} · ${timeStr}`;
      }

      const iconSvg = isOn
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

      const pillText = count > 1 ? `ON (+${count - 1})` : (isOn ? 'ON' : 'OFF');

      return `
        <div class="mh-log-item ${isOn ? 'item-on' : 'item-off'}">
          <div class="mh-log-icon-box ${isOn ? 'icon-on' : 'icon-off'}">
            ${iconSvg}
          </div>
          <div class="mh-log-info">
            <div class="mh-log-title-row">
              <span class="mh-log-meal-title">${mealType}</span>
              <span class="mh-log-badge ${isOn ? 'badge-on' : 'badge-off'}">${pillText}</span>
            </div>
            <div class="mh-log-time">${dateTimeStr}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  openNoticeBoardModal() {
    if (Messliner.router) {
      Messliner.router.navigate('notices');
    }
  },

  openBazarRosterModal() {
    if (Messliner.router) {
      Messliner.router.navigate('bazarroster');
    }
  },

  openTasksModal() {
    if (Messliner.router) {
      Messliner.router.navigate('tasks');
    }
  },

  /* ============================================================ */
  /* BAZAR ROSTER SUBPAGE IMPLEMENTATION                          */
  /* ============================================================ */
  _activeBazarRosterTab: 'schedule',
  _bazarRosterListening: false,
  _bazarRosterData: null,

  switchBazarRosterTab(tab) {
    this._activeBazarRosterTab = tab;
    const tabSched = document.getElementById('brTabSchedule');
    const tabSwipe = document.getElementById('brTabSwipe');
    const secSched = document.getElementById('brScheduleViewSection');
    const secSwipe = document.getElementById('brSwipeViewSection');

    if (tabSched) tabSched.classList.toggle('active', tab === 'schedule');
    if (tabSwipe) tabSwipe.classList.toggle('active', tab === 'swipe');
    if (secSched) secSched.style.display = tab === 'schedule' ? 'block' : 'none';
    if (secSwipe) secSwipe.style.display = tab === 'swipe' ? 'block' : 'none';

    if (tab === 'swipe') {
      this.renderBazarSwipeView();
    } else {
      this._renderBazarRosterList();
    }
  },

  renderBazarRosterPage() {
    const container = document.getElementById('brRosterListContainer');
    if (!container) return;

    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    if (!diningId) return;

    if (!this._activeBazarRosterTab) this._activeBazarRosterTab = 'schedule';
    this.switchBazarRosterTab(this._activeBazarRosterTab);

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Always fetch latest data and attach realtime listeners
    if (this._bazarRosterListeningDiningId !== diningId) {
      this._bazarRosterListeningDiningId = diningId;

      if (!this._bazarRosterData) this._bazarRosterData = {};

      db.ref(`dinings/${diningId}/bazarSchedule/${currentYearMonth}`).on('value', snap => {
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.schedule = snap.val() || {};
        this._renderBazarRosterList();
        if (this._activeBazarRosterTab === 'swipe') {
          this.renderBazarSwipeView();
        }
      });

      db.ref(`dinings/${diningId}/bazarSchedule/weeklyRoutine`).on('value', snap => {
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.weekly = snap.val() || {};
        this._renderBazarRosterList();
        if (this._activeBazarRosterTab === 'swipe') {
          this.renderBazarSwipeView();
        }
      });

      db.ref(`dinings/${diningId}/users`).on('value', snap => {
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.users = snap.val() || {};
        this._renderBazarRosterList();
        if (this._activeBazarRosterTab === 'swipe') {
          this.renderBazarSwipeView();
        }
      });

      db.ref(`dinings/${diningId}/bazar`).on('value', snap => {
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.bazar = snap.val() || {};
        this._renderBazarRosterList();
        if (this._activeBazarRosterTab === 'swipe') {
          this.renderBazarSwipeView();
        }
      });

      db.ref(`dinings/${diningId}/bazarSwipes`).on('value', snap => {
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.swipes = snap.val() || {};
        if (this._activeBazarRosterTab === 'swipe') {
          this.renderBazarSwipeView();
        }
      });
    }

    this._renderBazarRosterList();
    if (this._activeBazarRosterTab === 'swipe') {
      this.renderBazarSwipeView();
    }
  },

  _renderBazarRosterList() {
    const container = document.getElementById('brRosterListContainer');
    const monthTitleEl = document.getElementById('brMonthTitle');
    const monthSubEl = document.getElementById('brMonthSubtitle');
    if (!container) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    const todayDate = now.getDate();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (monthTitleEl) monthTitleEl.textContent = 'This month';
    if (monthSubEl) monthSubEl.textContent = `${monthName} · From manager`;

    const data = this._bazarRosterData || {};
    const schedule = data.schedule || (Messliner.bazar && Messliner.bazar.rawScheduleData) || {};
    const weekly = data.weekly || (Messliner.bazar && Messliner.bazar.rawWeeklyRoutine) || {};
    const users = data.users || (Messliner.bazar && Messliner.bazar.users) || (Messliner.state?.users || {});
    const bazar = data.bazar || (Messliner.bazar && Messliner.bazar.rawBazarData) || (Messliner.state?.bazarData || {});

    // Group bazar entries by date for the current month
    const bazarByDate = {};
    Object.values(bazar).forEach(entry => {
      if (entry && entry.date && entry.date.startsWith(currentYearMonth)) {
        if (!bazarByDate[entry.date]) bazarByDate[entry.date] = [];
        bazarByDate[entry.date].push(entry);
      }
    });

    const dayShortNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    let html = '';

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYearMonth}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = dayDate.getDay();
      const dayName = dayShortNames[dayOfWeek];

      const isToday = (dateStr === todayStr);
      const isPast = (dateStr < todayStr);

      // Resolve member assigned strictly from explicit day schedule or weekly routine
      let assignedName = '';
      let assignedUid = null;
      let isAssigned = false;

      // 1. Explicit day override in month schedule
      if (schedule[dateStr]) {
        const sEntry = schedule[dateStr];
        if (sEntry.userId) {
          const u = users[sEntry.userId] || (Messliner.state?.users && Messliner.state.users[sEntry.userId]);
          assignedName = u?.name || sEntry.userName || 'Member';
          assignedUid = sEntry.userId;
          isAssigned = true;
        } else if (sEntry.userName) {
          assignedName = sEntry.userName;
          isAssigned = true;
        }
      }

      // 2. Weekly routine (supports array of UIDs with Auto-Swipe rotation or single UID)
      if (!isAssigned) {
        const weeklyVal = (weekly[dayOfWeek] !== undefined) ? weekly[dayOfWeek] : (weekly[String(dayOfWeek)] !== undefined ? weekly[String(dayOfWeek)] : weekly[Number(dayOfWeek)]);
        if (weeklyVal) {
          const wUids = (Array.isArray(weeklyVal) ? weeklyVal : (typeof weeklyVal === 'object' ? Object.values(weeklyVal) : [weeklyVal])).filter(Boolean);
          if (wUids.length === 1) {
            const uid = wUids[0];
            const u = users[uid] || (Messliner.state?.users && Messliner.state.users[uid]);
            assignedName = u?.name || (typeof uid === 'string' && uid.length > 20 ? 'Member' : uid);
            assignedUid = uid;
            isAssigned = true;
          } else if (wUids.length > 1) {
            const occurrenceIndex = Math.floor((day - 1) / 7);
            const assignedMemberIndex = occurrenceIndex % wUids.length;
            const uid = wUids[assignedMemberIndex];
            const u = users[uid] || (Messliner.state?.users && Messliner.state.users[uid]);
            assignedName = u?.name || (typeof uid === 'string' && uid.length > 20 ? 'Member' : uid);
            assignedUid = uid;
            isAssigned = true;
          }
        }
      }

      // 3. Fallback to BazarModule's resolveDutyForDate if available
      if (!isAssigned) {
        const bMod = (Messliner.bazar && typeof Messliner.bazar.resolveDutyForDate === 'function') ? Messliner.bazar : (window.BazarModule && typeof BazarModule.resolveDutyForDate === 'function' ? BazarModule : null);
        if (bMod) {
          const resolved = bMod.resolveDutyForDate(dateStr, dayOfWeek);
          if (resolved && resolved.userName) {
            assignedName = resolved.userName;
            assignedUid = resolved.userId;
            isAssigned = true;
          }
        }
      }

      // Format display name
      const currentUserId = Messliner.state?.userId || this.userId;
      const displayName = (isAssigned && assignedUid && currentUserId && assignedUid === currentUserId) ? 'You' : (isAssigned ? assignedName : 'Not assigned');

      // Check bazar logs for this date
      const dayBazarList = bazarByDate[dateStr] || [];
      const hasBazarDone = dayBazarList.length > 0;
      const dayBazarTotal = dayBazarList.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const buyerName = hasBazarDone ? (dayBazarList[0].userName || (isAssigned ? displayName : 'Member')) : displayName;

      let badgeClass = 'badge-upcoming';
      let subtitle = 'Upcoming';
      let rightPillHtml = '';

      if (hasBazarDone) {
        badgeClass = 'badge-done';
        subtitle = `Done · ৳${dayBazarTotal.toLocaleString()}`;
        rightPillHtml = `<span class="br-status-pill done">Done</span>`;
      } else if (isAssigned) {
        if (isToday) {
          badgeClass = 'badge-today';
          subtitle = 'In progress · today';
          rightPillHtml = `<span class="br-status-pill today">Today</span>`;
        } else if (isPast) {
          badgeClass = 'badge-missed';
          subtitle = 'No entry logged';
          rightPillHtml = `
            <span class="br-status-pill missed">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <rect x="6" y="10.5" width="12" height="3" rx="1.5" fill="white"/>
              </svg>
              Missed
            </span>
          `;
        } else {
          badgeClass = 'badge-upcoming';
          subtitle = 'Upcoming';
          rightPillHtml = '';
        }
      } else {
        // Not assigned
        badgeClass = 'badge-upcoming';
        subtitle = 'Not assigned';
        rightPillHtml = '';
      }

      html += `
        <div class="br-roster-row ${isToday ? 'is-today' : ''}">
          <div class="br-date-badge ${badgeClass}">
            <span class="br-date-day">${dayName}</span>
            <span class="br-date-num">${day}</span>
          </div>
          <div class="br-row-info">
            <h4 class="br-member-name" style="${!isAssigned && !hasBazarDone ? 'color: #94a3b8; font-weight: 600;' : ''}">${hasBazarDone ? buyerName : displayName}</h4>
            <p class="br-duty-desc">${subtitle}</p>
          </div>
          ${rightPillHtml ? `<div class="br-row-action">${rightPillHtml}</div>` : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  },

  findUserNextDutyDate() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const todayDate = now.getDate();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const currentYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const currentUid = Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid);
    if (!currentUid) return null;

    const data = this._bazarRosterData || {};
    const schedule = data.schedule || (Messliner.bazar && Messliner.bazar.rawScheduleData) || {};
    const weekly = data.weekly || (Messliner.bazar && Messliner.bazar.rawWeeklyRoutine) || {};
    const bazar = data.bazar || (Messliner.bazar && Messliner.bazar.rawBazarData) || (Messliner.state?.bazarData || {});

    // Check from today to end of current month
    for (let day = todayDate; day <= daysInMonth; day++) {
      const dateStr = `${currentYearMonth}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = dayDate.getDay();

      // Check if bazar is already done for this date
      const hasBazarDone = Object.values(bazar).some(e => e && e.date === dateStr);
      if (hasBazarDone) continue;

      let assignedUid = null;
      let isAssigned = false;

      // 1. Explicit day override in month schedule
      if (schedule[dateStr]) {
        const sEntry = schedule[dateStr];
        if (sEntry.userId) {
          assignedUid = sEntry.userId;
          isAssigned = true;
        }
      }

      // 2. Weekly routine (Auto-Swipe rotation)
      if (!isAssigned) {
        const weeklyVal = (weekly[dayOfWeek] !== undefined) ? weekly[dayOfWeek] : (weekly[String(dayOfWeek)] !== undefined ? weekly[String(dayOfWeek)] : weekly[Number(dayOfWeek)]);
        if (weeklyVal) {
          const wUids = (Array.isArray(weeklyVal) ? weeklyVal : (typeof weeklyVal === 'object' ? Object.values(weeklyVal) : [weeklyVal])).filter(Boolean);
          if (wUids.length === 1) {
            assignedUid = wUids[0];
            isAssigned = true;
          } else if (wUids.length > 1) {
            const occurrenceIndex = Math.floor((day - 1) / 7);
            const assignedMemberIndex = occurrenceIndex % wUids.length;
            assignedUid = wUids[assignedMemberIndex];
            isAssigned = true;
          }
        }
      }

      // 3. Fallback
      if (!isAssigned) {
        const bMod = (Messliner.bazar && typeof Messliner.bazar.resolveDutyForDate === 'function') ? Messliner.bazar : (window.BazarModule && typeof BazarModule.resolveDutyForDate === 'function' ? BazarModule : null);
        if (bMod) {
          const resolved = bMod.resolveDutyForDate(dateStr, dayOfWeek);
          if (resolved && resolved.userId) {
            assignedUid = resolved.userId;
            isAssigned = true;
          }
        }
      }

      if (isAssigned && assignedUid === currentUid) {
        const dayShortNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        return {
          dateStr,
          day,
          dayName: dayShortNames[dayOfWeek],
          isToday: (dateStr === todayStr),
          fullDateFormatted: dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        };
      }
    }

    return null;
  },

  renderBazarSwipeView() {
    const nextCardEl = document.getElementById('brUserNextDutyContainer');
    const incomingListEl = document.getElementById('brIncomingRequestsList');
    const outgoingListEl = document.getElementById('brOutgoingRequestsList');
    const incomingBadgeEl = document.getElementById('brIncomingBadge');
    const outgoingBadgeEl = document.getElementById('brOutgoingBadge');

    if (!nextCardEl) return;

    const currentUid = Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid);
    const data = this._bazarRosterData || {};
    const swipes = data.swipes || {};
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Render User's Next Duty Card
    const nextDuty = this.findUserNextDutyDate();
    if (nextDuty) {
      nextCardEl.className = 'br-swipe-next-card';
      nextCardEl.innerHTML = `
        <div class="br-swipe-next-left">
          <div class="br-swipe-date-badge">
            <span class="day-name">${nextDuty.dayName}</span>
            <span class="day-num">${nextDuty.day}</span>
          </div>
          <div class="br-swipe-next-info">
            <h4>${nextDuty.fullDateFormatted}</h4>
            <p>Your Next Duty</p>
          </div>
        </div>
        <button type="button" class="br-btn-request-swipe" onclick="Messliner.userDashboard.openBazarSwipeModal('${nextDuty.dateStr}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/></svg>
          Request Swipe
        </button>
      `;
    } else {
      nextCardEl.className = 'br-swipe-next-card no-duty';
      nextCardEl.innerHTML = `
        <div class="br-no-duty-card">
          <div class="br-no-duty-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <path d="m9 16 2 2 4-4"/>
            </svg>
          </div>
          <div class="br-no-duty-content">
            <h4 class="br-no-duty-title">No Upcoming Duty Scheduled</h4>
            <p class="br-no-duty-desc">You don't have any assigned bazar duty for this month.</p>
          </div>
        </div>
      `;
    }

    // 2. Incoming Requests (for current user, current month)
    const allSwipesList = Object.entries(swipes).map(([id, s]) => ({ id, ...s }));
    const incomingRequests = allSwipesList
      .filter(s => s && s.toUserId === currentUid && (!s.yearMonth || s.yearMonth === currentYearMonth))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const pendingIncoming = incomingRequests.filter(s => s.status === 'pending');
    if (incomingBadgeEl) {
      incomingBadgeEl.textContent = `${pendingIncoming.length} Pending`;
      incomingBadgeEl.className = pendingIncoming.length > 0 ? 'br-swipe-badge' : 'br-swipe-badge neutral';
    }

    if (incomingListEl) {
      if (incomingRequests.length === 0) {
        incomingListEl.innerHTML = `
          <div class="br-swipe-empty-card">
            <div class="br-swipe-empty-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p class="br-swipe-empty-text">No incoming swipe requests received from other members.</p>
          </div>
        `;
      } else {
        incomingListEl.innerHTML = incomingRequests.map(req => {
          const reqDateObj = req.fromDate ? new Date(req.fromDate + 'T00:00:00') : null;
          const formattedDate = reqDateObj && !isNaN(reqDateObj.getTime())
            ? reqDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : (req.fromDate || 'Upcoming Duty');

          const statusText = req.status === 'pending' ? 'Pending' : (req.status === 'accepted' ? 'Accepted' : 'Declined');

          return `
            <div class="br-mini-card-wrap incoming ${req.status}">
              <!-- Top Member Banner -->
              <div class="br-mini-member-banner incoming">
                <div class="br-mini-avatar-wrap">
                  <div class="br-mini-avatar incoming">${(req.fromUserName || 'M').charAt(0).toUpperCase()}</div>
                  <div class="br-mini-user-info">
                    <h5 class="br-mini-user-name">${req.fromUserName || 'Member'}</h5>
                  </div>
                </div>
              </div>

              <!-- Mini Details Box with Icons -->
              <div class="br-mini-details-box">
                <div class="br-mini-detail-row">
                  <div class="br-mini-row-left">
                    <div class="br-mini-icon-sq">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <span class="br-mini-row-title">Duty Date</span>
                  </div>
                  <span class="br-mini-row-value date-badge">${formattedDate}</span>
                </div>

                <div class="br-mini-detail-row">
                  <div class="br-mini-row-left">
                    <div class="br-mini-icon-sq">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span class="br-mini-row-title">Status</span>
                  </div>
                  <span class="br-mini-status-badge ${req.status}">${statusText}</span>
                </div>

                ${req.note ? `
                  <div class="br-mini-detail-row">
                    <div class="br-mini-row-left">
                      <div class="br-mini-icon-sq">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </div>
                      <span class="br-mini-row-title">Reason</span>
                    </div>
                    <span class="br-mini-row-value">${req.note}</span>
                  </div>
                ` : ''}
              </div>

              <!-- Action Buttons -->
              ${req.status === 'pending' ? `
                <div class="br-mini-dual-actions">
                  <button type="button" class="br-mini-btn-accept" onclick="Messliner.userDashboard.acceptBazarSwipe('${req.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Accept Request
                  </button>
                  <button type="button" class="br-mini-btn-decline" onclick="Messliner.userDashboard.declineBazarSwipe('${req.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Decline
                  </button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
      }
    }

    // 3. Outgoing / Sent Requests (by current user, current month)
    const outgoingRequests = allSwipesList
      .filter(s => s && s.fromUserId === currentUid && (!s.yearMonth || s.yearMonth === currentYearMonth))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const pendingOutgoing = outgoingRequests.filter(s => s.status === 'pending');
    if (outgoingBadgeEl) {
      outgoingBadgeEl.textContent = `${pendingOutgoing.length} Active`;
      outgoingBadgeEl.className = pendingOutgoing.length > 0 ? 'br-swipe-badge' : 'br-swipe-badge neutral';
    }

    if (outgoingListEl) {
      if (outgoingRequests.length === 0) {
        outgoingListEl.innerHTML = `
          <div class="br-swipe-empty-card">
            <div class="br-swipe-empty-icon neutral">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p class="br-swipe-empty-text">You haven't sent any swipe requests this month.</p>
          </div>
        `;
      } else {
        outgoingListEl.innerHTML = outgoingRequests.map(req => {
          const reqDateObj = req.fromDate ? new Date(req.fromDate + 'T00:00:00') : null;
          const formattedDate = reqDateObj && !isNaN(reqDateObj.getTime())
            ? reqDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : (req.fromDate || 'Upcoming Duty');

          const statusText = req.status === 'pending' ? 'Pending' : (req.status === 'accepted' ? 'Accepted' : 'Declined');

          return `
            <div class="br-mini-card-wrap outgoing ${req.status}">
              <!-- Top Member Banner -->
              <div class="br-mini-member-banner outgoing">
                <div class="br-mini-avatar-wrap">
                  <div class="br-mini-avatar outgoing">${(req.toUserName || 'M').charAt(0).toUpperCase()}</div>
                  <div class="br-mini-user-info">
                    <h5 class="br-mini-user-name">${req.toUserName || 'Member'}</h5>
                  </div>
                </div>
              </div>

              <!-- Mini Details Box with Icons -->
              <div class="br-mini-details-box">
                <div class="br-mini-detail-row">
                  <div class="br-mini-row-left">
                    <div class="br-mini-icon-sq">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <span class="br-mini-row-title">Duty Date</span>
                  </div>
                  <span class="br-mini-row-value date-badge">${formattedDate}</span>
                </div>

                <div class="br-mini-detail-row">
                  <div class="br-mini-row-left">
                    <div class="br-mini-icon-sq">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span class="br-mini-row-title">Status</span>
                  </div>
                  <span class="br-mini-status-badge ${req.status}">${statusText}</span>
                </div>

                ${req.note ? `
                  <div class="br-mini-detail-row">
                    <div class="br-mini-row-left">
                      <div class="br-mini-icon-sq">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </div>
                      <span class="br-mini-row-title">Reason</span>
                    </div>
                    <span class="br-mini-row-value">${req.note}</span>
                  </div>
                ` : ''}
              </div>

              <!-- Full Width Red Cancel Button -->
              ${req.status === 'pending' ? `
                <button type="button" class="br-mini-btn-cancel-req" onclick="Messliner.userDashboard.cancelBazarSwipe('${req.id}')">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Cancel Request
                </button>
              ` : ''}
            </div>
          `;
        }).join('');
      }
    }
  },

  _populateSwipeMembers(selectEl, usersMap, currentUid) {
    if (!selectEl) return;
    const currentVal = selectEl.value;

    const settings = this.settings || Messliner.state?.settings || Messliner.diningData?.settings || {};
    // Check if manager/admin bazar duty is enabled (defaults to true if undefined)
    const isManagerBazarEnabled = settings.managerBazarEnabled !== false;

    const parseJoinTimestamp = (u) => {
      const val = u.createdAt || u.joinedAt || u.timestamp || u.joinDate || u.created_at || null;
      if (!val) return Number.MAX_SAFE_INTEGER;
      if (typeof val === 'number') return val;
      const t = new Date(val).getTime();
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };

    const list = [];
    Object.entries(usersMap || {}).forEach(([uid, u]) => {
      if (!u || typeof u !== 'object') return;
      if (uid === currentUid) return;

      // Filter out inactive / left / removed members
      const status = String(u.status || '').toLowerCase();
      if (status === 'inactive' || status === 'left' || status === 'removed' || status === 'banned' || status === 'blocked') {
        return;
      }
      if (u.isActive === false) return;

      const role = String(u.role || '').toLowerCase();
      const isManager = (role === 'admin' || role === 'manager');

      // If admin/manager bazar duty is off in settings, do not show in swipe list
      if (isManager && !isManagerBazarEnabled) {
        return;
      }

      // If user has specific bazar duty exclusion flags
      if (u.bazarEnabled === false || u.bazarDuty === false || u.managerBazarEnabled === false || u.excludeFromBazar === true || u.isExcludedFromBazar === true) {
        return;
      }

      const name = u.name || u.displayName || u.fullName || 'Member';

      list.push({
        uid,
        name,
        isManager,
        joinedTimestamp: parseJoinTimestamp(u)
      });
    });

    // Sort by mess joining date (earliest joined member first)
    list.sort((a, b) => {
      if (a.joinedTimestamp !== b.joinedTimestamp) {
        return a.joinedTimestamp - b.joinedTimestamp;
      }
      return a.name.localeCompare(b.name);
    });

    let optionsHtml = '<option value="">Choose a member...</option>';
    list.forEach(m => {
      const label = m.isManager ? `${m.name} (Manager)` : m.name;
      optionsHtml += `<option value="${m.uid}">${label}</option>`;
    });

    if (list.length === 0) {
      optionsHtml = '<option value="">No other active members found</option>';
    }

    selectEl.innerHTML = optionsHtml;
    if (currentVal && list.some(m => m.uid === currentVal)) {
      selectEl.value = currentVal;
    }
  },

  async openBazarSwipeModal(fromDate) {
    const inputEl = document.getElementById('bazarSwipeFromDateInput');
    const textEl = document.getElementById('bazarSwipeFromDateText');
    const selectEl = document.getElementById('bazarSwipeTargetUserSelect');
    const noteEl = document.getElementById('bazarSwipeNoteInput');

    if (inputEl) inputEl.value = fromDate;
    if (textEl && fromDate) {
      const d = new Date(fromDate + 'T00:00:00');
      textEl.textContent = !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : fromDate;
    }
    if (noteEl) noteEl.value = '';

    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    const currentUid = Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid);

    // Initial populate from cached users
    let cachedUsers = Object.assign(
      {},
      Messliner.users?.users || {},
      Messliner.state?.users || {},
      this._bazarRosterData?.users || {},
      (Messliner.bazar && Messliner.bazar.users) || {}
    );

    this._populateSwipeMembers(selectEl, cachedUsers, currentUid);

    openModal('bazarSwipeRequestModal');

    // Fetch fresh users and settings from database to guarantee all active members are included
    if (diningId && typeof db !== 'undefined') {
      try {
        const [usersSnap, settingsSnap] = await Promise.all([
          db.ref(`dinings/${diningId}/users`).once('value'),
          db.ref(`dinings/${diningId}/settings`).once('value')
        ]);
        const dbUsers = usersSnap.val() || {};
        const dbSettings = settingsSnap.val() || {};
        if (dbSettings && Object.keys(dbSettings).length > 0) {
          this.settings = Object.assign(this.settings || {}, dbSettings);
        }
        if (!this._bazarRosterData) this._bazarRosterData = {};
        this._bazarRosterData.users = dbUsers;
        if (Messliner.state) Messliner.state.users = Object.assign(Messliner.state.users || {}, dbUsers);
        this._populateSwipeMembers(selectEl, dbUsers, currentUid);
      } catch (err) {
        console.warn('[Messliner] Could not refresh swipe users from db:', err);
      }
    }
  },

  async submitBazarSwipeRequest() {
    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    const currentUid = Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid);
    const currentUserName = Messliner.state?.userName || this.userData?.name || 'You';

    if (!diningId || !currentUid) return;

    const fromDateInput = document.getElementById('bazarSwipeFromDateInput');
    const selectEl = document.getElementById('bazarSwipeTargetUserSelect');
    const noteInput = document.getElementById('bazarSwipeNoteInput');
    const submitBtn = document.getElementById('bazarSwipeSubmitBtn');

    const fromDate = fromDateInput ? fromDateInput.value : '';
    const targetUserId = selectEl ? selectEl.value : '';
    const targetUserName = (selectEl && selectEl.selectedOptions[0]) ? selectEl.selectedOptions[0].textContent : 'Member';
    const note = noteInput ? noteInput.value.trim() : '';

    if (!fromDate) {
      alert('Duty date is missing.');
      return;
    }
    if (!targetUserId) {
      alert('Please select a member to swipe with.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sending...</span>';
    }

    try {
      const now = new Date();
      const currentYearMonth = fromDate.substring(0, 7);

      const swipeRef = db.ref(`dinings/${diningId}/bazarSwipes`).push();
      await swipeRef.set({
        id: swipeRef.key,
        fromUserId: currentUid,
        fromUserName: currentUserName,
        toUserId: targetUserId,
        toUserName: targetUserName,
        fromDate: fromDate,
        note: note,
        status: 'pending',
        yearMonth: currentYearMonth,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      closeModal('bazarSwipeRequestModal');
      this.renderBazarSwipeView();
    } catch (err) {
      console.error('[Messliner] Error sending swipe request:', err);
      alert('Failed to send swipe request: ' + (err.message || err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Send Request</span>';
      }
    }
  },

  async acceptBazarSwipe(requestId) {
    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    const currentUid = Messliner.state?.userId || this.userId || (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid);
    const currentUserName = Messliner.state?.userName || this.userData?.name || 'You';

    if (!diningId || !currentUid || !requestId) return;

    try {
      const snap = await db.ref(`dinings/${diningId}/bazarSwipes/${requestId}`).once('value');
      const req = snap.val();
      if (!req) {
        alert('Swipe request not found.');
        return;
      }

      if (req.status !== 'pending') {
        alert(`This request has already been ${req.status}.`);
        return;
      }

      // 1. Update swipe status to accepted
      await db.ref(`dinings/${diningId}/bazarSwipes/${requestId}`).update({
        status: 'accepted',
        acceptedAt: firebase.database.ServerValue.TIMESTAMP,
        acceptedBy: currentUid
      });

      // 2. Reassign duty in bazarSchedule
      const targetMemberName = (Messliner.users?.users && Messliner.users.users[currentUid]?.name) || (this.userData && this.userData.name) || req.toUserName || currentUserName;
      const yearMonth = req.yearMonth || (req.fromDate ? req.fromDate.substring(0, 7) : '');
      if (yearMonth && req.fromDate) {
        const updatedDuty = {
          userId: currentUid,
          userName: targetMemberName,
          note: `Swiped with ${req.fromUserName}`,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        await db.ref(`dinings/${diningId}/bazarSchedule/${yearMonth}/${req.fromDate}`).set(updatedDuty);

        // Instantly update local memory & calendar
        if (this._bazarRosterData) {
          if (!this._bazarRosterData.schedule) this._bazarRosterData.schedule = {};
          this._bazarRosterData.schedule[req.fromDate] = updatedDuty;
        }
        if (window.Messliner && Messliner.bazar) {
          if (!Messliner.bazar.rawScheduleData) Messliner.bazar.rawScheduleData = {};
          Messliner.bazar.rawScheduleData[req.fromDate] = updatedDuty;
          Messliner.bazar.render();
        }
      }

      this.renderBazarSwipeView();
      if (typeof Notifications !== 'undefined' && Notifications.toast) {
        Notifications.toast('success', 'Swipe Accepted', `Assigned duty on ${req.fromDate} to ${targetMemberName}.`);
      }
    } catch (err) {
      console.error('[Messliner] Error accepting swipe:', err);
      alert('Failed to accept swipe: ' + (err.message || err));
    }
  },

  async declineBazarSwipe(requestId) {
    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    if (!diningId || !requestId) return;

    try {
      await db.ref(`dinings/${diningId}/bazarSwipes/${requestId}`).update({
        status: 'declined',
        declinedAt: firebase.database.ServerValue.TIMESTAMP
      });
      this.renderBazarSwipeView();
    } catch (err) {
      console.error('[Messliner] Error declining swipe:', err);
      alert('Failed to decline swipe: ' + (err.message || err));
    }
  },

  async cancelBazarSwipe(requestId) {
    const diningId = Messliner.state?.diningId || this.diningId || Messliner.diningId;
    if (!diningId || !requestId) return;

    try {
      await db.ref(`dinings/${diningId}/bazarSwipes/${requestId}`).remove();
      this.renderBazarSwipeView();
    } catch (err) {
      console.error('[Messliner] Error cancelling swipe:', err);
      alert('Failed to cancel swipe: ' + (err.message || err));
    }
  },

  /**
   * Setup collapse and expand behavior for the Recent Activity timeline
   */
  _setupTimelineCollapse(container, displayLogsCount) {
    if (displayLogsCount <= 3) {
      container.classList.remove('collapsed');
      return '';
    }

    // Determine if it was already expanded or collapsed
    const isFirstRender = !container.querySelector('.timeline-item');
    const isCollapsed = isFirstRender ? true : container.classList.contains('collapsed');

    if (isCollapsed) {
      container.classList.add('collapsed');
    } else {
      container.classList.remove('collapsed');
    }

    // Add listener if not attached
    if (!container.dataset.listenerAttached) {
      container.addEventListener('click', (e) => {
        const expandBtn = e.target.closest('.expand-btn');
        const collapseBtn = e.target.closest('.collapse-btn');
        if (expandBtn) {
          container.classList.remove('collapsed');
        } else if (collapseBtn) {
          container.classList.add('collapsed');
          // Smooth scroll to top of the card when collapsing if user scrolled past
          const card = container.closest('.card');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
      container.dataset.listenerAttached = 'true';
    }

    return `
      <div class="timeline-expand-wrapper">
        <button class="timeline-action-btn expand-btn" type="button" title="Show More">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
      <div class="timeline-collapse-wrapper">
        <button class="timeline-action-btn collapse-btn" type="button" title="Show Less">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
      </div>
    `;
  },

  /**
   * Setup collapse and expand behavior for the Meal Toggle History list
   */
  _setupToggleHistoryCollapse(container, logsCount) {
    if (logsCount <= 4) {
      container.classList.remove('collapsed');
      return '';
    }

    // Determine if it was already expanded or collapsed
    const isFirstRender = !container.querySelector('.meal-toggle-history-item');
    const isCollapsed = isFirstRender ? true : container.classList.contains('collapsed');

    if (isCollapsed) {
      container.classList.add('collapsed');
    } else {
      container.classList.remove('collapsed');
    }

    // Add listener if not attached
    if (!container.dataset.listenerAttached) {
      container.addEventListener('click', (e) => {
        const expandBtn = e.target.closest('.expand-btn');
        const collapseBtn = e.target.closest('.collapse-btn');
        if (expandBtn) {
          container.classList.remove('collapsed');
        } else if (collapseBtn) {
          container.classList.add('collapsed');
          const card = container.closest('.card');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
      container.dataset.listenerAttached = 'true';
    }

    return `
      <div class="timeline-expand-wrapper">
        <button class="timeline-action-btn expand-btn" type="button" title="Show More">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
      <div class="timeline-collapse-wrapper">
        <button class="timeline-action-btn collapse-btn" type="button" title="Show Less">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
      </div>
    `;
  },

  /**
   * Start countdown timer interval
   */
  _startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => {
      // Re-render meal toggles every minute to update countdowns
      if (Router.currentPage === 'dashboard' || Router.currentPage === 'mymeal') {
        this.renderMealToggles();
      }
    }, 60000); // Every minute
  },

  /**
   * Update visibility of 'My Meal' section and 'Dining Overview' based on manager settings
   */
  updateMyMealVisibility() {
    const role = Messliner.state.role;
    const isAdmin = role === 'admin';
    const showMyMeal = isAdmin && !!this.settings.managerMealEnabled;

    const navMyMeal = document.getElementById('navMyMeal');
    const bottomNavMyMeal = document.getElementById('bottomNavMyMeal');

    if (navMyMeal) navMyMeal.style.display = showMyMeal ? 'flex' : 'none';
    if (bottomNavMyMeal) bottomNavMyMeal.style.display = showMyMeal ? 'flex' : 'none';
    if (window.Router && typeof Router.updateBottomNavIndicator === 'function') {
      Router.updateBottomNavIndicator(true);
    }

    // Premium Banner Visibility: Admin panel only
    const premiumBanner = document.querySelector('.premium-banner-card');
    if (premiumBanner) {
      if (isAdmin) {
        premiumBanner.classList.remove('hidden');
        premiumBanner.style.setProperty('display', 'flex', 'important');
      } else {
        premiumBanner.classList.add('hidden');
        premiumBanner.style.setProperty('display', 'none', 'important');
      }
    }

    // Header updates
    const headerTitle = document.getElementById('headerTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');

    if (isAdmin) {
      // Admin dashboard always shows the Dining Overview, so make sure managerOverviewSection is shown
      const managerOverview = document.getElementById('managerOverviewSection');
      if (managerOverview) {
        managerOverview.style.display = 'block';
        managerOverview.classList.remove('hidden');
      }

      if (Router.currentPage === 'dashboard') {
        if (typeof Messliner !== 'undefined' && Messliner.updateHomeHeaderGreeting) {
          Messliner.updateHomeHeaderGreeting(this.userData ? this.userData.name : null);
        }
        if (headerSubtitle) {
          headerSubtitle.textContent = '';
          headerSubtitle.style.display = 'none';
        }
      } else if (Router.currentPage === 'mymeal') {
        if (headerTitle) headerTitle.textContent = 'My Meal';
        if (headerSubtitle) {
          headerSubtitle.textContent = '';
          headerSubtitle.style.display = 'none';
        }
      }
    } else {
      // Normal user
      if (Router.currentPage === 'dashboard') {
        if (typeof Messliner !== 'undefined' && Messliner.updateHomeHeaderGreeting) {
          Messliner.updateHomeHeaderGreeting(this.userData ? this.userData.name : null);
        }
        if (headerSubtitle) {
          headerSubtitle.textContent = '';
          headerSubtitle.style.display = 'none';
        }
      }
    }
  },

  /**
   * AI Auto Meal System Schedule Check
   */
  async checkAutoMealSchedule() {
    const role = Messliner.state.role;
    if (role === 'admin') return;

    try {
      const snap = await db.ref(`dinings/${this.diningId}/users/${this.userId}`).once('value');
      const u = snap.val();
      if (!u || !u.autoMealEnabled || !u.profile || !u.profile.classSchedule) return;

      const classSchedule = u.profile.classSchedule;

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const tomorrowIndex = (new Date().getDay() + 1) % 7;
      const tomorrowDay = dayNames[tomorrowIndex];

      const tomorrowClasses = classSchedule[tomorrowDay];
      if (!tomorrowClasses || tomorrowClasses.length === 0) return;

      const mealWindows = {
        breakfast: { start: "08:00", end: "09:30" },
        lunch: { start: "13:00", end: "14:30" },
        dinner: { start: "20:30", end: "22:00" }
      };

      const parseMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };

      const hasOverlap = (startA, endA, startB, endB) => {
        const minStartA = parseMinutes(startA);
        const minEndA = parseMinutes(endA);
        const minStartB = parseMinutes(startB);
        const minEndB = parseMinutes(endB);
        return Math.max(minStartA, minStartB) < Math.min(minEndA, minEndB);
      };

      const conflicts = [];
      const mealStatus = u.mealStatus || { breakfast: 1, lunch: 1, dinner: 1 };

      for (let [mealType, window] of Object.entries(mealWindows)) {
        let currentCount = 1;
        if (mealStatus[mealType] === false || mealStatus[mealType] === 0) {
          currentCount = 0;
        } else if (typeof mealStatus[mealType] === 'number') {
          currentCount = mealStatus[mealType];
        }

        if (currentCount === 0) continue;

        const mealControlDate = this.getMealControlDate(mealType);
        if (this.isMealLocked(mealType, mealControlDate)) continue;

        let overlapFound = false;
        let conflictCourse = "";

        for (let c of tomorrowClasses) {
          if (hasOverlap(c.start, c.end, window.start, window.end)) {
            overlapFound = true;
            conflictCourse = c.course;
            break;
          }
        }

        if (overlapFound) {
          conflicts.push({ mealType, conflictCourse });
        }
      }

      if (conflicts.length > 0) {
        const warningContainer = document.getElementById('mealCompletedWarningContainer');
        if (warningContainer) {
          warningContainer.style.display = 'block';

          // Store conflicts array on the module to access on click
          this._pendingAutoConflicts = conflicts;

          let conflictsText = conflicts.map(c => `<strong>${c.mealType.toUpperCase()}</strong> (class conflict: ${c.conflictCourse})`).join(', ');

          // Create warning elements
          const aiCardHtml = `
            <div id="aiAutoMealWarningCard" class="completed-meals-warning-card" style="
              background: rgba(124, 58, 237, 0.05);
              border: 1px solid rgba(124, 58, 237, 0.2);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              color: #5b21b6;
              border-radius: 12px;
              padding: 12px 16px;
              display: flex;
              flex-direction: column;
              gap: 10px;
              font-size: 13px;
              font-weight: 400;
              line-height: 1.45;
              margin-bottom: var(--space-2);
              box-shadow: 0 4px 12px rgba(124, 58, 237, 0.03);
            ">
              <div style="display:flex; align-items:center; gap:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color:#7c3aed;">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <div>
                  <strong>🤖 AI Auto-Meal Optimizer:</strong> Tomorrow's schedule conflicts with meals: ${conflictsText}.
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end;">
                <button class="btn btn-sm" style="background:#7c3aed; color:#fff; font-size:11px; padding:6px 12px; border-radius:6px; cursor:pointer; border:none; font-weight:600;" 
                        onclick="Messliner.userDashboard.confirmAutoMealToggles()">
                  Approve Toggling OFF Conflict Meals
                </button>
              </div>
            </div>
          `;

          // Check if AI card is already added to prevent duplicates
          const existing = document.getElementById('aiAutoMealWarningCard');
          if (existing) existing.remove();

          warningContainer.innerHTML = aiCardHtml + warningContainer.innerHTML;
        }
      }

    } catch (err) {
      console.warn('[AutoMeal] Overlap check failed:', err);
    }
  },

  async confirmAutoMealToggles() {
    if (!this._pendingAutoConflicts || this._pendingAutoConflicts.length === 0) return;

    try {
      for (let c of this._pendingAutoConflicts) {
        await db.ref(`dinings/${this.diningId}/users/${this.userId}/mealStatus/${c.mealType}`).set(0);
        await Notifications.log(this.diningId, 'meal_toggled', `AI Auto Meal set ${c.mealType.toUpperCase()} OFF due to class overlap (${c.conflictCourse}) after user approval`, this.userId, this.userId);
      }

      this._pendingAutoConflicts = null;

      const aiCard = document.getElementById('aiAutoMealWarningCard');
      if (aiCard) aiCard.remove();

      Notifications.toast('success', 'AI Auto-Meal Applied', 'Conflict meals turned OFF successfully.');
      this.refresh();
    } catch (err) {
      console.error(err);
      Notifications.toast('error', 'Error', 'Failed to toggle conflict meals.');
    }
  },

  /**
   * Refresh dashboard
   */
  refresh() {
    this.renderStats();
    this.renderMealToggles();
    this.updateMyMealVisibility();
    this.renderRecentActivity(this.diningId);
    this.renderMealToggleHistory();
    this.checkAutoMealSchedule();

    const role = Messliner.state.role;
    const userContent = document.getElementById('userDashboardContent');
    const mymealContainer = document.getElementById('mymealContainer');
    const dashboardSection = document.getElementById('page-dashboard');

    if (role === 'admin') {
      // Admin: Move userDashboardContent to page-mymeal
      if (userContent && mymealContainer && userContent.parentElement !== mymealContainer) {
        mymealContainer.appendChild(userContent);
      }

      // Admin dashboard always shows the Dining Overview
      const overviewContent = document.getElementById('overviewContent');
      const managerContainer = document.getElementById('managerOverviewSection');
      if (overviewContent && managerContainer && overviewContent.parentElement !== managerContainer) {
        managerContainer.appendChild(overviewContent);
        managerContainer.classList.remove('hidden');
        managerContainer.style.display = 'block';
      }
      Messliner.overview.refresh();
    } else {
      // Regular user: Make sure userDashboardContent is in page-dashboard
      if (userContent && dashboardSection && userContent.parentElement !== dashboardSection) {
        dashboardSection.insertBefore(userContent, dashboardSection.firstChild);
      }
      // Hide manager overview section for regular users
      const managerContainer = document.getElementById('managerOverviewSection');
      if (managerContainer) {
        managerContainer.style.display = 'none';
        managerContainer.classList.add('hidden');
      }
    }
  }
};

console.log('[Messliner] User Dashboard loaded');
