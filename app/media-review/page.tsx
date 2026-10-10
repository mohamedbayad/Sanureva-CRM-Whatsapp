import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MediaReviewClient } from "@/components/MediaReviewClient";

export const metadata: Metadata = {
  title: "Original Media Playback QA · Sanureva CRM",
  robots: { index: false, follow: false },
};

export default function MediaReviewPage() {
  const previewOnly = process.env.VERCEL_ENV === "preview" &&
    process.env.CRM_READ_SOURCE === "neon_shadow" &&
    process.env.CRM_PREVIEW_DIRECT_READ === "1";
  if (!previewOnly) notFound();
  return <MediaReviewClient />;
}
