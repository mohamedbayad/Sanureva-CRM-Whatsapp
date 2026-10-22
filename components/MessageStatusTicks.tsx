"use client";

import { Check, CheckCheck, CircleAlert, Clock3 } from "lucide-react";
import { cleanDisplay } from "@/lib/format";

/**
 * WhatsApp message-level delivery indicators (not WooCommerce order status).
 * accepted/queued = clock, sent = one check, delivered = two grey checks,
 * read = two blue checks, failed = red error. A missing callback is unknown,
 * never labelled delivered or read.
 */
export function MessageStatusTicks({ status }: { status: unknown }) {
  const value = cleanDisplay(status).toLowerCase();
  const isRead = value === "read";
  const isDelivered = value === "delivered";
  const isSent = value === "sent";
  const isFailed = ["failed", "error", "undeliverable"].includes(value);
  const Icon = isRead || isDelivered ? CheckCheck : isSent ? Check : isFailed ? CircleAlert : Clock3;
  const title = isRead ? "Read · leído" :
    isDelivered ? "Delivered · entregado" :
    isSent ? "Sent · enviado" :
    isFailed ? "Failed · error de envío" :
    value === "accepted" ? "Accepted by WhatsApp · awaiting delivery" :
    "Pending · delivery not confirmed";
  const tone = isRead ? "read" : isDelivered ? "delivered" : isSent ? "sent" : isFailed ? "failed" : "pending";
  return (
    <span className={`messageDelivery ${tone}`} role="img" aria-label={title} title={title}>
      <Icon aria-hidden="true" size={15} strokeWidth={2.5} />
    </span>
  );
}
