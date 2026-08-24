/* ============================================
   Messliner — Onboarding & Setup Wizard Logic
   ============================================ */

const Onboarding = {
  user: null,
  currentPath: null, // 'create' or 'join'
  currentStep: 0,

  // Create Mess Settings
  messName: '',
  trackedMeals: { breakfast: true, lunch: true, dinner: true },
  rateMode: 'market', // 'market' or 'fixed'
  fixedRates: { breakfast: 30, lunch: 60, dinner: 60 },
  cutoffs: { breakfast: '07:00', lunch: '08:00', dinner: '16:00' },
  managerMealEnabled: true,
  managerBazarEnabled: true,
  messCode: '',

  mealIcons: {
    breakfast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>`,
    lunch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M3 12h18M12 2v3M9 3v2M15 3v2M4 12a8 8 0 0 0 16 0" /></svg>`,
    dinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>`
  },

  // Join Mess State
  inviteCodeInput: '',
  matchedDining: null,
  joinSubStep: 1,

  /**
   * Initialize onboarding flow
   */
  init(user) {
    this.user = user;
    console.log('[Messliner Onboarding] Initialized for:', user.email);

    // Render left panel brand & bullet points
    this.renderLeftPanel();

    // Render the initial choice view
    this.showStep(0);
  },

  /**
   * Render the static left marketing panel
   */
  renderLeftPanel() {
    const leftPane = document.getElementById('onboardingLeftPanel');
    if (!leftPane) return;

    leftPane.innerHTML = `
      <!-- Floating Dining Animations -->
      <div class="auth-float-icons" aria-hidden="true">
        <!-- Filled Circle 1 (Large) -->
        <div class="float-circle fi-1"></div>

        <!-- Fork (Realistic outline) -->
        <div class="float-icon float-icon--fork fi-2">
          <svg viewBox="0 0 24 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M6 2 L6 18 M12 2 L12 18 M18 2 L18 18" />
            <path d="M6 18 C6 22 18 22 18 18" />
            <line x1="12" y1="20" x2="12" y2="62" />
            <line x1="10" y1="58" x2="14" y2="58" />
          </svg>
        </div>

        <!-- Spoon (Realistic outline with details) -->
        <div class="float-icon float-icon--spoon fi-3">
          <svg viewBox="0 0 24 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M12 2 C8 2 6 6 6 15 C6 22 9.5 25 12 27 L12 62" />
            <path d="M12 2 C16 2 18 6 18 15 C18 22 14.5 25 12 27" />
            <line x1="10" y1="58" x2="14" y2="58" />
          </svg>
        </div>

        <!-- Knife (Realistic outline) -->
        <div class="float-icon float-icon--knife fi-4">
          <svg viewBox="0 0 24 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M12 2 C12 2 17 6 17 22 L12 28 L12 62" />
            <line x1="12" y1="2" x2="12" y2="62" />
            <line x1="10" y1="58" x2="14" y2="58" />
          </svg>
        </div>

        <!-- Filled Circle 2 (Medium) -->
        <div class="float-circle fi-5"></div>

        <!-- Filled Circle 3 (Extra Large) -->
        <div class="float-circle fi-6"></div>

        <!-- Fork 2 (smaller) -->
        <div class="float-icon float-icon--fork2 fi-7">
          <svg viewBox="0 0 20 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M5 2 L5 16 M10 2 L10 16 M15 2 L15 16" />
            <path d="M5 16 C5 19.5 15 19.5 15 16" />
            <line x1="10" y1="18" x2="10" y2="54" />
          </svg>
        </div>

        <!-- Spoon 2 (smaller) -->
        <div class="float-icon float-icon--spoon2 fi-8">
          <svg viewBox="0 0 20 56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <path d="M10 2 C6.5 2 5 5 5 13 C5 19 8 21.5 10 23 L10 54" />
            <path d="M10 2 C13.5 2 15 5 15 13 C15 19 12 21.5 10 23" />
          </svg>
        </div>
      </div>
      <div class="auth-left-content">
        <!-- Logo -->
        <div class="auth-left-logo">
          <div class="logo-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
              <path d="M7 2v20" />
              <path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
            </svg>
          </div>
          <span>Messliner</span>
        </div>

        <div class="auth-left-badge">DINING MANAGER &middot; BD</div>

        <!-- Desktop-only Banner Content -->
        <div class="desktop-header-content">
          <h1 class="auth-left-title">Track meals.<br>Not spreadsheets.</h1>
          <p class="auth-left-desc">Meals, deposits, bills and bazar for your whole mess &mdash; tracked, split and
            settled in one place everyone can see.</p>

          <div class="auth-features-list">
            <div class="auth-feature-item">
              <div class="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div class="auth-feature-text">
                <h4>Meal tracking that never lies</h4>
                <p>Members log their meals before the cutoff &mdash; timestamps do the arguing for you.</p>
              </div>
            </div>
            <div class="auth-feature-item">
              <div class="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div class="auth-feature-text">
                <h4>Deposit &amp; balance at a glance</h4>
                <p>Every member sees their balance in real time &mdash; no surprises at month-end.</p>
              </div>
            </div>
            <div class="auth-feature-item">
              <div class="auth-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div class="auth-feature-text">
                <h4>Auto bill split to the taka</h4>
                <p>Total cost split fairly by meals eaten &mdash; settled and cleared every month.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Navigate steps
   */
  showStep(step) {
    this.currentStep = step;

    // Toggle logout button visibility (only show on step 0)
    const logoutBtn = document.querySelector('.onboarding-logout-btn');
    if (logoutBtn) {
      logoutBtn.style.display = step === 0 ? 'flex' : 'none';
    }

    // Toggle step-welcome-active class on onboarding-right for mobile UI adjustments
    const rightPane = document.querySelector('.onboarding-right');
    if (rightPane) {
      if (step === 0) {
        rightPane.classList.add('step-welcome-active');
      } else {
        rightPane.classList.remove('step-welcome-active');
      }
    }

    // Manage step visibility
    const stepWelcome = document.getElementById('step-welcome');
    const stepName = document.getElementById('step-name');
    const stepMeals = document.getElementById('step-meals');
    const stepSplit = document.getElementById('step-split');
    const stepRates = document.getElementById('step-rates');
    const stepCutoffs = document.getElementById('step-cutoffs');
    const stepBazar = document.getElementById('step-bazar');
    const stepInvite = document.getElementById('step-invite');
    const stepJoin = document.getElementById('step-join');

    // Hide all
    const allSteps = [stepWelcome, stepName, stepMeals, stepSplit, stepRates, stepCutoffs, stepBazar, stepInvite, stepJoin];
    allSteps.forEach(s => { if (s) s.style.display = 'none'; });

    // Progress Bar
    const progressContainer = document.getElementById('wizardProgress');
    const progressHeader = document.getElementById('wizardHeader');
    if (step === 0) {
      if (progressContainer) progressContainer.style.display = 'none';
      if (progressHeader) progressHeader.style.display = 'none';
      if (stepWelcome) stepWelcome.style.display = 'flex';
      
      const joinBadge = document.getElementById('joinStepBadge');
      if (joinBadge) joinBadge.style.display = 'none';
      const stepInfo = document.getElementById('wizardStepInfo');
      if (stepInfo) stepInfo.style.display = 'block';
      return;
    }

    if (progressContainer) progressContainer.style.display = 'flex';
    if (progressHeader) progressHeader.style.display = 'flex';

    if (this.currentPath === 'join') {
      if (progressContainer) progressContainer.style.display = 'none';
      Utils.setText('wizardTitle', 'Join a mess');
      if (stepJoin) stepJoin.style.display = 'flex';
      this.goToJoinSubStep(this.joinSubStep || 1);
      return;
    }

    // Define wizard steps dynamically based on configuration
    const steps = [
      null, // 1-based indexing for convenience
      {
        title: 'Name',
        element: stepName,
        setup: () => {
          const input = document.getElementById('onboardMessNameInput');
          const btn = document.getElementById('btnSubmitMessName');
          if (input && btn) {
            btn.disabled = !input.value.trim();
          }
        }
      },
      {
        title: 'Meals',
        element: stepMeals,
        setup: () => this.validateMeals()
      },
      {
        title: 'Split',
        element: stepSplit
      }
    ];

    if (this.rateMode === 'fixed') {
      steps.push({
        title: 'Rates',
        element: stepRates,
        setup: () => this.populateRatesForm()
      });
    }

    // Both modes now configure cutoff/deadlines
    steps.push({
      title: 'Cutoffs',
      element: stepCutoffs,
      setup: () => this.populateCutoffsForm()
    });

    steps.push({
      title: 'Bazar',
      element: stepBazar,
      setup: () => this.validateManagerPreferences()
    });

    steps.push({
      title: 'Invites',
      element: stepInvite,
      setup: () => this.generateInviteCode()
    });

    const totalSteps = steps.length - 1;
    let stepTitle = '';
    let targetEl = null;

    if (step >= 1 && step <= totalSteps) {
      const currentStepConfig = steps[step];
      stepTitle = currentStepConfig.title;
      targetEl = currentStepConfig.element;
      if (currentStepConfig.setup) {
        currentStepConfig.setup();
      }
    }

    if (targetEl) targetEl.style.display = 'flex';

    // Update progress numbers
    Utils.setText('wizardTitle', 'Setup wizard');
    Utils.setText('wizardStepInfo', `Step ${step} of ${totalSteps} · ${stepTitle}`);

    // Render progress bar segments
    if (progressContainer) {
      progressContainer.innerHTML = '';
      for (let i = 1; i <= totalSteps; i++) {
        const active = i <= step ? 'active' : '';
        progressContainer.innerHTML += `<div class="wizard-progress-step ${active}"></div>`;
      }
    }
  },

  /**
   * Path choice (Create or Join)
   */
  choosePath(path) {
    this.currentPath = path;
    if (path === 'create') {
      this.showStep(1);
    } else {
      this.joinSubStep = 1;
      this.showStep(7); // Show Join Mess form directly
    }
  },

  /**
   * Back button on setup header
   */
  handleBack() {
    if (this.currentStep === 0) return;

    if (this.currentPath === 'join') {
      if (this.joinSubStep > 1) {
        this.goToJoinSubStep(this.joinSubStep - 1);
      } else {
        this.currentPath = null;
        this.showStep(0);
      }
      return;
    }

    // Create Path back transitions
    if (this.currentStep === 1) {
      this.currentPath = null;
      this.showStep(0);
    } else {
      this.showStep(this.currentStep - 1);
    }
  },

  /**
   * Step 1 -> Step 2
   */
  submitName() {
    const input = document.getElementById('onboardMessNameInput');
    const name = input ? input.value.trim() : '';
    if (!name) {
      Notifications.toast('warning', 'Missing Name', 'Please enter a name for your mess.');
      return;
    }
    this.messName = name;
    this.showStep(this.currentStep + 1);
  },

  /**
   * Validates meal selection on Step 2 (requires at least one meal checked)
   */
  validateMeals() {
    const b = document.getElementById('toggleMealsBreakfast');
    const l = document.getElementById('toggleMealsLunch');
    const d = document.getElementById('toggleMealsDinner');
    const btn = document.getElementById('btnSubmitMeals');

    if (b && l && d && btn) {
      btn.disabled = (!b.checked && !l.checked && !d.checked);

      // Update styling on the icon containers
      this.updateMealIconState('Breakfast', b.checked);
      this.updateMealIconState('Lunch', l.checked);
      this.updateMealIconState('Dinner', d.checked);
    }
  },

  updateMealIconState(mealName, isChecked) {
    const rowContainer = document.getElementById(`mealRow${mealName}`);
    if (rowContainer) {
      if (isChecked) {
        rowContainer.classList.add('active');
      } else {
        rowContainer.classList.remove('active');
      }
    }
  },

  /**
   * Step 2 -> Step 3
   */
  submitMeals() {
    const b = document.getElementById('toggleMealsBreakfast').checked;
    const l = document.getElementById('toggleMealsLunch').checked;
    const d = document.getElementById('toggleMealsDinner').checked;

    if (!b && !l && !d) {
      Notifications.toast('warning', 'Select Meal', 'You must select at least one meal time to track.');
      return;
    }

    this.trackedMeals = { breakfast: b, lunch: l, dinner: d };
    this.showStep(this.currentStep + 1);
  },

  showSplitHelp(event, mode) {
    if (event) event.stopPropagation(); // prevent card selection trigger
    const drawer = document.getElementById('splitHelpDrawer');
    const title = document.getElementById('splitHelpTitle');
    const desc = document.getElementById('splitHelpDesc');
    const example = document.getElementById('splitHelpExample');

    if (mode === 'market') {
      title.innerText = 'Market Rate Mode';
      desc.innerText = 'Total bazar cost is divided by the total number of meals eaten. Fair and dynamic calculation.';
      example.innerText = '৳5,000 bazar ÷ 250 meals = ৳20/meal. If you eat 60 meals, you pay: 60 × ৳20 = ৳1,200.';
    } else {
      title.innerText = 'Fixed Rate Mode';
      desc.innerText = 'Meals have a set price configured by the manager. Predictable pricing per meal.';
      example.innerText = 'Lunch is set to ৳60. If you eat 20 lunches, you pay: 20 × ৳60 = ৳1,200.';
    }

    if (drawer) drawer.classList.add('active');
  },

  closeSplitHelp() {
    const drawer = document.getElementById('splitHelpDrawer');
    if (drawer) drawer.classList.remove('active');
  },

  /**
   * Step 3 -> Step 4
   */
  selectRateMode(mode) {
    this.rateMode = mode;

    document.querySelectorAll('.radio-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.mode === mode);
    });

    // Enable/disable next continue button
    document.getElementById('btnSubmitSplitMode').disabled = false;

    // Refresh step wizard details (updates Step 3 of X header and progress bar segments immediately)
    this.showStep(this.currentStep);
  },

  submitSplitMode() {
    this.showStep(this.currentStep + 1);
  },

  /**
   * Populates Fixed Rates inputs based on selected meals
   */
  populateRatesForm() {
    const container = document.getElementById('fixedRatesInputsList');
    if (!container) return;

    container.innerHTML = '';
    const meals = [
      { key: 'breakfast', label: 'Breakfast', icon: this.mealIcons.breakfast, val: this.fixedRates.breakfast },
      { key: 'lunch', label: 'Lunch', icon: this.mealIcons.lunch, val: this.fixedRates.lunch },
      { key: 'dinner', label: 'Dinner', icon: this.mealIcons.dinner, val: this.fixedRates.dinner }
    ];

    meals.forEach(m => {
      if (this.trackedMeals[m.key]) {
        container.innerHTML += `
          <div class="option-card-row active">
            <div class="option-card-left">
              <div class="option-card-icon">${m.icon}</div>
              <div class="option-card-text">
                <h4>${m.label}</h4>
                <p>per meal price</p>
              </div>
            </div>
            <div class="price-input-wrapper">
              <span class="price-currency">৳</span>
              <input type="number" class="price-input" id="rateInput-${m.key}" value="${m.val}" min="0">
            </div>
          </div>
        `;
      }
    });
  },

  submitRates() {
    // Read rate values
    ['breakfast', 'lunch', 'dinner'].forEach(k => {
      const el = document.getElementById(`rateInput-${k}`);
      if (el) {
        this.fixedRates[k] = parseFloat(el.value) || 0;
      }
    });
    this.showStep(this.currentStep + 1);
  },

  /**
   * Populates Cutoff times inputs based on selected meals
   */
  populateCutoffsForm() {
    const container = document.getElementById('cutoffsInputsList');
    if (!container) return;

    container.innerHTML = '';
    const meals = [
      { key: 'breakfast', label: 'Breakfast cutoff', icon: this.mealIcons.breakfast, val: this.cutoffs.breakfast },
      { key: 'lunch', label: 'Lunch cutoff', icon: this.mealIcons.lunch, val: this.cutoffs.lunch },
      { key: 'dinner', label: 'Dinner cutoff', icon: this.mealIcons.dinner, val: this.cutoffs.dinner }
    ];

    meals.forEach(m => {
      if (this.trackedMeals[m.key]) {
        container.innerHTML += `
          <div class="option-card-row active">
            <div class="option-card-left">
              <div class="option-card-icon">${m.icon}</div>
              <div class="option-card-text">
                <h4>${m.label}</h4>
                <p>Locks daily at this time</p>
              </div>
            </div>
            <input type="time" class="time-input-onboarding" id="cutoffInput-${m.key}" value="${m.val}">
          </div>
        `;
      }
    });
  },

  submitCutoffs() {
    // Read time cutoffs
    ['breakfast', 'lunch', 'dinner'].forEach(k => {
      const el = document.getElementById(`cutoffInput-${k}`);
      if (el) {
        this.cutoffs[k] = el.value || '00:00';
      }
    });
    this.showStep(this.currentStep + 1);
  },

  validateManagerPreferences() {
    const mealCheck = document.getElementById('toggleManagerMealEat');
    const bazarCheck = document.getElementById('toggleManagerBazarDuty');
    const mealRow = document.getElementById('managerMealRow');
    const bazarRow = document.getElementById('managerBazarRow');

    if (mealCheck && mealRow) {
      mealRow.classList.toggle('active', mealCheck.checked);
    }
    if (bazarCheck && bazarRow) {
      bazarRow.classList.toggle('active', bazarCheck.checked);
    }
  },

  /**
   * Step 5 -> Step 6
   */
  submitManagerOptions() {
    this.managerMealEnabled = document.getElementById('toggleManagerMealEat').checked;
    this.managerBazarEnabled = document.getElementById('toggleManagerBazarDuty').checked;
    this.showStep(this.currentStep + 1);
  },

  /**
   * Generate Unique Mess Code
   */
  async generateInviteCode() {
    if (this.messCode) return; // Already generated

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = 'DD-';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
      // Confirm uniqueness
      const snap = await db.ref(`messCodes/${code}`).once('value');
      if (snap.exists()) {
        // Regenerate recursively
        this.generateInviteCode();
        return;
      }
      this.messCode = code;
      Utils.setText('generatedMessCodeText', code);
    } catch (err) {
      console.error('Error verifying unique code:', err);
      // Fallback
      this.messCode = code;
      Utils.setText('generatedMessCodeText', code);
    }
  },

  /**
   * Step 6: Perform database transactions to create the Mess!
   */
  async createMess() {
    const btn = document.getElementById('btnOnboardingCreateMess');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating mess...';
    }

    try {
      const uid = this.user.uid;
      const email = this.user.email;
      const phone = this.user.phone || '';
      const name = this.user.name || 'Manager';

      // 1. Generate IDs
      const diningId = Utils.generateId();
      const adminUserId = Utils.generateId();
      const username = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 100);

      // 2. Build Settings structure
      const diningSettings = {
        autoMealEnabled: true, // Enable lock deadlines since they are configured in the onboarding flow
        breakfastDeadline: this.cutoffs.breakfast || '07:00',
        lunchDeadline: this.cutoffs.lunch || '08:00',
        dinnerDeadline: this.cutoffs.dinner || '16:00',
        defaultMealState: true,

        trackedMeals: this.trackedMeals,
        rateMode: this.rateMode,
        fixedRates: this.fixedRates,
        managerMealEnabled: this.managerMealEnabled,
        managerBazarEnabled: this.managerBazarEnabled
      };

      // 3. Setup initial admin user in dining
      const diningUsers = {
        [adminUserId]: {
          name: name,
          username: username,
          email: email,
          phone: phone,
          role: 'admin',
          authUid: uid,
          totalDeposit: 0,
          totalMeals: 0,
          mealCost: 0,
          balance: 0,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          mealStatus: {
            breakfast: this.managerMealEnabled,
            lunch: this.managerMealEnabled,
            dinner: this.managerMealEnabled
          }
        }
      };

      // 4. Create Dining record
      const diningData = {
        info: {
          name: this.messName,
          managerName: name,
          email: email,
          phone: phone,
          adminUid: uid,
          messCode: this.messCode,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        },
        users: diningUsers,
        settings: diningSettings
      };

      // Set DB records
      await Promise.all([
        db.ref(`dinings/${diningId}`).set(diningData),
        // Create lookup code mapping
        db.ref(`messCodes/${this.messCode}`).set(diningId),
        // Create user mappings
        db.ref(`userMappings/emailToDining/${Utils.encodeEmail(email)}`).set({
          diningId: diningId,
          userId: adminUserId
        }),
        db.ref(`userMappings/usernameToDining/${username}`).set({
          diningId: diningId,
          userId: adminUserId
        })
      ]);

      // Create notification
      await Notifications.create(diningId, 'Welcome to Messliner! 🎉', `${this.messName} has been setup successfully.`, 'all', 'info');

      // Success! Refresh the page to reload dashboard under new mapping
      Notifications.toast('success', 'Mess Created', `${this.messName} setup completed!`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[Onboarding] Create mess error:', err);
      Notifications.toast('error', 'Error', 'Failed to create mess. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create mess';
      }
    }
  },

  /**
   * Verify Invite Code (Join Path)
   */
  async verifyInviteCode() {
    const input = document.getElementById('joinMessCodeInput');
    const code = input ? input.value.trim().toUpperCase() : '';
    const errorBox = document.getElementById('joinCodeError');
    const errorMsg = document.getElementById('joinCodeErrorMsg');

    if (errorBox) errorBox.style.display = 'none';

    if (!code) {
      if (errorBox && errorMsg) {
        errorMsg.textContent = 'Please enter an invite code.';
        errorBox.style.display = 'flex';
      } else {
        Notifications.toast('warning', 'Missing Code', 'Please enter a mess code.');
      }
      return;
    }

    const btn = document.getElementById('btnVerifyJoinCode');
    let originalBtnHTML = '';
    if (btn) {
      originalBtnHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="border: 2px solid white; border-top: 2px solid transparent; border-radius: 50%; width: 14px; height: 14px; display: inline-block; animation: spin 0.75s linear infinite; margin-right: 8px;"></span>Verifying code...`;
    }

    try {
      const snap = await db.ref(`messCodes/${code}`).once('value');
      const diningId = snap.val();

      if (!diningId) {
        if (errorBox && errorMsg) {
          errorMsg.textContent = 'Invalid invite code. No mess group found.';
          errorBox.style.display = 'flex';
        } else {
          Notifications.toast('error', 'Invalid Code', 'No mess found with this code. Check and try again.');
        }
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalBtnHTML;
        }
        return;
      }

      // Found dining! Load details for preview, rules, and users count
      const [infoSnap, rulesSnap, usersSnap] = await Promise.all([
        db.ref(`dinings/${diningId}/info`).once('value'),
        db.ref(`dinings/${diningId}/rules`).once('value'),
        db.ref(`dinings/${diningId}/users`).once('value')
      ]);

      const info = infoSnap.val() || {};
      const rulesList = rulesSnap.val() || [];
      const totalMembers = usersSnap.exists() ? Object.keys(usersSnap.val()).length : 0;

      this.matchedDining = {
        id: diningId,
        name: info.name || 'Unnamed Mess',
        manager: info.managerName || 'Manager',
        messCode: info.messCode || code,
        rules: rulesList,
        totalMembers: totalMembers
      };

      // Populate Preview fields
      Utils.setText('previewMessName', this.matchedDining.name);
      Utils.setText('previewMessCode', this.matchedDining.messCode);
      Utils.setText('previewTotalMembers', `${this.matchedDining.totalMembers} ${this.matchedDining.totalMembers === 1 ? 'member' : 'members'}`);
      Utils.setText('previewManagerName', this.matchedDining.manager);

      // Reset button state
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
      }

      // Proceed to Substep 2
      this.goToJoinSubStep(2);

    } catch (err) {
      console.error('[Onboarding] Verify code error:', err);
      if (errorBox && errorMsg) {
        errorMsg.textContent = 'Failed to verify invite code. Please check connection.';
        errorBox.style.display = 'flex';
      } else {
        Notifications.toast('error', 'Error', 'Failed to verify invite code.');
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
      }
    }
  },

  /**
   * Transition to rules step (Substep 3)
   */
  nextToRules() {
    if (!this.matchedDining) return;

    // Populate rules list
    const rulesListContainer = document.getElementById('joinRulesList');
    if (rulesListContainer) {
      rulesListContainer.innerHTML = '';
      let rules = this.matchedDining.rules || [];
      if (typeof rules === 'object' && !Array.isArray(rules)) {
        rules = Object.values(rules);
      }

      if (rules.length === 0) {
        // Fallback default rules
        const defaultRules = [
          'Turn off meals before the designated daily cutoff times.',
          'Bazar costs and receipts must be submitted on time.',
          'Maintain cleanliness in the dining hall and common areas.',
          'Be respectful to other mess members and the manager.'
        ];
        defaultRules.forEach(rule => {
          rulesListContainer.innerHTML += `
            <div class="rule-item">
              <div class="rule-dot"></div>
              <p class="rule-text">${rule}</p>
            </div>
          `;
        });
      } else {
        rules.forEach(rule => {
          rulesListContainer.innerHTML += `
            <div class="rule-item">
              <div class="rule-dot"></div>
              <p class="rule-text">${rule}</p>
            </div>
          `;
        });
      }
    }

    // Reset agreement checkbox and button state
    const checkbox = document.getElementById('joinRulesAgreement');
    if (checkbox) checkbox.checked = false;
    
    this.toggleJoinSubmitBtn();

    // Proceed to Substep 3
    this.goToJoinSubStep(3);
  },

  /**
   * Toggle Submit Button state depending on agreement checkbox
   */
  toggleJoinSubmitBtn() {
    const checkbox = document.getElementById('joinRulesAgreement');
    const submitBtn = document.getElementById('btnJoinConfirmSubmit');
    if (submitBtn) {
      submitBtn.disabled = checkbox ? !checkbox.checked : true;
    }
  },

  /**
   * Handle code input to dynamically enable/disable verify button
   */
  handleCodeInput(val) {
    const code = val.trim().toUpperCase();
    const btn = document.getElementById('btnVerifyJoinCode');
    if (btn) {
      btn.disabled = !(code.includes('DD') && code.length >= 5);
    }
  },

  /**
   * Navigate Join Path Substeps
   */
  goToJoinSubStep(subStep) {
    this.joinSubStep = subStep;

    if (subStep === 1) {
      const input = document.getElementById('joinMessCodeInput');
      const val = input ? input.value : '';
      this.handleCodeInput(val);
    }

    // Hide all substep panes
    const pane1 = document.getElementById('join-substep-1');
    const pane2 = document.getElementById('join-substep-2');
    const pane3 = document.getElementById('join-substep-3');
    if (pane1) pane1.style.display = 'none';
    if (pane2) pane2.style.display = 'none';
    if (pane3) pane3.style.display = 'none';

    // Show step badge in main wizard header
    const badge = document.getElementById('joinStepBadge');
    if (badge) {
      badge.textContent = `${subStep} / 3`;
      badge.style.display = 'block';
    }

    // Hide standard wizard step info if visible
    const stepInfo = document.getElementById('wizardStepInfo');
    if (stepInfo) stepInfo.style.display = 'none';

    // Show correct pane
    const targetPane = document.getElementById(`join-substep-${subStep}`);
    if (targetPane) targetPane.style.display = 'flex';

    // Update progress tracker visual states
    const steps = document.querySelectorAll('.join-progress-step');
    const lines = document.querySelectorAll('.join-progress-line');

    steps.forEach((stepEl, idx) => {
      const stepNum = idx + 1;
      stepEl.classList.remove('active', 'completed');
      if (stepNum < subStep) {
        stepEl.classList.add('completed');
      } else if (stepNum === subStep) {
        stepEl.classList.add('active');
      }
    });

    lines.forEach((lineEl, idx) => {
      const lineNum = idx + 1;
      lineEl.classList.remove('active');
      if (lineNum < subStep) {
        lineEl.classList.add('active');
      }
    });
  },

  /**
   * Final Join Action
   */
  async executeJoin() {
    if (!this.matchedDining) return;

    const btn = document.getElementById('btnJoinConfirmSubmit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Joining mess...';
    }

    try {
      const uid = this.user.uid;
      const email = this.user.email;
      const phone = this.user.phone || '';
      const name = this.user.name || 'Member';
      const diningId = this.matchedDining.id;

      // 1. Generate unique member user ID for dining
      const memberUserId = Utils.generateId();
      const username = name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 100);

      // 2. Fetch dining settings to determine default meal values
      const settingsSnap = await db.ref(`dinings/${diningId}/settings`).once('value');
      const settings = settingsSnap.val() || {};
      const trackedMeals = settings.trackedMeals || { breakfast: true, lunch: true, dinner: true };

      const newUserData = {
        name: name,
        username: username,
        email: email,
        phone: phone,
        role: 'user',
        authUid: uid,
        totalDeposit: 0,
        totalMeals: 0,
        mealCost: 0,
        balance: 0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        mealStatus: {
          breakfast: !!trackedMeals.breakfast,
          lunch: !!trackedMeals.lunch,
          dinner: !!trackedMeals.dinner
        }
      };

      // 3. Write user details inside dining and mappings
      await Promise.all([
        db.ref(`dinings/${diningId}/users/${memberUserId}`).set(newUserData),
        db.ref(`userMappings/emailToDining/${Utils.encodeEmail(email)}`).set({
          diningId: diningId,
          userId: memberUserId
        }),
        db.ref(`userMappings/usernameToDining/${username}`).set({
          diningId: diningId,
          userId: memberUserId
        })
      ]);

      // Notify
      await Notifications.create(diningId, 'New Member Joined! 👋', `${name} has joined the mess.`, 'all', 'info');
      await Notifications.log(diningId, 'member_joined', `${name} joined the mess`, memberUserId, memberUserId);

      Notifications.toast('success', 'Joined Successfully', `Welcome to ${this.matchedDining.name}!`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[Onboarding] Execute join error:', err);
      Notifications.toast('error', 'Error', 'Failed to join mess.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm & Join Mess';
      }
    }
  }
};

window.Onboarding = Onboarding;
