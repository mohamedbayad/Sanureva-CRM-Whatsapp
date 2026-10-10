import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AcceptanceReviewClient } from "@/components/AcceptanceReviewClient";

export const metadata: Metadata = {
  title: "Inbox & Orders Acceptance QA · Sanureva CRM",
  robots: { index: false, follow: false },
};

export default function AcceptanceReviewPage() {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.CRM_READ_SOURCE !== "neon_shadow" ||
      process.env.CRM_PREVIEW_DIRECT_READ !== "1") notFound();
  return <AcceptanceReviewClient />;
}
