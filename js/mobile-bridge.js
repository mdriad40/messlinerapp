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
      if (loader && loader.style.display !== 'none') {
        loader.classList.add('fade-out');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 220);
      }

      // If on login page and authPage is hidden, show it
      if (!isDashboardPage) {
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
  // 3. REAL-TIME NATIVE STATUS BAR COLOR SYNC
  // ========================================================
  let lastSentColor = null;
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
      const sampleX = Math.floor(window.innerWidth / 2);
      const sampleY = 8;

      let elem = document.elementFromPoint(sampleX, sampleY);

      while (elem && elem !== document.documentElement) {
        if (elem.classList.contains('mymeal-mobile-hero-wrapper')) {
          return '#06281B'; // Deep Forest Green Hero Banner
        }
        if (elem.classList.contains('auth-left-pane')) {
          return '#064E3B'; // Emerald Green Auth Banner
        }
        if (elem.classList.contains('top-header')) {
          return '#FFFFFF'; // Clean White Header
        }

        const style = window.getComputedStyle(elem);
        const hex = rgbToHex(style.backgroundColor);
        if (hex) {
          return hex;
        }

        elem = elem.parentElement;
      }

      if (document.body) {
        const bodyBg = rgbToHex(window.getComputedStyle(document.body).backgroundColor);
        if (bodyBg) return bodyBg;
      }

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme && metaTheme.content && metaTheme.content !== 'transparent') {
        return metaTheme.content.toUpperCase();
      }
    } catch (_) { }

    return '#064E3B'; // Messliner default brand green
  }

  function sendColor(hexColor) {
    if (!hexColor || hexColor === lastSentColor) return;
    lastSentColor = hexColor;

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', hexColor);

    if (window.StatusBarChannel && typeof window.StatusBarChannel.postMessage === 'function') {
      try {
        window.StatusBarChannel.postMessage(hexColor);
      } catch (e) { }
    }
  }

  function sync() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const color = detectTopColor();
      sendColor(color);
    });
  }

  window.syncMesslinerStatusBar = function (forcedColor) {
    if (forcedColor) {
      sendColor(forcedColor);
    } else {
      sync();
    }
  };

  function checkNativeEnvironment() {
    if (window.StatusBarChannel) {
      document.documentElement.classList.add('is-native-flutter-app');
      if (document.body) {
        document.body.classList.add('is-native-flutter-app');
      }
    }
  }

  // Intercept History API for SPA Navigation
  const originalPushState = history.pushState;
  if (originalPushState) {
    history.pushState = function () {
      originalPushState.apply(this, arguments);
      setTimeout(sync, 50);
    };
  }

  const originalReplaceState = history.replaceState;
  if (originalReplaceState) {
    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      setTimeout(sync, 50);
    };
  }

  window.addEventListener('popstate', () => setTimeout(sync, 50));
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });

  document.addEventListener('DOMContentLoaded', () => {
    checkNativeEnvironment();
    sync();
  });

  // Observe DOM changes (active tab switches in SPA)
  try {
    const observer = new MutationObserver(() => {
      checkNativeEnvironment();
      sync();
    });

    if (document.body) {
      observer.observe(document.body, { attributes: true, childList: true, subtree: false });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { attributes: true, childList: true, subtree: false });
      });
    }
  } catch (_) { }

  // Initial immediate sync
  sync();
})();
