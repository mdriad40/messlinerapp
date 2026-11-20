// Supabase Edge Function: verify-payment
// Official bKash Tokenized Checkout API (v1.2.0-beta)
// Server-Side Payment Execution & Fulfillment Engine
// Protects against client-side tampering, URL forgery, and replay attacks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BKASH_BASE_URL = (Deno.env.get("BKASH_BASE_URL") || "https://tokenized.pay.bka.sh/v1.2.0-beta").replace(/\/+$/, "");
const BKASH_APP_KEY = Deno.env.get("BKASH_APP_KEY") || "";
const BKASH_APP_SECRET = Deno.env.get("BKASH_APP_SECRET") || "";
const BKASH_USERNAME = Deno.env.get("BKASH_USERNAME") || "";
const BKASH_PASSWORD = Deno.env.get("BKASH_PASSWORD") || "";

const FIREBASE_RTDB_URL = Deno.env.get("FIREBASE_RTDB_URL") || "https://meiner-6ec2e-default-rtdb.firebaseio.com";
const ADMIN_FIREBASE_RTDB_URL = Deno.env.get("ADMIN_FIREBASE_RTDB_URL") || "https://meiner-admin-default-rtdb.firebaseio.com";
const FIREBASE_DB_SECRET = Deno.env.get("FIREBASE_DB_SECRET") || "";
const ADMIN_FIREBASE_DB_SECRET = Deno.env.get("ADMIN_FIREBASE_DB_SECRET") || "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@messliner.com";

