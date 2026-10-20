/* ============================================
   Messliner — SMS Alert Module (admin/smsAlert.js)
   Integrates with BulkSMSBD API for deposit notifications
   ============================================ */

const SMSAlertModule = {
  diningId: null,
  _dirty: false,

  /* -------------------------------------------------------
     Supported template tags:
       {name}     — member full name
       {email}    — member email
       {phone}    — member phone number
       {amount}   — deposited amount (e.g. 500)
       {balance}  — new total balance after deposit
       {note}     — deposit note
       {datetime} — DD.MM.YYYY HH:MM  (24-hour)
  ------------------------------------------------------- */

  /** Sample data for preview rendering */
  _sampleData: {
    name: 'Rahim Uddin',
    email: 'rahim@example.com',
    phone: '8801711234567',
    amount: '500',
    balance: '2500',
    note: 'Monthly deposit',
    datetime: null,   // filled at runtime
  },

  // ─── Init ─────────────────────────────────────────────

  init(diningId) {
    this.diningId = diningId;
    console.log('[SMSAlert] Initialized for dining:', diningId);
  },

  /** Called by Router when navigating to 'more' page */
  refresh() {
    this._loadConfig();
    this._loadFormat();
    this.refreshLog();
    this.refreshBalanceHistory();
    this._dirty = false;
  },

  // ─── Tab switching ────────────────────────────────────

  switchTab(tab) {
    document.querySelectorAll('.more-tab-btn').forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.style.color = '';
      btn.style.borderBottom = '';
      btn.style.fontWeight = '';
    });
    document.querySelectorAll('[id^="moreTabContent_"]').forEach(pane => {
      pane.style.display = 'none';
    });
    const target = document.getElementById(`moreTabContent_${tab}`);
    if (target) target.style.display = '';

    if (tab === 'sms-history') {
      this.refreshBalanceHistory();
    } else if (tab === 'sms') {
      this.refreshLog();
      this._loadConfig();
    }
  },

  // ─── Config persistence (Firebase) ───────────────────

  async _loadConfig() {
    if (!this.diningId) return;
    try {
      const snap = await db.ref(`dinings/${this.diningId}/smsConfig`).once('value');
      const cfg = snap.val() || {};

      const apiKeyEl = document.getElementById('smsApiKey');
      const senderIdEl = document.getElementById('smsSenderId');
      const toggleEl = document.getElementById('smsAlertToggle');

      if (apiKeyEl) apiKeyEl.value = cfg.apiKey || '';
      if (senderIdEl) senderIdEl.value = cfg.senderId || '';
      if (toggleEl) toggleEl.checked = !!cfg.enabled;

      // Load balance and rate
      const balance = Utils.num(cfg.smsBalance);
      const rate = Utils.num(cfg.smsRate || 0.30);
      const remaining = rate > 0 ? Math.floor(balance / rate) : 0;

      const balanceEl = document.getElementById('smsBalanceInput');
      const rateEl = document.getElementById('smsRateInput');

      if (balanceEl) balanceEl.value = balance;
      if (rateEl) rateEl.value = rate;

      Utils.setText('smsBalanceDisplay', `৳${balance.toFixed(2)}`);
      Utils.setText('smsRateDisplay', `৳${rate.toFixed(2)}`);
      Utils.setText('smsRemainingDisplay', remaining);
    } catch (e) {
      console.error('[SMSAlert] loadConfig error:', e);
    }
  },

  async saveConfig() {
    if (!this.diningId) return;
    const apiKey = (document.getElementById('smsApiKey')?.value || '').trim();
    const senderId = (document.getElementById('smsSenderId')?.value || '').trim();

    if (!apiKey || !senderId) {
      Notifications.toast('warning', 'Missing Fields', 'Please enter both API Key and Sender ID.');
      return;
    }

    const btn = document.getElementById('smsSaveConfigBtn');
    if (btn) { btn.disabled = true; btn.querySelector('.btn-text') && (btn.querySelector('.btn-text').textContent = 'Saving...'); }

    try {
      await db.ref(`dinings/${this.diningId}/smsConfig`).update({ apiKey, senderId });
      Notifications.toast('success', 'Config Saved', 'SMS API configuration saved successfully.');
      this._dirty = false;
    } catch (e) {
      console.error('[SMSAlert] saveConfig error:', e);
      Notifications.toast('error', 'Error', 'Failed to save SMS config.');
    } finally {
      if (btn) { btn.disabled = false; }
    }
  },

  async toggleEnable(enabled) {
    if (!this.diningId) return;
    try {
      await db.ref(`dinings/${this.diningId}/smsConfig/enabled`).set(enabled);
      Notifications.toast('success', enabled ? 'SMS Alerts ON' : 'SMS Alerts OFF',
        enabled ? 'Deposit SMS notifications are now active.' : 'Deposit SMS notifications disabled.');
    } catch (e) {
      console.error('[SMSAlert] toggleEnable error:', e);
    }
  },

  async updateSmsBalance() {
    if (!this.diningId) return;
    const balanceInput = document.getElementById('smsBalanceInput');
    const rateInput = document.getElementById('smsRateInput');
    if (!balanceInput || !rateInput) return;

    const newBalance = parseFloat(balanceInput.value);
    const newRate = parseFloat(rateInput.value);

    if (isNaN(newBalance) || newBalance < 0 || isNaN(newRate) || newRate < 0) {
      Notifications.toast('warning', 'Invalid Input', 'Please enter valid positive numbers.');
      return;
    }

    const btn = document.getElementById('smsSaveBalanceBtn');
    if (btn) btn.disabled = true;

    try {
      // Get current balance to calculate diff for logging
      const snap = await db.ref(`dinings/${this.diningId}/smsConfig`).once('value');
      const cfg = snap.val() || {};
      const oldBalance = Utils.num(cfg.smsBalance);
      const oldRate = Utils.num(cfg.smsRate);

      // Save to firebase
      await db.ref(`dinings/${this.diningId}/smsConfig`).update({
        smsBalance: newBalance,
        smsRate: newRate
      });

      // If balance changed, log to smsBalanceHistory
      if (newBalance !== oldBalance || newRate !== oldRate) {
        const diff = newBalance - oldBalance;
        let note = '';
        if (newBalance !== oldBalance && newRate !== oldRate) {
          note = `Balance updated to ৳${newBalance.toFixed(2)} (change: ৳${diff >= 0 ? '+' : ''}${diff.toFixed(2)}), Rate updated to ৳${newRate.toFixed(2)}/SMS`;
        } else if (newBalance !== oldBalance) {
          note = `Balance updated to ৳${newBalance.toFixed(2)} (change: ৳${diff >= 0 ? '+' : ''}${diff.toFixed(2)})`;
        } else {
          note = `Rate updated to ৳${newRate.toFixed(2)}/SMS`;
        }

        await db.ref(`dinings/${this.diningId}/smsBalanceHistory`).push({
          amount: diff,
          type: 'config_change',
          balance: newBalance,
          rate: newRate,
          note: note,
          timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
        });
      }

      Notifications.toast('success', 'Saved', 'SMS Balance and Rate updated.');

      // Update displays
      const remaining = newRate > 0 ? Math.floor(newBalance / newRate) : 0;
      Utils.setText('smsBalanceDisplay', `৳${newBalance.toFixed(2)}`);
      Utils.setText('smsRateDisplay', `৳${newRate.toFixed(2)}`);
      Utils.setText('smsRemainingDisplay', remaining);

      this.refreshBalanceHistory();
    } catch (e) {
      console.error('[SMSAlert] updateSmsBalance error:', e);
      Notifications.toast('error', 'Error', 'Failed to update balance and rate.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async refreshBalanceHistory() {
    if (!this.diningId) return;
    const container = document.getElementById('smsBalanceHistoryList');
    if (!container) return;

    container.innerHTML = `<div class="empty-state" style="padding:var(--space-4);"><div class="spinner"></div><p style="margin-top:8px;font-size:var(--font-sm);color:var(--text-secondary);">Loading...</p></div>`;

    try {
      const snap = await db.ref(`dinings/${this.diningId}/smsBalanceHistory`).once('value');

      const entries = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) entries.push(val);
      });
      // Sort newest first
      entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      // Limit to 50
      const limited = entries.slice(0, 50);

      if (limited.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-5);">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
            </div>
            <h3>No Balance History</h3>
            <p>Transactions will appear here after updates or SMS sends.</p>
          </div>`;
        return;
      }

      container.innerHTML = limited.map(e => {
        const dt = e.timestamp ? new Date(e.timestamp) : null;
        const dtStr = dt ? `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '—';

        const isRecharge = e.amount > 0;
        const isDeduction = e.amount < 0;

        let color = '#374151'; // gray
        let bg = '#F3F4F6';
        let badgeText = 'Update';
        let amountText = `৳${(+e.amount).toFixed(2)}`;

        if (isRecharge) {
          color = '#059669'; // green
          bg = '#ECFDF5';
          badgeText = 'Recharge';
          amountText = `+৳${(+e.amount).toFixed(2)}`;
        } else if (isDeduction) {
          color = '#DC2626'; // red
          bg = '#FEE2E2';
          badgeText = 'Deduction';
          amountText = `-৳${Math.abs(+e.amount).toFixed(2)}`;
        }

        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-bottom:1px solid var(--border-color);background:var(--bg-primary);">
            <div style="width:34px;height:34px;border-radius:50%;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;font-weight:bold;">
              ${isRecharge ? '＋' : (isDeduction ? '－' : '⚙️')}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                <span style="font-weight:700;font-size:var(--font-sm);color:var(--text-primary);">${amountText}</span>
                <span style="font-size:11px;background:${bg};color:${color};padding:2px 8px;border-radius:99px;font-weight:700;">${badgeText}</span>
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">Remaining Balance: ৳${(+(e.balance || 0)).toFixed(2)} &nbsp;·&nbsp; ${dtStr}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5;">${(e.note || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
          </div>`;
      }).join('');

    } catch (e) {
      console.error('[SMSAlert] refreshBalanceHistory error:', e);
      container.innerHTML = `<p style="color:var(--danger-600);padding:var(--space-4);">Failed to load SMS balance history.</p>`;
    }
  },

  // ─── Format persistence ───────────────────────────────

  async _loadFormat() {
    if (!this.diningId) return;
    try {
      const snap = await db.ref(`dinings/${this.diningId}/smsConfig/format`).once('value');
      const fmt = snap.val() || '';
      const ta = document.getElementById('smsFormatInput');
      if (ta) {
        ta.value = fmt;
        this._updateCharCount(fmt);
        this.updatePreview();
      }
    } catch (e) {
      console.error('[SMSAlert] loadFormat error:', e);
    }
  },

  async saveFormat() {
    if (!this.diningId) return;
    const fmt = (document.getElementById('smsFormatInput')?.value || '').trim();
    if (!fmt) {
      Notifications.toast('warning', 'Empty Template', 'Please write an SMS template before saving.');
      return;
    }
    const btn = document.getElementById('smsSaveFormatBtn');
    if (btn) btn.disabled = true;

    try {
      await db.ref(`dinings/${this.diningId}/smsConfig/format`).set(fmt);
      Notifications.toast('success', 'SMS Format Saved', 'Your deposit SMS template has been saved.');
      this._dirty = false;
    } catch (e) {
      console.error('[SMSAlert] saveFormat error:', e);
      Notifications.toast('error', 'Error', 'Failed to save SMS format.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ─── Tag insertion ─────────────────────────────────────

  insertTag(tag) {
    const ta = document.getElementById('smsFormatInput');
    if (!ta) return;
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + tag.length;
    this._dirty = true;
    this._updateCharCount(ta.value);
    this.updatePreview();
  },

  markDirty() {
    this._dirty = true;
    this._updateCharCount(document.getElementById('smsFormatInput')?.value || '');
  },

  _updateCharCount(text) {
    const el = document.getElementById('smsCharCount');
    if (el) el.textContent = `${text.length} characters`;
  },

  // ─── Preview ──────────────────────────────────────────

  updatePreview() {
    const ta = document.getElementById('smsFormatInput');
    if (!ta) return;
    const fmt = ta.value.trim();
    const box = document.getElementById('smsPreviewBox');
    const txt = document.getElementById('smsPreviewText');
    if (!box || !txt) return;

    if (!fmt) { box.style.display = 'none'; return; }

    const now = new Date();
    const sampleDatetime = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const rendered = fmt
      .replace(/{name}/g, this._sampleData.name)
      .replace(/{email}/g, this._sampleData.email)
      .replace(/{phone}/g, this._sampleData.phone)
      .replace(/{amount}/g, this._sampleData.amount)
      .replace(/{balance}/g, this._sampleData.balance)
      .replace(/{note}/g, this._sampleData.note)
      .replace(/{datetime}/g, sampleDatetime);

    txt.textContent = rendered;
    box.style.display = '';
  },

  // ─── Send Test SMS ────────────────────────────────────

  async sendTestSms() {
    if (!this.diningId) return;

    const snap = await db.ref(`dinings/${this.diningId}/smsConfig`).once('value');
    const cfg = snap.val() || {};

    if (!cfg.apiKey || !cfg.senderId) {
      Notifications.toast('warning', 'Config Missing', 'Please save your API Key and Sender ID first.');
      return;
    }

    const fmt = (document.getElementById('smsFormatInput')?.value || '').trim();
    if (!fmt) {
      Notifications.toast('warning', 'No Template', 'Please write and save an SMS template first.');
      return;
    }

    // Check balance first
    const balance = Utils.num(cfg.smsBalance);
    const rate = Utils.num(cfg.smsRate || 0.30);

    // Use the admin's own phone from users module if available, else show prompt
    const currentUser = Messliner.state;
    const users = Messliner.users?.users || {};
    const adminUser = users[currentUser?.userId];
    const testNumber = adminUser?.phone ? this._formatNumber(adminUser.phone) : null;

    if (!testNumber) {
      Notifications.toast('warning', 'No Phone Number', 'Your admin account has no phone number set. Add a phone number in your profile first.');
      return;
    }

    if (balance < rate) {
      Notifications.toast('error', 'Insufficient Balance', `Insufficient SMS balance. Required: ৳${rate.toFixed(2)}, Available: ৳${balance.toFixed(2)}`);
      return;
    }

    const now = new Date();
    const datetime = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const message = fmt
      .replace(/{name}/g, adminUser.name || 'Admin')
      .replace(/{email}/g, adminUser.email || '')
      .replace(/{phone}/g, adminUser.phone || '')
      .replace(/{amount}/g, '100')
      .replace(/{balance}/g, '1000')
      .replace(/{note}/g, 'Test deposit')
      .replace(/{datetime}/g, datetime);

    const btn = document.getElementById('smsSendTestBtn');
    if (btn) btn.disabled = true;

    try {
      const result = await this._sendSMS(cfg.apiKey, cfg.senderId, testNumber, message);
      if (result.success) {
        Notifications.toast('success', 'Test SMS Sent', `SMS sent to ${testNumber}. API response: ${result.code}`);

        // Deduct balance and record to smsBalanceHistory
        const updatedBalance = balance - rate;
        await db.ref(`dinings/${this.diningId}/smsConfig/smsBalance`).set(updatedBalance);

        await db.ref(`dinings/${this.diningId}/smsBalanceHistory`).push({
          amount: -rate,
          type: 'deduction',
          balance: updatedBalance,
          rate: rate,
          note: `Test SMS sent to Admin (${testNumber})`,
          timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
        });

        // Trigger updates if we are on the More Menu page
        this._loadConfig();
      } else {
        Notifications.toast('error', 'SMS Failed', `API returned code: ${result.code}. Check API key and sender ID.`);
      }
    } catch (e) {
      console.error('[SMSAlert] sendTestSms error:', e);
      Notifications.toast('error', 'SMS Error', 'Could not send test SMS. Check your API credentials.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ─── Main SMS sender (called after deposit) ───────────

  /**
   * Called from FinanceModule.saveDeposit() after a successful deposit.
   * @param {object} params - { userId, userName, amount, newBalance, note, diningId }
   */
  async sendDepositSMS(params) {
    if (params.diningId) {
      this.diningId = params.diningId;
    }
    if (!this.diningId) return;

    try {
      const snap = await db.ref(`dinings/${this.diningId}/smsConfig`).once('value');
      const cfg = snap.val() || {};

      if (!cfg.enabled) return;
      if (!cfg.apiKey || !cfg.senderId || !cfg.format) return;

      // Check SMS Balance and Rate
      const balance = Utils.num(cfg.smsBalance);
      const rate = Utils.num(cfg.smsRate || 0.30);

      // Get user's phone number from database
      const userSnap = await db.ref(`dinings/${this.diningId}/users/${params.userId}`).once('value');
      const user = userSnap.val() || {};
      const rawPhone = user.phone || '';

      if (!rawPhone) {
        console.log('[SMSAlert] No phone number for user:', params.userId);
        await this._logSMS({ to: 'N/A', status: 'skipped', reason: 'No phone number', ...params });
        if (Router.currentPage === 'more') this.refreshLog();
        return;
      }

      const formattedNumber = this._formatNumber(rawPhone);

      // Check for insufficient balance
      if (balance < rate) {
        console.warn('[SMSAlert] Insufficient SMS balance. Required:', rate, 'Available:', balance);
        // Log to SMS Log as skipped / insufficient balance
        await this._logSMS({
          to: formattedNumber,
          userName: user.name || params.userName,
          amount: params.amount,
          message: 'Deposit alert SMS (unsent)',
          status: 'skipped',
          reason: 'Insufficient SMS Balance',
          timestamp: Date.now(),
        });

        // Push notification for admin warning about insufficient SMS balance
        await Notifications.create(this.diningId, 'Insufficient SMS Balance', `SMS alert failed for ${user.name || 'User'} due to insufficient SMS balance.`, 'all', 'system');
        if (Router.currentPage === 'more') this.refreshLog();
        return;
      }

      const now = new Date();
      const datetime = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // ─── Compute actual user balance (My Balance) ─────────────────
      // Must match dashboard.js renderStats() exactly:
      //   balance = monthlyDeposit - calcMealCost(monthlyMeals) - monthlyOtherCosting - monthlyDeduction
      // All values are filtered to the CURRENT MONTH only.
      let actualBalance = params.newBalance; // safe fallback
      try {
        const currentMonth = Utils.currentMonth(); // e.g. "2025-08"

        // 1. Fetch this user's deposits and filter to current month
        const depositsSnap = await db.ref(`dinings/${this.diningId}/deposits`)
          .orderByChild('userId').equalTo(params.userId).once('value');

        let monthlyDeposit = 0, monthlyOtherCost = 0, monthlyDeduction = 0;
        depositsSnap.forEach(child => {
          const d = child.val();
          if (!d || !d.date || !d.date.startsWith(currentMonth)) return;
          const amt = Math.abs(parseFloat(d.amount) || 0);
          if (d.type === 'deposit') monthlyDeposit += amt;
          else if (d.type === 'other_costing') monthlyOtherCost += amt;
          else if (d.type === 'deduction' || d.type === 'friday_meal') monthlyDeduction += amt;
        });

        // 2. Fetch current-month meals for this user (same as dashboard._listenMonthlyData)
        const mealsSnap = await db.ref(`dinings/${this.diningId}/meals/${currentMonth}`).once('value');
        const monthData = mealsSnap.val() || {};
        let monthlyMeals = 0;
        const mealsBreakdown = { breakfast: 0, lunch: 0, dinner: 0 };
        Object.values(monthData).forEach(dayData => {
          Object.entries(dayData).forEach(([type, typeData]) => {
            if (typeof typeData === 'object' && typeData[params.userId] !== undefined) {
              const count = parseFloat(typeData[params.userId]) || 0;
              monthlyMeals += count;
              if (mealsBreakdown[type] !== undefined) mealsBreakdown[type] += count;
            }
          });
        });

        // 3. Get meal rate & settings (same as dashboard.js renderStats)
        const mealRate = (typeof Messliner !== 'undefined' && Messliner.state && Messliner.state.monthlyMealRate)
          ? Messliner.state.monthlyMealRate : 0;
        const settingsSnap = await db.ref(`dinings/${this.diningId}/settings`).once('value');
        const settings = settingsSnap.val() || {};
        const rateMode = settings.rateMode || 'market';
        const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || null) : null;
        const mealCost = Utils.calcMealCost(mealRate, monthlyMeals, mealsBreakdown, fixedRates);

        // 4. Final balance — identical to dashboard formula
        actualBalance = monthlyDeposit - mealCost - monthlyOtherCost - monthlyDeduction;
      } catch (balErr) {
        console.warn('[SMSAlert] Could not compute actual balance, using totalDeposit:', balErr);
      }

      // Format amount and balance to exactly 2 decimal places
      const fmtAmount = (parseFloat(params.amount) || 0).toFixed(2);
      const fmtBalance = actualBalance.toFixed(2);

      const message = cfg.format
        .replace(/{name}/g, user.name || params.userName || 'Member')
        .replace(/{email}/g, user.email || '')
        .replace(/{phone}/g, rawPhone)
        .replace(/{amount}/g, fmtAmount)
        .replace(/{balance}/g, fmtBalance)
        .replace(/{note}/g, params.note || 'Deposit')
        .replace(/{datetime}/g, datetime);

      const result = await this._sendSMS(cfg.apiKey, cfg.senderId, formattedNumber, message);

      // Save to log
      await this._logSMS({
        to: formattedNumber,
        userName: user.name || params.userName,
        amount: params.amount,
        message,
        status: result.success ? 'sent' : 'failed',
        apiCode: result.code,
        timestamp: Date.now(),
      });

      if (result.success) {
        console.log(`[SMSAlert] SMS sent successfully to ${formattedNumber}`);

        // Deduct SMS balance
        const updatedBalance = balance - rate;
        await db.ref(`dinings/${this.diningId}/smsConfig/smsBalance`).set(updatedBalance);

        // Record balance deduction history
        await db.ref(`dinings/${this.diningId}/smsBalanceHistory`).push({
          amount: -rate,
          type: 'deduction',
          balance: updatedBalance,
          rate: rate,
          note: `SMS sent to ${user.name || 'Member'} (${formattedNumber}) for deposit of ৳${params.amount}`,
          userId: params.userId,
          userName: user.name || params.userName,
          timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
        });

        // Trigger updates if we are on the More Menu page
        if (Router.currentPage === 'more') {
          this._loadConfig();
          this.refreshLog();
          this.refreshBalanceHistory();
        }
      } else {
        console.warn(`[SMSAlert] SMS failed. API code: ${result.code}`);
        // Refresh log so the failed entry is visible
        if (Router.currentPage === 'more') {
          this.refreshLog();
        }
      }

    } catch (e) {
      console.error('[SMSAlert] sendDepositSMS error:', e);
    }
  },

  // ─── BulkSMSBD API call ───────────────────────────────

  /**
   * Sends SMS via BulkSMSBD using JSON POST (one-to-many format)
   * Returns { success: boolean, code: string|number }
   */
  async _sendSMS(apiKey, senderId, number, message) {
    const url = 'http://bulksmsbd.net/api/smsapi';
    const body = new URLSearchParams({
      api_key: apiKey,
      senderid: senderId,
      number: number,
      message: message,
      type: 'text',
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      let data;
      try { data = await response.json(); }
      catch { data = {}; }

      // BulkSMSBD returns response_code 202 for success
      const code = data?.response_code ?? data?.status ?? response.status;
      const success = (String(code) === '202');
      return { success, code, raw: data };

    } catch (fetchError) {
      // CORS may block this from browser; log it
      console.warn('[SMSAlert] Fetch error (possible CORS):', fetchError);
      // Try via no-cors as fallback (won't get response body)
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        return { success: true, code: 'sent_no_cors' };
      } catch (e2) {
        return { success: false, code: 'network_error' };
      }
    }
  },

  // ─── Number formatter ─────────────────────────────────

  /**
   * Ensures number is in format 8801XXXXXXXXX (88 prefix)
   */
  _formatNumber(raw) {
    let n = String(raw || '').replace(/\D/g, '');
    // Remove leading zeros
    if (n.startsWith('00')) n = n.slice(2);
    // Add 88 prefix if starts with 01
    if (n.startsWith('01') && n.length === 11) n = '88' + n;
    // Add 88 if missing and starts with 1
    if (n.length === 10 && n.startsWith('1')) n = '880' + n;
    return n;
  },

  // ─── SMS Log ──────────────────────────────────────────

  async _logSMS(entry) {
    if (!this.diningId) return;
    try {
      await db.ref(`dinings/${this.diningId}/smsLog`).push({
        ...entry,
        timestamp: entry.timestamp || Date.now(),
      });
    } catch (e) {
      console.error('[SMSAlert] _logSMS error:', e);
    }
  },

  async refreshLog() {
    if (!this.diningId) return;
    const container = document.getElementById('smsLogList');
    if (!container) return;

    container.innerHTML = `<div class="empty-state" style="padding:var(--space-4);"><div class="spinner"></div><p style="margin-top:8px;font-size:var(--font-sm);color:var(--text-secondary);">Loading...</p></div>`;

    try {
      const snap = await db.ref(`dinings/${this.diningId}/smsLog`).once('value');

      const entries = [];
      snap.forEach(child => {
        const val = child.val();
        if (val) entries.push(val);
      });
      // Sort newest first
      entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      // Limit to 50
      const limited = entries.slice(0, 50);

      if (limited.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-5);">
            <div class="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
            </div>
            <h3>No SMS Sent Yet</h3>
            <p>SMS logs will appear here after deposits.</p>
          </div>`;
        return;
      }

      container.innerHTML = limited.map(e => {
        const dt = e.timestamp ? new Date(e.timestamp) : null;
        const dtStr = dt ? `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '—';
        const isOk = e.status === 'sent';
        const statusColor = isOk ? '#059669' : (e.status === 'skipped' ? '#D97706' : '#DC2626');
        const statusBg = isOk ? '#ECFDF5' : (e.status === 'skipped' ? '#FEF3C7' : '#FEE2E2');
        const statusLabel = isOk ? '✓ Sent' : (e.status === 'skipped' ? '⚠ Skipped' : '✗ Failed');

        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-bottom:1px solid var(--border-color);background:var(--bg-primary);">
            <div style="width:34px;height:34px;border-radius:50%;background:${statusBg};color:${statusColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;">
              ${isOk ? '📤' : (e.status === 'skipped' ? '⚠️' : '❌')}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                <span style="font-weight:700;font-size:var(--font-sm);color:var(--text-primary);">${e.userName || 'Unknown'}</span>
                <span style="font-size:11px;background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:99px;font-weight:700;">${statusLabel}</span>
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">${e.to || '—'} &nbsp;·&nbsp; ${dtStr}</div>
              ${e.message ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.5;background:var(--bg-secondary);padding:6px 8px;border-radius:6px;border:1px solid var(--border-color);">${e.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
              ${e.reason ? `<div style="font-size:11px;color:#D97706;margin-top:3px;">Reason: ${e.reason}</div>` : ''}
              ${e.apiCode ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">API code: ${e.apiCode}</div>` : ''}
            </div>
          </div>`;
      }).join('');

    } catch (e) {
      console.error('[SMSAlert] refreshLog error:', e);
      container.innerHTML = `<p style="color:var(--danger-600);padding:var(--space-4);">Failed to load SMS log.</p>`;
    }
  },
};

window.SMSAlertModule = SMSAlertModule;
console.log('[Messliner] SMSAlert module loaded');
