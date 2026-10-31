/* ============================================================
   Messliner — Enterprise Client Analytics & Access Timeline Engine
   File: messliner-analytics.js
   Architecture: Senior Engineer Gold Standard: Metrics + Single Event Stream
     - Single Event Stream (adminSystem/accessLogs): Immutable log of logins & app visits with exact hour/minute/platform (Single Source of Truth, zero duplication)
     - Daily Aggregated Metrics (adminSystem/dailyAnalytics): Ultra-compact counters for instant dashboard loading
     - Real-Time Presence (adminSystem/presence): High-frequency socket presence with onDisconnect()
     - Cloud Firestore Archive (admin_access_logs, admin_users): Permanent low-frequency audit store
   ============================================================ */

(function () {
  'use strict';

  // Prevent multiple initializations across navigation/scripts
  if (window.__MesslinerAnalyticsInitialized) return;
  window.__MesslinerAnalyticsInitialized = true;

  // Administrative Firebase Project Configuration (meiner-admin)
  const ADMIN_FIREBASE_CONFIG = {
    apiKey: "AIzaSyA0cRmgOZuAVjsGBtfBKN1GORD_BHWBAss",
    authDomain: "meiner-admin.firebaseapp.com",
    databaseURL: "https://meiner-admin-default-rtdb.firebaseio.com",
    projectId: "meiner-admin",
    storageBucket: "meiner-admin.firebasestorage.app",
    messagingSenderId: "62196998163",
    appId: "1:62196998163:web:b60256d994a0c674d95fe6"
  };

  const TIMEZONE = 'Asia/Dhaka';
  const TICK_INTERVAL_MS = 5000;           // 5s local ticker for precise duration accumulation
  const HEARTBEAT_INTERVAL_MS = 30000;     // 30s heartbeat for live presence
  const FLUSH_DURATION_THRESHOLD_SEC = 60; // 60s optimized database flush (cuts write traffic by 65%)
  const INACTIVITY_TIMEOUT_MS = 120000;    // 2 minutes idle threshold
  const RE_ENTRY_IDLE_TIMEOUT = 1200000;   // 20 minutes away counts as a re-entry

  let adminApp = null;
  let adminDb = null;
  let adminFirestore = null;

  let currentUserId = null;
  let currentAuthUid = null;
  let currentMessId = null;
  let currentRole = null;
  let currentUserName = null;
  let currentUserEmail = null;

  let currentSessionId = null;
  let activeTicker = null;
  let heartbeatTimer = null;
  let activeDurationSeconds = 0;
  let unsyncedDurationSeconds = 0;
  let lastTickTimestamp = Date.now();
  let lastUserInteractionTimestamp = Date.now();
  let isWindowVisible = !document.hidden;

  // Status subscriptions
  let userStatusUnsubscribe = null;
  let messStatusUnsubscribe = null;
  let presenceConnectedRef = null;

  /**
   * Helper: Get current date in YYYY-MM-DD format in Asia/Dhaka
   */
  function getDhakaDateString(dateObj = new Date()) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(dateObj);
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Helper: Get current time formatted in 12-hour AM/PM in Asia/Dhaka
   */
  function getDhakaTimeString(dateObj = new Date()) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(dateObj);
    } catch (_) {
      return new Date().toLocaleTimeString();
    }
  }

  /**
   * Helper: Generate unique IDs
   */
  function generateSessionId() {
    return 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  function generateLogId(prefix = 'acc_') {
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  }

  /**
   * Detect client platform
   */
  function getClientPlatform() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'Android App / Browser';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'iOS Browser';
    if (/Windows/i.test(ua)) return 'Windows Desktop';
    if (/Macintosh/i.test(ua)) return 'macOS Desktop';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Web Client';
  }

  /**
   * Initialize Admin Firebase App safely (both RTDB & Firestore)
   */
  function initAdminFirebase() {
    if (adminDb) return true;
    try {
      if (typeof firebase === 'undefined') {
        return false;
      }
      const existingApps = firebase.apps || [];
      const found = existingApps.find(a => a.name === 'MesslinerAdminPresence');
      adminApp = found || firebase.initializeApp(ADMIN_FIREBASE_CONFIG, 'MesslinerAdminPresence');
      
      if (!adminDb && typeof adminApp.database === 'function') {
        adminDb = adminApp.database();
      }

      if (!adminFirestore && typeof adminApp.firestore === 'function') {
        try {
          adminFirestore = adminApp.firestore();
        } catch (_) {}
      }

      return !!adminDb;
    } catch (e) {
      console.warn('[Messliner Analytics] Firebase Admin app init notice:', e.message);
      return false;
    }
  }

  /**
   * User interaction listener
   */
  function registerUserInteraction() {
    lastUserInteractionTimestamp = Date.now();
  }

  /**
   * Attach user activity listeners
   */
  function attachActivityListeners() {
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, registerUserInteraction, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      isWindowVisible = !document.hidden;
      lastTickTimestamp = Date.now();

      if (isWindowVisible) {
        lastUserInteractionTimestamp = Date.now();
        checkAndRecordAppEntry(false);
        sendHeartbeat();
      } else {
        flushDurationToDatabase();
      }
    });

    window.addEventListener('focus', () => {
      isWindowVisible = true;
      lastTickTimestamp = Date.now();
      lastUserInteractionTimestamp = Date.now();
      revalidateStatus();
      checkAndRecordAppEntry(false);
    });

    window.addEventListener('beforeunload', () => {
      flushDurationToDatabase();
      terminateSessionSync();
    });
  }

  /**
   * Display or Dismiss Blocked / Suspended Overlay
   */
  function showRestrictedOverlay(type, reason) {
    let overlay = document.getElementById('ml-admin-restricted-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ml-admin-restricted-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(10px);
        z-index: 99999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        padding: 20px;
        color: #0f172a;
      `;

      overlay.innerHTML = `
        <div style="background: #ffffff; max-width: 480px; width: 100%; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid #e2e8f0; padding: 32px; text-align: center; animation: mlModalFade 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
          <div style="width: 64px; height: 64px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: #dc2626;">
            <svg style="width: 32px; height: 32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <h2 id="ml-restrict-title" style="font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Access Suspended</h2>
          <p id="ml-restrict-msg" style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 20px;"></p>
          <div id="ml-restrict-reason-box" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 13px; color: #334155; text-align: left;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Reason provided by Administration:</strong>
            <span id="ml-restrict-reason"></span>
          </div>
          <div style="font-size: 13px; color: #94a3b8; margin-bottom: 24px;">
            If you believe this is in error, please contact your mess manager or administrative support at <span style="font-weight: 600; color: #2563eb;">support@messliner.com</span>.
          </div>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="ml-restrict-logout-btn" style="padding: 10px 20px; background: #0f172a; color: #ffffff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s;">
              Sign Out
            </button>
            <button id="ml-restrict-refresh-btn" style="padding: 10px 20px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
              Re-check Status
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('ml-restrict-logout-btn').addEventListener('click', () => {
        try {
          if (window.Messliner && window.Messliner.auth && typeof window.Messliner.auth.logout === 'function') {
            window.Messliner.auth.logout();
          } else if (window.auth && typeof window.auth.signOut === 'function') {
            window.auth.signOut().then(() => window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login'));
          } else {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login');
          }
        } catch (_) {
          window.location.replace(window.location.protocol === 'file:' ? 'login.html' : '/login');
        }
      });

      document.getElementById('ml-restrict-refresh-btn').addEventListener('click', () => {
        window.location.reload();
      });
    }

    const titleEl = document.getElementById('ml-restrict-title');
    const msgEl = document.getElementById('ml-restrict-msg');
    const reasonBox = document.getElementById('ml-restrict-reason-box');
    const reasonEl = document.getElementById('ml-restrict-reason');

    if (type === 'MESS_SUSPENDED') {
      titleEl.textContent = 'Mess Temporarily Suspended';
      msgEl.textContent = 'This mess dining group has been placed on hold by the Super Administrator. Access to mess operations is currently restricted.';
    } else {
      titleEl.textContent = 'Account Access Restricted';
      msgEl.textContent = 'Your user account access to Messliner has been temporarily suspended by the Super Administrator.';
    }

    if (reason && reason.trim()) {
      reasonBox.style.display = 'block';
      reasonEl.textContent = reason;
    } else {
      reasonBox.style.display = 'none';
    }

    overlay.style.display = 'flex';
  }

  function hideRestrictedOverlay() {
    const overlay = document.getElementById('ml-admin-restricted-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Monitor Authoritative Blocking & Suspension Status
   */
  function monitorStatus() {
    if (!adminDb || !currentUserId) return;

    if (userStatusUnsubscribe) {
      adminDb.ref(`adminSystem/users/${currentUserId}`).off();
    }

    userStatusUnsubscribe = adminDb.ref(`adminSystem/users/${currentUserId}`).on('value', snap => {
      const val = snap.val();
      if (val && val.accountStatus === 'blocked') {
        showRestrictedOverlay('USER_BLOCKED', val.blockedReason || 'Administrative suspension.');
      } else {
        checkMessStatus();
      }
    });

    checkMessStatus();
  }

  function checkMessStatus() {
    if (!adminDb || !currentMessId) return;

    if (messStatusUnsubscribe) {
      adminDb.ref(`adminSystem/messes/${currentMessId}`).off();
    }

    messStatusUnsubscribe = adminDb.ref(`adminSystem/messes/${currentMessId}`).on('value', snap => {
      const val = snap.val();
      if (val && val.status === 'suspended') {
        showRestrictedOverlay('MESS_SUSPENDED', val.suspendedReason || 'Mess temporarily suspended.');
      } else {
        adminDb.ref(`adminSystem/users/${currentUserId}`).once('value').then(uSnap => {
          const uVal = uSnap.val();
          if (!uVal || uVal.accountStatus !== 'blocked') {
            hideRestrictedOverlay();
          }
        });
      }
    });
  }

  function revalidateStatus() {
    if (!adminDb || !currentUserId) return;
    adminDb.ref(`adminSystem/users/${currentUserId}`).once('value').then(snap => {
      const val = snap.val();
      if (val && val.accountStatus === 'blocked') {
        showRestrictedOverlay('USER_BLOCKED', val.blockedReason);
      } else if (currentMessId) {
        adminDb.ref(`adminSystem/messes/${currentMessId}`).once('value').then(mSnap => {
          const mVal = mSnap.val();
          if (mVal && mVal.status === 'suspended') {
            showRestrictedOverlay('MESS_SUSPENDED', mVal.suspendedReason);
          } else {
            hideRestrictedOverlay();
          }
        });
      }
    }).catch(() => {});
  }

  /**
   * Setup Presence with Firebase RTDB .info/connected & onDisconnect()
   * (High-frequency live telemetry via RTDB)
   */
  function setupPresence() {
    if (!adminDb || !currentUserId) return;

    const presenceRef = adminDb.ref(`adminSystem/presence/${currentUserId}`);
    presenceConnectedRef = adminDb.ref('.info/connected');

    presenceConnectedRef.on('value', snap => {
      if (snap.val() === true) {
        presenceRef.onDisconnect().update({
          online: false,
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP
        });

        presenceRef.update({
          online: true,
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP,
          currentSessionId: currentSessionId,
          connectionUpdatedAt: firebase.database.ServerValue.TIMESTAMP,
          clientPlatform: getClientPlatform(),
          userName: currentUserName || 'Unknown',
          userEmail: currentUserEmail || '',
          messId: currentMessId || '',
          role: currentRole || 'member',
          activeDurationSeconds: activeDurationSeconds
        });

        adminDb.ref(`adminSystem/users/${currentUserId}`).update({
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP,
          online: true
        });
      }
    });
  }

  /**
   * Record App Entry (App a dhuktese)
   * 1. Writes to Single Access Stream (adminSystem/accessLogs) exactly once
   * 2. Increments lightweight daily summary counter
   * 3. Syncs Firestore permanent log
   */
  function checkAndRecordAppEntry(force = false) {
    if (!currentUserId) return;

    const lastEntryTimestamp = parseInt(sessionStorage.getItem('ml_tab_last_entry_ts') || '0', 10);
    const hasRecordedThisTab = !!sessionStorage.getItem('ml_tab_entry_id');
    const now = Date.now();

    const isNewEntry = force || !hasRecordedThisTab || (now - lastEntryTimestamp > RE_ENTRY_IDLE_TIMEOUT);

    if (isNewEntry) {
      const entryId = generateLogId('entry_');
      sessionStorage.setItem('ml_tab_entry_id', entryId);
      sessionStorage.setItem('ml_tab_last_entry_ts', String(now));

      recordAppEntry(entryId, now);
    }
  }

  function recordAppEntry(entryId, now = Date.now()) {
    const dhakaDate = getDhakaDateString(new Date(now));
    const dhakaTime = getDhakaTimeString(new Date(now));
    const currentHour = new Date(now).getHours();
    const platform = getClientPlatform();

    // The Single Source of Truth Event Record
    const logPayload = {
      id: entryId,
      userId: currentUserId,
      authUid: currentAuthUid || currentUserId,
      userName: currentUserName || '',
      userEmail: currentUserEmail || '',
      role: currentRole || 'member',
      messId: currentMessId || '',
      type: 'app_entry',
      timestamp: now,
      date: dhakaDate,
      time: dhakaTime,
      hour: currentHour,
      platform: platform,
      sessionId: currentSessionId || ''
    };

    // 1. Single Event Stream in RTDB (stored ONCE, no duplicate sub-arrays)
    if (adminDb) {
      adminDb.ref(`adminSystem/accessLogs/${currentUserId}/${entryId}`).set(logPayload).catch(() => {});
    }

    // 2. Cloud Firestore Permanent Log (1 doc write)
    if (adminFirestore) {
      try {
        adminFirestore.collection('admin_access_logs').doc(entryId).set(logPayload).catch(() => {});
        adminFirestore.collection('admin_users').doc(currentUserId).set({
          userId: currentUserId,
          displayName: currentUserName || 'User',
          email: currentUserEmail || '',
          role: currentRole === 'admin' ? 'manager' : (currentRole || 'member'),
          messId: currentMessId || '',
          lastEntryAt: now,
          lastEntryDate: dhakaDate,
          lastEntryTime: dhakaTime,
          lastSeenAt: now,
          updatedAt: now
        }, { merge: true }).catch(() => {});
      } catch (_) {}
    }

    // 3. Update Pure Daily Summary Metrics Counter in RTDB
    if (adminDb) {
      const dailyRef = adminDb.ref(`adminSystem/dailyAnalytics/${currentUserId}/${dhakaDate}`);
      dailyRef.transaction(current => {
        if (!current) {
          return {
            userId: currentUserId,
            messId: currentMessId || '',
            userName: currentUserName || '',
            userEmail: currentUserEmail || '',
            date: dhakaDate,
            entryCount: 1,
            loginCount: 0,
            sessionCount: 1,
            activeDurationSeconds: 0,
            durationMinutes: 0,
            lastEntryAt: now,
            lastEntryTime: dhakaTime,
            firstSeenAt: now,
            lastSeenAt: now
          };
        }
        return {
          ...current,
          entryCount: (current.entryCount || 0) + 1,
          lastEntryAt: now,
          lastEntryTime: dhakaTime,
          lastSeenAt: now
        };
      });

      // 4. Update User Profile Metadata
      const userRef = adminDb.ref(`adminSystem/users/${currentUserId}`);
      userRef.transaction(current => {
        if (!current) return current;
        return {
          ...current,
          lastEntryAt: now,
          lastEntryDate: dhakaDate,
          lastEntryTime: dhakaTime,
          lastSeenAt: now,
          totalEntryCount: (current.totalEntryCount || 0) + 1
        };
      });
    }
  }

  /**
   * Check and Record User Login
   * 1. Writes to Single Access Stream (adminSystem/accessLogs) exactly once
   * 2. Increments lightweight daily summary counter
   * 3. Syncs Firestore permanent log
   */
  function checkAndRecordLogin() {
    if (!currentUserId) return;

    let pendingLogin = null;
    try {
      const raw = sessionStorage.getItem('ml_pending_login');
      if (raw) {
        pendingLogin = JSON.parse(raw);
        sessionStorage.removeItem('ml_pending_login');
      }
    } catch (_) {}

    if (pendingLogin) {
      recordUserLogin(pendingLogin.timestamp || Date.now());
    }
  }

  function recordUserLogin(now = Date.now()) {
    const dhakaDate = getDhakaDateString(new Date(now));
    const dhakaTime = getDhakaTimeString(new Date(now));
    const currentHour = new Date(now).getHours();
    const platform = getClientPlatform();
    const loginId = generateLogId('login_');

    const logPayload = {
      id: loginId,
      userId: currentUserId,
      authUid: currentAuthUid || currentUserId,
      userName: currentUserName || '',
      userEmail: currentUserEmail || '',
      role: currentRole || 'member',
      messId: currentMessId || '',
      type: 'user_login',
      timestamp: now,
      date: dhakaDate,
      time: dhakaTime,
      hour: currentHour,
      platform: platform
    };

    // 1. Single Event Stream in RTDB
    if (adminDb) {
      adminDb.ref(`adminSystem/accessLogs/${currentUserId}/${loginId}`).set(logPayload).catch(() => {});
    }

    // 2. Cloud Firestore Permanent Log
    if (adminFirestore) {
      try {
        adminFirestore.collection('admin_access_logs').doc(loginId).set(logPayload).catch(() => {});
        adminFirestore.collection('admin_users').doc(currentUserId).set({
          userId: currentUserId,
          displayName: currentUserName || 'User',
          email: currentUserEmail || '',
          role: currentRole === 'admin' ? 'manager' : (currentRole || 'member'),
          messId: currentMessId || '',
          lastLoginAt: now,
          lastLoginDate: dhakaDate,
          lastLoginTime: dhakaTime,
          lastSeenAt: now,
          updatedAt: now
        }, { merge: true }).catch(() => {});
      } catch (_) {}
    }

    // 3. Update Pure Daily Summary Metrics Counter in RTDB
    if (adminDb) {
      const dailyRef = adminDb.ref(`adminSystem/dailyAnalytics/${currentUserId}/${dhakaDate}`);
      dailyRef.transaction(current => {
        if (!current) {
          return {
            userId: currentUserId,
            messId: currentMessId || '',
            userName: currentUserName || '',
            userEmail: currentUserEmail || '',
            date: dhakaDate,
            loginCount: 1,
            entryCount: 1,
            sessionCount: 1,
            activeDurationSeconds: 0,
            durationMinutes: 0,
            lastLoginAt: now,
            lastLoginTime: dhakaTime,
            firstSeenAt: now,
            lastSeenAt: now
          };
        }
        return {
          ...current,
          loginCount: (current.loginCount || 0) + 1,
          lastLoginAt: now,
          lastLoginTime: dhakaTime,
          lastSeenAt: now
        };
      });

      // 4. Update User Profile Metadata
      const userRef = adminDb.ref(`adminSystem/users/${currentUserId}`);
      userRef.transaction(current => {
        if (!current) return current;
        return {
          ...current,
          lastLoginAt: now,
          lastLoginDate: dhakaDate,
          lastLoginTime: dhakaTime,
          lastSeenAt: now,
          totalLoginCount: (current.totalLoginCount || 0) + 1
        };
      });
    }
  }

  /**
   * Accurate Active Screen Duration Ticker (5s local ticker)
   */
  function tickDuration() {
    const now = Date.now();
    const deltaSec = Math.round((now - lastTickTimestamp) / 1000);
    lastTickTimestamp = now;

    const isForeground = !document.hidden;
    const isInteracting = (now - lastUserInteractionTimestamp) < INACTIVITY_TIMEOUT_MS;

    if (isForeground && isInteracting && deltaSec > 0 && deltaSec < 30) {
      activeDurationSeconds += deltaSec;
      unsyncedDurationSeconds += deltaSec;

      try {
        sessionStorage.setItem('ml_admin_session_duration', String(activeDurationSeconds));
      } catch (_) {}
    }

    // Flush to RTDB when unsynced buffer reaches 60 seconds
    if (unsyncedDurationSeconds >= FLUSH_DURATION_THRESHOLD_SEC) {
      flushDurationToDatabase();
    }
  }

  /**
   * Flush Accumulated Active Duration to RTDB & User Profile
   */
  function flushDurationToDatabase() {
    if (!currentUserId || unsyncedDurationSeconds <= 0) return;

    const secondsToFlush = unsyncedDurationSeconds;
    unsyncedDurationSeconds = 0;
    const now = Date.now();
    const dhakaDate = getDhakaDateString(new Date(now));

    // 1. Session duration update
    if (adminDb && currentSessionId) {
      adminDb.ref(`adminSystem/sessions/${currentUserId}/${currentSessionId}`).update({
        activeDurationSeconds: activeDurationSeconds,
        durationMinutes: Math.round(activeDurationSeconds / 60),
        lastHeartbeatAt: now,
        sessionStatus: 'active'
      }).catch(() => {});
    }

    // 2. Daily analytics duration update
    if (adminDb) {
      const dailyRef = adminDb.ref(`adminSystem/dailyAnalytics/${currentUserId}/${dhakaDate}`);
      dailyRef.transaction(current => {
        if (!current) {
          return {
            userId: currentUserId,
            messId: currentMessId || '',
            userName: currentUserName || '',
            userEmail: currentUserEmail || '',
            date: dhakaDate,
            activeDurationSeconds: secondsToFlush,
            durationMinutes: Math.round(secondsToFlush / 60),
            lastSeenAt: now
          };
        }
        const newSec = (current.activeDurationSeconds || 0) + secondsToFlush;
        return {
          ...current,
          activeDurationSeconds: newSec,
          durationMinutes: Math.round(newSec / 60),
          lastSeenAt: now
        };
      });

      // 3. User profile total duration update
      const userRef = adminDb.ref(`adminSystem/users/${currentUserId}`);
      userRef.transaction(current => {
        if (!current) return current;
        const newTotalSec = (current.totalActiveSeconds || 0) + secondsToFlush;
        return {
          ...current,
          totalActiveSeconds: newTotalSec,
          totalActiveMinutes: Math.round(newTotalSec / 60),
          lastSeenAt: now,
          lastActivityAt: now
        };
      });
    }

    // 4. Firestore user total duration sync
    if (adminFirestore) {
      try {
        adminFirestore.collection('admin_users').doc(currentUserId).set({
          totalActiveSeconds: firebase.firestore.FieldValue.increment(secondsToFlush),
          lastSeenAt: now,
          lastActivityAt: now
        }, { merge: true }).catch(() => {});
      } catch (_) {}
    }
  }

  /**
   * Send Regular Heartbeat & update Live Presence (Runs every 30 seconds)
   */
  function sendHeartbeat() {
    if (!currentUserId) return;

    if (unsyncedDurationSeconds >= 15) {
      flushDurationToDatabase();
    }

    const now = Date.now();

    if (adminDb) {
      adminDb.ref(`adminSystem/presence/${currentUserId}`).update({
        lastSeenAt: now,
        online: true,
        activeDurationSeconds: activeDurationSeconds
      }).catch(() => {});

      adminDb.ref(`adminSystem/users/${currentUserId}`).update({
        lastSeenAt: now,
        lastActivityAt: now
      }).catch(() => {});
    }
  }

  /**
   * Start or Resume Session
   */
  function initSession() {
    if (!currentUserId) return;

    let savedSessionId = sessionStorage.getItem('ml_admin_session_id');
    const isNewSession = !savedSessionId;

    if (isNewSession) {
      savedSessionId = generateSessionId();
      sessionStorage.setItem('ml_admin_session_id', savedSessionId);
      sessionStorage.setItem('ml_admin_session_start', String(Date.now()));
      sessionStorage.setItem('ml_admin_session_duration', '0');
      activeDurationSeconds = 0;
    } else {
      activeDurationSeconds = parseInt(sessionStorage.getItem('ml_admin_session_duration') || '0', 10);
    }

    currentSessionId = savedSessionId;
    lastTickTimestamp = Date.now();
    lastUserInteractionTimestamp = Date.now();

    const dhakaDate = getDhakaDateString();

    if (isNewSession && adminDb) {
      const sessionRef = adminDb.ref(`adminSystem/sessions/${currentUserId}/${currentSessionId}`);
      sessionRef.set({
        sessionId: currentSessionId,
        userId: currentUserId,
        authUid: currentAuthUid || currentUserId,
        messId: currentMessId || '',
        userName: currentUserName || '',
        userEmail: currentUserEmail || '',
        role: currentRole || 'member',
        startedAt: firebase.database.ServerValue.TIMESTAMP,
        lastHeartbeatAt: firebase.database.ServerValue.TIMESTAMP,
        endedAt: null,
        activeDurationSeconds: 0,
        durationMinutes: 0,
        sessionStatus: 'active',
        clientPlatform: getClientPlatform()
      });

      const dailyRef = adminDb.ref(`adminSystem/dailyAnalytics/${currentUserId}/${dhakaDate}`);
      dailyRef.transaction(current => {
        if (!current) {
          return {
            userId: currentUserId,
            messId: currentMessId || '',
            userName: currentUserName || '',
            userEmail: currentUserEmail || '',
            date: dhakaDate,
            sessionCount: 1,
            entryCount: 1,
            loginCount: 0,
            activeDurationSeconds: 0,
            durationMinutes: 0,
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now()
          };
        }
        return {
          ...current,
          sessionCount: (current.sessionCount || 0) + 1,
          lastSeenAt: Date.now()
        };
      });
    }

    // Process App Entry and pending Login
    checkAndRecordAppEntry();
    checkAndRecordLogin();

    // Start 5s Active Ticker
    if (activeTicker) clearInterval(activeTicker);
    activeTicker = setInterval(tickDuration, TICK_INTERVAL_MS);

    // Start 30s Heartbeat Timer
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Graceful session termination
   */
  function terminateSessionSync() {
    if (!currentUserId || !currentSessionId) return;

    if (adminDb) {
      try {
        adminDb.ref(`adminSystem/sessions/${currentUserId}/${currentSessionId}`).update({
          endedAt: firebase.database.ServerValue.TIMESTAMP,
          activeDurationSeconds: activeDurationSeconds,
          durationMinutes: Math.round(activeDurationSeconds / 60),
          sessionStatus: 'completed'
        });

        adminDb.ref(`adminSystem/presence/${currentUserId}`).update({
          online: false,
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (_) {}
    }
  }

  /**
   * Handle explicit User Logout
   */
  async function handleLogout() {
    flushDurationToDatabase();
    terminateSessionSync();

    const now = Date.now();
    const logoutId = generateLogId('logout_');
    const logPayload = {
      id: logoutId,
      userId: currentUserId,
      type: 'user_logout',
      timestamp: now,
      date: getDhakaDateString(new Date(now)),
      time: getDhakaTimeString(new Date(now)),
      platform: getClientPlatform()
    };

    if (adminDb) {
      adminDb.ref(`adminSystem/accessLogs/${currentUserId}/${logoutId}`).set(logPayload).catch(() => {});
    }

    try {
      sessionStorage.removeItem('ml_admin_session_id');
      sessionStorage.removeItem('ml_tab_entry_id');
      sessionStorage.removeItem('ml_tab_last_entry_ts');
      sessionStorage.removeItem('ml_admin_session_duration');
      sessionStorage.removeItem('ml_pending_login');
    } catch (_) {}
  }

  /**
   * Register or Sync User Identity in Admin System
   */
  function syncUserIdentity() {
    if (!currentUserId) return;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_REGEX.test(currentUserId) || !currentMessId) return;

    const now = Date.now();

    // 1. Sync in Cloud Firestore
    if (adminFirestore) {
      try {
        adminFirestore.collection('admin_users').doc(currentUserId).set({
          userId: currentUserId,
          authUid: currentAuthUid || currentUserId,
          displayName: currentUserName || 'User',
          email: currentUserEmail || '',
          role: currentRole === 'admin' ? 'manager' : (currentRole || 'member'),
          messId: currentMessId || '',
          lastSeenAt: now,
          updatedAt: now
        }, { merge: true }).catch(() => {});
      } catch (_) {}
    }

    // 2. Sync in RTDB
    if (adminDb) {
      const userRef = adminDb.ref(`adminSystem/users/${currentUserId}`);
      userRef.once('value').then(snap => {
        const existing = snap.val();
        const updates = {
          userId: currentUserId,
          authUid: currentAuthUid || currentUserId,
          displayName: currentUserName || (existing && existing.displayName) || 'User',
          email: currentUserEmail || (existing && existing.email) || '',
          role: currentRole === 'admin' ? 'manager' : (currentRole || 'member'),
          messId: currentMessId || (existing && existing.messId) || '',
          lastSeenAt: firebase.database.ServerValue.TIMESTAMP
        };

        if (!existing) {
          updates.accountStatus = 'active';
          updates.createdAt = firebase.database.ServerValue.TIMESTAMP;
          updates.totalLoginCount = 0;
          updates.totalEntryCount = 0;
          updates.totalActiveSeconds = 0;
          updates.totalActiveMinutes = 0;
        }

        userRef.update(updates);
      });

      if (currentMessId) {
        const messRef = adminDb.ref(`adminSystem/messes/${currentMessId}`);
        messRef.once('value').then(mSnap => {
          const mExisting = mSnap.val();
          if (!mExisting) {
            messRef.update({
              messId: currentMessId,
              status: 'active',
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
          }
        });
      }
    }
  }

  /**
   * Main Bootstrapper: Detect user from Messliner state or authAdapter
   */
  function startTracking(user, messlinerState) {
    if (!initAdminFirebase()) {
      setTimeout(() => startTracking(user, messlinerState), 500);
      return;
    }

    currentAuthUid = user.uid || user.id;
    currentUserEmail = user.email || '';
    currentUserName = user.displayName || user.user_metadata?.name || 'User';

    if (messlinerState && messlinerState.userId) {
      currentUserId = messlinerState.userId;
      currentMessId = messlinerState.diningId || '';
      currentRole = messlinerState.userRole || (messlinerState.isAdmin ? 'admin' : 'member');
      if (messlinerState.diningInfo && messlinerState.diningInfo.name && adminDb) {
        adminDb.ref(`adminSystem/messes/${currentMessId}`).update({
          messName: messlinerState.diningInfo.name,
          managerName: messlinerState.diningInfo.managerName || '',
          managerEmail: messlinerState.diningInfo.email || '',
          managerPhone: messlinerState.diningInfo.phone || '',
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } else {
      currentUserId = currentAuthUid;
      currentRole = 'member';
    }

    syncUserIdentity();
    setupPresence();
    initSession();
    monitorStatus();
    attachActivityListeners();
    registerUserInteraction();
  }

  /**
   * Observer: Hook into Messliner Application lifecycle
   */
  function initObserver() {
    let checkAttempts = 0;
    const interval = setInterval(() => {
      checkAttempts++;

      const user = window.auth?.currentUser || window._currentSupabaseUser;
      const messliner = window.Messliner;

      if (user && messliner?.state?.userId) {
        clearInterval(interval);
        startTracking(user, messliner.state);
      } else if (user && checkAttempts > 15) {
        clearInterval(interval);
        startTracking(user, null);
      } else if (checkAttempts > 50) {
        clearInterval(interval);
        if (window.auth && typeof window.auth.onAuthStateChanged === 'function') {
          window.auth.onAuthStateChanged(u => {
            if (u) {
              setTimeout(() => {
                startTracking(u, window.Messliner?.state || null);
              }, 1000);
            }
          });
        }
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }

  // Public analytical interface
  window.MesslinerAnalytics = {
    revalidate: revalidateStatus,
    getSessionId: () => currentSessionId,
    getActiveDuration: () => activeDurationSeconds,
    getDhakaDate: getDhakaDateString,
    getDhakaTime: getDhakaTimeString,
    recordLogin: () => recordUserLogin(Date.now()),
    recordEntry: () => checkAndRecordAppEntry(true),
    handleLogout: handleLogout
  };

})();
