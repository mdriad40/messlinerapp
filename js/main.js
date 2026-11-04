/* ==========================================
   Live Server & Localhost Clean URL Adapter
   (Zero effect on production, preserves clean URLs on Vercel/Netlify)
   ========================================== */
(function () {
  try {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    if (isLocal) {
      const normalizeLinks = () => {
        document.querySelectorAll('a[href="/dashboard"], a[href="/dashboard/"]').forEach(a => a.setAttribute('href', 'dashboard.html'));
        document.querySelectorAll('a[href="/login"], a[href="/login/"]').forEach(a => a.setAttribute('href', 'login.html'));
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', normalizeLinks);
      } else {
        normalizeLinks();
      }
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (href === '/dashboard' || href === '/dashboard/') {
          link.setAttribute('href', 'dashboard.html');
        } else if (href === '/login' || href === '/login/') {
          link.setAttribute('href', 'login.html');
        }
      }, true);
    }
  } catch (_) {}
})();

/**
 * Messliner Official Landing Page & Web/Native App Portal JavaScript
 * Handles Interactivity, Modals, Dynamic Bazar Ratio Calculator, FAQs, & Download Handlers
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initTypewriter();
  initBazarCalculator();
  initPricingToggle();
  initFaqAccordion();
  initFaqSearch();
  initModalSystem();
  initMobileMenu();
  initDynamicQrCode();
  initScrollAnimations();
  initIosClock();
  initPinnedDemoScroll();
  if (window.innerWidth <= 768) {
    switchMockupView('mobile');
  }
});

/* ==========================================
   0. HERO TYPEWRITER ANIMATION EFFECT
   ========================================== */
function initTypewriter() {
  const target = document.getElementById('typewriterTarget');
  if (!target) return;

  const words = [
    'Zero Billing Disputes',
    'Automated Bazar Ratio Math',
    'Real-time Meal Ledgers',
    'Instant Deposit SMS Alerts'
  ];

  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typeSpeed = 90;

  function type() {
    const currentWord = words[wordIndex];

    if (isDeleting) {
      target.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 45;
    } else {
      target.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 85;
    }

    if (!isDeleting && charIndex === currentWord.length) {
      typeSpeed = 2200;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeSpeed = 400;
    }

    setTimeout(type, typeSpeed);
  }

  type();
}

/* ==========================================
   1. NAVBAR SCROLL EFFECT & SMOOTH NAV
   ========================================== */
function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Smooth scroll links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElem = document.querySelector(targetId);
      if (targetElem) {
        e.preventDefault();
        targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

/* ==========================================
   2. BAZER RATIO / MEAL RATE CALCULATOR
   ========================================== */
function initBazarCalculator() {
  const expenseInput = document.getElementById('calcTotalExpense');
  const mealsInput = document.getElementById('calcTotalMeals');
  const userMealsInput = document.getElementById('calcUserMeals');

  const rateDisplay = document.getElementById('calcResultRate');
  const userTotalDisplay = document.getElementById('calcResultUserTotal');

  if (!expenseInput || !mealsInput) return;

  function calculate() {
    const totalExpense = parseFloat(expenseInput.value) || 0;
    const totalMeals = parseFloat(mealsInput.value) || 0;
    const userMeals = parseFloat(userMealsInput ? userMealsInput.value : 0) || 0;

    if (totalMeals <= 0 || totalExpense <= 0) {
      rateDisplay.textContent = '৳ 0.00 / meal';
      if (userTotalDisplay) userTotalDisplay.textContent = '৳ 0.00';
      return;
    }

    const mealRate = totalExpense / totalMeals;
    const userCost = userMeals * mealRate;

    rateDisplay.textContent = `৳ ${mealRate.toFixed(2)} / meal`;
    rateDisplay.classList.remove('pulse');
    void rateDisplay.offsetWidth;
    rateDisplay.classList.add('pulse');

    if (userTotalDisplay) {
      userTotalDisplay.textContent = `৳ ${userCost.toFixed(2)}`;
    }
  }

  expenseInput.addEventListener('input', calculate);
  mealsInput.addEventListener('input', calculate);
  if (userMealsInput) userMealsInput.addEventListener('input', calculate);

  // Initial calculation
  calculate();
}

/* ==========================================
   3. PRICING MONTHLY / ANNUALLY TOGGLE
   ========================================== */
function initPricingToggle() {
  const toggleBtn = document.getElementById('pricingToggle');
  const priceFree = document.getElementById('priceFree');
  const pricePro = document.getElementById('pricePro');
  const priceEnterprise = document.getElementById('priceEnterprise');
  const periodLabels = document.querySelectorAll('.plan-price-period');

  if (!toggleBtn) return;

  let isAnnual = false;

  toggleBtn.addEventListener('click', () => {
    isAnnual = !isAnnual;
    toggleBtn.classList.toggle('active', isAnnual);

    if (isAnnual) {
      if (pricePro) pricePro.textContent = '৳ 399';
      if (priceEnterprise) priceEnterprise.textContent = '৳ 999';
      periodLabels.forEach(lbl => lbl.textContent = '/ month (billed yearly)');
    } else {
      if (pricePro) pricePro.textContent = '৳ 499';
      if (priceEnterprise) priceEnterprise.textContent = '৳ 1,299';
      periodLabels.forEach(lbl => lbl.textContent = '/ month (billed monthly)');
    }
  });
}

/* ==========================================
   4. FAQ ACCORDION
   ========================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items
      faqItems.forEach(i => i.classList.remove('open'));

      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
}

/* ==========================================
   5. FAQ SEARCH FILTER
   ========================================== */
function initFaqSearch() {
  const searchInput = document.getElementById('faqSearchInput');
  const faqItems = document.querySelectorAll('.faq-item');

  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    faqItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });
}

