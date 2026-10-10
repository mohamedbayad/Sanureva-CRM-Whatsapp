import type { SheetRecord } from "@/lib/types";
import { cleanDisplay } from "@/lib/format";

const DELIVERY_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

/**
 * Older WhatsApp status callbacks were mirrored into MESSAGES with only a
 * WAMID and delivery status. They have no actual body, customer, or message ID.
 * Keep these source records for delivery auditing, but never count them as
 * customer/bot messages or invent a conversation for them.
 */
export function isStatusOnlyRecord(row: SheetRecord): boolean {
  const get = (key: string) => cleanDisplay(row[key]);
  const status = get("Delivery Status").toLowerCase();
  const phone = get("Customer Phone").toLowerCase();
  const direction = get("Direction").toLowerCase();
  return (
    DELIVERY_STATUSES.has(status) &&
    Boolean(get("WhatsApp WAMID")) &&
    !get("Message ID") &&
    !get("Conversation ID") &&
    (!phone || phone === "unknown") &&
    (!direction || direction === "system") &&
    !get("Message Type") &&
    !get("Message Content Snippet") &&
    !get("Media ID") &&
    !get("Media Kind")
  );
}
