// Supabase Edge Function: create-payment
// Official bKash Tokenized Checkout API (v1.2.0-beta)
// Server-Side Payment Initiator — Keeps credentials 100% hidden and secure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BKASH_BASE_URL = (Deno.env.get("BKASH_BASE_URL") || "https://tokenized.pay.bka.sh/v1.2.0-beta").replace(/\/+$/, "");
const BKASH_APP_KEY = Deno.env.get("BKASH_APP_KEY") || "";
const BKASH_APP_SECRET = Deno.env.get("BKASH_APP_SECRET") || "";
const BKASH_USERNAME = Deno.env.get("BKASH_USERNAME") || "";
const BKASH_PASSWORD = Deno.env.get("BKASH_PASSWORD") || "";

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
    throw new Error(`bKash Token Grant Failed: ${errMsg} (Status: ${tokenRes.status})`);
  }

  return tokenData.id_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { amount, customerPhone, merchantInvoiceNumber, callbackURL } = body;

    const numAmount = parseFloat(String(amount)) || 0;
    if (numAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid payment amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!callbackURL) {
      return new Response(
        JSON.stringify({ error: "callbackURL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Grant bKash Bearer Token
    const idToken = await grantToken();

    // 2. Call bKash Create Payment
    const invoiceNo = merchantInvoiceNumber || "INV-" + Date.now();
    const createRes = await fetch(`${BKASH_BASE_URL}/tokenized/checkout/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": idToken,
        "X-APP-Key": BKASH_APP_KEY
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: invoiceNo,
        callbackURL: callbackURL,
        amount: numAmount.toFixed(2),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: invoiceNo
      })
    });

    const createData = await createRes.json();

    if (!createRes.ok || (createData.statusCode && createData.statusCode !== "0000")) {
      const msg = createData.statusMessage || createData.errorMessage || "bKash checkout create failed";
      return new Response(
        JSON.stringify({ error: msg, raw: createData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Returns bkashURL, paymentID, statusCode, statusMessage
    return new Response(
      JSON.stringify(createData),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to initiate payment with official bKash" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
