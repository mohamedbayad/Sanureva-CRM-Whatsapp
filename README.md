# Sanureva CRM — Next.js → n8n

The CRM is connected to **n8n as its backend**. The browser and Next.js app do not connect to Google Sheets or WhatsApp Cloud API directly.

```text
Browser
  ↓
Next.js /api/snapshot + /api/outbox
  ↓  X-CRM-Key (server-side only)
Sanureva — CRM API Gateway (n8n)
  ↓
Existing Sanureva n8n workflows / Google Sheet / WooCommerce / WhatsApp
```

## 1. Import the gateway into n8n

Import `n8n/Sanureva-CRM-API-Gateway.json` and **Activate / Publish** it. Existing workflows remain untouched.

Configure a private `.env.local` or Vercel project Environment Variables. Never commit the real API key:

```env
N8N_CRM_WEBHOOK_URL=https://n8n-dhhy.srv1952669.hstgr.cloud/webhook/sanureva-crm-api
N8N_CRM_API_KEY=REPLACE_WITH_PRIVATE_SECRET
CRM_DASHBOARD_PASSWORD=YOUR_LONG_UNIQUE_CRM_PASSWORD
NEXT_PUBLIC_CRM_POLL_MS=12000
```

`.env.local` is gitignored.

## 2. Run the CRM

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Health check: `http://localhost:3000/api/health`

When the gateway is active it returns `{"ok":true,"gateway":"connected",...}`.

## Existing workflows preserved

- Sanureva — WhatsApp Conversion & Order Confirmation Agent
- Sanureva — Outbound WooCommerce Order Confirmation
- Sanureva — WhatsApp Outbox Sender
- Sanureva — Outbox CRM Auto-fill v2

The new gateway only exposes the CRM-facing API boundary. It does not replace those workflows.

## Browser hydration warning

`<html>` and `<body>` use `suppressHydrationWarning` because browser security extensions such as 360 Total Security can inject `bis_*` attributes before React hydrates. This does not affect CRM data or n8n connectivity.

## Private WhatsApp images and voice notes

The n8n CRM Gateway exposes authenticated `get_media` for WhatsApp Media IDs. The Bot still analyzes photos and voice notes internally, but the CRM snapshot returns `Media Kind`, `Media ID`, and a human-friendly placeholder instead of AI analysis. Next.js produces short-lived signed `Media URL`s and shows the original customer image or a voice-note player in the Inbox.

**Required before deploying this feature:** In Vercel → `sanureva-crm-whatsapp` → Settings → Environment Variables, add `CRM_DASHBOARD_PASSWORD` as a unique, long password to **Production, Preview, and Development**. The CRM will display a private sign-in page and will fail closed until this variable and the existing `N8N_CRM_API_KEY` are configured. Don't add either value to code or to messages.

**Important:** Earlier README history included a real CRM API key. Remove it from current files and **rotate the exposed key in both n8n and Vercel**; Git history can still expose old revisions.

The browser never receives the n8n/WhatsApp API tokens. Images, audio and documents are served only via authenticated, short-lived, same-site Next.js routes; no public Meta media URLs are exposed.
