/* ============================================
   Messliner — Friday Meal Page (user/fridayMealPage.js)
   User-facing Friday Meal Chart, Bazar & Summary
   ============================================ */

const FridayMealPageModule = {
  diningId: null,
  userId: null,
  role: null,
  currentYear: null,
  currentMonth: null,        // 1-12
  selectedFridayIndex: 0,   // 0-3
  activeTab: 'chart',       // 'chart' | 'bazar' | 'summary'

  fridayMealsData: {},      // { wk: { uid: count } }
  fridayBazarData: {},      // { wk: { amount, note, date, deducted } }
  fridaySummaryData: {},    // { wk: summaryObj }

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /* ─── Helpers ─────────────────── */
  getFridayDates(year, month) {
    const dates = [];
    const d = new Date(year, month - 1, 1);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    while (d.getMonth() === month - 1 && dates.length < 4) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      dates.push(`${year}-${mm}-${dd}`);
      d.setDate(d.getDate() + 7);
    }
    return dates;
  },

  weekKey(index) { return `w${index + 1}`; },
  monthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  },

  createdDate: null,

  /* ─── Init ───────────────────── */
  async init(diningId, userId) {
    this.diningId = diningId;
    this.userId = userId;
    this.role = Messliner.state.role;

    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;

    try {
      const startRef = await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value');
      let startDateStr = startRef.val();
      if (startDateStr) {
        this.createdDate = new Date(startDateStr);
      } else {
        const infoSnap = await db.ref(`dinings/${this.diningId}/info/createdAt`).once('value');
        const createdAt = infoSnap.val();
        this.createdDate = createdAt ? new Date(createdAt) : new Date(2026, 0, 1);
      }
    } catch (e) {
      console.error('[FridayMealPageModule] Fetch start date error:', e);
      this.createdDate = new Date(2026, 0, 1);
    }

    const createdDate = this.createdDate || new Date(2026, 0, 1);
    const startYear = createdDate.getFullYear();
    const endYear = now.getFullYear();
    if (this.currentYear < startYear) this.currentYear = startYear;
    if (this.currentYear > endYear) this.currentYear = endYear;

    let startMonth = 1;
    let endMonth = 12;
    if (this.currentYear === startYear) startMonth = createdDate.getMonth() + 1;
    if (this.currentYear === endYear) endMonth = now.getMonth() + 1;
    if (this.currentMonth < startMonth) this.currentMonth = startMonth;
    if (this.currentMonth > endMonth) this.currentMonth = endMonth;

    // Default to closest upcoming/most recent Friday
    const fridayDates = this.getFridayDates(this.currentYear, this.currentMonth);
    const todayStr = Utils.today();
    let defaultIdx = fridayDates.length - 1;
    for (let i = 0; i < fridayDates.length; i++) {
      if (fridayDates[i] >= todayStr) { defaultIdx = i; break; }
    }
    this.selectedFridayIndex = defaultIdx >= 0 ? defaultIdx : 0;

    this.activeTab = 'chart';
    this._listenData();
  },

  _listenData() {
    const mk = this.monthKey(this.currentYear, this.currentMonth);

    if (this._mealsRef) this._mealsRef.off();
    if (this._bazarRef) this._bazarRef.off();
    if (this._summaryRef) this._summaryRef.off();

    this._mealsRef = db.ref(`dinings/${this.diningId}/fridayMeals/${mk}`);
    this._mealsRef.on('value', (snap) => {
      this.fridayMealsData = snap.val() || {};
      if (Router.currentPage === 'fridaymeal') this._render();
    });

    this._bazarRef = db.ref(`dinings/${this.diningId}/fridayBazar/${mk}`);
    this._bazarRef.on('value', (snap) => {
      this.fridayBazarData = snap.val() || {};
      if (Router.currentPage === 'fridaymeal') this._render();
    });

    this._summaryRef = db.ref(`dinings/${this.diningId}/fridaySummary/${mk}`);
    this._summaryRef.on('value', (snap) => {
      this.fridaySummaryData = snap.val() || {};
      if (Router.currentPage === 'fridaymeal') this._render();
    });
  },

  async refresh() {
    try {
      const startRef = await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value');
      let startDateStr = startRef.val();
      if (startDateStr) {
        this.createdDate = new Date(startDateStr);
      } else if (!this.createdDate) {
        const infoSnap = await db.ref(`dinings/${this.diningId}/info/createdAt`).once('value');
        const createdAt = infoSnap.val();
        this.createdDate = createdAt ? new Date(createdAt) : new Date(2026, 0, 1);
      }
    } catch (e) {
      if (!this.createdDate) this.createdDate = new Date(2026, 0, 1);
    }
    this._listenData();
    this.renderFridaySelector();
    this._render();
  },

  /* ─── Tab switching ──────────── */
  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.friday-page-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.friday-page-tab-content').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.tabpane === tab);
    });
    this._render();
  },

  /* ─── Selectors Page Navigation ───────── */
  selectYearPage(year) {
    this.currentYear = parseInt(year);
    const createdDate = this.createdDate || new Date(2026, 0, 1);
    const startYear = createdDate.getFullYear();
    const currentYear = new Date().getFullYear();
    let startMonth = 1;
    let endMonth = 12;
    if (this.currentYear === startYear) startMonth = createdDate.getMonth() + 1;
    if (this.currentYear === currentYear) endMonth = new Date().getMonth() + 1;
    if (this.currentMonth < startMonth) this.currentMonth = startMonth;
    if (this.currentMonth > endMonth) this.currentMonth = endMonth;

    this.selectedFridayIndex = 0;
    this._listenData();
    this.renderFridaySelector();
    this._render();
    document.getElementById('fridayPageYearDropdown')?.classList.remove('active');
  },

  selectMonthPage(month) {
    this.currentMonth = parseInt(month);
    this.selectedFridayIndex = 0;
    this._listenData();
    this.renderFridaySelector();
    this._render();
    document.getElementById('fridayPageMonthDropdown')?.classList.remove('active');
  },

  selectFridayPage(index) {
    this.selectedFridayIndex = parseInt(index);
    this.renderFridaySelector();
    this._render();
    document.getElementById('fridayPageWeekDropdown')?.classList.remove('active');
  },

  /* ─── Friday Selector ────────── */
  renderFridaySelector() {
    const createdDate = this.createdDate || new Date(2026, 0, 1);
    const startYear = createdDate.getFullYear();
    const endYear = new Date().getFullYear();

    if (this.currentYear < startYear) this.currentYear = startYear;
    if (this.currentYear > endYear) this.currentYear = endYear;

    let startMonth = 1;
    let endMonth = 12;
    if (this.currentYear === startYear) {
      startMonth = createdDate.getMonth() + 1;
    }
    if (this.currentYear === endYear) {
      endMonth = new Date().getMonth() + 1;
    }
    if (this.currentMonth < startMonth) this.currentMonth = startMonth;
    if (this.currentMonth > endMonth) this.currentMonth = endMonth;

    const fridayDates = this.getFridayDates(this.currentYear, this.currentMonth);

    // Year dropdown
    const yearValEl = document.getElementById('fridayPageYearValue');
    const yearMenuEl = document.getElementById('fridayPageYearMenu');
    if (yearValEl && yearMenuEl) {
      yearValEl.textContent = this.currentYear;
      let yearHtml = '';
      for (let y = startYear; y <= endYear; y++) {
        const isSelected = y === this.currentYear;
        yearHtml += `
          <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}"
               onclick="Messliner.fridayMealPage.selectYearPage(${y}); event.stopPropagation()">
            ${y}
          </div>
        `;
      }
      yearMenuEl.innerHTML = yearHtml;
    }

    // Month dropdown
    const monthValEl = document.getElementById('fridayPageMonthValue');
    const monthMenuEl = document.getElementById('fridayPageMonthMenu');
    if (monthValEl && monthMenuEl) {
      monthValEl.textContent = this.monthNames[this.currentMonth - 1];
      let monthHtml = '';
      for (let m = startMonth; m <= endMonth; m++) {
        const isSelected = m === this.currentMonth;
        monthHtml += `
          <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}"
               onclick="Messliner.fridayMealPage.selectMonthPage(${m}); event.stopPropagation()">
            ${this.monthNames[m - 1]}
          </div>
        `;
      }
      monthMenuEl.innerHTML = monthHtml;
    }

    // Week/Day dropdown
    const valueEl = document.getElementById('fridayPageWeekValue');
    const menuEl = document.getElementById('fridayPageWeekMenu');
    if (!valueEl || !menuEl) return;

    if (!fridayDates.length) {
      valueEl.textContent = 'No Fridays';
      menuEl.innerHTML = '<div class="custom-dropdown-item" style="color:var(--text-tertiary)">No Fridays this month</div>';
      return;
    }

    if (this.selectedFridayIndex >= fridayDates.length || this.selectedFridayIndex < 0) {
      this.selectedFridayIndex = 0;
    }

    menuEl.innerHTML = fridayDates.map((dateStr, idx) => {
      const d = new Date(dateStr + 'T00:00:00');
      const label = `${d.getDate()} ${this.monthNames[d.getMonth()]}`;
      const isSelected = idx === this.selectedFridayIndex;
      return `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}"
             onclick="Messliner.fridayMealPage.selectFridayPage(${idx}); event.stopPropagation()">
          ${label}
        </div>
      `;
    }).join('');

    const sel = fridayDates[this.selectedFridayIndex];
    if (sel) {
      const d = new Date(sel + 'T00:00:00');
      valueEl.textContent = `${d.getDate()} ${this.monthNames[d.getMonth()]}`;
    }
  },

  /* ─── Master render ──────────── */
  _render() {
    this.renderFridaySelector();
    if (this.activeTab === 'chart') this.renderFridayMealChart();
    else if (this.activeTab === 'bazar') this.renderFridayBazarTab();
    else if (this.activeTab === 'summary') this.renderFridaySummaryTab();
    this._updateUserDashboardLabel();
  },

  /* ─── Friday Meal Chart ──────── */
  renderFridayMealChart() {
    const container = document.getElementById('fridayMealChartBody');
    if (!container) return;

    const wk = this.weekKey(this.selectedFridayIndex);
    const mealCounts = this.fridayMealsData[wk] || {};
    const users = Messliner.users?.users || {};

    // Charge info
    const bazarEntry = this.fridayBazarData[wk];
    const totalMeals = Object.values(mealCounts).reduce((s, c) => s + (parseInt(c) || 0), 0);
    const perMealCost = (bazarEntry && bazarEntry.amount && totalMeals > 0)
      ? bazarEntry.amount / totalMeals : 0;

    // Header strip
    const chargeStrip = document.getElementById('fridayMealChargeStrip');
    const fridayDates = this.getFridayDates(this.currentYear, this.currentMonth);
    const fridayDate = fridayDates[this.selectedFridayIndex] || '';
    const ordinals = ['1st', '2nd', '3rd', '4th'];
    let fridayLabel = '';
    if (fridayDate) {
      const d = new Date(fridayDate + 'T00:00:00');
      fridayLabel = `${ordinals[this.selectedFridayIndex]} Friday · ${d.getDate()} ${this.monthNames[d.getMonth()].slice(0, 3)}`;
    } else {
      fridayLabel = `${ordinals[this.selectedFridayIndex]} Friday`;
    }

    if (chargeStrip) {
      // Hide the charge card entirely when no meals are recorded
      if (totalMeals === 0) {
        chargeStrip.innerHTML = '';
      } else {
        const plateIconSvg = `<svg width="96" height="96" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="32" cy="44" rx="24" ry="5" fill="currentColor" opacity="0.3"/>
          <path d="M8 34C8 20.745 18.745 10 32 10s24 10.745 24 24" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
          <ellipse cx="32" cy="34" rx="24" ry="5" fill="currentColor" opacity="0.5"/>
          <ellipse cx="32" cy="34" rx="14" ry="3" fill="currentColor" opacity="0.5"/>
          <line x1="20" y1="44" x2="20" y2="52" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          <line x1="44" y1="44" x2="44" y2="52" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          <line x1="16" y1="52" x2="48" y2="52" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="32" cy="8" r="3" fill="currentColor" opacity="0.7"/>
        </svg>`;

        if (bazarEntry && bazarEntry.amount > 0) {
          chargeStrip.innerHTML = `
            <div class="friday-charge-card">
              <div class="friday-charge-icon-wrap">${plateIconSvg}</div>
              <div class="friday-charge-card-inner">
                <div class="friday-charge-meta">
                  <div class="friday-charge-pill">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                    ${fridayLabel}
                  </div>
                  <div class="friday-charge-label">Per Meal Charge</div>
                  <div class="friday-charge-sub">Based on total bazar</div>
                </div>
                <div class="friday-charge-amount-block">
                  <div class="friday-charge-amount-label">Per Meal</div>
                  <div class="friday-charge-amount">${Utils.currency(perMealCost)}<span class="friday-charge-unit">/meal</span></div>
                </div>
              </div>
            </div>
          `;
        } else {
          chargeStrip.innerHTML = `
            <div class="friday-charge-card no-data">
              <div class="friday-charge-icon-wrap" style="color:#7C3AED;">${plateIconSvg}</div>
              <div class="friday-charge-card-inner">
                <div class="friday-charge-meta">
                  <div class="friday-charge-pill">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                    ${fridayLabel}
                  </div>
                  <div class="friday-charge-label">Per Meal Charge</div>
                  <div class="friday-charge-sub">No bazar data yet</div>
                </div>
                <div class="friday-charge-amount-block">
                  <div class="friday-charge-amount-label" style="color:var(--text-tertiary);">Per Meal</div>
                  <div class="friday-charge-amount">&#8212;</div>
                </div>
              </div>
            </div>
          `;
        }
      }
    }

    // Table
    const entries = Object.entries(mealCounts).filter(([, c]) => parseInt(c) > 0);
    if (entries.length === 0) {
      container.innerHTML = `
        <tr><td colspan="3" class="text-center p-6" style="color:var(--text-tertiary);">
          No Friday meals recorded for this Friday.
        </td></tr>
      `;
      return;
    }

    container.innerHTML = entries.map(([uid, cnt]) => {
      const user = users[uid] || { name: uid };
      const count = parseInt(cnt) || 0;
      const charge = perMealCost > 0 ? perMealCost * count : null;
      const avatarBg = Messliner.users?._avatarColor ? Messliner.users._avatarColor(user.name) : '#E9D5FF';
      return `
        <tr>
          <td style="text-align:left;">
            <div class="flex items-center gap-2">
              <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
              <span class="member-name-text">${user.name}</span>
            </div>
          </td>
          <td style="text-align:center;">
            <span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${count}</span>
          </td>
          <td style="text-align:center;">
            ${charge !== null
          ? `<span style="font-weight:600;color:#7C3AED;">${Utils.currency(charge)}</span>`
          : '<span style="color:var(--text-tertiary)">—</span>'}
          </td>
        </tr>
      `;
    }).join('') + `
      <tr style="font-weight:700;background:rgba(124,58,237,0.05);border-top:2px solid rgba(124,58,237,0.15);">
        <td style="padding:var(--space-3) var(--space-4);">Total</td>
        <td style="text-align:center;padding:var(--space-3) var(--space-4);">
          <span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${totalMeals}</span>
        </td>
        <td style="text-align:center;padding:var(--space-3) var(--space-4);">
          ${bazarEntry && bazarEntry.amount > 0
        ? `<span style="font-weight:700;color:#7C3AED;">${Utils.currency(bazarEntry.amount)}</span>`
        : '<span style="color:var(--text-tertiary)">—</span>'}
        </td>
      </tr>
    `;
  },

  toggleBazarCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const wasExpanded = card.classList.contains('expanded');
    // Collapse other cards
    document.querySelectorAll('.bazar-day-card').forEach(c => c.classList.remove('expanded'));
    if (!wasExpanded) {
      card.classList.add('expanded');
    }
  },

  /* ─── Friday Bazar Tab ───────── */
  renderFridayBazarTab() {
    const container = document.getElementById('fridayBazarList');
    if (!container) return;

    const ordinals = ['1st', '2nd', '3rd', '4th'];

    // Only show the selected week's bazar entry (matches Day dropdown selection)
    const selectedWk = this.weekKey(this.selectedFridayIndex);
    const b = this.fridayBazarData[selectedWk];

    if (!b || !b.amount || b.amount <= 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-8);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </div>
          <h3>No Friday Bazar</h3>
          <p>No bazar recorded for the selected Friday.</p>
        </div>
      `;
      return;
    }

    const dateObj = new Date(b.date + 'T00:00:00');
    const dayNum = String(dateObj.getDate()).padStart(2, '0');
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const formattedDate = Utils.formatDate(b.date);

    const wkIdx = this.selectedFridayIndex;
    const ordinalLabel = `${ordinals[wkIdx] || selectedWk} Friday`;
    const shopperLabel = b.shopperName && b.shopperName !== 'N/A' ? b.shopperName : 'N/A';
    const cardId = `friday-bazar-card-${selectedWk}`;

    const itemRowHtml = `
      <div class="bazar-item-row" style="padding: 12px 0;">
        <div class="bazar-item-index">1</div>
        <div class="bazar-item-info">
          <div class="bazar-item-name" style="text-align: left; padding-left: 8px;">${Utils.formatBazarItems(b.items)}</div>
          ${b.note ? `<div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Note: ${b.note}</div>` : ''}
        </div>
        <div class="bazar-item-amount">${Utils.currency(b.amount)}</div>
      </div>
    `;

    container.innerHTML = `
      <div class="bazar-day-card expanded" id="${cardId}" style="margin-bottom: 10px;">
        <div class="bazar-day-card-header" onclick="Messliner.fridayMealPage.toggleBazarCard('${cardId}')">
          <div class="bazar-date-badge">${dayNum}</div>

          <div class="bazar-card-info" style="text-align: left;">
            <div class="bazar-card-top-row">
              <span class="bazar-card-weekday">${dayOfWeek}</span>
              <span class="bazar-card-fulldate">${formattedDate} (${ordinalLabel})</span>
            </div>
            <div class="bazar-card-shopper">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>${shopperLabel}</span>
            </div>
          </div>

          <div class="bazar-card-right">
            <div class="bazar-card-amount">${Utils.currency(b.amount)}</div>
            <div class="bazar-chevron">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Expandable detail panel -->
        <div class="bazar-day-card-body">
          <div class="bazar-items-list">
            <div class="bazar-items-header">
              <span>Items &amp; Shopper</span>
              <span>Amount</span>
            </div>
            ${itemRowHtml}
            <div class="bazar-items-total-row">
              <span>Total</span>
              <span>${Utils.currency(b.amount)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /* ─── Friday Summary Tab ─────── */
  renderFridaySummaryTab() {
    const container = document.getElementById('fridaySummaryContent');
    if (!container) return;

    const wk = this.weekKey(this.selectedFridayIndex);
    const summary = this.fridaySummaryData[wk];
    const users = Messliner.users?.users || {};
    const fridayDates = this.getFridayDates(this.currentYear, this.currentMonth);
    const fridayDate = fridayDates[this.selectedFridayIndex] || '';
    const ordinals = ['1st', '2nd', '3rd', '4th'];
    const fridayLabel = ordinals[this.selectedFridayIndex];

    if (!summary) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-8);">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <h3>No Summary Yet</h3>
          <p>Add Friday bazar and deduct to see the summary for ${fridayLabel} Friday.</p>
        </div>
      `;
      return;
    }

    const isAdmin = this.role === 'admin';
    const summaryUsers = summary.users || {};
    const dateLabel = fridayDate ? Utils.formatDate(fridayDate) : '—';

    // Summary overview banner
    const bannerHtml = `
      <div class="friday-summary-banner">
        <div class="friday-summary-banner-header">
          <span class="friday-summary-banner-icon">
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="32" cy="46" rx="22" ry="4.5" fill="rgba(255,255,255,0.3)"/>
              <path d="M10 36C10 23.85 19.85 14 32 14s22 9.85 22 22" stroke="rgba(255,255,255,0.95)" stroke-width="3.5" stroke-linecap="round"/>
              <ellipse cx="32" cy="36" rx="22" ry="4.5" fill="rgba(255,255,255,0.55)"/>
              <ellipse cx="32" cy="36" rx="13" ry="2.8" fill="rgba(255,255,255,0.45)"/>
              <line x1="21" y1="46" x2="21" y2="53" stroke="rgba(255,255,255,0.85)" stroke-width="2.8" stroke-linecap="round"/>
              <line x1="43" y1="46" x2="43" y2="53" stroke="rgba(255,255,255,0.85)" stroke-width="2.8" stroke-linecap="round"/>
              <line x1="17" y1="53" x2="47" y2="53" stroke="rgba(255,255,255,0.95)" stroke-width="3.2" stroke-linecap="round"/>
              <circle cx="32" cy="11" r="3" fill="rgba(255,255,255,0.75)"/>
            </svg>
          </span>
          <div>
            <div class="friday-summary-banner-title">${fridayLabel} Friday Summary</div>
            <div class="friday-summary-banner-date">${dateLabel}</div>
          </div>
        </div>
        <div class="friday-summary-banner-stats">
          <div class="friday-summary-stat">
            <div class="friday-summary-stat-val">${Utils.currency(summary.totalBazar)}</div>
            <div class="friday-summary-stat-label">Total Bazar</div>
          </div>
          <div class="friday-summary-stat">
            <div class="friday-summary-stat-val">${summary.totalMeals}</div>
            <div class="friday-summary-stat-label">Total Meals</div>
          </div>
          <div class="friday-summary-stat">
            <div class="friday-summary-stat-val">${Utils.currency(summary.perMealCost)}</div>
            <div class="friday-summary-stat-label">Per Meal</div>
          </div>
        </div>
      </div>
    `;

    if (!isAdmin) {
      // Show only current user's summary
      const myData = summaryUsers[this.userId];
      if (!myData) {
        container.innerHTML = bannerHtml + `
          <div class="empty-state" style="padding:var(--space-6);">
            <p style="color:var(--text-tertiary);">You did not participate in this Friday's meal.</p>
          </div>
        `;
        return;
      }

      // ─── Compute balanceBefore / balanceAfter from LIVE data ────────────
      // The correct balance formula (same as dashboard):
      //   balance = deposit - mealCost - otherCost - allDeductions
      // Since all Friday deductions are already applied to the account, we
      // reconstruct balanceBefore by adding back this week's + all later weeks'
      // Friday deductions (so we see the balance JUST BEFORE this Friday's cut).

      const now = new Date();
      const isViewingCurrentMonth = (
        this.currentYear === now.getFullYear() &&
        this.currentMonth === (now.getMonth() + 1)
      );

      const dash = Messliner.userDashboard;
      let displayBalanceBefore = myData.balanceBefore; // fallback to stored
      let displayBalanceAfter  = myData.balanceAfter;  // fallback to stored

      if (isViewingCurrentMonth && dash) {
        // 1. Compute current live balance (same formula as dashboard renderStats)
        const mealRate   = Messliner.state.monthlyMealRate || 0;
        const settings   = dash.settings || {};
        const rateMode   = settings.rateMode || 'market';
        const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || null) : null;
        const mealCost   = Utils.calcMealCost(
          mealRate,
          dash.monthlyMeals || 0,
          dash.monthlyMealsBreakdown || null,
          fixedRates
        );
        const currentLiveBalance =
          (dash.monthlyDeposit    || 0) -
          mealCost                       -
          (dash.monthlyOtherCosting || 0) -
          (dash.monthlyDeduction   || 0);

        // 2. Add back friday_meal deductions for this week AND all later weeks
        //    so we get the balance as it was BEFORE this Friday's deduction.
        //    (Earlier-week deductions stay subtracted — correct.)
        const selectedWkNum = this.selectedFridayIndex + 1; // 1-based
        let addBack = 0;
        for (let i = selectedWkNum; i <= 4; i++) {
          const wkData = this.fridaySummaryData[`w${i}`];
          if (wkData && wkData.users && wkData.users[this.userId]) {
            addBack += Utils.num(wkData.users[this.userId].deducted);
          }
        }

        displayBalanceBefore = currentLiveBalance + addBack;
        displayBalanceAfter  = displayBalanceBefore - Utils.num(myData.deducted);
      }
      // ────────────────────────────────────────────────────────────────────

      container.innerHTML = bannerHtml + `
        <div class="friday-summary-my-card">
          <div class="friday-summary-my-row">
            <span>My Meals</span>
            <span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${myData.mealCount}</span>
          </div>
          <div class="friday-summary-my-row">
            <span>Balance Before</span>
            <span style="font-weight:600;">${Utils.currency(displayBalanceBefore)}</span>
          </div>
          <div class="friday-summary-my-row deduction">
            <span>Friday Meal Deduction</span>
            <span style="color:#DC2626;font-weight:700;">− ${Utils.currency(myData.deducted)}</span>
          </div>
          <div class="friday-summary-my-row balance-after">
            <span>Balance After</span>
            <span style="font-weight:700;color:${displayBalanceAfter >= 0 ? '#059669' : '#DC2626'};">${Utils.currency(displayBalanceAfter)}</span>
          </div>
        </div>
      `;
      return;
    }

    // Admin: show all users
    const rows = Object.entries(summaryUsers).map(([uid, uData]) => {
      const user = users[uid] || { name: uid };
      const avatarBg = Messliner.users?._avatarColor ? Messliner.users._avatarColor(user.name) : '#E9D5FF';
      const balAfterClass = uData.balanceAfter >= 0 ? 'color:#059669' : 'color:#DC2626';
      return `
        <tr>
          <td style="text-align:left;">
            <div class="flex items-center gap-2">
              <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
              <span class="member-name-text">${user.name}</span>
            </div>
          </td>
          <td style="text-align:center;">
            <span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${uData.mealCount}</span>
          </td>
          <td style="text-align:right;color:#DC2626;font-weight:600;">− ${Utils.currency(uData.deducted)}</td>
          <td style="text-align:right;font-weight:600;">${Utils.currency(uData.balanceBefore)}</td>
          <td style="text-align:right;font-weight:700;${balAfterClass};">${Utils.currency(uData.balanceAfter)}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = bannerHtml + `
      <div class="table-wrapper" style="margin-top:var(--space-4);">
        <table class="data-table">
          <thead>
            <tr>
              <th style="text-align:left;">Member</th>
              <th style="text-align:center;">Meals</th>
              <th style="text-align:right;">Deduction</th>
              <th style="text-align:right;">Balance Before</th>
              <th style="text-align:right;">Balance After</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /* ─── User Dashboard "My Meal" label ────── */
  _updateUserDashboardLabel() {
    // Sum this user's Friday meals for current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const mk = this.monthKey(currentYear, currentMonth);

    const label = document.getElementById('fridayMealDashLabel');
    if (!label || !Messliner.state.userId) return;

    // Use the already-loaded data if available
    let total = 0;
    if (this.diningId && this.monthKey(this.currentYear, this.currentMonth) === mk) {
      Object.values(this.fridayMealsData).forEach(wkData => {
        if (wkData && wkData[Messliner.state.userId]) {
          total += parseInt(wkData[Messliner.state.userId]) || 0;
        }
      });
    } else {
      // Async fetch from Firebase once
      db.ref(`dinings/${this.diningId}/fridayMeals/${mk}`).once('value').then(snap => {
        const data = snap.val() || {};
        let t = 0;
        Object.values(data).forEach(wkData => {
          if (wkData && wkData[Messliner.state.userId]) {
            t += parseInt(wkData[Messliner.state.userId]) || 0;
          }
        });
        const el = document.getElementById('fridayMealDashLabel');
        if (el) {
          el.textContent = `+ ${t} Friday Meal`;
          el.style.display = t > 0 ? 'inline-flex' : 'none';
        }
      });
      return;
    }

    label.textContent = `+ ${total} Friday Meal`;
    label.style.display = total > 0 ? 'inline-flex' : 'none';
  },
};

window.FridayMealPageModule = FridayMealPageModule;
console.log('[Messliner] FridayMealPageModule loaded');
