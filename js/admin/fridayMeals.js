/* ============================================
   Messliner — Friday Meal Admin Module (admin/fridayMeals.js)
   Completely isolated from normal meal calculations.
   ============================================ */

const FridayMealsModule = {
  diningId: null,
  selectedFridayIndex: 0,   // 0 = 1st Friday, 1 = 2nd Friday, etc.
  selectedYear: null,
  selectedMonth: null,      // 1-12
  fridayMealsData: {},      // { weekKey: { userId: count } }
  fridayMealsMetaData: {},  // { weekKey: { completed, mealType, mealTypes, completedAt, completedBy, totalMeals } }
  fridayBazarData: {},      // { weekKey: { amount, note, date, deducted } }
  selectedAutoMealTypes: new Set(['lunch']), // Set containing 'lunch', 'dinner', or both
  selectedFridayUsers: new Set(),

  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],

  /* ─────────────────────────────
     Helper: Get up to 4 Friday dates in a given year/month
  ───────────────────────────── */
  getFridayDates(year, month) {
    const dates = [];
    const d = new Date(year, month - 1, 1);
    // Advance to first Friday
    while (d.getDay() !== 5) { d.setDate(d.getDate() + 1); }
    while (d.getMonth() === month - 1 && dates.length < 4) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      dates.push(`${year}-${mm}-${dd}`);
      d.setDate(d.getDate() + 7);
    }
    return dates;
  },

  /* ─────────────────────────────
     Helper: weekKey from index e.g. "w1" "w2"
  ───────────────────────────── */
  weekKey(index) { return `w${index + 1}`; },

  /* ─────────────────────────────
     Helper: current monthKey e.g. "2026-08"
  ───────────────────────────── */
  monthKey() {
    return `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
  },

  /* ─────────────────────────────
     Init
  ───────────────────────────── */
  init(diningId) {
    this.diningId = diningId;
    const now = new Date();
    this.selectedYear = now.getFullYear();
    this.selectedMonth = now.getMonth() + 1;

    // Default to the closest upcoming or most recent Friday
    const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
    const todayStr = Utils.today();
    let defaultIdx = fridayDates.length - 1;
    for (let i = 0; i < fridayDates.length; i++) {
      if (fridayDates[i] >= todayStr) { defaultIdx = i; break; }
    }
    this.selectedFridayIndex = defaultIdx;

    this._listenFridayData();
  },

  /* ─────────────────────────────
     Firebase realtime listeners
  ───────────────────────────── */
  _listenFridayData() {
    const mk = this.monthKey();

    // Clean up old listeners
    if (this._fridayMealsRef) this._fridayMealsRef.off();
    if (this._fridayMealsMetaRef) this._fridayMealsMetaRef.off();
    if (this._fridayBazarRef) this._fridayBazarRef.off();

    this._fridayMealsRef = db.ref(`dinings/${this.diningId}/fridayMeals/${mk}`);
    this._fridayMealsRef.on('value', (snap) => {
      this.fridayMealsData = snap.val() || {};
      if (typeof Router !== 'undefined' && Router.currentPage === 'meals') {
        this.renderFridaySelector();
        this.renderFridayAutoCompleteSection();
        this.renderFridayMemberGrid();
        this.renderFridayMealLog();
      }
    });

    this._fridayMealsMetaRef = db.ref(`dinings/${this.diningId}/fridayMealsMeta/${mk}`);
    this._fridayMealsMetaRef.on('value', (snap) => {
      this.fridayMealsMetaData = snap.val() || {};
      const wk = this.weekKey(this.selectedFridayIndex);
      const meta = this.fridayMealsMetaData[wk];
      if (meta && meta.mealTypes && Array.isArray(meta.mealTypes) && meta.mealTypes.length > 0) {
        this.selectedAutoMealTypes = new Set(meta.mealTypes);
      } else if (meta && meta.mealType && meta.mealType !== 'zero') {
        if (meta.mealType === 'both' || meta.mealType.includes('+')) this.selectedAutoMealTypes = new Set(['lunch', 'dinner']);
        else if (meta.mealType === 'dinner') this.selectedAutoMealTypes = new Set(['dinner']);
        else this.selectedAutoMealTypes = new Set(['lunch']);
      }
      if (typeof Router !== 'undefined' && Router.currentPage === 'meals') {
        this.renderFridayAutoCompleteSection();
      }
    });

    this._fridayBazarRef = db.ref(`dinings/${this.diningId}/fridayBazar/${mk}`);
    this._fridayBazarRef.on('value', (snap) => {
      this.fridayBazarData = snap.val() || {};
      if (typeof Router !== 'undefined' && Router.currentPage === 'meals') {
        this.renderFridaySelector();
        this.renderFridayAutoCompleteSection();
        this.renderFridayBazarStatus();
      }
    });
  },

  /* ─────────────────────────────
     Refresh when admin opens meals page
  ───────────────────────────── */
  refresh() {
    this.renderFridaySelector();
    this.renderFridayAutoCompleteSection();
    this.renderFridayMemberGrid();
    this.renderFridayMealLog();
    this.renderFridayBazarStatus();
  },

  /* ─────────────────────────────
     Render Friday week selector dropdown
  ───────────────────────────── */
  renderFridaySelector() {
    const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
    const valueEl = document.getElementById('fridayWeekValue');
    const menuEl = document.getElementById('fridayWeekMenu');
    const monthLabel = document.getElementById('fridayMonthLabel');
    if (!valueEl || !menuEl) return;

    if (monthLabel) {
      monthLabel.textContent = `${this.monthNames[this.selectedMonth - 1]} ${this.selectedYear}`;
    }

    if (fridayDates.length === 0) {
      valueEl.textContent = 'No Fridays';
      menuEl.innerHTML = '<div class="custom-dropdown-item" style="color:var(--text-tertiary)">No Fridays this month</div>';
      return;
    }

    const ordinals = ['1st', '2nd', '3rd', '4th'];
    menuEl.innerHTML = fridayDates.map((dateStr, idx) => {
      const d = new Date(dateStr + 'T00:00:00');
      const label = `${ordinals[idx]} Friday (${d.getDate()} ${this.monthNames[d.getMonth()].slice(0, 3)})`;
      const isSelected = idx === this.selectedFridayIndex;
      const wk = this.weekKey(idx);
      const hasMeals = !!(this.fridayMealsData[wk] && Object.keys(this.fridayMealsData[wk]).length > 0);
      const hasBazar = !!(this.fridayBazarData[wk] && this.fridayBazarData[wk].amount > 0);
      const dots = (hasMeals ? '<span class="friday-dot meal-dot" title="Meals saved"></span>' : '') +
        (hasBazar ? '<span class="friday-dot bazar-dot" title="Bazar added"></span>' : '');
      return `
        <div class="custom-dropdown-item ${isSelected ? 'selected' : ''}"
             onclick="Messliner.fridayMeals.selectFriday(${idx}); event.stopPropagation(); document.getElementById('fridayWeekDropdown').classList.remove('active');">
          <span>${label}</span>
          <span style="display:flex;align-items:center;gap:4px;">${dots}</span>
        </div>
      `;
    }).join('');

    const selectedDate = fridayDates[this.selectedFridayIndex] || '';
    if (selectedDate) {
      const d = new Date(selectedDate + 'T00:00:00');
      valueEl.textContent = `${ordinals[this.selectedFridayIndex]} Friday · ${d.getDate()} ${this.monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    } else {
      valueEl.textContent = 'Select Friday';
    }
  },

  /* ─────────────────────────────
     Navigate month
  ───────────────────────────── */
  prevMonth() {
    this.selectedMonth--;
    if (this.selectedMonth < 1) { this.selectedMonth = 12; this.selectedYear--; }
    this.selectedFridayIndex = 0;
    this._listenFridayData();
    this.renderFridaySelector();
    this.renderFridayAutoCompleteSection();
    this.renderFridayMemberGrid();
    this.renderFridayMealLog();
    this.renderFridayBazarStatus();
  },

  nextMonth() {
    this.selectedMonth++;
    if (this.selectedMonth > 12) { this.selectedMonth = 1; this.selectedYear++; }
    this.selectedFridayIndex = 0;
    this._listenFridayData();
    this.renderFridaySelector();
    this.renderFridayAutoCompleteSection();
    this.renderFridayMemberGrid();
    this.renderFridayMealLog();
    this.renderFridayBazarStatus();
  },

  selectFriday(index) {
    this.selectedFridayIndex = index;
    const wk = this.weekKey(index);
    const meta = this.fridayMealsMetaData[wk];
    if (meta && meta.mealTypes && Array.isArray(meta.mealTypes) && meta.mealTypes.length > 0) {
      this.selectedAutoMealTypes = new Set(meta.mealTypes);
    } else if (meta && meta.mealType && meta.mealType !== 'zero') {
      if (meta.mealType === 'both' || meta.mealType.includes('+')) this.selectedAutoMealTypes = new Set(['lunch', 'dinner']);
      else if (meta.mealType === 'dinner') this.selectedAutoMealTypes = new Set(['dinner']);
      else this.selectedAutoMealTypes = new Set(['lunch']);
    }
    this.selectedFridayUsers.clear();
    this.renderFridaySelector();
    this.renderFridayAutoCompleteSection();
    this.renderFridayMemberGrid();
    this.renderFridayMealLog();
    this.renderFridayBazarStatus();
  },

  /* ─────────────────────────────
     Render member grid (chip style, same as normal meals)
  ───────────────────────────── */
  renderFridayMemberGrid() {
    const grid = document.getElementById('fridayMealUsersGrid');
    if (!grid) return;

    const wk = this.weekKey(this.selectedFridayIndex);
    const savedCounts = this.fridayMealsData[wk] || {};
    const users = Messliner.users?.users || {};
    const s = Messliner.settings?.getSettings() || {};
    const isManagerMealEnabled = !!s.managerMealEnabled;

    const userEntries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      return true;
    });

    if (userEntries.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <h3>No Active Members</h3>
          <p>Add members to manage Friday meals.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = userEntries.map(([id, user]) => {
      const saved = parseInt(savedCounts[id]) || 0;
      const selected = this.selectedFridayUsers.has(id);
      const spinnerVal = saved > 0 ? saved : (selected ? 1 : 0);
      const avatarBg = Messliner.users?._avatarColor ? Messliner.users._avatarColor(user.name) : '#D1FAE5';

      return `
        <div class="friday-meal-chip ${selected ? 'selected' : ''}" onclick="Messliner.fridayMeals.toggleUser('${id}', this)" data-fuserid="${id}">
          <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
          <span class="friday-chip-name">${user.name}</span>
          <div class="number-spinner" style="margin-left:auto;" onclick="event.stopPropagation()">
            <button type="button" onclick="Messliner.fridayMeals.decrementUser('${id}')">−</button>
            <input type="number" class="friday-user-count" value="${spinnerVal}" min="0" max="10"
                   oninput="Messliner.fridayMeals.handleCountInput('${id}', this)" data-fuid="${id}">
            <button type="button" onclick="Messliner.fridayMeals.incrementUser('${id}')">+</button>
          </div>
        </div>
      `;
    }).join('');

    this._updateFridaySelectedCount();
  },

  toggleUser(userId, chipEl) {
    if (this.selectedFridayUsers.has(userId)) {
      this.selectedFridayUsers.delete(userId);
      chipEl.classList.remove('selected');
      const input = chipEl.querySelector(`[data-fuid="${userId}"]`);
      if (input) {
        const wk = this.weekKey(this.selectedFridayIndex);
        const saved = parseInt((this.fridayMealsData[wk] || {})[userId]) || 0;
        input.value = saved;
      }
    } else {
      this.selectedFridayUsers.add(userId);
      chipEl.classList.add('selected');
    }
    this._updateFridaySelectedCount();
  },

  decrementUser(userId) {
    const input = document.querySelector(`[data-fuid="${userId}"]`);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    if (val > 0) { input.value = val - 1; this.handleCountInput(userId, input); }
  },

  incrementUser(userId) {
    const input = document.querySelector(`[data-fuid="${userId}"]`);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    if (val < 10) { input.value = val + 1; this.handleCountInput(userId, input); }
  },

  handleCountInput(userId, inputEl) {
    let val = parseInt(inputEl.value);
    if (isNaN(val) || val < 0) { val = 0; inputEl.value = 0; }
    const chip = inputEl.closest('.friday-meal-chip');
    if (!this.selectedFridayUsers.has(userId)) {
      this.selectedFridayUsers.add(userId);
      if (chip) chip.classList.add('selected');
      this._updateFridaySelectedCount();
    }
  },

  toggleSelectAllFriday(checked) {
    this.selectedFridayUsers.clear();
    const users = Messliner.users?.users || {};
    const s = Messliner.settings?.getSettings() || {};
    const isManagerMealEnabled = !!s.managerMealEnabled;

    if (checked) {
      Object.entries(users).forEach(([id, u]) => {
        if (u.role === 'admin' && !isManagerMealEnabled) return;
        this.selectedFridayUsers.add(id);
      });
    }

    const wk = this.weekKey(this.selectedFridayIndex);
    document.querySelectorAll('.friday-meal-chip').forEach(chip => {
      const uid = chip.dataset.fuserid;
      chip.classList.toggle('selected', checked);
      const input = chip.querySelector('.friday-user-count');
      if (input) {
        if (checked) {
          const saved = parseInt((this.fridayMealsData[wk] || {})[uid]) || 0;
          if (parseInt(input.value) === 0) input.value = saved > 0 ? saved : 1;
        } else {
          const saved = parseInt((this.fridayMealsData[wk] || {})[uid]) || 0;
          input.value = saved;
        }
      }
    });
    this._updateFridaySelectedCount();
  },

  _updateFridaySelectedCount() {
    const badge = document.getElementById('fridaySelectedCount');
    if (badge) {
      const count = this.selectedFridayUsers.size;
      badge.textContent = `${count} selected`;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  },

  /* ─────────────────────────────
     Save Friday Meals to Firebase
  ───────────────────────────── */
  async saveFridayMeals() {
    if (this.selectedFridayUsers.size === 0) {
      Notifications.toast('warning', 'No Members Selected', 'Please select at least one member for Friday meal.');
      return;
    }

    const btn = document.getElementById('saveFridayMealsBtn');
    if (btn) btn.disabled = true;

    try {
      const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
      const fridayDate = fridayDates[this.selectedFridayIndex];
      if (!fridayDate) throw new Error('Invalid Friday date');

      const mk = this.monthKey();
      const wk = this.weekKey(this.selectedFridayIndex);
      const updates = {};

      this.selectedFridayUsers.forEach(userId => {
        const input = document.querySelector(`[data-fuid="${userId}"]`);
        let count = input ? (parseInt(input.value) || 0) : 1;
        updates[`dinings/${this.diningId}/fridayMeals/${mk}/${wk}/${userId}`] = count;
      });

      await db.ref().update(updates);

      const ordinals = ['1st', '2nd', '3rd', '4th'];
      const label = `${ordinals[this.selectedFridayIndex]} Friday (${fridayDate})`;
      Notifications.toast('success', 'Friday Meals Saved', `Meals saved for ${label}.`);
      await Notifications.log(this.diningId, 'friday_meal_saved',
        `Friday meals saved for ${label}`, Messliner.state.userId);

      // Update Friday meal label on user dashboard
      if (window.FridayMealPageModule && FridayMealPageModule._updateUserDashboardLabel) {
        FridayMealPageModule._updateUserDashboardLabel();
      }

      this.selectedFridayUsers.clear();
      this.renderFridayMemberGrid();
      this.renderFridayMealLog();
      this.renderFridaySelector();
      this.renderFridayAutoCompleteSection();

    } catch (err) {
      console.error('[FridayMeals] Save error:', err);
      Notifications.toast('error', 'Error', 'Failed to save Friday meals.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ─────────────────────────────
     Render Friday Meal Log (table)
  ───────────────────────────── */
  renderFridayMealLog() {
    const container = document.getElementById('fridayMealLogTable');
    if (!container) return;

    const wk = this.weekKey(this.selectedFridayIndex);
    const mealCounts = this.fridayMealsData[wk] || {};
    const users = Messliner.users?.users || {};
    const entries = Object.entries(mealCounts).filter(([uid, cnt]) => parseInt(cnt) > 0);

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-5);">
          <p style="color:var(--text-tertiary);">No Friday meals saved yet for this Friday.</p>
        </div>
      `;
      return;
    }

    let totalMeals = 0;
    const rows = entries.map(([uid, cnt]) => {
      const user = users[uid] || { name: uid };
      const count = parseInt(cnt) || 0;
      totalMeals += count;
      const avatarBg = Messliner.users?._avatarColor ? Messliner.users._avatarColor(user.name) : '#D1FAE5';
      return `
        <tr>
          <td style="text-align:left;">
            <div class="flex items-center gap-2">
              <div class="avatar avatar-sm">${Utils.initials(user.name)}</div>
              <span class="member-name-text">${user.name}</span>
            </div>
          </td>
          <td style="text-align:center;"><span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${count}</span></td>
        </tr>
      `;
    }).join('');

    // Check if bazar deducted
    const bazarEntry = this.fridayBazarData[wk];
    const isDeducted = bazarEntry && bazarEntry.deducted;
    const perMeal = (bazarEntry && bazarEntry.amount && totalMeals > 0)
      ? (bazarEntry.amount / totalMeals).toFixed(2) : null;

    container.innerHTML = `
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="text-align:left;">Member</th>
              <th style="text-align:center;">Friday Meals</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="font-weight:700;background:var(--gray-50);border-top:2px solid var(--border-color);">
              <td style="text-align:left;padding:var(--space-3) var(--space-4);">Total Meals</td>
              <td style="text-align:center;padding:var(--space-3) var(--space-4);">
                <span class="badge" style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;">${totalMeals}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${perMeal ? `
      <div style="padding:10px 16px;font-size:var(--font-xs);color:var(--text-secondary);background:rgba(124,58,237,0.04);border-top:1px solid rgba(124,58,237,0.1);">
        🛒 Friday Bazar: <strong>${Utils.currency(bazarEntry.amount)}</strong> ÷ ${totalMeals} meals
        = <strong>${Utils.currency(parseFloat(perMeal))}</strong>/meal
        ${isDeducted ? '<span style="color:#059669;font-weight:700;margin-left:8px;">✓ Deducted</span>' : '<span style="color:#DC2626;font-weight:700;margin-left:8px;">⚠ Not yet deducted</span>'}
      </div>` : ''}
    `;
  },

  /* ─────────────────────────────
     Render Friday Bazar status badge
  ───────────────────────────── */
  renderFridayBazarStatus() {
    const wk = this.weekKey(this.selectedFridayIndex);
    const bazarEntry = this.fridayBazarData[wk];
    const statusEl = document.getElementById('fridayBazarStatus');
    const amountInput = document.getElementById('fridayBazarAmountInput');
    const noteInput = document.getElementById('fridayBazarNoteInput');
    const shopperInput = document.getElementById('fridayBazarShopperInput');
    const itemsInput = document.getElementById('fridayBazarItemsInput');
    const addBtn = document.getElementById('addFridayBazarBtn');

    if (!statusEl) return;

    if (bazarEntry && bazarEntry.amount > 0) {
      statusEl.innerHTML = `
        <div class="friday-bazar-saved-badge" style="flex-wrap: wrap; gap: 6px; line-height: 1.4; padding: 10px 14px; border-radius: 10px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Bazar: <strong>${Utils.currency(bazarEntry.amount)}</strong></span>
          ${bazarEntry.shopperName && bazarEntry.shopperName !== 'N/A' ? `<span style="color:var(--text-secondary)">· Shopper: <strong>${bazarEntry.shopperName}</strong></span>` : ''}
          ${bazarEntry.note ? `<span style="color:var(--text-tertiary)">· Note: ${bazarEntry.note}</span>` : ''}
          ${bazarEntry.deducted
          ? '<span style="color:#059669;font-weight:700;">· Deducted ✓</span>'
          : '<span style="color:#DC2626;font-weight:600;">· Pending deduction</span>'}
          ${!bazarEntry.deducted ? `
            <button onclick="Messliner.fridayMeals.deductFridayBazar()" class="btn btn-sm"
              style="background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer;">
              Deduct Now
            </button>` : ''}
          ${bazarEntry.items ? `<div style="width: 100%; border-top: 1px dashed rgba(124,58,237,0.15); margin-top: 6px; padding-top: 6px; font-weight: normal; font-size: 11px;">📝 <strong>Items:</strong> ${Utils.formatBazarItems(bazarEntry.items)}</div>` : ''}
        </div>
      `;
      if (amountInput) amountInput.value = bazarEntry.amount;
      if (noteInput) noteInput.value = bazarEntry.note || '';
      if (shopperInput) shopperInput.value = bazarEntry.shopperName && bazarEntry.shopperName !== 'N/A' ? bazarEntry.shopperName : '';
      if (itemsInput) itemsInput.value = bazarEntry.items || '';
      if (addBtn) {
        addBtn.textContent = bazarEntry.deducted ? 'Update Bazar' : 'Update & Deduct';
        addBtn.style.background = bazarEntry.deducted
          ? 'linear-gradient(135deg,#6B7280,#4B5563)'
          : 'linear-gradient(135deg,#7C3AED,#5B21B6)';
      }
    } else {
      statusEl.innerHTML = '<span style="color:var(--text-tertiary);font-size:var(--font-xs);">No Friday bazar added yet for this Friday.</span>';
      if (amountInput) amountInput.value = '';
      if (noteInput) noteInput.value = '';
      if (shopperInput) shopperInput.value = '';
      if (itemsInput) itemsInput.value = '';
      if (addBtn) {
        addBtn.textContent = 'Save & Deduct';
        addBtn.style.background = 'linear-gradient(135deg,#7C3AED,#5B21B6)';
      }
    }

    this.renderFridayMealLog(); // also refresh log so deduction status updates
  },

  /* ─────────────────────────────
     Save Friday Bazar + auto-deduct
  ───────────────────────────── */
  async saveFridayBazar() {
    const amountRaw = parseFloat(document.getElementById('fridayBazarAmountInput')?.value);
    const note = document.getElementById('fridayBazarNoteInput')?.value.trim() || '';
    const shopper = document.getElementById('fridayBazarShopperInput')?.value.trim() || 'N/A';
    const items = document.getElementById('fridayBazarItemsInput')?.value.trim() || '';

    if (isNaN(amountRaw) || amountRaw <= 0) {
      Notifications.toast('warning', 'Invalid Amount', 'Please enter a valid bazar amount.');
      return;
    }

    if (!items) {
      Notifications.toast('warning', 'Invalid Input', 'Please enter the Friday bazar items/list.');
      return;
    }

    const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
    const fridayDate = fridayDates[this.selectedFridayIndex];
    if (!fridayDate) {
      Notifications.toast('error', 'Error', 'Invalid Friday selected.');
      return;
    }

    const mk = this.monthKey();
    const wk = this.weekKey(this.selectedFridayIndex);

    // Check if meals exist for this Friday
    const mealCounts = this.fridayMealsData[wk] || {};
    const totalMeals = Object.values(mealCounts).reduce((sum, c) => sum + (parseInt(c) || 0), 0);
    if (totalMeals === 0) {
      Notifications.toast('warning', 'No Meals', 'Please save Friday meals first before adding bazar.');
      return;
    }

    const btn = document.getElementById('addFridayBazarBtn');
    if (btn) btn.disabled = true;

    try {
      // Save bazar entry
      await db.ref(`dinings/${this.diningId}/fridayBazar/${mk}/${wk}`).set({
        amount: amountRaw,
        note: note,
        shopperName: shopper,
        items: items,
        date: fridayDate,
        addedBy: Messliner.state.userId,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        deducted: false
      });

      // Auto-deduct
      await this._applyFridayDeductions(mk, wk, amountRaw, fridayDate, note, shopper, items);

    } catch (err) {
      console.error('[FridayMeals] Save bazar error:', err);
      Notifications.toast('error', 'Error', 'Failed to save Friday bazar.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ─────────────────────────────
     Deduct Friday Bazar from user balances
  ───────────────────────────── */
  async deductFridayBazar() {
    const mk = this.monthKey();
    const wk = this.weekKey(this.selectedFridayIndex);
    const bazarEntry = this.fridayBazarData[wk];
    if (!bazarEntry || !bazarEntry.amount) {
      Notifications.toast('warning', 'No Bazar', 'No Friday bazar found for this Friday.');
      return;
    }
    if (bazarEntry.deducted) {
      Notifications.toast('info', 'Already Deducted', 'Friday bazar already deducted for this Friday.');
      return;
    }

    const btn = document.getElementById('addFridayBazarBtn');
    if (btn) btn.disabled = true;

    try {
      await this._applyFridayDeductions(
        mk,
        wk,
        bazarEntry.amount,
        bazarEntry.date,
        bazarEntry.note || '',
        bazarEntry.shopperName || 'N/A',
        bazarEntry.items || ''
      );
    } catch (err) {
      console.error('[FridayMeals] Deduct error:', err);
      Notifications.toast('error', 'Error', 'Failed to apply Friday deductions.');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ─────────────────────────────
     Internal: Apply per-user deductions
  ───────────────────────────── */
  async _applyFridayDeductions(mk, wk, bazarAmount, fridayDate, note, shopperName = 'N/A', items = '') {
    const mealCounts = (this.fridayMealsData[wk] || {});
    const users = Messliner.users?.users || {};
    const totalMeals = Object.values(mealCounts).reduce((sum, c) => sum + (parseInt(c) || 0), 0);

    if (totalMeals === 0) {
      Notifications.toast('warning', 'No Meals', 'Cannot deduct: no Friday meals recorded for this Friday.');
      return;
    }

    const perMealCost = bazarAmount / totalMeals;
    const updates = {};
    const summaryUsers = {};
    const ordinals = ['1st', '2nd', '3rd', '4th'];
    const fridayLabel = ordinals[parseInt(wk.slice(1)) - 1] || wk;

    // ─── Compute real user balance (same formula as user dashboard) ───
    // Balance = Deposit - MealCost - OtherCost - Deductions
    // We need: deposits, bazar (for meal rate), meals (for user meal count), settings
    const currentMonth = mk; // e.g. "2026-08"

    const [depositsSnap, bazarSnap, mealsSnap, settingsSnap] = await Promise.all([
      db.ref(`dinings/${this.diningId}/deposits`).once('value'),
      db.ref(`dinings/${this.diningId}/bazar`).once('value'),
      db.ref(`dinings/${this.diningId}/meals/${currentMonth}`).once('value'),
      db.ref(`dinings/${this.diningId}/settings`).once('value')
    ]);

    const allDeposits = depositsSnap.val() || {};
    const allBazars = bazarSnap.val() || {};
    const monthMeals = mealsSnap.val() || {};
    const settings = settingsSnap.val() || {};

    const rateMode = settings.rateMode || 'market';
    const fixedRates = rateMode === 'fixed' ? (settings.fixedRates || { breakfast: 0, lunch: 0, dinner: 0 }) : null;
    const managerMealEnabled = !!settings.managerMealEnabled;

    // Helper: check if a deposit/bazar entry belongs to current month
    const isCurrentMonth = (item) => {
      if (!item) return false;
      if (item.date && typeof item.date === 'string') return item.date.startsWith(currentMonth);
      if (item.timestamp && typeof item.timestamp === 'number') {
        const dt = new Date(item.timestamp);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` === currentMonth;
      }
      return false;
    };

    // 1) Per-user deposit, otherCost, deduction from deposits table (current month only)
    //    IMPORTANT: Skip any friday_meal entries for THIS specific week (wk + mk)
    //    so balanceBefore reflects the state BEFORE this Friday's deduction.
    const uDeposits = {};
    const uOtherCosts = {};
    const uDeductions = {};

    Object.values(allDeposits).forEach(d => {
      if (!d.userId || !isCurrentMonth(d)) return;
      // Skip existing friday_meal entries for the SAME week being processed
      if (d.type === 'friday_meal' && d.weekKey === wk && d.monthKey === mk) return;
      const amt = Math.abs(Utils.num(d.amount));
      if (d.type === 'deposit') {
        uDeposits[d.userId] = (uDeposits[d.userId] || 0) + amt;
      } else if (d.type === 'other_costing') {
        uOtherCosts[d.userId] = (uOtherCosts[d.userId] || 0) + amt;
      } else if (d.type === 'deduction' || d.type === 'friday_meal') {
        uDeductions[d.userId] = (uDeductions[d.userId] || 0) + amt;
      }
    });

    // 2) Total bazar for the month (for meal rate calculation)
    let totalMonthBazar = 0;
    Object.values(allBazars).forEach(b => {
      if (isCurrentMonth(b)) totalMonthBazar += Utils.num(b.amount);
    });

    // 3) Per-user meal counts + total meals for the month (for meal cost)
    let totalMonthMeals = 0;
    const userMealsBreakdown = {};
    const userTotalMeals = {};

    Object.values(monthMeals).forEach(dayData => {
      Object.entries(dayData).forEach(([type, typeData]) => {
        if (typeof typeData === 'object') {
          Object.entries(typeData).forEach(([uId, count]) => {
            const u = users[uId];
            if (u && u.role === 'admin' && !managerMealEnabled) return;
            const c = parseInt(count) || 0;
            totalMonthMeals += c;
            if (!userMealsBreakdown[uId]) userMealsBreakdown[uId] = { breakfast: 0, lunch: 0, dinner: 0 };
            if (userMealsBreakdown[uId][type] !== undefined) userMealsBreakdown[uId][type] += c;
            userTotalMeals[uId] = (userTotalMeals[uId] || 0) + c;
          });
        }
      });
    });

    // 4) Compute meal rate
    let mealRate = 0;
    if (rateMode === 'fixed') {
      const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };
      const activeRates = [];
      if (trackedMeals.breakfast) activeRates.push(fixedRates.breakfast || 0);
      if (trackedMeals.lunch) activeRates.push(fixedRates.lunch || 0);
      if (trackedMeals.dinner) activeRates.push(fixedRates.dinner || 0);
      mealRate = activeRates.length > 0 ? (activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
    } else {
      mealRate = Utils.calcMealRate(totalMonthBazar, totalMonthMeals);
    }

    // 5) Compute real balance per user: Deposit - MealCost - OtherCost - Deductions
    const balances = {};
    const allUserIds = new Set([
      ...Object.keys(uDeposits),
      ...Object.keys(uOtherCosts),
      ...Object.keys(uDeductions),
      ...Object.keys(userTotalMeals),
      ...Object.keys(mealCounts)
    ]);

    allUserIds.forEach(uid => {
      const deposit = uDeposits[uid] || 0;
      const mealCost = Utils.calcMealCost(mealRate, userTotalMeals[uid] || 0, userMealsBreakdown[uid] || null, fixedRates);
      const otherCost = uOtherCosts[uid] || 0;
      const deduction = uDeductions[uid] || 0;
      balances[uid] = deposit - mealCost - otherCost - deduction;
    });

    for (const [userId, cnt] of Object.entries(mealCounts)) {
      const count = parseInt(cnt) || 0;
      if (count <= 0) continue;
      const deductAmt = parseFloat((perMealCost * count).toFixed(2));
      const balanceBefore = balances[userId] || 0;
      const balanceAfter = balanceBefore - deductAmt;

      const user = users[userId];
      const userName = user?.name || 'Unknown';
      const currentDeposit = Utils.num(user?.totalDeposit);
      updates[`dinings/${this.diningId}/users/${userId}/totalDeposit`] = currentDeposit - deductAmt;

      const pushKey = db.ref(`dinings/${this.diningId}/deposits`).push().key;
      updates[`dinings/${this.diningId}/deposits/${pushKey}`] = {
        type: 'friday_meal',
        userId: userId,
        userName: userName,
        amount: deductAmt,
        note: `Friday Meal (${fridayLabel}, ${fridayDate})`,
        date: fridayDate,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        weekKey: wk,
        fridayDate: fridayDate,
        monthKey: mk,
        meals: count
      };

      summaryUsers[userId] = {
        mealCount: count,
        deducted: deductAmt,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter
      };
    }

    // Mark bazar as deducted
    updates[`dinings/${this.diningId}/fridayBazar/${mk}/${wk}/deducted`] = true;
    updates[`dinings/${this.diningId}/fridayBazar/${mk}/${wk}/deductedAt`] = firebase.database.ServerValue.TIMESTAMP;

    // Save summary
    updates[`dinings/${this.diningId}/fridaySummary/${mk}/${wk}`] = {
      date: fridayDate,
      totalBazar: bazarAmount,
      totalMeals: totalMeals,
      perMealCost: parseFloat(perMealCost.toFixed(4)),
      note: note,
      shopperName: shopperName,
      items: items,
      users: summaryUsers
    };

    await db.ref().update(updates);

    await Notifications.log(
      this.diningId,
      'friday_bazar_deducted',
      `Friday bazar ৳${bazarAmount} deducted for ${fridayLabel} (${fridayDate})`,
      Messliner.state.userId
    );

    Notifications.toast('success', 'Friday Bazar Deducted',
      `${Utils.currency(bazarAmount)} deducted from ${Object.keys(summaryUsers).length} members.`);

    this.renderFridayBazarStatus();
  },

  /* ─────────────────────────────
     Get total Friday meals for a user in a given month (for stat label)
  ───────────────────────────── */
  getUserFridayMealCount(userId, year, month) {
    const mk = `${year}-${String(month).padStart(2, '0')}`;
    const monthData = this.fridayMealsData; // current loaded month
    // If it matches loaded month use cached, else it'll be 0 (async load not needed for label)
    if (this.monthKey() !== mk) return 0;
    let total = 0;
    Object.values(monthData).forEach(weekData => {
      if (weekData && weekData[userId]) {
        total += parseInt(weekData[userId]) || 0;
      }
    });
    return total;
  },

  /* ─────────────────────────────
     Preview & Download combined Friday Meal Slip
  ───────────────────────────── */
  async previewFridaySlip() {
    const btn = document.getElementById('btnFridayAutoPreview') || document.getElementById('previewFridaySlipBtn');
    let btnHtmlBackup = '';
    if (btn) {
      btnHtmlBackup = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span>Loading...</span>';
    }

    try {
      const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
      const targetDate = fridayDates[this.selectedFridayIndex];
      if (!targetDate) throw new Error('Invalid Friday date');

      const wk = this.weekKey(this.selectedFridayIndex);
      const savedFridayMeals = this.fridayMealsData[wk] || {};
      const hasSavedMeals = Object.values(savedFridayMeals).some(cnt => parseInt(cnt, 10) > 0);

      const users = Messliner.users?.users || {};
      const s = Messliner.settings?.getSettings() || {};
      const isManagerMealEnabled = !!s.managerMealEnabled;

      const activeTypes = Array.from(this.selectedAutoMealTypes || ['lunch']);
      const meta = this.fridayMealsMetaData[wk] || {};
      const displayTypes = (hasSavedMeals && meta.mealTypes && meta.mealTypes.length > 0)
        ? meta.mealTypes
        : (activeTypes.length > 0 ? activeTypes : ['lunch']);

      const listData = [];
      Object.entries(users).forEach(([userId, user], index) => {
        if (user.role === 'admin' && !isManagerMealEnabled) return;
        if (Messliner.meals && !Messliner.meals.isUserActiveForMonth(userId, targetDate)) return;

        let userCount = 0;
        if (hasSavedMeals) {
          userCount = parseInt(savedFridayMeals[userId], 10) || 0;
        } else {
          userCount = this.getAutoMealCountForUser(user, displayTypes);
        }

        if (userCount > 0) {
          let breakfastCount = 0;
          let lunchCount = 0;
          let dinnerCount = 0;

          if (displayTypes.includes('lunch') && displayTypes.includes('dinner')) {
            const ms = user.mealStatus || { lunch: true, dinner: true };
            lunchCount = (ms.lunch === true || ms.lunch === undefined) ? 1 : (typeof ms.lunch === 'number' ? ms.lunch : 0);
            dinnerCount = (ms.dinner === true || ms.dinner === undefined) ? 1 : (typeof ms.dinner === 'number' ? ms.dinner : 0);
          } else if (displayTypes.includes('dinner')) {
            dinnerCount = userCount;
          } else {
            lunchCount = userCount;
          }

          listData.push({
            id: userId,
            name: user.name || 'Unknown Member',
            role: user.role || 'member',
            avatarColor: Messliner.users?._avatarColor(user.name) || '#ccc',
            initials: Utils.initials(user.name),
            breakfast: breakfastCount,
            lunch: lunchCount,
            dinner: dinnerCount,
            total: userCount,
            createdAt: user.createdAt || user.timestamp || user.joinedAt || 0,
            joinOrder: index
          });
        }
      });

      // Sort: admin/manager first, then join time
      listData.sort((a, b) => {
        const roleA = a.role === 'admin' ? 0 : 1;
        const roleB = b.role === 'admin' ? 0 : 1;
        if (roleA !== roleB) return roleA - roleB;
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        if (timeA && timeB && timeA !== timeB) return timeA - timeB;
        return a.joinOrder - b.joinOrder;
      });

      const grandTotal = listData.reduce((sum, item) => sum + item.total, 0);
      const totalBreakfast = listData.reduce((sum, item) => sum + item.breakfast, 0);
      const totalLunch = listData.reduce((sum, item) => sum + item.lunch, 0);
      const totalDinner = listData.reduce((sum, item) => sum + item.dinner, 0);

      const ordinals = ['1st', '2nd', '3rd', '4th'];
      const fridayTitle = `${ordinals[this.selectedFridayIndex]} Friday (${targetDate})`;

      Messliner.meals._renderSlipModalContent({
        targetDate,
        selectedMeals: ['lunch', 'dinner'],
        listData,
        grandTotal,
        totalBreakfast,
        totalLunch,
        totalDinner,
        emptyMessage: 'No Friday meals found to preview.',
        isSpecialMeal: true
      });

    } catch (err) {
      console.error('[FridayMeals] Error previewing slip:', err);
      Notifications.toast('error', 'Error', 'Failed to generate Friday slip.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btnHtmlBackup;
      }
    }
  },

  /* ─────────────────────────────
     Helper: Calculate flat auto meal count for a single member based on selected types
  ───────────────────────────── */
  getAutoMealCountForUser(user, mealTypes = Array.from(this.selectedAutoMealTypes || ['lunch'])) {
    if (!user) return 0;
    const ms = user.mealStatus || { breakfast: true, lunch: true, dinner: true };
    const s = Messliner.settings?.getSettings() || {};
    const trackedMeals = s.trackedMeals || { breakfast: true, lunch: true, dinner: true };

    let count = 0;
    if (mealTypes.includes('lunch') && trackedMeals.lunch !== false) {
      const val = ms.lunch;
      count += (val === true || val === undefined) ? 1 : (typeof val === 'number' && val > 0 ? val : 0);
    }
    if (mealTypes.includes('dinner') && trackedMeals.dinner !== false) {
      const val = ms.dinner;
      count += (val === true || val === undefined) ? 1 : (typeof val === 'number' && val > 0 ? val : 0);
    }
    return count;
  },

  /* ─────────────────────────────
     Toggle Meal Type for Auto Completion (Lunch / Dinner)
  ───────────────────────────── */
  toggleAutoMealType(type) {
    if (!this.selectedAutoMealTypes) this.selectedAutoMealTypes = new Set(['lunch']);
    if (this.selectedAutoMealTypes.has(type)) {
      this.selectedAutoMealTypes.delete(type);
    } else {
      this.selectedAutoMealTypes.add(type);
    }
    this.renderFridayAutoCompleteSection();
  },

  /* ─────────────────────────────
     Render Auto Complete Friday Meals Section
  ───────────────────────────── */
  renderFridayAutoCompleteSection() {
    const block = document.getElementById('fridayAutoCompleteBlock');
    if (!block) return;

    const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
    const targetDate = fridayDates[this.selectedFridayIndex];
    if (!targetDate) return;

    const ordinals = ['1st', '2nd', '3rd', '4th'];
    const d = new Date(targetDate + 'T00:00:00');
    const dateFormatted = `${d.getDate()} ${this.monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    const ordinalLabel = `${ordinals[this.selectedFridayIndex]} Friday`;

    const targetDateEl = document.getElementById('fridayAutoTargetDate');
    if (targetDateEl) {
      targetDateEl.textContent = `${dateFormatted} (${ordinalLabel})`;
    }

    if (!this.selectedAutoMealTypes) this.selectedAutoMealTypes = new Set(['lunch']);

    // Sync pill buttons UI
    const pills = document.querySelectorAll('#fridayMealTypePills .friday-type-pill');
    pills.forEach(pill => {
      const pType = pill.getAttribute('data-type');
      pill.classList.toggle('active', this.selectedAutoMealTypes.has(pType));
    });

    // Determine active label
    const hasLunch = this.selectedAutoMealTypes.has('lunch');
    const hasDinner = this.selectedAutoMealTypes.has('dinner');
    let activeTypeLabel = 'None Selected';
    if (hasLunch && hasDinner) activeTypeLabel = 'Lunch + Dinner';
    else if (hasLunch) activeTypeLabel = 'Lunch';
    else if (hasDinner) activeTypeLabel = 'Dinner';

    const users = Messliner.users?.users || {};
    const s = Messliner.settings?.getSettings() || {};
    const isManagerMealEnabled = !!s.managerMealEnabled;

    const activeUserEntries = Object.entries(users).filter(([id, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      if (Messliner.meals && !Messliner.meals.isUserActiveForMonth(id, targetDate)) return false;
      return true;
    });

    const memberCountEl = document.getElementById('fridayAutoMemberCount');
    if (memberCountEl) {
      memberCountEl.textContent = `${activeUserEntries.length} Members`;
    }

    // Compute candidate total for selected meal types
    let autoCalculatedTotal = 0;
    activeUserEntries.forEach(([id, user]) => {
      autoCalculatedTotal += this.getAutoMealCountForUser(user, Array.from(this.selectedAutoMealTypes));
    });

    const wk = this.weekKey(this.selectedFridayIndex);
    const savedCounts = this.fridayMealsData[wk] || {};
    const meta = this.fridayMealsMetaData[wk] || {};

    let savedTotal = 0;
    let savedMemberCount = 0;
    Object.values(savedCounts).forEach(cnt => {
      const n = parseInt(cnt, 10) || 0;
      if (n > 0) {
        savedTotal += n;
        savedMemberCount++;
      }
    });

    const hasSavedMeals = Object.keys(savedCounts).length > 0 && savedTotal > 0;
    const isZeroCompleted = meta.completed && meta.mealType === 'zero';
    const isCompleted = hasSavedMeals || isZeroCompleted;

    const savedMealTypeLabel = meta.mealType ? meta.mealType : activeTypeLabel;

    const calcMealsEl = document.getElementById('fridayAutoCalculatedMeals');
    if (calcMealsEl) {
      if (isZeroCompleted) {
        calcMealsEl.textContent = '0 Meals (Completed)';
      } else if (hasSavedMeals) {
        calcMealsEl.textContent = `${savedTotal} Meals (Saved: ${savedMealTypeLabel})`;
      } else {
        calcMealsEl.textContent = `${autoCalculatedTotal} Meals (${activeTypeLabel})`;
      }
    }

    const badgeEl = document.getElementById('fridayAutoCompleteStatusBadge');
    if (badgeEl) {
      if (isZeroCompleted) {
        badgeEl.innerHTML = `
          <span class="badge" style="background:rgba(107, 114, 128, 0.12); color:#4B5563; border:1px solid rgba(107, 114, 128, 0.35); font-weight:700; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Completed (0 Meals)
          </span>
        `;
      } else if (hasSavedMeals) {
        badgeEl.innerHTML = `
          <span class="badge" style="background:rgba(16, 185, 129, 0.12); color:#059669; border:1px solid rgba(16, 185, 129, 0.35); font-weight:700; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Completed (${savedMealTypeLabel} - ${savedTotal} Meals)
          </span>
        `;
      } else {
        badgeEl.innerHTML = `
          <span class="badge" style="background:rgba(245, 158, 11, 0.12); color:#D97706; border:1px solid rgba(245, 158, 11, 0.35); font-weight:700; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
            ⚡ Ready to Complete (${activeTypeLabel}: ${autoCalculatedTotal} Meals)
          </span>
        `;
      }
    }

    const btnText = document.getElementById('btnFridayAutoCompleteText');
    if (btnText) {
      const actionLabel = this.selectedAutoMealTypes.size > 0 ? `Friday ${activeTypeLabel}` : 'Friday Meals';
      if (isCompleted) {
        btnText.textContent = `Re-Complete ${actionLabel}`;
      } else {
        btnText.textContent = `Auto Complete ${actionLabel}`;
      }
    }
  },

  /* ─────────────────────────────
     Auto Complete Friday Meals for Selected Meal Types
  ───────────────────────────── */
  async autoCompleteFridayMeals() {
    if (!this.selectedAutoMealTypes || this.selectedAutoMealTypes.size === 0) {
      Notifications.toast('warning', 'No Meal Selected', 'Please select Lunch, Dinner, or both to auto-complete Friday meals.');
      return;
    }

    const btn = document.getElementById('btnFridayAutoComplete');
    let btnHtmlBackup = '';
    if (btn) {
      btnHtmlBackup = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" style="opacity:0.25; fill:none;"></circle>
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style="opacity:0.75;"></path>
        </svg>
        <span>Auto Completing...</span>
      `;
    }

    try {
      const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
      const targetDate = fridayDates[this.selectedFridayIndex];
      if (!targetDate) throw new Error('Invalid Friday date');

      const mk = this.monthKey();
      const wk = this.weekKey(this.selectedFridayIndex);
      const users = Messliner.users?.users || {};
      const s = Messliner.settings?.getSettings() || {};
      const isManagerMealEnabled = !!s.managerMealEnabled;

      const activeTypes = Array.from(this.selectedAutoMealTypes);
      const hasLunch = this.selectedAutoMealTypes.has('lunch');
      const hasDinner = this.selectedAutoMealTypes.has('dinner');
      let chosenMealLabel = 'Lunch';
      if (hasLunch && hasDinner) chosenMealLabel = 'Lunch + Dinner';
      else if (hasLunch) chosenMealLabel = 'Lunch';
      else if (hasDinner) chosenMealLabel = 'Dinner';

      const updates = {};
      let totalAutoMeals = 0;
      let totalMembersWithMeals = 0;

      Object.entries(users).forEach(([userId, user]) => {
        if (user.role === 'admin' && !isManagerMealEnabled) return;
        if (Messliner.meals && !Messliner.meals.isUserActiveForMonth(userId, targetDate)) return;

        const count = this.getAutoMealCountForUser(user, activeTypes);
        updates[`dinings/${this.diningId}/fridayMeals/${mk}/${wk}/${userId}`] = count;
        if (count > 0) {
          totalAutoMeals += count;
          totalMembersWithMeals++;
        }
      });

      // Save Friday metadata (isolated strictly to fridayMealsMeta)
      updates[`dinings/${this.diningId}/fridayMealsMeta/${mk}/${wk}`] = {
        completed: true,
        mealType: chosenMealLabel,
        mealTypes: activeTypes,
        completedAt: firebase.database.ServerValue.TIMESTAMP,
        completedBy: Messliner.state.userId || 'admin',
        totalMeals: totalAutoMeals,
        memberCount: totalMembersWithMeals,
        targetDate: targetDate
      };

      await db.ref().update(updates);

      const ordinals = ['1st', '2nd', '3rd', '4th'];
      const label = `${ordinals[this.selectedFridayIndex]} Friday (${targetDate})`;
      Notifications.toast('success', 'Friday Meals Completed',
        `Completed ${totalAutoMeals} Friday ${chosenMealLabel} meals for ${totalMembersWithMeals} members on ${label}.`);
      await Notifications.log(this.diningId, 'friday_meal_auto_completed',
        `Friday ${chosenMealLabel} meals auto-completed for ${label} (${totalAutoMeals} meals)`, Messliner.state.userId);

      if (window.FridayMealPageModule && FridayMealPageModule._updateUserDashboardLabel) {
        FridayMealPageModule._updateUserDashboardLabel();
      }

      this.selectedFridayUsers.clear();
      this.renderFridayMemberGrid();
      this.renderFridayMealLog();
      this.renderFridaySelector();
      this.renderFridayAutoCompleteSection();

    } catch (err) {
      console.error('[FridayMeals] Auto Complete error:', err);
      Notifications.toast('error', 'Error', 'Failed to auto complete Friday meals.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = btnHtmlBackup;
      }
    }
  },

  /* ─────────────────────────────
     Show Zero Meal Confirmation Modal for Friday
  ───────────────────────────── */
  showFridayZeroConfirmModal() {
    const modal = document.getElementById('zeroMealConfirmModal');
    if (!modal) {
      this.executeAutoCompleteFridayZeroMeals();
      return;
    }

    const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
    const targetDate = fridayDates[this.selectedFridayIndex];
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
    const ord = ordinals[this.selectedFridayIndex] || `${this.selectedFridayIndex + 1}th`;
    const formattedDate = Utils.formatDate ? Utils.formatDate(targetDate) : targetDate;

    const users = Messliner.users?.users || {};
    const s = Messliner.settings?.getSettings() || {};
    const isManagerMealEnabled = !!s.managerMealEnabled;
    const activeMembers = Object.entries(users).filter(([uid, u]) => {
      if (u.role === 'admin' && !isManagerMealEnabled) return false;
      return Messliner.meals && Messliner.meals.isUserActiveForMonth(uid, targetDate);
    });

    const titleEl = document.getElementById('zeroConfirmTitle');
    const subEl = document.getElementById('zeroConfirmSubtitle');
    const warnEl = document.getElementById('zeroConfirmWarningText');
    const dateEl = document.getElementById('zeroConfirmDate');
    const mealsEl = document.getElementById('zeroConfirmMeals');
    const membersEl = document.getElementById('zeroConfirmMembers');
    const confirmBtn = document.getElementById('btnZeroModalConfirmAction');

    if (titleEl) titleEl.textContent = 'Complete 0 Friday Meals?';
    if (subEl) subEl.textContent = 'Please confirm 0 Friday meal completion for this week';
    if (warnEl) warnEl.textContent = 'Friday meals will be completed with 0 count for all members. Auto meal will not re-add meals automatically.';
    if (dateEl) dateEl.textContent = `${ord} Friday`;
    if (mealsEl) mealsEl.textContent = 'Friday Meals';
    if (membersEl) membersEl.textContent = `${activeMembers.length} Members`;

    if (confirmBtn) {
      confirmBtn.onclick = () => Messliner.fridayMeals.executeAutoCompleteFridayZeroMeals();
      const confirmBtnText = document.getElementById('btnZeroModalConfirmActionText');
      if (confirmBtnText) confirmBtnText.textContent = 'Complete 0 Meals';
    }

    if (typeof openModal === 'function') {
      openModal('zeroMealConfirmModal');
    } else {
      modal.classList.add('active');
    }
  },

  /**
   * Trigger from button
   */
  autoCompleteFridayZeroMeals() {
    this.showFridayZeroConfirmModal();
  },

  /* ─────────────────────────────
     Execute Auto Complete Friday with 0 Meals
  ───────────────────────────── */
  async executeAutoCompleteFridayZeroMeals() {
    const modalBtn = document.getElementById('btnZeroModalConfirmAction');
    const mainBtn = document.getElementById('btnFridayAutoZero');
    let modalBtnBackup = '';
    let mainBtnBackup = '';

    if (modalBtn) {
      modalBtnBackup = modalBtn.innerHTML;
      modalBtn.disabled = true;
      modalBtn.innerHTML = `<span>Completing 0...</span>`;
    }
    if (mainBtn) {
      mainBtnBackup = mainBtn.innerHTML;
      mainBtn.disabled = true;
      mainBtn.textContent = 'Completing 0...';
    }

    try {
      const fridayDates = this.getFridayDates(this.selectedYear, this.selectedMonth);
      const targetDate = fridayDates[this.selectedFridayIndex];
      if (!targetDate) throw new Error('Invalid Friday date');

      const mk = this.monthKey();
      const wk = this.weekKey(this.selectedFridayIndex);
      const users = Messliner.users?.users || {};
      const s = Messliner.settings?.getSettings() || {};
      const isManagerMealEnabled = !!s.managerMealEnabled;

      const updates = {};
      Object.entries(users).forEach(([userId, user]) => {
        if (user.role === 'admin' && !isManagerMealEnabled) return;
        if (Messliner.meals && !Messliner.meals.isUserActiveForMonth(userId, targetDate)) return;
        updates[`dinings/${this.diningId}/fridayMeals/${mk}/${wk}/${userId}`] = 0;
      });

      // Save metadata for 0 completed
      updates[`dinings/${this.diningId}/fridayMealsMeta/${mk}/${wk}`] = {
        completed: true,
        mealType: 'zero',
        mealTypes: [],
        completedAt: firebase.database.ServerValue.TIMESTAMP,
        completedBy: Messliner.state.userId || 'admin',
        totalMeals: 0,
        memberCount: 0,
        targetDate: targetDate
      };

      await db.ref().update(updates);

      const ordinals = ['1st', '2nd', '3rd', '4th'];
      const label = `${ordinals[this.selectedFridayIndex]} Friday (${targetDate})`;
      Notifications.toast('success', 'Completed (0 Meals)', `Friday meals marked as 0 for ${label}.`);
      await Notifications.log(this.diningId, 'friday_meal_zero_completed',
        `Friday meals marked as 0 for ${label}`, Messliner.state.userId);

      // Close modal
      if (typeof closeModal === 'function') {
        closeModal('zeroMealConfirmModal');
      } else if (Messliner.meals && Messliner.meals.closeZeroMealModal) {
        Messliner.meals.closeZeroMealModal();
      }

      this.selectedFridayUsers.clear();
      this.renderFridayMemberGrid();
      this.renderFridayMealLog();
      this.renderFridaySelector();
      this.renderFridayAutoCompleteSection();

    } catch (err) {
      console.error('[FridayMeals] Zero complete error:', err);
      Notifications.toast('error', 'Error', 'Failed to complete 0 Friday meals.');
    } finally {
      if (modalBtn) {
        modalBtn.disabled = false;
        modalBtn.innerHTML = modalBtnBackup;
      }
      if (mainBtn) {
        mainBtn.disabled = false;
        mainBtn.innerHTML = mainBtnBackup;
      }
    }
  },
};

window.FridayMealsModule = FridayMealsModule;
console.log('[Messliner] FridayMealsModule loaded');
