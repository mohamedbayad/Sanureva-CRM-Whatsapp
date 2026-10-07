# Sanureva CRM ↔ n8n contract

## Boundary

Next.js communicates with **n8n only**. Google Sheets and WhatsApp stay behind n8n.

## Endpoint

`POST /webhook/sanureva-crm-api`

Server header:

`X-CRM-Key: <shared token>`

## `snapshot`

Request:

```json
{"action":"snapshot"}
```

Response contains `orders`, `conversations`, `messages`, `confirmationEvents`, `workflowHealth`, and `outbox`.

## `send_message`

Request:

```json
{
  "action": "send_message",
  "phone": "502XXXXXXXX",
  "customer_name": "Customer",
  "order_id": "1234",
  "type": "text",
  "message": "Hola",
  "media_url": "",
  "file_name": ""
}
```

The gateway creates the existing WHATSAPP_OUTBOX row with `Action=SEND`. The current Outbox Sender remains responsible for WhatsApp delivery and message logging.
