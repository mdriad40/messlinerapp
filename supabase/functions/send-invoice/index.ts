// Supabase Edge Function: send-invoice
// Secure Transactional Email Relay via Brevo API
// Keeps BREVO_API_KEY 100% hidden on the server (never exposed to browser clients)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@messliner.com";
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "Messliner";

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

    if (!BREVO_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BREVO_API_KEY secret is not set in Supabase Edge Functions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { orderData, htmlBody, subject } = body;

    const recipientEmail = (orderData?.email || body?.recipientEmail || "").trim();
    const recipientName = (orderData?.name || body?.recipientName || "Mess Manager").trim();

    if (!recipientEmail || !recipientEmail.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid recipient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailSubject = subject || `Subscription Confirmed — ${orderData?.planName || "Messliner Pro"}`;
    const emailHtml = htmlBody || `<p>Hello ${recipientName}, your subscription has been confirmed.</p>`;

    const payload: any = {
      sender: {
        name: BREVO_SENDER_NAME,
        email: BREVO_SENDER_EMAIL,
      },
      to: [
        {
          email: recipientEmail,
          name: recipientName,
        },
      ],
      subject: emailSubject,
      htmlContent: emailHtml,
    };

    if (body?.pdfAttachmentBase64) {
      payload.attachment = [
        {
          name: `Invoice_${orderData?.trxID || "Messliner"}.pdf`,
          content: body.pdfAttachmentBase64,
        },
      ];
    }

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await brevoRes.json().catch(() => ({}));

    if (!brevoRes.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result?.message || "Brevo email sending failed",
        }),
        { status: brevoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result?.messageId || "sent",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

