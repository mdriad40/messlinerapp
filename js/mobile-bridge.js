/**
 * Messliner Mobile Bridge & Native App Resilience Engine
 * Provides:
 * 1. Zero Blue Tap Highlight / Native Touch Feedback across all mobile browsers & WebViews
 * 2. Preloader Smoothness (Ensures preloader stays until data is loaded, no premature blank screen)
 * 3. Real-Time Dynamic Native Status Bar Color Tracking with Zero Latency
 * 4. Emergency Error Guard for Unhandled Exceptions
 */
(function () {
  'use strict';

  // ========================================================
  // 1. ELIMINATE BLUE TAP HIGHLIGHT & SCROLLBARS INSTANTLY
  // ========================================================
  try {
    const styleId = 'ml-native-polish-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        *, *::before, *::after {
          -webkit-tap-highlight-color: transparent !important;
          -webkit-touch-callout: none !important;
          outline: none;
        }
        :focus, :focus-visible, :active {
          -webkit-tap-highlight-color: transparent !important;
          outline: none !important;
        }
        @media (max-width: 1023px) {
          *::-webkit-scrollbar, ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            background: transparent !important;
          }
          *::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb,
          *::-webkit-scrollbar-track, ::-webkit-scrollbar-track {
            display: none !important;
            background: transparent !important;
          }
          html, body, * {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
    }
  } catch (e) {
    // Silent fail-safe
  }

  // ========================================================
  // 2. PRELOADER RESILIENCE (NO PREMATURE BLANK SCREEN)
  // ========================================================
  const isDashboardPage = window.location.pathname.includes('dashboard') ||
    window.location.href.includes('dashboard.html');

  function emergencyDismissLoader() {
    try {
      const loader = document.getElementById('pageLoader');
      if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 220);
      }

      // If on login page and authPage is hidden, show it; if on dashboard, ensure appShell is visible
      if (isDashboardPage) {
        const appShell = document.getElementById('appShell');
        if (appShell && (appShell.style.display === 'none' || window.getComputedStyle(appShell).display === 'none')) {
          appShell.style.display = 'flex';
        }
      } else {
        const authPage = document.getElementById('authPage');
        if (authPage && (authPage.style.display === 'none' || !authPage.style.display)) {
          authPage.style.display = 'flex';
        }
      }
    } catch (_) { }
  }

  // Emergency recurring safety watchdog:
  // Starts checking immediately; after 2.4s, unconditionally dismisses any lingering preloader!
  let _watchdogTicks = 0;
  const _loaderWatchdog = setInterval(function () {
    _watchdogTicks++;
    const loader = document.getElementById('pageLoader');
    if (_watchdogTicks >= 6) { // ~2.4 seconds
      if (loader && loader.style.display !== 'none') {
        emergencyDismissLoader();
      }
      clearInterval(_loaderWatchdog);
    }
  }, 400);

  // If any unhandled script error or promise rejection occurs, dismiss loader safely
  window.addEventListener('error', function () {
    setTimeout(emergencyDismissLoader, 600);
  });
  window.addEventListener('unhandledrejection', function () {
    setTimeout(emergencyDismissLoader, 600);
  });

  // ========================================================
  // 3. REAL-TIME NATIVE STATUS BAR & FOOTER COLOR SYNC
  // ========================================================
  let lastSentPayload = null;
  let rafId = null;

  function rgbToHex(rgbStr) {
    if (!rgbStr || rgbStr === 'transparent' || rgbStr === 'rgba(0, 0, 0, 0)') {
      return null;
    }
    if (rgbStr.startsWith('#')) {
      return rgbStr.length === 4
        ? '#' + rgbStr[1] + rgbStr[1] + rgbStr[2] + rgbStr[2] + rgbStr[3] + rgbStr[3]
        : rgbStr.toUpperCase();
    }
    const match = rgbStr.match(/\d+/g);
    if (!match || match.length < 3) return null;
    const r = parseInt(match[0], 10);
    const g = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const a = match[3] !== undefined ? parseFloat(match[3]) : 1;
    if (a === 0) return null;
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function detectTopColor() {
    try {
      const isDark = document.body && document.body.classList.contains('dark-theme');
      if (isDark) return '#0F172A';

      if (!isDashboardPage) {
        const authPane = document.querySelector('.auth-left-pane, #authPage');
        if (authPane && window.getComputedStyle(authPane).display !== 'none') {
          return '#064E3B';
        }
      }

      // 1. Check active page section for hero banner or member dining
      const activeSection = document.querySelector('.page-section.active');
      if (activeSection) {
        const heroBanner = activeSection.querySelector('.mymeal-mobile-hero-wrapper, .fp-hero-banner');
        if (heroBanner) {
          return '#06281B';
        }

        const isUserRole = document.body.classList.contains('role-user') || 
                           (window.Messliner && Messliner.state && Messliner.state.role === 'user');
        if (isUserRole && (activeSection.id === 'page-overview' || activeSection.id === 'page-dashboard' || activeSection.id === 'page-mymeal')) {
          return '#06281B';
        }
      }

      // 2. Check visible top header background
      const topHeader = document.querySelector('.top-header');
      if (topHeader && window.getComputedStyle(topHeader).display !== 'none') {
        const bg = window.getComputedStyle(topHeader).backgroundColor;
        const hex = rgbToHex(bg);
        if (hex && hex !== 'transparent') return hex;
      }
    } catch (_) { }

    return isDashboardPage ? '#FFFFFF' : '#064E3B';
  }

  function detectBottomColor() {
    try {
      const isDark = document.body && document.body.classList.contains('dark-theme');
      if (isDark) {
        return '#0F172A';
      }
      return '#FFFFFF';
    } catch (_) { }
    return '#FFFFFF';
  }

  function sendColor(topHex, bottomHex) {
    if (!topHex) topHex = isDashboardPage ? '#FFFFFF' : '#064E3B';
    if (!bottomHex) bottomHex = '#FFFFFF';

    const payloadKey = `${topHex}_${bottomHex}`;
    if (payloadKey === lastSentPayload) return;
    lastSentPayload = payloadKey;

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta.getAttribute('content') !== topHex) {
      meta.setAttribute('content', topHex);
    }

    const payload = JSON.stringify({
      statusBarColor: topHex,
      navBarColor: bottomHex
    });

    if (window.StatusBarChannel && typeof window.StatusBarChannel.postMessage === 'function') {
      try {
        window.StatusBarChannel.postMessage(payload);
      } catch (e) { }
    }
  }

  function sync() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const topColor = detectTopColor();
      const bottomColor = detectBottomColor();
      sendColor(topColor, bottomColor);
    });
  }

  window.syncMesslinerStatusBar = function (forcedTop, forcedBottom) {
    if (forcedTop) {
      sendColor(forcedTop, forcedBottom || '#FFFFFF');
    } else {
      sync();
    }
  };

  let debounceTimer = null;
  function debouncedSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, 80);
  }

  function checkNativeEnvironment() {
    if (window.StatusBarChannel) {
      if (!document.documentElement.classList.contains('is-native-flutter-app')) {
        document.documentElement.classList.add('is-native-flutter-app');
      }
      if (document.body && !document.body.classList.contains('is-native-flutter-app')) {
        document.body.classList.add('is-native-flutter-app');
      }
    }
  }

  // Intercept History API for SPA Navigation (delay sync until tab transition finishes)
  const originalPushState = history.pushState;
  if (originalPushState) {
    history.pushState = function () {
      originalPushState.apply(this, arguments);
      setTimeout(debouncedSync, 280);
    };
  }

  const originalReplaceState = history.replaceState;
  if (originalReplaceState) {
    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      setTimeout(debouncedSync, 280);
    };
  }

  window.addEventListener('hashchange', () => sync());
  window.addEventListener('popstate', () => sync());
  window.addEventListener('resize', debouncedSync, { passive: true });

  document.addEventListener('DOMContentLoaded', () => {
    checkNativeEnvironment();
    sync();
  });

  // Observe theme changes on body with debounce
  try {
    const observer = new MutationObserver(() => {
      checkNativeEnvironment();
      debouncedSync();
    });

    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: false });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: false });
      });
    }
  } catch (_) { }

  // Initial immediate sync
  sync();

  // ========================================================
  // 4. UNIVERSAL FACEBOOK-STYLE PULL-TO-REFRESH WITH REVERSE / CANCEL
  // ========================================================
  (function initUniversalPullToRefresh() {
    window._messlinerSwipeInstalled = true; // Prevents any duplicate or old injected script

    let ptrEl = null;
    let arrowBox = null;
    let isTracking = false;
    let isPulling = false;
    let isRefreshing = false;
    let startY = 0;
    let startX = 0;
    let currentY = 0;
    const PULL_THRESHOLD = 68;

    function injectPtrStylesAndDom() {
      if (document.getElementById('ml-ptr-styles')) return;

      const style = document.createElement('style');
      style.id = 'ml-ptr-styles';
      style.textContent = `
        #ml-ptr-spinner-card {
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translate3d(-50%, -75px, 0);
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #FFFFFF;
          color: #105325;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18), 0 1px 4px rgba(0, 0, 0, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999999;
          pointer-events: none;
          opacity: 0;
          will-change: transform, opacity;
          transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.18s ease;
        }
        body.dark-theme #ml-ptr-spinner-card {
          background: #1E293B;
          color: #2ECC71;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
        }
        .ml-ptr-arrow-box {
          display: flex;
          align-items: center;
          justify-content: center;
          transform-origin: center center;
          transition: transform 0.08s linear;
        }
        .ml-ptr-spin-box {
          display: none;
          align-items: center;
          justify-content: center;
        }
        #ml-ptr-spinner-card.is-refreshing .ml-ptr-arrow-box {
          display: none;
        }
        #ml-ptr-spinner-card.is-refreshing .ml-ptr-spin-box {
          display: flex;
        }
        .ml-ptr-spin-icon {
          animation: ml-ptr-rotate 0.75s linear infinite;
        }
        @keyframes ml-ptr-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      (document.head || document.documentElement).appendChild(style);

      ptrEl = document.createElement('div');
      ptrEl.id = 'ml-ptr-spinner-card';
      ptrEl.setAttribute('aria-hidden', 'true');
      ptrEl.innerHTML = `
        <div class="ml-ptr-arrow-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
        </div>
        <div class="ml-ptr-spin-box">
          <svg class="ml-ptr-spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" stroke-dasharray="38" stroke-dashoffset="12" />
          </svg>
        </div>
      `;
      (document.body || document.documentElement).appendChild(ptrEl);
      arrowBox = ptrEl.querySelector('.ml-ptr-arrow-box');
    }

    function getActiveScrollTop(target) {
      try {
        let el = target;
        while (el && el !== document.body && el !== document.documentElement) {
          if (el.scrollHeight > el.clientHeight + 2) {
            const overflowY = window.getComputedStyle(el).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
              return el.scrollTop;
            }
          }
          el = el.parentElement;
        }
        const contentArea = document.querySelector('.content-area') ||
          document.querySelector('.dashboard-container') ||
          document.querySelector('#appShell');
        if (contentArea && contentArea.scrollHeight > contentArea.clientHeight) {
          return contentArea.scrollTop;
        }
      } catch (_) { }
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    function canStartPull(e) {
      if (!e.touches || e.touches.length !== 1 || isRefreshing) return false;
      const target = e.target;
      if (target.closest('input, textarea, select, button, a, .modal, .swal2-container, .bottom-sheet, .no-ptr')) {
        return false;
      }
      if (document.querySelector('.modal.show, .modal.active, .swal2-container')) {
        return false;
      }
      return getActiveScrollTop(target) <= 2;
    }

    window.addEventListener('touchstart', function (e) {
      if (!ptrEl) injectPtrStylesAndDom();
      if (!canStartPull(e)) {
        isTracking = false;
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      currentY = startY;
      isTracking = true;
      isPulling = false;
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (!isTracking || isRefreshing || !e.touches || e.touches.length !== 1) return;
      currentY = e.touches[0].clientY;
      const diffY = currentY - startY;
      const diffX = e.touches[0].clientX - startX;

      if (!isPulling) {
        if (diffY > 10 && diffY > Math.abs(diffX) * 1.3 && getActiveScrollTop(e.target) <= 2) {
          isPulling = true;
          if (ptrEl) ptrEl.style.transition = 'none';
        } else if (diffY < -5 || Math.abs(diffX) > 15) {
          isTracking = false;
          return;
        }
      }

      if (isPulling && ptrEl) {
        if (diffY <= 0) {
          ptrEl.style.transform = 'translate3d(-50%, -75px, 0)';
          ptrEl.style.opacity = '0';
          if (arrowBox) arrowBox.style.transform = 'rotate(0deg)';
        } else {
          const pullDist = Math.min(diffY * 0.44, 85);
          ptrEl.style.transform = `translate3d(-50%, ${pullDist - 60}px, 0)`;
          ptrEl.style.opacity = String(Math.min(pullDist / 35, 1));

          const progress = Math.min(pullDist / PULL_THRESHOLD, 1);
          if (arrowBox) {
            arrowBox.style.transform = `rotate(${progress * 180}deg)`;
          }
        }
      }
    }, { passive: true });

    function cancelPull() {
      isTracking = false;
      isPulling = false;
      if (ptrEl && !isRefreshing) {
        ptrEl.style.transition = 'transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.18s ease';
        ptrEl.style.transform = 'translate3d(-50%, -75px, 0)';
        ptrEl.style.opacity = '0';
        if (arrowBox) arrowBox.style.transform = 'rotate(0deg)';
      }
    }

    window.addEventListener('touchend', function (e) {
      if (!isTracking || !isPulling || isRefreshing) {
        cancelPull();
        return;
      }
      const diffY = currentY - startY;
      const pullDist = Math.min(diffY * 0.44, 85);

      if (pullDist >= PULL_THRESHOLD) {
        isRefreshing = true;
        if (ptrEl) {
          ptrEl.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.15s ease';
          ptrEl.style.transform = 'translate3d(-50%, 18px, 0)';
          ptrEl.style.opacity = '1';
          ptrEl.classList.add('is-refreshing');
        }

        if (navigator.vibrate) {
          try { navigator.vibrate(15); } catch (_) { }
        }

        setTimeout(() => {
          if (window.SwipeRefreshChannel && typeof window.SwipeRefreshChannel.postMessage === 'function') {
            window.SwipeRefreshChannel.postMessage('refresh');
          } else {
            window.location.reload();
          }
        }, 150);

        setTimeout(() => {
          if (isRefreshing) {
            isRefreshing = false;
            if (ptrEl) {
              ptrEl.classList.remove('is-refreshing');
              cancelPull();
            }
          }
        }, 4500);
      } else {
        cancelPull();
      }

      isTracking = false;
      isPulling = false;
    }, { passive: true });

    window.addEventListener('touchcancel', cancelPull, { passive: true });

    document.addEventListener('DOMContentLoaded', injectPtrStylesAndDom);
  })();
})();
