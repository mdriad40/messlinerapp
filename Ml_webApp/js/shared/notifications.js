/* ============================================
   Messliner — Notifications System
   ============================================ */

const Notifications = {
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

    // Auto remove
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.classList.add('removing');
        setTimeout(() => toastEl.remove(), 200);
      }
    }, duration);

    // Limit to 5 visible toasts
    while (container.children.length > 5) {
      container.firstChild.remove();
    }
  },

  initListener(diningId, userId, userJoinedAt = null) {
    if (!diningId) return;

    const notifRef = db.ref(`dinings/${diningId}/notifications`);
    notifRef.orderByChild('timestamp').limitToLast(20).on('value', (snap) => {
      const notifications = [];
      snap.forEach(child => {
        const val = child.val();
        if (!userJoinedAt || (val.timestamp && val.timestamp >= userJoinedAt)) {
          notifications.push({ id: child.key, ...val });
        }
      });
      notifications.reverse();
      this.renderNotifications(notifications, userId);
    });
  },

  /**
   * Render notification list in the panel
   */
  renderNotifications(notifications, userId) {
    const list = document.getElementById('notificationsPageList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;

    // Filter notifications for this user
    const filtered = notifications.filter(n =>
      n.targetUser === 'all' || n.targetUser === userId
    );

    const unread = filtered.filter(n => !n.read).length;

    // Update badge
    if (badge) {
      if (unread > 0) {
        badge.style.display = 'flex';
        badge.textContent = unread > 9 ? '9+' : unread;
      } else {
        badge.style.display = 'none';
      }
    }

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:var(--space-8) var(--space-4);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <p style="margin-top:var(--space-2);font-size:var(--font-sm);color:var(--text-tertiary);">No notifications yet</p>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(n => {
      const iconBg = n.type === 'deposit' ? 'background:var(--accent-100);color:var(--accent-600);'
        : n.type === 'meal' ? 'background:var(--warning-100);color:var(--warning-600);'
          : n.type === 'bazar' ? 'background:var(--primary-100);color:var(--primary-600);'
            : 'background:var(--gray-100);color:var(--gray-600);';

      return `
        <div class="notification-item ${n.read ? '' : 'unread'}">
          <div class="notification-item-icon" style="${iconBg}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            </svg>
          </div>
          <div class="notification-item-content">
            <div class="notification-item-title">${n.title || 'Notification'}</div>
            <div class="notification-item-text">${n.message || ''}</div>
            <div class="notification-item-time">${Utils.timeAgo(n.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Create a notification in the database
   */
  async create(diningId, title, message, targetUser = 'all', type = 'info') {
    if (!diningId) return;
    const notifRef = db.ref(`dinings/${diningId}/notifications`).push();
    await notifRef.set({
      title,
      message,
      targetUser,
      type,
      read: false,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  },

  /**
   * Mark all notifications as read
   */
  async markAllRead() {
    if (!Messliner.state.diningId) return;
    const snap = await db.ref(`dinings/${Messliner.state.diningId}/notifications`).once('value');
    const updates = {};
    snap.forEach(child => {
      updates[`${child.key}/read`] = true;
    });
    if (Object.keys(updates).length > 0) {
      await db.ref(`dinings/${Messliner.state.diningId}/notifications`).update(updates);
    }
    this.toast('info', 'Notifications', 'All notifications marked as read');
  },

  async log(diningId, action, details, performedBy, targetUserId = null, isSingle = false, batchId = null) {
    if (!diningId) return;

    // Build the global log entry (includes targetUserId so admin view can display member names)
    const globalLogData = {
      action,
      details,
      performedBy: performedBy || 'system',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (targetUserId) {
      globalLogData.targetUserId = targetUserId;
    }
    if (isSingle) {
      globalLogData.isSingle = true;
    }
    // batchId groups all log entries from the same save operation into one activity card
    if (batchId) {
      globalLogData.batchId = batchId;
    }

    // Write to global dining logs
    const logRef = db.ref(`dinings/${diningId}/logs`).push();
    await logRef.set(globalLogData);

    // If targetUserId is specified, write a SEPARATE fresh object to the user-specific logs.
    // This is critical — sharing the same object reference causes Firebase to resolve
    // ServerValue.TIMESTAMP at two different moments, producing mismatched timestamps.
    // The per-user log intentionally omits targetUserId (it is implicit from the path).
    if (targetUserId) {
      const userLogData = {
        action,
        details,
        performedBy: performedBy || 'system',
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      if (isSingle) {
        userLogData.isSingle = true;
      }
      if (batchId) {
        userLogData.batchId = batchId;
      }
      const userLogRef = db.ref(`dinings/${diningId}/users/${targetUserId}/logs`).push();
      await userLogRef.set(userLogData);
    }
  }
};

console.log('[Messliner] Notifications loaded');
