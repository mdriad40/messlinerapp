/* ============================================
   Messliner — Bazar History Module (user/bazarHistory.js)
   ============================================ */

const BazarHistoryModule = {
  diningId: null,
  userId: null,
  createdDate: null,
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth() + 1,
  expandedCard: null, // currently expanded date string e.g. "2026-07-05"
  rawBazarData: null,
  _initialized: false,
  _listeningDiningId: null,
  _bazarRef: null,

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /**
   * Initialize Bazar History module
   */
  async init(diningId, userId) {
    this.diningId = diningId || (window.Messliner && Messliner.state && Messliner.state.diningId);
    this.userId = userId || (window.Messliner && Messliner.state && Messliner.state.userId);

    if (!this._initialized) {
      const now = new Date();
      this.selectedYear = now.getFullYear();
      this.selectedMonth = now.getMonth() + 1;
      this._initialized = true;
    }

    try {
      if (this.diningId) {
        const startRef = await db.ref(`dinings/${this.diningId}/settings/historyStartDate`).once('value');
        let startDateStr = startRef.val();
        if (startDateStr) {
          this.createdDate = new Date(startDateStr);
        } else {
          const infoSnap = await db.ref(`dinings/${this.diningId}/info/createdAt`).once('value');
          const createdAt = infoSnap.val();
          if (createdAt) {
            this.createdDate = new Date(createdAt);
          } else {
            this.createdDate = new Date(2026, 0, 1);
          }
        }
      } else {
        this.createdDate = new Date(2026, 0, 1);
      }
    } catch (e) {
      console.error('[BazarHistoryModule] Fetch start date error:', e);
      this.createdDate = new Date(2026, 0, 1);
    }

    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.setupRealtimeListener();
  },

  /**
   * Setup Realtime Firebase listener for Bazar data
   */
  setupRealtimeListener() {
    if (!this.diningId && window.Messliner && Messliner.state) {
      this.diningId = Messliner.state.diningId;
    }
    if (!this.diningId) return;

    if (this._listeningDiningId === this.diningId && this._bazarRef) {
      // Already listening to this dining group, render current cached data
      this.renderMonthData();
      return;
    }

    if (this._bazarRef) {
      this._bazarRef.off();
    }

    this._listeningDiningId = this.diningId;
    this._bazarRef = db.ref(`dinings/${this.diningId}/bazar`);

    this._bazarRef.on('value', snap => {
      this.rawBazarData = snap.val() || {};
      this._lastRenderedHtml = null;
      this.renderMonthData();
    }, err => {
      console.error('[BazarHistoryModule] Realtime error:', err);
    });
  },

  /**
   * Populate Year dropdown
   */
  populateYearDropdown() {
    const valueEl = document.getElementById('bazarHistoryYearValue');
    const menuEl = document.getElementById('bazarHistoryYearMenu');
    if (!valueEl || !menuEl) return;

    const startYear = (this.createdDate || new Date(2026, 0, 1)).getFullYear();
    const endYear = new Date().getFullYear();

    let html = '';
    for (let y = startYear; y <= endYear; y++) {
      const sel = y === this.selectedYear ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${y}"
                    onclick="Messliner.bazarHistory.selectYear(${y})">${y}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.selectedYear;
  },

  selectYear(year) {
    this.selectedYear = parseInt(year, 10);
    this._lastRenderedHtml = null;
    const dd = document.getElementById('bazarHistoryYearDropdown');
    if (dd) dd.classList.remove('active');
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.renderMonthData();
  },

  /**
   * Populate Month dropdown
   */
  populateMonthDropdown() {
    const valueEl = document.getElementById('bazarHistoryMonthValue');
    const menuEl = document.getElementById('bazarHistoryMonthMenu');
    if (!valueEl || !menuEl) return;

    const createdDate = this.createdDate || new Date(2026, 0, 1);
    const startYear = createdDate.getFullYear();
    const currentYear = new Date().getFullYear();

    let startMonth = 1;
    let endMonth = 12;

    // If selected year is creation year, restrict starting month
    if (this.selectedYear === startYear) {
      startMonth = createdDate.getMonth() + 1;
    }
    // If selected year is current year, restrict ending month to current month
    if (this.selectedYear === currentYear) {
      endMonth = new Date().getMonth() + 1;
    }

    // Clamp selectedMonth within valid range
    if (this.selectedMonth < startMonth) this.selectedMonth = startMonth;
    if (this.selectedMonth > endMonth) this.selectedMonth = endMonth;

    let html = '';
    for (let m = startMonth; m <= endMonth; m++) {
      const sel = m === this.selectedMonth ? 'selected' : '';
      html += `<div class="custom-dropdown-item ${sel}" data-value="${m}"
                    onclick="Messliner.bazarHistory.selectMonth(${m})">${this.monthNames[m - 1]}</div>`;
    }
    menuEl.innerHTML = html;
    valueEl.textContent = this.monthNames[this.selectedMonth - 1];
  },

  selectMonth(month) {
    this.selectedMonth = parseInt(month, 10);
    this._lastRenderedHtml = null;
    const dd = document.getElementById('bazarHistoryMonthDropdown');
    if (dd) dd.classList.remove('active');
    this.populateMonthDropdown();
    this.renderMonthData();
  },

  /**
   * Render the selected month's bazar data from in-memory cache
   */
  renderMonthData() {
    const listEl = document.getElementById('bazarHistoryList');
    const totalEl = document.getElementById('bazarMonthTotal');
    const summaryEl = document.getElementById('bazarMonthlySummary');
    if (!listEl) return;

    if (!this.diningId && window.Messliner && Messliner.state) {
      this.diningId = Messliner.state.diningId;
    }

    // Only show skeleton loader if we have zero cached data (initial fetch before snapshot returns)
    if (this.rawBazarData === null) {
      listEl.innerHTML = `
        <div class="bazar-skeleton">
          ${[1, 2, 3].map(() => `
            <div class="bazar-skeleton-card">
              <div class="bazar-skeleton-line wide"></div>
              <div class="bazar-skeleton-line narrow"></div>
            </div>
          `).join('')}
        </div>`;
      return;
    }

    const formattedMonth = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const allBazar = this.rawBazarData || {};

    // Filter entries for selected month and group by date
    const grouped = {}; // { "2026-07-05": [ {...}, {...} ] }

    Object.entries(allBazar).forEach(([key, entry]) => {
      if (!entry) return;
      let entryDate = entry.date;
      if (!entryDate && entry.timestamp) {
        entryDate = new Date(entry.timestamp).toISOString().slice(0, 10);
      }
      if (!entryDate || !entryDate.startsWith(formattedMonth)) return;
      if (!grouped[entryDate]) grouped[entryDate] = [];
      grouped[entryDate].push({ key, ...entry, date: entryDate });
    });

    // Sort dates descending
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    // Compute monthly total
    let monthTotal = 0;
    Object.values(grouped).forEach(entries => {
      entries.forEach(e => { monthTotal += parseFloat(e.amount) || 0; });
    });

    // Update summary banner
    if (summaryEl) summaryEl.style.display = sortedDates.length > 0 ? 'flex' : 'none';
    if (totalEl) totalEl.textContent = Utils.currency(monthTotal);

    // Update month label in summary
    const monthLabelEl = document.getElementById('bazarMonthLabel');
    if (monthLabelEl) monthLabelEl.textContent = `${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}`;

    // Render
    if (sortedDates.length === 0) {
      const emptyHtml = `
        <div class="bazar-empty-state">
          <div class="bazar-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          </div>
          <h3>No Bazar Records</h3>
          <p>No bazar expenses found for <strong>${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}</strong>.</p>
        </div>`;
      if (this._lastRenderedHtml !== emptyHtml) {
        this._lastRenderedHtml = emptyHtml;
        listEl.innerHTML = emptyHtml;
      }
      return;
    }

    const html = sortedDates.map(date => this._buildDayCard(date, grouped[date])).join('');

    if (this._lastRenderedHtml === html && listEl.children.length > 0 && !listEl.querySelector('.bazar-skeleton')) {
      return;
    }

    this._lastRenderedHtml = html;
    listEl.innerHTML = html;
  },

  /**
   * Backward-compatible loadMonthData method
   */
  async loadMonthData() {
    this.renderMonthData();
  },

  /**
   * Build the HTML for a single day accordion card
   */
  _buildDayCard(date, entries) {
    const dayTotal = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Collect unique shoppers (show N/A if none recorded)
    const shoppers = [...new Set(entries.map(e => e.shopperName).filter(s => s && s !== 'N/A'))];
    const shopperLabel = shoppers.length > 0 ? shoppers.join(', ') : 'N/A';

    // Combine all items from all entries into one preview string
    const allItemsText = entries.map(e => (e.items || '').replace(/\r?\n/g, ', ')).filter(Boolean).join(', ');
    const shortPreview = allItemsText.length > 42 ? allItemsText.slice(0, 42) + '…' : allItemsText;

    const dateObj = new Date(date + 'T00:00:00');
    const dayNum = String(dateObj.getDate()).padStart(2, '0');
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const formattedDate = Utils.formatDate(date);

    // Build detail item rows for the expanded panel
    const itemRows = entries.map((e, idx) => `
      <div class="bazar-item-row">
        <div class="bazar-item-index">${idx + 1}</div>
        <div class="bazar-item-info">
          <div class="bazar-item-name">${Utils.formatBazarItems(e.items)}</div>
          <div class="bazar-item-shopper">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            ${e.shopperName || 'N/A'}
          </div>
        </div>
        <div class="bazar-item-amount">${Utils.currency(parseFloat(e.amount) || 0)}</div>
      </div>
    `).join('');

    const cardId = `bazar-card-${date.replace(/-/g, '')}`;
    const isExpanded = this.expandedCard === date;

    return `
      <div class="bazar-day-card ${isExpanded ? 'expanded' : ''}" id="${cardId}">

        <!-- Clickable header row -->
        <div class="bazar-day-card-header" onclick="Messliner.bazarHistory.toggleCard('${date}', '${cardId}')">

          <!-- Date badge -->
          <div class="bazar-date-badge">${dayNum}</div>

          <!-- Middle: date text + shopper + items -->
          <div class="bazar-card-info">
            <div class="bazar-card-top-row">
              <span class="bazar-card-weekday">${dayOfWeek}</span>
              <span class="bazar-card-fulldate">${formattedDate}</span>
            </div>
            <div class="bazar-card-shopper">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>${shopperLabel}</span>
            </div>
            <div class="bazar-card-preview">${shortPreview || '—'}</div>
          </div>

          <!-- Right: amount + entries + chevron (pushed to far right) -->
          <div class="bazar-card-right">
            <div class="bazar-card-amount">${Utils.currency(dayTotal)}</div>
            <div class="bazar-card-entries">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</div>
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
            ${itemRows}
            <div class="bazar-items-total-row">
              <span>Day Total</span>
              <span>${Utils.currency(dayTotal)}</span>
            </div>
          </div>
        </div>

      </div>
    `;
  },

  /**
   * Toggle accordion card expand/collapse
   */
  toggleCard(date, cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const isCurrentlyExpanded = this.expandedCard === date;
    this._lastRenderedHtml = null;

    // Collapse all cards first
    document.querySelectorAll('.bazar-day-card.expanded').forEach(c => {
      c.classList.remove('expanded');
    });

    if (isCurrentlyExpanded) {
      // Was open — now closed
      this.expandedCard = null;
    } else {
      // Open this one
      card.classList.add('expanded');
      this.expandedCard = date;
    }
  },

  /**
   * Refresh — called by router when navigating to bazar page
   */
  refresh() {
    if (!this.diningId && window.Messliner && Messliner.state) {
      this.diningId = Messliner.state.diningId;
    }
    this.populateYearDropdown();
    this.populateMonthDropdown();
    this.setupRealtimeListener();
    this.renderMonthData();
  }
};

window.BazarHistoryModule = BazarHistoryModule;
if (typeof Messliner !== 'undefined') {
  Messliner.bazarHistory = BazarHistoryModule;
}
console.log('[Messliner] BazarHistory module loaded');
