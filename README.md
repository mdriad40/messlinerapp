# Messliner — Structured Web Application (Version 1.0.0)

Welcome to the newly structured, modular, and high-performance edition of **Messliner**!

---

## 🚀 Architecture Overview

This project has been restructured from a monolithic 15,000-line single-file setup into an enterprise-grade **App Shell + Dynamic View Loader Architecture**.

### 🌟 Key Improvements:
1. **App Shell Architecture (`dashboard.html`):**
   - The shell file size is reduced by **over 55%** (from 15,004 lines down to a clean shell).
   - Fast synchronous 0ms boot engine with instant cache hydration and zero shimmer flash.
   - Fixed desktop sidebar, top header, search bar, and mobile bottom navigation.
2. **Modular Views Directory (`/views`):**
   - Every single page now lives in its own dedicated, clean HTML file.
   - Separation of concerns between **Member** views (`views/member/`), **Manager** views (`views/manager/`), and **Shared** views (`views/shared/`).
3. **Smart Dynamic ViewLoader (`js/router.js`):**
   - Loads view templates on demand via `fetch()` and caches them in memory.
   - After the first load of any tab, subsequent switches take **0ms (instantaneous)**.
   - Keeps DOM memory footprint minimal, eliminating browser lag.
4. **Clean Asset & Version Control:**
   - All assets, scripts, and stylesheets reset to fresh production **Version 1.0.0** (`?v=1.0.0`).
   - Clean `.gitignore` for security and secrets protection.

---

## 📁 Directory Structure

```text
Messliner-Structured-APP/
├── .gitignore                     # Production Git ignore rules
├── index.html                     # Clean Landing Page (Marketing, Features, Pricing)
├── login.html                     # Authentication Portal (Sign in, Sign up, OTP recovery)
├── dashboard.html                 # App Shell (Sidebar, Header, Dynamic View Slot, Modals)
├── how-it-works.html              # Step-by-step user guide
├── checkout.html                  # Secure Subscription & bKash checkout
├── callback.html                  # Payment callback handlers
├── preorder-callback.html         # Pre-order callback handler
├── subscription-callback.html     # Subscription callback handler
├── data-safety.html               # Data privacy & security documentation
├── privacy-policy.html            # Privacy Policy
├── terms-and-conditions.html      # Terms of Service
├── vercel.json                    # Clean routing & rewrites for production
│
├── views/                         # Modular Page Templates
│   ├── member/
│   │   ├── dashboard.html         # Personal My Meal card & balances
│   │   ├── mealchart.html         # Daily & monthly meal chart table
│   │   ├── summary.html           # Monthly meal & expense summary
│   │   ├── user-bills.html        # Member bill slips & bKash payment
│   │   ├── fridaymeal.html        # Friday special feast meal options
│   │   ├── prayer.html            # Daily prayer timings & tracker
│   │   ├── profile.html           # User profile & dining join code
│   │   ├── mealhistory.html       # Individual meal history
│   │   ├── bazarroster.html       # Bazar duty schedule
│   │   ├── tasks.html             # Member task list
│   │   └── notices.html           # Mess notices and announcements
│   ├── manager/
│   │   ├── overview.html          # Full mess dining overview & stats
│   │   ├── users.html             # Member management & invite codes
│   │   ├── meals.html             # Daily meal entry sheet & bulk locks
│   │   ├── bazar.html             # Daily bazaar expenses & shopper duty
│   │   ├── finance.html           # Member deposits & mess expenses
│   │   ├── ledger.html            # Monthly balance calculation & close month
│   │   └── settings.html          # Mess rules, meal rates & cut-off deadlines
│   └── shared/
│       ├── history.html           # Shared dining & transaction history
│       ├── notifications.html     # Notification feed & filter
│       ├── help.html              # FAQs & support report submission
│       ├── more.html              # Secondary tools & quick links
│       ├── aiassistant.html       # Messliner AI intelligence assistant
│       ├── export-slip.html       # Full-page printable bill slip & export
│       └── modals.html            # Popup dialogs & action forms
│
├── css/
│   ├── styles.css                 # Landing page styles
│   ├── variables.css              # Design tokens & emerald theme colors
│   ├── base.css                   # Core CSS reset & typography
│   ├── components.css             # Buttons, cards, badges, inputs
│   ├── layout.css                 # Sidebar, header & grid layout
│   ├── dashboard.css              # Dashboard core styles
│   ├── dashboard-extra.css        # Extracted custom component polish & animation
│   ├── auth.css                   # Login & registration split styles
│   ├── responsive.css             # Mobile & tablet responsiveness
│   ├── m3-timepicker.css          # Timepicker dialog component
│   └── prayer.css                 # Prayer module styling
│
├── js/
│   ├── env.js                     # Secrets & environment configurations
│   ├── router.js                  # Dynamic client router & ViewLoader engine
│   ├── app.js                     # Global bootstrap & module lifecycle
│   ├── auth.js                    # Authentication controllers
│   ├── firebase-config.js         # Firebase Realtime & Firestore init
│   ├── supabase-config.js         # Supabase client init
│   ├── main.js                    # Landing page interactions
│   ├── mobile-bridge.js           # Android/iOS native webview bridge
│   ├── messliner-analytics.js     # Enterprise analytics & presence engine
│   ├── prayer.js                  # Prayer schedule calculations
│   ├── qrcode-lib.js              # QR code generator library
│   ├── admin/                     # Manager module controllers
│   ├── user/                      # Member module controllers
│   └── shared/                    # Shared utilities, payment & charts
│
└── assets/                        # Logos, icons, banners & imagery
```

---

## 💻 Local Development

Run the app using any static server (e.g. VS Code Live Server or Node `serve`):

```bash
# Using Python
python -m http.server 5500

# Using Node.js
npx serve .
```

Navigate to `http://localhost:5500` for the Landing Page or `http://localhost:5500/dashboard.html` for the App Shell.
