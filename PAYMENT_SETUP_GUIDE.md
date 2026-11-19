# 💳 Messliner Universal Payment Integration Guide

Follow this guide to easily and securely integrate the **bKash Payment Gateway** across any module in the Messliner web application (e.g., **Member Deposit / Add Money**, **Utility Bill Payment**, **Meal Advance**, and more).

---

## 🚀 Architecture Overview

Messliner uses a centralized, reusable payment engine located in `js/shared/payment.js`.

- **File Path:** `js/shared/payment.js`
- **Global Object:** `window.MesslinerPayment`

You do not need to manually configure gateway auth tokens or create complex webhooks. Integrating a new payment feature requires only **2 simple steps**:
1. **Initiate Payment (`initiatePayment`)**: Triggered when a user clicks a pay button; securely redirects to the official bKash checkout page.
2. **Payment Confirmation (`verifyAndFulfill`)**: Automatically verifies the transaction against gateway servers and Firebase anti-replay records upon callback, then credits the account.

---

## 🛠️ Step-by-Step: Adding Payments to a New Feature

For example, let's say you want to implement **Member Add Money / Balance Deposit (`member_deposit`)**:

### Step 1: Ensure Required Scripts are Loaded

On any page where a payment button exists, ensure these script dependencies are present (already included in `dashboard.html`, `callback.html`, and `preorder-callback.html`):

```html
<script src="js/env.js"></script>
<script src="js/firebase-config.js"></script>
<script src="js/shared/payment.js"></script>
```

---

### Step 2: Initiate Payment (Client-Side Action)

Call `MesslinerPayment.initiatePayment` inside your button click handler:

```javascript
// Example: Member Add Money / Deposit Handler
async function handleMemberAddMoney(amount, userPhone) {
  try {
    const currentDiningId = Messliner.state?.diningId || localStorage.getItem('currentDiningId');
    const currentUserId = Messliner.state?.user?.id || 'member_id';

    await MesslinerPayment.initiatePayment({
      amount: parseFloat(amount),           // e.g., 500
      type: 'member_deposit',              // Unique transaction type key
      phone: userPhone || '01700000000',    // Customer phone number
      diningId: currentDiningId,            // Current Mess / Dining Group ID
      metadata: {                          // Additional payload required for fulfillment
        userId: currentUserId,
        userName: Messliner.state?.user?.name || 'Member Name',
        note: 'Monthly Mess Deposit via bKash'
      }
    });
  } catch (error) {
    console.error('Payment Error:', error);
    alert('Failed to initiate bKash payment: ' + error.message);
  }
}
```

> **What happens automatically?**
> The engine generates a unique merchant invoice number, saves pending transaction state locally, and redirects the user directly to the secured bKash payment URL.

---

### Step 3: Fulfill and Credit Account (`payment.js`)

After a successful payment, bKash redirects the user back to `callback.html`.

If you added a new `type` (such as `member_deposit`), add your database fulfillment logic inside `js/shared/payment.js` under **Step 4: Atomic Fulfillment**:

Open `js/shared/payment.js` (around line 200):

```javascript
} else if (type === 'member_deposit' && targetAmount > 0) {
  try {
    const targetUserId = metadata?.userId;
    if (diningId && targetUserId) {
      // 1. Credit the member's dining balance
      const memberRef = db.ref(`dinings/${diningId}/users/${targetUserId}`);
      const snap = await memberRef.once('value');
      const currentBalance = parseFloat(snap.val()?.balance) || 0;
      const newBalance = currentBalance + targetAmount;

      await memberRef.child('balance').set(newBalance);

      // 2. Log entry in dining deposit history
      await db.ref(`dinings/${diningId}/deposits`).push({
        userId: targetUserId,
        amount: targetAmount,
        trxID: verifiedTrxID,
        paymentID: cleanPaymentId,
        date: new Date().toISOString(),
        note: `bKash Auto Deposit (TrxID: ${verifiedTrxID})`,
        timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now()
      });
    }
  } catch (dbErr) {
    console.error('[MesslinerPayment] Member deposit fulfillment error:', dbErr);
    throw dbErr;
  }
}
```

---

## 🔒 Built-in Security & Anti-Fraud Protections

Every payment automatically inherits these multi-layered security measures:

1. **Anti-Replay Ledger Protection:**
   Completed payments are permanently recorded under `processedPayments/${paymentID}` in Firebase RTDB. Repeated requests or browser refreshes with the same `paymentID` cannot credit money twice.
2. **URL Tampering Protection:**
   The client never trusts query parameters like `?status=success`. The system cross-verifies directly with the merchant gateway's database before executing any database mutation.
3. **Verified Amount Enforcement:**
   The exact amount credited is extracted directly from the verified transaction records rather than user-manipulable client inputs.

---

## 📝 Supported Payment Types Reference

| Type Key (`type`) | Purpose | Affected Database Node |
| :--- | :--- | :--- |
| `sms_recharge` | Manager SMS alert credits top-up | `dinings/{id}/smsConfig/smsBalance` |
| `pro_preorder` | Messliner Pro Annual VIP License | `preorders/` |
| `member_deposit` | Member balance add / deposit | `dinings/{id}/users/{userId}/balance` |
| `bill_payment` | Member mess & utility bill settlement | `dinings/{id}/bills/{billId}` |

---
**Done!** The payment system is fully operational. Whenever you need to introduce payment flows to another part of Messliner, follow the 2-step setup above.
