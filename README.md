# Norcanto AI — Deployment Guide

## What This Is

Norcanto AI is a production-ready AI document intelligence SaaS platform built on a static-site + Netlify Functions architecture. Users upload documents, receive AI-generated summaries, risk analysis, action items, and key dates, and can chat with their documents.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no build step) |
| Hosting | Netlify (static + Functions) |
| Serverless | Netlify Functions (Node.js) |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini 1.5 Flash |
| Payments | CamerPay (Mobile Money) |
| Email | Mailgun (optional) |

---

## Deployment Steps

### 1. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Open the **SQL Editor** in your Supabase dashboard
3. Copy the contents of `database/schema.sql` and run it
4. Go to **Settings > API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key → `SUPABASE_SERVICE_KEY`

### 2. Get Google Gemini API Key

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a new API key → `GEMINI_API_KEY`
3. The free tier is sufficient for personal use

### 3. Set Up CamerPay

1. Register at [app.camerpay.com](https://app.camerpay.com)
2. From your merchant dashboard copy:
   - API Key → `CAMERPAY_API_KEY`
   - Secret Key → `CAMERPAY_SECRET_KEY`
3. Set up a webhook pointing to `https://converternorcanto.netlify.app/api/payments/camerpay/webhook`
4. Copy the webhook secret → `CAMERPAY_WEBHOOK_SECRET`

### 4. Deploy to Netlify

#### Option A: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

#### Option B: Netlify Dashboard
1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site > Import an existing project**
3. Connect your Git repository (push this folder to GitHub first)
4. Build settings:
   - **Build command:** (leave empty — no build step needed)
   - **Publish directory:** `.` (root)
5. Click **Deploy**

### 5. Set Environment Variables

In your Netlify dashboard go to **Site configuration > Environment variables** and add:

```
GEMINI_API_KEY         = your_gemini_api_key
SUPABASE_URL           = https://xxx.supabase.co
SUPABASE_SERVICE_KEY   = your_service_role_key
JWT_SECRET             = your_random_32_char_secret
CAMERPAY_API_KEY       = your_camerpay_api_key
CAMERPAY_SECRET_KEY    = your_camerpay_secret
CAMERPAY_WEBHOOK_SECRET = your_webhook_secret
MAILGUN_API_KEY        = your_mailgun_key (optional)
MAILGUN_DOMAIN         = norcanto.com (optional)
```

After adding variables, **trigger a redeploy** for them to take effect.

### 6. Install Function Dependencies

Netlify automatically installs dependencies for functions. The `netlify/functions/package.json` handles this. If deploying manually:

```bash
cd netlify/functions
npm install
```

---

## Creating the First Admin User

After your first signup, promote your account to admin directly in Supabase:

1. Open Supabase > **Table Editor > users**
2. Find your user row
3. Change the `role` column from `user` to `admin`
4. Save — you can now access `/pages/admin.html`

---

## File Structure

```
/
├── index.html                    # Landing page
├── pages/
│   ├── app.html                  # Main dashboard
│   ├── analysis.html             # Document analysis view
│   ├── pricing.html              # Pricing + checkout
│   ├── signup.html               # Registration
│   ├── signin.html               # Login
│   ├── admin.html                # Admin dashboard
│   ├── how-to-use.html           # Documentation
│   ├── about.html                # About page
│   ├── contact.html              # Contact
│   ├── payment-success.html      # Post-payment success
│   ├── payment-verify.html       # Payment polling
│   ├── privacy-policy.html       # Legal
│   ├── terms.html                # Legal
│   └── cookie-policy.html        # Legal
├── css/
│   ├── design-system.css         # Design tokens, base styles
│   ├── nav.css                   # Navigation component
│   ├── landing.css               # Landing page styles
│   ├── app.css                   # Dashboard / app styles
│   └── subscription.css          # Auth, pricing, checkout styles
├── js/
│   ├── main.js                   # Navigation, FAQ, animations
│   ├── auth.js                   # Auth state, checkout manager
│   └── ai-service.js             # Client-side AI fallback (unused)
├── netlify/
│   └── functions/
│       ├── _shared/utils.js      # Shared helpers, DB client, plans
│       ├── auth-register.js      # POST /api/auth/register
│       ├── auth-login.js         # POST /api/auth/login
│       ├── user-status.js        # GET /api/user/status
│       ├── analyze.js            # POST /api/analyze (AI analysis)
│       ├── camerpay-create.js    # POST /api/payments/camerpay/create
│       ├── camerpay-callback.js  # GET /api/payments/camerpay/callback
│       ├── camerpay-webhook.js   # POST /api/payments/camerpay/webhook
│       ├── camerpay-verify.js    # GET /api/payments/camerpay/verify
│       └── admin.js              # GET /api/admin/stats
├── database/
│   └── schema.sql                # Full Supabase schema
├── assets/
│   └── norcanto_logo.png         # Brand logo
├── netlify.toml                  # Netlify config + redirects
├── sitemap.xml                   # SEO sitemap
├── robots.txt                    # SEO robots
└── .env.example                  # Environment variable template
```

---

## Subscription Plans

| Plan | Price | Docs/mo | AI Requests | Chat |
|---|---|---|---|---|
| Free | $0 | 5 | 20 | 10/doc |
| Trial | $0 (14 days) | 20 | 100 | 30/doc |
| Premium | $9.99/mo | 100 | 500 | 100/doc |
| Pro | $19.99/mo | Unlimited | Unlimited | Unlimited |

---

## CamerPay Webhook

Set your CamerPay webhook URL to:
```
https://your-domain.netlify.app/api/payments/camerpay/webhook
```

The webhook handler validates the signature, finds the payment record, activates the subscription on success, and sends a confirmation email.

---

## Sandbox / Testing

If `CAMERPAY_API_KEY` is set to `sandbox` or left empty, payments run in sandbox mode returning a mock response. This allows full end-to-end testing without real payments.

---

## Contact

hello@norcanto.com
