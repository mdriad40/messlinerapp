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
    anchor.addEventListener('click', function(e) {
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

  menuBtn.addEventListener('click', () => {
    const isFlex = navLinks.style.display === 'flex';
    navLinks.style.display = isFlex ? 'none' : 'flex';
    if (!isFlex) {
      navLinks.style.flexDirection = 'column';
      navLinks.style.position = 'absolute';
      navLinks.style.top = '100%';
      navLinks.style.left = '0';
      navLinks.style.width = '100%';
      navLinks.style.background = 'rgba(10, 15, 26, 0.95)';
      navLinks.style.padding = '1.5rem';
      navLinks.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
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
