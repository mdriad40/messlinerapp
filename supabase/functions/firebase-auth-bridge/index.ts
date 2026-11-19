// Supabase Edge Function: firebase-auth-bridge
// Mints Firebase Custom Tokens for Supabase-authenticated users.
// Allows using Supabase Auth with Firebase Realtime Database with 100% Security Rules!

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@4.14.4";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Supabase JWT Token from Client
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
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
        JSON.stringify({ error: "Unauthorized: Invalid Supabase session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Read Firebase Service Account from Supabase Secrets
    const rawServiceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!rawServiceAccount) {
      return new Response(
        JSON.stringify({
          error: "FIREBASE_SERVICE_ACCOUNT secret not configured in Supabase. Please set it in Supabase Edge Functions secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount: any = null;
    try {
      serviceAccount = JSON.parse(rawServiceAccount);
    } catch (_) {
      // Handle base64 encoded JSON if passed that way
      try {
        const decoded = atob(rawServiceAccount);
        serviceAccount = JSON.parse(decoded);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ error: "Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: " + e.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const clientEmail = serviceAccount.client_email;
    let privateKeyPem = serviceAccount.private_key;

    if (!clientEmail || !privateKeyPem) {
      return new Response(
        JSON.stringify({ error: "Service account JSON is missing client_email or private_key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Standardize newline formatting in PEM private key
    privateKeyPem = privateKeyPem.replace(/\\n/g, "\n");

    // 3. User UID mapping: Supabase UID -> Firebase UID
    const targetUid = user.user_metadata?.firebase_uid || user.id;

    // 4. Mint official Firebase Custom Token using RS256 signing
    const privateKey = await importPKCS8(privateKeyPem, "RS256");

    const customToken = await new SignJWT({
      uid: targetUid,
      claims: {
        email: user.email,
        supabase_id: user.id,
      },
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt()
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience("https://identitytoolkit.googleapis.com/google.identitytoolkit.v1.IdentityToolkit")
      .setExpirationTime("1h")
      .sign(privateKey);

    return new Response(
      JSON.stringify({
        success: true,
        customToken: customToken,
        uid: targetUid,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to mint Firebase Custom Token" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

