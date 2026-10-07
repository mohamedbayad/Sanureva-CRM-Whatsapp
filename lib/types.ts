import type { SheetName } from "@/lib/contracts";

export type SheetRecord = Record<string, string | number | boolean | null>;

export type CrmSnapshot = {
  source: "n8n";
  syncedAt: string;
  contractOk: boolean;
  contractWarnings: string[];
  sheets: Record<SheetName, SheetRecord[]>;
};

export type OutboxPayload = {
  phone: string;
  customer?: string;
  orderId?: string;
  type: "Text" | "Image" | "PDF" | "Video";
  message?: string;
  mediaUrl?: string;
  fileName?: string;
};
