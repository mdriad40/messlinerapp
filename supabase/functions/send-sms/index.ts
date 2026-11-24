// Supabase Edge Function: send-sms
// Keeps BulkSMSBD credentials hidden from browser clients and enforces authenticated sending.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function formatBdNumber(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith("01") && digits.length === 11) {
    return "88" + digits;
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "880" + digits;
  }
  return digits;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Read Request Parameters
    const body = await req.json();
    const { number, phone, message, diningId, customApiKey, customSenderId } = body;
    const targetNumber = formatBdNumber(number || phone || "");

    if (!targetNumber || targetNumber.length < 11) {
      return new Response(
        JSON.stringify({ error: "Invalid recipient phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Message content cannot be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2.1 Server-side SMS Balance Verification
    const FIREBASE_RTDB_URL = Deno.env.get("FIREBASE_RTDB_URL") || "https://meiner-6ec2e-default-rtdb.firebaseio.com";
    let currentBalance = 0;
    let smsRate = 0.30;

    if (diningId) {
      try {
        const cfgRes = await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/smsConfig.json`);
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) || {};
          currentBalance = parseFloat(cfg.smsBalance) || 0;
          smsRate = parseFloat(cfg.smsRate) || 0.30;

          if (currentBalance < smsRate) {
            return new Response(
              JSON.stringify({
                error: `Insufficient SMS balance. Required: ৳${smsRate.toFixed(2)}, Available: ৳${currentBalance.toFixed(2)}`,
                balance: currentBalance,
                rate: smsRate,
              }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (balErr: any) {
        console.warn("[send-sms] Balance check warning:", balErr.message);
      }
    }

    // 3. Secrets Hub: Server-side environment secrets with optional custom dining override
    const apiKey = customApiKey || Deno.env.get("SMS_API_KEY");
    const senderId = customSenderId || Deno.env.get("SMS_SENDER_ID");

    if (!apiKey || !senderId) {
      return new Response(
        JSON.stringify({ error: "SMS Gateway credentials not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Secure HTTPS Server-to-Server dispatch to BulkSMSBD API
    // Using HTTPS instead of HTTP eliminates mixed-content blocking
    const apiUrl = "https://bulksmsbd.net/api/smsapi";
    const payload = new URLSearchParams({
      api_key: apiKey,
      senderid: senderId,
      number: targetNumber,
      message: message.trim(),
      type: "text",
    });

    const smsResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    let smsData: any = {};
    try {
      smsData = await smsResponse.json();
    } catch (_) {
      smsData = { rawStatus: smsResponse.status };
    }

    // BulkSMSBD success response_code is 202
    const code = smsData?.response_code ?? smsData?.status ?? smsResponse.status;
    const isSuccess = String(code) === "202";

    // 5. Server-side Balance Deduction & Audit Log
    let newBalance = currentBalance;
    if (isSuccess && diningId) {
      try {
        newBalance = Math.max(0, currentBalance - smsRate);
        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/smsConfig/smsBalance.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBalance),
        });

        await fetch(`${FIREBASE_RTDB_URL}/dinings/${diningId}/smsBalanceHistory.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: -smsRate,
            balance: newBalance,
            type: "deduction",
            recipient: targetNumber,
            rate: smsRate,
            note: `SMS alert dispatched to ${targetNumber}`,
            timestamp: Date.now(),
          }),
        });
      } catch (deductErr: any) {
        console.warn("[send-sms] Balance deduction notice:", deductErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: isSuccess,
        code: code,
        raw: smsData,
        remainingBalance: newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to dispatch SMS" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

