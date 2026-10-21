/**
 * Messliner Mobile Bridge
 * Real-time status bar color synchronization and native app integration
 * for Flutter Native Wrapper (https://messliner.vercel.app/)
 */
(function () {
  'use strict';

  // Instant runtime suppression of blue tap highlight and scrollbars
  try {
    const styleId = 'ml-native-polish-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        *, *::before, *::after {
          -webkit-tap-highlight-color: transparent !important;
          outline: none;
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
  } catch (e) { }

  let lastSentColor = null;
  let rafId = null;

  // Helper to convert rgb/rgba to #RRGGBB
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

  // Detect topmost non-transparent background color at viewport top
  function detectTopColor() {
    const sampleX = Math.floor(window.innerWidth / 2);
    const sampleY = 8; // Sample point just under the top seam

    let elem = document.elementFromPoint(sampleX, sampleY);

    while (elem && elem !== document.documentElement) {
      // Check special hero/banner containers with gradients
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

    // Check body or html background
    if (document.body) {
      const bodyBg = rgbToHex(window.getComputedStyle(document.body).backgroundColor);
      if (bodyBg) return bodyBg;
    }

    // Check theme-color meta tag
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && metaTheme.content && metaTheme.content !== 'transparent') {
      return metaTheme.content.toUpperCase();
    }

    return '#064E3B'; // Messliner default brand green
  }

  function sendColor(hexColor) {
    if (!hexColor || hexColor === lastSentColor) return;
    lastSentColor = hexColor;

    // Update <meta name="theme-color"> tag dynamically
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', hexColor);

    // Send to Flutter Native App via JavaScript Channel
    if (window.StatusBarChannel && typeof window.StatusBarChannel.postMessage === 'function') {
      try {
        window.StatusBarChannel.postMessage(hexColor);
      } catch (e) {
        console.warn('[Messliner Bridge] Error sending color to Flutter:', e);
      }
    }
  }

  function sync() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const color = detectTopColor();
      sendColor(color);
    });
  }

  // Expose global API
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

  // Hook into History API for SPA Navigation
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

  // Scroll and Resize Listeners
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });

  document.addEventListener('DOMContentLoaded', () => {
    checkNativeEnvironment();
    sync();
  });

  window.addEventListener('load', () => {
    checkNativeEnvironment();
    sync();
  });

  // Observe DOM changes (active tab switches in SPA)
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

  // Initial immediate sync
  sync();
})();