/* ==========================================
   6. MODAL SYSTEM
   ========================================== */
function initModalSystem() {
  const overlays = document.querySelectorAll('.modal-overlay');

  // Trigger buttons with data-modal="modalId"
  document.querySelectorAll('[data-modal]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modalId = trigger.getAttribute('data-modal');
      openModal(modalId);
    });
  });

  // Close buttons
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Click outside modal content to close
  overlays.forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  // ESC key to close
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

function openModal(id) {
  closeAllModals();
  const targetModal = document.getElementById(id);
  if (targetModal) {
    targetModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('active');
  });
  document.body.style.overflow = 'auto';
}

/* ==========================================
   7. MOBILE MENU TOGGLE
   ========================================== */
function initMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  if (!menuBtn || !navLinks) return;

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = navLinks.classList.toggle('active');
    menuBtn.classList.toggle('active', isActive);
    menuBtn.textContent = isActive ? '✕' : '☰';
  });

  // Close mobile menu when clicking any link inside it
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      menuBtn.classList.remove('active');
      menuBtn.textContent = '☰';
    });
  });

  // Close mobile menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navLinks.contains(e.target) && !menuBtn.contains(e.target)) {
      navLinks.classList.remove('active');
      menuBtn.classList.remove('active');
      menuBtn.textContent = '☰';
    }
  });
}

/* ==========================================
   8. NATIVE DOWNLOAD HELPER & TOAST NOTIFICATION
   ========================================== */
function triggerAppDownload(platform) {
  showToast(`Initiating Messliner Native ${platform} Download...`);
  setTimeout(() => {
    showToast(`Messliner Mobile/Desktop App v2.4.0 (${platform}) Ready!`);
  }, 1800);
}

function showToast(message) {
  let toast = document.getElementById('messlinerToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'messlinerToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: rgba(16, 185, 129, 0.9);
      backdrop-filter: blur(12px);
      color: #070a11;
      padding: 0.85rem 1.5rem;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.95rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 9999;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(20px);
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
  }, 3500);
}

/* ==========================================
   9. DYNAMIC STYLISH QR CODE GENERATOR
   ========================================== */
