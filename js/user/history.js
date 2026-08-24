/* ============================================
   Messliner — User History (user/history.js)
   ============================================ */

const HistoryModule = {
  init(diningId, userId) {
    this.diningId = diningId;
    this.userId = userId;
    this.mealsBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
    this.settings = {};
    this.isAiProcessing = false;

    this.selectedYear = new Date().getFullYear();
    this.selectedMonth = new Date().getMonth() + 1;
    this.createdDate = new Date(2026, 0, 1);

    // Listen to deposits for this user
    db.ref(`dinings/${diningId}/deposits`).orderByChild('userId').equalTo(userId).on('value', (snap) => {
      const deposits = [];
      snap.forEach(child => deposits.push(child.val()));
      deposits.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      this.userDepositsList = deposits;
      this.renderDepositHistory(deposits);
      if (this.currentUserData) this.renderProfile(this.currentUserData);
    });

    // Listen to settings
    db.ref(`dinings/${diningId}/settings`).on('value', (snap) => {
      this.settings = snap.val() || {};
      if (this.currentUserData) this.renderProfile(this.currentUserData);
      this.applyAiAssistantSettings();
    });

    // Listen to meals breakdown
    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      this.mealsBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
      const allMeals = snap.val() || {};
      this.cachedMeals = allMeals;
      Object.values(allMeals).forEach(monthData => {
        Object.values(monthData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeof typeData === 'object' && typeData[this.userId] !== undefined) {
              const count = parseFloat(typeData[this.userId]) || 0;
              if (this.mealsBreakdown[type] !== undefined) {
                this.mealsBreakdown[type] += count;
              }
            }
          });
        });
      });
      if (this.currentUserData) this.renderProfile(this.currentUserData);
    });

    // Listen to user data for profile
    db.ref(`dinings/${diningId}/users/${userId}`).on('value', (snap) => {
      const user = snap.val();
      if (user) {
        this.currentUserData = user;
        this.renderProfile(user);
        if (window._aiRefreshGreeting) {
          window._aiRefreshGreeting();
        }
      }
    });

    // Listen to all users in the dining group to resolve names in logs
    db.ref(`dinings/${diningId}/users`).on('value', (snap) => {
      this.usersMap = snap.val() || {};
      this.renderHistoryPage();
    });

    // Listen to dining info details (name and messCode)
    db.ref(`dinings/${diningId}/info`).on('value', (snap) => {
      this.diningInfo = snap.val() || {};
      if (this.currentUserData) this.renderProfile(this.currentUserData);

      const createdAt = this.diningInfo.createdAt;
      this.createdDate = createdAt ? new Date(createdAt) : new Date(2026, 0, 1);
      this.populateYearDropdown();
      this.populateMonthDropdown();
    });
    this.listenToLogs();
    // Setup password validation listeners
    this.setupPasswordValidation();
    // Setup profile info validation listeners
    this.setupProfileInfoValidation();

    // Close dropdowns on outside click
    if (!this._clickListenerAdded) {
      document.addEventListener('click', () => {
        const d1 = document.getElementById('historyMonthDropdown');
        const d2 = document.getElementById('historyYearDropdown');
        if (d1) d1.classList.remove('active');
        if (d2) d2.classList.remove('active');
      });
      this._clickListenerAdded = true;
    }
    this.setupAiChatbotListeners();
  },

  refresh() {
    if (window._aiRefreshGreeting) {
      window._aiRefreshGreeting();
    }
    if (window._aiChatManager) {
      window._aiChatManager.init();
    }
  },
  /**
   * Render user profile header
   */
  renderProfile(user) {
    Utils.setText('profileName', user.name || 'Unknown');
    Utils.setText('profileRole', user.role === 'admin' ? 'Meal Manager' : 'Dining Member');

    const avatar = document.getElementById('profileAvatar');
    if (avatar) avatar.textContent = Utils.initials(user.name);

    // Render Impersonation View Switcher Button if actual database role is admin
    const currentViewRole = Messliner.state.role || 'user';
    const actualRole = Messliner.state.actualRole || (Messliner.state.user && user.role) || 'user';
    const switchArea = document.getElementById('profileViewSwitchArea');
    if (switchArea) {
      if (actualRole === 'admin') {
        const isCurrentlyAdminMode = currentViewRole === 'admin';
        switchArea.style.display = 'block';
        switchArea.innerHTML = `
          <button onclick="Messliner.history.toggleViewMode()" class="card glass-card" style="
            background: rgba(255, 255, 255, 0.45);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid ${isCurrentlyAdminMode ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.18)'};
            box-shadow: 0 4px 16px rgba(5, 150, 105, 0.05);
            border-radius: var(--radius-xl);
            padding: var(--space-3) var(--space-5);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-3);
            margin: 0;
            width: 100%;
            cursor: pointer;
            color: ${isCurrentlyAdminMode ? 'var(--primary-700)' : '#1D4ED8'};
            font-size: var(--font-sm);
            font-weight: var(--weight-bold);
            transition: all 0.2s ease;
          " onmouseenter="this.style.background='rgba(255, 255, 255, 0.65)'; this.style.transform='translateY(-1px)';"
            onmouseleave="this.style.background='rgba(255, 255, 255, 0.45)'; this.style.transform='translateY(0)';"
            title="Click to switch view mode">
            
            <div style="
              width: 32px;
              height: 32px;
              border-radius: var(--radius-md);
              background: ${isCurrentlyAdminMode ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)'};
              display: flex;
              align-items: center;
              justify-content: center;
              color: ${isCurrentlyAdminMode ? 'var(--primary-600)' : '#2563EB'};
              flex-shrink: 0;
              border: 1px solid ${isCurrentlyAdminMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)'};
            ">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 2.1l4 4-4 4" />
                <path d="M3 6.1h18" />
                <path d="M7 21.9l-4-4 4-4" />
                <path d="M21 17.9H3" />
              </svg>
            </div>
            <span style="letter-spacing: 0.01em;">${isCurrentlyAdminMode ? 'Switch to Member' : 'Switch to Manager'}</span>
          </button>
        `;
      } else {
        switchArea.style.display = 'none';
        switchArea.innerHTML = '';
      }
    }

    // Update Dining Info Card
    const diningNameEl = document.getElementById('profileDiningName');
    const diningJoinIdEl = document.getElementById('profileDiningJoinId');
    const totalMembersEl = document.getElementById('profileTotalMembers');
    const joinedSinceEl = document.getElementById('profileJoinedSince');

    if (diningNameEl) diningNameEl.textContent = (this.diningInfo && this.diningInfo.name) || 'Messliner Mess';
    if (diningJoinIdEl) diningJoinIdEl.textContent = (this.diningInfo && this.diningInfo.messCode) || '-';
    if (totalMembersEl) {
      const count = this.usersMap ? Object.keys(this.usersMap).length : 0;
      totalMembersEl.textContent = `${count} ${count === 1 ? 'member' : 'members'}`;
    }
    if (joinedSinceEl) {
      const joinedTime = user.createdAt ? new Date(user.createdAt) : null;
      joinedSinceEl.textContent = joinedTime
        ? `Since ${joinedTime.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
        : 'Since setup';
    }

    const isMember = currentViewRole !== 'admin';
    const statsHistory = document.getElementById('profileStatsAndHistory');
    const settingsSection = document.getElementById('profileSettingsSection');

    if (statsHistory) {
      statsHistory.style.display = isMember ? 'none' : 'block';
    }

    if (settingsSection) {
      settingsSection.classList.toggle('hidden', !isMember);
      settingsSection.style.display = isMember ? 'block' : 'none';
      if (isMember) {
        const nameInput = document.getElementById('profileNameInput');
        const phoneInput = document.getElementById('profilePhoneInput');
        const emailInput = document.getElementById('profileEmailInput');
        if (nameInput && !nameInput.matches(':focus')) {
          nameInput.value = user.name || '';
        }
        if (emailInput) {
          emailInput.value = user.email || (Messliner.state.user && Messliner.state.user.email) || '';
        }
        if (phoneInput && !phoneInput.matches(':focus')) {
          phoneInput.value = user.phone || '';
        }
        if (this.validateProfileInfo) {
          this.validateProfileInfo();
        }
      }
    }

    // Profile stats
    this.currentUserData = user;
    const mealRate = Messliner.state.mealRate || 0;
    const rateMode = this.settings?.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (this.settings?.fixedRates || null) : null;
    const mealCost = Utils.calcMealCost(mealRate, user.totalMeals, this.mealsBreakdown, fixedRates);

    // Calculate dynamic deposits, other costing, deductions from userDepositsList
    let userDeposit = 0;
    let userOtherCost = 0;
    let userDeduction = 0;

    (this.userDepositsList || []).forEach(d => {
      const amt = Math.abs(Utils.num(d.amount));
      if (d.type === 'deposit') {
        userDeposit += amt;
      } else if (d.type === 'other_costing') {
        userOtherCost += amt;
      } else if (d.type === 'deduction' || d.type === 'friday_meal') {
        userDeduction += amt;
      }
    });

    const totalCost = mealCost + userOtherCost;
    const balance = userDeposit - totalCost - userDeduction;

    const container = document.getElementById('profileStats');
    if (container) {
      container.style.display = 'grid';
      container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(130px, 1fr))';
      container.style.gap = 'var(--space-3)';
      container.style.marginBottom = 'var(--space-5)';

      container.innerHTML = `
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Deposit</div>
            <div class="stat-value" style="font-size:var(--font-lg);">${Utils.currency(userDeposit)}</div>
          </div>
        </div>
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Meals</div>
            <div class="stat-value" style="font-size:var(--font-lg);">${user.totalMeals || 0}</div>
          </div>
        </div>
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Meal Cost</div>
            <div class="stat-value" style="font-size:var(--font-lg);">${Utils.currency(mealCost)}</div>
          </div>
        </div>
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Other Cost</div>
            <div class="stat-value" style="font-size:var(--font-lg);">${Utils.currency(userOtherCost)}</div>
          </div>
        </div>
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Deduction</div>
            <div class="stat-value" style="font-size:var(--font-lg); color:var(--danger-600);">${Utils.currency(userDeduction)}</div>
          </div>
        </div>
        <div class="stat-card card-compact">
          <div class="stat-info text-center">
            <div class="stat-label">Total Cost</div>
            <div class="stat-value" style="font-size:var(--font-lg);">${Utils.currency(totalCost)}</div>
          </div>
        </div>
        <div class="stat-card card-compact" style="grid-column: 1 / -1;">
          <div class="stat-info text-center">
            <div class="stat-label" style="font-weight:var(--weight-bold);">Balance</div>
            <div class="stat-value" style="font-size:var(--font-xl);font-weight:var(--weight-bold);color:${balance >= 0 ? 'var(--accent-600)' : 'var(--danger-600)'};">${Utils.currency(balance)}</div>
          </div>
        </div>
      `;
    }

    // Set AI Auto Meal Toggle State (Dedicated AI Assistant page)
    const aiToggle = document.getElementById('aiAutoMealToggle');
    if (aiToggle) {
      aiToggle.checked = !!user.autoMealEnabled;
    }
  },

  async updateProfileInfo() {
    const nameInput = document.getElementById('profileNameInput');
    const phoneInput = document.getElementById('profilePhoneInput');
    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name) {
      Notifications.toast('warning', 'Validation Error', 'Full name is required.');
      return;
    }

    try {
      await db.ref(`dinings/${this.diningId}/users/${this.userId}`).update({
        name,
        phone
      });
      Notifications.toast('success', 'Success', 'Profile updated successfully.');
      await Notifications.log(this.diningId, 'user_updated', `Profile updated by user`, this.userId, this.userId);
    } catch (error) {
      console.error('[HistoryModule] Update profile error:', error);
      Notifications.toast('error', 'Error', 'Failed to update profile.');
    }
  },

  async changePassword() {
    const newPassInput = document.getElementById('profileNewPasswordInput');
    const confirmPassInput = document.getElementById('profileConfirmPasswordInput');
    if (!newPassInput || !confirmPassInput) return;

    const newPassword = newPassInput.value;
    const confirmPassword = confirmPassInput.value;

    if (!newPassword || newPassword.length < 8) {
      Notifications.toast('warning', 'Validation Error', 'Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Notifications.toast('warning', 'Validation Error', 'Passwords do not match.');
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        Notifications.toast('error', 'Error', 'No authenticated user found.');
        return;
      }
      await user.updatePassword(newPassword);
      Notifications.toast('success', 'Success', 'Password updated successfully.');
      await Notifications.log(this.diningId, 'security_updated', `Password changed by user`, this.userId, this.userId);
      newPassInput.value = '';
      confirmPassInput.value = '';
      const btnUpdate = document.getElementById('btnUpdatePassword');
      if (btnUpdate) btnUpdate.disabled = true;
    } catch (error) {
      console.error('[HistoryModule] Change password error:', error);
      if (error.code === 'auth/requires-recent-login') {
        Notifications.toast('error', 'Authentication Error', 'Please sign out and sign back in to change password.');
      } else {
        Notifications.toast('error', 'Error', error.message || 'Failed to update password.');
      }
    }
  },

  setupPasswordValidation() {
    const newPassInput = document.getElementById('profileNewPasswordInput');
    const confirmPassInput = document.getElementById('profileConfirmPasswordInput');
    const btnUpdate = document.getElementById('btnUpdatePassword');
    const errorEl = document.getElementById('passwordValidationError');

    if (!newPassInput || !confirmPassInput || !btnUpdate) return;

    const validate = () => {
      const newPass = newPassInput.value;
      const confirmPass = confirmPassInput.value;

      let errorMsg = '';
      let isValid = true;

      if (newPass.length > 0 || confirmPass.length > 0) {
        if (newPass.length < 8) {
          errorMsg = 'Password must be at least 8 characters long.';
          isValid = false;
        } else if (confirmPass.length > 0 && newPass !== confirmPass) {
          errorMsg = 'Passwords do not match.';
          isValid = false;
        } else if (confirmPass.length === 0) {
          isValid = false;
        }
      } else {
        isValid = false;
      }

      if (errorEl) {
        if (errorMsg) {
          errorEl.textContent = errorMsg;
          errorEl.style.display = 'block';
        } else {
          errorEl.style.display = 'none';
        }
      }

      btnUpdate.disabled = !isValid;
    };

    newPassInput.addEventListener('input', validate);
    confirmPassInput.addEventListener('input', validate);
  },

  setupProfileInfoValidation() {
    const nameInput = document.getElementById('profileNameInput');
    const phoneInput = document.getElementById('profilePhoneInput');
    const btnSave = document.getElementById('btnSaveProfile');
    const phoneErrorEl = document.getElementById('phoneValidationError');

    if (!nameInput || !phoneInput || !btnSave) return;

    this.validateProfileInfo = () => {
      const name = nameInput.value.trim();
      const phone = phoneInput.value.trim();

      const phoneRegex = /^\d{11}$/;
      const isPhoneValid = phoneRegex.test(phone);
      const isNameValid = name.length > 0;

      if (phoneErrorEl) {
        if (!isPhoneValid && phone.length > 0) {
          phoneErrorEl.style.display = 'block';
        } else {
          phoneErrorEl.style.display = 'none';
        }
      }

      btnSave.disabled = !isPhoneValid || !isNameValid;
    };

    nameInput.addEventListener('input', this.validateProfileInfo);
    phoneInput.addEventListener('input', this.validateProfileInfo);
  },

  /**
   * Render deposit history timeline
   */
  renderDepositHistory(deposits) {
    const container = document.getElementById('profileDepositHistory');
    if (!container) return;

    if (deposits.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <h3>No Deposits</h3>
          <p>Your deposit history will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = deposits.map(d => {
      const isDeposit = d.type === 'deposit';
      const isOtherCosting = d.type === 'other_costing';
      const isDeduction = d.type === 'deduction';

      let dotClass, sign, color, typeLabel;
      if (isDeposit) {
        dotClass = 'accent'; sign = '+'; color = 'var(--accent-600)'; typeLabel = 'Deposit';
      } else if (isOtherCosting) {
        dotClass = 'primary'; sign = '-'; color = 'var(--primary-600)'; typeLabel = 'Other Costing';
      } else {
        dotClass = 'danger'; sign = '-'; color = 'var(--danger-600)'; typeLabel = 'Deduction';
      }

      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <div class="timeline-date">${Utils.formatDate(d.date)} · ${Utils.timeAgo(d.timestamp)}</div>
            <div class="flex items-center justify-between" style="gap: var(--space-3);">
              <div style="min-width: 0; flex: 1;">
                <div class="timeline-title">${d.note || typeLabel}</div>
                <div style="font-size:var(--font-xs); color:var(--text-tertiary); margin-top:2px;">${typeLabel}</div>
              </div>
              <div style="font-weight:var(--weight-bold);color:${color};white-space:nowrap; flex-shrink: 0; text-align: right;">
                ${sign}${Utils.currency(Math.abs(d.amount))}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Render meal history (monthly breakdown)
   */
  renderMealHistory(diningId, userId, cachedMeals = null) {
    const container = document.getElementById('profileMealHistory');
    if (!container) return;

    const mealsToProcess = cachedMeals || this.cachedMeals;

    const processMeals = (allMeals) => {
      const userMeals = [];

      // Collect all meals for this user
      Object.entries(allMeals).forEach(([month, monthData]) => {
        Object.entries(monthData).forEach(([day, dayData]) => {
          let dayTotal = 0;
          const mealTypes = {};
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeData[userId]) {
              const count = parseInt(typeData[userId]) || 0;
              mealTypes[type] = count;
              dayTotal += count;
            }
          });
          if (dayTotal > 0) {
            userMeals.push({
              date: `${month}-${day}`,
              meals: mealTypes,
              total: dayTotal
            });
          }
        });
      });

      // Sort descending
      userMeals.sort((a, b) => b.date.localeCompare(a.date));

      if (userMeals.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-6);">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/></svg>
            </div>
            <h3>No Meal Records</h3>
            <p>Your meal history will appear here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>☀️ B</th>
                <th>🍱 L</th>
                <th>🌙 D</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${userMeals.slice(0, 30).map(m => `
                <tr>
                  <td>${Utils.formatDate(m.date)}</td>
                  <td>${m.meals.breakfast || '—'}</td>
                  <td>${m.meals.lunch || '—'}</td>
                  <td>${m.meals.dinner || '—'}</td>
                  <td><strong>${m.total}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    if (mealsToProcess) {
      processMeals(mealsToProcess);
    } else {
      db.ref(`dinings/${diningId}/meals`).once('value').then(snap => {
        processMeals(snap.val() || {});
      });
    }
  },

  /**
   * Refresh history
   */
  refresh() {
    if (this.diningId && this.userId) {
      this.renderMealHistory(this.diningId, this.userId, this.cachedMeals);
      // If we already have cached data, re-render profile immediately
      // so refreshing the page while on profile doesn't show "Loading..."
      if (this.currentUserData) {
        this.renderProfile(this.currentUserData);
      }
      this.applyAiAssistantSettings();
    }
  },

  /**
   * Render recent activity timeline on History page
   */
  renderHistoryPage() {
    const container = document.getElementById('historyActivityTimeline');
    if (!container) return;
    // Exclude group updates and individual meal toggles (only process normal meal sheet updates)
    const rawLogs = (this.globalLogs || []).filter(log => {
      const action = log.action || '';
      if (action === 'meals_updated' || action === 'meal_toggled' ||
        action === 'meal_completed' || action === 'meals_updated_group') {
        return false;
      }

      // Filter by selected Month and Year
      if (!log.timestamp) return false;
      const logDate = new Date(log.timestamp);
      const logYear = logDate.getFullYear();
      const logMonth = logDate.getMonth() + 1;
      return logYear === this.selectedYear && logMonth === this.selectedMonth;
    });

    // Group logs by batchId
    const groupedLogs = [];
    const batches = {}; // batchId -> array of logs

    rawLogs.forEach(log => {
      if (log.batchId) {
        if (!batches[log.batchId]) {
          batches[log.batchId] = [];
        }
        batches[log.batchId].push(log);
      } else {
        // Deep copy to prevent mutating cached state
        groupedLogs.push({ ...log });
      }
    });

    // Process batches and convert them to summary log entries
    Object.entries(batches).forEach(([batchId, batchList]) => {
      // Sort batchList by timestamp just in case, use the first/latest log as the base
      batchList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const baseLog = { ...batchList[0] };

      // Sum counts by meal type
      const counts = { Breakfast: 0, Lunch: 0, Dinner: 0 };
      let verb = 'updated';

      batchList.forEach(item => {
        const details = item.details || '';
        // details pattern: "Updated Breakfast: 2 meals" or "Completed Lunch: 3 meals" or "2 Lunch saved"
        const match = details.match(/(?:Updated|Completed)?\s*(\w+)\s*:\s*([\d.]+)\s*meals/i) ||
          details.match(/([\d.]+)\s+(\w+)\s+(saved|added|completed)/i);

        if (match) {
          let type = '';
          let count = 0;
          if (match[2] && !isNaN(parseFloat(match[2]))) {
            type = match[1];
            count = parseFloat(match[2]);
          } else {
            type = match[2];
            count = parseFloat(match[1]);
            verb = match[3] || verb;
          }

          // Capitalize type
          const capType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          if (counts[capType] !== undefined) {
            counts[capType] += count;
          }
        }
      });

      // Build summary description, e.g. "13 Lunch & 12 Dinner saved"
      const summaryParts = [];
      Object.entries(counts).forEach(([type, count]) => {
        if (count > 0) {
          summaryParts.push(`${count} ${type}`);
        }
      });

      if (summaryParts.length > 0) {
        baseLog.details = `${summaryParts.join(' & ')} ${verb}`;
      }

      groupedLogs.push(baseLog);
    });

    // Re-sort groupedLogs by timestamp descending so the timeline is correctly ordered
    groupedLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (groupedLogs.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-8) var(--space-4);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p style="margin-top:var(--space-2);font-size:var(--font-sm);color:var(--text-secondary);">No history logs found yet.</p>
        </div>
      `;
      return;
    }

    let html = groupedLogs.map(log => {
      let title = 'Activity Log';
      let dotClass = '';
      let borderColor = 'var(--gray-300)';
      let iconBg = 'var(--gray-50)';
      let iconColor = 'var(--gray-600)';
      let svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

      const action = log.action || '';

      if (action === 'user_added' || action === 'member_joined') {
        title = 'Member Joined';
        dotClass = 'accent';
        borderColor = 'var(--accent-500)';
        iconBg = 'var(--accent-50)';
        iconColor = 'var(--accent-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`;
      } else if (action === 'bazar_added') {
        title = 'Bazar Expense Added';
        dotClass = 'warning';
        borderColor = '#F97316';
        iconBg = 'rgba(249, 115, 22, 0.06)';
        iconColor = '#F97316';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
      } else if (action === 'other_costing_added') {
        title = 'Other Costing Applied';
        dotClass = 'danger';
        borderColor = 'var(--danger-500)';
        iconBg = 'var(--danger-50)';
        iconColor = 'var(--danger-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
      } else if (action === 'deposit_added') {
        title = 'Deposit Received';
        dotClass = 'accent';
        borderColor = 'var(--primary-500)';
        iconBg = 'var(--primary-50)';
        iconColor = 'var(--primary-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
      } else if (action === 'deduction_added') {
        title = 'Deduction Applied';
        dotClass = 'danger';
        borderColor = 'var(--danger-500)';
        iconBg = 'var(--danger-50)';
        iconColor = 'var(--danger-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
      } else if (action === 'friday_bazar_deducted') {
        title = 'Friday Meal Deduction';
        dotClass = 'danger';
        borderColor = 'var(--danger-500)';
        iconBg = 'var(--danger-50)';
        iconColor = 'var(--danger-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
      } else if (action === 'meal_toggled') {
        title = 'Meal Status Updated';
        dotClass = 'accent';
        borderColor = 'var(--primary-400)';
        iconBg = 'var(--primary-50)';
        iconColor = 'var(--primary-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M22 4L12 14.01l-3-3"/></svg>`;
      } else if (action === 'meals_updated') {
        title = 'Meal Sheet Updated';
        dotClass = 'warning';
        borderColor = 'var(--warning-500)';
        iconBg = 'var(--warning-50)';
        iconColor = 'var(--warning-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`;
      } else if (action === 'user_deleted') {
        title = 'Member Deleted';
        dotClass = 'danger';
        borderColor = 'var(--danger-600)';
        iconBg = 'var(--danger-50)';
        iconColor = 'var(--danger-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`;
      } else if (action === 'settings_updated') {
        title = 'Settings Updated';
        dotClass = '';
        borderColor = 'var(--primary-400)';
        iconBg = 'var(--primary-50)';
        iconColor = 'var(--primary-600)';
        svgIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      }

      let actor = 'System';
      if (log.performedBy === 'manager') {
        actor = 'Manager';
      } else if (log.performedBy === this.userId) {
        actor = 'You';
      } else if (log.performedBy && log.performedBy !== 'system') {
        if (this.usersMap && this.usersMap[log.performedBy]) {
          actor = this.usersMap[log.performedBy].name || 'Manager';
        } else {
          actor = 'Manager';
        }
      }

      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content" style="border-left: 4px solid ${borderColor}; box-shadow: var(--shadow-sm); display: flex; gap: var(--space-4); align-items: flex-start;">
            <div style="background: ${iconBg}; color: ${iconColor}; width: 36px; height: 36px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
              ${svgIcon}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div class="flex items-center justify-between" style="gap: var(--space-2); margin-bottom: 2px;">
                <span class="timeline-title" style="font-size: var(--font-base); font-weight: var(--weight-bold);">${title}</span>
                <span class="timeline-date" style="margin-bottom: 0; white-space: nowrap;">${Utils.timeAgo(log.timestamp)}</span>
              </div>
              <div class="timeline-desc" style="margin-top: var(--space-1.5); font-size: var(--font-sm); line-height: 1.4;">${Utils.formatActivityDetails(log.details)}</div>
              <div style="font-size: 11px; color: var(--text-tertiary); margin-top: var(--space-2); display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Performed by: <strong>${actor}</strong></span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Setup timeline collapse/expand controls
    html += this._setupTimelineCollapse(container, groupedLogs.length);
    container.innerHTML = html;
  },

  listenToLogs() {
    if (!this.diningId) return;

    if (this._logsRef) {
      this._logsRef.off();
    }

    const startTimestamp = new Date(this.selectedYear, this.selectedMonth - 1, 1, 0, 0, 0, 0).getTime();
    const endTimestamp = new Date(this.selectedYear, this.selectedMonth, 1, 0, 0, 0, 0).getTime() - 1;

    this._logsRef = db.ref(`dinings/${this.diningId}/logs`)
      .orderByChild('timestamp')
      .startAt(startTimestamp)
      .endAt(endTimestamp);

    this._logsRef.on('value', (snap) => {
      const logs = [];
      snap.forEach(child => {
        logs.push(child.val());
      });
      logs.reverse();
      this.globalLogs = logs;
      this.renderHistoryPage();
    });
  },

  refreshHistoryPage() {
    this.listenToLogs();
  },

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  populateYearDropdown() {
    const valueEl = document.getElementById('historyYearValue');
    const menuEl = document.getElementById('historyYearMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate ? this.createdDate.getFullYear() : 2026;
    const endYear = new Date().getFullYear();

    let itemsHTML = '';
    for (let y = startYear; y <= endYear; y++) {
      const isSelected = y === this.selectedYear;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${y}" 
             onclick="Messliner.history.selectYear(${y})">
          ${y}
        </div>
      `;
    }
    menuEl.innerHTML = itemsHTML;
    valueEl.textContent = this.selectedYear;
  },

  selectYear(year) {
    this.selectedYear = year;
    const dropdown = document.getElementById('historyYearDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.listenToLogs();
  },

  populateMonthDropdown() {
    const valueEl = document.getElementById('historyMonthValue');
    const menuEl = document.getElementById('historyMonthMenu');
    if (!valueEl || !menuEl) return;

    const startYear = this.createdDate ? this.createdDate.getFullYear() : 2026;
    const currentYear = new Date().getFullYear();

    let startMonth = 1;
    let endMonth = 12;

    if (this.selectedYear === startYear) {
      startMonth = this.createdDate ? this.createdDate.getMonth() + 1 : 1;
    }
    if (this.selectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    if (this.selectedMonth < startMonth) {
      this.selectedMonth = startMonth;
    } else if (this.selectedMonth > endMonth) {
      this.selectedMonth = endMonth;
    }

    let itemsHTML = '';
    for (let m = startMonth; m <= endMonth; m++) {
      const isSelected = m === this.selectedMonth;
      itemsHTML += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" 
             data-value="${m}" 
             onclick="Messliner.history.selectMonth(${m})">
          ${this.monthNames[m - 1]}
        </div>
      `;
    }
    menuEl.innerHTML = itemsHTML;
    valueEl.textContent = this.monthNames[this.selectedMonth - 1];
  },

  selectMonth(month) {
    this.selectedMonth = month;
    const dropdown = document.getElementById('historyMonthDropdown');
    if (dropdown) dropdown.classList.remove('active');
    this.populateMonthDropdown();
    this.listenToLogs();
  },

  _setupTimelineCollapse(container, displayLogsCount) {
    if (displayLogsCount <= 4) {
      container.classList.remove('collapsed');
      return '';
    }

    const isFirstRender = !container.querySelector('.timeline-item');
    const isCollapsed = isFirstRender ? true : container.classList.contains('collapsed');

    if (isCollapsed) {
      container.classList.add('collapsed');
    } else {
      container.classList.remove('collapsed');
    }

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

  // ─── AI CHATBOT & AUTO MEAL METHODS ──────────────────────

  async toggleAiAutoMeal(checked) {
    try {
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/autoMealEnabled`).set(checked);
      Notifications.toast('success', 'Auto Meal Updated', `AI Auto Meal has been turned ${checked ? 'ON' : 'OFF'}.`);
    } catch (err) {
      console.error(err);
      Notifications.toast('error', 'Error', 'Failed to update Auto Meal toggle.');
    }
  },

  appendBotMessage(text) {
    const win = document.getElementById('aiChatWindow');
    if (!win) return;

    // Remove loading dots if present
    const loader = document.getElementById('aiChatLoader');
    if (loader) loader.remove();

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const el = document.createElement('div');
    el.className = 'ai-msg-row';
    el.innerHTML = `
      <div style="max-width: 85%;">
        <div class="ai-chat-bubble-bot">${text}</div>
        <div class="ai-msg-time">${timeStr}</div>
      </div>
    `;
    win.appendChild(el);
    requestAnimationFrame(() => { win.scrollTop = win.scrollHeight; });

    // Save message to current session
    if (window._aiChatManager) {
      window._aiChatManager.saveMessage('bot', text, timeStr);
    }
  },

  appendUserMessage(text) {
    const win = document.getElementById('aiChatWindow');
    if (!win) return;

    // Hide welcome block on first message
    const welcomeBlock = document.getElementById('aiWelcomeBlock');
    if (welcomeBlock) welcomeBlock.style.display = 'none';

    // Update history sidebar with first message text
    if (window._aiAddHistoryEntry) window._aiAddHistoryEntry(text);

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = 'ai-msg-row user-row';
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-end;max-width: 85%;">
        <div class="ai-chat-bubble-user">${text}</div>
        <div class="ai-msg-time">${timeStr}</div>
      </div>
    `;
    win.appendChild(el);
    requestAnimationFrame(() => { win.scrollTop = win.scrollHeight; });

    // Save message to current session
    if (window._aiChatManager) {
      window._aiChatManager.saveMessage('user', text, timeStr);
    }
  },

  showChatLoading() {
    const win = document.getElementById('aiChatWindow');
    if (!win) return;
    const el = document.createElement('div');
    el.className = 'ai-msg-row';
    el.id = 'aiChatLoader';
    el.innerHTML = `
      <div style="max-width: 85%;">
        <div class="ai-chat-bubble-bot" style="display:flex;align-items:center;gap:6px;">
          <span class="ai-loading-dots">
            <span class="ai-loading-dot"></span>
            <span class="ai-loading-dot"></span>
            <span class="ai-loading-dot"></span>
          </span>
          <span style="font-size:0.75rem;color:#6B7280;">Messliner AI is typing…</span>
        </div>
      </div>
    `;
    win.appendChild(el);
    requestAnimationFrame(() => { win.scrollTop = win.scrollHeight; });
  },

  async sendAiChatMessage() {
    if (this.isAiProcessing) return;
    const input = document.getElementById('aiChatInput');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    this.isAiProcessing = true;

    // Disable inputs and send buttons
    input.readOnly = true;
    const btnSend = document.querySelector('.ai-send-btn');
    if (btnSend) btnSend.disabled = true;

    // Disable attach routine input/label if applicable
    const uploadLabel = document.getElementById('aiRoutineUploadLabel');
    if (uploadLabel) {
      uploadLabel.style.pointerEvents = 'none';
      uploadLabel.style.opacity = '0.5';
    }

    input.value = '';
    this.appendUserMessage(msg);
    this.showChatLoading();

    try {
      // 1. Fetch current status of meals & mess tracked meals settings
      const statusSnap = await db.ref(`dinings/${this.diningId}/users/${this.userId}/mealStatus`).once('value');
      const mealStatus = statusSnap.val() || { breakfast: 1, lunch: 1, dinner: 1 };

      const trackedMeals = (this.settings && this.settings.trackedMeals) || { breakfast: true, lunch: true, dinner: true };
      const activeMealTypes = [];
      if (trackedMeals.breakfast !== false) activeMealTypes.push('breakfast');
      if (trackedMeals.lunch !== false) activeMealTypes.push('lunch');
      if (trackedMeals.dinner !== false) activeMealTypes.push('dinner');

      const activeMealsStatusText = activeMealTypes.map(m => `${m.charAt(0).toUpperCase() + m.slice(1)}: ${mealStatus[m] ? '1 (ON)' : '0 (OFF)'}`).join(', ');

      // 2. Fetch dining mess context details (rules, finances, bazaar) to answer general questions
      let rules = "1. Turn off meals before deadline.\n2. Do bazar duties on time.";
      if (this.settings && this.settings.rules) {
        rules = this.settings.rules;
      }

      const userDeposit = (Messliner.userDashboard && Messliner.userDashboard.monthlyDeposit) || 0;
      const mealRate = Messliner.state.monthlyMealRate || 0;
      const monthlyMeals = (Messliner.userDashboard && Messliner.userDashboard.monthlyMeals) || 0;
      const rateMode = (this.settings && this.settings.rateMode) || 'market';
      const fixedRates = rateMode === 'fixed' ? ((this.settings && this.settings.fixedRates) || null) : null;
      const mealCost = Utils.calcMealCost(mealRate, monthlyMeals, (Messliner.userDashboard && Messliner.userDashboard.monthlyMealsBreakdown) || { breakfast: 0, lunch: 0, dinner: 0 }, fixedRates);
      const otherCosting = (Messliner.userDashboard && Messliner.userDashboard.monthlyOtherCosting) || 0;
      const deduction = (Messliner.userDashboard && Messliner.userDashboard.monthlyDeduction) || 0;
      const totalCost = mealCost + otherCosting;
      const balance = userDeposit - totalCost - deduction;

      const profileContext = {
        userName: this.currentUserData?.name || 'Member',
        email: this.currentUserData?.email || '',
        phone: this.currentUserData?.phone || '',
        role: this.currentUserData?.role || 'member',
        monthlyDeposit: userDeposit,
        monthlyMealsCount: monthlyMeals,
        mealsBreakdown: (Messliner.userDashboard && Messliner.userDashboard.monthlyMealsBreakdown) || { breakfast: 0, lunch: 0, dinner: 0 },
        mealCost: mealCost,
        otherCost: otherCosting,
        deduction: deduction,
        totalCost: totalCost,
        balance: balance,
        mealRate: mealRate
      };

      // Get recent bazaar transactions for context
      const bazarSnap = await db.ref(`dinings/${this.diningId}/bazar`).once('value');
      const bazaarData = bazarSnap.val() || {};
      const recentExpenses = Object.values(bazaarData).slice(-10).map(b => ({
        date: b.date || '',
        shopper: b.shopper || '',
        amount: b.amount || 0,
        item: b.item || (b.items && b.items[0]?.name) || 'Bazar Item'
      }));

      const prompt = `
        User prompt/question: "${msg}"
        
        CONTEXT DATA FOR THIS USER & MESS:
        - Current User Profile & Stats: ${JSON.stringify(profileContext, null, 2)}
        - Mess Rules: "${rules}"
        - Recent Bazaar Purchases: ${JSON.stringify(recentExpenses, null, 2)}
        - Typical Menu: Breakfast is Khichuri/Egg, Lunch is Rice/Chicken/Dal, Dinner is Rice/Fish or Beef/Dal.
        - Active Tracked Meals in Mess (ONLY THESIS ARE ENABLED): ${activeMealTypes.join(', ')}
        - Current Status of Active Meals: ${activeMealsStatusText || 'None'}
        
        INSTRUCTIONS:
        1. If the user wants to turn a meal ON or OFF, output the intent "toggle_meal" and specify which meals to change.
           CRITICAL RULES FOR MEALS:
           a. Only include meals that are in the Active Tracked Meals list (${activeMealTypes.join(', ')}). Never suggest, toggle, or mention untracked/disabled meals.
           b. Check "Current Status of Active Meals". If a meal is ALREADY 0 (OFF), DO NOT request to turn it OFF again! If a meal is ALREADY 1 (ON), DO NOT request to turn it ON again!
           c. If all requested meals are ALREADY in the user's requested state (e.g., user asks to turn off meals, but all active meals are already 0 / OFF), output intent "general" and state in Bengali that the meals are already in that state.
        2. If the user is asking a general question about their balance, cost, dining rules, recent bazaar purchases, menu, or statistics, answer it accurately using the CONTEXT DATA. Be friendly, concise, and helpful. Output intent "general".
        3. LANGUAGE RULE: Always respond in Bengali (বাংলা) by default, even if the user asks their question in English or any other language. However, if the user explicitly requests you to talk or respond in a different specific language (e.g., "speak in English", "ইংরেজিতে উত্তর দাও", "respond in Arabic"), then you must override the default and reply in that requested language.
      `;

      const systemInstruction = "You are Messliner AI, a helpful mess chatbot assistant. Always respond in Bengali by default unless the user explicitly requests another language. Reply friendly and structure outputs.";

      const schema = {
        type: "OBJECT",
        properties: {
          intent: { type: "STRING", enum: ["toggle_meal", "general"] },
          mealsToToggle: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                mealType: { type: "STRING", enum: activeMealTypes.length > 0 ? activeMealTypes : ["lunch", "dinner"] },
                status: { type: "STRING", enum: ["ON", "OFF"] }
              },
              required: ["mealType", "status"]
            }
          },
          responseMessage: { type: "STRING" }
        },
        required: ["intent", "responseMessage"]
      };

      const result = await Messliner.aiControl._callGemini(prompt, systemInstruction, schema);

      this.appendBotMessage(result.responseMessage);

      // Render professional confirmation buttons instead of writing directly to the database
      if (result.intent === 'toggle_meal' && result.mealsToToggle && result.mealsToToggle.length > 0) {
        const validToggles = result.mealsToToggle.filter(item => {
          const mealLower = item.mealType.toLowerCase();
          if (!activeMealTypes.includes(mealLower)) return false;

          const currentVal = mealStatus[mealLower];
          const isCurrentlyOn = (currentVal !== false && currentVal !== 0 && currentVal !== undefined && currentVal !== null);

          // If requesting to turn OFF, ignore if already OFF
          if (item.status === 'OFF' && !isCurrentlyOn) return false;

          // If requesting to turn ON, ignore if already ON
          if (item.status === 'ON' && isCurrentlyOn) return false;

          return true;
        });

        if (validToggles.length > 0) {
          let buttonsHtml = `
            <div class="ai-confirm-container">
              <div class="ai-confirm-header">
                <svg width="15" height="15" fill="none" stroke="#059669" stroke-width="2.5" viewBox="0 0 24 24">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span>নিশ্চিত করতে নিচে ক্লিক করুন:</span>
              </div>
              <div class="ai-confirm-actions">
          `;

          validToggles.forEach(item => {
            const mealLower = item.mealType.toLowerCase();
            const statusVal = item.status === 'ON' ? 1 : 0;
            const label = mealLower.charAt(0).toUpperCase() + mealLower.slice(1);
            const isTurnOn = item.status === 'ON';
            const btnClass = isTurnOn ? 'btn-turn-on' : 'btn-turn-off';
            const badgeText = isTurnOn ? '✓ চালু করুন' : '✕ বন্ধ করুন';

            let iconSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0"/></svg>';
            if (mealLower === 'breakfast') {
              iconSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>';
            } else if (mealLower === 'dinner') {
              iconSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            }

            buttonsHtml += `
              <button class="ai-confirm-btn ${btnClass}"
                      onclick="Messliner.history.confirmMealToggle('${mealLower}', ${statusVal})">
                ${iconSvg}
                <span>${label}</span>
                <span class="ai-confirm-btn-badge">${badgeText}</span>
              </button>
            `;
          });

          buttonsHtml += `
              </div>
            </div>
          `;
          this.appendBotMessage(buttonsHtml);
        } else {
          const requestedStatus = result.mealsToToggle[0]?.status;
          if (requestedStatus === 'OFF') {
            this.appendBotMessage("ℹ️ **আপনার নির্দিষ্ট খাবারটি/খাবারগুলো ইতিমধ্যেই বন্ধ (OFF) রয়েছে।**");
          } else if (requestedStatus === 'ON') {
            this.appendBotMessage("ℹ️ **আপনার নির্দিষ্ট খাবারটি/খাবারগুলো ইতিমধ্যেই চালু (ON) রয়েছে।**");
          }
        }
      }

    } catch (error) {
      console.error(error);
      this.appendBotMessage("Sorry, I encountered an error trying to process your command: " + error.message);
    } finally {
      this.isAiProcessing = false;

      // Ensure loader is removed if it wasn't already removed by appendBotMessage
      const loader = document.getElementById('aiChatLoader');
      if (loader) loader.remove();

      input.readOnly = false;
      if (btnSend) btnSend.disabled = false;
      if (uploadLabel) {
        uploadLabel.style.pointerEvents = '';
        uploadLabel.style.opacity = '';
      }

      const win = document.getElementById('aiChatWindow');
      if (win) requestAnimationFrame(() => { win.scrollTop = win.scrollHeight; });
      input.focus();
    }
  },

  async handleRoutineUpload(event) {
    if (this.isAiProcessing) return;
    const file = event.target.files[0];
    if (!file) return;

    this.isAiProcessing = true;

    // Disable inputs and send buttons
    const input = document.getElementById('aiChatInput');
    if (input) input.readOnly = true;
    const btnSend = document.querySelector('.ai-send-btn');
    if (btnSend) btnSend.disabled = true;

    // Disable attach routine input/label
    const uploadLabel = document.getElementById('aiRoutineUploadLabel');
    if (uploadLabel) {
      uploadLabel.style.pointerEvents = 'none';
      uploadLabel.style.opacity = '0.5';
    }

    this.appendUserMessage("📎 Sent a routine image.");
    this.showChatLoading();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${typeof GEMINI_MODEL !== 'undefined' ? GEMINI_MODEL : 'gemini-3.5-flash'}:generateContent?key=${GEMINI_API_KEY}`;

        const requestBody = {
          contents: [
            {
              parts: [
                { text: "Extract the weekly class schedule / exam routine from this image. Group courses by Day of the Week (e.g. Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday) with course code, start, and end time in 24h format." },
                { inlineData: { mimeType: "image/jpeg", data: base64 } }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                schedule: {
                  type: "OBJECT",
                  properties: {
                    Sunday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Monday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Tuesday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Wednesday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Thursday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Friday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } },
                    Saturday: { type: "ARRAY", items: { type: "OBJECT", properties: { course: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } }, required: ["course", "start", "end"] } }
                  }
                },
                message: { type: "STRING" }
              },
              required: ["schedule", "message"]
            }
          }
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error("Gemini failed to read routine.");

        const data = await response.json();
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);

        // Store parsed schedule in temporary property to avoid direct DB write from AI
        this._pendingSchedule = parsed.schedule;

        let preview = `<div style="font-size:var(--font-xs); color:var(--text-secondary); margin-bottom:8px; border-left:2px solid var(--primary-300); padding-left:8px;"><strong>Extracted Classes:</strong>`;
        let count = 0;
        Object.entries(parsed.schedule).forEach(([day, courses]) => {
          if (courses && courses.length > 0) {
            count++;
            preview += `<br>• <strong>${day}</strong>: ${courses.map(c => `${c.course} (${c.start}-${c.end})`).join(', ')}`;
          }
        });
        if (count === 0) {
          preview += `<br>No classes identified.`;
        }
        preview += `</div>`;

        this.appendBotMessage(`
          🎉 **Routine Parsed Successfully!**<br>${parsed.message || 'I have extracted your weekly schedule. Please verify and save below:'}
          ${preview}
          <div style="margin-top:8px;">
            <button class="btn btn-sm btn-primary" style="cursor:pointer;" onclick="Messliner.history.saveExtractedSchedule()">
              Save Schedule to Profile
            </button>
          </div>
        `);

      } catch (err) {
        console.error(err);
        this.appendBotMessage("Failed to parse routine. Make sure it is a clear JPEG routine image.");
      } finally {
        this.isAiProcessing = false;

        // Ensure loader is removed
        const loader = document.getElementById('aiChatLoader');
        if (loader) loader.remove();

        if (input) input.readOnly = false;
        if (btnSend) btnSend.disabled = false;
        if (uploadLabel) {
          uploadLabel.style.pointerEvents = '';
          uploadLabel.style.opacity = '';
        }

        const win = document.getElementById('aiChatWindow');
        if (win) requestAnimationFrame(() => { win.scrollTop = win.scrollHeight; });
        if (input) input.focus();

        // Reset the file input value so selecting the same file triggers the change event again
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      this.isAiProcessing = false;
      const loader = document.getElementById('aiChatLoader');
      if (loader) loader.remove();
      if (input) input.readOnly = false;
      if (btnSend) btnSend.disabled = false;
      if (uploadLabel) {
        uploadLabel.style.pointerEvents = '';
        uploadLabel.style.opacity = '';
      }
      this.appendBotMessage("Failed to read routine file.");
    };
    reader.readAsDataURL(file);
  },

  setupAiChatbotListeners() {
    if (this._aiChatbotListenersAttached) return;
    this._aiChatbotListenersAttached = true;

    const btnSend = document.getElementById('btnSendAiChat');
    const input = document.getElementById('aiChatInput');
    const toggle = document.getElementById('aiAutoMealToggle');
    const btnUpload = document.getElementById('btnUploadRoutine');
    const fileInput = document.getElementById('aiRoutineUploadInput');

    if (btnSend) {
      btnSend.addEventListener('click', () => this.sendAiChatMessage());
    }
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendAiChatMessage();
        }
      });
    }
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        this.toggleAiAutoMeal(e.target.checked);
      });
    }
    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => {
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => this.handleRoutineUpload(e));
    }
  },

  async confirmMealToggle(mealType, statusVal) {
    try {
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/mealStatus/${mealType}`).set(statusVal);
      await Notifications.log(this.diningId, 'meal_toggled', `${mealType.toUpperCase()} set ${statusVal ? 'ON' : 'OFF'} via chatbot user confirmation`, this.userId, this.userId);
      this.appendBotMessage(`✅ Database Updated! Turned **${mealType.toUpperCase()}** ${statusVal ? 'ON' : 'OFF'}.`);
      if (Messliner.userDashboard) Messliner.userDashboard.refresh();
    } catch (err) {
      console.error(err);
      this.appendBotMessage("Failed to update database: " + err.message);
    }
  },

  async saveExtractedSchedule() {
    if (!this._pendingSchedule) {
      this.appendBotMessage("No pending schedule found to save.");
      return;
    }
    try {
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/profile/classSchedule`).set(this._pendingSchedule);
      this._pendingSchedule = null;
      this.appendBotMessage("✅ Class schedule successfully written to your profile! If Auto-Meal is enabled, conflict alerts will show on your dashboard.");
      if (Messliner.userDashboard) Messliner.userDashboard.refresh();
    } catch (err) {
      console.error(err);
      this.appendBotMessage("Failed to write to database: " + err.message);
    }
  },

  applyAiAssistantSettings() {
    const s = this.settings;
    const isAiEnabled = s.aiAssistantEnabled !== false;
    const isUploadEnabled = s.aiFileUploadEnabled !== false;
    const isAdmin = Messliner.state.role === 'admin';

    // 1. Navigation element visibility
    const aiNavBtn = document.getElementById('nav-item-aiassistant');
    if (aiNavBtn) {
      aiNavBtn.style.display = (isAdmin || isAiEnabled) ? 'flex' : 'none';
    }

    // 2. Routing block
    if (!isAdmin && !isAiEnabled && Messliner.router.currentPage === 'aiassistant') {
      Messliner.router.navigate('dashboard');
    }

    // 3. File upload button, instruction, and badge visibility
    const uploadLabel = document.getElementById('aiRoutineUploadLabel');
    if (uploadLabel) {
      uploadLabel.style.display = isUploadEnabled ? 'inline-flex' : 'none';
    }
    const uploadRow = document.getElementById('aiInputUploadRow');
    if (uploadRow) {
      uploadRow.style.display = isUploadEnabled ? 'flex' : 'none';
    }
    const uploadBadge = document.getElementById('aiRoutineUploadBadge');
    if (uploadBadge) {
      uploadBadge.style.display = isUploadEnabled ? 'flex' : 'none';
    }
    const uploadInstruction = document.getElementById('aiRoutineUploadInstruction');
    if (uploadInstruction) {
      uploadInstruction.style.display = isUploadEnabled ? 'inline' : 'none';
    }

    // 4. Hide "Enable AI Auto Meal System" toggle bar if file upload is turned off
    const autoMealBar = document.getElementById('aiAutoMealToggleBar');
    if (autoMealBar) {
      autoMealBar.style.display = isUploadEnabled ? 'flex' : 'none';
    }
  },

  /**
   * Toggle between admin and user views (for admins only)
   */
  toggleViewMode() {
    const currentMode = sessionStorage.getItem('viewMode') || 'admin';
    const nextMode = currentMode === 'user' ? 'admin' : 'user';
    sessionStorage.setItem('viewMode', nextMode);

    const loader = document.getElementById('pageLoader');
    if (loader) {
      loader.style.opacity = '1';
      loader.style.display = 'flex';
    }

    setTimeout(() => {
      window.location.reload();
    }, 600);
  }
};

console.log('[Messliner] History module loaded');
