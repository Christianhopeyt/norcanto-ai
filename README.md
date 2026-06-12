# Norcanto AI — Deployment Guide

## What This Is

Norcanto AI is a production-ready AI document intelligence platform. Users upload PDFs, DOCX, or TXT files and receive AI-generated summaries, risk analysis, key dates, obligations, action items, and document chat. All document-analysis features are included for every user.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no build step) |
| Hosting | Netlify (static + Functions) |
| Serverless | Netlify Functions (Node.js 18+) |
| Database | Supabase (PostgreSQL) — optional for auth |
| AI | Google Gemini 1.5 Flash |

---

## Quick Start (Local)

```powershell
# 1. Extract the zip, open terminal inside the quickdocs folder

# 2. Install function dependencies (one time only)
cd netlify\functions
npm install
cd ..\..

# 3. Copy env template and fill in your values
copy .env.example .env

# 4. Install netlify-cli globally if you haven't
npm install -g netlify-cli

# 5. Start local dev server
netlify dev
# Site available at http://localhost:8888
```

---

## Environment Variables

Add these in Netlify dashboard under **Site configuration > Environment variables**:

```
GEMINI_API_KEY        = your_google_gemini_api_key   (required)
SUPABASE_URL          = https://xxx.supabase.co       (required for auth)
SUPABASE_SERVICE_KEY  = your_service_role_key         (required for auth)
JWT_SECRET            = any_random_32_char_string     (required for auth)
MAILGUN_API_KEY       = your_mailgun_key              (optional - for emails)
MAILGUN_DOMAIN        = norcanto.com                  (optional)
```

> **Without Supabase:** The AI analysis still works fully. Users just cannot create accounts or save history to the server. Documents are saved in browser localStorage.

---

## Deploy to Netlify

### Option A — Dashboard (easiest)
1. Push this folder to a GitHub repository
2. Go to [app.netlify.com](https://app.netlify.com) > Add new site > Import from Git
3. Build command: leave empty
4. Publish directory: `.` (just a dot)
5. Deploy
6. Add environment variables in Site configuration
7. Trigger a redeploy

### Option B — CLI
```bash
netlify login
netlify init
netlify deploy --prod
```

---

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `database/schema.sql`
3. Go to **Settings > API** and copy:
   - Project URL → `SUPABASE_URL`
   - service_role key → `SUPABASE_SERVICE_KEY`

### Make yourself admin
After signing up on the live site:
1. Supabase > Table Editor > users
2. Find your row, change `role` from `user` to `admin`
3. Access admin dashboard at `/pages/admin.html`

---

## Get Gemini API Key

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google
3. Click **Create API key**
4. Copy to `GEMINI_API_KEY`

The configured Gemini service applies its own request-rate safeguards.

---

## File Structure

```
/
├── index.html                      Landing page
├── pages/
│   ├── app.html                    Dashboard
│   ├── analysis.html               Document analysis view
│   ├── signup.html / signin.html   Auth
│   ├── admin.html                  Admin dashboard
│   ├── how-to-use.html             Documentation
│   ├── about.html / contact.html   Company pages
│   ├── privacy-policy.html         Legal
│   ├── terms.html / cookie-policy.html
│   └── blog/
│       ├── index.html              Blog listing (15 posts)
│       └── [15 article files]
├── css/
│   ├── design-system.css           Tokens, base, components
│   ├── nav.css                     Navigation
│   ├── landing.css                 Landing page
│   ├── app.css                     Dashboard & analysis
│   └── blog.css                    Blog styles
├── js/
│   ├── main.js                     Nav, FAQ, animations
│   └── auth.js                     Auth state manager
├── netlify/
│   └── functions/
│       ├── _shared/utils.js        Shared helpers
│       ├── auth-register.js        POST /api/auth/register
│       ├── auth-login.js           POST /api/auth/login
│       ├── user-status.js          GET  /api/user/status
│       ├── analyze.js              POST /api/analyze
│       └── admin.js                GET  /api/admin/stats
├── database/schema.sql             Supabase schema (2 tables)
├── assets/norcanto_logo.png        Brand logo
├── netlify.toml                    Netlify config
├── sitemap.xml                     SEO sitemap (20+ URLs)
├── robots.txt                      SEO robots
└── .env.example                    Environment variable template
```

---

## Contact

hello@norcanto.com