// Admin Supabase Project (cvhpuuqwvfhorsuslcel - Messliner Admin Platform)
const ADMIN_SUPABASE_URL = Deno.env.get("ADMIN_SUPABASE_URL") || "https://cvhpuuqwvfhorsuslcel.supabase.co";
const ADMIN_SUPABASE_ANON_KEY = Deno.env.get("ADMIN_SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aHB1dXF3dmZob3JzdXNsY2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Njg5NzYsImV4cCI6MjEwNzA0NDk3Nn0.aUyPb0395ZOYjTrRO-mEOtCa7ut_pxF6aPJPgcCI31E";

interface PaymentPayload {
  paymentID: string;
  trxID?: string;
  diningId?: string;
  amount: number;
  type: "sms_recharge" | "pro_preorder" | "member_deposit" | "bill_payment" | string;
  customerPhone?: string;
  metadata?: {
    name?: string;
    email?: string;
    messName?: string;
    userId?: string;
    billId?: string;
    phone?: string;
    plan?: string;
    planName?: string;
    billingCycle?: string;
    membersCount?: number;
    membersLimit?: number;
    invoiceNo?: string;
  };
}

async function grantToken(): Promise<string> {
  if (!BKASH_APP_KEY || !BKASH_APP_SECRET || !BKASH_USERNAME || !BKASH_PASSWORD) {
    throw new Error("Missing bKash credentials in Supabase environment secrets (BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD)");
  }

  const tokenRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "username": BKASH_USERNAME,
      "password": BKASH_PASSWORD
    },
    body: JSON.stringify({
      app_key: BKASH_APP_KEY,
      app_secret: BKASH_APP_SECRET
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.id_token) {
    const errMsg = tokenData.statusMessage || tokenData.errorMessage || "Failed to grant bKash token";
    throw new Error(`bKash Token Grant Failed: ${errMsg}`);
  }

  return tokenData.id_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Request Method
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: PaymentPayload = await req.json();
    const { paymentID, trxID, diningId, amount, type, customerPhone, metadata } = body;

    if (!paymentID || typeof paymentID !== "string" || paymentID.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing paymentID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestedAmount = parseFloat(String(amount)) || 0;
    const cleanPaymentId = paymentID.trim();

    const primaryAuthQuery = FIREBASE_DB_SECRET ? `?auth=${encodeURIComponent(FIREBASE_DB_SECRET)}` : "";
    const adminAuthQuery = ADMIN_FIREBASE_DB_SECRET ? `?auth=${encodeURIComponent(ADMIN_FIREBASE_DB_SECRET)}` : (FIREBASE_DB_SECRET ? `?auth=${encodeURIComponent(FIREBASE_DB_SECRET)}` : "");

    // 2. Anti-Replay Safeguard: Check if transaction was already fulfilled
    const checkReplayUrl = `${FIREBASE_RTDB_URL}/processedPayments/${cleanPaymentId}.json${primaryAuthQuery}`;
    try {
      const replayCheckRes = await fetch(checkReplayUrl);
      if (replayCheckRes.ok) {
        const existing = await replayCheckRes.json();
        if (existing && existing.status === "completed") {
          return new Response(
            JSON.stringify({
              success: true,
              alreadyProcessed: true,
              message: "Payment has already been completed.",
              trxID: existing.trxID,
              amount: existing.amount,
              updatedBalance: existing.updatedBalance || 0
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } catch (_) {}

    // 3. Official bKash Payment Execution & Verification (Server-to-Server)
    let verifiedTrxID = (trxID || "").trim();
    let verifiedAmount = requestedAmount;
    let isGatewayVerified = false;

    try {
      const idToken = await grantToken();

      // Execute Payment on bKash
      const executeRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": idToken,
          "X-APP-Key": BKASH_APP_KEY
        },
        body: JSON.stringify({
          paymentID: cleanPaymentId
        })
      });

      const executeData = await executeRes.json();

      if (executeData.statusCode === "0000" && (executeData.transactionStatus === "Completed" || executeData.trxID)) {
        isGatewayVerified = true;
        verifiedTrxID = executeData.trxID;
        verifiedAmount = parseFloat(executeData.amount) || requestedAmount;
      } else if (
        executeData.statusCode === "2062" ||
        executeData.statusCode === "2117" ||
        (executeData.statusMessage && executeData.statusMessage.toLowerCase().includes("already"))
      ) {
        // bKash: "The payment has already been completed" -> Query status
        const queryRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/payment/search/${cleanPaymentId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": idToken,
            "X-APP-Key": BKASH_APP_KEY
          }
        });
        const queryData = await queryRes.json();
        if ((queryData.transactionStatus === "Completed" || queryData.statusCode === "0000") && queryData.trxID) {
          isGatewayVerified = true;
          verifiedTrxID = queryData.trxID;
          verifiedAmount = parseFloat(queryData.amount) || requestedAmount;
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error: executeData.statusMessage || "bKash payment was not confirmed.",
              statusCode: executeData.statusCode
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: executeData.statusMessage || executeData.errorMessage || "bKash payment execution was not successful.",
            statusCode: executeData.statusCode
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (bErr: any) {
      console.error("[verify-payment] bKash Execution Error:", bErr.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: bErr.message || "Failed to communicate with official bKash server."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isGatewayVerified) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "bKash transaction verification failed. Please check your bKash statement or try again."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Atomic Business Fulfillment in Firebase Realtime Database & Admin Central
    let updatedBalance = 0;

    if (type.startsWith("subscription") || type === "pro_preorder") {
      // ── Step 4A: Fetch Official Dynamic Subscription Plans & Rates from Admin Supabase ──
      let proMonthlyRate = 60;
      let proYearlyRate = 499;
      let paygoMonthlyRate = 2.49;
      let paygoYearlyRate = 29.99;
      let trialDays = 30;
      let gracePeriodDays = 3;
      let defaultMembersLimit = 25;

      try {
        const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
        const { data: plansRows, error: plansErr } = await adminSupabase
          .from("subscription_plans")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (!plansErr && plansRows && plansRows.length > 0) {
          const cfg = plansRows[0];
          if (cfg.pro_monthly_rate !== undefined && cfg.pro_monthly_rate !== null) proMonthlyRate = parseFloat(cfg.pro_monthly_rate);
          if (cfg.pro_yearly_rate !== undefined && cfg.pro_yearly_rate !== null) proYearlyRate = parseFloat(cfg.pro_yearly_rate);
          if (cfg.paygo_monthly_rate !== undefined && cfg.paygo_monthly_rate !== null) paygoMonthlyRate = parseFloat(cfg.paygo_monthly_rate);
          if (cfg.paygo_yearly_rate !== undefined && cfg.paygo_yearly_rate !== null) paygoYearlyRate = parseFloat(cfg.paygo_yearly_rate);
          if (cfg.trial_days !== undefined && cfg.trial_days !== null) trialDays = parseInt(cfg.trial_days);
          if (cfg.grace_period_days !== undefined && cfg.grace_period_days !== null) gracePeriodDays = parseInt(cfg.grace_period_days);
          if (cfg.default_members_limit !== undefined && cfg.default_members_limit !== null) defaultMembersLimit = parseInt(cfg.default_members_limit);
        }
      } catch (pErr: any) {
        console.warn("[verify-payment] Notice loading subscription_plans:", pErr.message);
      }

      // Determine Plan, Cycle, Members Limit and Required Amount from official database config
      const plan = metadata?.plan === "pay_as_you_go" ? "pay_as_you_go" : "pro";
      const billingCycle = (metadata?.billingCycle || (type === "pro_preorder" ? "yearly" : "monthly")).toLowerCase() === "yearly" ? "yearly" : "monthly";

      let requiredPrice = 0;
      let membersLimit = defaultMembersLimit;

      if (plan === "pro") {
        requiredPrice = billingCycle === "yearly" ? proYearlyRate : proMonthlyRate;
        membersLimit = defaultMembersLimit;
      } else if (plan === "pay_as_you_go") {
        const rawMembers = parseInt(String(metadata?.membersCount || metadata?.membersLimit || 25));
        const clampedMembers = Math.max(25, Math.min(200, rawMembers));
        membersLimit = clampedMembers;
        requiredPrice = billingCycle === "yearly"
          ? Math.round(clampedMembers * paygoYearlyRate)
          : Math.round(clampedMembers * paygoMonthlyRate);
      }

      // ── Strict Price & Amount Validation Guard (Prevents Client-Side Plan Tampering) ──
      // Allow max 1 BDT leeway for rounding differences, never grant yearly on monthly payment
      if (verifiedAmount < (requiredPrice - 1)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Payment amount (৳${verifiedAmount.toFixed(2)}) is insufficient for ${plan.toUpperCase()} (${billingCycle}). Required: ৳${requiredPrice.toFixed(2)}.`,
            requiredAmount: requiredPrice,
            paidAmount: verifiedAmount
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Duration is 100% computed from database plan definition — NEVER TRUST CLIENT
      const durationDays = billingCycle === "yearly" ? 365 : (billingCycle === "trial" ? trialDays : 30);
      const durationMs = durationDays * 24 * 60 * 60 * 1000;
      const planName = plan === "pay_as_you_go"
        ? `Messliner Pay-As-You-Go (${membersLimit} Members · ${billingCycle === "yearly" ? "Annual" : "Monthly"})`
        : `Messliner Pro (${billingCycle === "yearly" ? "Annual" : "Monthly"})`;

      let newExpiresAt = Date.now() + durationMs;

      // 1. Update Dining's active subscription in Primary RTDB
      let updatedSubRecord: any = null;
      if (diningId) {
        try {
          const subSnapRes = await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/subscription.json${primaryAuthQuery}`);
          if (subSnapRes.ok) {
            const curSub = await subSnapRes.json();
            const curExpiry = curSub?.expiresAt && curSub.expiresAt > Date.now() ? curSub.expiresAt : Date.now();
            newExpiresAt = curExpiry + durationMs;
          }

          const updatedSub = {
            plan: plan,
            billingCycle: billingCycle,
            status: "active",
            startDate: Date.now(),
            expiresAt: newExpiresAt,
            gracePeriodDays: 3,
            membersLimit: membersLimit,
            isServerFulfillment: true,
            lastPayment: {
              amount: verifiedAmount,
              trxID: verifiedTrxID,
              paymentID: cleanPaymentId,
              date: Date.now()
            },
            updatedAt: Date.now()
          };
          updatedSubRecord = updatedSub;

          // Write active subscription to Primary RTDB (with auth query for rule bypass)
          await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/subscription.json${primaryAuthQuery}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedSub)
          });

          // Subscription payment history in dining
          await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/subscriptionHistory.json${primaryAuthQuery}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plan: plan,
              billingCycle: billingCycle,
              amount: verifiedAmount,
              trxID: verifiedTrxID,
              paymentID: cleanPaymentId,
              expiresAt: newExpiresAt,
              timestamp: Date.now()
            })
          });
        } catch (dbErr: any) {
          console.error("[verify-payment] Dining subscription update error:", dbErr.message);
        }
      }

      // 2. Central Record in Admin RTDB (meiner-admin) for Admin Panel Analytics, Audit & Realtime Resolution
      const adminOrderRecord = {
        plan: plan,
        planName: planName,
        billingCycle: billingCycle,
        amount: verifiedAmount,
        diningId: diningId || "pending_assignment",
        messName: metadata?.messName || "My Mess",
        name: metadata?.name || customerPhone || "Valued Customer",
        phone: customerPhone || metadata?.phone || "N/A",
        email: metadata?.email || "N/A",
        membersLimit: membersLimit,
        trxID: verifiedTrxID,
        paymentID: cleanPaymentId,
        status: "paid",
        verified: true,
        expiresAt: newExpiresAt,
        createdAt: Date.now()
      };

      try {
        // Active subscription in Admin RTDB (both subscriptions/${diningId} and dinings/${diningId}/subscription)
        if (diningId && updatedSubRecord) {
          await fetch(`${ADMIN_FIREBASE_RTDB_URL}/subscriptions/${diningId}.json${adminAuthQuery}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedSubRecord)
          }).catch(() => {});

          await fetch(`${ADMIN_FIREBASE_RTDB_URL}/dinings/${diningId}/subscription.json${adminAuthQuery}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedSubRecord)
          }).catch(() => {});
        }

        // Global subscriptions stream in Admin DB
        await fetch(`${ADMIN_FIREBASE_RTDB_URL}/subscriptions.json${adminAuthQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminOrderRecord)
        });

        await fetch(`${ADMIN_FIREBASE_RTDB_URL}/transactions/${cleanPaymentId}.json${adminAuthQuery}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adminOrderRecord)
        });

        // 3. Central Record in Admin Supabase (cvhpuuqwvfhorsuslcel)
        try {
          const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
          await adminSupabase.from("payments").insert({
            payment_id: cleanPaymentId,
            trx_id: verifiedTrxID,
            amount: verifiedAmount,
            plan: plan,
            billing_cycle: billingCycle,
            dining_id: diningId || null,
            mess_name: metadata?.messName || null,
            email: metadata?.email || null,
            phone: customerPhone || metadata?.phone || null,
            status: "completed",
            created_at: new Date().toISOString()
          });

          // Also upsert in Admin Supabase subscriptions table if table exists
          await adminSupabase.from("subscriptions").upsert({
            dining_id: diningId || "pending_assignment",
            plan: plan,
            billing_cycle: billingCycle,
            members_limit: membersLimit,
            status: "active",
            start_date: new Date().toISOString(),
            expires_at: new Date(newExpiresAt).toISOString(),
            activated_by: "bKash Tokenized Checkout",
            created_at: new Date().toISOString()
          }).catch(() => {});
        } catch (sbAdmErr: any) {
          console.warn("[verify-payment] Admin Supabase record notice:", sbAdmErr.message);
        }
      } catch (admErr: any) {
        console.warn("[verify-payment] Admin DB record notice:", admErr.message);
      }

      // Primary preorders / orders collection backup
      await fetch(`${FIREBASE_RTDB_URL}/preorders.json${primaryAuthQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminOrderRecord)
      }).catch(() => {});

      // 4. Send Transactional Confirmation Email via Brevo API (Server-Side Execution)
      const recipientEmail = (metadata?.email || "").trim();
      if (BREVO_API_KEY && recipientEmail && recipientEmail.includes("@")) {
        try {
          const emailPayload = {
            sender: {
              name: "Messliner",
              email: BREVO_SENDER_EMAIL
            },
            to: [
              {
                email: recipientEmail,
                name: (metadata?.name || customerPhone || "Mess Manager").trim()
              }
            ],
            subject: `Subscription Confirmed — ${planName}`,
            htmlContent: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px 28px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                  <span style="font-size: 18px; font-weight: 900; color: #0f172a;">Messliner</span>
                  <span style="font-size: 11px; font-weight: 700; background: #ecfdf5; color: #047857; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">Active · Paid</span>
                </div>
                <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 8px;">Payment Confirmed</h2>
                <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 20px;">
                  Hi ${metadata?.name || "Mess Manager"}, your subscription payment has been received. Your mess is now active on <strong>${planName}</strong> with all limits unlocked.
                </p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;">
                  <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Amount Paid</div>
                  <div style="font-size: 24px; font-weight: 900; color: #0f172a; margin-top: 4px;">৳ ${verifiedAmount.toFixed(2)}</div>
                </div>
                <table style="width: 100%; font-size: 13px; color: #475569; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0;">Mess Group</td><td style="text-align: right; font-weight: 600; color: #0f172a;">${metadata?.messName || "Your Mess"}</td></tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0;">Billing Cycle</td><td style="text-align: right; font-weight: 600; color: #0f172a;">${billingCycle}</td></tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0;">Transaction ID</td><td style="text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">${verifiedTrxID}</td></tr>
                  <tr><td style="padding: 8px 0;">Grace Period</td><td style="text-align: right; font-weight: 700; color: #16a34a;">3-Day Guarantee Active</td></tr>
                </table>
                <div style="margin-top: 24px; text-align: center;">
                  <a href="https://messliner.com" style="display: inline-block; padding: 12px 24px; background: #0f172a; color: #ffffff; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none;">Go to Dashboard</a>
                </div>
              </div>`
          };

          await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "accept": "application/json",
              "api-key": BREVO_API_KEY,
              "content-type": "application/json"
            },
            body: JSON.stringify(emailPayload)
          });
        } catch (mailErr: any) {
          console.warn("[verify-payment] Brevo email dispatch notice:", mailErr.message);
        }
      }

    } else if (type === "sms_recharge") {
      if (!diningId) {
        return new Response(
          JSON.stringify({ error: "Missing diningId for SMS recharge" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cfgUrl = `${FIREBASE_RTDB_URL}/dinings/${diningId}/smsConfig.json${primaryAuthQuery}`;
      const cfgRes = await fetch(cfgUrl);
      const cfgData = cfgRes.ok ? (await cfgRes.json()) || {} : {};
      const currentBalance = parseFloat(cfgData.smsBalance) || 0;

      updatedBalance = currentBalance + verifiedAmount;

      // 1. Update SMS Balance & Fulfillment Stamp in RTDB with master secret query
      await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/smsConfig.json${primaryAuthQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smsBalance: updatedBalance,
          isServerFulfillment: true,
          lastRecharge: {
            amount: verifiedAmount,
            trxID: verifiedTrxID,
            paymentID: cleanPaymentId,
            date: Date.now()
          }
        }),
      });

      // 2. Append Verified Transaction to SMS Balance History
      await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/smsBalanceHistory.json${primaryAuthQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: verifiedAmount,
          balance: updatedBalance,
          type: "recharge",
          gateway: "bkash",
          isServerFulfillment: true,
          verified: true,
          paymentID: cleanPaymentId,
          trxID: verifiedTrxID,
          phone: customerPhone || "bKash",
          note: `bKash SMS Balance Recharge: ৳${verifiedAmount.toFixed(2)} (TrxID: ${verifiedTrxID})`,
          timestamp: Date.now(),
        }),
      });

      // 3. Central Record in Admin Supabase for Payments Analytics & Audit
      try {
        const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
        await adminSupabase.from("payments").insert({
          payment_id: cleanPaymentId,
          trx_id: verifiedTrxID,
          amount: verifiedAmount,
          plan: "sms_recharge",
          billing_cycle: "on_demand",
          dining_id: diningId || null,
          mess_name: metadata?.messName || null,
          email: metadata?.email || null,
          phone: customerPhone || metadata?.phone || null,
          status: "completed",
          created_at: new Date().toISOString()
        });
      } catch (admSbErr: any) {
        console.warn("[verify-payment] Admin Supabase record notice for SMS:", admSbErr.message);
      }
    } else if (type === "member_deposit") {
      if (!diningId) {
        return new Response(
          JSON.stringify({ error: "Missing diningId for member deposit" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = metadata?.userId;
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Missing userId in payment metadata" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Precise Base Amount vs Gateway Fee Calculation ──
      const baseAmountFromMeta = parseFloat(String(metadata?.baseAmount || metadata?.amount || 0));
      const feeFromMeta = parseFloat(String(metadata?.fee || 0));
      const depositAmount = (baseAmountFromMeta > 0 && baseAmountFromMeta <= verifiedAmount)
        ? baseAmountFromMeta
        : verifiedAmount;
      const gatewayFee = feeFromMeta > 0 ? feeFromMeta : Math.max(0, verifiedAmount - depositAmount);

      // 1. Fetch current user totalDeposit from RTDB
      const userRes = await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/users/${userId}.json${primaryAuthQuery}`);
      const userData = userRes.ok ? (await userRes.json()) || {} : {};
      const currentDeposit = parseFloat(userData.totalDeposit) || 0;
      updatedBalance = currentDeposit + depositAmount;

      // 2. Atomically update user totalDeposit (Server Single Source of Truth)
      await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/users/${userId}.json${primaryAuthQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalDeposit: updatedBalance,
          lastDepositAt: Date.now(),
          lastDepositAmount: depositAmount,
          lastPaymentID: cleanPaymentId,
          lastTrxID: verifiedTrxID
        })
      });

      const todayStr = new Date().toISOString().split("T")[0];
      const monthStr = metadata?.month || todayStr.slice(0, 7);
      const userName = metadata?.userName || userData.name || "Member";

      // 3. Append EXACTLY ONE deposit record into dinings/{diningId}/deposits
      await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/deposits.json${primaryAuthQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId,
          userName: userName,
          amount: depositAmount,
          fee: gatewayFee,
          totalPaid: verifiedAmount,
          type: "deposit",
          method: "bkash_auto",
          methodName: "bKash Auto",
          trxId: verifiedTrxID,
          trxID: verifiedTrxID,
          paymentID: cleanPaymentId,
          note: metadata?.note || `bKash Auto Deposit: ৳${depositAmount.toFixed(2)}${gatewayFee > 0 ? ` (+৳${gatewayFee.toFixed(2)} fee)` : ''} (TrxID: ${verifiedTrxID})`,
          date: todayStr,
          month: monthStr,
          isAutoPayment: true,
          status: "approved",
          timestamp: Date.now()
        })
      });

      // 4. Update the initiated payment request or append ONE approved payment request
      const paymentRequestId = metadata?.paymentRequestId;
      if (paymentRequestId) {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/paymentRequests/${paymentRequestId}.json${primaryAuthQuery}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            amount: depositAmount,
            fee: gatewayFee,
            totalPayable: verifiedAmount,
            trxId: verifiedTrxID,
            trxID: verifiedTrxID,
            paymentID: cleanPaymentId,
            approvedAt: Date.now(),
            approvedBy: "bKash_Auto"
          })
        }).catch(() => {});
      } else {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/paymentRequests.json${primaryAuthQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId,
            userName: userName,
            amount: depositAmount,
            fee: gatewayFee,
            totalPayable: verifiedAmount,
            method: "bkash_auto",
            methodName: "bKash Auto",
            trxId: verifiedTrxID,
            trxID: verifiedTrxID,
            paymentID: cleanPaymentId,
            note: metadata?.note || `bKash Auto Deposit: ৳${depositAmount.toFixed(2)} (TrxID: ${verifiedTrxID})`,
            status: "approved",
            isAutoPayment: true,
            month: monthStr,
            createdAt: Date.now(),
            approvedAt: Date.now(),
            approvedBy: "bKash_Auto"
          })
        });
      }

      // 5. In-App Notification (Single Notification on server)
      await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/notifications.json${primaryAuthQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "bKash Deposit Credited",
          message: `Your payment of ৳${depositAmount.toFixed(2)} via bKash Auto has been verified and credited to your dining balance. TrxID: ${verifiedTrxID}`,
          targetUser: userId,
          type: "deposit",
          read: false,
          timestamp: Date.now()
        })
      }).catch(() => {});

      // 6. Central Record in Admin Supabase for Audit
      try {
        const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
        await adminSupabase.from("payments").insert({
          payment_id: cleanPaymentId,
          trx_id: verifiedTrxID,
          amount: verifiedAmount,
          plan: "member_deposit",
          billing_cycle: "on_demand",
          dining_id: diningId || null,
          mess_name: metadata?.messName || null,
          email: metadata?.email || userData.email || null,
          phone: customerPhone || metadata?.phone || userData.phone || null,
          status: "completed",
          created_at: new Date().toISOString()
        });
      } catch (admSbErr: any) {
        console.warn("[verify-payment] Admin Supabase record notice for member_deposit:", admSbErr.message);
      }

    } else if (type === "bill_payment") {
      if (!diningId) {
        return new Response(
          JSON.stringify({ error: "Missing diningId for bill payment" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = metadata?.userId;
      const billId = metadata?.billId;
      const todayStr = new Date().toISOString().split("T")[0];
      const monthStr = metadata?.month || todayStr.slice(0, 7);

      const baseAmountFromMeta = parseFloat(String(metadata?.baseAmount || metadata?.amount || 0));
      const feeFromMeta = parseFloat(String(metadata?.fee || 0));
      const billAmount = (baseAmountFromMeta > 0 && baseAmountFromMeta <= verifiedAmount)
        ? baseAmountFromMeta
        : verifiedAmount;
      const gatewayFee = feeFromMeta > 0 ? feeFromMeta : Math.max(0, verifiedAmount - billAmount);

      // 1. Mark bill member as paid if billId provided
      if (billId && userId) {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/bills/${billId}/members/${userId}.json${primaryAuthQuery}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "collected",
            paid: true,
            collectedAt: Date.now(),
            paidAt: Date.now(),
            trxId: verifiedTrxID,
            paymentID: cleanPaymentId,
            paymentMethod: "bkash_auto"
          })
        }).catch(() => {});
      }

      // 2. Update existing payment request or create ONE approved payment request
      const paymentRequestId = metadata?.paymentRequestId;
      if (paymentRequestId) {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/paymentRequests/${paymentRequestId}.json${primaryAuthQuery}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            amount: billAmount,
            fee: gatewayFee,
            totalPayable: verifiedAmount,
            trxId: verifiedTrxID,
            trxID: verifiedTrxID,
            paymentID: cleanPaymentId,
            approvedAt: Date.now(),
            approvedBy: "bKash_Auto"
          })
        }).catch(() => {});
      } else {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/paymentRequests.json${primaryAuthQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId || "member",
            userName: metadata?.userName || "Member",
            amount: billAmount,
            fee: gatewayFee,
            totalPayable: verifiedAmount,
            method: "bkash_auto",
            methodName: "bKash Auto",
            trxId: verifiedTrxID,
            paymentID: cleanPaymentId,
            billId: billId || null,
            billTitle: metadata?.billTitle || "Shared Bill",
            note: metadata?.note || `bKash Bill Payment: ${metadata?.billTitle || "Shared Bill"} (৳${billAmount.toFixed(2)})`,
            status: "approved",
            isAutoPayment: true,
            month: monthStr,
            createdAt: Date.now(),
            approvedAt: Date.now(),
            approvedBy: "bKash_Auto"
          })
        });
      }

      // 3. In-App Notification (Single Notification on server)
      if (userId) {
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/notifications.json${primaryAuthQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Bill Payment Confirmed",
            message: `Your payment of ৳${billAmount.toFixed(2)} for "${metadata?.billTitle || 'Shared Bill'}" via bKash Auto has been verified and cleared. TrxID: ${verifiedTrxID}`,
            targetUser: userId,
            type: "deposit",
            read: false,
            timestamp: Date.now()
          })
        }).catch(() => {});
      }

      // 4. Central record in Admin Supabase
      try {
        const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);
        await adminSupabase.from("payments").insert({
          payment_id: cleanPaymentId,
          trx_id: verifiedTrxID,
          amount: verifiedAmount,
          plan: "bill_payment",
          billing_cycle: "on_demand",
          dining_id: diningId || null,
          mess_name: metadata?.messName || null,
          email: metadata?.email || null,
          phone: customerPhone || metadata?.phone || null,
          status: "completed",
          created_at: new Date().toISOString()
        });
      } catch (admSbErr: any) {
        console.warn("[verify-payment] Admin Supabase record notice for bill_payment:", admSbErr.message);
      }
    }

    // 5. Anti-Replay Guard: Register completed payment
    await fetch(`${FIREBASE_RTDB_URL}/processedPayments/${cleanPaymentId}.json${primaryAuthQuery}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentID: cleanPaymentId,
        trxID: verifiedTrxID,
        amount: verifiedAmount,
        type: type,
        diningId: diningId || null,
        updatedBalance: updatedBalance,
        status: "completed",
        processedAt: Date.now(),
      }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment successfully verified and fulfilled by official bKash.",
        paymentID: cleanPaymentId,
        trxID: verifiedTrxID,
        amount: verifiedAmount,
        updatedBalance: updatedBalance,
        serverFulfillment: true
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[verify-payment] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error during verification" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
