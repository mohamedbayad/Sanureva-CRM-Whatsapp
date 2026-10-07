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

The project already contains `.env.local` configured for this n8n instance:

```env
N8N_CRM_WEBHOOK_URL=https://n8n-dhhy.srv1952669.hstgr.cloud/webhook/sanureva-crm-api
N8N_CRM_API_KEY=8kN6tp0nrHLqJUPaIX-huwaQUYX3cuXkj5UrtrezHG8
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
