# Sanureva — CRM API Gateway

This is the only new n8n workflow required by the Next.js CRM. It does **not** replace or modify the existing Sanureva workflows.

## Import once

1. n8n → Workflows → Import from File.
2. Select `Sanureva-CRM-API-Gateway.json`.
3. Check that all Google Sheets nodes use the existing credential **Google Sheets account**.
4. Publish / Activate the workflow.

Production URL after activation:

`https://n8n-dhhy.srv1952669.hstgr.cloud/webhook/sanureva-crm-api`

The gateway accepts only requests carrying the matching `X-CRM-Key` used in `.env.local`.

## What it does

- `snapshot`: n8n reads the existing ORDERS, CONVERSATIONS, MESSAGES, CONFIRMATION_EVENTS, WORKFLOW_HEALTH and WHATSAPP_OUTBOX tabs and returns them to Next.js.
- `send_message`: n8n writes a SEND request to the current WHATSAPP_OUTBOX contract. The already-active **Sanureva — WhatsApp Outbox Sender** performs the real WhatsApp send and logging.

The Next.js app never has Google Sheets credentials and never calls WhatsApp directly.
