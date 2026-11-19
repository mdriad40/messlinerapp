/**
 * Messliner Automated Subscription Confirmation & Invoice Email Service
 * Powered by Brevo (Sendinblue) Transactional API
 */

(function () {
  'use strict';

  const BREVO_CONFIG = {
    // Edge Function Relay Endpoint (Keeps Brevo Master API Key 100% hidden on server)
    edgeEndpoint: (window.__ENV__ && window.__ENV__.SUPABASE_URL) ? `${window.__ENV__.SUPABASE_URL}/functions/v1/send-invoice` : null,
    defaultSenderName: 'Messliner',
    defaultSenderEmail: (window.__ENV__ && window.__ENV__.BREVO_SENDER_EMAIL) || 'noreply@messliner.com'
  };

  /**
   * Generates the minimal cool SaaS email HTML (Linear / Vercel style)
   */
  function buildConfirmationEmailHtml(data) {
    const customerName = data.name || 'Mess Manager';
    const messName = data.messName || 'My Dining Mess';
    const planName = data.planName || 'Messliner Pro';
    const cycleLabel = data.cycleLabel || (data.billingCycle === 'yearly' ? 'Annual (1 Year)' : 'Monthly (1 Month)');
    const trxID = data.trxID || data.paymentID || 'BKL-' + Date.now().toString().slice(-8);
    const totalAmt = parseFloat(data.amount || 0);

    const dateFormatted = new Date(data.timestamp || Date.now()).toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmed — Messliner</title>
</head>
<body style="margin: 0; padding: 40px 10px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">

        <!-- Outer Minimal Card (Max Width 520px) -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 10px;">
                          <img src="https://messliner.com/assets/messLinerApp_logo.png" 
                               alt="Messliner Logo" width="34" height="34" 
                               style="width: 34px; height: 34px; border-radius: 9px; object-fit: contain; display: block;"
                               onerror="this.src='assets/messLinerApp_logo.png'">
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px;">
                            Messliner
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background-color: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 9999px;">
                      Active · Paid
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Heading -->
          <tr>
            <td style="padding-bottom: 24px;">
              <div style="font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: #0f172a; line-height: 1.25; margin-bottom: 8px;">
                Payment Confirmed
              </div>
              <div style="font-size: 14px; color: #64748b; line-height: 1.5;">
                Hi ${customerName}, your subscription payment has been received. Your mess is now active on <strong>${planName}</strong> with all limits unlocked.
              </div>
            </td>
          </tr>

          <!-- Amount Card Box -->
          <tr>
            <td style="padding-bottom: 24px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 22px;">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
                      AMOUNT PAID
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.35;">
                      ${planName} <span style="font-size: 12.5px; font-weight: 500; color: #64748b;">(${cycleLabel})</span>
                    </div>
                  </td>
                  <td align="right" style="vertical-align: middle; white-space: nowrap; padding-left: 16px;">
                    <div style="font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; line-height: 1;">
                      <img src="https://messliner.com/assets/taka-symbol.png" alt="৳" width="20" height="20" style="width: 20px; height: 20px; object-fit: contain; vertical-align: -2px; margin-right: 4px; display: inline-block;" onerror="this.src='assets/taka-symbol.png'"><span>${totalAmt.toFixed(0)}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Key Details List -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #f1f5f9;">
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Mess / Dining
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #0f172a; font-weight: 600;">
                    ${messName}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Billing Cycle
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #0f172a; font-weight: 600;">
                    ${cycleLabel}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Payment Method
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #0f172a; font-weight: 600;">
                    bKash
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Transaction ID
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #0f172a; font-weight: 700; font-family: monospace;">
                    ${trxID}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Payment Date
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #0f172a; font-weight: 600;">
                    ${dateFormatted}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #64748b; font-weight: 500;">
                    Grace Protection
                  </td>
                  <td align="right" style="padding: 11px 0; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; color: #16a34a; font-weight: 700;">
                    3-Day Guarantee Active
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="background-color: #0f172a; border-radius: 12px;">
                    <a href="https://messliner.com" target="_blank" 
                       style="display: block; padding: 14px 20px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.2px;">
                      Launch Messliner Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Clean Minimal Footer (Website URL, Privacy Policy & Copyright only) -->
          <tr>
            <td style="border-top: 1px solid #f1f5f9; padding-top: 22px; text-align: center;">
              <div style="font-size: 12.5px; color: #64748b; margin-bottom: 8px;">
                <a href="https://www.messliner.com" target="_blank" style="color: #64748b; text-decoration: none;">www.messliner.com</a>
                <span style="margin: 0 6px; color: #94a3b8;">|</span>
                <a href="https://www.messliner.com/privacy.html" target="_blank" style="color: #64748b; text-decoration: none;">Privacy policy</a>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8;">
                © 2026 Messliner. All rights reserved.
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
  }

  /**
   * Send the email securely via Supabase Server Edge Function Relay (Brevo API)
   */
  async function sendSubscriptionConfirmationEmail(orderData, options = {}) {
    if (!orderData || !orderData.email) {
      console.warn('[Confirmation Email] Cannot send email: recipient email missing.');
      return { success: false, error: 'Recipient email is missing' };
    }

    const senderEmail = options.senderEmail || BREVO_CONFIG.defaultSenderEmail;
    const senderName = options.senderName || BREVO_CONFIG.defaultSenderName;
    const subject = options.subject || `Subscription Confirmed — ${orderData.planName || 'Messliner Pro'}`;
    const htmlBody = buildConfirmationEmailHtml(orderData);

    const edgeUrl = options.endpoint || BREVO_CONFIG.edgeEndpoint || (window.__ENV__?.SUPABASE_URL ? `${window.__ENV__.SUPABASE_URL}/functions/v1/send-invoice` : null);

    if (!edgeUrl) {
      console.warn('[Confirmation Email] Supabase Edge Function send-invoice endpoint not configured.');
      return { success: false, error: 'Email endpoint not configured' };
    }

    try {
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.__ENV__?.SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({
          orderData: orderData,
          htmlBody: htmlBody,
          subject: subject,
          senderEmail: senderEmail,
          senderName: senderName,
          pdfAttachmentBase64: options.pdfAttachmentBase64 || null
        })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        console.warn('[Confirmation Email] Server Email Relay notice:', result.error || response.statusText);
        return {
          success: false,
          status: response.status,
          error: result.error || 'Email dispatch failed'
        };
      }

      console.log('[Confirmation Email] Email successfully dispatched via Supabase Brevo Relay! ID:', result.messageId);
      return {
        success: true,
        messageId: result.messageId
      };
    } catch (err) {
      console.warn('[Confirmation Email] Network or relay notice:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Expose on window object
  window.MesslinerInvoiceEmail = {
    buildHtml: buildConfirmationEmailHtml,
    send: sendSubscriptionConfirmationEmail,
    config: BREVO_CONFIG
  };

})();
