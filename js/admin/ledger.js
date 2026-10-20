/* ============================================
   Messliner — Shared Bills & Ledger (admin/ledger.js)
   ============================================ */

const LedgerModule = {
  diningId: null,
  bills: {},
  mealsData: null,
  selectedSplitMonth: 'all',
  currentCycle: null, // e.g. "2026-09"
  splitType: 'equal',
  editingBillId: null,
  activeFilter: 'all', // all | pending | completed
  selectedDueDate: null,
  dueCalViewYear: undefined,
  dueCalViewMonth: undefined,

  /**
   * Preset categories with icons and defaults
   */
  presets: [
    {
      id: 'cook',
      name: 'Cook',
      label: 'Cook / Khala',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`
    },
    {
      id: 'wifi',
      name: 'WiFi',
      label: 'WiFi / Internet',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`
    },
    {
      id: 'electricity',
      name: 'Electricity',
      label: 'Electricity',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
    },
    {
      id: 'water',
      name: 'Water',
      label: 'Water Bill',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`
    },
    {
      id: 'gas',
      name: 'Gas',
      label: 'Gas Bill',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`
    }
  ],

  /**
   * Helper to safely get the current mess/dining ID
   */
  getDiningId() {
    const dId = this.diningId || Messliner.state?.diningId || (typeof App !== 'undefined' ? App.state?.diningId : null);
    if (dId && !this.diningId) {
      this.diningId = dId;
    }
    return dId;
  },

  /**
   * Initialize module with Firebase listener
   */
  init(diningId, initialData) {
    this.diningId = diningId || Messliner.state?.diningId || (typeof App !== 'undefined' ? App.state?.diningId : null);
    this.currentCycle = Utils.currentMonth();

    if (initialData?.bills) {
      this.bills = initialData.bills;
    } else {
      this.bills = {};
    }

    if (initialData?.settings?.paymentMethods) {
      this.paymentMethods = initialData.settings.paymentMethods;
    }

    if (initialData?.paymentRequests) {
      this.paymentRequests = initialData.paymentRequests;
    } else {
      this.paymentRequests = {};
    }

    if (initialData?.info?.createdAt) {
      this.createdAt = initialData.info.createdAt;
    }

    this.attachListeners();
    this.renderPaymentMethodsBanner();
    this.renderPaymentRequestsWidget();

    // Pre-fetch paymentRequests immediately if empty
    const dId = this.getDiningId();
    if (dId && (!this.paymentRequests || Object.keys(this.paymentRequests).length === 0)) {
      db.ref(`dinings/${dId}/paymentRequests`).once('value').then(snap => {
        if (snap.exists()) {
          this.paymentRequests = snap.val() || {};
          this.updatePaymentRequestsBadge();
          this.renderPaymentRequestsWidget();
        }
      }).catch(err => console.warn('Payment requests prefetch failed:', err));
    }

    // Close due date calendar popup on outside click
    if (!this._clickListenerAttached) {
      this._clickListenerAttached = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#ledgerDatePickerTrigger') && !e.target.closest('#ledgerDueDateCalendarPopup')) {
          this.closeDueDateCalendar();
        }
      });
    }
  },

  /**
   * Ensure real-time Firebase listeners are connected
   */
  attachListeners() {
    const diningId = this.getDiningId();
    if (!diningId || this._listenersAttached) return;
    this._listenersAttached = true;

    // Live Firebase Listener for Dining Info (createdAt)
    db.ref(`dinings/${diningId}/info/createdAt`).on('value', (snap) => {
      this.createdAt = snap.val() || null;
    });

    // Live Firebase Listener for Bills
    db.ref(`dinings/${diningId}/bills`).on('value', (snap) => {
      this.bills = snap.val() || {};

      // Auto-correct any bill created in current cycle where month was accidentally set to split filter month
      const currentMonth = Utils.currentMonth();
      Object.entries(this.bills).forEach(([bId, b]) => {
        if (b && b.splitMonth && b.month !== currentMonth && b.createdAt) {
          const dt = new Date(b.createdAt);
          const cCycle = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          if (cCycle === currentMonth) {
            b.month = currentMonth;
            db.ref(`dinings/${diningId}/bills/${bId}/month`).set(currentMonth);
          }
        }
      });

      this.renderPaymentRequestsWidget();
      if (Router.currentPage === 'ledger') {
        this.render();
      }
    });

    // Also re-render if users or deposits change while viewing
    db.ref(`dinings/${diningId}/users`).on('value', () => {
      this.renderPaymentRequestsWidget();
      if (Router.currentPage === 'ledger') {
        this.render();
      }
    });

    // Live Firebase Listener for Meals (for active-member split calculations)
    db.ref(`dinings/${diningId}/meals`).on('value', (snap) => {
      this.mealsData = snap.val() || {};
      if (document.getElementById('ledgerBillModal')?.classList.contains('active')) {
        this.renderMembersChecklist();
        this.updateSplitCalculation();
      }
    });

    // Listen to Payment Requests from members
    db.ref(`dinings/${diningId}/paymentRequests`).on('value', (snap) => {
      this.paymentRequests = snap.val() || {};
      this.updatePaymentRequestsBadge();
      this.renderPaymentRequestsWidget();
      if (document.getElementById('ledgerPaymentRequestsModal')?.classList.contains('active')) {
        this.renderPaymentRequestsUI();
      }
    });

    // Listen to Payment Methods config in real-time
    db.ref(`dinings/${diningId}/settings/paymentMethods`).on('value', (snap) => {
      this.paymentMethods = snap.val() || {};
      this.renderPaymentMethodsBanner();
      if (document.getElementById('ledgerPaymentMethodsModal')?.classList.contains('active')) {
        this.renderPaymentMethodsModal();
      }
    });
  },

  /**
   * Refresh the view
   */
  refresh() {
    if (!this.currentCycle) {
      this.currentCycle = Utils.currentMonth();
    }
    this.render();
  },

  /**
   * Format cycle string "2026-09" to readable "September 2026"
   */
  formatCycle(cycle) {
    if (!cycle) return '';
    const [year, month] = cycle.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  /**
   * Navigate to previous month cycle
   */
  prevCycle() {
    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    this.currentCycle = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.render();
  },

  /**
   * Navigate to next month cycle
   */
  nextCycle() {
    const [year, month] = this.currentCycle.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    this.currentCycle = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    this.render();
  },

  /**
   * Render the entire Ledger page
   */
  render() {
    this.attachListeners();
    this.renderPaymentMethodsBanner();
    this.renderPaymentRequestsWidget();

    const diningId = this.getDiningId();
    if (diningId && (!this.paymentMethods || Object.keys(this.paymentMethods).length === 0)) {
      db.ref(`dinings/${diningId}/settings/paymentMethods`).once('value').then((snap) => {
        if (snap.exists()) {
          this.paymentMethods = snap.val() || {};
          this.renderPaymentMethodsBanner();
        }
      }).catch(err => console.warn('Payment methods pre-fetch failed:', err));
    }

    if (diningId && (!this.paymentRequests || Object.keys(this.paymentRequests).length === 0)) {
      db.ref(`dinings/${diningId}/paymentRequests`).once('value').then((snap) => {
        if (snap.exists()) {
          this.paymentRequests = snap.val() || {};
          this.updatePaymentRequestsBadge();
          this.renderPaymentRequestsWidget();
        }
      }).catch(err => console.warn('Payment requests pre-fetch failed:', err));
    }

    const cycleTitleEl = document.getElementById('ledgerCycleTitle');
    const cycleSubEl = document.getElementById('ledgerCycleSubtitle');
    if (cycleTitleEl) cycleTitleEl.textContent = this.formatCycle(this.currentCycle);
    if (cycleSubEl) cycleSubEl.textContent = `${this.formatCycle(this.currentCycle)} cycle`;

    // Filter bills strictly for current cycle (no cross-month leakage)
    const cycleBills = Object.entries(this.bills)
      .map(([id, b]) => ({ id, ...b }))
      .filter(b => (b.month || b.cycle) === this.currentCycle);

    // Calculate Summary Stats
    let totalBilled = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalCount = cycleBills.length;

    cycleBills.forEach(b => {
      const bTotal = Utils.num(b.totalAmount);
      totalBilled += bTotal;
      let bCollected = 0;

      if (b.members) {
        Object.values(b.members).forEach(m => {
          const amt = Utils.num(m.amount);
          if (m.status === 'collected') {
            bCollected += amt;
          }
        });
      }
      totalCollected += bCollected;
      totalPending += Math.max(0, bTotal - bCollected);
    });

    // Update Stats Elements
    Utils.setText('ledgerStatTotalBilled', Utils.currency(totalBilled));
    Utils.setText('ledgerStatTotalCollected', Utils.currency(totalCollected));
    Utils.setText('ledgerStatPending', Utils.currency(totalPending));
    Utils.setText('ledgerStatBillCount', totalCount);

    // Render Bills Cards Container
    const container = document.getElementById('ledgerBillsList');
    if (!container) return;

    if (cycleBills.length === 0) {
      container.innerHTML = `
        <div class="ledger-empty-card">
          <div class="ledger-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h3 class="ledger-empty-title">No bills this cycle</h3>
          <p class="ledger-empty-sub">Add the first shared bill for ${this.formatCycle(this.currentCycle)}.</p>
          <button class="btn btn-primary ledger-empty-btn" onclick="Messliner.ledger.showAddBillModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Bill</span>
          </button>
        </div>
      `;
      return;
    }

    // Sort bills by creation date (newest first)
    cycleBills.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const allUsers = Messliner.users.users || {};

    container.innerHTML = cycleBills.map(bill => {
      const members = bill.members || {};
      const memberList = Object.entries(members);
      const totalMemberCount = memberList.length;
      const paidMemberCount = memberList.filter(([_, m]) => m.status === 'collected').length;
      const percent = totalMemberCount > 0 ? Math.round((paidMemberCount / totalMemberCount) * 100) : 0;
      const isAllPaid = totalMemberCount > 0 && paidMemberCount === totalMemberCount;

      // Icon lookup
      const preset = this.presets.find(p => p.name.toLowerCase() === (bill.category || bill.title || '').toLowerCase());
      const iconSvg = preset ? preset.icon : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

      // Per member estimate text
      const sampleAmt = totalMemberCount > 0 ? memberList[0][1].amount : (bill.totalAmount || 0);
      let perMemberText = '';
      if (totalMemberCount === 1) {
        perMemberText = 'Individual bill';
      } else if (bill.splitType === 'custom') {
        perMemberText = 'Custom split';
      } else {
        perMemberText = `${Utils.currency(sampleAmt)} per member`;
      }
      const billNo = bill.billNo || ('BILL-' + (bill.month ? bill.month.replace('-', '') : '2609') + '-' + bill.id.slice(-4).toUpperCase());

      // Member chips preview (clean, modern layout with expandable view for large counts)
      const MAX_PREVIEW_CHIPS = 6;
      const hasOverflow = memberList.length > MAX_PREVIEW_CHIPS;
      const extraCount = memberList.length - MAX_PREVIEW_CHIPS;

      const chipsHtml = memberList.map(([uId, m], idx) => {
        const user = allUsers[uId];
        const name = user?.name || 'Member';
        const isPaid = m.status === 'collected';
        const avatarBg = UsersModule._avatarColor(name);
        const isExtra = hasOverflow && idx >= MAX_PREVIEW_CHIPS;

        return `
          <div class="ledger-member-chip ${isPaid ? 'paid' : 'unpaid'} ${isExtra ? `ledger-chip-extra-${bill.id}` : ''}"
               style="${isExtra ? 'display:none;' : ''}"
               title="${name} — ${isPaid ? 'Paid ' + Utils.currency(m.amount) : 'Pending ' + Utils.currency(m.amount)}"
               onclick="Messliner.ledger.showBillDetails('${bill.id}')">
            <span class="ledger-chip-avatar">${Utils.initials(name)}</span>
            <span class="ledger-chip-name">${name.split(' ')[0]}</span>
            <span class="ledger-chip-badge ${isPaid ? 'paid' : ''}">${isPaid ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '৳' + m.amount}</span>
          </div>
        `;
      }).join('') + (hasOverflow ? `
        <button type="button" class="ledger-member-chip-more" id="ledger_more_chips_btn_${bill.id}"
                onclick="event.stopPropagation(); Messliner.ledger.toggleExpandChips('${bill.id}')">
          <span>+${extraCount} more</span>
        </button>
      ` : '');

      const memberFooterText = totalMemberCount === 1
        ? `Assigned to ${allUsers[memberList[0]?.[0]]?.name || '1 member'} (Individual)`
        : `Shared across ${totalMemberCount} members`;

      return `
        <div class="ledger-bill-card fade-up">
          <!-- Card Top Header -->
          <div class="ledger-card-header">
            <div class="ledger-card-header-left">
              <div class="ledger-card-icon-box">
                ${iconSvg}
              </div>
              <div class="ledger-card-title-group">
                <div class="ledger-card-title-row">
                  <h4 class="ledger-card-title">${bill.title}</h4>
                  <span class="ledger-bill-id-tag" title="Click to copy Bill ID" onclick="Messliner.ledger.copyBillId('${billNo}', event)">#${billNo}</span>
                </div>
                <div class="ledger-card-meta">
                  <span>Due ${bill.dueDate ? Utils.formatDate(bill.dueDate) : 'No date'}</span>
                  <span class="ledger-meta-dot">•</span>
                  <span class="ledger-meta-total">${Utils.currency(bill.totalAmount)} total</span>
                </div>
              </div>
            </div>
            <div class="ledger-card-header-right">
              <div class="ledger-card-amount-big">${Utils.currency(bill.totalAmount)}</div>
              <div class="ledger-card-amount-sub">${perMemberText}</div>
            </div>
          </div>

          <!-- Progress Section -->
          <div class="ledger-card-progress-section">
            <div class="ledger-progress-bar-header">
              <span class="ledger-progress-label">Collection progress</span>
              <span class="ledger-progress-status ${isAllPaid ? 'complete' : ''}">${paidMemberCount} of ${totalMemberCount} paid</span>
            </div>
            <div class="ledger-progress-bar-track">
              <div class="ledger-progress-bar-fill ${isAllPaid ? 'complete' : ''}" style="width: ${percent}%;"></div>
            </div>
          </div>

          <!-- Members Chips Row -->
          <div class="ledger-card-members-row">
            ${chipsHtml}
          </div>

          <!-- Card Footer Actions -->
          <div class="ledger-card-footer">
            <div class="ledger-card-footer-info">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>${memberFooterText}</span>
            </div>

            <div class="ledger-card-actions-group">
              <!-- Slip Preview / Download Button -->
              <button class="ledger-btn-icon" title="View & Download Bill Slip" onclick="Messliner.ledger.previewBillSlip('${bill.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </button>

              <!-- Edit Button -->
              <button class="ledger-btn-icon" title="Edit Bill" onclick="Messliner.ledger.showEditBillModal('${bill.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>

              <!-- Delete Button -->
              <button class="ledger-btn-icon danger" title="Delete Bill" onclick="Messliner.ledger.confirmDeleteBill('${bill.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>

              <!-- Collect Action Button -->
              <button class="btn ${isAllPaid ? 'btn-secondary' : 'btn-primary'} ledger-btn-collect"
                      onclick="Messliner.ledger.showBillDetails('${bill.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>${isAllPaid ? 'View Details' : 'Manage & Collect'}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Render Side Widgets & Top Banner
    this.renderPaymentMethodsBanner();
    this.renderPaymentRequestsWidget();
  },

  /**
   * Toggle expansion of extra member chips in bill card
   */
  toggleExpandChips(billId) {
    const extraChips = document.querySelectorAll(`.ledger-chip-extra-${billId}`);
    const moreBtn = document.getElementById(`ledger_more_chips_btn_${billId}`);
    if (!extraChips.length || !moreBtn) return;

    const isHidden = extraChips[0].style.display === 'none';
    extraChips.forEach(el => {
      el.style.display = isHidden ? 'inline-flex' : 'none';
    });

    const hiddenCount = extraChips.length;
    moreBtn.innerHTML = isHidden
      ? `<span>Show less</span> <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<span>+${hiddenCount} more</span>`;
  },

  /**
   * Helper to format payment method name cleanly
   */
  getMethodLabel(methodIdOrName) {
    if (!methodIdOrName) return 'CASH';
    const m = String(methodIdOrName).toLowerCase();
    if (m === 'cash') return 'CASH';
    if (m === 'bkash') return 'BKASH';
    if (m === 'nagad') return 'NAGAD';
    if (m === 'rocket') return 'ROCKET';
    if (m === 'upay') return 'UPAY';

    // Look up in configured paymentMethods
    const methods = this.paymentMethods?.methods || this.paymentMethods || {};
    if (methods[methodIdOrName]) {
      const obj = methods[methodIdOrName];
      return (obj.name || obj.platform || 'DIGITAL').toUpperCase();
    }
    const found = Object.values(methods).find(x => x && (x.id === methodIdOrName || x.platform === methodIdOrName));
    if (found) {
      return (found.name || found.platform || 'DIGITAL').toUpperCase();
    }
    if (m.startsWith('method_')) {
      return 'DIGITAL';
    }
    return String(methodIdOrName).toUpperCase();
  },

  /**
   * Render Payment Requests Widget (Expanded Right column)
   * Separated into 2 distinct sections: Bill Complete Requests & Deposit Requests (Single-line Compact Cards)
   */
  renderPaymentRequestsWidget() {
    const container = document.getElementById('ledgerWidgetPaymentRequestsList');
    if (!container) return;

    const allRequests = Object.entries(this.paymentRequests || {})
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const billRequests = allRequests.filter(r => r.type === 'bill_payment');
    const depositRequests = allRequests.filter(r => r.type !== 'bill_payment');

    const pendingBillRequests = billRequests.filter(r => r.status === 'pending');
    const pendingDepositRequests = depositRequests.filter(r => r.status === 'pending');

    // Pagination calculation for Previous Activity (6 items per page)
    const allProcessed = allRequests.filter(r => r.status !== 'pending');
    const pageSize = 6;
    const totalPages = Math.ceil(allProcessed.length / pageSize) || 1;
    this.previousActivityPage = Math.min(Math.max(1, this.previousActivityPage || 1), totalPages);
    const startIndex = (this.previousActivityPage - 1) * pageSize;
    const recentProcessed = allProcessed.slice(startIndex, startIndex + pageSize);

    // Helper to render a single compact 1-line card
    const renderCompactCard = (req) => {
      const isBill = req.type === 'bill_payment';
      const user = Messliner.users?.users?.[req.userId];
      const name = req.userName || user?.name || 'Member';

      return `
        <div class="ledger-widget-req-compact-row ${isBill ? 'bill' : 'deposit'} fade-up" onclick="Messliner.ledger.openReviewModal('${req.id}')">
          <div class="flex items-center min-w-0" style="gap: 10px;">
            <div class="member-tia-avatar shrink-0" style="width:32px !important; height:32px !important; font-size:0.8rem !important; flex-shrink:0;">${Utils.initials(name)}</div>
            <div class="ledger-widget-req-compact-name truncate">${name}</div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="ledger-widget-req-compact-amt ${isBill ? 'bill' : 'deposit'}">
              ${isBill ? '' : '+'}${Utils.currency(req.amount)}
            </span>
            <button type="button" class="btn btn-secondary btn-xs ledger-btn-review"
                    onclick="event.stopPropagation(); Messliner.ledger.openReviewModal('${req.id}')">
              Review
            </button>
          </div>
        </div>
      `;
    };

    let html = `
      <div class="ledger-pv-container">
        <!-- SECTION 1: BILL CLEAR REQUESTS -->
        <div class="ledger-pv-section">
          <div class="ledger-pv-sec-header">
            <div class="ledger-pv-sec-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>Bill Complete Requests</span>
            </div>
            <span class="ledger-pv-badge bill">${pendingBillRequests.length} Pending</span>
          </div>
          <div class="ledger-pv-sec-body">
            ${pendingBillRequests.length > 0
        ? pendingBillRequests.map(req => renderCompactCard(req)).join('')
        : `<div class="ledger-pv-sec-empty"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> No pending bill complete requests</div>`
      }
          </div>
        </div>

        <!-- SECTION 2: DEPOSIT REQUESTS -->
        <div class="ledger-pv-section">
          <div class="ledger-pv-sec-header">
            <div class="ledger-pv-sec-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span>Deposit Requests</span>
            </div>
            <span class="ledger-pv-badge deposit">${pendingDepositRequests.length} Pending</span>
          </div>
          <div class="ledger-pv-sec-body">
            ${pendingDepositRequests.length > 0
        ? pendingDepositRequests.map(req => renderCompactCard(req)).join('')
        : `<div class="ledger-pv-sec-empty"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> No pending deposit requests</div>`
      }
          </div>
        </div>

        <!-- SECTION 3: RECENT ACTIVITY / PREVIOUS REQUESTS -->
        ${allProcessed.length > 0 ? `
          <div class="ledger-widget-recent-section fade-up" style="margin-top: 4px;">
            <div class="ledger-widget-recent-header flex items-center justify-between">
              <span>Previous Activity (${allProcessed.length})</span>
              <span class="text-2xs text-slate-400 font-semibold">Reviewed</span>
            </div>
            <div class="flex flex-col gap-1.5">
              ${recentProcessed.map(req => {
        const isBill = req.type === 'bill_payment';
        const user = Messliner.users?.users?.[req.userId];
        const name = req.userName || user?.name || 'Member';
        const isApproved = req.status === 'approved';

        return `
                  <div class="ledger-widget-req-compact-row processed fade-up" onclick="Messliner.ledger.openReviewModal('${req.id}')">
                    <div class="flex items-center min-w-0" style="gap: 10px;">
                      <div class="member-tia-avatar shrink-0" style="width:28px !important; height:28px !important; font-size:0.75rem !important; flex-shrink:0;">${Utils.initials(name)}</div>
                      <div class="ledger-widget-req-compact-name truncate text-xs">${name}</div>
                    </div>
                    <div class="flex items-center shrink-0" style="gap: 10px;">
                      <span class="font-extrabold text-xs ${isApproved ? 'text-emerald-700' : 'text-slate-400 line-through'}">
                        ${isBill ? '' : '+'}${Utils.currency(req.amount)}
                      </span>
                      ${isApproved ? `
                        <div class="ledger-activity-circle-badge approved" title="${isBill ? 'Bill Paid' : 'Approved'}" aria-label="Approved">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      ` : `
                        <div class="ledger-activity-circle-badge rejected" title="Rejected" aria-label="Rejected">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </div>
                      `}
                    </div>
                  </div>
                `;
      }).join('')}
            </div>

            <!-- Circular Arrow Pagination Controls (6 items per page) -->
            ${totalPages > 1 ? `
              <div class="ledger-activity-pagination">
                <button type="button" class="ledger-page-circle-btn prev"
                        onclick="event.stopPropagation(); Messliner.ledger.setPrevActivityPage(${this.previousActivityPage - 1})"
                        ${this.previousActivityPage <= 1 ? 'disabled' : ''}
                        title="Previous 6 items" aria-label="Previous Page">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <span class="ledger-page-counter-text">
                  Page ${this.previousActivityPage} of ${totalPages}
                </span>
                <button type="button" class="ledger-page-circle-btn next"
                        onclick="event.stopPropagation(); Messliner.ledger.setPrevActivityPage(${this.previousActivityPage + 1})"
                        ${this.previousActivityPage >= totalPages ? 'disabled' : ''}
                        title="Next 6 items" aria-label="Next Page">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Set Previous Activity current pagination page
   */
  previousActivityPage: 1,

  setPrevActivityPage(page) {
    this.previousActivityPage = Math.max(1, page);
    this.renderPaymentRequestsWidget();
  },

  /**
   * Open single request review popup modal
   */
  openReviewModal(reqId) {
    const req = this.paymentRequests?.[reqId];
    if (!req) return;

    const modalTitleEl = document.getElementById('ledgerReviewModalTitle');
    const modalSubEl = document.getElementById('ledgerReviewModalSub');
    const bodyEl = document.getElementById('ledgerReviewSingleModalBody');
    if (!bodyEl) return;

    const isBill = req.type === 'bill_payment';
    const user = Messliner.users?.users?.[req.userId];
    const name = req.userName || user?.name || 'Member';
    const methodLabel = this.getMethodLabel(req.method);
    const methodClass = (req.method || 'cash').toLowerCase();
    const isCash = methodClass === 'cash';
    const fullDateStr = req.createdAt ? new Date(req.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently';

    const bill = isBill ? this.bills?.[req.billId] : null;
    const billTitle = req.billTitle || bill?.title || 'Shared Bill';
    const billNo = bill?.billNo || (req.billId ? ('BILL-' + (bill?.month ? bill.month.replace('-', '') : '2609') + '-' + req.billId.slice(-4).toUpperCase()) : 'BILL-REF');
    const memberCount = bill?.members ? Object.keys(bill.members).length : 1;
    const billType = memberCount > 1 ? 'Shared Bill' : 'Individual Bill';

    if (modalTitleEl) {
      modalTitleEl.textContent = isBill ? 'Verify Bill Payment' : 'Verify Deposit Request';
    }
    if (modalSubEl) {
      modalSubEl.textContent = isBill ? 'Check bill & transaction details to verify clearance' : 'Verify transaction ID and credit member balance';
    }

    if (isBill) {
      // ════════════════════════════════════════════════════════════
      // 📄 BILL COMPLETE REQUEST VIEW (Ultra Minimal Grid UI)
      // ════════════════════════════════════════════════════════════
      bodyEl.innerHTML = `
        <div class="bill-review-modal-box fade-up">
          <!-- Top Row: Member Profile + Amount -->
          <div class="bill-review-header-row">
            <div class="flex items-center gap-3 min-w-0">
              <div class="member-tia-avatar" style="width:40px !important; height:40px !important; font-size:0.95rem !important;">${Utils.initials(name)}</div>
              <div class="bill-review-member-name truncate">${name}</div>
            </div>
            <div class="bill-review-amount-text">
              ${Utils.currency(req.amount)}
            </div>
          </div>

          <!-- Minimal Grid Box (Top 3 columns, Bottom 2 columns) -->
          <div class="bill-review-details-grid-box">
            <!-- Top Row: Bill Name, Bill Type, Payment Method -->
            <div class="bill-review-grid-row top-row">
              <div class="bill-review-grid-col">
                <span class="lrb-label">BILL NAME</span>
                <span class="lrb-val" title="${billTitle}">${billTitle}</span>
              </div>
              <div class="bill-review-grid-col">
                <span class="lrb-label">BILL TYPE</span>
                <span class="lrb-val">${billType}</span>
              </div>
              <div class="bill-review-grid-col">
                <span class="lrb-label">PAYMENT METHOD</span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="ledger-req-method-badge ${methodClass}">${methodLabel}</span>
                  ${!isCash && req.trxId ? `<code class="bill-trx-sub font-mono text-2xs" title="Click to copy TrxID" onclick="Messliner.ledger.copyBillId('${req.trxId}', event)">(${req.trxId})</code>` : ''}
                </div>
              </div>
            </div>

            <div class="bill-review-grid-divider"></div>

            <!-- Bottom Row: Bill ID, Time -->
            <div class="bill-review-grid-row bottom-row">
              <div class="bill-review-grid-col">
                <span class="lrb-label">BILL ID</span>
                <div class="lrb-val lrb-id-clean font-mono" title="Click to copy" onclick="Messliner.ledger.copyBillId('${billNo}', event)">
                  <span>#${billNo}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="inline-copy-svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </div>
              </div>
              <div class="bill-review-grid-col">
                <span class="lrb-label">TIME</span>
                <span class="lrb-val text-slate-700 font-medium">${fullDateStr}</span>
              </div>
            </div>
          </div>

          <!-- Payment Status (Clean text without background) -->
          <div class="bill-review-payment-status-row">
            <span class="status-label">Payment Status:</span>
            <span class="status-val-clean ${req.status}">
              ${req.status === 'pending' ? `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#D97706;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span style="color:#D97706; font-weight:700;">Pending Approval</span>
              ` : (req.status === 'approved' ? `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#059669;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span style="color:#059669; font-weight:700;">Paid / Collected</span>
              ` : `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#DC2626;">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span style="color:#DC2626; font-weight:700;">Rejected</span>
              `)}
            </span>
          </div>

          <!-- Action Buttons -->
          <div class="ledger-req-actions" style="margin-top:14px;">
            ${req.status === 'pending' ? `
              <button type="button" class="btn btn-secondary ledger-btn-reject-modal" onclick="Messliner.ledger.rejectPaymentRequest('${reqId}')">
                Reject
              </button>
              <button type="button" class="btn btn-primary ledger-btn-approve-modal bill" style="background:#4F46E5 !important; border-color:#4F46E5 !important;" onclick="Messliner.ledger.approvePaymentRequest('${reqId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Approve & Mark Paid</span>
              </button>
            ` : `
              <div class="ledger-review-status-pill-full ${req.status}">
                ${req.status === 'approved' ? '✓ Bill Paid' : '✕ Rejected Request'}
              </div>
            `}
          </div>
        </div>
      `;
    } else {
      // ════════════════════════════════════════════════════════════
      // 💳 VERIFY DEPOSIT REQUEST (Ultra Minimal & Custom Icons)
      // ════════════════════════════════════════════════════════════
      bodyEl.innerHTML = `
        <div class="deposit-review-wrapper">
          <!-- Hero Banner -->
          <div class="deposit-review-hero">
            <div class="flex items-center gap-3 min-w-0">
              <div class="member-tia-avatar" style="width:42px !important; height:42px !important; font-size:0.95rem !important;">
                ${Utils.initials(name)}
              </div>
              <div class="min-w-0">
                <h4 class="deposit-hero-name truncate">${name}</h4>
                <div class="deposit-hero-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                    <path d="M18 12a2 2 0 0 0 0 4h4v-4z"></path>
                  </svg>
                  <span>Account Deposit</span>
                </div>
              </div>
            </div>
            <div class="deposit-hero-amount-box shrink-0">
              <span class="deposit-hero-amount-label">Deposit Amount</span>
              <span class="deposit-hero-amount-val">+${Utils.currency(req.amount)}</span>
            </div>
          </div>

          <!-- Minimal Information List with Custom Icons -->
          <div class="deposit-info-card">
            <!-- Row 1: Payment Channel -->
            <div class="deposit-info-row">
              <div class="deposit-info-left">
                <div class="deposit-custom-icon channel">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                  </svg>
                </div>
                <span class="deposit-info-label">Payment Channel</span>
              </div>
              <div class="deposit-info-val">
                <span class="ledger-req-method-badge ${methodClass}">${methodLabel}</span>
              </div>
            </div>

            <!-- Row 2: Transaction ID (Digital Payments Only) -->
            ${!isCash && req.trxId ? `
              <div class="deposit-info-row">
                <div class="deposit-info-left">
                  <div class="deposit-custom-icon trx">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
                    </svg>
                  </div>
                  <span class="deposit-info-label">Transaction ID</span>
                </div>
                <div class="deposit-info-val">
                  <div class="deposit-trx-badge" onclick="Messliner.ledger.copyBillId('${req.trxId}', event)" title="Click to copy TrxID">
                    <span class="font-mono font-bold">${req.trxId}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- Row 3: Submitted Time -->
            <div class="deposit-info-row">
              <div class="deposit-info-left">
                <div class="deposit-custom-icon time">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <span class="deposit-info-label">Submitted Time</span>
              </div>
              <div class="deposit-info-val text-xs text-slate-700 font-semibold">
                ${fullDateStr}
              </div>
            </div>

            <!-- Row 4: Note (Clean horizontal row if exists) -->
            ${req.note ? `
              <div class="deposit-info-row">
                <div class="deposit-info-left">
                  <div class="deposit-custom-icon note">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                  </div>
                  <span class="deposit-info-label">Note</span>
                </div>
                <div class="deposit-info-val text-xs text-slate-700 font-semibold truncate max-w-[200px]" title="${req.note}">
                  ${req.note}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Actions Footer -->
          <div class="deposit-review-actions">
            ${req.status === 'pending' ? `
              <button type="button" class="btn btn-secondary deposit-btn-reject" onclick="Messliner.ledger.rejectPaymentRequest('${reqId}')">
                Reject
              </button>
              <button type="button" class="btn btn-primary deposit-btn-approve" onclick="Messliner.ledger.approvePaymentRequest('${reqId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Approve & Credit Balance</span>
              </button>
            ` : `
              <div class="deposit-status-pill ${req.status}">
                ${req.status === 'approved' ? '✓ Approved & Credited to Balance' : '✕ Request Rejected'}
              </div>
            `}
          </div>
        </div>
      `;
    }

    openModal('ledgerReviewSingleModal');
  },

  /**
   * Open Add Bill Modal
   */
  async showAddBillModal() {
    this.editingBillId = null;
    this.splitType = 'equal';
    document.getElementById('ledgerBillModalTitle').textContent = 'Add New Bill';
    document.getElementById('ledgerBillSubmitBtnText').textContent = 'Create Bill';
    document.getElementById('ledgerBillForm').reset();
    this.setDueDate(Utils.today());
    this.closeDueDateCalendar();

    this.selectedSplitMonth = 'all';

    const diningId = this.getDiningId();
    if (diningId) {
      if (!this.mealsData) {
        try {
          const snap = await db.ref(`dinings/${diningId}/meals`).once('value');
          this.mealsData = snap.val() || {};
        } catch (err) {
          console.warn('Could not load meals data:', err);
        }
      }
      if (!this.createdAt) {
        try {
          const infoSnap = await db.ref(`dinings/${diningId}/info/createdAt`).once('value');
          if (infoSnap.exists()) {
            this.createdAt = infoSnap.val();
          }
        } catch (err) {
          console.warn('Could not load createdAt:', err);
        }
      }
    }

    this.renderPresetsUI();
    this.renderSplitTypeTabs();
    this.populateSplitMonthFilter(this.selectedSplitMonth);
    this.renderMembersChecklist();
    this.updateSplitCalculation();
    openModal('ledgerBillModal');
  },

  /**
   * Open Edit Bill Modal
   */
  async showEditBillModal(billId) {
    const bill = this.bills[billId];
    if (!bill) return;

    this.editingBillId = billId;
    this.splitType = bill.splitType || 'equal';

    const memberCount = Object.keys(bill.members || {}).length;
    document.getElementById('ledgerBillModalTitle').textContent = memberCount === 1 ? 'Edit Bill' : 'Edit Shared Bill';
    document.getElementById('ledgerBillSubmitBtnText').textContent = 'Save Changes';

    document.getElementById('ledgerBillName').value = bill.title || '';
    document.getElementById('ledgerBillAmount').value = bill.totalAmount || '';
    this.setDueDate(bill.dueDate || Utils.today());
    this.closeDueDateCalendar();

    this.selectedSplitMonth = 'all';

    const diningId = this.getDiningId();
    if (diningId) {
      if (!this.mealsData) {
        try {
          const snap = await db.ref(`dinings/${diningId}/meals`).once('value');
          this.mealsData = snap.val() || {};
        } catch (err) {
          console.warn('Could not load meals data:', err);
        }
      }
      if (!this.createdAt) {
        try {
          const infoSnap = await db.ref(`dinings/${diningId}/info/createdAt`).once('value');
          if (infoSnap.exists()) {
            this.createdAt = infoSnap.val();
          }
        } catch (err) {
          console.warn('Could not load createdAt:', err);
        }
      }
    }

    this.renderPresetsUI(bill.category || bill.title);
    this.renderSplitTypeTabs();
    this.populateSplitMonthFilter(this.selectedSplitMonth);
    this.renderMembersChecklist(bill.members);
    this.updateSplitCalculation();
    openModal('ledgerBillModal');
  },

  /**
   * Custom Due Date Calendar Management
   */
  setDueDate(dateStr) {
    if (!dateStr) dateStr = Utils.today();
    this.selectedDueDate = dateStr;
    const hiddenInput = document.getElementById('ledgerBillDueDate');
    if (hiddenInput) hiddenInput.value = dateStr;

    const textEl = document.getElementById('ledgerDueDateDisplayText');
    if (textEl) {
      try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        textEl.textContent = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (err) {
        textEl.textContent = Utils.formatDate(dateStr);
      }
    }
  },

  toggleDueDateCalendar(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('ledgerDueDateCalendarPopup');
    if (!popup) return;
    if (popup.style.display !== 'none') {
      this.closeDueDateCalendar();
    } else {
      this.openDueDateCalendar();
    }
  },

  openDueDateCalendar() {
    const popup = document.getElementById('ledgerDueDateCalendarPopup');
    if (!popup) return;
    const curDate = this.selectedDueDate || Utils.today();
    const [y, m] = curDate.split('-').map(Number);
    this.dueCalViewYear = y;
    this.dueCalViewMonth = m - 1;
    this.renderDueCalendarPopup();
    popup.style.display = 'block';
  },

  closeDueDateCalendar() {
    const popup = document.getElementById('ledgerDueDateCalendarPopup');
    if (popup) popup.style.display = 'none';
  },

  navDueCalendarMonth(dir, e) {
    if (e) e.stopPropagation();
    if (this.dueCalViewMonth === undefined) this.dueCalViewMonth = new Date().getMonth();
    if (this.dueCalViewYear === undefined) this.dueCalViewYear = new Date().getFullYear();

    this.dueCalViewMonth += dir;
    if (this.dueCalViewMonth < 0) {
      this.dueCalViewMonth = 11;
      this.dueCalViewYear--;
    } else if (this.dueCalViewMonth > 11) {
      this.dueCalViewMonth = 0;
      this.dueCalViewYear++;
    }
    this.renderDueCalendarPopup();
  },

  renderDueCalendarPopup() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const titleEl = document.getElementById('ledgerDueCalMonthYearTitle');
    if (titleEl) {
      titleEl.textContent = `${monthNames[this.dueCalViewMonth]} ${this.dueCalViewYear}`;
    }

    const gridEl = document.getElementById('ledgerDueCalDaysGrid');
    if (!gridEl) return;

    const selectedDate = this.selectedDueDate || Utils.today();
    const todayDate = Utils.today();

    const year = this.dueCalViewYear;
    const month = this.dueCalViewMonth;

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
      html += `<div class="cal-day-cell muted" onclick="Messliner.ledger.selectDueCalendarDate('${dateStr}', event)">${dNum}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayDate;

      let cls = 'cal-day-cell';
      if (isSelected) cls += ' selected';
      if (isToday) cls += ' today';

      html += `<div class="${cls}" onclick="Messliner.ledger.selectDueCalendarDate('${dateStr}', event)">${d}</div>`;
    }

    // Next month leading days
    const totalCells = firstDayIndex + daysInMonth;
    const nextDays = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let j = 1; j <= nextDays; j++) {
      let nextM = month + 1;
      let nextY = year;
      if (nextM > 11) { nextM = 0; nextY++; }
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      html += `<div class="cal-day-cell muted" onclick="Messliner.ledger.selectDueCalendarDate('${dateStr}', event)">${j}</div>`;
    }

    gridEl.innerHTML = html;
  },

  selectDueCalendarDate(dateStr, e) {
    if (e) e.stopPropagation();
    this.setDueDate(dateStr);
    this.closeDueDateCalendar();
  },

  setDueTodayDate(e) {
    if (e) e.stopPropagation();
    this.selectDueCalendarDate(Utils.today(), e);
  },

  /**
   * Render Category Quick Presets
   */
  renderPresetsUI(selectedName = '') {
    const container = document.getElementById('ledgerPresetsList');
    if (!container) return;

    const sLow = (selectedName || '').toLowerCase().trim();
    container.innerHTML = this.presets.map(p => {
      const isActive = sLow && sLow === p.name.toLowerCase();
      return `
        <button type="button" class="ledger-preset-btn ${isActive ? 'active' : ''}"
                onclick="Messliner.ledger.applyPreset('${p.name}')">
          <span class="ledger-preset-icon">${p.icon}</span>
          <span>${p.name}</span>
        </button>
      `;
    }).join('');
  },

  /**
   * Apply or toggle category preset to bill name input
   */
  applyPreset(name) {
    const input = document.getElementById('ledgerBillName');
    if (!input) return;

    if (input.value.trim().toLowerCase() === name.toLowerCase()) {
      // Toggle off if already selected
      input.value = '';
      this.renderPresetsUI('');
    } else {
      input.value = name;
      this.renderPresetsUI(name);
    }
  },

  /**
   * Called when user types or clears the bill name input
   */
  onBillNameInput(val) {
    this.renderPresetsUI(val.trim());
  },

  /**
   * Render Equal vs Custom tab switcher
   */
  renderSplitTypeTabs() {
    const equalBtn = document.getElementById('ledgerSplitEqualBtn');
    const customBtn = document.getElementById('ledgerSplitCustomBtn');
    const customToolbar = document.getElementById('ledgerCustomSplitToolbar');

    if (equalBtn) equalBtn.classList.toggle('active', this.splitType === 'equal');
    if (customBtn) customBtn.classList.toggle('active', this.splitType === 'custom');
    if (customToolbar) customToolbar.style.display = this.splitType === 'custom' ? 'flex' : 'none';

    // Show/hide custom input fields on members checklist
    document.querySelectorAll('.ledger-member-custom-input-wrap').forEach(wrap => {
      wrap.style.display = this.splitType === 'custom' ? 'block' : 'none';
    });

    const equalPayBox = document.getElementById('ledgerEqualPayBox');
    if (equalPayBox) equalPayBox.style.display = this.splitType === 'equal' ? 'flex' : 'none';

    const customPayBox = document.getElementById('ledgerCustomPayBox');
    if (customPayBox) customPayBox.style.display = this.splitType === 'custom' ? 'flex' : 'none';
  },

  /**
   * Switch split mode
   */
  setSplitType(type) {
    this.splitType = type;
    this.renderSplitTypeTabs();
    this.updateSplitCalculation();
  },

  /**
   * Helper: Calculate total meals per user for a given month
   */
  getUserMealCountsForMonth(monthKey) {
    if (!monthKey || !this.mealsData) return {};
    const monthData = this.mealsData[monthKey] || {};
    const counts = {};

    Object.values(monthData).forEach(dayData => {
      if (!dayData || typeof dayData !== 'object') return;
      ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
        const typeData = dayData[mealType];
        if (typeData && typeof typeData === 'object') {
          Object.entries(typeData).forEach(([uId, c]) => {
            const count = parseFloat(c) || 0;
            if (count > 0) {
              counts[uId] = (counts[uId] || 0) + count;
            }
          });
        }
      });
    });

    return counts;
  },

  /**
   * Populate custom month filter dropdown in Add/Edit Bill Modal
   */
  populateSplitMonthFilter(selectedMonth = 'all') {
    const valueEl = document.getElementById('ledgerSplitMonthValue');
    const menuEl = document.getElementById('ledgerSplitMonthMenu');
    if (!menuEl) return;

    const selMonth = (selectedMonth && selectedMonth !== '') ? selectedMonth : 'all';

    // Determine Mess Creation Month (YYYY-MM)
    let creationMonth = null;
    const rawCreatedAt = this.createdAt || Messliner.state?.diningInfo?.createdAt || (typeof App !== 'undefined' ? App.state?.diningInfo?.createdAt : null);
    if (rawCreatedAt) {
      const dt = new Date(rawCreatedAt);
      if (!isNaN(dt.getTime())) {
        creationMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      }
    } else if (Messliner.overview?.createdDate) {
      const dt = Messliner.overview.createdDate;
      creationMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    }

    const monthsSet = new Set();
    const baseMonth = this.currentCycle || Utils.currentMonth();
    const [currY, currM] = baseMonth.split('-').map(Number);

    // Current month + previous 4 months max (maximum 5 months total)
    for (let i = 0; i <= 4; i++) {
      let m = currM - i;
      let y = currY;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const mStr = `${y}-${String(m).padStart(2, '0')}`;
      // Do not include months before the mess was created
      if (creationMonth && mStr < creationMonth) {
        continue;
      }
      monthsSet.add(mStr);
    }

    // If editing a bill with an existing valid splitMonth, ensure it can be displayed
    if (selectedMonth && selectedMonth !== 'all' && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      if (!creationMonth || selectedMonth >= creationMonth) {
        monthsSet.add(selectedMonth);
      }
    }

    const sortedMonths = Array.from(monthsSet).sort().reverse();

    let displayLabel = 'All Registered Members';
    let html = `
      <div class="custom-dropdown-item ${selMonth === 'all' ? 'selected' : ''}" data-value="all"
           onclick="Messliner.ledger.selectSplitMonth('all')">
        <span>All Registered Members</span>
        ${selMonth === 'all' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
    `;

    sortedMonths.forEach(mKey => {
      const isSelected = (mKey === selMonth);
      const cycleLabel = this.formatCycle(mKey);
      const isCurrent = mKey === (this.currentCycle || Utils.currentMonth());
      const labelText = `${cycleLabel}${isCurrent ? ' (Active)' : ''}`;
      if (isSelected) {
        displayLabel = labelText;
      }
      html += `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}" data-value="${mKey}"
             onclick="Messliner.ledger.selectSplitMonth('${mKey}')">
          <span>${labelText}</span>
          ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
      `;
    });

    menuEl.innerHTML = html;
    if (valueEl) {
      valueEl.textContent = displayLabel;
    }
  },

  /**
   * Selection handler when clicking an option in the custom dropdown
   */
  selectSplitMonth(monthVal) {
    this.selectedSplitMonth = monthVal;
    const dropdown = document.getElementById('ledgerSplitMonthDropdown');
    if (dropdown) dropdown.classList.remove('active');

    this.populateSplitMonthFilter(monthVal);
    this.renderMembersChecklist();
    this.updateSplitCalculation();
  },

  /**
   * Change handler for month filter in Add/Edit Bill Modal
   */
  onSplitMonthFilterChange(monthVal) {
    this.selectSplitMonth(monthVal);
  },

  /**
   * Render member checklist in Add/Edit modal
   */
  renderMembersChecklist(existingMembers = null) {
    const container = document.getElementById('ledgerMembersChecklist');
    if (!container) return;

    const allUsers = Messliner.users.users || {};
    const settings = UsersModule.settings || {};
    const isManagerMealEnabled = !!settings.managerMealEnabled;

    let memberEntries = Object.entries(allUsers).filter(([_, u]) => u.role !== 'admin' || isManagerMealEnabled);

    const filterMonth = this.selectedSplitMonth || this.currentCycle || Utils.currentMonth();
    let userMealCounts = {};
    if (filterMonth && filterMonth !== 'all') {
      userMealCounts = this.getUserMealCountsForMonth(filterMonth);
      memberEntries = memberEntries.filter(([uId]) => {
        const count = userMealCounts[uId] || 0;
        return count > 0;
      });
    }

    if (memberEntries.length === 0) {
      const monthLabel = filterMonth === 'all' ? 'mess' : this.formatCycle(filterMonth);
      container.innerHTML = `
        <div style="padding:18px 12px; text-align:center; color:#64748B; font-size:0.84rem;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" style="margin: 0 auto 6px auto; display:block;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          No members with active meals found in <strong>${monthLabel}</strong>.
        </div>
      `;
      this.updateSplitCalculation();
      return;
    }

    container.innerHTML = memberEntries.map(([uId, u]) => {
      const isChecked = existingMembers ? !!existingMembers[uId] : true;
      const customVal = existingMembers && existingMembers[uId] ? existingMembers[uId].amount : 0;
      const initials = Utils.initials(u.name || 'Member');
      const mealCount = userMealCounts[uId];
      const mealBadgeHtml = (filterMonth !== 'all' && mealCount !== undefined)
        ? `<span class="ledger-member-meal-badge">${mealCount} ${mealCount === 1 ? 'meal' : 'meals'}</span>`
        : '';

      return `
        <div class="ledger-checklist-item ${isChecked ? '' : 'deselected'}" id="ledger_member_row_${uId}">
          <label class="ledger-checklist-label" for="ledger_cb_${uId}">
            <div class="ledger-custom-checkbox-wrap">
              <input type="checkbox" id="ledger_cb_${uId}" value="${uId}" class="ledger-member-cb"
                     ${isChecked ? 'checked' : ''} onchange="Messliner.ledger.updateSplitCalculation()">
              <span class="ledger-custom-checkbox-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
            </div>
            <div class="member-tia-avatar">${initials}</div>
            <div class="ledger-checklist-info">
              <span class="ledger-checklist-name">${u.name}</span>
              ${mealBadgeHtml}
            </div>
          </label>
          <div class="ledger-member-custom-input-wrap" style="display:${this.splitType === 'custom' ? 'block' : 'none'};">
            <div class="ledger-custom-input-group">
              <span class="ledger-currency-symbol">৳</span>
              <input type="number" min="0" step="any" id="ledger_custom_amt_${uId}"
                     class="ledger-custom-amt-input" value="${customVal}" placeholder="0"
                     onwheel="this.blur(); event.preventDefault();"
                     oninput="Messliner.ledger.updateSplitCalculation()">
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Update Select All checkbox
    const selectAllCb = document.getElementById('ledgerSelectAllMembers');
    if (selectAllCb) {
      const totalCbs = document.querySelectorAll('.ledger-member-cb').length;
      const checkedCbs = document.querySelectorAll('.ledger-member-cb:checked').length;
      selectAllCb.checked = checkedCbs === totalCbs && totalCbs > 0;
    }
  },

  /**
   * Select / Deselect all members
   */
  toggleSelectAllMembers(source) {
    document.querySelectorAll('.ledger-member-cb').forEach(cb => {
      cb.checked = source.checked;
    });
    this.updateSplitCalculation();
  },

  /**
   * Helper: Equalize selected members for custom split
   */
  equalizeSelectedCustom() {
    const total = parseFloat(document.getElementById('ledgerBillAmount').value) || 0;
    const checkedCbs = document.querySelectorAll('.ledger-member-cb:checked');
    if (checkedCbs.length === 0 || total <= 0) return;

    const perPerson = Math.round((total / checkedCbs.length) * 100) / 100;
    checkedCbs.forEach(cb => {
      const input = document.getElementById(`ledger_custom_amt_${cb.value}`);
      if (input) input.value = perPerson;
    });
    this.updateSplitCalculation();
  },

  /**
   * Helper: Fill remaining balance into the last selected member
   */
  fillRemainingCustom() {
    const total = parseFloat(document.getElementById('ledgerBillAmount').value) || 0;
    const checkedCbs = Array.from(document.querySelectorAll('.ledger-member-cb:checked'));
    if (checkedCbs.length === 0 || total <= 0) return;

    let assigned = 0;
    for (let i = 0; i < checkedCbs.length - 1; i++) {
      const input = document.getElementById(`ledger_custom_amt_${checkedCbs[i].value}`);
      assigned += parseFloat(input?.value) || 0;
    }
    const lastCb = checkedCbs[checkedCbs.length - 1];
    const lastInput = document.getElementById(`ledger_custom_amt_${lastCb.value}`);
    if (lastInput) {
      lastInput.value = Math.max(0, Math.round((total - assigned) * 100) / 100);
    }
    this.updateSplitCalculation();
  },

  /**
   * Update calculation displays live
   */
  updateSplitCalculation() {
    const totalAmount = parseFloat(document.getElementById('ledgerBillAmount').value) || 0;
    const checkedCbs = document.querySelectorAll('.ledger-member-cb:checked');
    const count = checkedCbs.length;

    // Update equal text
    const equalCountEl = document.getElementById('ledgerEqualCountText');
    const equalAmtEl = document.getElementById('ledgerEqualMemberAmt');
    if (equalCountEl) equalCountEl.textContent = `Equal (${count})`;
    if (equalAmtEl) {
      const perMember = count > 0 && totalAmount > 0 ? (totalAmount / count) : 0;
      equalAmtEl.textContent = Utils.currency(perMember);
    }

    // Update custom text
    let customAssigned = 0;
    checkedCbs.forEach(cb => {
      const input = document.getElementById(`ledger_custom_amt_${cb.value}`);
      customAssigned += parseFloat(input?.value) || 0;
    });

    const customAssignedEl = document.getElementById('ledgerCustomAssignedAmt');
    const customTotalEl = document.getElementById('ledgerCustomTotalAmt');
    const customWarnEl = document.getElementById('ledgerCustomMismatchWarn');

    if (customAssignedEl) customAssignedEl.textContent = Utils.currency(customAssigned);
    if (customTotalEl) customTotalEl.textContent = Utils.currency(totalAmount);

    if (customWarnEl) {
      if (this.splitType === 'custom' && totalAmount > 0) {
        const diff = Math.abs(customAssigned - totalAmount);
        if (diff > 0.01) {
          customWarnEl.style.display = 'block';
          customWarnEl.textContent = `Assigned total (৳${customAssigned}) does not match bill total (৳${totalAmount})`;
        } else {
          customWarnEl.style.display = 'none';
        }
      } else {
        customWarnEl.style.display = 'none';
      }
    }

    // Update row active / deselected classes
    document.querySelectorAll('.ledger-member-cb').forEach(cb => {
      const row = document.getElementById(`ledger_member_row_${cb.value}`);
      if (row) {
        row.classList.toggle('deselected', !cb.checked);
      }
    });

    // Update Select All checkbox state
    const selectAllCb = document.getElementById('ledgerSelectAllMembers');
    if (selectAllCb) {
      const allCbs = document.querySelectorAll('.ledger-member-cb');
      selectAllCb.checked = allCbs.length > 0 && checkedCbs.length === allCbs.length;
    }
  },

  /**
   * Helper: Generate unique human-readable Bill ID
   */
  generateBillNo(cycle) {
    const cycleClean = (cycle || Utils.currentMonth()).replace('-', '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BILL-${cycleClean}-${rand}`;
  },

  /**
   * Save / Create Bill in Firebase
   */
  async saveBill() {
    const title = document.getElementById('ledgerBillName').value.trim();
    const totalAmount = parseFloat(document.getElementById('ledgerBillAmount').value);
    const dueDate = document.getElementById('ledgerBillDueDate').value;
    const checkedCbs = Array.from(document.querySelectorAll('.ledger-member-cb:checked'));

    if (!title) {
      Notifications.toast('warning', 'Missing Title', 'Please enter a bill name or select a preset.');
      return;
    }
    if (!totalAmount || totalAmount <= 0) {
      Notifications.toast('warning', 'Invalid Amount', 'Please enter a valid total amount.');
      return;
    }
    if (checkedCbs.length === 0) {
      Notifications.toast('warning', 'No Members', 'Please select at least one member.');
      return;
    }

    // Build members allocation object
    const membersData = {};
    const existingBill = this.editingBillId ? this.bills[this.editingBillId] : null;

    if (this.splitType === 'equal') {
      const perMember = Math.round((totalAmount / checkedCbs.length) * 100) / 100;
      checkedCbs.forEach(cb => {
        const uId = cb.value;
        const prevMember = existingBill?.members?.[uId];
        membersData[uId] = {
          amount: perMember,
          status: prevMember?.status || 'pending',
          collectedAt: prevMember?.collectedAt || null,
          depositKey: prevMember?.depositKey || null
        };
      });
    } else {
      // Custom split
      let customSum = 0;
      checkedCbs.forEach(cb => {
        const uId = cb.value;
        const input = document.getElementById(`ledger_custom_amt_${uId}`);
        const amt = parseFloat(input?.value) || 0;
        customSum += amt;
        const prevMember = existingBill?.members?.[uId];
        membersData[uId] = {
          amount: amt,
          status: prevMember?.status || 'pending',
          collectedAt: prevMember?.collectedAt || null,
          depositKey: prevMember?.depositKey || null
        };
      });

      if (Math.abs(customSum - totalAmount) > 0.05) {
        Notifications.toast('warning', 'Amount Mismatch', `Total assigned (৳${customSum}) must equal bill total (৳${totalAmount}).`);
        return;
      }
    }

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found. Please reload.');
      return;
    }

    try {
      const billRef = this.editingBillId
        ? db.ref(`dinings/${diningId}/bills/${this.editingBillId}`)
        : db.ref(`dinings/${diningId}/bills`).push();

      const billNo = this.editingBillId
        ? (existingBill?.billNo || this.generateBillNo(this.currentCycle))
        : this.generateBillNo(this.currentCycle);

      const billPayload = {
        title,
        billNo,
        totalAmount,
        dueDate: dueDate || Utils.today(),
        month: this.currentCycle || Utils.currentMonth(),
        splitMonth: this.selectedSplitMonth || 'all',
        splitType: this.splitType,
        members: membersData,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };

      if (!this.editingBillId) {
        billPayload.createdAt = firebase.database.ServerValue.TIMESTAMP;
        billPayload.createdBy = Messliner.state.userId;
      }

      await billRef.set(billPayload);

      const isSingleMember = Object.keys(membersData).length === 1;
      Notifications.toast('success', 'Bill Saved', `${isSingleMember ? 'Bill' : 'Shared bill'} "${title}" has been ${this.editingBillId ? 'updated' : 'created'}.`);
      closeModal('ledgerBillModal');
      this.render();

    } catch (err) {
      console.error('Save bill error:', err);
      Notifications.toast('error', 'Error', 'Failed to save bill.');
    }
  },

  /**
   * Confirm and delete a bill (Using Custom UI Modal)
   */
  confirmDeleteBill(billId) {
    const bill = this.bills[billId];
    if (!bill) return;

    this.pendingDeleteBillId = billId;
    const memberList = Object.entries(bill.members || {});
    const totalMemberCount = memberList.length;
    const isSingle = totalMemberCount === 1;
    const allUsers = Messliner.users.users || {};
    const singleUserName = isSingle ? (allUsers[memberList[0]?.[0]]?.name || '1 member') : '';
    const collectedCount = memberList.filter(([_, m]) => m.status === 'collected').length;

    const modalTitle = document.getElementById('ledgerDeleteModalTitle');
    const msgEl = document.getElementById('ledgerDeleteModalMsg');
    const previewTitle = document.getElementById('ledgerDeletePreviewTitle');
    const previewId = document.getElementById('ledgerDeletePreviewId');
    const previewAmount = document.getElementById('ledgerDeletePreviewAmount');
    const previewType = document.getElementById('ledgerDeletePreviewType');
    const warningBox = document.getElementById('ledgerDeleteModalWarning');
    const warningText = document.getElementById('ledgerDeleteModalWarningText');

    const billNo = bill.billNo || ('BILL-' + (bill.month ? bill.month.replace('-', '') : '2609') + '-' + bill.id.slice(-4).toUpperCase());

    if (modalTitle) {
      modalTitle.textContent = isSingle ? 'Delete Individual Bill' : 'Delete Shared Bill';
    }

    if (msgEl) {
      msgEl.innerHTML = `Are you sure you want to delete the ${isSingle ? 'individual' : 'shared'} bill <strong>"${bill.title}"</strong>?`;
    }

    if (previewTitle) previewTitle.textContent = bill.title;
    if (previewId) {
      previewId.textContent = '#' + billNo;
      previewId.onclick = (e) => this.copyBillId(billNo, e);
    }
    if (previewAmount) previewAmount.textContent = Utils.currency(bill.totalAmount);
    if (previewType) {
      previewType.textContent = isSingle
        ? `Individual • ${singleUserName}`
        : `Shared • ${totalMemberCount} members`;
    }

    if (warningBox && warningText) {
      if (collectedCount > 0) {
        warningText.textContent = `${collectedCount} member(s) have already had this bill deducted. Deleting the bill will not automatically refund them.`;
        warningBox.style.display = 'flex';
      } else {
        warningBox.style.display = 'none';
      }
    }

    openModal('ledgerDeleteBillModal');
  },

  /**
   * Execute deletion of bill after user confirms in custom modal
   */
  async executeDeleteBill() {
    const billId = this.pendingDeleteBillId;
    if (!billId) return;

    const bill = this.bills[billId];
    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }

    const delBtn = document.getElementById('ledgerConfirmDeleteBtn');
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.innerHTML = '<span>Deleting...</span>';
    }

    try {
      await db.ref(`dinings/${diningId}/bills/${billId}`).remove();
      const memberCount = Object.keys(bill?.members || {}).length;
      const billTypeLabel = memberCount === 1 ? 'Bill' : 'Shared bill';
      Notifications.toast('info', 'Bill Deleted', `${billTypeLabel} "${bill?.title || ''}" was removed.`);
      closeModal('ledgerDeleteBillModal');
      this.pendingDeleteBillId = null;
      this.render();
    } catch (err) {
      console.error('Delete bill error:', err);
      Notifications.toast('error', 'Error', 'Failed to delete bill.');
    } finally {
      if (delBtn) {
        delBtn.disabled = false;
        delBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>Delete Bill</span>
        `;
      }
    }
  },

  /**
   * Helper: Calculate monthly net balance for all members for a given month ("YYYY-MM")
   */
  async getMemberMonthlyBalances(monthStr) {
    const diningId = this.getDiningId();
    if (!diningId) return {};

    const targetMonth = monthStr || this.currentCycle || Utils.currentMonth();

    try {
      const [usersSnap, depositsSnap, bazarSnap, mealsSnap, settingsSnap] = await Promise.all([
        db.ref(`dinings/${diningId}/users`).once('value'),
        db.ref(`dinings/${diningId}/deposits`).once('value'),
        db.ref(`dinings/${diningId}/bazar`).once('value'),
        db.ref(`dinings/${diningId}/meals/${targetMonth}`).once('value'),
        db.ref(`dinings/${diningId}/settings`).once('value')
      ]);

      const users = usersSnap.val() || {};
      const deposits = depositsSnap.val() || {};
      const bazars = bazarSnap.val() || {};
      const monthMeals = mealsSnap.val() || {};
      const settings = settingsSnap.val() || {};
      const isManagerMealEnabled = !!settings.managerMealEnabled;

      const isSelectedMonth = (item) => {
        if (!item) return false;
        if (item.date && typeof item.date === 'string') {
          return item.date.startsWith(targetMonth);
        }
        if (item.timestamp && typeof item.timestamp === 'number') {
          const dt = new Date(item.timestamp);
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          return `${y}-${m}` === targetMonth;
        }
        return false;
      };

      // 1. Deposits, other costs, deductions
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

      // 2. Bazar total
      let totalBazar = 0;
      Object.values(bazars).forEach(b => {
        if (isSelectedMonth(b)) {
          totalBazar += Utils.num(b.amount);
        }
      });

      // 3. User Meals & Total Meals
      const userMealsBreakdown = {};
      const userTotalMeals = {};
      let totalMealsCount = 0;

      Object.values(monthMeals).forEach(dayData => {
        if (!dayData || typeof dayData !== 'object') return;
        ['breakfast', 'lunch', 'dinner'].forEach(type => {
          const typeData = dayData[type];
          if (typeData && typeof typeData === 'object') {
            Object.entries(typeData).forEach(([uId, count]) => {
              const u = users[uId];
              if (u && u.role === 'admin' && !isManagerMealEnabled) return;
              const c = parseFloat(count) || 0;
              totalMealsCount += c;
              if (!userMealsBreakdown[uId]) {
                userMealsBreakdown[uId] = { breakfast: 0, lunch: 0, dinner: 0 };
              }
              userMealsBreakdown[uId][type] = (userMealsBreakdown[uId][type] || 0) + c;
              userTotalMeals[uId] = (userTotalMeals[uId] || 0) + c;
            });
          }
        });
      });

      // 4. Meal Rate
      const rateMode = settings.rateMode || 'market';
      const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
      let mealRate = 0;
      if (rateMode === 'fixed') {
        const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
        let fullMealRate = 0;
        if (trackedMeals.breakfast !== false) fullMealRate += (fixedRates.breakfast || 0);
        if (trackedMeals.lunch !== false) fullMealRate += (fixedRates.lunch || 0);
        if (trackedMeals.dinner !== false) fullMealRate += (fixedRates.dinner || 0);
        mealRate = fullMealRate;
      } else {
        mealRate = totalMealsCount > 0 ? (totalBazar / totalMealsCount) : 0;
      }

      // 5. Calculate net balance for each user
      const balances = {};
      Object.keys(users).forEach(uId => {
        const uBreakdown = userMealsBreakdown[uId] || { breakfast: 0, lunch: 0, dinner: 0 };
        const uMealCount = userTotalMeals[uId] || 0;
        const mealCost = Utils.calcMealCost(mealRate, uMealCount, uBreakdown, fixedRates);

        const deposit = uDeposits[uId] || 0;
        const otherCost = uOtherCosts[uId] || 0;
        const deduction = uDeductions[uId] || 0;
        const balance = deposit - mealCost - otherCost - deduction;

        balances[uId] = Math.round(balance * 100) / 100;
      });

      return balances;
    } catch (e) {
      console.error('[Ledger] Failed to calculate member monthly balances:', e);
      return {};
    }
  },

  /**
   * Show Bill Details & Collect Modal
   */
  async showBillDetails(billId) {
    const bill = this.bills[billId];
    if (!bill) return;
    this.activeDetailsBillId = billId;

    const allUsers = Messliner.users.users || {};
    const members = bill.members || {};
    const memberList = Object.entries(members);
    const paidCount = memberList.filter(([_, m]) => m.status === 'collected').length;
    const isAllPaid = memberList.length > 0 && paidCount === memberList.length;
    const billNo = bill.billNo || ('BILL-' + (bill.month ? bill.month.replace('-', '') : '2609') + '-' + bill.id.slice(-4).toUpperCase());

    document.getElementById('ledgerDetailsTitle').textContent = bill.title;
    const tagEl = document.getElementById('ledgerDetailsIdTag');
    if (tagEl) {
      tagEl.textContent = '#' + billNo;
      tagEl.dataset.billNo = billNo;
    }
    document.getElementById('ledgerDetailsMeta').textContent = `Due ${Utils.formatDate(bill.dueDate)} • ${Utils.currency(bill.totalAmount)} total • ${paidCount}/${memberList.length} collected`;

    const listEl = document.getElementById('ledgerDetailsMembersList');
    if (!listEl) return;

    // Calculate current month's real financial balances for all members
    const targetMonth = bill.month || this.currentCycle || Utils.currentMonth();
    const balances = await this.getMemberMonthlyBalances(targetMonth);

    listEl.innerHTML = memberList.map(([uId, m]) => {
      const user = allUsers[uId];
      const name = user?.name || 'Member';
      const isPaid = m.status === 'collected';
      const userBalance = (balances && balances[uId] !== undefined) ? balances[uId] : 0;
      const isDue = userBalance < 0;
      const formattedBalance = isDue
        ? `-৳${Math.abs(userBalance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
        : `৳${userBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

      return `
        <div class="ledger-detail-member-row ${isPaid ? 'paid' : 'pending'}">
          <div class="ledger-detail-member-left">
            <div class="member-tia-avatar">${Utils.initials(name)}</div>
            <div class="ledger-detail-member-text">
              <div class="ledger-detail-member-name">${name}</div>
              <div class="ledger-detail-member-sub" style="${isDue ? 'color:#EF4444;' : ''}">Balance: ${formattedBalance}</div>
            </div>
          </div>

          <div class="ledger-detail-member-right">
            <div class="ledger-detail-member-amt">${Utils.currency(m.amount)}</div>
            ${isPaid ? `
              <div class="ledger-paid-badge" title="Collected at ${m.collectedAt ? new Date(m.collectedAt).toLocaleDateString() : 'N/A'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Collected</span>
              </div>
            ` : `
              <button class="btn btn-primary btn-sm ledger-btn-single-collect"
                      onclick="Messliner.ledger.collectMember('${billId}', '${uId}')">
                Collect
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Toggle Batch Collect All Button
    const batchBtn = document.getElementById('ledgerBatchCollectBtn');
    if (batchBtn) {
      batchBtn.style.display = isAllPaid ? 'none' : 'inline-flex';
      batchBtn.onclick = () => this.collectAllUnpaid(billId);
    }

    openModal('ledgerDetailsModal');
  },

  /**
   * Collect a single member's bill -> Deduct directly from user balance
   */
  async collectMember(billId, userId) {
    const bill = this.bills[billId];
    if (!bill) return;
    const memberData = bill.members?.[userId];
    if (!memberData || memberData.status === 'collected') return;

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }

    const user = Messliner.users.users[userId];
    const memberAmount = Utils.num(memberData.amount);

    try {
      // 1. Create Deduction Record in Firebase deposits
      const depositRef = db.ref(`dinings/${diningId}/deposits`).push();
      const depositKey = depositRef.key;

      await depositRef.set({
        userId,
        userName: user?.name || 'Unknown',
        amount: -memberAmount, // negative indicates balance deduction
        type: 'deduction',
        note: `Bill: ${bill.title}`,
        billId: billId,
        date: Utils.today(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // 2. Subtract from user's totalDeposit
      const currentDeposit = Utils.num(user?.totalDeposit);
      const newDeposit = currentDeposit - memberAmount;
      await db.ref(`dinings/${diningId}/users/${userId}/totalDeposit`).set(newDeposit);

      // 3. Mark member as collected in bill
      await db.ref(`dinings/${diningId}/bills/${billId}/members/${userId}`).update({
        status: 'collected',
        collectedAt: firebase.database.ServerValue.TIMESTAMP,
        depositKey: depositKey
      });

      // 4. Send Notification & Activity Log
      await Notifications.create(
        diningId,
        'Bill Deducted',
        `${Utils.currency(memberAmount)} deducted for bill: ${bill.title}`,
        userId,
        'deposit'
      );

      await Notifications.log(
        diningId,
        'bill_collected',
        `Collected ৳${memberAmount} from ${user?.name} for bill: ${bill.title}`,
        Messliner.state.userId,
        userId
      );

      Notifications.toast('success', 'Collected & Deducted', `${Utils.currency(memberAmount)} deducted from ${user?.name}.`);

      // Refresh details modal view
      this.showBillDetails(billId);
      this.render();

    } catch (err) {
      console.error('Collect member bill error:', err);
      Notifications.toast('error', 'Error', 'Failed to collect bill amount.');
    }
  },

  /**
   * Collect all unpaid members for a bill in batch directly
   */
  async collectAllUnpaid(billId) {
    const bill = this.bills[billId];
    if (!bill) return;

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }

    const allUsers = Messliner.users.users || {};
    const unpaidMembers = Object.entries(bill.members || {}).filter(([_, m]) => m.status !== 'collected');

    if (unpaidMembers.length === 0) {
      Notifications.toast('info', 'All Paid', 'All members have already paid this bill.');
      return;
    }

    try {
      for (const [uId, m] of unpaidMembers) {
        const user = allUsers[uId];
        const memberAmount = Utils.num(m.amount);

        // 1. Create Deduction Record
        const depositRef = db.ref(`dinings/${diningId}/deposits`).push();
        const depositKey = depositRef.key;

        await depositRef.set({
          userId: uId,
          userName: user?.name || 'Unknown',
          amount: -memberAmount,
          type: 'deduction',
          note: `Bill: ${bill.title}`,
          billId: billId,
          date: Utils.today(),
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // 2. Subtract from totalDeposit
        const currentDeposit = Utils.num(user?.totalDeposit);
        await db.ref(`dinings/${diningId}/users/${uId}/totalDeposit`).set(currentDeposit - memberAmount);

        // 3. Mark collected in bill
        await db.ref(`dinings/${diningId}/bills/${billId}/members/${uId}`).update({
          status: 'collected',
          collectedAt: firebase.database.ServerValue.TIMESTAMP,
          depositKey: depositKey
        });

        // 4. Notify
        await Notifications.create(
          diningId,
          'Bill Deducted',
          `${Utils.currency(memberAmount)} deducted for bill: ${bill.title}`,
          uId,
          'deposit'
        );
      }

      await Notifications.log(
        diningId,
        'bill_batch_collected',
        `Collected dues for ${unpaidMembers.length} member(s) on bill: ${bill.title}`,
        Messliner.state.userId
      );

      Notifications.toast('success', 'All Collected', `Dues collected for ${unpaidMembers.length} members.`);
      this.showBillDetails(billId);
      this.render();

    } catch (err) {
      console.error('Batch collect error:', err);
      Notifications.toast('error', 'Error', 'Failed to batch collect bill dues.');
    }
  },

  /**
   * Copy Bill ID to clipboard
   */
  copyBillId(billNo, e) {
    if (e) e.stopPropagation();
    if (!billNo) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(billNo).then(() => {
        Notifications.toast('info', 'ID Copied', `Bill ID ${billNo} copied to clipboard.`);
      }).catch(() => {
        copyToClipboard(billNo);
        Notifications.toast('info', 'ID Copied', `Bill ID ${billNo} copied to clipboard.`);
      });
    } else {
      copyToClipboard(billNo);
      Notifications.toast('info', 'ID Copied', `Bill ID ${billNo} copied to clipboard.`);
    }
  },

  copyDetailsBillId(e) {
    const tagEl = document.getElementById('ledgerDetailsIdTag');
    const billNo = tagEl?.dataset?.billNo || tagEl?.textContent?.replace('#', '');
    this.copyBillId(billNo, e);
  },

  previewBillSlipFromDetails() {
    if (this.activeDetailsBillId) {
      this.previewBillSlip(this.activeDetailsBillId);
    }
  },

  /**
   * Preview Bill Summary Slip
   */
  previewBillSlip(billId) {
    const bill = this.bills[billId];
    if (!bill) return;
    this.currentSlipBillId = billId;

    const allUsers = Messliner.users?.users || (typeof App !== 'undefined' ? App.state?.users : {}) || {};
    const diningName = document.getElementById('sidebarDiningName')?.textContent?.trim() ||
      Messliner.state?.diningName ||
      Messliner.diningName ||
      (Messliner.auth?.userDining?.name) ||
      'Mess';
    const billNo = bill.billNo || ('BILL-' + (bill.month ? bill.month.replace('-', '') : '2609') + '-' + bill.id.slice(-4).toUpperCase());
    const members = bill.members || {};
    const memberList = Object.entries(members);
    const paidCount = memberList.filter(([_, m]) => m.status === 'collected').length;
    const totalCollected = memberList.reduce((sum, [_, m]) => sum + (m.status === 'collected' ? (m.amount || 0) : 0), 0);
    const pendingAmt = Math.max(0, (bill.totalAmount || 0) - totalCollected);

    const diningEl = document.getElementById('slipBillDiningName');
    if (diningEl) diningEl.textContent = diningName;

    const idEl = document.getElementById('slipBillIdBadge');
    if (idEl) idEl.textContent = '#' + billNo;

    const titleEl = document.getElementById('slipBillTitle');
    if (titleEl) titleEl.textContent = bill.title;

    const cycleEl = document.getElementById('slipBillCycle');
    if (cycleEl) cycleEl.textContent = this.formatCycle(bill.month || this.currentCycle);

    const dueEl = document.getElementById('slipBillDueDate');
    if (dueEl) dueEl.textContent = bill.dueDate ? Utils.formatDate(bill.dueDate) : 'N/A';

    const formatTk = amt => '৳ ' + (parseFloat(amt) || 0).toLocaleString('en-BD');

    const totalEl = document.getElementById('slipBillTotal');
    if (totalEl) totalEl.textContent = formatTk(bill.totalAmount);

    const grandTotalEl = document.getElementById('slipBillGrandTotal');
    if (grandTotalEl) grandTotalEl.textContent = formatTk(bill.totalAmount);

    const colEl = document.getElementById('slipBillCollected');
    if (colEl) colEl.textContent = formatTk(totalCollected);

    const pendEl = document.getElementById('slipBillPending');
    if (pendEl) pendEl.textContent = formatTk(pendingAmt);

    const memberCount = memberList.length;
    const isIndividual = memberCount === 1;

    const docTypeEl = document.getElementById('slipBillDocType');
    if (docTypeEl) {
      docTypeEl.textContent = isIndividual ? 'Individual Expense Voucher' : 'Shared Expense Voucher';
    }

    const splitEl = document.getElementById('slipBillSplitType');
    if (splitEl) {
      if (isIndividual) {
        splitEl.textContent = 'Individual';
      } else {
        splitEl.textContent = `Shared • ${memberCount} members`;
      }
    }

    const genEl = document.getElementById('slipBillGeneratedAt');
    if (genEl) genEl.remove();

    const thankYouEl = document.getElementById('slipBillThankYou');
    if (thankYouEl) {
      thankYouEl.textContent = `THANK YOU • ${diningName.toUpperCase()}`;
    }

    const tbody = document.getElementById('slipBillMembersTableBody');
    if (tbody) {
      tbody.innerHTML = memberList.map(([uId, m], idx) => {
        const user = allUsers[uId];
        const name = user?.name || 'Member';
        const isPaid = m.status === 'collected';
        const paidDate = m.collectedAt ? new Date(m.collectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

        const amountFormatted = (parseFloat(m.amount) || 0).toLocaleString('en-BD');
        return `
          <tr class="ledger-slip-invoice-row" style="border-bottom: 1px solid #f1f5f9; font-family: 'Inter', system-ui, -apple-system, sans-serif;">
            <td style="color: #94a3b8; font-size: 11px; padding: 8px 14px; vertical-align: middle; font-family: inherit;">${idx + 1}</td>
            <td style="font-weight: 600; color: #1e293b; padding: 8px 14px; font-size: 12px; vertical-align: middle; font-family: inherit;">${name}</td>
            <td style="text-align: right; font-weight: 700; color: #0f172a; padding: 8px 14px; font-size: 13px; font-family: inherit; font-variant-numeric: tabular-nums; vertical-align: middle;">৳ ${amountFormatted}</td>
            <td style="text-align: right; padding: 8px 14px; vertical-align: middle; font-family: inherit;">
              <span style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; ${isPaid ? 'color: #16a34a;' : 'color: #ea580c;'}">
                ${isPaid ? 'PAID ✓' : 'PENDING'}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    openModal('ledgerSlipModal');
  },

  /**
   * Export / Download Bill Summary Slip
   */
  async downloadBillSlip(format = 'png') {
    const originalCard = document.getElementById('ledgerBillSlipCard');
    if (!originalCard) return;

    const bill = this.bills[this.currentSlipBillId];
    const billNo = bill?.billNo || 'BILL_SLIP';
    const fileName = `${billNo}_Summary`;

    const btnPng = document.getElementById('btnDownloadBillSlipPng');
    const btnPdf = document.getElementById('btnDownloadBillSlipPdf');

    if (btnPng) btnPng.disabled = true;
    if (btnPdf) btnPdf.disabled = true;

    // Create a clean offscreen clone with natural compact content flow (block layout, no flex stretching)
    const clone = originalCard.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = '794px';
    clone.style.height = 'auto';
    clone.style.minHeight = 'auto';
    clone.style.display = 'block';
    clone.style.maxWidth = 'none';
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.boxShadow = 'none';
    clone.style.zIndex = '-9999';
    document.body.appendChild(clone);

    try {
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        allowTaint: true
      });

      document.body.removeChild(clone);

      if (format === 'png') {
        // Build full A4 page (794px x 1123px at 2x scale = 1588px x 2246px) with clean white space below
        const targetA4Width = 794 * 2;
        const targetA4MinHeight = 1123 * 2;
        const finalHeight = Math.max(targetA4MinHeight, canvas.height);

        const a4Canvas = document.createElement('canvas');
        a4Canvas.width = targetA4Width;
        a4Canvas.height = finalHeight;

        const ctx = a4Canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, a4Canvas.width, a4Canvas.height);
        ctx.drawImage(canvas, 0, 0);

        a4Canvas.toBlob(blob => {
          if (!blob) {
            Notifications.toast('error', 'Export Failed', 'Could not generate slip image.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `${fileName}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          Notifications.toast('success', 'Slip Downloaded', `Saved as ${fileName}.png`);
        }, 'image/png');
      } else if (format === 'pdf') {
        if (!window.jspdf || !window.jspdf.jsPDF) {
          throw new Error('jsPDF library not loaded.');
        }
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
        const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, imgHeight));
        pdf.save(`${fileName}.pdf`);
        Notifications.toast('success', 'PDF Downloaded', `Saved as ${fileName}.pdf`);
      }
    } catch (err) {
      if (clone && clone.parentNode) {
        document.body.removeChild(clone);
      }
      console.error('[Ledger] Download slip error:', err);
      Notifications.toast('error', 'Export Error', 'Failed to generate summary slip.');
    } finally {
      if (btnPng) btnPng.disabled = false;
      if (btnPdf) btnPdf.disabled = false;
    }
  },



  /**
   * Update Payment Requests Counter Badge on Ledger Top Bar
   */
  updatePaymentRequestsBadge() {
    const badge = document.getElementById('ledgerPendingReqBadge');
    if (!badge) return;
    const pendingCount = Object.values(this.paymentRequests || {}).filter(r => r && r.status === 'pending').length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  },

  /**
   * Open Payment Requests Modal for Admin
   */
  openPaymentRequestsModal() {
    this.renderPaymentRequestsUI();
    openModal('ledgerPaymentRequestsModal');
  },

  /**
   * Render Payment Requests in modal (Review All Requests)
   */
  renderPaymentRequestsUI() {
    const container = document.getElementById('ledgerPaymentRequestsList');
    if (!container) return;

    const allRequests = Object.entries(this.paymentRequests || {}).map(([id, r]) => ({
      id,
      ...r
    })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const billRequests = allRequests.filter(r => r.type === 'bill_payment');
    const depositRequests = allRequests.filter(r => r.type !== 'bill_payment');

    const pendingBill = billRequests.filter(r => r.status === 'pending');
    const pendingDeposit = depositRequests.filter(r => r.status === 'pending');
    const processed = allRequests.filter(r => r.status !== 'pending');

    if (allRequests.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 30px 10px;">
          <div class="empty-state-icon" style="background: rgba(16, 185, 129, 0.1); color: #059669;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <h4 style="margin: 10px 0 2px; font-weight: 700; color: #0F2E1E;">No Payment Requests</h4>
          <p style="color: #64748B; font-size: 0.82rem;">Members haven't submitted any payment or bill clearance requests yet.</p>
        </div>
      `;
      return;
    }

    let html = '';

    // 1. Pending Bill Complete Requests
    if (pendingBill.length > 0) {
      html += `
        <div class="ledger-requests-sec-header flex items-center justify-between">
          <span>📋 Bill Complete Requests (${pendingBill.length})</span>
          <span class="ledger-pv-badge bill">Pending Review</span>
        </div>
      `;
      html += pendingBill.map(req => {
        const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently';
        const bill = this.bills?.[req.billId];
        const billTitle = req.billTitle || bill?.title || 'Shared Bill';
        const billNo = bill?.billNo || (req.billId ? ('BILL-' + (bill?.month ? bill.month.replace('-', '') : '2609') + '-' + req.billId.slice(-4).toUpperCase()) : 'BILL-REF');
        const memberCount = bill?.members ? Object.keys(bill.members).length : 1;
        const billType = memberCount > 1 ? 'Shared Bill' : 'Individual Bill';
        const isCash = (req.method || '').toLowerCase() === 'cash';

        return `
          <div class="ledger-req-card pending bill-req-card fade-up">
            <div class="ledger-req-top">
              <div class="ledger-req-user">
                <span class="ledger-req-name">${req.userName}</span>
                <span class="ledger-req-method-badge ${req.method || 'cash'}">${(req.method || 'cash').toUpperCase()}</span>
                <span class="ledger-widget-req-type-pill bill">Bill Clear</span>
              </div>
              <div class="ledger-req-amount positive">
                ${Utils.currency(req.amount)}
              </div>
            </div>

            <div class="ledger-req-bill-info-grid">
              <div class="ledger-req-bill-info-cell">
                <span class="lrb-label">Bill Name</span>
                <span class="lrb-val lrb-title" title="${billTitle}">${billTitle}</span>
              </div>
              <div class="ledger-req-bill-info-cell">
                <span class="lrb-label">Bill Type</span>
                <span class="lrb-val lrb-type">${billType}</span>
              </div>
              <div class="ledger-req-bill-info-cell">
                <span class="lrb-label">Bill ID</span>
                <span class="lrb-val lrb-id" title="Click to copy" onclick="Messliner.ledger.copyBillId('${billNo}', event)">#${billNo}</span>
              </div>
            </div>

            <div class="ledger-req-meta-row">
              <span>Time: ${dateStr}</span>
              ${!isCash && req.trxId ? `<span>TrxID: <code class="ledger-req-trx" title="Click to copy" onclick="Messliner.ledger.copyBillId('${req.trxId}', event)">${req.trxId}</code></span>` : (isCash ? `<span>Method: <b>Cash in Hand</b></span>` : '')}
            </div>

            ${req.note ? `<div class="ledger-req-note">"${req.note}"</div>` : ''}

            <div class="ledger-req-actions">
              <button type="button" class="btn btn-secondary btn-sm" onclick="Messliner.ledger.rejectPaymentRequest('${req.id}')">
                Reject
              </button>
              <button type="button" class="btn btn-primary btn-sm ledger-req-approve-btn" style="background:#4F46E5 !important; border-color:#4F46E5 !important;" onclick="Messliner.ledger.approvePaymentRequest('${req.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Approve & Mark Paid</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. Pending Deposit Requests
    if (pendingDeposit.length > 0) {
      html += `
        <div class="ledger-requests-sec-header flex items-center justify-between" style="${pendingBill.length > 0 ? 'margin-top:20px;' : ''}">
          <span>💳 Deposit / Top-up Requests (${pendingDeposit.length})</span>
          <span class="ledger-pv-badge deposit">Pending Review</span>
        </div>
      `;
      html += pendingDeposit.map(req => {
        const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently';
        const isCash = (req.method || '').toLowerCase() === 'cash';

        return `
          <div class="ledger-req-card pending deposit-req-card fade-up">
            <div class="ledger-req-top">
              <div class="ledger-req-user">
                <span class="ledger-req-name">${req.userName}</span>
                <span class="ledger-req-method-badge ${req.method || 'cash'}">${(req.method || 'cash').toUpperCase()}</span>
                <span class="ledger-widget-req-type-pill deposit">Deposit</span>
              </div>
              <div class="ledger-req-amount positive">
                +${Utils.currency(req.amount)}
              </div>
            </div>

            <div class="ledger-req-meta-row">
              <span>Time: ${dateStr}</span>
              ${!isCash && req.trxId ? `<span>TrxID: <code class="ledger-req-trx" title="Click to copy" onclick="Messliner.ledger.copyBillId('${req.trxId}', event)">${req.trxId}</code></span>` : (isCash ? `<span>Method: <b>Cash in Hand</b></span>` : '')}
            </div>

            ${req.note ? `<div class="ledger-req-note">"${req.note}"</div>` : ''}

            <div class="ledger-req-actions">
              <button type="button" class="btn btn-secondary btn-sm" onclick="Messliner.ledger.rejectPaymentRequest('${req.id}')">
                Reject
              </button>
              <button type="button" class="btn btn-primary btn-sm ledger-req-approve-btn" onclick="Messliner.ledger.approvePaymentRequest('${req.id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Approve & Credit</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Processed Past Requests
    if (processed.length > 0) {
      html += `<div class="ledger-requests-sec-header" style="margin-top:22px;">Past History (${processed.length})</div>`;
      html += processed.slice(0, 15).map(req => {
        const isApproved = req.status === 'approved';
        const isBillPay = req.type === 'bill_payment';
        const isCash = (req.method || '').toLowerCase() === 'cash';
        const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const bill = isBillPay ? this.bills?.[req.billId] : null;
        const billTitle = req.billTitle || bill?.title || 'Shared Bill';
        const billNo = bill?.billNo || (req.billId ? ('BILL-' + (bill?.month ? bill.month.replace('-', '') : '2609') + '-' + req.billId.slice(-4).toUpperCase()) : 'BILL-REF');
        const memberCount = bill?.members ? Object.keys(bill.members).length : 1;
        const billType = memberCount > 1 ? 'Shared Bill' : 'Individual Bill';

        return `
          <div class="ledger-req-card processed ${req.status}">
            <div class="ledger-req-top">
              <div class="ledger-req-user">
                <span class="ledger-req-name">${req.userName}</span>
                <span class="ledger-req-method-badge ${req.method || 'cash'}">${(req.method || 'cash').toUpperCase()}</span>
                <span class="ledger-widget-req-type-pill ${isBillPay ? 'bill' : 'deposit'}">${isBillPay ? 'Bill Clear' : 'Deposit'}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="ledger-req-amount ${isApproved ? 'positive' : 'rejected'}">
                  ${isBillPay ? '' : '+'}${Utils.currency(req.amount)}
                </span>
                <span class="user-history-status-pill ${req.status}">
                  ${isApproved ? (isBillPay ? 'Paid ✓' : 'Approved ✓') : 'Rejected ✕'}
                </span>
              </div>
            </div>

            ${isBillPay ? `
              <div class="ledger-req-bill-info-grid processed">
                <div class="ledger-req-bill-info-cell">
                  <span class="lrb-label">Bill Name</span>
                  <span class="lrb-val lrb-title">${billTitle}</span>
                </div>
                <div class="ledger-req-bill-info-cell">
                  <span class="lrb-label">Bill Type</span>
                  <span class="lrb-val lrb-type">${billType}</span>
                </div>
                <div class="ledger-req-bill-info-cell">
                  <span class="lrb-label">Bill ID</span>
                  <span class="lrb-val lrb-id" title="Click to copy" onclick="Messliner.ledger.copyBillId('${billNo}', event)">#${billNo}</span>
                </div>
              </div>
            ` : ''}

            <div class="ledger-req-meta-row">
              <span>Date: ${dateStr}</span>
              ${!isCash && req.trxId ? `<span>TrxID: <code class="ledger-req-trx">${req.trxId}</code></span>` : (isCash ? `<span>Method: Cash</span>` : '')}
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = html;
  },

  /**
   * Pending action callback holder for confirmation modal
   */
  _pendingConfirmAction: null,

  /**
   * Open Custom Action Confirmation Modal
   */
  showActionConfirm({ type = 'reject', title, message, userName, metaLabel, subtext, typeBadge, amount, actionBtnText, onConfirm }) {
    this._pendingConfirmAction = onConfirm;

    const ringEl = document.getElementById('ledgerConfirmIconRing');
    const svgEl = document.getElementById('ledgerConfirmIconSvg');
    const titleEl = document.getElementById('ledgerConfirmTitle');
    const msgEl = document.getElementById('ledgerConfirmMessage');
    const avatarEl = document.getElementById('ledgerConfirmAvatar');
    const nameEl = document.getElementById('ledgerConfirmUserName');
    const metaLblEl = document.getElementById('ledgerConfirmMetaLabel');
    const subtextEl = document.getElementById('ledgerConfirmSubtext');
    const badgeEl = document.getElementById('ledgerConfirmTypeBadge');
    const amtEl = document.getElementById('ledgerConfirmAmount');
    const btnAction = document.getElementById('ledgerConfirmBtnAction');

    if (ringEl) {
      ringEl.className = `ledger-confirm-icon-ring ${type}`;
    }
    if (svgEl) {
      if (type === 'reject') {
        svgEl.innerHTML = `
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        `;
      } else {
        svgEl.innerHTML = `
          <polyline points="20 6 9 17 4 12"></polyline>
        `;
      }
    }
    if (titleEl) titleEl.textContent = title || (type === 'reject' ? 'Reject Request?' : 'Approve Request?');
    if (msgEl) msgEl.textContent = message || '';
    if (avatarEl) avatarEl.textContent = Utils.initials(userName || 'M');
    if (nameEl) nameEl.textContent = userName || 'Member';
    if (metaLblEl) metaLblEl.textContent = metaLabel || (subtext ? 'Bill Name:' : '');
    if (subtextEl) subtextEl.textContent = subtext || 'Shared Bill';
    if (badgeEl) {
      badgeEl.className = `ledger-confirm-type-badge ${typeBadge?.class || 'bill'}`;
      badgeEl.textContent = typeBadge?.label || (typeBadge?.class === 'deposit' ? 'Deposit' : 'Bill Clear');
    }
    if (amtEl) amtEl.textContent = amount || '';

    if (btnAction) {
      btnAction.className = `btn ledger-confirm-btn-action ${type} ${typeBadge?.class || ''}`;
      btnAction.innerHTML = `<span>${actionBtnText || (type === 'reject' ? 'Reject Request' : 'Approve')}</span>`;
      btnAction.disabled = false;
    }

    openModal('ledgerActionConfirmModal');
  },

  closeConfirmActionModal() {
    this._pendingConfirmAction = null;
    closeModal('ledgerActionConfirmModal');
  },

  async executeConfirmedAction() {
    if (typeof this._pendingConfirmAction === 'function') {
      const btnAction = document.getElementById('ledgerConfirmBtnAction');
      if (btnAction) {
        btnAction.disabled = true;
        btnAction.innerHTML = `<span>Processing...</span>`;
      }
      try {
        await this._pendingConfirmAction();
      } finally {
        this.closeConfirmActionModal();
      }
    } else {
      this.closeConfirmActionModal();
    }
  },

  /**
   * Approve Payment Request (Bill Payment or Add Money Top-Up)
   */
  async approvePaymentRequest(reqId) {
    const req = this.paymentRequests?.[reqId];
    if (!req) return;

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }

    const isBillPay = req.type === 'bill_payment';
    const user = Messliner.users?.users?.[req.userId];
    const name = req.userName || user?.name || 'Member';
    const subtext = isBillPay ? (req.billTitle || 'Shared Bill') : (req.note || 'Add Money to Balance');

    this.showActionConfirm({
      type: 'approve',
      title: isBillPay ? 'Approve Bill Payment?' : 'Approve Deposit Request?',
      message: isBillPay
        ? `This will mark ${name}'s bill share as Paid directly without altering monthly mess balance.`
        : `This will credit ${Utils.currency(req.amount)} to ${name}'s account balance immediately.`,
      userName: name,
      metaLabel: isBillPay ? 'Bill Name:' : 'Purpose:',
      subtext: subtext,
      typeBadge: {
        label: isBillPay ? 'Bill Clear' : 'Deposit',
        class: isBillPay ? 'bill' : 'deposit'
      },
      amount: (isBillPay ? '' : '+') + Utils.currency(req.amount),
      actionBtnText: isBillPay ? 'Approve & Mark Paid' : 'Approve & Credit',
      onConfirm: async () => {
        if (isBillPay) {
          try {
            // 1. Mark Bill Member as Collected / Paid
            if (req.billId) {
              await db.ref(`dinings/${diningId}/bills/${req.billId}/members/${req.userId}`).update({
                status: 'collected',
                collectedAt: firebase.database.ServerValue.TIMESTAMP,
                paymentMethod: req.method || 'cash',
                paymentRequestId: reqId
              });
            }

            // 2. Mark Request Approved in Firebase
            await db.ref(`dinings/${diningId}/paymentRequests/${reqId}`).update({
              status: 'approved',
              approvedAt: firebase.database.ServerValue.TIMESTAMP,
              approvedBy: Messliner.state.userId
            });

            // 3. Send Notification to Member
            await Notifications.create(
              diningId,
              'Bill Payment Approved',
              `Your payment of ৳${req.amount} for "${req.billTitle || 'Shared Bill'}" has been verified and marked as Paid!`,
              req.userId,
              'deposit'
            );

            Notifications.toast('success', 'Bill Marked as Paid', `${name}'s share for "${req.billTitle || 'Bill'}" has been collected.`);
            closeModal('ledgerReviewSingleModal');
            this.renderPaymentRequestsWidget();
            this.renderPaymentRequestsUI();
            this.render();

          } catch (err) {
            console.error('Approve bill payment error:', err);
            Notifications.toast('error', 'Error', 'Failed to approve bill payment.');
          }
        } else {
          try {
            const userRef = db.ref(`dinings/${diningId}/users/${req.userId}`);
            const userSnap = await userRef.once('value');
            const user = userSnap.val() || {};
            const currentDeposit = Utils.num(user.totalDeposit);
            const addAmt = Utils.num(req.amount);

            // 1. Credit User Balance
            await userRef.update({
              totalDeposit: currentDeposit + addAmt
            });

            // 2. Create Deposit Record in Firebase
            const depositRef = db.ref(`dinings/${diningId}/deposits`).push();
            await depositRef.set({
              userId: req.userId,
              userName: req.userName,
              amount: addAmt,
              type: 'deposit',
              note: `Add Money (${(req.method || 'cash').toUpperCase()})` + (req.trxId ? ` - Trx: ${req.trxId}` : ''),
              date: Utils.today(),
              timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            // 3. Mark Request Approved
            await db.ref(`dinings/${diningId}/paymentRequests/${reqId}`).update({
              status: 'approved',
              approvedAt: firebase.database.ServerValue.TIMESTAMP,
              approvedBy: Messliner.state.userId
            });

            // 4. Send In-App Notification to User
            await Notifications.create(
              diningId,
              'Add Money Approved',
              `Your deposit of ৳${addAmt} has been approved and added to your balance!`,
              req.userId,
              'deposit'
            );

            Notifications.toast('success', 'Request Approved', `৳${addAmt} credited to ${name}.`);
            closeModal('ledgerReviewSingleModal');
            this.renderPaymentRequestsWidget();
            this.renderPaymentRequestsUI();

          } catch (err) {
            console.error('Approve request error:', err);
            Notifications.toast('error', 'Error', 'Failed to approve request.');
          }
        }
      }
    });
  },

  /**
   * Reject Payment Request
   */
  async rejectPaymentRequest(reqId) {
    const req = this.paymentRequests?.[reqId];
    if (!req) return;

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Active Mess ID not found.');
      return;
    }

    const isBillPay = req.type === 'bill_payment';
    const user = Messliner.users?.users?.[req.userId];
    const name = req.userName || user?.name || 'Member';
    const subtext = isBillPay ? (req.billTitle || 'Shared Bill') : (req.note || 'Add Money to Balance');

    this.showActionConfirm({
      type: 'reject',
      title: isBillPay ? 'Reject Bill Payment?' : 'Reject Deposit Request?',
      message: isBillPay
        ? `Are you sure you want to reject ${name}'s bill payment? They will be notified to review.`
        : `Are you sure you want to reject ${name}'s deposit request? They will be notified.`,
      userName: name,
      metaLabel: isBillPay ? 'Bill Name:' : 'Purpose:',
      subtext: subtext,
      typeBadge: {
        label: isBillPay ? 'Bill Clear' : 'Deposit',
        class: isBillPay ? 'bill' : 'deposit'
      },
      amount: (isBillPay ? '' : '+') + Utils.currency(req.amount),
      actionBtnText: 'Reject Request',
      onConfirm: async () => {
        try {
          await db.ref(`dinings/${diningId}/paymentRequests/${reqId}`).update({
            status: 'rejected',
            rejectedAt: firebase.database.ServerValue.TIMESTAMP,
            rejectedBy: Messliner.state.userId
          });

          await Notifications.create(
            diningId,
            isBillPay ? 'Bill Payment Rejected' : 'Add Money Rejected',
            isBillPay
              ? `Your payment request of ৳${req.amount} for "${req.billTitle || 'Bill'}" was rejected by the admin.`
              : `Your deposit request of ৳${req.amount} was rejected by the admin.`,
            req.userId,
            'deposit'
          );

          Notifications.toast('info', 'Request Rejected', 'Payment request was marked as rejected.');
          closeModal('ledgerReviewSingleModal');
          this.renderPaymentRequestsWidget();
          this.renderPaymentRequestsUI();

        } catch (err) {
          console.error('Reject request error:', err);
          Notifications.toast('error', 'Error', 'Failed to reject request.');
        }
      }
    });
  },

  /**
   * Helper to retrieve all configured methods
   */
  getMethodsList() {
    const raw = this.paymentMethods || {};
    const list = [];
    const seenIds = new Set();

    // 1. From methods map (if nested in raw.methods)
    if (raw.methods && typeof raw.methods === 'object') {
      Object.entries(raw.methods).forEach(([id, m]) => {
        if (m && typeof m === 'object' && m.number) {
          list.push({ id, ...m });
          seenIds.add(id);
          if (m.platform) seenIds.add(m.platform.toLowerCase());
        }
      });
    }

    // 2. Direct keys in raw (e.g. raw.bkash, raw.nagad, raw.rocket, raw.upay, raw.other, raw.method_xxx)
    Object.entries(raw).forEach(([key, val]) => {
      if (key === 'methods') return;
      if (val && typeof val === 'object' && val.number) {
        const platform = (val.platform || key).toLowerCase();
        const id = val.id || `legacy_${key}`;
        if (!seenIds.has(key) && !seenIds.has(id) && !seenIds.has(platform)) {
          list.push({
            id: id,
            platform: platform,
            name: val.name || (key.charAt(0).toUpperCase() + key.slice(1)),
            number: val.number,
            charge: parseFloat(val.charge) || 0,
            description: val.description || (val.type ? `${val.type} account` : ''),
            active: val.active !== false && val.enabled !== false
          });
          seenIds.add(key);
          seenIds.add(id);
          seenIds.add(platform);
        }
      }
    });

    return list;
  },

  /**
   * Render Top Payment Methods Setup Banner
   */
  renderPaymentMethodsBanner() {
    const bannerEl = document.getElementById('ledgerPaymentMethodsBanner');
    const subEl = document.getElementById('ledgerPaymentMethodsBannerSub');
    const iconBox = document.getElementById('ledgerPaymentMethodsBannerIcon');
    if (!subEl) return;

    const allMethods = this.getMethodsList();
    const activeMethods = allMethods.filter(m => m.active !== false && !!m.number);

    if (activeMethods.length === 0) {
      // Red vibe warning state when no digital accounts configured
      if (bannerEl) {
        bannerEl.classList.add('warning-mode');
        bannerEl.classList.remove('configured-mode');
      }
      if (iconBox) {
        iconBox.className = 'ledger-methods-banner-icon warning';
      }
      subEl.innerHTML = `<span class="ledger-banner-red-text">Only Cash · Add digital method</span>`;
    } else {
      // Configured state matching the user's screenshot (e.g. bKash · Cash)
      if (bannerEl) {
        bannerEl.classList.remove('warning-mode');
        bannerEl.classList.add('configured-mode');
      }
      if (iconBox) {
        iconBox.className = 'ledger-methods-banner-icon configured';
      }
      const names = [...new Set(activeMethods.map(m => m.name || m.platform || 'Digital')), 'Cash'];
      subEl.innerHTML = `<span class="ledger-banner-configured-text">${names.join(' · ')}</span>`;
    }
  },

  /**
   * Open Payment Methods Modal (List View)
   */
  async openPaymentMethodsModal() {
    const diningId = this.getDiningId();
    if (diningId) {
      try {
        const snap = await db.ref(`dinings/${diningId}/settings/paymentMethods`).once('value');
        if (snap.exists()) {
          this.paymentMethods = snap.val() || {};
        }
      } catch (err) {
        console.warn('Failed to pre-fetch payment methods:', err);
      }
    }
    this.renderPaymentMethodsBanner();
    this.renderPaymentMethodsModal();
    openModal('ledgerPaymentMethodsModal');
  },

  /**
   * Render Payment Methods Modal Content (Empty State vs Populated List)
   */
  renderPaymentMethodsModal() {
    const container = document.getElementById('ledgerCustomMethodsList');
    if (!container) return;

    const allMethods = this.getMethodsList();

    if (allMethods.length === 0) {
      // Image 1: Clean Empty State
      container.innerHTML = `
        <div class="payment-methods-empty-state">
          <div class="empty-wallet-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
              <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
              <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
              <circle cx="18" cy="14" r="1" fill="currentColor" />
            </svg>
          </div>
          <h4 class="empty-wallet-title">No mobile methods yet</h4>
          <p class="empty-wallet-sub">Add bKash, Nagad or another channel for members to pay into.</p>
        </div>
      `;
      return;
    }

    // Image 3: Populated List Cards
    container.innerHTML = `
      <div class="payment-methods-list">
        ${allMethods.map(m => {
      const platform = (m.platform || 'other').toLowerCase();
      const name = m.name || m.platform || 'Payment Method';
      const isInactive = m.active === false;
      const charge = parseFloat(m.charge) || 0;

      return `
            <div class="payment-method-item-card ${isInactive ? 'inactive' : ''}">
              <div class="flex items-center gap-3">
                <span class="platform-dot ${platform}"></span>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="payment-method-item-name">${name}</span>
                    ${charge > 0 ? `<span class="payment-method-charge-badge">${charge}% fee</span>` : ''}
                    ${isInactive ? `<span class="payment-method-inactive-badge">Off</span>` : ''}
                  </div>
                  <div class="payment-method-item-number">${m.number}</div>
                  ${m.description ? `<div style="font-size:0.72rem; color:#94A3B8; margin-top:2px;">${m.description}</div>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-icon-soft" onclick="Messliner.ledger.editPaymentMethod('${m.id}')" title="Edit method">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button type="button" class="btn-icon-danger" onclick="Messliner.ledger.deletePaymentMethod('${m.id}')" title="Delete method">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  },

  /**
   * Open Add / Edit Method Form Modal (Image 2)
   */
  openAddMethodModal(methodId = null) {
    this.selectedPlatform = 'bkash';
    const form = document.getElementById('ledgerAddMethodForm');
    if (form) form.reset();

    const titleEl = document.getElementById('ledgerAddMethodModalTitle');
    const submitTextEl = document.getElementById('btnSaveMethodText');
    const hiddenIdEl = document.getElementById('editingMethodId');

    if (methodId) {
      // Edit mode
      const allMethods = this.getMethodsList();
      const method = allMethods.find(m => m.id === methodId);
      if (!method) return;

      if (hiddenIdEl) hiddenIdEl.value = methodId;
      if (titleEl) titleEl.textContent = 'Edit payment method';
      if (submitTextEl) submitTextEl.textContent = 'Save changes';

      this.selectPlatform(method.platform || 'bkash');
      document.getElementById('methodDisplayName').value = method.name || '';
      document.getElementById('methodAccountNumber').value = method.number || '';
      document.getElementById('methodChargePercent').value = method.charge || 0;
      document.getElementById('methodDescription').value = method.description || '';
      document.getElementById('methodActive').checked = method.active !== false;
    } else {
      // New mode
      if (hiddenIdEl) hiddenIdEl.value = '';
      if (titleEl) titleEl.textContent = 'Add payment method';
      if (submitTextEl) submitTextEl.textContent = '+ Add method';

      this.selectPlatform('bkash');
      document.getElementById('methodDisplayName').value = 'bKash';
      document.getElementById('methodAccountNumber').value = '';
      document.getElementById('methodChargePercent').value = 0;
      document.getElementById('methodDescription').value = '';
      document.getElementById('methodActive').checked = true;
    }

    closeModal('ledgerPaymentMethodsModal');
    openModal('ledgerAddMethodModal');
  },

  /**
   * Close Add Method Modal & Return to List View
   */
  closeAddMethodModal() {
    closeModal('ledgerAddMethodModal');
    this.renderPaymentMethodsModal();
    openModal('ledgerPaymentMethodsModal');
  },

  /**
   * Select Platform in Add Form (bKash, Nagad, Rocket, Upay, Other)
   */
  selectPlatform(platform) {
    this.selectedPlatform = platform || 'bkash';

    // Update pill buttons active state
    const container = document.getElementById('platformPillsContainer');
    if (container) {
      container.querySelectorAll('.platform-pill-btn').forEach(btn => {
        const p = btn.getAttribute('data-platform');
        if (p === this.selectedPlatform) {
          btn.className = `platform-pill-btn active ${p}`;
        } else {
          btn.className = `platform-pill-btn ${p}`;
        }
      });
    }

    // Auto-update display name & placeholder if pristine
    const nameInput = document.getElementById('methodDisplayName');
    const numInput = document.getElementById('methodAccountNumber');
    const defaultNames = {
      bkash: 'bKash',
      nagad: 'Nagad',
      rocket: 'Rocket',
      upay: 'Upay',
      other: 'Bank / Other'
    };

    if (nameInput) {
      const curVal = nameInput.value.trim();
      const isDefault = Object.values(defaultNames).includes(curVal) || !curVal;
      if (isDefault) {
        nameInput.value = defaultNames[this.selectedPlatform] || 'bKash';
      }
    }

    if (numInput) {
      numInput.placeholder = this.selectedPlatform === 'other' ? 'Account or Card number' : '01XXXXXXXXX';
    }
  },

  /**
   * Save Single Payment Method (Add or Edit)
   */
  async saveSinglePaymentMethod() {
    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Mess ID not found. Please reload or log in again.');
      return;
    }

    const editingId = document.getElementById('editingMethodId')?.value.trim();
    const platform = this.selectedPlatform || 'bkash';
    const name = document.getElementById('methodDisplayName')?.value.trim() || platform;
    const number = document.getElementById('methodAccountNumber')?.value.trim();
    const charge = parseFloat(document.getElementById('methodChargePercent')?.value) || 0;
    const description = document.getElementById('methodDescription')?.value.trim() || '';
    const active = document.getElementById('methodActive')?.checked !== false;

    if (!number) {
      Notifications.toast('warning', 'Missing Number', 'Please provide an account number.');
      return;
    }

    let methodId = editingId;
    if (!methodId || methodId.startsWith('legacy_')) {
      methodId = `method_${Date.now()}`;
    }

    const payload = {
      id: methodId,
      platform,
      name,
      number,
      charge,
      description,
      active,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    // 1. Update in-memory state immediately so UI updates instantaneously
    if (!this.paymentMethods) this.paymentMethods = {};
    if (!this.paymentMethods.methods) this.paymentMethods.methods = {};
    this.paymentMethods.methods[methodId] = payload;
    if (platform === 'bkash' || platform === 'nagad' || platform === 'rocket') {
      this.paymentMethods[platform] = {
        number: number,
        type: description || 'Personal',
        enabled: active,
        charge: charge
      };
    }
    if (editingId && editingId.startsWith('legacy_')) {
      const oldPlatform = editingId.replace('legacy_', '');
      if (oldPlatform !== platform && this.paymentMethods[oldPlatform]) {
        delete this.paymentMethods[oldPlatform];
      }
    }

    try {
      // 2. Save in methods map scoped to this dining/mess
      await db.ref(`dinings/${diningId}/settings/paymentMethods/methods/${methodId}`).set(payload);

      // 3. Sync to legacy keys if bkash/nagad/rocket for full backward compatibility
      if (platform === 'bkash' || platform === 'nagad' || platform === 'rocket') {
        await db.ref(`dinings/${diningId}/settings/paymentMethods/${platform}`).set({
          number: number,
          type: description || 'Personal',
          enabled: active,
          charge: charge
        });
      }

      // If we edited a legacy method and platform changed or new ID used, clean up old legacy key if different
      if (editingId && editingId.startsWith('legacy_')) {
        const oldPlatform = editingId.replace('legacy_', '');
        if (oldPlatform !== platform) {
          await db.ref(`dinings/${diningId}/settings/paymentMethods/${oldPlatform}`).remove();
        }
      }

      Notifications.toast('success', 'Method Saved', `${name} account configured successfully.`);
      closeModal('ledgerAddMethodModal');
      this.renderPaymentMethodsBanner();
      this.renderPaymentMethodsModal();
      openModal('ledgerPaymentMethodsModal');
    } catch (err) {
      console.error('Save payment method error:', err);
      Notifications.toast('error', 'Error', 'Failed to save payment method.');
    }
  },

  /**
   * Edit Payment Method
   */
  editPaymentMethod(methodId) {
    this.openAddMethodModal(methodId);
  },

  /**
   * Delete Payment Method
   */
  async deletePaymentMethod(methodId) {
    if (!methodId) return;

    const diningId = this.getDiningId();
    if (!diningId) {
      Notifications.toast('error', 'Error', 'Mess ID not found.');
      return;
    }

    try {
      // Find method
      const all = this.getMethodsList();
      const target = all.find(m => m.id === methodId);

      // Update in-memory state immediately
      if (this.paymentMethods) {
        if (this.paymentMethods.methods?.[methodId]) {
          delete this.paymentMethods.methods[methodId];
        }
        if (target?.platform && this.paymentMethods[target.platform]) {
          delete this.paymentMethods[target.platform];
        }
        if (this.paymentMethods[methodId]) {
          delete this.paymentMethods[methodId];
        }
      }

      // Remove from methods map
      await db.ref(`dinings/${diningId}/settings/paymentMethods/methods/${methodId}`).remove();

      // If legacy key matches
      if (target?.platform) {
        await db.ref(`dinings/${diningId}/settings/paymentMethods/${target.platform}`).remove();
      }
      if (methodId === 'legacy_bkash' || methodId === 'bkash') {
        await db.ref(`dinings/${diningId}/settings/paymentMethods/bkash`).remove();
      }
      if (methodId === 'legacy_nagad' || methodId === 'nagad') {
        await db.ref(`dinings/${diningId}/settings/paymentMethods/nagad`).remove();
      }
      if (methodId === 'legacy_rocket' || methodId === 'rocket') {
        await db.ref(`dinings/${diningId}/settings/paymentMethods/rocket`).remove();
      }

      Notifications.toast('info', 'Method Removed', 'Payment method was deleted.');
      this.renderPaymentMethodsBanner();
      this.renderPaymentMethodsModal();
    } catch (err) {
      console.error('Delete method error:', err);
      Notifications.toast('error', 'Error', 'Failed to delete payment method.');
    }
  }
};

console.log('[Messliner] Ledger module loaded');
