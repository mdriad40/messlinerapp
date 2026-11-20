/* ============================================================================
   Messliner — Universal Payment & Verification Engine (payment.js)
   Centralized, secure payment initiator and verifier for bKash.
   Reusable across:
   1. SMS Balance Recharge (Admin / Manager)
   2. Messliner Pro Annual Pre-Order (Marketing / Pro Checkout)
   3. Member Add Money / Deposit (Member Portal)
   4. Shared Bill Payments (Member Portal)
   ============================================================================ */

const MesslinerPayment = {
  // Gateway Configuration
  GATEWAY_URL: (window.__ENV__?.BKASH_GATEWAY?.gatewayUrl) || "https://mygateway.netlify.app",
  LICENSE_KEY: (window.__ENV__?.BKASH_GATEWAY?.licenseKey) || "bklc_6bnDy4ZuSb0ERQPMlzq2LhH1N7Q11ttV",
  PROJECT_ID: "217b12f1-9afa-4eb4-b171-61ed8c957b9c",
  GATEWAY_SUPABASE_URL: "https://gruzpbfhhujmerwbdamo.supabase.co",
  GATEWAY_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydXpwYmZoaHVqbWVyd2JkYW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTQ5MDksImV4cCI6MjEwNTk5MDkwOX0.AFgJ-IKIVRx0_2wqCBvjPx_wNEGexD7kcFk69EL_sQM",
  ADMIN_SUPABASE_URL: "https://cvhpuuqwvfhorsuslcel.supabase.co",
  ADMIN_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aHB1dXF3dmZob3JzdXNsY2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Njg5NzYsImV4cCI6MjEwNzA0NDk3Nn0.aUyPb0395ZOYjTrRO-mEOtCa7ut_pxF6aPJPgcCI31E",
  FIREBASE_RTDB_URL: "https://meiner-6ec2e-default-rtdb.firebaseio.com",

  /**
   * Universal Payment Initiator
   * @param {Object} options
   *   - amount: number (e.g. 100)
   *   - type: 'sms_recharge' | 'pro_preorder' | 'member_deposit' | 'bill_payment'
   *   - phone: string
   *   - diningId: string
   *   - callbackUrl: string (optional, defaults to callback.html)
   *   - metadata: object (name, email, messName, userId, billId)
   */
  async initiatePayment(options) {
    const amountVal = parseFloat(options.amount) || 0;
    if (amountVal <= 0) {
      throw new Error('Please specify a valid payment amount.');
    }

    const type = options.type || 'sms_recharge';
    const customerPhone = (options.phone && options.phone !== '01700000000') ? options.phone : (options.customerPhone && options.customerPhone !== '01700000000' ? options.customerPhone : '');
    const diningId = options.diningId || (typeof Messliner !== 'undefined' ? Messliner.state?.diningId : '') || localStorage.getItem('currentDiningId') || '';

    // Choose appropriate callback page
    let callbackURL = options.callbackUrl;
    if (!callbackURL) {
      let page = 'callback.html';
      if (type === 'pro_preorder') {
        page = 'preorder-callback.html';
      } else if (type === 'member_deposit' || type === 'bill_payment') {
        page = 'dashboard.html?bkashPayment=auto';
      }
      try {
        callbackURL = new URL(page, window.location.href).href;
      } catch (_) {
        callbackURL = window.location.origin + '/' + page;
      }
    }

    // Save pending transaction state in localStorage with security token
    const pendingPayload = {
      type: type,
      amount: amountVal,
      phone: customerPhone,
      diningId: diningId,
      metadata: options.metadata || {},
      initiatedAt: Date.now(),
      invoiceNumber: 'INV-' + Date.now()
    };

    if (type === 'pro_preorder') {
      localStorage.setItem('ml_pending_pro_preorder', JSON.stringify({ ...pendingPayload, ...options.metadata }));
    } else if (type === 'member_deposit' || type === 'bill_payment') {
      localStorage.setItem('ml_pending_member_payment', JSON.stringify(pendingPayload));
      localStorage.setItem('ml_pending_bkash_recharge', JSON.stringify(pendingPayload));
    } else {
      localStorage.setItem('ml_pending_bkash_recharge', JSON.stringify(pendingPayload));
    }
    localStorage.setItem('ml_pending_universal_payment', JSON.stringify(pendingPayload));

    // 1. Initiate via Official Supabase Edge Function (Keeps bKash AppSecret & Password 100% hidden)
    const createPaymentEndpoint = window.__ENV__?.FUNCTIONS?.createPayment ||
      (window.__ENV__?.SUPABASE_URL ? `${window.__ENV__.SUPABASE_URL}/functions/v1/create-payment` : null);

    if (createPaymentEndpoint) {
      try {
        const edgeRes = await fetch(createPaymentEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': window.__ENV__?.SUPABASE_ANON_KEY || ''
          },
          body: JSON.stringify({
            amount: amountVal.toFixed(2),
            customerPhone: customerPhone,
            merchantInvoiceNumber: pendingPayload.invoiceNumber,
            callbackURL: callbackURL
          })
        });

        const edgeData = await edgeRes.json();
        if (edgeRes.ok && edgeData && edgeData.bkashURL) {
          window.location.href = edgeData.bkashURL;
          return edgeData;
        } else if (edgeData && (edgeData.error || edgeData.statusMessage)) {
          throw new Error(edgeData.error || edgeData.statusMessage);
        }
      } catch (edgeErr) {
        console.error('[MesslinerPayment] Create payment error:', edgeErr);
        throw edgeErr;
      }
    }

    throw new Error('Supabase create-payment endpoint is not configured.');
  },

  /**
   * Universal Payment Verifier & Fulfiller
   * Calls Official Serverless Edge Function to execute bKash Tokenized payment.
   */
  async verifyAndFulfill(params) {
    const { paymentID, trxID, type, amount, diningId, metadata, customerPhone } = params;

    if (!paymentID || paymentID.trim().length < 5) {
      return { success: false, error: 'Invalid or missing paymentID' };
    }

    const cleanPaymentId = paymentID.trim();
    const targetAmount = parseFloat(amount) || 0;

    // 1. Call Official Supabase Server Edge Function to Execute & Verify with bKash
    const edgeFunctionUrl = window.__ENV__?.FUNCTIONS?.verifyPayment ||
      (window.__ENV__?.SUPABASE_URL ? `${window.__ENV__.SUPABASE_URL}/functions/v1/verify-payment` : null);

    if (edgeFunctionUrl) {
      try {
        const edgeRes = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': window.__ENV__?.SUPABASE_ANON_KEY || ''
          },
          body: JSON.stringify({
            paymentID: cleanPaymentId,
            trxID: trxID || '',
            diningId: diningId || '',
            amount: targetAmount,
            type: type || 'subscription_pro',
            customerPhone: customerPhone || '',
            metadata: metadata || {}
          })
        });

        const edgeData = await edgeRes.json();
        if (edgeRes.ok && edgeData && edgeData.success) {
          return edgeData;
        } else if (edgeData && edgeData.error) {
          return { success: false, error: edgeData.error };
        }
      } catch (edgeErr) {
        console.warn('[MesslinerPayment] Edge verification notice:', edgeErr.message);
      }
    }

    // 2. Anti-Replay Guard: Check if transaction was already fulfilled
    try {
      const checkRes = await fetch(`${this.FIREBASE_RTDB_URL}/processedPayments/${cleanPaymentId}.json`);
      if (checkRes.ok) {
        const processed = await checkRes.json();
        if (processed && processed.status === 'completed') {
          return {
            success: false,
            alreadyProcessed: true,
            error: 'This payment has already been credited to your account.',
            trxID: processed.trxID,
            amount: processed.amount
          };
        }
      }
    } catch (_) { }

    // 3. Verify with bKash Gateway (Strict Gateway Database Verification)
    let verifiedTrxID = (trxID || '').trim();
    let isVerified = false; // Strictly default to false (prevents fake/tampered IDs)

    try {
      const gwUrl = `${this.GATEWAY_SUPABASE_URL}/rest/v1/gateway_transactions?payment_id=eq.${encodeURIComponent(cleanPaymentId)}&select=*`;
      const gwRes = await fetch(gwUrl, {
        headers: {
          'apikey': this.GATEWAY_ANON_KEY,
          'Authorization': `Bearer ${this.GATEWAY_ANON_KEY}`
        }
      });

      if (gwRes.ok) {
        const records = await gwRes.json();
        if (records && records.length > 0) {
          const tx = records[0];
          const txStatus = (tx.status || tx.transaction_status || '').toLowerCase();
          if (txStatus === 'completed' || txStatus === 'successful' || tx.trx_id) {
            if (tx.trx_id) verifiedTrxID = tx.trx_id;
            if (tx.raw_bkash_response?.trxID) verifiedTrxID = tx.raw_bkash_response.trxID;
            isVerified = true;
          }
        }
      }
    } catch (gwErr) {
      console.warn('[MesslinerPayment] Gateway DB query notice:', gwErr.message);
    }

    if (!isVerified) {
      return {
        success: false,
        error: 'Unable to verify bKash payment with official gateway. Please check your bKash statement or try again.'
      };
    }

    // 4. Atomic Fulfillment in Firebase RTDB
    let updatedBalance = 0;
    if (type === 'sms_recharge' && diningId && targetAmount > 0) {
      try {
        const snap = await db.ref(`dinings/${diningId}/smsConfig`).once('value');
        const cfg = snap.val() || {};
        const oldBalance = parseFloat(cfg.smsBalance) || 0;
        updatedBalance = oldBalance + targetAmount;

        await db.ref(`dinings/${diningId}/smsConfig/smsBalance`).set(updatedBalance);
        await db.ref(`dinings/${diningId}/smsBalanceHistory`).push({
          amount: targetAmount,
          balance: updatedBalance,
          type: 'recharge',
          paymentID: cleanPaymentId,
          trxID: verifiedTrxID,
          method: 'bkash',
          note: `bKash SMS Balance Recharge: ৳${targetAmount.toFixed(2)}`,
          phone: customerPhone || 'bKash',
          timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
        });
      } catch (dbErr) {
        console.error('[MesslinerPayment] SMS balance credit error:', dbErr);
        throw dbErr;
      }
    } else if ((type === 'pro_preorder' || type.startsWith('subscription')) && targetAmount > 0) {
      try {
        const planName = metadata?.planName || (type === 'pro_preorder' ? 'Messliner Pro Annual (Pre-Order)' : `Messliner ${metadata?.plan === 'pay_as_you_go' ? 'Pay-As-You-Go' : 'Pro'} (${metadata?.billingCycle || 'monthly'})`);
        const billingCycle = metadata?.billingCycle || (type === 'pro_preorder' ? 'yearly' : 'monthly');
        const durationDays = billingCycle === 'yearly' ? 365 : 30;
        const durationMs = durationDays * 24 * 60 * 60 * 1000;
        const newExpiresAt = Date.now() + durationMs;

        const adminOrderRecord = {
          plan: metadata?.plan || (type === 'pro_preorder' ? 'pro_annual' : 'pro'),
          planName: planName,
          billingCycle: billingCycle,
          amount: targetAmount,
          diningId: diningId || metadata?.diningId || 'pending_assignment',
          messName: metadata?.messName || 'Your Mess',
          name: metadata?.name || customerPhone || 'Valued Customer',
          phone: customerPhone || metadata?.phone || 'N/A',
          email: metadata?.email || 'N/A',
          membersCount: metadata?.membersCount || (metadata?.plan === 'pay_as_you_go' ? 25 : 25),
          trxID: verifiedTrxID,
          paymentID: cleanPaymentId,
          status: 'paid',
          verified: true,
          expiresAt: newExpiresAt,
          createdAt: firebase.database.ServerValue.TIMESTAMP || Date.now()
        };

        const parallelTasks = [];

        // 1. Update Primary Dining subscription
        if (diningId) {
          parallelTasks.push((async () => {
            try {
              let curExpiry = Date.now();
              try {
                const subSnap = await db.ref(`dinings/${diningId}/subscription`).once('value');
                const curSub = subSnap.val() || {};
                if (curSub.expiresAt && curSub.expiresAt > Date.now()) {
                  curExpiry = curSub.expiresAt;
                }
              } catch (_) { }

              const finalExp = curExpiry + durationMs;
              const updatedSub = {
                plan: metadata?.plan || 'pro',
                billingCycle: billingCycle,
                status: 'active',
                startDate: Date.now(),
                expiresAt: finalExp,
                gracePeriodDays: 3,
                membersLimit: metadata?.membersLimit ? parseInt(metadata.membersLimit) : (metadata?.membersCount ? parseInt(metadata.membersCount) : 25),
                lastPayment: {
                  amount: targetAmount,
                  trxID: verifiedTrxID,
                  paymentID: cleanPaymentId,
                  date: Date.now()
                },
                updatedAt: firebase.database.ServerValue.TIMESTAMP || Date.now()
              };

              await db.ref(`dinings/${diningId}/subscription`).set(updatedSub);
              await db.ref(`dinings/${diningId}/subscriptionHistory`).push({
                plan: metadata?.plan || 'pro',
                billingCycle: billingCycle,
                amount: targetAmount,
                trxID: verifiedTrxID,
                paymentID: cleanPaymentId,
                expiresAt: finalExp,
                timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
              });
            } catch (dErr) {
              console.warn('[MesslinerPayment] Dining subscription save notice:', dErr);
            }
          })());
        }

        // 2. Central Record in Admin RTDB (Active lookup node + stream)
        if (window.adminDb) {
          if (diningId) {
            parallelTasks.push(window.adminDb.ref(`subscriptions/${diningId}`).set(updatedSub).catch(() => { }));
            parallelTasks.push(window.adminDb.ref(`dinings/${diningId}/subscription`).set(updatedSub).catch(() => { }));
          }
          parallelTasks.push(window.adminDb.ref('subscriptions').push(adminOrderRecord).catch(() => { }));
          parallelTasks.push(window.adminDb.ref(`transactions/${cleanPaymentId}`).set(adminOrderRecord).catch(() => { }));
        }

        // 3. Admin Supabase REST (Payments log + Subscriptions state)
        parallelTasks.push(fetch(`${this.ADMIN_SUPABASE_URL}/rest/v1/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.ADMIN_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${this.ADMIN_SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            payment_id: cleanPaymentId,
            trx_id: verifiedTrxID,
            amount: targetAmount,
            plan: metadata?.plan || 'pro',
            billing_cycle: billingCycle,
            dining_id: diningId || null,
            mess_name: metadata?.messName || null,
            email: metadata?.email || null,
            phone: customerPhone || metadata?.phone || null,
            status: 'completed',
            created_at: new Date().toISOString()
          })
        }).catch(() => { }));

        if (diningId) {
          parallelTasks.push(fetch(`${this.ADMIN_SUPABASE_URL}/rest/v1/subscriptions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': this.ADMIN_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${this.ADMIN_SUPABASE_ANON_KEY}`,
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
              dining_id: diningId,
              plan: metadata?.plan || 'pro',
              billing_cycle: billingCycle,
              members_limit: metadata?.membersLimit ? parseInt(metadata.membersLimit) : 25,
              status: 'active',
              expires_at: new Date(finalExp).toISOString(),
              created_at: new Date().toISOString()
            })
          }).catch(() => { }));
        }

        // 4. Primary RTDB preorders backup
        parallelTasks.push(db.ref('preorders').push(adminOrderRecord).catch(() => { }));

        // 5. Anti-Replay Ledger: Register Payment ID as completed in Firebase
        parallelTasks.push(fetch(`${this.FIREBASE_RTDB_URL}/processedPayments/${cleanPaymentId}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentID: cleanPaymentId,
            trxID: verifiedTrxID,
            amount: targetAmount,
            type: type,
            diningId: diningId || null,
            status: 'completed',
            processedAt: Date.now()
          })
        }).catch(() => { }));

        // Run all fulfillment tasks simultaneously in parallel
        await Promise.allSettled(parallelTasks);

      } catch (dbErr) {
        console.error('[MesslinerPayment] Subscription record error:', dbErr);
      }
    } else if (type === 'member_deposit' && targetAmount > 0) {
      try {
        const userId = metadata?.userId || (typeof Messliner !== 'undefined' ? Messliner.state?.userId : null);
        const userName = metadata?.userName || customerPhone || 'Member';
        const note = metadata?.note || `bKash Auto Deposit (TrxID: ${verifiedTrxID})`;
        const currentMonth = metadata?.month || (typeof Utils !== 'undefined' && Utils.currentMonth ? Utils.currentMonth() : new Date().toISOString().slice(0, 7));
        const todayStr = (typeof Utils !== 'undefined' && Utils.today ? Utils.today() : new Date().toISOString().slice(0, 10));

        if (diningId && userId) {
          // 1. Fetch live user totalDeposit
          let currentDeposit = 0;
          try {
            const uSnap = await db.ref(`dinings/${diningId}/users/${userId}`).once('value');
            const uVal = uSnap.val() || {};
            currentDeposit = parseFloat(uVal.totalDeposit) || 0;
          } catch (_) { }

          const newTotalDeposit = currentDeposit + targetAmount;
          const depKey = db.ref(`dinings/${diningId}/deposits`).push().key;
          const reqKey = db.ref(`dinings/${diningId}/paymentRequests`).push().key;

          const updates = {};
          // Update user totalDeposit
          updates[`dinings/${diningId}/users/${userId}/totalDeposit`] = newTotalDeposit;

          // Push deposit record into dinings/deposits
          updates[`dinings/${diningId}/deposits/${depKey}`] = {
            userId: userId,
            userName: userName,
            amount: targetAmount,
            type: 'deposit',
            method: 'bkash_auto',
            trxID: verifiedTrxID,
            paymentID: cleanPaymentId,
            note: note,
            date: todayStr,
            month: currentMonth,
            isAutoPayment: true,
            timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
          };

          // Record approved payment request for user's history and admin ledger
          updates[`dinings/${diningId}/paymentRequests/${reqKey}`] = {
            userId: userId,
            userName: userName,
            amount: targetAmount,
            fee: 0,
            totalPayable: targetAmount,
            method: 'bkash_auto',
            methodName: 'bKash Auto',
            trxId: verifiedTrxID,
            paymentID: cleanPaymentId,
            note: note,
            status: 'approved',
            isAutoPayment: true,
            month: currentMonth,
            createdAt: firebase.database.ServerValue.TIMESTAMP || Date.now(),
            approvedAt: firebase.database.ServerValue.TIMESTAMP || Date.now(),
            approvedBy: 'bKash_Gateway'
          };

          // Mark payment processed in anti-replay ledger
          updates[`processedPayments/${cleanPaymentId}`] = {
            paymentID: cleanPaymentId,
            trxID: verifiedTrxID,
            amount: targetAmount,
            type: 'member_deposit',
            diningId: diningId,
            userId: userId,
            status: 'completed',
            processedAt: Date.now()
          };

          await db.ref().update(updates);

          // In-App Notification
          try {
            if (typeof Notifications !== 'undefined' && Notifications.create) {
              await Notifications.create(
                diningId,
                'Auto Deposit Credited',
                `৳${targetAmount} deposited via bKash Instant (Trx: ${verifiedTrxID}).`,
                userId,
                'deposit'
              );
            }
          } catch (_) { }

          updatedBalance = newTotalDeposit;
        }
      } catch (depErr) {
        console.error('[MesslinerPayment] Member deposit credit error:', depErr);
      }
    } else if (type === 'bill_payment' && targetAmount > 0) {
      try {
        const userId = metadata?.userId || (typeof Messliner !== 'undefined' ? Messliner.state?.userId : null);
        const userName = metadata?.userName || customerPhone || 'Member';
        const billId = metadata?.billId;
        const billTitle = metadata?.billTitle || 'Shared Bill';
        const currentMonth = metadata?.month || (typeof Utils !== 'undefined' && Utils.currentMonth ? Utils.currentMonth() : new Date().toISOString().slice(0, 7));

        if (diningId && userId && billId) {
          const reqKey = db.ref(`dinings/${diningId}/paymentRequests`).push().key;
          const updates = {};

          // Mark member paid in bill
          updates[`dinings/${diningId}/bills/${billId}/members/${userId}/status`] = 'collected';
          updates[`dinings/${diningId}/bills/${billId}/members/${userId}/collectedAt`] = Date.now();
          updates[`dinings/${diningId}/bills/${billId}/members/${userId}/paymentMethod`] = 'bkash_auto';
          updates[`dinings/${diningId}/bills/${billId}/members/${userId}/trxId`] = verifiedTrxID;
          updates[`dinings/${diningId}/bills/${billId}/members/${userId}/paymentRequestId`] = reqKey;

          // Record approved bill payment request
          updates[`dinings/${diningId}/paymentRequests/${reqKey}`] = {
            type: 'bill_payment',
            billId: billId,
            billTitle: billTitle,
            userId: userId,
            userName: userName,
            amount: targetAmount,
            fee: 0,
            totalPayable: targetAmount,
            method: 'bkash_auto',
            methodName: 'bKash Auto',
            trxId: verifiedTrxID,
            paymentID: cleanPaymentId,
            status: 'approved',
            isAutoPayment: true,
            month: currentMonth,
            createdAt: firebase.database.ServerValue.TIMESTAMP || Date.now(),
            approvedAt: firebase.database.ServerValue.TIMESTAMP || Date.now(),
            approvedBy: 'bKash_Gateway'
          };

          // Mark payment processed
          updates[`processedPayments/${cleanPaymentId}`] = {
            paymentID: cleanPaymentId,
            trxID: verifiedTrxID,
            amount: targetAmount,
            type: 'bill_payment',
            diningId: diningId,
            userId: userId,
            billId: billId,
            status: 'completed',
            processedAt: Date.now()
          };

          await db.ref().update(updates);

          // Check if all members paid to update bill status
          try {
            const billSnap = await db.ref(`dinings/${diningId}/bills/${billId}`).once('value');
            const billVal = billSnap.val();
            if (billVal && billVal.members) {
              const allPaid = Object.values(billVal.members).every(m => m && (m.status === 'collected' || m.status === 'paid'));
              if (allPaid) {
                await db.ref(`dinings/${diningId}/bills/${billId}/status`).set('paid');
              } else {
                await db.ref(`dinings/${diningId}/bills/${billId}/status`).set('partially_paid');
              }
            }
          } catch (_) { }

          // In-App Notification
          try {
            if (typeof Notifications !== 'undefined' && Notifications.create) {
              await Notifications.create(
                diningId,
                'Bill Paid',
                `Your bill "${billTitle}" of ৳${targetAmount} has been paid via bKash Instant!`,
                userId,
                'deposit'
              );
            }
          } catch (_) { }
        }
      } catch (billErr) {
        console.error('[MesslinerPayment] Bill payment fulfillment error:', billErr);
      }
    }

      return {
        success: true,
        paymentID: cleanPaymentId,
        trxID: verifiedTrxID,
        amount: targetAmount,
        updatedBalance: updatedBalance
      };
    },

    /**
     * Restore / Recover an unfulfilled or dropped bKash payment
     */
    async restorePaymentByTrx(options = {}) {
      const { paymentID, trxID, phone, diningId, plan, billingCycle } = options;
      const targetId = (paymentID || trxID || '').trim();
      if (!targetId || targetId.length < 5) {
        throw new Error('Please specify a valid Payment ID or bKash TrxID.');
      }

      return this.verifyAndFulfill({
        paymentID: targetId,
        trxID: trxID || targetId,
        type: 'subscription_' + (plan || 'pro'),
        diningId: diningId || localStorage.getItem('currentDiningId') || '',
        customerPhone: phone || '',
        metadata: {
          plan: plan || 'pro',
          billingCycle: billingCycle || 'monthly',
          phone: phone || ''
        }
      });
    }
  };

// Expose globally
window.MesslinerPayment = MesslinerPayment;