function initDynamicQrCode() {
  const downloadBtn = document.getElementById('ctaDownloadBtn');
  const qrContainer = document.getElementById('qrCodeContainer');

  if (!qrContainer) return;

  // Read target URL from qrContainer data-url or download button href
  let targetUrl = qrContainer.getAttribute('data-url') || (downloadBtn ? downloadBtn.getAttribute('href') : 'https://www.messliner.com/');

  // Convert relative URL to full absolute URL for mobile QR scanner compatibility
  if (targetUrl.startsWith('.')) {
    try {
      targetUrl = new URL(targetUrl, window.location.href).href;
    } catch (e) {
      targetUrl = window.location.origin + '/Ml_webApp/dashboard.html';
    }
  }

  // Generate stylish SVG QR Code with rounded finder patterns and capsule modules
  if (typeof window.generateStylishQrSvg === 'function') {
    qrContainer.innerHTML = window.generateStylishQrSvg(targetUrl, '#0f172a');
  } else {
    const qrImg = document.getElementById('ctaQrCodeImg');
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(targetUrl)}&color=0f172a&bgcolor=ffffff`;
    }
  }
}

/* ==========================================
   10. INTERSECTION OBSERVER SCROLL REVEAL ANIMATIONS
   ========================================== */
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('[data-animate]');

  if (!('IntersectionObserver' in window)) {
    animatedElements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.getAttribute('data-delay') || 0;

        setTimeout(() => {
          el.classList.add('is-visible');
        }, parseInt(delay, 10));

        obs.unobserve(el);
      }
    });
  }, observerOptions);

  animatedElements.forEach(el => observer.observe(el));
}

/* ==========================================
   11. LIVE DEMO MOCKUP DEVICE SWITCHER
   ========================================== */
function switchMockupView(mode) {
  const desktopWrapper = document.getElementById('desktopMockupWrapper');
  const phoneWrapper = document.getElementById('phoneMockupWrapper');
  const btnDesktop = document.getElementById('btnViewDesktop');
  const btnMobile = document.getElementById('btnViewMobile');

  if (!desktopWrapper || !phoneWrapper) return;

  if (mode === 'mobile') {
    desktopWrapper.style.display = 'none';
    phoneWrapper.style.display = 'block';
    if (btnDesktop) btnDesktop.classList.remove('active');
    if (btnMobile) btnMobile.classList.add('active');
  } else {
    desktopWrapper.style.display = 'block';
    phoneWrapper.style.display = 'none';
    if (btnDesktop) btnDesktop.classList.add('active');
    if (btnMobile) btnMobile.classList.remove('active');
  }
}

// Auto-switch to Mobile view on smaller screens
window.addEventListener('resize', () => {
  if (window.innerWidth <= 768) {
    switchMockupView('mobile');
  }
});

/* ==========================================
   12. REALTIME IOS STATUS BAR CLOCK
   ========================================== */
function initIosClock() {
  const clockEl = document.getElementById('iosClockTime');
  if (!clockEl) return;

  function updateTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    hours = hours % 12 || 12;
    clockEl.textContent = `${hours}:${minutes}`;
  }

  updateTime();
  setInterval(updateTime, 10000);
}

/* ==========================================
   13. PINNED LIVE DEMO SCROLL-LINKED SHOWCASE
   ========================================== */
function initPinnedDemoScroll() {
  const pinTrack = document.getElementById('demoScrollPinTrack');
  const pinnedContent = document.getElementById('demoPinnedContent');
  const phoneWrapper = document.getElementById('phoneMockupWrapper');

  if (!pinTrack || !pinnedContent) return;

  let ticking = false;

  function getActiveContent() {
    const isMobileVisible = phoneWrapper && phoneWrapper.style.display !== 'none';
    return isMobileVisible
      ? document.querySelector('.phone-scroll-content')
      : document.querySelector('.mockup-main-content');
  }

  function updateMockupScroll() {
    const activeContent = getActiveContent();
    if (!activeContent) return;

    const trackRect = pinTrack.getBoundingClientRect();
    const stickyTop = window.innerWidth <= 768 ? 65 : 80;
    const windowHeight = window.innerHeight;

    // Total distance the track scrolls while pinned
    const pinDistance = pinTrack.offsetHeight - (windowHeight - stickyTop);
    if (pinDistance <= 0) return;

    const scrolledDistance = stickyTop - trackRect.top;
    let progress = scrolledDistance / pinDistance;
    progress = Math.max(0, Math.min(1, progress));

    const maxScroll = activeContent.scrollHeight - activeContent.clientHeight;
    if (maxScroll > 0) {
      activeContent.scrollTop = Math.round(progress * maxScroll);
    }
  }

  function onScrollOrResize() {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateMockupScroll();
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });

  // Initial sync
  updateMockupScroll();
}

