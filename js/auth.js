/* ============================================
   Messliner — Authentication (auth.js)
   ============================================ */

const Auth = {
  isRegistering: false,
  currentRecoveryEmail: '',
  currentSignupEmail: '',
  resendTimer: null,
  resendSecondsLeft: 120,
  signupResendTimer: null,
  signupResendSecondsLeft: 120,

  /**
   * Initialize auth on the login page
   */
  init() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.login();
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.register();
      });
    }

    const signupOtpForm = document.getElementById('signupOtpForm');
    if (signupOtpForm) {
      signupOtpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.verifySignupOTP();
      });
    }

    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
      forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.forgotPassword();
      });
    }

    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
      otpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.verifyOTP();
      });
    }

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
      resetPasswordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.updatePassword();
      });
    }

    this.initOTPInputs();

    // Check if user is already signed in
    auth.onAuthStateChanged(async (user) => {
      if (Auth.isRegistering || Auth.isLoggingIn) {
        console.log('[Messliner] Auth transition in progress. Skipping observer redirect.');
        return;
      }
      const loader = document.getElementById('pageLoader');
      if (user) {
        // If user is in recovery or signup OTP mode, allow them to stay on verification view
        if (window.location.hash.includes('type=recovery') || window.location.hash === '#reset-password' || window.location.hash === '#verify-otp' || window.location.hash === '#verify-signup-otp') {
          if (loader) loader.style.display = 'none';
          const authPage = document.getElementById('authPage');
          if (authPage) authPage.style.display = 'flex';
          if (typeof handleRouting === 'function') handleRouting();
          return;
        }
        // Redirect to dashboard (dashboard.html will decide if they need onboarding)
        window.location.replace('dashboard.html');
      } else {
        // Not signed in — show auth page
        if (loader) loader.style.display = 'none';
        const authPage = document.getElementById('authPage');
        if (authPage) authPage.style.display = 'flex';
      }
    });
  },

  /**
   * Switch between multi-step signup views (Step 1: Account Info, Step 2: Email Verification OTP)
   */
  goToSignupStep(stepNum) {
    const step1 = document.getElementById('signupStep1');
    const step2 = document.getElementById('signupStep2');
    const stepsBar = document.getElementById('signupStepsBar');

    const ind1 = document.getElementById('signupStepIndicator1');
    const ind2 = document.getElementById('signupStepIndicator2');

    const errorDiv = document.getElementById('registerError');
    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }

    if (stepNum === 1) {
      if (stepsBar) stepsBar.style.display = 'none';
      if (step1) step1.style.display = 'block';
      if (step2) step2.style.display = 'none';
      if (ind1) { ind1.classList.add('active'); ind1.classList.remove('completed'); }
      if (ind2) { ind2.classList.remove('active', 'completed'); }
    } else if (stepNum === 2) {
      if (stepsBar) stepsBar.style.display = 'flex';
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
      if (ind1) { ind1.classList.remove('active'); ind1.classList.add('completed'); }
      if (ind2) { ind2.classList.add('active'); }

      const emailText = document.getElementById('signupTargetEmailText');
      if (emailText && this.currentSignupEmail) {
        emailText.textContent = this.currentSignupEmail;
      }
      this.focusSignupOTPBox(1);
      this.startSignupResendTimer();
    }
  },

  /**
   * Switch between multi-step password reset views (Step 1, Step 2, Step 3)
   */
  goToRecoveryStep(stepNum) {
    const step1 = document.getElementById('recoveryStep1');
    const step2 = document.getElementById('recoveryStep2');
    const step3 = document.getElementById('recoveryStep3');

    const ind1 = document.getElementById('stepIndicator1');
    const ind2 = document.getElementById('stepIndicator2');
    const ind3 = document.getElementById('stepIndicator3');

    const errorDiv = document.getElementById('forgotError');
    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }

    // Hide all steps
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

    // Update indicators
    [ind1, ind2, ind3].forEach(ind => {
      if (ind) {
        ind.classList.remove('active', 'completed');
      }
    });

    if (stepNum === 1) {
      if (step1) step1.style.display = 'block';
      if (ind1) ind1.classList.add('active');
    } else if (stepNum === 2) {
      if (step2) step2.style.display = 'block';
      if (ind1) ind1.classList.add('completed');
      if (ind2) ind2.classList.add('active');
      const emailText = document.getElementById('targetEmailText');
      if (emailText && this.currentRecoveryEmail) {
        emailText.textContent = this.currentRecoveryEmail;
      }
      this.focusOTPBox(1);
      this.startResendTimer();
    } else if (stepNum === 3) {
      if (step3) step3.style.display = 'block';
      if (ind1) ind1.classList.add('completed');
      if (ind2) ind2.classList.add('completed');
      if (ind3) ind3.classList.add('active');
      const newPwdEl = document.getElementById('newPassword');
      if (newPwdEl) newPwdEl.focus();
    }
  },

  /**
   * Setup interactive 6-digit OTP input boxes (auto-focus, backspace, paste support)
   */
  initOTPInputs() {
    this._setupOTPGroup(['otp1', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6'], 'verifyOtpBtn');
    this._setupOTPGroup(['regOtp1', 'regOtp2', 'regOtp3', 'regOtp4', 'regOtp5', 'regOtp6'], 'verifySignupOtpBtn');
  },

  _setupOTPGroup(idArray, btnId) {
    const boxes = idArray.map(id => document.getElementById(id));
    if (!boxes[0]) return;

    boxes.forEach((box, index) => {
      if (!box) return;

      // Handle single digit input
      box.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val ? val[val.length - 1] : '';

        if (e.target.value) {
          box.classList.add('filled');
          if (index < 5 && boxes[index + 1]) {
            boxes[index + 1].focus();
          }
        } else {
          box.classList.remove('filled');
        }
        this.checkOTPGroupComplete(idArray, btnId);
      });

      // Handle backspace navigation
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && index > 0 && boxes[index - 1]) {
          boxes[index - 1].focus();
          boxes[index - 1].value = '';
          boxes[index - 1].classList.remove('filled');
          this.checkOTPGroupComplete(idArray, btnId);
        }
      });

      // Handle full 6-digit paste
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
        const digits = clipboardData.replace(/[^0-9]/g, '').slice(0, 6);

        if (digits.length > 0) {
          digits.split('').forEach((d, i) => {
            if (boxes[i]) {
              boxes[i].value = d;
              boxes[i].classList.add('filled');
            }
          });

          const nextIndex = Math.min(digits.length, 5);
          if (boxes[nextIndex]) boxes[nextIndex].focus();
          this.checkOTPGroupComplete(idArray, btnId);
        }
      });
    });
  },

  focusOTPBox(num) {
    const box = document.getElementById(`otp${num}`);
    if (box) box.focus();
  },

  focusSignupOTPBox(num) {
    const box = document.getElementById(`regOtp${num}`);
    if (box) box.focus();
  },

  getOTPCode() {
    return [1, 2, 3, 4, 5, 6]
      .map(i => {
        const el = document.getElementById(`otp${i}`);
        return el ? el.value.trim() : '';
      })
      .join('');
  },

  getSignupOTPCode() {
    return [1, 2, 3, 4, 5, 6]
      .map(i => {
        const el = document.getElementById(`regOtp${i}`);
        return el ? el.value.trim() : '';
      })
      .join('');
  },

  checkOTPGroupComplete(idArray, btnId) {
    const code = idArray.map(id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    }).join('');

    const btn = document.getElementById(btnId);
    if (btn) {
      const isComplete = code.length === 6;
      btn.disabled = !isComplete;
      btn.classList.toggle('btn-disabled', !isComplete);
    }
  },

  checkOTPComplete() {
    const code = this.getOTPCode();
    const btn = document.getElementById('verifyOtpBtn');
    if (btn) {
      const isComplete = code.length === 6;
      btn.disabled = !isComplete;
      btn.classList.toggle('btn-disabled', !isComplete);
    }
  },

  /**
   * Resend timer for OTP (120s countdown)
   */
  startResendTimer() {
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendSecondsLeft = 120;

    const resendBtn = document.getElementById('resendOtpBtn');
    const timerWrap = document.getElementById('resendTimerWrap');
    const countdownEl = document.getElementById('resendCountdown');

    if (resendBtn) resendBtn.disabled = true;
    if (timerWrap) timerWrap.style.display = 'inline';
    if (countdownEl) countdownEl.textContent = this.resendSecondsLeft;

    this.resendTimer = setInterval(() => {
      this.resendSecondsLeft--;
      if (countdownEl) countdownEl.textContent = this.resendSecondsLeft;

      if (this.resendSecondsLeft <= 0) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
        if (resendBtn) resendBtn.disabled = false;
        if (timerWrap) timerWrap.style.display = 'none';
      }
    }, 1000);
  },

  async resendOTP() {
    if (!this.currentRecoveryEmail) return;
    try {
      await auth.sendPasswordResetEmail(this.currentRecoveryEmail);
      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'OTP Code Sent', 'A fresh OTP code was sent to ' + this.currentRecoveryEmail);
      }
      this.startResendTimer();
    } catch (error) {
      const errorDiv = document.getElementById('forgotError');
      const errorText = document.getElementById('forgotErrorText');
      this._showError(errorDiv, errorText, error.message || 'Failed to resend OTP.');
    }
  },

  /**
   * Login with email or username + password
   */
  async login() {
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    const errorText = document.getElementById('loginErrorText');

    if (!identifier || !password) {
      this._showError(errorDiv, errorText, 'Please fill in all fields');
      return;
    }

    Auth.isLoggingIn = true;
    btn.classList.add('loading');
    btn.disabled = true;
    const btnText = btn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Signing in...';
    errorDiv.classList.remove('visible');

    let isSuccess = false;

    try {
      let email = identifier;
      let knownMapping = null;

      // Check if identifier is a username (no @ symbol)
      if (!identifier.includes('@')) {
        // Look up username in userMappings
        const snap = await db.ref(`userMappings/usernameToDining/${identifier.toLowerCase()}`).once('value');
        const mapping = snap.val();

        if (!mapping) {
          throw new Error('Username not found. Please check and try again.');
        }

        // Get the user's email from their dining record
        const userSnap = await db.ref(`dinings/${mapping.diningId}/users/${mapping.userId}/email`).once('value');
        email = userSnap.val();

        if (!email) {
          throw new Error('Account not properly configured. Contact your dining manager.');
        }
        knownMapping = mapping;
      }

      const emailKey = Utils.encodeEmail(email);

      // Pre-warm mapping: if username was used, we already have knownMapping.
      // If email was used, initiate mapping fetch in parallel with Supabase authentication.
      const authPromise = auth.signInWithEmailAndPassword(email, password);
      const mapPromise = knownMapping
        ? Promise.resolve(knownMapping)
        : db.ref(`userMappings/emailToDining/${emailKey}`).once('value').then(s => s.val()).catch(() => null);

      // Concurrently await both Auth and Dining Mapping (zero sequential delay!)
      const [authResult, mappingResult] = await Promise.all([authPromise, mapPromise]);
      isSuccess = true;

      const finalMapping = knownMapping || mappingResult;
      if (finalMapping && finalMapping.diningId) {
        try {
          localStorage.setItem(`ml_map_${emailKey}`, JSON.stringify(finalMapping));
        } catch (_) {}
      }

      // Pre-seed fast user info for instant boot
      try {
        const u = authResult?.user || window._currentSupabaseUser;
        if (u) {
          localStorage.setItem('ml_boot_email', email);
        }
      } catch (_) {}

      if (btnText) btnText.textContent = 'Opening Dashboard...';

      // Immediate navigation to dashboard with zero delay
      window.location.replace('dashboard.html');
      return;

    } catch (error) {
      Auth.isLoggingIn = false;
      let msg = 'Login failed. Please try again.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        msg = 'Invalid email/username or password.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try later.';
      } else if (error.message) {
        msg = error.message;
      }
      this._showError(errorDiv, errorText, msg);
    } finally {
      if (!isSuccess) {
        Auth.isLoggingIn = false;
        btn.classList.remove('loading');
        btn.disabled = false;
        if (btnText) btnText.textContent = 'Sign in';
      }
    }
  },

  /**
   * Register a new dining (create admin account + dining structure)
   */
  async register() {
    const managerName = document.getElementById('regManagerName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmEl = document.getElementById('regConfirmPassword');
    const confirmPassword = confirmEl ? confirmEl.value : password;
    const btn = document.getElementById('registerBtn');
    const errorDiv = document.getElementById('registerError');
    const errorText = document.getElementById('registerErrorText');

    // Validation
    if (!managerName || !email || !password) {
      this._showError(errorDiv, errorText, 'Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      this._showError(errorDiv, errorText, 'Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      this._showError(errorDiv, errorText, 'Password must be at least 6 characters.');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    errorDiv.classList.remove('visible');

    Auth.isRegistering = true;

    try {
      // 1. Create Auth account
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;

      // 2. Generate username
      const username = managerName.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 100);

      // 3. Create personal user record in DB
      const userData = {
        name: managerName,
        username: username,
        email: email,
        phone: phone || '',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      if (typeof db !== 'undefined' && db.ref) {
        const encodedEmail = typeof Utils !== 'undefined' && Utils.encodeEmail ? Utils.encodeEmail(email) : email.replace(/\./g, ',');
        await db.ref(`users/${uid}`).set(userData);
        await db.ref(`userMappings/emailToDining/${encodedEmail}`).set({
          email: email,
          userId: uid,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
      }

      console.log('[Messliner] User profile created successfully:', uid);

      this.currentSignupEmail = email;
      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'OTP Code Sent', 'A 6-digit verification code has been sent to ' + email);
      }

      window.location.hash = 'verify-signup-otp';
      this.goToSignupStep(2);

    } catch (error) {
      Auth.isRegistering = false;
      let msg = 'Registration failed. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Try logging in.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password is too weak. Use at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (error.message) {
        msg = error.message;
      }
      this._showError(errorDiv, errorText, msg);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  },

  /**
   * Check whether an account with the given email exists in the database
   */
  async checkAccountExists(email) {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return false;

    const encodedEmail = typeof Utils !== 'undefined' && Utils.encodeEmail
      ? Utils.encodeEmail(cleanEmail)
      : cleanEmail.replace(/\./g, ',');

    if (typeof db === 'undefined' || !db.ref) {
      console.warn('[Messliner] Firebase DB instance not available for account check');
      return false;
    }

    const hasData = (val) => val !== null && val !== undefined && typeof val === 'object' && Object.keys(val).length > 0;

    // 1. Primary Check: Check userMappings/emailToDining index
    try {
      const mappingSnap = await db.ref(`userMappings/emailToDining/${encodedEmail}`).once('value');
      if (mappingSnap.exists() && hasData(mappingSnap.val())) {
        console.log('[Messliner] Account found in userMappings/emailToDining:', cleanEmail);
        return true;
      }
    } catch (e) {
      console.warn('[Messliner] userMappings check skipped:', e.message);
    }

    // 2. Check original case encoding if case differed
    try {
      const origEncoded = typeof Utils !== 'undefined' && Utils.encodeEmail
        ? Utils.encodeEmail(email.trim())
        : email.trim().replace(/\./g, ',');
      if (origEncoded !== encodedEmail) {
        const origSnap = await db.ref(`userMappings/emailToDining/${origEncoded}`).once('value');
        if (origSnap.exists() && hasData(origSnap.val())) {
          console.log('[Messliner] Account found in userMappings (orig case):', cleanEmail);
          return true;
        }
      }
    } catch (e) {
      console.warn('[Messliner] Orig case check skipped:', e.message);
    }

    // 3. Fallback Check: Query users node in database
    try {
      const userSnap = await db.ref(`users`).orderByChild('email').equalTo(cleanEmail).once('value');
      if (userSnap.exists() && hasData(userSnap.val())) {
        console.log('[Messliner] Account found in users node:', cleanEmail);
        return true;
      }
    } catch (e) {
      console.warn('[Messliner] Users node check skipped:', e.message);
    }

    // 4. Comprehensive Fallback: Scan dinings users list
    try {
      const diningsSnap = await db.ref(`dinings`).once('value');
      const dinings = diningsSnap.val();
      if (dinings && typeof dinings === 'object') {
        for (const dId in dinings) {
          const diningUsers = dinings[dId]?.users;
          if (diningUsers && typeof diningUsers === 'object') {
            for (const uId in diningUsers) {
              const uEmail = diningUsers[uId]?.email;
              if (uEmail && String(uEmail).trim().toLowerCase() === cleanEmail) {
                console.log('[Messliner] Account found in dining users list:', cleanEmail);
                return true;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Messliner] Dinings scan skipped:', e.message);
    }

    console.log('[Messliner] No account found in database for email:', cleanEmail);
    return false;
  },

  /**
   * Step 1: Send Password Reset OTP
   */
  async forgotPassword() {
    const emailEl = document.getElementById('forgotEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    const btn = document.getElementById('forgotBtn');
    const errorDiv = document.getElementById('forgotError');
    const errorText = document.getElementById('forgotErrorText');

    if (!email) {
      this._showError(errorDiv, errorText, 'Please enter your email address.');
      return;
    }

    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    try {
      // 1. Verify if account exists in database
      const exists = await this.checkAccountExists(email);
      if (!exists) {
        throw new Error('No account found with this email address. Please sign up to create an account.');
      }

      // 2. Account exists -> Send OTP code
      await auth.sendPasswordResetEmail(email);
      this.currentRecoveryEmail = email;

      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'OTP Code Sent', 'A 6-digit verification code has been sent to ' + email);
      }

      window.location.hash = 'verify-otp';
      this.goToRecoveryStep(2);

    } catch (error) {
      console.error('[Messliner] Forgot password error:', error);
      let msg = error.message || 'Failed to send reset code.';

      if (error.status === 429 || error.code === 'over_email_send_rate_limit' || (msg && msg.toLowerCase().includes('security purposes'))) {
        msg = 'For security, please wait 2 minutes before requesting another reset code.';
      } else if (msg.includes('Error sending recovery email')) {
        msg = 'Unable to send email right now. Please check your Supabase Email provider settings.';
      }

      this._showError(errorDiv, errorText, msg);
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  },

  /**
   * Step 2: Verify 6-digit OTP Code
   */
  async verifyOTP() {
    const otpCode = this.getOTPCode();
    const btn = document.getElementById('verifyOtpBtn');
    const errorDiv = document.getElementById('forgotError');
    const errorText = document.getElementById('forgotErrorText');
    const boxes = [1, 2, 3, 4, 5, 6].map(i => document.getElementById(`otp${i}`));

    if (otpCode.length !== 6) {
      this._showError(errorDiv, errorText, 'Please enter the complete 6-digit OTP code.');
      return;
    }

    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    try {
      const email = this.currentRecoveryEmail || (document.getElementById('forgotEmail') ? document.getElementById('forgotEmail').value.trim() : '');
      await auth.verifyOTP(email, otpCode);

      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'OTP Verified', 'Code verified! Now set your new password.');
      }

      window.location.hash = 'reset-password';
      this.goToRecoveryStep(3);

    } catch (error) {
      console.error('[Messliner] Verify OTP error:', error);
      boxes.forEach(b => {
        if (b) {
          b.classList.add('error');
          setTimeout(() => b.classList.remove('error'), 1000);
        }
      });
      let msg = 'Invalid or expired OTP code. Please check and try again.';
      if (error.message) msg = error.message;
      this._showError(errorDiv, errorText, msg);
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  },

  /**
   * Resend timer for Signup OTP (120s countdown)
   */
  startSignupResendTimer() {
    if (this.signupResendTimer) clearInterval(this.signupResendTimer);
    this.signupResendSecondsLeft = 120;

    const resendBtn = document.getElementById('resendSignupOtpBtn');
    const timerWrap = document.getElementById('resendSignupTimerWrap');
    const countdownEl = document.getElementById('resendSignupCountdown');

    if (resendBtn) resendBtn.disabled = true;
    if (timerWrap) timerWrap.style.display = 'inline';
    if (countdownEl) countdownEl.textContent = this.signupResendSecondsLeft;

    this.signupResendTimer = setInterval(() => {
      this.signupResendSecondsLeft--;
      if (countdownEl) countdownEl.textContent = this.signupResendSecondsLeft;

      if (this.signupResendSecondsLeft <= 0) {
        clearInterval(this.signupResendTimer);
        this.signupResendTimer = null;
        if (resendBtn) resendBtn.disabled = false;
        if (timerWrap) timerWrap.style.display = 'none';
      }
    }, 1000);
  },

  async resendSignupOTP() {
    if (!this.currentSignupEmail) return;
    try {
      if (typeof auth.resendSignupOTP === 'function') {
        await auth.resendSignupOTP(this.currentSignupEmail);
      } else {
        await auth.sendPasswordResetEmail(this.currentSignupEmail);
      }
      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'OTP Code Sent', 'A fresh OTP code was sent to ' + this.currentSignupEmail);
      }
      this.startSignupResendTimer();
    } catch (error) {
      const errorDiv = document.getElementById('registerError');
      const errorText = document.getElementById('registerErrorText');
      this._showError(errorDiv, errorText, error.message || 'Failed to resend OTP.');
    }
  },

  /**
   * Verify Signup 6-digit OTP Code
   */
  async verifySignupOTP() {
    const otpCode = this.getSignupOTPCode();
    const btn = document.getElementById('verifySignupOtpBtn');
    const errorDiv = document.getElementById('registerError');
    const errorText = document.getElementById('registerErrorText');
    const boxes = [1, 2, 3, 4, 5, 6].map(i => document.getElementById(`regOtp${i}`));

    if (otpCode.length !== 6) {
      this._showError(errorDiv, errorText, 'Please enter the complete 6-digit OTP code.');
      return;
    }

    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    try {
      const email = this.currentSignupEmail || (document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '');
      await auth.verifyOTP(email, otpCode, 'signup');

      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'Email Verified', 'Verification successful! Redirecting to setup...');
      }

      Auth.isRegistering = false;
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);

    } catch (error) {
      console.error('[Messliner] Signup verify OTP error:', error);
      boxes.forEach(b => {
        if (b) {
          b.classList.add('error');
          setTimeout(() => b.classList.remove('error'), 1000);
        }
      });
      let msg = 'Invalid or expired OTP code. Please check and try again.';
      if (error.message) msg = error.message;
      this._showError(errorDiv, errorText, msg);
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  },

  /**
   * Step 3: Update password for user
   */
  async updatePassword() {
    const newPwdEl = document.getElementById('newPassword');
    const confirmPwdEl = document.getElementById('confirmPassword');
    const newPassword = newPwdEl ? newPwdEl.value : '';
    const confirmPassword = confirmPwdEl ? confirmPwdEl.value : newPassword;
    const btn = document.getElementById('resetPasswordBtn');
    const errorDiv = document.getElementById('forgotError');
    const errorText = document.getElementById('forgotErrorText');

    if (!newPassword || newPassword.length < 6) {
      this._showError(errorDiv, errorText, 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      this._showError(errorDiv, errorText, 'Passwords do not match.');
      return;
    }

    if (errorDiv) {
      errorDiv.classList.remove('visible');
      errorDiv.style.display = 'none';
    }
    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    try {
      await auth.updatePassword(newPassword);

      if (typeof Notifications !== 'undefined') {
        Notifications.toast('success', 'Password Updated', 'Your password has been updated. Please sign in.');
      } else {
        alert('Your password has been updated. Please sign in.');
      }

      if (newPwdEl) newPwdEl.value = '';
      if (confirmPwdEl) confirmPwdEl.value = '';

      setTimeout(() => {
        window.location.hash = 'login';
      }, 1500);

    } catch (error) {
      console.error('[Messliner] Update password error:', error);
      let msg = error.message || 'Failed to update password.';
      this._showError(errorDiv, errorText, msg);
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  },

  /**
   * Sign out
   */
  async logout() {
    try {
      await auth.signOut();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Logout error:', error);
      if (typeof Notifications !== 'undefined') {
        Notifications.toast('error', 'Error', 'Failed to sign out.');
      }
    }
  },

  /**
   * Show error message in auth form
   */
  _showError(errorDiv, errorText, message) {
    if (errorDiv && errorText) {
      errorText.textContent = message;
      errorDiv.classList.add('visible');
      errorDiv.style.display = 'flex';
    } else if (typeof Notifications !== 'undefined') {
      Notifications.toast('error', 'Error', message);
    } else {
      alert(message);
    }
  }
};

// Auto-initialize on login page
if (document.getElementById('authPage')) {
  Auth.init();
}

console.log('[Messliner] Auth loaded');
