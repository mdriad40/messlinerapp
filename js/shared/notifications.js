/* ============================================
   Messliner — Notifications System
   Per-User Isolated Inbox with Click Response & Modern UI
   ============================================ */

const Notifications = {
  notifications: [],
  currentFilter: 'all',
  diningId: null,
  userId: null,
  userJoinedAt: null,
  _listenerAttached: false,

  /**
   * Show a toast notification
   * @param {string} type — 'success' | 'error' | 'warning' | 'info'
   * @param {string} title
   * @param {string} message
   * @param {number} duration — ms (default 4000)
   */
  toast(type, title, message, duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toastEl = Utils.createElement(`
      <div class="toast ${type}">
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-dismiss" onclick="this.closest('.toast').remove()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="toast-progress" style="animation-duration:${duration}ms;"></div>
      </div>
    `);

    container.appendChild(toastEl);

    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('removing');
        setTimeout(() => toastEl.remove(), 200);
      }
    }, duration);

    while (container.children.length > 5) {
      container.firstChild.remove();
    }
  },

  /**
   * Initialize per-user notification realtime listener
   */
  initListener(diningId, userId, userJoinedAt = null) {
    if (!diningId || !userId) return;
    this.diningId = diningId;
    this.userId = userId;
    this.userJoinedAt = userJoinedAt;

    const userNotifRef = db.ref(`dinings/${diningId}/users/${userId}/notifications`);
    const globalNotifRef = db.ref(`dinings/${diningId}/notifications`);

    userNotifRef.on('value', () => {
      this.fetchAndRender();
    });

    globalNotifRef.limitToLast(10).on('child_added', () => {
      this.fetchAndRender();
    });

    // Close desktop popover on outside click or Escape
    if (!this._popoverEventsBound) {
      this._popoverEventsBound = true;
      document.addEventListener('click', (e) => {
        const popover = document.getElementById('desktopNotifPopover');
        const btn = document.getElementById('headerNotifBtn');
        if (popover && popover.classList.contains('active')) {
          if (!popover.contains(e.target) && !btn?.contains(e.target)) {
            this.closeDesktopPopover();
          }
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeDesktopPopover();
        }
      });
    }

    // Initialize mobile touch swipe gesture handler once
    this.initSwipeHandlers();

    // Initial fetch
    this.fetchAndRender();
  },

  /**
   * Initialize touch swipe gesture for mobile notification items.
   * Swiping left slides the card to reveal the delete button on the right.
   */
  initSwipeHandlers() {
    if (this._swipeHandlersInitialized) return;
    this._swipeHandlersInitialized = true;

    let touchStartX = 0;
    let touchStartY = 0;
    let currentCard = null;
    let openCard = null;
    let isHorizontal = false;
    let isLocked = false;
    let startTranslateX = 0;

    const closeCard = (card) => {
      if (!card) return;
      card.style.transition = 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)';
      card.style.transform = 'translateX(0px)';
      card.classList.remove('is-swiped-open');
      const w = card.closest('.notif-swipe-wrapper');
      if (w) {
        w.classList.remove('is-swiping');
        w.classList.remove('is-swiped-open');
      }
    };

    document.addEventListener('touchstart', (e) => {
      // Don't interfere if clicking delete button
      if (e.target.closest('.notif-swipe-action-right') || e.target.closest('.notif-m-del-btn')) {
        return;
      }

      const card = e.target.closest('.notif-m-card');

      // If another card is already open, close it
      if (openCard && openCard !== card) {
        closeCard(openCard);
        openCard = null;
      }

      if (!card) return;

      currentCard = card;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isHorizontal = false;
      isLocked = false;
      startTranslateX = card.classList.contains('is-swiped-open') ? -80 : 0;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!currentCard) return;

      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      if (!isLocked) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
          isLocked = true;
          currentCard = null; // Let browser scroll vertically freely
          return;
        }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          isHorizontal = true;
          isLocked = true;
        }
      }

      if (isHorizontal) {
        if (e.cancelable) e.preventDefault();
        const wrapper = currentCard.closest('.notif-swipe-wrapper');
        if (wrapper) wrapper.classList.add('is-swiping');

        let newX = startTranslateX + dx;
        // Cannot swipe right past 0
        if (newX > 0) newX = 0;
        // Rubber-band resistance past -80px
        if (newX < -80) {
          const over = newX + 80;
          newX = -80 + (over * 0.3);
        }

        currentCard.style.transition = 'none';
        currentCard.style.transform = `translateX(${newX}px)`;
      }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      if (!currentCard) return;

      if (isHorizontal) {
        const dx = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX) - touchStartX;
        const finalX = startTranslateX + dx;

        currentCard.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';

        const wrapper = currentCard.closest('.notif-swipe-wrapper');
        if (wrapper) wrapper.classList.remove('is-swiping');

        const snapOpen = startTranslateX === 0 ? finalX < -35 : finalX < -45;

        if (snapOpen) {
          currentCard.style.transform = 'translateX(-80px)';
          currentCard.classList.add('is-swiped-open');
          if (wrapper) wrapper.classList.add('is-swiped-open');
          openCard = currentCard;
          currentCard._justSwiped = true;
          setTimeout(() => {
            if (currentCard) currentCard._justSwiped = false;
          }, 320);
        } else {
          currentCard.style.transform = 'translateX(0px)';
          currentCard.classList.remove('is-swiped-open');
          if (wrapper) wrapper.classList.remove('is-swiped-open');
          if (openCard === currentCard) openCard = null;
        }
      }

      currentCard = null;
      isHorizontal = false;
      isLocked = false;
    }, { passive: true });
  },

  /**
   * Fetch notifications from Firebase and render both mobile & desktop lists
   */
  async fetchAndRender() {
    this.diningId = this.diningId || Messliner.state?.diningId;
    this.userId = this.userId || Messliner.state?.userId;
    if (!this.diningId || !this.userId) return;

    const userNotifRef = db.ref(`dinings/${this.diningId}/users/${this.userId}/notifications`);
    const globalNotifRef = db.ref(`dinings/${this.diningId}/notifications`);
    const deletedRef = db.ref(`dinings/${this.diningId}/users/${this.userId}/deletedNotifs`);

    try {
      const [userSnap, globalSnap, deletedSnap] = await Promise.all([
        userNotifRef.limitToLast(50).once('value'),
        globalNotifRef.limitToLast(50).once('value'),
        deletedRef.once('value')
      ]);

      const deletedMap = deletedSnap.val() || {};
      const map = new Map();
      const now = Date.now();
      const joinedAt = typeof this.userJoinedAt === 'number'
        ? this.userJoinedAt
        : (this.userJoinedAt ? new Date(this.userJoinedAt).getTime() : 0);

      const parseTs = (t) => {
        if (!t) return now;
        if (typeof t === 'number') return t;
        if (typeof t === 'string') {
          const p = new Date(t).getTime();
          return isNaN(p) ? now : p;
        }
        return now;
      };

      // Discard and clean up blank/empty notifications
      const isValidNotification = (val, id) => {
        if (!val || typeof val !== 'object') return false;
        const rawTitle = (val.title || '').trim();
        const rawMsg = (val.message || val.text || val.details || '').trim();
        if (!rawMsg && (!rawTitle || rawTitle.toLowerCase() === 'notification')) {
          if (this.diningId && this.userId && id) {
            db.ref(`dinings/${this.diningId}/users/${this.userId}/notifications/${id}`).remove().catch(() => {});
            db.ref(`dinings/${this.diningId}/users/${this.userId}/deletedNotifs/${id}`).set(true).catch(() => {});
          }
          return false;
        }
        return true;
      };

      // 1. Process legacy global notifications
      globalSnap.forEach(child => {
        const val = child.val();
        const id = child.key;
        if (deletedMap[id]) return;
        if (!isValidNotification(val, id)) return;
        const ts = parseTs(val.timestamp);
        // Only filter out old notifications from before joinedAt (never filter today's/recent)
        if (joinedAt && ts < (joinedAt - 60000) && (now - ts) > 172800000) return;

        if (val.targetUser === 'all' || val.targetUser === this.userId) {
          map.set(id, { id, ...val, timestamp: ts });
        }
      });

      // 2. Process user's dedicated inbox notifications
      userSnap.forEach(child => {
        const val = child.val();
        const id = child.key;
        if (deletedMap[id]) return;
        if (!isValidNotification(val, id)) return;
        const ts = parseTs(val.timestamp);
        if (joinedAt && ts < (joinedAt - 60000) && (now - ts) > 172800000) return;

        map.set(id, { id, ...val, timestamp: ts });
      });

      const list = Array.from(map.values()).filter(n => {
        const title = (n.title || '').trim();
        const msg = (n.message || '').trim();
        return msg.length > 0 || (title.length > 0 && title.toLowerCase() !== 'notification');
      });

      list.sort((a, b) => {
        const tsA = typeof a.timestamp === 'number' ? a.timestamp : 0;
        const tsB = typeof b.timestamp === 'number' ? b.timestamp : 0;
        return tsB - tsA;
      });

      this.notifications = list;
      this.render();
      this.updateBadge();
    } catch (err) {
      console.error('[Notifications] fetch error:', err);
    }
  },

  /**
   * Update unread count badge in header and dashboard topbar
   */
  updateBadge() {
    const unreadCount = (this.notifications || []).filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    const mymealBadge = document.getElementById('mymealNotifBadge');

    [badge, mymealBadge].forEach(el => {
      if (!el) return;
      if (unreadCount > 0) {
        el.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
        el.style.setProperty('display', 'flex', 'important');
        el.classList.remove('hidden');
      } else {
        el.textContent = '';
        el.style.setProperty('display', 'none', 'important');
        el.classList.add('hidden');
      }
    });

    const statsCounter = document.getElementById('notifStatsCounter');
    if (statsCounter) {
      const total = this.notifications.length;
      statsCounter.innerHTML = `
        <span class="notif-stat-pill unread ${unreadCount > 0 ? 'active' : ''}">${unreadCount} Unread</span>
        <span class="notif-stat-pill total">${total} Total</span>
      `;
    }
  },

  /**
   * Handle bell icon click: mobile opens full page, desktop toggles popover
   */
  handleBellClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.innerWidth <= 768) {
      if (window.Router && window.Router.currentPage !== 'notifications') {
        Router.notificationOriginPage = Router.currentPage;
      }
      Messliner.router.navigate('notifications');
      return;
    }
    this.toggleDesktopPopover();
  },

  toggleDesktopPopover() {
    const popover = document.getElementById('desktopNotifPopover');
    if (!popover) {
      Messliner.router.navigate('notifications');
      return;
    }
    const isOpen = popover.classList.contains('active');
    if (isOpen) {
      this.closeDesktopPopover();
    } else {
      this.openDesktopPopover();
    }
  },

  openDesktopPopover() {
    const popover = document.getElementById('desktopNotifPopover');
    if (!popover) return;
    popover.classList.add('active');
    this.render();
  },

  closeDesktopPopover() {
    const popover = document.getElementById('desktopNotifPopover');
    if (popover) {
      popover.classList.remove('active');
    }
  },

  openFullPage() {
    this.closeDesktopPopover();
    if (window.Router && window.Router.currentPage !== 'notifications') {
      Router.notificationOriginPage = Router.currentPage;
    }
    Messliner.router.navigate('notifications');
  },

  /**
   * Set filter for notifications list
   */
  setFilter(filter, btn) {
    this.currentFilter = filter;
    document.querySelectorAll('.notif-u-tab').forEach(b => {
      b.classList.toggle('active', b === btn || b.dataset.tab === filter);
    });
    this.render();
  },

  /**
   * Format timestamp like '5:09 pm' or 'Yesterday' or 'Oct 16'
   */
  _formatTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    if (isToday) {
      return timeStr;
    }
    const diffHours = (now - date) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return timeStr;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  },

  /**
   * Render notifications list in minimal double-line layout
   */
  render() {
    const list = document.getElementById('notificationsPageList');
    const desktopList = document.getElementById('desktopNotifList');
    if (!list && !desktopList) return;

    let items = this.notifications || [];

    if (this.currentFilter === 'unread') {
      items = items.filter(n => !n.read);
    } else if (this.currentFilter === 'deposit') {
      items = items.filter(n => {
        const t = (n.type || '').toLowerCase();
        const title = (n.title || '').toLowerCase();
        return t === 'deposit' || t === 'finance' || title.includes('deposit') || title.includes('bill') || title.includes('money') || title.includes('deduct');
      });
    } else if (this.currentFilter === 'meal') {
      items = items.filter(n => {
        const t = (n.type || '').toLowerCase();
        const title = (n.title || '').toLowerCase();
        return t === 'meal' || title.includes('meal');
      });
    } else if (this.currentFilter === 'bazar') {
      items = items.filter(n => {
        const t = (n.type || '').toLowerCase();
        const title = (n.title || '').toLowerCase();
        return t === 'bazar' || title.includes('bazar');
      });
    }

    const emptyHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-ambient">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h4 class="notif-empty-title">${this.currentFilter === 'all' ? 'All caught up!' : 'No notifications here'}</h4>
        <p class="notif-empty-subtitle">${this.currentFilter === 'all' ? 'You have no notifications in your inbox right now. New alerts will appear here.' : 'No notifications match this category.'}</p>
      </div>
    `;

    const contentHTML = items.length === 0 ? emptyHTML : items.map(n => this._renderCardHTML(n)).join('');
    if (list) list.innerHTML = contentHTML;
    if (desktopList) desktopList.innerHTML = contentHTML;
  },

  /**
   * Generate card HTML: Minimal Pastel Icon + Line 1 (Title, Time) + Line 2 (Subtitle)
   */
  _renderCardHTML(n) {
    const isUnread = !n.read;
    const type = (n.type || 'info').toLowerCase();
    const title = n.title || 'Notification';
    const message = n.message || '';
    const timeFormatted = this._formatTime(n.timestamp);

    let themeClass = 'theme-bell';
    const iconSVG = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
      </svg>
    `;

    return `
      <div class="notif-swipe-wrapper" data-notif-id="${n.id}">
        <!-- Hidden behind card on mobile: Swipe Delete Action -->
        <div class="notif-swipe-action-right" 
             onclick="Notifications.deleteNotification('${n.id}', event)">
          <button type="button" class="notif-swipe-delete-btn" aria-label="Delete">
            <div class="notif-swipe-icon-circle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </div>
            <span class="notif-swipe-delete-label">Delete</span>
          </button>
        </div>

        <!-- Notification Card -->
        <div class="notif-m-card ${isUnread ? 'is-unread' : ''}"
             data-notif-id="${n.id}"
             onclick="Notifications.handleClick('${n.id}', event)">
          
          <!-- Minimal Rounded Pastel Icon Box -->
          <div class="notif-m-icon ${themeClass}">
            ${iconSVG}
            ${isUnread ? '<span class="notif-m-dot"></span>' : ''}
          </div>

          <!-- Double-line Body -->
          <div class="notif-m-body">
            <div class="notif-m-row-top">
              <span class="notif-m-title">${title}</span>
              <div class="notif-m-meta-right">
                <span class="notif-m-time">${timeFormatted}</span>
                <!-- Desktop Only Delete Button -->
                <button type="button" class="notif-m-del-btn" 
                        onclick="Notifications.deleteNotification('${n.id}', event)" 
                        title="Delete">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div class="notif-m-subtitle">${message}</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Handle card click: mark as read and navigate to relevant destination
   */
  handleClick(id, event) {
    const card = document.querySelector(`.notif-m-card[data-notif-id="${id}"]`);
    if (card) {
      if (card._justSwiped) {
        card._justSwiped = false;
        return;
      }
      if (card.classList.contains('is-swiped-open')) {
        card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
        card.style.transform = 'translateX(0px)';
        card.classList.remove('is-swiped-open');
        const w = card.closest('.notif-swipe-wrapper');
        if (w) w.classList.remove('is-swiping');
        return;
      }
    }

    // Check if the click came from desktop popover vs mobile notifications screen
    const isDesktopPopover = !!(event && event.target && event.target.closest('#desktopNotifPopover'))
                          || (window.innerWidth > 768 && (window.Router?.currentPage !== 'notifications'));

    let originPage = window.Router?.currentPage || (location.hash ? location.hash.replace('#', '') : '') || 'dashboard';
    if (originPage === 'overview' || !originPage) {
      originPage = 'dashboard';
    }

    this.closeDesktopPopover();
    const notif = (this.notifications || []).find(n => n.id === id);
    if (!notif) return;

    this.markAsRead(id);

    if (isDesktopPopover) {
      if (window.Router) {
        Router.popoverOriginPage = originPage;
        Router.navigatedFromDesktopPopover = true;
        Router.navigatedFromMobileNotifScreen = false;
        Router.navigatedFromNotifications = false;
      }
      if (window.Messliner && Messliner.router) {
        Messliner.router.popoverOriginPage = originPage;
        Messliner.router.navigatedFromDesktopPopover = true;
        Messliner.router.navigatedFromMobileNotifScreen = false;
        Messliner.router.navigatedFromNotifications = false;
      }
    } else {
      if (window.Router) {
        Router.popoverOriginPage = null;
        Router.navigatedFromDesktopPopover = false;
        Router.navigatedFromMobileNotifScreen = true;
        Router.navigatedFromNotifications = true;
      }
      if (window.Messliner && Messliner.router) {
        Messliner.router.popoverOriginPage = null;
        Messliner.router.navigatedFromDesktopPopover = false;
        Messliner.router.navigatedFromMobileNotifScreen = true;
        Messliner.router.navigatedFromNotifications = true;
      }
    }

    const type = (notif.type || '').toLowerCase();
    const title = (notif.title || '').toLowerCase();
    const msg = (notif.message || '').toLowerCase();

    // 1. Bazar notifications -> Open user's dining Bazar History (bazar page, no access denied)
    if (type === 'bazar' || title.includes('bazar') || msg.includes('bazar')) {
      Messliner.router.navigate('bazar');
      return;
    }

    // 2. Deposit / Bill / Deduct / Finance
    if (type === 'deposit' || type === 'finance' || title.includes('deposit') || title.includes('bill') || title.includes('money') || title.includes('deduct')) {
      const role = Messliner.state.role || 'user';
      if (role === 'admin') {
        if (title.includes('bill') || title.includes('payment')) {
          Messliner.router.navigate('ledger');
        } else {
          Messliner.router.navigate('finance');
        }
      } else {
        Messliner.router.navigate('user-bills');
        if (window.UserBillsModule && typeof UserBillsModule.switchTab === 'function') {
          if (title.includes('request') || title.includes('approved') || title.includes('deposit')) {
            setTimeout(() => UserBillsModule.switchTab('history'), 80);
          } else if (title.includes('bill')) {
            setTimeout(() => UserBillsModule.switchTab('bills'), 80);
          }
        }
      }
      return;
    }

    // 3. Meals
    if (type === 'meal' || title.includes('meal')) {
      const role = Messliner.state.role || 'user';
      if (title.includes('friday')) {
        Messliner.router.navigate('fridaymeal');
      } else if (role === 'admin') {
        Messliner.router.navigate('meals');
      } else {
        Messliner.router.navigate('mealchart');
      }
      return;
    }

    // 4. Bazar Roster / Duty
    if (title.includes('roster') || title.includes('duty') || title.includes('shopper')) {
      Messliner.router.navigate('bazarroster');
      return;
    }

    // 5. Notices / Announcements
    if (title.includes('notice') || title.includes('announcement')) {
      Messliner.router.navigate('notices');
      return;
    }
  },

  /**
   * Delete a notification from user's view
   */
  async deleteNotification(id, event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!id || !this.diningId || !this.userId) return;

    const wrapper = document.querySelector(`.notif-swipe-wrapper[data-notif-id="${id}"]`)
                 || document.querySelector(`.notif-m-card[data-notif-id="${id}"]`);
    if (wrapper) {
      wrapper.classList.add('removing');
    }

    try {
      // 1. Remove from user's dedicated notifications path
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/notifications/${id}`).remove();

      // 2. Mark as deleted in user's deleted list
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/deletedNotifs/${id}`).set(true);

      // 3. Update local array
      this.notifications = this.notifications.filter(n => n.id !== id);

      setTimeout(() => {
        this.render();
        this.updateBadge();
      }, 260);

      // No toast notification as requested by user ("eter jonno kono toast message lageb na")
    } catch (err) {
      console.error('[Notifications] Delete error:', err);
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(id, event) {
    if (event) event.stopPropagation();
    if (!id || !this.diningId || !this.userId) return;

    const notif = this.notifications.find(n => n.id === id);
    if (!notif || notif.read) return;

    notif.read = true;
    this.updateBadge();

    const card = document.querySelector(`.notif-card[data-notif-id="${id}"]`);
    if (card) {
      card.classList.remove('unread');
      const dot = card.querySelector('.notif-unread-glow-dot');
      if (dot) dot.remove();
    }

    try {
      await db.ref(`dinings/${this.diningId}/users/${this.userId}/notifications/${id}/read`).set(true);
    } catch (err) {
      console.error('[Notifications] markAsRead error:', err);
    }
  },

  /**
   * Mark all notifications as read
   */
  async markAllRead() {
    if (!this.diningId || !this.userId) return;

    const unreadItems = (this.notifications || []).filter(n => !n.read);
    if (unreadItems.length === 0) {
      this.toast('info', 'Notifications', 'All notifications are already read.');
      return;
    }

    unreadItems.forEach(n => { n.read = true; });
    this.render();
    this.updateBadge();

    try {
      const updates = {};
      unreadItems.forEach(n => {
        updates[`dinings/${this.diningId}/users/${this.userId}/notifications/${n.id}/read`] = true;
      });
      await db.ref().update(updates);
      this.toast('success', 'Marked as Read', 'All notifications marked as read.');
    } catch (err) {
      console.error('[Notifications] markAllRead error:', err);
    }
  },

  /**
   * Clear all notifications for this user
   */
  async clearAll() {
    if (!this.diningId || !this.userId) return;
    if (this.notifications.length === 0) {
      this.toast('info', 'Empty', 'No notifications to clear.');
      return;
    }

    if (!confirm('Are you sure you want to clear all notifications from your inbox?')) {
      return;
    }

    try {
      const currentIds = this.notifications.map(n => n.id);
      const updates = {};

      updates[`dinings/${this.diningId}/users/${this.userId}/notifications`] = null;

      currentIds.forEach(id => {
        updates[`dinings/${this.diningId}/users/${this.userId}/deletedNotifs/${id}`] = true;
      });

      await db.ref().update(updates);

      this.notifications = [];
      this.render();
      this.updateBadge();
      this.toast('success', 'Cleared', 'All notifications have been cleared.');
    } catch (err) {
      console.error('[Notifications] clearAll error:', err);
      this.toast('error', 'Error', 'Failed to clear notifications.');
    }
  },

  /**
   * Create a notification in the database with strict per-user targeting
   */
  async create(diningId, title, message, targetUser = 'all', type = 'info', meta = null) {
    diningId = diningId || this.diningId || Messliner.state?.diningId;
    if (!diningId) return;

    const now = Date.now();
    const notifData = {
      title,
      message,
      targetUser,
      type,
      read: false,
      timestamp: now
    };
    if (meta) notifData.meta = meta;

    try {
      // 1. Single User Target: Write strictly to this user's inbox
      if (targetUser && targetUser !== 'all') {
        const notifRef = db.ref(`dinings/${diningId}/users/${targetUser}/notifications`).push();
        await notifRef.set({
          ...notifData,
          id: notifRef.key
        });
        if (typeof this.fetchAndRender === 'function') {
          this.fetchAndRender();
        }
        return;
      }

      // 2. Broadcast to 'all': write to each member's private inbox + global record
      let userIds = [];
      if (typeof Messliner !== 'undefined' && Messliner.users && Messliner.users.users) {
        userIds = Object.keys(Messliner.users.users);
      }
      if (userIds.length === 0) {
        try {
          const usersSnap = await db.ref(`dinings/${diningId}/users`).once('value');
          userIds = Object.keys(usersSnap.val() || {});
        } catch (e) {}
      }
      const currentUserId = this.userId || Messliner.state?.userId;
      if (currentUserId && !userIds.includes(currentUserId)) {
        userIds.push(currentUserId);
      }

      const pushKey = db.ref(`dinings/${diningId}/notifications`).push().key;
      const updates = {};
      const payload = {
        ...notifData,
        id: pushKey
      };

      userIds.forEach(uid => {
        updates[`dinings/${diningId}/users/${uid}/notifications/${pushKey}`] = payload;
      });

      // Keep legacy global record for server/history
      updates[`dinings/${diningId}/notifications/${pushKey}`] = payload;

      await db.ref().update(updates);

      // Immediately refresh local notifications list
      if (typeof this.fetchAndRender === 'function') {
        this.fetchAndRender();
      }
    } catch (err) {
      console.error('[Notifications] create error:', err);
    }
  },

  /**
   * Activity log system (audit logs)
   */
  async log(diningId, action, details, performedBy, targetUserId = null, isSingle = false, batchId = null) {
    if (!diningId) return;

    const globalLogData = {
      action,
      details,
      performedBy: performedBy || 'system',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (targetUserId) globalLogData.targetUserId = targetUserId;
    if (isSingle) globalLogData.isSingle = true;
    if (batchId) globalLogData.batchId = batchId;

    const logRef = db.ref(`dinings/${diningId}/logs`).push();
    await logRef.set(globalLogData);

    if (targetUserId) {
      const userLogData = {
        action,
        details,
        performedBy: performedBy || 'system',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      if (isSingle) userLogData.isSingle = true;
      if (batchId) userLogData.batchId = batchId;

      const userLogRef = db.ref(`dinings/${diningId}/users/${targetUserId}/logs`).push();
      await userLogRef.set(userLogData);
    }
  }
};

console.log('[Messliner] Notifications module loaded');
