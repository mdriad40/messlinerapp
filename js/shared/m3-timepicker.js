/* ============================================
   Messliner — Material 3 Time Picker Module
   ============================================ */

const M3TimePicker = {
  activeInput: null,
  hour: 7,
  minute: 0,
  ampm: 'AM',
  mode: 'hour', // 'hour' | 'minute'
  inputMode: 'clock', // 'clock' | 'keyboard'
  isDragging: false,
  onSelectCallback: null,

  init() {
    this._injectModalHTML();
    this._bindEvents();
  },

  _injectModalHTML() {
    if (document.getElementById('m3TimePickerOverlay')) return;

    const modalHTML = `
      <div id="m3TimePickerOverlay" class="m3-tp-overlay">
        <div class="m3-tp-dialog" onclick="event.stopPropagation()">
          <div class="m3-tp-header">Select time</div>

          <!-- Time Display Row -->
          <div class="m3-tp-display-row">
            <div id="m3TpHourBox" class="m3-tp-time-box active" onclick="M3TimePicker.setMode('hour')">
              <span id="m3TpHourText">07</span>
            </div>
            <div class="m3-tp-colon">:</div>
            <div id="m3TpMinuteBox" class="m3-tp-time-box" onclick="M3TimePicker.setMode('minute')">
              <span id="m3TpMinuteText">00</span>
            </div>
            <div class="m3-tp-ampm-group">
              <button type="button" id="m3TpAmBtn" class="m3-tp-ampm-btn active" onclick="M3TimePicker.setAmPm('AM')">AM</button>
              <button type="button" id="m3TpPmBtn" class="m3-tp-ampm-btn" onclick="M3TimePicker.setAmPm('PM')">PM</button>
            </div>
          </div>

          <!-- Clock Dial Body -->
          <div id="m3TpDialContainer" class="m3-tp-dial-container">
            <div id="m3TpNumbersLayer" class="m3-tp-numbers-layer"></div>
            <svg id="m3TpClockSvg" class="m3-tp-clock-svg" viewBox="0 0 256 256">
              <line id="m3TpHandLine" x1="128" y1="128" x2="128" y2="32" stroke="#2e6a26" stroke-width="2" />
              <circle cx="128" cy="128" r="4" fill="#2e6a26" />
              <circle id="m3TpHandEnd" cx="128" cy="32" r="24" fill="#2e6a26" />
              <text id="m3TpHandText" x="128" y="128" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="15" font-weight="600">7</text>
            </svg>
          </div>

          <!-- Keyboard Input Body -->
          <div id="m3TpKeyboardContainer" class="m3-tp-keyboard-container" style="display: none;">
            <div class="m3-tp-kb-inputs">
              <input type="number" id="m3TpHourKbInput" min="1" max="12" class="m3-tp-kb-input" value="07">
              <span class="m3-tp-colon">:</span>
              <input type="number" id="m3TpMinKbInput" min="0" max="59" class="m3-tp-kb-input" value="00">
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="m3-tp-footer">
            <button type="button" class="m3-tp-icon-btn" id="m3TpModeToggleBtn" onclick="M3TimePicker.toggleInputMode()" title="Toggle keyboard view">
              <svg id="m3TpKbIcon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-3 0h2v2H5v-2zm0-3h2v2H5V8zm11 10H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 7h-2v-2h2v2zm0-3h-2v-2h2v2z"/>
              </svg>
              <svg id="m3TpClockIcon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none;">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
              </svg>
            </button>

            <div class="m3-tp-action-btns">
              <button type="button" class="m3-tp-btn" onclick="M3TimePicker.close()">Cancel</button>
              <button type="button" class="m3-tp-btn" onclick="M3TimePicker.confirm()">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  },

  _bindEvents() {
    const overlay = document.getElementById('m3TimePickerOverlay');
    const dial = document.getElementById('m3TpDialContainer');

    overlay.addEventListener('click', () => this.close());

    // Drag / Click on clock dial
    const handleStart = (e) => {
      this.isDragging = true;
      this._updateFromEvent(e);
    };

    const handleMove = (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      this._updateFromEvent(e);
    };

    const handleEnd = (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.mode === 'hour') {
          setTimeout(() => this.setMode('minute'), 180);
        }
      }
    };

    dial.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    dial.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    // Keyboard inputs listener
    const hkb = document.getElementById('m3TpHourKbInput');
    const mkb = document.getElementById('m3TpMinKbInput');

    hkb.addEventListener('input', () => {
      let val = parseInt(hkb.value, 10);
      if (!isNaN(val)) {
        val = Math.max(1, Math.min(12, val));
        this.hour = val;
        this._updateUI();
      }
    });

    mkb.addEventListener('input', () => {
      let val = parseInt(mkb.value, 10);
      if (!isNaN(val)) {
        val = Math.max(0, Math.min(59, val));
        this.minute = val;
        this._updateUI();
      }
    });
  },

  _updateFromEvent(e) {
    const dial = document.getElementById('m3TpDialContainer');
    const rect = dial.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - rect.left - 128;
    const dy = clientY - rect.top - 128;
    let rad = Math.atan2(dy, dx);
    let deg = (rad * 180 / Math.PI) + 90;
    if (deg < 0) deg += 360;

    if (this.mode === 'hour') {
      let h = Math.round(deg / 30);
      if (h === 0) h = 12;
      this.hour = h;
    } else {
      let m = Math.round(deg / 6) % 60;
      this.minute = m;
    }
    this._updateUI();
  },

  open(inputOrValue, onSelectCallback) {
    if (!document.getElementById('m3TimePickerOverlay')) this.init();

    if (typeof inputOrValue === 'string') {
      this.activeInput = null;
      this.onSelectCallback = onSelectCallback;
      this._parseTimeString(inputOrValue);
    } else if (inputOrValue && inputOrValue.nodeType === 1) {
      this.activeInput = inputOrValue;
      this.onSelectCallback = onSelectCallback;
      this._parseTimeString(inputOrValue.value || '07:00');
    } else {
      this.activeInput = null;
      this._parseTimeString('07:00');
    }

    this.mode = 'hour';
    this.inputMode = 'clock';
    this._updateUI();

    const overlay = document.getElementById('m3TimePickerOverlay');
    overlay.classList.add('active');
  },

  _parseTimeString(timeStr) {
    if (!timeStr || !timeStr.includes(':')) {
      timeStr = '07:00';
    }
    const parts = timeStr.split(':');
    let h24 = parseInt(parts[0], 10) || 0;
    let m = parseInt(parts[1], 10) || 0;

    this.ampm = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    this.hour = h12;
    this.minute = m;
  },

  getTime24() {
    let h = this.hour % 12;
    if (this.ampm === 'PM') h += 12;
    const hh = String(h).padStart(2, '0');
    const mm = String(this.minute).padStart(2, '0');
    return `${hh}:${mm}`;
  },

  getTime12Formatted() {
    const hh = String(this.hour).padStart(2, '0');
    const mm = String(this.minute).padStart(2, '0');
    return `${hh}:${mm} ${this.ampm}`;
  },

  setMode(mode) {
    this.mode = mode;
    this._updateUI();
  },

  setAmPm(ampm) {
    this.ampm = ampm;
    this._updateUI();
  },

  toggleInputMode() {
    this.inputMode = this.inputMode === 'clock' ? 'keyboard' : 'clock';
    this._updateUI();
  },

  close() {
    const overlay = document.getElementById('m3TimePickerOverlay');
    if (overlay) overlay.classList.remove('active');
  },

  confirm() {
    const time24 = this.getTime24();

    if (this.activeInput) {
      this.activeInput.value = time24;
      // Trigger change event for attached listeners
      const event = new Event('change', { bubbles: true });
      this.activeInput.dispatchEvent(event);

      // If associated display element exists (e.g. inputId_display), update text
      const displayEl = document.getElementById(`${this.activeInput.id}_display`);
      if (displayEl) {
        displayEl.textContent = this.getTime12Formatted();
      }
    }

    if (typeof this.onSelectCallback === 'function') {
      this.onSelectCallback(time24, this.getTime12Formatted());
    }

    this.close();
  },

  _updateUI() {
    // Top boxes
    const hourBox = document.getElementById('m3TpHourBox');
    const minuteBox = document.getElementById('m3TpMinuteBox');
    const hourText = document.getElementById('m3TpHourText');
    const minText = document.getElementById('m3TpMinuteText');
    const amBtn = document.getElementById('m3TpAmBtn');
    const pmBtn = document.getElementById('m3TpPmBtn');

    if (hourText) hourText.textContent = String(this.hour).padStart(2, '0');
    if (minText) minText.textContent = String(this.minute).padStart(2, '0');

    if (hourBox && minuteBox) {
      if (this.mode === 'hour') {
        hourBox.classList.add('active');
        minuteBox.classList.remove('active');
      } else {
        minuteBox.classList.add('active');
        hourBox.classList.remove('active');
      }
    }

    if (amBtn && pmBtn) {
      if (this.ampm === 'AM') {
        amBtn.classList.add('active');
        pmBtn.classList.remove('active');
      } else {
        pmBtn.classList.add('active');
        amBtn.classList.remove('active');
      }
    }

    // Keyboard inputs
    const hkb = document.getElementById('m3TpHourKbInput');
    const mkb = document.getElementById('m3TpMinKbInput');
    if (hkb) hkb.value = String(this.hour).padStart(2, '0');
    if (mkb) mkb.value = String(this.minute).padStart(2, '0');

    // Toggle Dial / Keyboard View
    const dialContainer = document.getElementById('m3TpDialContainer');
    const kbContainer = document.getElementById('m3TpKeyboardContainer');
    const kbIcon = document.getElementById('m3TpKbIcon');
    const clockIcon = document.getElementById('m3TpClockIcon');

    if (this.inputMode === 'clock') {
      if (dialContainer) dialContainer.style.display = 'block';
      if (kbContainer) kbContainer.style.display = 'none';
      if (kbIcon) kbIcon.style.display = 'block';
      if (clockIcon) clockIcon.style.display = 'none';
    } else {
      if (dialContainer) dialContainer.style.display = 'none';
      if (kbContainer) kbContainer.style.display = 'flex';
      if (kbIcon) kbIcon.style.display = 'none';
      if (clockIcon) clockIcon.style.display = 'block';
    }

    // Render Dial Face
    this._renderDialFace();
  },

  _renderDialFace() {
    const numbersLayer = document.getElementById('m3TpNumbersLayer');
    const handLine = document.getElementById('m3TpHandLine');
    const handEnd = document.getElementById('m3TpHandEnd');
    const handText = document.getElementById('m3TpHandText');

    if (!numbersLayer) return;

    numbersLayer.innerHTML = '';
    const cx = 128;
    const cy = 128;
    const radius = 96;

    if (this.mode === 'hour') {
      // 1 to 12
      const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      hours.forEach((h) => {
        const deg = h * 30 - 90;
        const rad = (deg * Math.PI) / 180;
        const nx = cx + radius * Math.cos(rad);
        const ny = cy + radius * Math.sin(rad);

        const el = document.createElement('div');
        el.className = `m3-tp-num ${h === this.hour ? 'selected' : ''}`;
        el.style.left = `${nx - 24}px`;
        el.style.top = `${ny - 24}px`;
        el.textContent = h;
        numbersLayer.appendChild(el);
      });

      // Pointer positioning for selected hour
      const deg = this.hour * 30 - 90;
      const rad = (deg * Math.PI) / 180;
      const ex = cx + radius * Math.cos(rad);
      const ey = cy + radius * Math.sin(rad);

      handLine.setAttribute('x2', ex);
      handLine.setAttribute('y2', ey);
      handEnd.setAttribute('cx', ex);
      handEnd.setAttribute('cy', ey);
      handEnd.setAttribute('r', '24');

      handText.setAttribute('x', ex);
      handText.setAttribute('y', ey);
      handText.textContent = this.hour;
      handText.style.display = 'block';
    } else {
      // Minute mode (00, 05, 10, ..., 55)
      const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
      minutes.forEach((m) => {
        const deg = m * 6 - 90;
        const rad = (deg * Math.PI) / 180;
        const nx = cx + radius * Math.cos(rad);
        const ny = cy + radius * Math.sin(rad);

        const el = document.createElement('div');
        el.className = `m3-tp-num ${m === this.minute ? 'selected' : ''}`;
        el.style.left = `${nx - 24}px`;
        el.style.top = `${ny - 24}px`;
        el.textContent = String(m).padStart(2, '0');
        numbersLayer.appendChild(el);
      });

      // Pointer positioning for selected minute
      const deg = this.minute * 6 - 90;
      const rad = (deg * Math.PI) / 180;
      const ex = cx + radius * Math.cos(rad);
      const ey = cy + radius * Math.sin(rad);

      handLine.setAttribute('x2', ex);
      handLine.setAttribute('y2', ey);
      handEnd.setAttribute('cx', ex);
      handEnd.setAttribute('cy', ey);

      if (this.minute % 5 === 0) {
        handEnd.setAttribute('r', '24');
        handText.setAttribute('x', ex);
        handText.setAttribute('y', ey);
        handText.textContent = String(this.minute).padStart(2, '0');
        handText.style.display = 'block';
      } else {
        handEnd.setAttribute('r', '6');
        handText.style.display = 'none';
      }
    }
  },

  /**
   * Automatically bind all time inputs in document to M3TimePicker
   */
  attachToAllInputs() {
    document.querySelectorAll('input[type="time"], .pro-time-input, .time-input-onboarding').forEach((input) => {
      if (input.dataset.m3Bound) return;
      input.dataset.m3Bound = 'true';

      input.addEventListener('click', (e) => {
        e.preventDefault();
        this.open(input);
      });

      input.addEventListener('focus', (e) => {
        e.preventDefault();
        input.blur();
        this.open(input);
      });
    });
  }
};

// Auto initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  M3TimePicker.init();
  setTimeout(() => M3TimePicker.attachToAllInputs(), 300);
});

// Custom M3 Dropdown Helper Functions
window.toggleM3Dropdown = function(dropdownId) {
  const el = document.getElementById(dropdownId);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.m3-custom-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) {
    el.classList.add('open');
  }
};

window.selectM3RateMode = function(val) {
  const dropdown = document.getElementById('rateModeDropdown');
  if (!dropdown) return;
  
  const display = document.getElementById('rateModeDisplay');
  if (display) {
    display.textContent = val === 'fixed' ? 'Fixed Rate' : 'Market Rate';
  }
  
  dropdown.querySelectorAll('.m3-dropdown-item').forEach(item => {
    if (item.getAttribute('data-value') === val) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  dropdown.classList.remove('open');

  const select = document.getElementById('settingsRateMode');
  if (select) {
    select.value = val;
  }
  if (window.Messliner && window.Messliner.settings && window.Messliner.settings.updateRateMode) {
    window.Messliner.settings.updateRateMode(val);
  }
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.m3-custom-dropdown')) {
    document.querySelectorAll('.m3-custom-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// Setting Info Explanation Modal Handlers
window.showSettingInfoModal = function(type) {
  const modal = document.getElementById('settingInfoModal');
  const title = document.getElementById('settingInfoModalTitle');
  const body = document.getElementById('settingInfoModalBody');
  if (!modal || !title || !body) return;

  if (type === 'managerMeal') {
    title.textContent = 'Manager Meal';
    body.innerHTML = `
      <p style="margin: 0 0 6px 0; font-weight: 700; color: #0F172A; font-size: 0.9rem;">What is Manager Meal?</p>
      <p style="margin: 0; color: #475569; font-size: 0.86rem; line-height: 1.55;">
        Enables manager's personal meal tracking. When turned ON, your personal meal controls will appear on the dashboard.
      </p>
    `;
  } else if (type === 'mealRate') {
    title.textContent = 'Meal Rate Mode';
    body.innerHTML = `
      <p style="margin: 0 0 10px 0; font-weight: 700; color: #0F172A; font-size: 0.9rem;">Meal Rate Modes:</p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 14px;">
          <span style="font-weight: 700; color: #0F172A; display: block; margin-bottom: 2px;">Market Rate</span>
          <span style="color: #64748B; font-size: 0.82rem; line-height: 1.4; display: block;">Monthly total bazar cost divided by total active meals.</span>
        </div>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 14px;">
          <span style="font-weight: 700; color: #0F172A; display: block; margin-bottom: 2px;">Fixed Rate</span>
          <span style="color: #64748B; font-size: 0.82rem; line-height: 1.4; display: block;">Preset custom fixed price for each meal period.</span>
        </div>
      </div>
    `;
  } else if (type === 'mealsCutoff') {
    title.textContent = 'Meals & Cut-off Times';
    body.innerHTML = `
      <p style="margin: 0 0 6px 0; font-weight: 700; color: #0F172A; font-size: 0.9rem;">Meals & Cut-off Deadlines</p>
      <p style="margin: 0; color: #475569; font-size: 0.86rem; line-height: 1.55;">
        Set daily cutoff deadlines for Breakfast, Lunch, and Dinner. Toggle switches to enable or disable specific meal periods for your mess.
      </p>
    `;
  } else if (type === 'historyStartDate') {
    title.textContent = 'Active History Start Date';
    body.innerHTML = `
      <p style="margin: 0 0 6px 0; font-weight: 700; color: #0F172A; font-size: 0.9rem;">History Start Date</p>
      <p style="margin: 0; color: #475569; font-size: 0.86rem; line-height: 1.55;">
        Sets the starting date for active mess meal logs and calculations. Data before this date will not be counted in current active billing.
      </p>
    `;
  } else if (type === 'dueLimit') {
    title.textContent = 'Due Limit';
    body.innerHTML = `
      <p style="margin: 0 0 6px 0; font-weight: 700; color: #0F172A; font-size: 0.9rem;">What is Due Limit?</p>
      <p style="margin: 0; color: #475569; font-size: 0.86rem; line-height: 1.55;">
        Automatically turns off meals and locks meal toggling for members whose outstanding due exceeds the specified amount. Once the member clears their due by making a deposit, meal controls will be unlocked.
      </p>
    `;
  }

  modal.style.display = 'flex';
};

window.closeSettingInfoModal = function() {
  const modal = document.getElementById('settingInfoModal');
  if (modal) modal.style.display = 'none';
};


