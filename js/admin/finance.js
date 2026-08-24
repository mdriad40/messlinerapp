/* ============================================
   Messliner — Finance Management (admin/finance.js)
   ============================================ */

const FinanceModule = {
  deposits: {},
  bazarList: {},
  currentFilter: 'all',

  /**
   * Initialize finance module with realtime listeners
   */
  init(diningId, initialData) {
    this.diningId = diningId;

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
    document.getElementById('depositForm').reset();
    document.getElementById('depositModalTitle').textContent = 'Add Deposit';
    this._populateUserSelect('depositUserSelect');
    openModal('depositModal');
  },

  /**
   * Show deduct modal
   */
  showDeductModal() {
    document.getElementById('deductForm').reset();
    this._populateUserSelect('deductUserSelect');
    openModal('deductModal');
  },

  /**
   * Show bazar modal
   */
  showBazarModal() {
    document.getElementById('bazarForm').reset();
    document.getElementById('bazarDateInput').value = Utils.today();
    openModal('bazarModal');
  },

  /**
   * Show Other Costing modal
   */
  showOtherCostingModal() {
    document.getElementById('otherCostingForm').reset();
    document.getElementById('otherCostingSplitInfo').style.display = 'none';

    const checklist = document.getElementById('otherCostingMembersChecklist');
    const selectAll = document.getElementById('otherCostingSelectAll');
    if (selectAll) selectAll.checked = false;

    const users = Messliner.users.users;
    // Use UsersModule.settings (reliably populated for admins)
    const settings = UsersModule.settings || {};
    const isManagerMealEnabled = !!settings.managerMealEnabled;

    if (!users || Object.keys(users).length === 0) {
      Notifications.toast('warning', 'No Members', 'No members found. Please add members first.');
      return;
    }

    checklist.innerHTML = Object.entries(users)
      .filter(([id, u]) => u.role !== 'admin' || isManagerMealEnabled)
      .map(([id, u]) => `
        <label class="members-checklist-item" for="member_check_${id}">
          <div class="members-checklist-avatar" style="background:${UsersModule._avatarColor(u.name)};">
            ${Utils.initials(u.name)}
          </div>
          <div class="members-checklist-info">
            <div class="members-checklist-name">${u.name}</div>
            <div class="members-checklist-sub">@${u.username || '—'}</div>
          </div>
          <input type="checkbox" id="member_check_${id}" value="${id}" class="members-checklist-checkbox"
            onchange="Messliner.finance.updateOtherCostingSplit()">
        </label>
      `).join('');

    openModal('otherCostingModal');
  },

  /**
   * Toggle Select All checkboxes for Other Costing
   */
  toggleSelectAllOtherCosting(source) {
    const checkboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
    this.updateOtherCostingSplit();
  },

  /**
   * Update real-time split info preview
   */
  updateOtherCostingSplit() {
    const amount = parseFloat(document.getElementById('otherCostingAmountInput').value) || 0;
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
  },

  /**
   * Save Other Costing - splits equally across selected members
   */
  async saveOtherCosting() {
    const amount = parseFloat(document.getElementById('otherCostingAmountInput').value);
    const reason = document.getElementById('otherCostingReasonInput').value.trim();
    const checkboxes = document.querySelectorAll('#otherCostingMembersChecklist .members-checklist-checkbox:checked');
    const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);

    if (!amount || amount <= 0) {
      Notifications.toast('warning', 'Invalid Input', 'Please enter a valid total amount.');
      return;
    }
    if (!reason) {
      Notifications.toast('warning', 'Invalid Input', 'Please enter a reason / description.');
      return;
    }
    if (selectedUserIds.length === 0) {
      Notifications.toast('warning', 'No Members Selected', 'Please select at least one member.');
      return;
    }

    const splitAmount = amount / selectedUserIds.length;
    const users = Messliner.users.users;
    const today = Utils.today();

    try {
      const batchId = 'oc_' + Date.now();
      // Write one transaction per selected member
      const promises = selectedUserIds.map(async (userId) => {
        const user = users[userId];
        await db.ref(`dinings/${this.diningId}/deposits`).push().set({
          batchId,
          userId,
          userName: user?.name || 'Unknown',
          amount: -splitAmount,
          type: 'other_costing',
          note: reason,
          date: today,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // Update user's totalDeposit in db (subtract splitAmount)
        const currentDeposit = Utils.num(user?.totalDeposit);
        await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(currentDeposit - splitAmount);
      });

      await Promise.all(promises);

      // Log and notify
      const memberNames = selectedUserIds.map(id => users[id]?.name || 'Unknown').join(', ');
      await Notifications.log(
        this.diningId, 'other_costing_added',
        `Other Costing ৳${amount} (${reason}) split among: ${memberNames}`,
        Messliner.state.userId
      );
      // Notify each selected user
      for (const userId of selectedUserIds) {
        await Notifications.create(
          this.diningId, 'Other Costing Applied',
          `${Utils.currency(splitAmount)} charged to you for: ${reason}`,
          userId, 'finance'
        );
      }

      Notifications.toast('success', 'Other Costing Applied',
        `${Utils.currency(amount)} split among ${selectedUserIds.length} member${selectedUserIds.length > 1 ? 's' : ''} (${Utils.currency(splitAmount)} each).`);
      closeModal('otherCostingModal');

    } catch (error) {
      console.error('Save other costing error:', error);
      Notifications.toast('error', 'Error', 'Failed to apply other costing.');
    }
  },

  /**
   * Populate user select dropdown
   */
  _populateUserSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const users = Messliner.users.users;
    select.innerHTML = '<option value="">Choose a member...</option>' +
      Object.entries(users).map(([id, u]) => `<option value="${id}">${u.name}</option>`).join('');
  },

  /**
   * Save deposit
   */
  async saveDeposit() {
    const userId = document.getElementById('depositUserSelect').value;
    const amount = parseFloat(document.getElementById('depositAmountInput').value);
    const note = document.getElementById('depositNoteInput').value.trim();

    if (!userId || !amount || amount <= 0) {
      Notifications.toast('warning', 'Invalid Input', 'Please select a member and enter a valid amount.');
      return;
    }

    try {
      const user = Messliner.users.users[userId];

      // Save deposit record
      await db.ref(`dinings/${this.diningId}/deposits`).push().set({
        userId,
        userName: user?.name || 'Unknown',
        amount,
        type: 'deposit',
        note: note || 'Deposit',
        date: Utils.today(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // Update user's total deposit
      const currentDeposit = Utils.num(user?.totalDeposit);
      const newBalance = currentDeposit + amount;
      await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(newBalance);

      // Notify
      await Notifications.create(this.diningId, 'Deposit Received', `${Utils.currency(amount)} deposited for ${user?.name || 'User'}.`, userId, 'deposit');
      await Notifications.log(this.diningId, 'deposit_added', `Deposit ৳${amount} for ${user?.name}`, Messliner.state.userId, userId);
      Notifications.toast('success', 'Deposit Added', `${Utils.currency(amount)} added for ${user?.name}.`);
      closeModal('depositModal');

      // ─── SMS Alert (non-blocking) ───────────────────────────────────
      if (typeof SMSAlertModule !== 'undefined' && SMSAlertModule.sendDepositSMS) {
        SMSAlertModule.sendDepositSMS({
          userId,
          userName: user?.name || 'Unknown',
          amount,
          newBalance,
          note: note || 'Deposit',
          diningId: this.diningId,
        }).catch(e => console.warn('[SMS] send error:', e));
      }

    } catch (error) {
      console.error('Save deposit error:', error);
      Notifications.toast('error', 'Error', 'Failed to save deposit.');
    }
  },

  /**
   * Save deduction
   */
  async saveDeduction() {
    const userId = document.getElementById('deductUserSelect').value;
    const amount = parseFloat(document.getElementById('deductAmountInput').value);
    const reason = document.getElementById('deductReasonInput').value.trim();

    if (!userId || !amount || amount <= 0 || !reason) {
      Notifications.toast('warning', 'Invalid Input', 'Please fill all fields.');
      return;
    }

    try {
      const user = Messliner.users.users[userId];

      // Save deduction record
      await db.ref(`dinings/${this.diningId}/deposits`).push().set({
        userId,
        userName: user?.name || 'Unknown',
        amount: -amount,
        type: 'deduction',
        note: reason,
        date: Utils.today(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // Update user's total deposit (subtract)
      const currentDeposit = Utils.num(user?.totalDeposit);
      await db.ref(`dinings/${this.diningId}/users/${userId}/totalDeposit`).set(currentDeposit - amount);

      await Notifications.create(this.diningId, 'Balance Deducted', `${Utils.currency(amount)} deducted from ${user?.name}. Reason: ${reason}`, userId, 'deposit');
      await Notifications.log(this.diningId, 'deduction_added', `Deducted ৳${amount} from ${user?.name}: ${reason}`, Messliner.state.userId, userId);
      Notifications.toast('success', 'Deduction Applied', `${Utils.currency(amount)} deducted from ${user?.name}.`);
      closeModal('deductModal');

    } catch (error) {
      console.error('Save deduction error:', error);
      Notifications.toast('error', 'Error', 'Failed to apply deduction.');
    }
  },

  /**
   * Save bazar cost
   */
  async saveBazar() {
    const date = document.getElementById('bazarDateInput').value;
    const amount = parseFloat(document.getElementById('bazarAmountInput').value);
    const items = document.getElementById('bazarItemsInput').value.trim();
    const shopper = document.getElementById('bazarShopperInput').value.trim();

    if (!date || !amount || amount <= 0 || !items) {
      Notifications.toast('warning', 'Invalid Input', 'Please fill date, amount, and items.');
      return;
    }

    try {
      await db.ref(`dinings/${this.diningId}/bazar`).push().set({
        amount,
        items,
        shopperName: shopper || 'N/A',
        date,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      await Notifications.create(this.diningId, 'Bazar Expense Added', `${Utils.currency(amount)} spent on bazar. Items: ${items}`, 'all', 'bazar');
      await Notifications.log(this.diningId, 'bazar_added', `Bazar ৳${amount}: ${items}`, Messliner.state.userId);
      Notifications.toast('success', 'Bazar Saved', `${Utils.currency(amount)} bazar cost recorded.`);
      closeModal('bazarModal');

    } catch (error) {
      console.error('Save bazar error:', error);
      Notifications.toast('error', 'Error', 'Failed to save bazar cost.');
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
   * Render transaction history timeline
   */
  renderTransactions() {
    const container = document.getElementById('transactionHistory');
    if (!container) return;

    // Merge deposits and bazar into one list
    let transactions = [];

    Object.entries(this.deposits).forEach(([id, d]) => {
      transactions.push({ id, ...d, category: d.type });
    });

    Object.entries(this.bazarList).forEach(([id, b]) => {
      transactions.push({
        id,
        ...b,
        type: 'bazar',
        category: 'bazar',
        note: b.items,
        userName: b.shopperName || 'N/A'
      });
    });

    // Sort by timestamp descending
    transactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Apply filter
    if (this.currentFilter !== 'all') {
      transactions = transactions.filter(t => t.category === this.currentFilter);
    }

    if (transactions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <h3>No Transactions</h3>
          <p>Financial transactions will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = transactions.slice(0, 50).map(t => {
      const isDeposit = t.type === 'deposit';
      const isBazar = t.type === 'bazar';
      const isOtherCosting = t.type === 'other_costing';
      const isDeduction = t.type === 'deduction';

      let dotClass, amountColor, sign, typeLabel;
      if (isDeposit) {
        dotClass = 'accent'; amountColor = 'var(--accent-600)'; sign = '+'; typeLabel = 'Deposit';
      } else if (isBazar) {
        dotClass = 'warning'; amountColor = 'var(--warning-600)'; sign = '-'; typeLabel = 'Bazar';
      } else if (isOtherCosting) {
        dotClass = 'primary'; amountColor = 'var(--primary-600)'; sign = '-'; typeLabel = 'Other Costing';
      } else {
        dotClass = 'danger'; amountColor = 'var(--danger-600)'; sign = '-'; typeLabel = 'Deduction';
      }

      const amount = Math.abs(Utils.num(t.amount));

      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <div class="timeline-date">${Utils.formatDate(t.date)} · ${Utils.timeAgo(t.timestamp)}</div>
            <div class="flex items-center justify-between" style="gap: var(--space-3);">
              <div style="min-width: 0; flex: 1;">
                <div class="timeline-title">${(t.userId && Messliner.users?.users && Messliner.users.users[t.userId]?.name) || t.userName || 'Unknown'}</div>
                <div class="timeline-desc">${t.type === 'bazar' ? Utils.formatBazarItems(t.note) : (t.note || t.type)}</div>
              </div>
              <div style="font-weight:var(--weight-bold);color:${amountColor};font-size:var(--font-md);white-space:nowrap; flex-shrink: 0; text-align: right;">
                ${sign}${Utils.currency(amount)}
              </div>
            </div>
            <div class="flex items-center justify-between" style="margin-top:var(--space-2); border-top: 1px dashed var(--border-color); padding-top:var(--space-2);">
              <span class="badge badge-${dotClass}">${typeLabel}</span>
              <button class="btn btn-sm btn-ghost text-danger" style="padding: 2px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"
                onclick="Messliner.finance.revertTransaction('${t.id}', '${t.type}', '${t.batchId || ''}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                Undo
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Filter transactions
   */
  filterTransactions(filter) {
    this.currentFilter = filter;
    this.renderTransactions();
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
   * Render list of Other Costings inside Finance Fix modal
   */
  renderFinanceFixList() {
    const container = document.getElementById('financeFixList');
    if (!container) return;

    const groups = this._groupOtherCostings(this.deposits);

    if (groups.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:var(--space-8, 32px) var(--space-4, 16px);color:var(--text-muted, #6b7280);">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(107,114,128,0.1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
          </div>
          <h4 style="margin:0 0 4px 0;font-size:16px;color:var(--text-main, #1f2937);">No Other Costing Found</h4>
          <p style="margin:0;font-size:13px;">There are no Other Costing records added to this mess yet.</p>
        </div>
      `;
      return;
    }

    // Window global helper to trigger confirm delete
    window._pendingFixGroups = window._pendingFixGroups || {};

    container.innerHTML = groups.map(g => {
      window._pendingFixGroups[g.groupId] = g;

      const totalAmount = g.items.reduce((sum, item) => sum + Math.abs(Utils.num(item.amount)), 0);
      const memberCount = g.items.length;
      const splitEach = memberCount > 0 ? (totalAmount / memberCount) : 0;
      const memberNames = g.items.map(item => item.userName || 'Member').join(', ');
      const formattedDate = Utils.formatDate(g.date);
      const timeAgo = g.timestamp ? Utils.timeAgo(g.timestamp) : '';

      const safeNote = Utils.escapeHtml ? Utils.escapeHtml(g.note) : g.note;

      return `
        <div style="background:var(--card-bg, #ffffff);border:1px solid var(--border-color, #e5e7eb);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
            <div>
              <div style="font-weight:700;font-size:15px;color:var(--text-main, #111827);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${safeNote}</span>
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:rgba(245,158,11,0.12);color:#d97706;">
                  ${memberCount} member${memberCount > 1 ? 's' : ''}
                </span>
              </div>
              <div style="font-size:12px;color:var(--text-muted, #6b7280);margin-top:2px;">
                ${formattedDate} ${timeAgo ? '· ' + timeAgo : ''}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:800;color:#ef4444;white-space:nowrap;">
                -${Utils.currency(totalAmount)}
              </div>
              <div style="font-size:11px;color:var(--text-muted, #6b7280);">
                (${Utils.currency(splitEach)} each)
              </div>
            </div>
          </div>

          <div style="background:var(--bg-hover, #f9fafb);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--text-muted, #4b5563);margin-bottom:12px;line-height:1.4;">
            <strong style="color:var(--text-main, #374151);">Split among:</strong> ${memberNames}
          </div>

          <div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-sm btn-danger" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;font-size:13px;"
              onclick="Messliner.finance.confirmDeleteOtherCosting('${g.groupId}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete & Undo
            </button>
          </div>
        </div>
      `;
    }).join('');
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
   * Revert a transaction (Deposit, Deduction, Bazar, or Other Costing group)
   */
  async revertTransaction(id, type, batchId = '') {
    let message = '';
    if (type === 'deposit') {
      message = 'Are you sure you want to undo this deposit? The amount will be deducted from the member\'s balance, and the record will be deleted.';
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
        if (type === 'deposit' || type === 'deduction') {
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
          let groupId = batchId;
          if (!groupId) {
            const groups = this._groupOtherCostings(this.deposits);
            const foundGroup = groups.find(g => g.items.some(item => item.key === id));
            if (foundGroup) {
              groupId = foundGroup.groupId;
            }
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
      const activeRates = [];
      if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
      if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
      if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);
      mealRate = activeRates.length > 0 ? (activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
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
    this.renderSummary();
    this.renderTransactions();
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
        if (b.date && b.date.startsWith(formattedMonth)) {
          monthBazarTotal += parseFloat(b.amount) || 0;
        }
      });

      const rateMode = settings.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
      let mealRate = 0;
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        const activeRates = [];
        if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
        if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
        if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);
        mealRate = activeRates.length > 0 ? (activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
      } else {
        mealRate = totalMessMeals > 0 ? (monthBazarTotal / totalMessMeals) : 0;
      }

      const totalMealCost = Utils.calcMealCost(mealRate, userMealCount, userMealsBreakdown, fixedRates);

      let userTxns = [];
      let totalCredit = 0;
      let totalDebit = 0;

      Object.entries(allDeposits).forEach(([id, d]) => {
        if (d.userId !== userId) return;
        if (!d.date || !d.date.startsWith(formattedMonth)) return;

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

console.log('[Messliner] Finance module loaded');

