/* ============================================
   Messliner — Utility Functions (utils.js)
   ============================================ */

const Utils = {
  /**
   * Format currency with ৳ symbol
   */
  currency(amount) {
    const num = parseFloat(amount) || 0;
    const isNeg = num < 0;
    const formatted = Math.abs(num).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return (isNeg ? '-৳' : '৳') + formatted;
  },

  /**
   * Format a number with commas
   */
  formatNumber(num) {
    return (parseFloat(num) || 0).toLocaleString('en-BD');
  },

  /**
   * Get today's date in YYYY-MM-DD format
   */
  today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /**
   * Get current month key YYYY-MM
   */
  currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * Get day key DD from a date string
   */
  dayKey(dateStr) {
    return dateStr.split('-')[2];
  },

  /**
   * Format date to readable string
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  timeAgo(timestamp) {
    if (!timestamp || typeof timestamp !== 'number') return 'Just now';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 0) return 'Just now';
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    try {
      return Utils.formatDate(new Date(timestamp).toISOString().split('T')[0]);
    } catch (e) {
      return 'Just now';
    }
  },

  /**
   * Format time (HH:MM) to readable 12-hour format
   */
  formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  },

  /**
   * Check if current time is past a deadline (HH:MM format)
   */
  isPastDeadline(deadlineStr) {
    if (!deadlineStr) return false;
    const now = new Date();
    const [h, m] = deadlineStr.split(':').map(Number);
    const deadlineMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return nowMinutes >= deadlineMinutes;
  },

  /**
   * Get time remaining until deadline (returns { hours, minutes, total })
   */
  timeUntilDeadline(deadlineStr) {
    if (!deadlineStr) return { hours: 0, minutes: 0, total: 0 };
    const now = new Date();
    const [h, m] = deadlineStr.split(':').map(Number);
    const deadlineMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let remaining = deadlineMinutes - nowMinutes;

    if (remaining < 0) {
      // Deadline passed for today; show time until tomorrow's deadline
      remaining = (24 * 60) - nowMinutes + deadlineMinutes;
    }

    return {
      hours: Math.floor(remaining / 60),
      minutes: remaining % 60,
      total: remaining
    };
  },

  /**
   * Generate a short unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  /**
   * Get initials from a name (max 2 characters)
   */
  initials(name) {
    if (!name) return '?';
    return name.split(' ')
      .map(w => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  },

  /**
   * Encode email for use as Firebase key (replace . with ,)
   */
  encodeEmail(email) {
    return email.replace(/\./g, ',');
  },

  /**
   * Debounce function
   */
  debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Throttle function
   */
  throttle(fn, limit = 300) {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Create an HTML element from a string
   */
  createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  },

  /**
   * DOM selector shortcuts
   */
  $(selector) {
    return document.querySelector(selector);
  },

  $$(selector) {
    return document.querySelectorAll(selector);
  },

  /**
   * Set value of element safely
   */
  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  /**
   * Set innerHTML safely
   */
  setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  },

  /**
   * Calculate meal rate
   * Meal Rate = Total Bazar Cost ÷ Total Meals
   */
  calcMealRate(totalBazar, totalMeals) {
    if (!totalMeals || totalMeals === 0) return 0;
    return totalBazar / totalMeals;
  },

  /**
   * Calculate user's meal cost
   */
  calcMealCost(mealRate, userMeals, mealBreakdown = null, fixedRates = null) {
    if (fixedRates) {
      const b = (mealBreakdown?.breakfast || 0) * (fixedRates.breakfast || 0);
      const l = (mealBreakdown?.lunch || 0) * (fixedRates.lunch || 0);
      const d = (mealBreakdown?.dinner || 0) * (fixedRates.dinner || 0);
      return b + l + d;
    }
    return mealRate * (userMeals || 0);
  },

  /**
   * Calculate balance
   */
  calcBalance(deposit, mealCost) {
    return (deposit || 0) - (mealCost || 0);
  },

  /**
   * Safe parse for numbers
   */
  num(val) {
    return parseFloat(val) || 0;
  },

  /**
   * Countdown timer display
   */
  countdownDisplay(hours, minutes) {
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  },

  /**
   * Format bazar items list. If it has newlines, format as a bulleted list.
   */
  formatBazarItems(itemsStr) {
    if (!itemsStr) return '—';
    const lines = itemsStr.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length > 1) {
      return `
        <ul class="bazar-items-list-styled" style="margin: 6px 0 0 0; padding: 0 0 0 4px; list-style-position: inside; list-style-type: disc; display: flex; flex-direction: column; gap: 4px; font-weight: normal; font-size: inherit; text-align: left; line-height: 1.4;">
          ${lines.map(line => `<li>${line}</li>`).join('')}
        </ul>
      `;
    }
    return itemsStr;
  },

  /**
   * Format recent activity log details. If it's a long multi-line list (like bazar items),
   * render as a collapsible list.
   */
  formatActivityDetails(details) {
    if (!details) return '';
    if (details.includes('\n')) {
      const lines = details.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        // Look for header prefix like "Bazar ৳1234:"
        const match = lines[0].match(/^(Bazar ৳[0-9,.]+:\s*)(.*)$/i);
        let headerText = '';
        let firstItem = '';
        let listLines = [];

        if (match) {
          headerText = match[1];
          firstItem = match[2];
          listLines = [firstItem, ...lines.slice(1)].filter(Boolean);
        } else {
          listLines = lines;
        }

        if (listLines.length > 4) {
          const uniqueId = 'activity-list-' + Math.random().toString(36).substr(2, 9);
          return `
            ${headerText ? `<div style="font-weight: var(--weight-semibold); margin-bottom: 2px;">${headerText}</div>` : ''}
            <div class="bazar-items-collapsible-wrapper">
              <ul id="${uniqueId}" class="bazar-items-list-styled collapsed">
                ${listLines.map(line => `<li>${line}</li>`).join('')}
              </ul>
              <button class="bazar-items-toggle-btn" onclick="event.stopPropagation(); const el = document.getElementById('${uniqueId}'); const btn = this; if (el.classList.contains('collapsed')) { el.classList.remove('collapsed'); btn.innerHTML = 'Show Less <span>↑</span>'; } else { el.classList.add('collapsed'); btn.innerHTML = 'Show More <span>↓</span>'; }">
                Show More <span>↓</span>
              </button>
            </div>
          `;
        } else {
          return `
            ${headerText ? `<div style="font-weight: var(--weight-semibold); margin-bottom: 2px;">${headerText}</div>` : ''}
            <ul class="bazar-items-list-styled">
              ${listLines.map(line => `<li>${line}</li>`).join('')}
            </ul>
          `;
        }
      }
    }
    return details;
  }
};

console.log('[Messliner] Utils loaded');
