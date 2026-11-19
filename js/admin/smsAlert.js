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

  // ─── Init & Dining ID ──────────────────────────────────

  getDiningId() {
    if (this.diningId) return this.diningId;
    this.diningId = window.Messliner?.state?.diningId || localStorage.getItem('currentDiningId') || localStorage.getItem('dining_id') || null;
    return this.diningId;
  },

  init(diningId) {
    this.diningId = diningId || this.getDiningId();
    console.log('[SMSAlert] Initialized for dining:', this.diningId);
    this._listenConfig();
  },

  /** Called by Router when navigating to 'more' page */
  refresh() {
    this.getDiningId();
    this._listenConfig();
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
      this._listenConfig();
    }
  },

  // ─── Realtime Config persistence (Firebase) ───────────

  _listenConfig() {
    const diningId = this.getDiningId();
    if (!diningId || !window.db) return;

    if (this._configListenerRef) {
      try { this._configListenerRef.off(); } catch (e) { }
    }

    this._configListenerRef = db.ref(`dinings/${diningId}/smsConfig`);
    this._configListenerRef.on('value', async (snap) => {
      const cfg = snap.val() || {};
      this.cachedConfig = cfg;
      await this._applyConfigToUI(cfg);
    });
  },

  async _loadConfig() {
    return this._listenConfig();
  },

  async _applyConfigToUI(cfg) {
    cfg = cfg || this.cachedConfig || {};

    // 1. Sync Toggle Switch accurately from DB state
    const toggleEl = document.getElementById('smsAlertToggle');
    if (toggleEl) {
      toggleEl.checked = !!cfg.enabled;
    }

    // 2. Load Rate & Balance from database & universal config
    let rate = Utils.num(cfg.smsRate);
    if (!rate || rate <= 0) {
      if (this._universalRate) {
        rate = this._universalRate;
      } else {
        const universalCfg = await this.getUniversalConfig();
        this._universalRate = Utils.num(universalCfg.rate || 0.70);
        rate = this._universalRate;
      }
    }
    this.currentRate = rate || 0.70;

    const balance = Utils.num(cfg.smsBalance || 0);
    this.currentBalance = balance;

    // Remaining calculation in poysha (1 Tk = 100 poysha)
    const balanceInPoysha = Math.round(balance * 100);
    const rateInPoysha = Math.round(this.currentRate * 100);
    const remaining = (rateInPoysha > 0 && balanceInPoysha > 0) ? Math.floor(balanceInPoysha / rateInPoysha) : 0;

    // 3. Update top metric cards
    Utils.setText('smsBalanceDisplay', `৳${balance.toFixed(2)}`);
    Utils.setText('smsRateDisplay', `৳${this.currentRate.toFixed(2)}`);
    Utils.setText('smsRemainingDisplay', remaining);

    // 4. Live calculate estimated credits for recharge box
    const amountInput = document.getElementById('bkashRechargeAmount');
    const amountVal = amountInput ? amountInput.value : 100;
    this.calcBkashEstimatedSms(amountVal);
  },

  getPerSmsRate() {
    if (this.currentRate && this.currentRate > 0) return this.currentRate;
    const rateEl = document.getElementById('smsRateDisplay');
    if (rateEl) {
      const match = rateEl.textContent.replace(/[^\d.]/g, '');
      const parsed = parseFloat(match);
      if (!isNaN(parsed) && parsed > 0) {
        this.currentRate = parsed;
        return parsed;
      }
    }
    if (this.cachedConfig && Utils.num(this.cachedConfig.smsRate) > 0) {
      this.currentRate = Utils.num(this.cachedConfig.smsRate);
      return this.currentRate;
    }
    if (this._universalRate && this._universalRate > 0) return this._universalRate;
    return 0.70;
  },

  selectBkashAmount(amt) {
    const input = document.getElementById('bkashRechargeAmount');
    if (input) {
      input.value = amt;
      this.calcBkashEstimatedSms(amt);
    }
  },

  calcBkashEstimatedSms(amountVal) {
    const rawStr = (amountVal !== undefined && amountVal !== null) ? String(amountVal).trim() : '';
    const amt = parseFloat(rawStr) || 0;

    // Synchronize chips: if current input exactly equals a chip's number, highlight it; otherwise deselect all
    const chips = document.querySelectorAll('#bkashQuickAmountChips .btn-chip');
    chips.forEach(btn => {
      const chipNumber = btn.textContent.replace(/[^\d]/g, '');
      const isMatch = rawStr !== '' && chipNumber === String(amt);
      btn.style.borderColor = isMatch ? '#E2136E' : '#cbd5e1';
      btn.style.background = isMatch ? '#FDF2F8' : '#fff';
      btn.style.color = isMatch ? '#E2136E' : '#334155';
    });

    // Per SMS rate based on UI / database (1 Tk = 100 poysha, e.g. 0.70 Tk = 70 poysha)
    const rate = this.getPerSmsRate();
    const rateInPoysha = Math.round(rate * 100);
    const amountInPoysha = Math.round(amt * 100);

    const count = (rateInPoysha > 0 && amountInPoysha > 0) ? Math.floor(amountInPoysha / rateInPoysha) : 0;

    const el = document.getElementById('bkashEstSmsCount');
    if (el) {
      el.textContent = `≈ ${count} SMS Credits`;
    }
  },

  async initiateBkashRecharge() {
    if (!this.diningId) {
      Notifications.toast('warning', 'Session Missing', 'Please select a dining mess first.');
      return;
    }

    const amountInput = document.getElementById('bkashRechargeAmount');
    const amountVal = parseFloat(amountInput?.value);

    if (isNaN(amountVal) || amountVal < 10) {
      Notifications.toast('warning', 'Invalid Amount', 'Minimum recharge amount is ৳10.');
      return;
    }

    const customerPhone = Messliner.state?.diningInfo?.phone || Messliner.state?.user?.phone || '01700000000';

    const btn = document.getElementById('bkashPayBtn');
    const defaultBtnHtml = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
      <span>Pay with bKash</span>
    `;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <div class="spinner" style="width:18px;height:18px;border:2.5px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <span>Redirecting to payment page...</span>
      `;
    }

    // Save pending recharge in localStorage so callback page can complete transaction
    const pendingData = {
      diningId: this.diningId,
      amount: amountVal,
      timestamp: Date.now(),
      phone: customerPhone
    };
    try {
      localStorage.setItem('ml_pending_bkash_recharge', JSON.stringify(pendingData));
    } catch (_) {}

    // Determine callback URL
    let callbackURL = window.location.origin + '/callback.html';
    try {
      callbackURL = new URL('callback.html', window.location.href).href;
    } catch (_) {}

    if (window.MesslinerPayment) {
      try {
        await window.MesslinerPayment.initiatePayment({
          amount: amountVal,
          type: 'sms_recharge',
          diningId: this.diningId,
          phone: customerPhone,
          callbackUrl: callbackURL
        });
        return;
      } catch (payErr) {
        console.error('[SMSAlert] Payment initiation error:', payErr);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = defaultBtnHtml;
        }
        Notifications.toast('error', 'Payment Initiation Notice', payErr.message || 'Could not initiate payment.');
        return;
      }
    }

    const GATEWAY_URL = (window.__ENV__ && window.__ENV__.BKASH_GATEWAY && window.__ENV__.BKASH_GATEWAY.gatewayUrl) || "https://mygateway.netlify.app";
    const LICENSE_KEY = (window.__ENV__ && window.__ENV__.BKASH_GATEWAY && window.__ENV__.BKASH_GATEWAY.licenseKey) || "bklc_6bnDy4ZuSb0ERQPMlzq2LhH1N7Q11ttV";

    try {
      const res = await fetch(`${GATEWAY_URL}/api/gateway/create-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "License-Key": LICENSE_KEY
        },
        body: JSON.stringify({
          amount: amountVal.toFixed(2),
          customerPhone: customerPhone,
          merchantInvoiceNumber: "INV-" + Date.now(),
          callbackURL: callbackURL
        })
      });

      const data = await res.json();

      if (data.bkashURL) {
        window.location.href = data.bkashURL;
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = defaultBtnHtml;
        }
        Notifications.toast('error', 'bKash Gateway Notice', data.statusMessage || 'Unable to initiate bKash payment.');
      }
    } catch (err) {
      console.error('[bKash] Gateway Error:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = defaultBtnHtml;
      }
      Notifications.toast('error', 'Connection Error', 'Could not reach bKash payment gateway. Please check your internet connection.');
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

  requestToggleEnable(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const toggleEl = document.getElementById('smsAlertToggle');
    const isCurrentlyChecked = toggleEl ? toggleEl.checked : false;
    const targetState = !isCurrentlyChecked;
    this.openToggleConfirmModal(targetState);
  },

  openToggleConfirmModal(targetState) {
    this._pendingToggleState = targetState;

    const modal = document.getElementById('smsToggleConfirmModal');
    const titleEl = document.getElementById('smsToggleModalTitle');
    const descEl = document.getElementById('smsToggleModalDesc');
    const statusTag = document.getElementById('smsToggleModalStatusTag');
    const btnText = document.getElementById('btnSmsToggleConfirmActionText');
    const confirmBtn = document.getElementById('btnSmsToggleConfirmAction');
    const iconRing = document.getElementById('smsToggleModalIconRing');
    const iconInner = document.getElementById('smsToggleModalIconInner');

    if (targetState) {
      // Turning ON
      if (titleEl) titleEl.textContent = 'Enable Deposit SMS Notifications?';
      if (descEl) descEl.textContent = 'Automated SMS alerts will be sent to members immediately whenever their deposit is confirmed.';
      if (statusTag) {
        statusTag.textContent = 'OFF → ON';
        statusTag.style.color = '#059669';
      }
      if (btnText) btnText.textContent = 'OK, Turn ON';
      if (confirmBtn) {
        confirmBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        confirmBtn.style.boxShadow = '0 4px 14px rgba(5, 150, 105, 0.3)';
      }
      if (iconRing) {
        iconRing.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.2) 100%)';
        iconRing.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        iconRing.style.boxShadow = '0 0 0 6px rgba(16, 185, 129, 0.08)';
        iconRing.style.color = '#059669';
      }
      if (iconInner) {
        iconInner.style.background = 'transparent';
        iconInner.style.color = '#059669';
        iconInner.innerHTML = `
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        `;
      }
    } else {
      // Turning OFF
      if (titleEl) titleEl.textContent = 'Disable Deposit SMS Notifications?';
      if (descEl) descEl.textContent = 'SMS notifications will be paused. Members will not receive automated SMS alerts for new deposits.';
      if (statusTag) {
        statusTag.textContent = 'ON → OFF';
        statusTag.style.color = '#e11d48';
      }
      if (btnText) btnText.textContent = 'OK, Turn OFF';
      if (confirmBtn) {
        confirmBtn.style.background = 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)';
        confirmBtn.style.boxShadow = '0 4px 14px rgba(225, 29, 72, 0.3)';
      }
      if (iconRing) {
        iconRing.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(225, 29, 72, 0.2) 100%)';
        iconRing.style.borderColor = 'rgba(244, 63, 94, 0.35)';
        iconRing.style.boxShadow = '0 0 0 6px rgba(244, 63, 94, 0.08)';
        iconRing.style.color = '#e11d48';
      }
      if (iconInner) {
        iconInner.style.background = 'transparent';
        iconInner.style.color = '#e11d48';
        iconInner.innerHTML = `
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            <path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path>
            <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path>
            <path d="M18 8a6 6 0 0 0-9.33-5"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        `;
      }
    }

    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  cancelToggleConfirm(e) {
    if (e && e.target && e.target.closest && e.target.closest('.zero-meal-card') && e.target !== e.currentTarget) {
      return;
    }
    const modal = document.getElementById('smsToggleConfirmModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
    // Re-verify toggle state from cached config
    const toggleEl = document.getElementById('smsAlertToggle');
    if (toggleEl && this.cachedConfig) {
      toggleEl.checked = !!this.cachedConfig.enabled;
    }
    this._pendingToggleState = null;
  },

  async confirmToggleEnable() {
    const targetState = this._pendingToggleState;
    const modal = document.getElementById('smsToggleConfirmModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = 'auto';
    }

    const toggleEl = document.getElementById('smsAlertToggle');
    if (toggleEl && typeof targetState === 'boolean') {
      toggleEl.checked = targetState;
    }

    if (typeof targetState === 'boolean') {
      await this.toggleEnable(targetState);
    }
    this._pendingToggleState = null;
  },

  async toggleEnable(enabled) {
    const diningId = this.getDiningId();
    if (!diningId || !window.db) return;
    try {
      await db.ref(`dinings/${diningId}/smsConfig/enabled`).set(enabled);
      if (this.cachedConfig) {
        this.cachedConfig.enabled = enabled;
      }
      Notifications.toast('success', enabled ? 'SMS Alerts ON' : 'SMS Alerts OFF',
        enabled ? 'Deposit SMS notifications are now active.' : 'Deposit SMS notifications disabled.');
    } catch (e) {
      console.error('[SMSAlert] toggleEnable error:', e);
      const toggleEl = document.getElementById('smsAlertToggle');
      if (toggleEl) {
        toggleEl.checked = !enabled;
      }
      Notifications.toast('error', 'Update Failed', 'Failed to update SMS notification setting.');
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
      this.currentBalance = newBalance;
      this.currentRate = newRate;
      const balanceInPoysha = Math.round(newBalance * 100);
      const rateInPoysha = Math.round(newRate * 100);
      const remaining = (rateInPoysha > 0 && balanceInPoysha > 0) ? Math.floor(balanceInPoysha / rateInPoysha) : 0;
      Utils.setText('smsBalanceDisplay', `৳${newBalance.toFixed(2)}`);
      Utils.setText('smsRateDisplay', `৳${newRate.toFixed(2)}`);
      Utils.setText('smsRemainingDisplay', remaining);

      // Recalculate bkash recharge estimate with new rate
      const amountInput = document.getElementById('bkashRechargeAmount');
      const amountVal = amountInput ? amountInput.value : 100;
      this.calcBkashEstimatedSms(amountVal);

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

      container.innerHTML = limited.map((e, idx) => {
        const dt = e.timestamp ? new Date(e.timestamp) : null;
        const dtStr = dt ? `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '—';

        const isRecharge = e.amount > 0;
        const isDeduction = e.amount < 0;

        let color = '#334155';
        let bg = 'rgba(100, 116, 139, 0.08)';
        let border = 'rgba(100, 116, 139, 0.2)';
        let badgeText = 'Update';
        let amountText = `৳${(+e.amount).toFixed(2)}`;
        let iconSvg = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

        if (isRecharge) {
          color = '#059669';
          bg = 'rgba(16, 185, 129, 0.08)';
          border = 'rgba(16, 185, 129, 0.2)';
          badgeText = 'Recharge';
          amountText = `+৳${(+e.amount).toFixed(2)}`;
          iconSvg = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        } else if (isDeduction) {
          color = '#DC2626';
          bg = 'rgba(239, 68, 68, 0.08)';
          border = 'rgba(239, 68, 68, 0.2)';
          badgeText = 'Deduction';
          amountText = `-৳${Math.abs(+e.amount).toFixed(2)}`;
          iconSvg = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        }

        const isLast = idx === limited.length - 1;

        return `
          <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-bottom:${isLast ? 'none' : '1px solid #f1f5f9'};background:#ffffff;transition:background 0.15s ease;">
            <div style="width:38px;height:38px;border-radius:12px;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid ${border};">
              ${iconSvg}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <span style="font-weight:800;font-size:0.95rem;color:${isRecharge ? '#059669' : (isDeduction ? '#dc2626' : '#0f172a')};">${amountText}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:0.72rem;color:#94a3b8;font-weight:500;">${dtStr}</span>
                  <span style="font-size:0.7rem;background:${bg};color:${color};border:1px solid ${border};padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:0.02em;display:inline-flex;align-items:center;gap:4px;">
                    <span style="width:5px;height:5px;border-radius:50%;background:${color};"></span>
                    ${badgeText}
                  </span>
                </div>
              </div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Remaining Balance: <strong style="color:#0f172a;">৳${(+(e.balance || 0)).toFixed(2)}</strong></div>
              ${e.note ? `<div style="font-size:0.8125rem;color:#334155;margin-top:4px;line-height:1.5;">${(e.note || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
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

    const universalCfg = await this.getUniversalConfig();
    const hasServerGateway = !!(window.__ENV__?.FUNCTIONS?.sendSms) || !!(universalCfg.apiKey && universalCfg.senderId);
    if (!cfg.apiKey && !hasServerGateway) {
      Notifications.toast('warning', 'Config Missing', 'Please save your API Key and Sender ID or deploy the Supabase SMS Function.');
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

  // ─── Universal Super Admin SMS Gateway Configuration ─────────

  /**
   * Fetches universal BulkSMSBD credentials & deposit template managed universally by Super Admin.
   * Priority: Admin Firebase RTDB -> REST fallback -> mainDb sync fallback -> hardcoded defaults.
   */
  async getUniversalConfig() {
    const defaults = (window.__ENV__ && window.__ENV__.SMS_GATEWAY) ? { ...window.__ENV__.SMS_GATEWAY } : {
      apiKey: 'bYrAXuJRj42cIVvZRMnW',
      senderId: '8809648907383',
      rate: 0.30,
      format: 'Dear {name}, your deposit of {amount} BDT has been received. Current balance: {balance} BDT. Note: {note}. Date: {datetime}'
    };

    // 1. Try Firebase Admin App RTDB
    try {
      if (typeof firebase !== 'undefined') {
        const apps = firebase.apps || [];
        let adminApp = apps.find(a => a.name === 'MesslinerAdminPresence' || a.name === 'AdminApp');
        if (!adminApp) {
          const ADMIN_CONFIG = (window.__ENV__ && window.__ENV__.FIREBASE_ADMIN) ? window.__ENV__.FIREBASE_ADMIN : {
            apiKey: (window.__ENV__ && window.__ENV__.FIREBASE_ADMIN && window.__ENV__.FIREBASE_ADMIN.apiKey) || '',
            authDomain: 'meiner-admin.firebaseapp.com',
            databaseURL: 'https://meiner-admin-default-rtdb.firebaseio.com',
            projectId: 'meiner-admin',
            storageBucket: 'meiner-admin.firebasestorage.app',
            messagingSenderId: '62196998163',
            appId: '1:62196998163:web:b60256d994a0c674d95fe6'
          };
          adminApp = firebase.initializeApp(ADMIN_CONFIG, 'AdminApp');
        }
        if (adminApp) {
          const snap = await adminApp.database().ref('adminSystem/systemSettings').once('value');
          if (snap.exists()) {
            const data = snap.val() || {};
            return {
              apiKey: data.smsApiKey || defaults.apiKey,
              senderId: data.smsSenderId || defaults.senderId,
              rate: data.smsRate !== undefined ? parseFloat(data.smsRate) : defaults.rate,
              format: data.smsFormat || defaults.format
            };
          }
        }
      }
    } catch (e) {
      console.warn('[SMSAlert] Admin Firebase RTDB lookup notice:', e.message);
    }

    // 2. Direct REST endpoint fallback to Admin RTDB
    try {
      const res = await fetch('https://meiner-admin-default-rtdb.firebaseio.com/adminSystem/systemSettings.json');
      if (res.ok) {
        const data = await res.json();
        if (data && (data.smsApiKey || data.smsSenderId)) {
          return {
            apiKey: data.smsApiKey || defaults.apiKey,
            senderId: data.smsSenderId || defaults.senderId,
            rate: data.smsRate !== undefined ? parseFloat(data.smsRate) : defaults.rate,
            format: data.smsFormat || defaults.format
          };
        }
      }
    } catch (restErr) {
      console.warn('[SMSAlert] REST fallback lookup notice:', restErr.message);
    }

    // 3. Main DB sync check
    try {
      if (typeof db !== 'undefined') {
        const snap = await db.ref('adminSystem/systemSettings').once('value');
        if (snap.exists()) {
          const data = snap.val() || {};
          return {
            apiKey: data.smsApiKey || defaults.apiKey,
            senderId: data.smsSenderId || defaults.senderId,
            rate: data.smsRate !== undefined ? parseFloat(data.smsRate) : defaults.rate,
            format: data.smsFormat || defaults.format
          };
        }
      }
    } catch (mainErr) {
      console.warn('[SMSAlert] Main DB check notice:', mainErr.message);
    }

    return defaults;
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

      // Fetch universal gateway credentials & template from Super Admin database
      const universalCfg = await this.getUniversalConfig();
      const apiKey = universalCfg.apiKey;
      const senderId = universalCfg.senderId;
      const format = universalCfg.format;

      const hasEdgeFunction = !!(window.__ENV__?.FUNCTIONS?.sendSms);
      if (!format || (!hasEdgeFunction && (!apiKey || !senderId))) {
        console.warn('[SMSAlert] Universal SMS credentials or template missing.');
        return;
      }

      // Check SMS Balance and Universal Rate from Admin
      const balance = Utils.num(cfg.smsBalance);
      const rate = Utils.num(universalCfg.rate || cfg.smsRate || 0.30);

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

      const message = format
        .replace(/{name}/g, user.name || params.userName || 'Member')
        .replace(/{email}/g, user.email || '')
        .replace(/{phone}/g, rawPhone)
        .replace(/{amount}/g, fmtAmount)
        .replace(/{balance}/g, fmtBalance)
        .replace(/{note}/g, params.note || 'Deposit')
        .replace(/{datetime}/g, datetime);

      const result = await this._sendSMS(apiKey, senderId, formattedNumber, message);

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
   * Sends SMS securely via Supabase Cloud Edge Function (or direct HTTPS fallback)
   * Returns { success: boolean, code: string|number }
   */
  async _sendSMS(apiKey, senderId, number, message) {
    // 1. Try Supabase Cloud Edge Function (Secure & Hidden API Keys)
    const proxyUrl = (window.__ENV__?.FUNCTIONS?.sendSms) || "https://pgnjvtmofglkjplotrha.supabase.co/functions/v1/send-sms";
    const anonKey = (window.__ENV__?.SUPABASE_ANON_KEY) || "";

    let token = null;
    try {
      if (typeof getSupabaseClient === 'function') {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (session && session.access_token) {
          token = session.access_token;
        }
      }
      if (!token && typeof _getStoredAuthToken === 'function') {
        const raw = _getStoredAuthToken();
        if (raw) {
          const parsed = JSON.parse(raw);
          token = parsed?.access_token || parsed?.currentSession?.access_token;
        }
      }
    } catch (_) {}

    if (proxyUrl && token) {
      try {
        const edgeRes = await fetch(proxyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": anonKey
          },
          body: JSON.stringify({
            number: number,
            message: message,
            customApiKey: (apiKey && apiKey !== 'bYrAXuJRj42cIVvZRMnW') ? apiKey : undefined,
            customSenderId: (senderId && senderId !== '8809648907383') ? senderId : undefined
          })
        });

        if (edgeRes.ok) {
          const edgeData = await edgeRes.json();
          return {
            success: !!edgeData.success,
            code: edgeData.code,
            raw: edgeData.raw || edgeData
          };
        } else {
          const errDetail = await edgeRes.text();
          console.warn("[SMSAlert] Supabase Edge Function dispatch notice:", errDetail);
        }
      } catch (proxyErr) {
        console.warn("[SMSAlert] Edge proxy dispatch error, attempting fallback:", proxyErr.message);
      }
    }

    // 2. Direct fallback (via HTTPS endpoint to avoid mixed-content blocking)
    const url = 'https://bulksmsbd.net/api/smsapi';
    const body = new URLSearchParams({
      api_key: apiKey || '',
      senderid: senderId || '',
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
      console.warn('[SMSAlert] Fetch error (possible CORS):', fetchError);
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

      container.innerHTML = limited.map((e, idx) => {
        const dt = e.timestamp ? new Date(e.timestamp) : null;
        const dtStr = dt ? `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '—';
        const isOk = e.status === 'sent';
        const isSkipped = e.status === 'skipped';
        const statusColor = isOk ? '#059669' : (isSkipped ? '#D97706' : '#DC2626');
        const statusBg = isOk ? 'rgba(16, 185, 129, 0.08)' : (isSkipped ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)');
        const statusBorder = isOk ? 'rgba(16, 185, 129, 0.2)' : (isSkipped ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)');
        const statusLabel = isOk ? 'Sent' : (isSkipped ? 'Skipped' : 'Failed');

        const iconSvg = isOk
          ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
          : (isSkipped
            ? `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
            : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`);

        const isLast = idx === limited.length - 1;

        return `
          <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-bottom:${isLast ? 'none' : '1px solid #f1f5f9'};background:#ffffff;transition:background 0.15s ease;">
            <div style="width:38px;height:38px;border-radius:12px;background:${statusBg};color:${statusColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid ${statusBorder};">
              ${iconSvg}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:700;font-size:0.875rem;color:#0f172a;">${(e.userName || 'Member').replace(/</g, '&lt;')}</span>
                  <span style="font-size:0.75rem;color:#64748b;font-weight:500;display:inline-flex;align-items:center;gap:3px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 10.8a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    ${e.to || '—'}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:0.72rem;color:#94a3b8;font-weight:500;">${dtStr}</span>
                  <span style="font-size:0.7rem;background:${statusBg};color:${statusColor};border:1px solid ${statusBorder};padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:0.02em;display:inline-flex;align-items:center;gap:4px;">
                    <span style="width:5px;height:5px;border-radius:50%;background:${statusColor};"></span>
                    ${statusLabel}
                  </span>
                </div>
              </div>
              ${e.message ? `<div style="font-size:0.8125rem;color:#334155;margin-top:6px;line-height:1.5;background:#f8fafc;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;font-family:inherit;">${e.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
              ${e.reason ? `<div style="font-size:0.75rem;color:#b45309;margin-top:4px;font-weight:600;display:flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Reason: ${e.reason}</div>` : ''}
              ${e.apiCode ? `<div style="font-size:0.7rem;color:#94a3b8;margin-top:3px;">Ref: <code>${e.apiCode}</code></div>` : ''}
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
