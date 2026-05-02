# WriteIt Assignment Assistant 🎓

**Professional academic writing for Health & Social Care qualifications**
Built for support workers, care providers, and employers across the UK.

---

## What This Is

A full web application with:
- A **frontend** (HTML/CSS/JS) that collects learner input and shows a preview
- A **Node.js backend** that calls the Anthropic AI API securely (your API key never touches the browser)
- **Email notifications** — every generation emails you (admin) the full assignment. Learners who provide their email get a preview email
- **Rate limiting** — free users get 5 generations per hour per IP. Subscribers get priority
- **Security** — helmet headers, CORS, input sanitisation, no data stored

---

## File Structure

```
writeit/
├── public/
│   ├── index.html      ← The website (all three tabs)
│   ├── style.css       ← All styling
│   └── app.js          ← Frontend logic
├── server.js           ← Node.js backend (API proxy + email)
├── package.json        ← Dependencies
├── .env.example        ← Template for your secrets
├── .gitignore          ← Keeps .env out of Git
└── README.md           ← This file
```

---

## STEP-BY-STEP SETUP

### Step 1 — Get the tools you need (one-time)

1. **Node.js** — Download and install from https://nodejs.org (choose "LTS" version)
   - After installing, open Terminal (Mac) or Command Prompt (Windows) and type:
     ```
     node --version
     ```
   - You should see something like `v20.x.x` ✓

2. **A code editor** (optional but helpful) — Download VS Code free from https://code.visualstudio.com

---

### Step 2 — Get your Anthropic API Key

1. Go to https://console.anthropic.com and create a free account
2. Click **API Keys** in the left sidebar
3. Click **Create Key** — give it a name like "WriteIt"
4. Copy the key (starts with `sk-ant-...`) — save it somewhere safe, you'll only see it once
5. Add billing at https://console.anthropic.com/settings/billing — start with $5, it goes a long way

---

### Step 3 — Set up Gmail App Password

Your server sends emails using your Gmail. You need an **App Password** (not your regular Gmail password):

1. Make sure **2-Step Verification** is turned on for your Gmail:
   - Go to https://myaccount.google.com → Security → 2-Step Verification → Turn On
2. Go to https://myaccount.google.com → Security → **App passwords**
   - (If you don't see "App passwords", search for it in the search bar)
3. Click **Select app** → choose **Mail**
4. Click **Select device** → choose **Other** → type `WriteIt`
5. Click **Generate**
6. Copy the 16-character password (e.g. `abcd efgh ijkl mnop`)

---

### Step 4 — Configure your environment

1. In your `writeit` folder, find the file called `.env.example`
2. Make a copy of it and rename the copy to exactly `.env` (note the dot at the start)
3. Open `.env` in a text editor and fill in your values:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ADMIN_EMAIL=writeit.student@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
SITE_URL=http://localhost:3000
PORT=3000
```

Save and close the file.

---

### Step 5 — Install dependencies and run locally

Open Terminal / Command Prompt, navigate to your writeit folder:

```bash
cd path/to/writeit
npm install
npm start
```

You should see:
```
✅  WriteIt server running on http://localhost:3000
📧  Admin email: writeit.student@gmail.com
🔑  Anthropic key: SET ✓
```

Open your browser and go to **http://localhost:3000** — your tool is running! 🎉

---

### Step 6 — Test it works

1. Go to the "Write Assignment" tab
2. Enter a test question, word count (e.g. 300), select a level and referencing style
3. Click **Generate My Assignment**
4. You should see the preview appear after 15–30 seconds
5. Check your Gmail inbox at writeit.student@gmail.com — you should have received the full assignment

---

### Step 7 — Put it on the internet (Deployment)

#### OPTION A — Render.com (Recommended — Free tier available)

1. Create a free account at https://render.com
2. Click **New → Web Service**
3. Connect your GitHub account and upload your code, OR use **Deploy from a public Git repo**
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add your environment variables (same as your `.env` file) under **Environment Variables**
6. Click **Deploy** — Render gives you a URL like `https://writeit.onrender.com`

#### OPTION B — Railway.app (Also easy, good free tier)

1. Go to https://railway.app and sign up
2. Click **New Project → Deploy from GitHub Repo**
3. Add environment variables under the **Variables** tab
4. Your app deploys automatically — you get a URL like `https://writeit.up.railway.app`

#### OPTION C — VPS (DigitalOcean / Hetzner — full control)

For a professional custom domain setup:
1. Get a VPS from https://hetzner.com (cheap, reliable, starts ~€4/month)
2. Install Node.js on the server
3. Upload your files via FTP or Git
4. Use **PM2** to keep the server running: `npm install -g pm2 && pm2 start server.js`
5. Use **Nginx** as a reverse proxy
6. Get a free SSL certificate with **Certbot**

---

### Step 8 — Get a custom domain

1. Buy a domain from https://namecheap.com or https://porkbun.com
   - Suggestions: `writeitassistant.com`, `writeit.co.uk`, `writeitcare.com`
   - Cost: ~£10–£15/year
2. Point the domain to your hosting (Render/Railway/VPS) — they give you instructions
3. Update your `.env`: `SITE_URL=https://yourdomainhere.com`
4. Update `ALLOWED_ORIGINS` in `server.js` to include your domain

---

## How the Business Works (Summary)

```
Learner visits site
      ↓
Fills in question + details
      ↓
Clicks "Generate"
      ↓
Backend calls Anthropic AI (securely)
      ↓
Full assignment generated
      ↓
YOU (admin) receive full assignment by email ← ALWAYS
Learner sees 40% preview on screen only
      ↓
Learner clicks "Contact Admin for Full Response"
      ↓
They email you → you discuss plan + payment
      ↓
They pay via Remitly / Tap Tap Send / WorldRemit etc.
      ↓
You forward the full assignment email to them ✓
```

---

## Ongoing Admin — What You Do Daily

1. **Check writeit.student@gmail.com** for new generation emails
2. When someone enquires about a plan → discuss pricing → send payment instructions
3. Once paid → forward the full assignment email to the learner
4. To block abuse → you can increase rate limiting in `server.js`

---

## Security Summary

| Feature | Status |
|---|---|
| API key never in browser | ✅ Server-side only |
| HTTPS encryption | ✅ Provided by host (Render/Railway/VPS + Certbot) |
| Rate limiting (5/hour per IP) | ✅ Built in |
| Input sanitisation | ✅ Built in |
| Security headers (Helmet) | ✅ Built in |
| CORS locked to your domain | ✅ Built in |
| No database / no stored data | ✅ Stateless |
| GDPR compliant | ✅ No personal data retained |

---

## Costs (Monthly Estimate)

| Item | Cost |
|---|---|
| Anthropic API (per ~50 assignments) | ~$2–5 |
| Render.com hosting (free tier) | £0 |
| Domain name | ~£1/month |
| Gmail | Free |
| **Total** | **~£2–6/month** |

---

## Need Help?

If you get stuck on any step, email yourself a note and revisit the README.
Every step is designed to be done without technical expertise.

**Contact:** writeit.student@gmail.com
