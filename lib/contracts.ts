export const SHEET_NAMES = {
  orders: "ORDERS",
  conversations: "CONVERSATIONS",
  messages: "MESSAGES",
  events: "CONFIRMATION_EVENTS",
  workflowHealth: "WORKFLOW_HEALTH",
  outbox: "WHATSAPP_OUTBOX",
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];

export const OUTBOX_HEADERS = [
  "Request ID",
  "Action",
  "Phone",
  "Customer",
  "Order ID",
  "Type",
  "Message / Caption",
  "Media URL",
  "File Name",
  "Status",
  "WAMID",
  "Sent At",
  "Error",
] as const;

export const REQUIRED_HEADERS: Record<SheetName, readonly string[]> = {
  ORDERS: [
    "Order ID", "Date & Time", "Customer Name", "Phone Number", "City",
    "Items / Products", "Order Value (MAD)", "WooCommerce Status", "WhatsApp Status",
    "Confirmation Sent", "Confirmation Received", "Response Time (Min)",
    "Confirmation Method", "Reminders Sent", "Delivery Status", "Upsell Added?",
    "Upsell Value (MAD)", "Final Total (MAD)",
  ],
  CONVERSATIONS: [
    "Conversation ID", "Customer Phone", "Customer Name", "Channel", "Intent / Topic",
    "Started At", "Closed At", "Status", "Handled By", "CSAT (1-5)", "Total Messages",
    "Order Generated?", "Order ID", "Resolution Notes", "CleanDigits",
  ],
  MESSAGES: [
    "Message ID", "Conversation ID", "Order ID", "Timestamp", "Direction", "Message Type",
    "Message Content Snippet", "Delivery Status", "WhatsApp WAMID", "Unit Cost (MAD)",
    "Customer Phone", "Customer Name",
  ],
  CONFIRMATION_EVENTS: [
    "Event ID", "Order ID", "Customer Phone", "Trigger Source", "Event Type", "Timestamp",
    "Response Delay (Sec)", "Event Payload Snippet",
  ],
  WORKFLOW_HEALTH: [
    "Execution ID", "Workflow Name", "Timestamp", "Trigger Event", "Execution Status",
    "Execution Time (ms)", "API Status Code", "Retry Count", "Telemetry Notes",
  ],
  WHATSAPP_OUTBOX: OUTBOX_HEADERS,
};
