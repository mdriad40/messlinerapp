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
   * Determine whether a meal is locked based on its controlDate and deadline setting (immune to timezone shift)
   */
  isMealLocked(mealType, controlDate) {
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
      this.renderMealToggles();
      this.updateMyMealVisibility();
    });

    const role = Messliner.state.role;
    const isMember = role !== 'admin';

    if (isMember) {
      // Listen to user-specific logs (sorted newest-first for correct grouping)
      this._logsRef = db.ref(`dinings/${diningId}/users/${userId}/logs`).orderByChild('timestamp');
      this._logsRef.on('value', (snap) => {
        this.userLogsData = [];
        snap.forEach(child => {
          const val = child.val();
          if (!val) return;
          // Resolve Firebase ServerValue.TIMESTAMP objects to a numeric value
          if (val.timestamp && typeof val.timestamp === 'object') {
            val.timestamp = Date.now();
          }
          this.userLogsData.push(val);
        });
        // Reverse so newest entries come first
        this.userLogsData.reverse();
        this._activityDataReady = true;  // data has arrived at least once
        this._debouncedRenderActivity(diningId);
      });
    } else {
      // Admin: Listen to all dining logs (sorted newest-first)
      this._adminLogsRef = db.ref(`dinings/${diningId}/logs`).orderByChild('timestamp');
      this._adminLogsRef.on('value', (snap) => {
        this.adminLogsData = [];
        snap.forEach(child => {
          const val = child.val();
          if (!val) return;
          // Resolve Firebase ServerValue.TIMESTAMP objects
          if (val.timestamp && typeof val.timestamp === 'object') {
            val.timestamp = Date.now();
          }
          this.adminLogsData.push(val);
        });
        this.adminLogsData.reverse();
        this._activityDataReady = true;  // data has arrived at least once
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
        if (d.date && d.date.startsWith(currentMonth)) {
          const amt = Math.abs(Utils.num(d.amount));
          if (d.type === 'deposit') {
            depositTotal += amt;
          } else if (d.type === 'other_costing') {
            otherCostTotal += amt;
          } else if (d.type === 'deduction' || d.type === 'friday_meal') {
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
        if (b.date && b.date.startsWith(currentMonth)) {
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
    // Use current-month values only
    const mealRate = Messliner.state.monthlyMealRate || 0;
    const rateMode = this.settings.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings.fixedRates || null) : null;
    const mealCost = Utils.calcMealCost(mealRate, this.monthlyMeals, this.monthlyMealsBreakdown, fixedRates);

    const otherCosting = this.monthlyOtherCosting || 0;
    const deduction = this.monthlyDeduction || 0;
    const totalCost = mealCost + otherCosting;
    const balance = this.monthlyDeposit - totalCost - deduction;

    container.innerHTML = `
      <div class="stat-card fade-up stagger-1">
        <div class="stat-icon primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">My Deposit</div>
          <div class="stat-value">${Utils.currency(this.monthlyDeposit)}</div>
        </div>
      </div>
      <div class="stat-card fade-up stagger-2">
        <div class="stat-icon accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">My Meal</div>
          <div class="stat-value">${this.monthlyMeals || 0}</div>
          <span id="fridayMealDashLabel" style="display:none;margin-top:4px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:linear-gradient(135deg,rgba(124,58,237,0.12),rgba(91,33,182,0.08));color:#7C3AED;border:1px solid rgba(124,58,237,0.2);letter-spacing:0.01em;align-items:center;gap:3px;">+ 0 Friday Meal</span>
        </div>
      </div>
      <div class="stat-card fade-up" style="animation-delay: 0.15s;">
        <div class="stat-icon warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">My Meal Cost</div>
          <div class="stat-value">${Utils.currency(mealCost)}</div>
        </div>
      </div>
      <div class="stat-card fade-up" style="animation-delay: 0.2s;">
        <div class="stat-icon" style="background:var(--warning-100);color:var(--warning-700);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Other Cost</div>
          <div class="stat-value">${Utils.currency(otherCosting)}</div>
        </div>
      </div>
      <div class="stat-card fade-up" style="animation-delay: 0.25s;">
        <div class="stat-icon danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Deduction</div>
          <div class="stat-value">${Utils.currency(deduction)}</div>
        </div>
      </div>
      <div class="stat-card fade-up" style="animation-delay: 0.3s;">
        <div class="stat-icon ${balance >= 0 ? 'accent' : 'danger'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">My Balance</div>
          <div class="stat-value" style="color:${balance >= 0 ? 'var(--accent-600)' : 'var(--danger-600)'}">${Utils.currency(balance)}</div>
        </div>
      </div>
    `;

    // Update Friday Meal label chip asynchronously
    if (window.FridayMealPageModule && FridayMealPageModule._updateUserDashboardLabel) {
      FridayMealPageModule._updateUserDashboardLabel();
    }
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
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M18 8h1a3 3 0 0 1 0 6h-1" />
                 <path d="M4 8h14v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8z" fill="currentColor" />
                 <line x1="2" y1="21" x2="20" y2="21" stroke-width="2" />
               </svg>`,
        iconClass: 'breakfast',
        deadline: s.breakfastDeadline || '04:00'
      },
      {
        type: 'lunch',
        label: 'Lunch',
        desc: 'Mid-day',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="M18 3v18M18 3a3 3 0 0 0-3 3v6h3M6 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 13v9" />
                 <line x1="6" y1="3" x2="6" y2="7" />
                 <line x1="10" y1="3" x2="10" y2="7" />
               </svg>`,
        iconClass: 'lunch',
        deadline: s.lunchDeadline || '10:00'
      },
      {
        type: 'dinner',
        label: 'Dinner',
        desc: 'Evening',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                 <g transform="translate(12,12) rotate(45) translate(-12,-12)">
                   <path d="M12 21v-10" />
                   <path d="M12 11c-1.8 0-2.2-1.5-2.2-4s1-4 2.2-4 2.2 1.5 2.2 4-1 4-2.2 4z" fill="currentColor" />
                 </g>
                 <g transform="translate(12,12) rotate(-45) translate(-12,-12)">
                   <path d="M12 21v-10" />
                   <path d="M12 11c1.5 0 2-1 2-4s-.5-4-2-4v8z" fill="currentColor" />
                 </g>
               </svg>`,
        iconClass: 'dinner',
        deadline: s.dinnerDeadline || '16:00'
      }
    ].filter(m => trackedMeals[m.type] !== false);

    // Update date display to show which date is currently controlled
    Utils.setText('mealDateDisplay', Utils.formatDate(controlDate));

    // Show/hide completed meals warning cards
    const warningContainer = document.getElementById('mealCompletedWarningContainer');
    if (warningContainer) {
      warningContainer.innerHTML = '';
      let hasAnyWarning = false;
      let latestWarningHtml = '';

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
            <div class="completed-meals-warning-card" style="
              background: rgba(239, 68, 68, 0.05);
              border: 1px solid rgba(239, 68, 68, 0.15);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              color: #991b1b;
              border-radius: 12px;
              padding: 10px 14px;
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 13px;
              font-weight: 400;
              line-height: 1.45;
              margin-bottom: var(--space-2);
              box-shadow: 0 4px 12px rgba(239, 68, 68, 0.03);
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color:#b91c1c;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="rgba(185, 28, 28, 0.08)"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <strong>${formattedDate}${mealsLabelWithSpace}</strong> meal has already been added. You may turn the next meal on or off from <strong>${formattedNextDate}</strong>.
              </div>
            </div>
          `;
        }

        d.setDate(d.getDate() + 1);
      }

      if (latestWarningHtml) {
        warningContainer.innerHTML = latestWarningHtml;
      }
      warningContainer.style.display = hasAnyWarning ? 'block' : 'none';
    }

    grid.innerHTML = meals.map(meal => {
      const mealControlDate = this.getMealControlDate(meal.type);
      const isLocked = this.isMealLocked(meal.type, mealControlDate);

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
        badgeText = isOn ? 'ON & Locked' : 'OFF & Locked';
        badgeClass = 'locked';
      } else {
        badgeText = isOn ? 'ON' : 'OFF';
        badgeClass = isOn ? 'on' : 'off';
      }

      const subtitleIcon = isLocked
        ? `<svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color: var(--text-tertiary);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`
        : `<svg class="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color: var(--text-tertiary);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

      return `
        <div class="meal-toggle-card ${cardClass}">
          <div class="meal-toggle-info">
            <div class="meal-toggle-icon ${meal.iconClass}">
              ${meal.icon}
            </div>
            <div class="meal-toggle-text">
              <div class="meal-title-row">
                <h4 style="margin:0; line-height:1.2; white-space: nowrap;">${meal.label}</h4>
                <span class="meal-status-badge ${badgeClass}" style="white-space: nowrap;">
                  ${badgeText}
                </span>
              </div>
              <div class="meal-desc" style="font-size: var(--font-xs); color: var(--text-tertiary); margin-top: 1px; margin-bottom: 2px;">${meal.desc}</div>
              <div class="meal-cutoff-subtitle" style="font-size: var(--font-xs); color: var(--text-tertiary); margin-top: 4px; display: flex; align-items: center;">
                ${subtitleIcon}
                ${isLocked ? 'Deadline was ' : 'Cutoff: '}${Utils.formatTime(meal.deadline)}
              </div>
            </div>
          </div>
          <div class="quantity-selector ${isLocked ? 'disabled' : ''}">
            <button class="qty-btn qty-minus" type="button" 
                    ${isLocked || mealCount <= 0 ? 'disabled' : ''} 
                    onclick="Messliner.userDashboard.adjustMealCount('${meal.type}', -1)">-</button>
            <span class="qty-val">${mealCount}</span>
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
      <div class="quick-action-card" onclick="Messliner.router.navigate('users')">
        <div class="quick-action-icon" style="background:var(--primary-100);color:var(--primary-600);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        </div>
        <span>Add Member</span>
      </div>
      <div class="quick-action-card" onclick="Messliner.router.navigate('meals')">
        <div class="quick-action-icon" style="background:var(--accent-100);color:var(--accent-600);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
        </div>
        <span>Add Meals</span>
      </div>
      <div class="quick-action-card" onclick="Messliner.finance.showDepositModal()">
        <div class="quick-action-icon" style="background:var(--warning-100);color:var(--warning-600);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </div>
        <span>Add Deposit</span>
      </div>
      <div class="quick-action-card" onclick="Messliner.finance.showOtherCostingModal()">
        <div class="quick-action-icon" style="background:var(--warning-100);color:var(--warning-700);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <span>Other Costing</span>
      </div>
      <div class="quick-action-card" onclick="Messliner.finance.showBazarModal()">
        <div class="quick-action-icon" style="background:var(--danger-100);color:var(--danger-600);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
        </div>
        <span>Add Bazar</span>
      </div>
      <div class="quick-action-card" onclick="Messliner.finance.showFinanceFixModal()">
        <div class="quick-action-icon" style="background:rgba(239,68,68,0.12);color:#ef4444;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </div>
        <span>Finance Fix</span>
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

      // ---- Render Meal Toggle History (separate beautiful section) ----
      const toggleContainer = document.getElementById('mealToggleHistory');
      const toggleSection = document.getElementById('mealToggleSection');
      if (toggleContainer) {
        // Only show section for members
        if (toggleSection) toggleSection.style.display = 'block';

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
      }

    } else {
      // Admin/Manager: hide the Meal Toggle History section (admin doesn't toggle meals)
      const toggleSection = document.getElementById('mealToggleSection');
      if (toggleSection) toggleSection.style.display = 'none';

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
