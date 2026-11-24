/* ============================================================================
   Messliner — Enterprise Subscription & Licensing Engine (subscription.js)
   Features:
   1. 30-Day Free Trial with Device & Phone Anti-Abuse Ledger
   2. 3-Day Grace Period Protection
   3. Messliner Pro (৳60/mo or ৳499/yr)
   4. Pay-As-You-Go (৳2.49/member/mo, 25-200 members)
   5. Role Guard: Mess Managers only (Members restricted)
   6. Dual-Sync: Primary Dining RTDB + Admin Central RTDB (meiner-admin)
   ============================================================================ */

const MesslinerSubscription = {
  // Server-Synchronized Clock Offset (Guards against local device clock tampering)
  _serverTimeOffset: 0,
  _isTimeSyncInitialized: false,

  initServerTimeSync() {
    if (this._isTimeSyncInitialized) return;
    try {
      if (typeof firebase !== 'undefined' && firebase.database) {
        this._isTimeSyncInitialized = true;
        firebase.database().ref('.info/serverTimeOffset').on('value', (snap) => {
          this._serverTimeOffset = parseInt(snap.val()) || 0;
        });
      }
    } catch (_) {}
  },

  /**
   * Get Accurate Server-Synchronized Milliseconds (Device-Clock Immune)
   */
  getNow() {
    return Date.now() + (this._serverTimeOffset || 0);
  },

  // Plan Configurations
  PLANS: {
    trial: {
      id: 'trial',
      name: 'Free Trial',
      badge: '30 Days Trial',
      priceMonthly: 0,
      priceYearly: 0,
      durationDays: 30,
      gracePeriodDays: 3,
      minMembers: 1,
      maxMembers: 25,
      hasSupport: false,
      supportLabel: 'Self-Service (No Direct Live Support)',
      perks: [
        'Full 30 Days Free Access',
        'Daily Meal & Bazar Management',
        'Auto Meal Ratio & Expense Calculator',
        'Instant Ledger & Balance Statements',
        'Up to 25 Dining Members',
        '3-Day Grace Period Upon Expiry',
        'Self-Service (No Direct Live Support)'
      ]
    },
    pro: {
      id: 'pro',
      name: 'Messliner Pro',
      badge: 'Fixed Plan',
      priceMonthly: 60,
      priceYearly: 499,
      gracePeriodDays: 3,
      minMembers: 1,
      maxMembers: 25,
      membersLimit: 25,
      hasSupport: true,
      supportLabel: '24/7 Priority Support',
      perks: [
        'Fixed Flat Rate (৳60/mo or ৳499/yr)',
        'Up to 25 Active Dining Members',
        'Automated Bazar & Meal Calculation',
        '1-Click PDF Report & Ledger Export',
        'Instant SMS & Push Deposit Alerts',
        'Guest Meals & Shared Utility Bills',
        '24/7 Priority Support'
      ]
    },
    pay_as_you_go: {
      id: 'pay_as_you_go',
      name: 'Pay As You Go',
      badge: 'Metered per Member',
      ratePerMemberMonthly: 2.49,
      ratePerMemberYearly: 29.99,
      minMembers: 25,
      maxMembers: 200,
      gracePeriodDays: 3,
      hasSupport: true,
      supportLabel: 'Priority Support Included',
      perks: [
        'Pay Only for What You Use (৳2.49/member/mo or ৳29.99/member/yr)',
        'Scalable from 25 to 200 Members',
        'All Pro Tools & Automated Calculations',
        'Instant SMS & Push Deposit Alerts',
        'Guest Meals & Shared Utility Bills',
        '1-Click PDF Report & Ledger Export',
        '3-Day Grace Period Protection',
        'Priority Customer Support Included'
      ]
    }
  },

  /**
   * Device Fingerprinting for Free Trial Abuse Prevention
   */
  getDeviceFingerprint() {
    let fp = localStorage.getItem('ml_device_fp');
    if (!fp) {
      const parts = [
        navigator.userAgent || '',
        navigator.language || '',
        screen.width + 'x' + screen.height,
        screen.colorDepth || '',
        new Date().getTimezoneOffset(),
        Math.random().toString(36).substring(2, 15)
      ];
      // Simple DJB2-like hash for short identifier
      let hash = 0;
      const str = parts.join('###');
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      fp = 'DFP-' + Math.abs(hash).toString(16) + '-' + Date.now().toString(36);
      try {
        localStorage.setItem('ml_device_fp', fp);
      } catch (_) {}
    }
    return fp;
  },

  /**
   * Calculate Pay-As-You-Go pricing dynamically
   */
  calculatePayAsYouGoPrice(membersCount, billingCycle = 'monthly') {
    const count = Math.max(25, Math.min(200, parseInt(membersCount) || 25));
    const monthlyRate = this.PLANS.pay_as_you_go.ratePerMemberMonthly || 2.49;
    const yearlyRate = this.PLANS.pay_as_you_go.ratePerMemberYearly || 29.99;

    if (billingCycle === 'yearly') {
      const yearlyAmount = Math.round(count * yearlyRate);
      const standardYearly = Math.round(count * monthlyRate * 12);
      return {
        membersCount: count,
        billingCycle: 'yearly',
        rate: yearlyRate,
        monthlyEquivalent: (yearlyAmount / 12).toFixed(2),
        totalAmount: yearlyAmount,
        savings: Math.max(0, standardYearly - yearlyAmount)
      };
    }

    const monthlyAmount = Math.round(count * monthlyRate);
    return {
      membersCount: count,
      billingCycle: 'monthly',
      rate: monthlyRate,
      monthlyEquivalent: monthlyAmount,
      totalAmount: monthlyAmount,
      savings: 0
    };
  },

  /**
   * Calculate Pro pricing
   */
  calculateProPrice(billingCycle = 'monthly') {
    if (billingCycle === 'yearly') {
      const yearly = this.PLANS.pro.priceYearly; // 499
      const standardYearly = this.PLANS.pro.priceMonthly * 12; // 720
      return {
        billingCycle: 'yearly',
        totalAmount: yearly,
        monthlyEquivalent: Math.round(yearly / 12),
        savings: standardYearly - yearly
      };
    }
    return {
      billingCycle: 'monthly',
      totalAmount: this.PLANS.pro.priceMonthly, // 60
      monthlyEquivalent: this.PLANS.pro.priceMonthly,
      savings: 0
    };
  },

  /**
   * Check if a user / phone / device / mess is eligible for a Free Trial
   * Multi-layered anti-abuse ledger checks: device, phone, email, and mess ID
   */
  async checkTrialEligibility(phone, email, diningId = null) {
    this.initServerTimeSync();
    const fp = this.getDeviceFingerprint();
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const cleanDiningId = diningId || (window.Messliner?.state?.diningId) || localStorage.getItem('currentDiningId') || '';

    // 1. Check local storage flag
    if (localStorage.getItem('ml_trial_claimed') === '1') {
      return {
        eligible: false,
        reason: 'This device or browser has already utilized a 30-day Free Trial.'
      };
    }

    // 2. Check Admin Ledger if Admin DB is available
    if (window.adminDb) {
      try {
        // A. Mess-Level Verification: Has this dining group ever claimed a trial?
        if (cleanDiningId && cleanDiningId !== 'pending' && cleanDiningId !== 'guest_trial') {
          const snapMess = await window.adminDb.ref(`trialsLedger/messes/${cleanDiningId}`).once('value');
          if (snapMess.exists()) {
            return {
              eligible: false,
              reason: 'This mess group has already utilized its 30-day Free Trial. Please choose Messliner Pro or Pay-As-You-Go.'
            };
          }
        }

        // B. Phone Number Verification
        if (cleanPhone && cleanPhone.length >= 10) {
          const snapPhone = await window.adminDb.ref(`trialsLedger/phones/${cleanPhone}`).once('value');
          if (snapPhone.exists()) {
            return {
              eligible: false,
              reason: 'This mobile number has already registered a 30-day Free Trial.'
            };
          }
        }

        // C. Email Verification
        if (email) {
          const safeEmail = email.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_');
          const snapEmail = await window.adminDb.ref(`trialsLedger/emails/${safeEmail}`).once('value');
          if (snapEmail.exists()) {
            return {
              eligible: false,
              reason: 'This email account has already utilized a 30-day Free Trial.'
            };
          }
        }

        // D. Hardware & Browser Fingerprint
        if (fp) {
          const snapFp = await window.adminDb.ref(`trialsLedger/devices/${fp}`).once('value');
          if (snapFp.exists()) {
            return {
              eligible: false,
              reason: 'This device has already claimed a 30-day Free Trial.'
            };
          }
        }
      } catch (err) {
        console.warn('[MesslinerSubscription] Trial check notice:', err);
      }
    }

    return { eligible: true };
  },

  /**
   * Record a Free Trial in Local & Admin Database Ledger
   */
  async recordTrialClaim(details) {
    this.initServerTimeSync();
    const fp = this.getDeviceFingerprint();
    const cleanPhone = (details.phone || '').replace(/[^0-9]/g, '');
    const cleanDiningId = details.diningId || (window.Messliner?.state?.diningId) || localStorage.getItem('currentDiningId') || 'pending';
    const now = this.getNow();
    const thirtyDaysLater = now + (30 * 24 * 60 * 60 * 1000);

    try {
      localStorage.setItem('ml_trial_claimed', '1');
    } catch (_) {}

    if (window.adminDb) {
      try {
        const record = {
          diningId: cleanDiningId,
          messName: details.messName || 'My Mess',
          messAddress: details.messAddress || '',
          name: details.name || 'Manager',
          phone: cleanPhone,
          email: details.email || 'N/A',
          deviceFp: fp,
          claimedAt: now,
          expiresAt: thirtyDaysLater
        };

        const updates = {};
        if (cleanDiningId && cleanDiningId !== 'pending' && cleanDiningId !== 'guest_trial') {
          updates[`trialsLedger/messes/${cleanDiningId}`] = record;
        }
        if (cleanPhone) updates[`trialsLedger/phones/${cleanPhone}`] = record;
        if (details.email) {
          const safeEmail = details.email.toLowerCase().replace(/[\.\$#\[\]\/@]/g, '_');
          updates[`trialsLedger/emails/${safeEmail}`] = record;
        }
        if (fp) updates[`trialsLedger/devices/${fp}`] = record;

        await window.adminDb.ref().update(updates);
      } catch (e) {
        console.warn('[MesslinerSubscription] Record trial in admin DB notice:', e);
      }
    }
  },

  /**
   * Evaluate a Dining's Subscription Status
   * Returns complete status object with Grace Period computation
   * Protected against local device clock tampering via Server-Synchronized Clock
   */
  evaluateSubscription(subData) {
    this.initServerTimeSync();
    const now = this.getNow();

    // Default unconfigured fallback -> Treat as 30-day Trial from now if brand new
    if (!subData || !subData.expiresAt) {
      return {
        status: 'active',
        plan: 'trial',
        planName: 'Free Trial',
        planBadge: '30-Day Trial',
        expiresAt: now + (30 * 24 * 60 * 60 * 1000),
        graceEndsAt: now + (33 * 24 * 60 * 60 * 1000),
        daysLeft: 30,
        graceDaysLeft: 3,
        isTrial: true,
        isGracePeriod: false,
        isExpired: false,
        canWrite: true,
        hasSupport: false,
        membersLimit: 25
      };
    }

    const plan = subData.plan || 'trial';
    const planConfig = this.PLANS[plan] || this.PLANS.trial;
    const expiresAt = parseInt(subData.expiresAt) || now;
    const gracePeriodDays = parseInt(subData.gracePeriodDays) || 3;
    const graceEndsAt = expiresAt + (gracePeriodDays * 24 * 60 * 60 * 1000);

    const msLeft = expiresAt - now;
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    // Active
    if (now <= expiresAt && subData.status !== 'suspended' && subData.status !== 'cancelled' && subData.status !== 'expired') {
      return {
        status: 'active',
        plan: plan,
        billingCycle: subData.billingCycle || 'monthly',
        planName: planConfig.name,
        planBadge: plan === 'trial' ? 'Free Trial' : (plan === 'pro' ? 'Pro' : 'Pay As You Go'),
        expiresAt: expiresAt,
        graceEndsAt: graceEndsAt,
        daysLeft: Math.max(0, daysLeft),
        graceDaysLeft: gracePeriodDays,
        isTrial: plan === 'trial',
        isGracePeriod: false,
        isExpired: false,
        canWrite: true,
        hasSupport: planConfig.hasSupport,
        membersLimit: subData.membersLimit || planConfig.maxMembers
      };
    }

    // Grace Period (Within 3 days after expiry)
    if (now > expiresAt && now <= graceEndsAt && subData.status !== 'suspended' && subData.status !== 'cancelled') {
      const graceMsLeft = graceEndsAt - now;
      const graceDaysLeft = Math.ceil(graceMsLeft / (1000 * 60 * 60 * 24));
      return {
        status: 'grace_period',
        plan: plan,
        billingCycle: subData.billingCycle || 'monthly',
        planName: planConfig.name,
        planBadge: 'Grace Period',
        expiresAt: expiresAt,
        graceEndsAt: graceEndsAt,
        daysLeft: 0,
        graceDaysLeft: Math.max(1, graceDaysLeft),
        isTrial: plan === 'trial',
        isGracePeriod: true,
        isExpired: false,
        canWrite: true, // Still allowed to operate within grace period
        hasSupport: planConfig.hasSupport,
        membersLimit: subData.membersLimit || planConfig.maxMembers
      };
    }

    // Completely Expired (Read-Only Mode)
    return {
      status: 'expired',
      plan: plan,
      billingCycle: subData.billingCycle || 'monthly',
      planName: planConfig.name,
      planBadge: 'Expired',
      expiresAt: expiresAt,
      graceEndsAt: graceEndsAt,
      daysLeft: 0,
      graceDaysLeft: 0,
      isTrial: plan === 'trial',
      isGracePeriod: false,
      isExpired: true,
      canWrite: false, // Locked! Read-only mode
      hasSupport: false,
      membersLimit: subData.membersLimit || planConfig.maxMembers
    };
  },

  /**
   * Check if user is authorized to purchase or modify subscriptions
   * Only Manager / Admin can purchase; regular members are restricted
   */
  canManageSubscription(userRole) {
    if (!userRole) return false;
    const cleanRole = String(userRole).toLowerCase().trim();
    return cleanRole === 'admin' || cleanRole === 'manager' || cleanRole === 'owner';
  },

  /**
   * Assert active subscription before write operations
   * Returns false and displays lock modal if completely expired
   */
  assertCanWrite(subInfo) {
    const info = subInfo || (window.Messliner && Messliner.state && Messliner.state.subscription) || window.currentSubInfo;
    if (info && info.canWrite === false) {
      const modal = document.getElementById('subExpiredLockModal');
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
      }
      if (typeof Notifications !== 'undefined' && typeof Notifications.toast === 'function') {
        Notifications.toast('warning', 'Subscription Expired', 'Mess is in Read-Only mode. Please renew your plan to make changes.');
      } else {
        alert('Mess Access Restricted: Your subscription and 3-day grace period have concluded. Please renew to continue.');
      }
      return false;
    }
    return true;
  },

  /**
   * Synchronize dynamic pricing configuration from Admin Central & Admin Supabase
   */
  async loadDynamicPlans() {
    try {
      // 1. Try local cached plans first for instant render
      const cached = localStorage.getItem('ml_cached_plans');
      if (cached) {
        const p = JSON.parse(cached);
        this.applyPlansConfig(p);
      }

      // 2. Fetch fresh config directly from Admin Supabase Project (cvhpuuqwvfhorsuslcel)
      const sbUrl = "https://cvhpuuqwvfhorsuslcel.supabase.co/rest/v1/subscription_plans?order=updated_at.desc&limit=1";
      const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aHB1dXF3dmZob3JzdXNsY2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Njg5NzYsImV4cCI6MjEwNzA0NDk3Nn0.aUyPb0395ZOYjTrRO-mEOtCa7ut_pxF6aPJPgcCI31E";
      try {
        const sbRes = await fetch(sbUrl, {
          headers: {
            'apikey': sbKey,
            'Authorization': `Bearer ${sbKey}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        if (sbRes.ok) {
          const rows = await sbRes.json();
          if (rows && rows.length > 0) {
            const r = rows[0];
            const freshPlans = {
              proMonthlyRate: r.pro_monthly_rate,
              proYearlyRate: r.pro_yearly_rate,
              paygoMonthlyRate: r.paygo_monthly_rate,
              paygoYearlyRate: r.paygo_yearly_rate,
              trialDays: r.trial_days,
              gracePeriodDays: r.grace_period_days,
              defaultMembersLimit: r.default_members_limit
            };
            this.applyPlansConfig(freshPlans);
            try {
              localStorage.setItem('ml_cached_plans', JSON.stringify(freshPlans));
            } catch (_) {}
            return;
          }
        }
      } catch (_) {}

      // 3. Fallback: Fetch config from Admin DB or Primary DB settings
      let plansSnap = null;
      if (window.adminDb) {
        plansSnap = await window.adminDb.ref('adminSystem/subscriptionPlans').once('value');
      } else if (window.db) {
        plansSnap = await window.db.ref('settings/subscriptionPlans').once('value');
      }

      if (plansSnap && plansSnap.exists()) {
        const freshPlans = plansSnap.val();
        this.applyPlansConfig(freshPlans);
        try {
          localStorage.setItem('ml_cached_plans', JSON.stringify(freshPlans));
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[MesslinerSubscription] Dynamic plans notice:', e.message);
    }
  },

  applyPlansConfig(cfg) {
    if (!cfg) return;
    if (cfg.proMonthlyRate !== undefined) this.PLANS.pro.priceMonthly = parseFloat(cfg.proMonthlyRate) || 60;
    if (cfg.proYearlyRate !== undefined) this.PLANS.pro.priceYearly = parseFloat(cfg.proYearlyRate) || 499;
    if (cfg.paygoMonthlyRate !== undefined) this.PLANS.pay_as_you_go.ratePerMemberMonthly = parseFloat(cfg.paygoMonthlyRate) || 2.49;
    if (cfg.paygoYearlyRate !== undefined) this.PLANS.pay_as_you_go.ratePerMemberYearly = parseFloat(cfg.paygoYearlyRate) || 29.99;
    if (cfg.trialDays !== undefined) this.PLANS.trial.durationDays = parseInt(cfg.trialDays) || 30;
    if (cfg.gracePeriodDays !== undefined) {
      this.PLANS.trial.gracePeriodDays = parseInt(cfg.gracePeriodDays) || 3;
      this.PLANS.pro.gracePeriodDays = parseInt(cfg.gracePeriodDays) || 3;
      this.PLANS.pay_as_you_go.gracePeriodDays = parseInt(cfg.gracePeriodDays) || 3;
    }
    if (cfg.defaultMembersLimit !== undefined) {
      this.PLANS.pro.membersLimit = parseInt(cfg.defaultMembersLimit) || 25;
      this.PLANS.pro.maxMembers = parseInt(cfg.defaultMembersLimit) || 25;
    }
  }
};

// Synchronously apply cached dynamic plans on script load
try {
  const cachedPlans = localStorage.getItem('ml_cached_plans');
  if (cachedPlans) {
    MesslinerSubscription.applyPlansConfig(JSON.parse(cachedPlans));
  }
} catch (_) {}

// Auto-load dynamic plans on script parse
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (MesslinerSubscription.loadDynamicPlans) MesslinerSubscription.loadDynamicPlans();
  }, 100);
}

// Expose globally
window.MesslinerSubscription = MesslinerSubscription;
