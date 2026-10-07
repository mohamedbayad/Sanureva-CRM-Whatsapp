import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Sanureva CRM",
  description: "Next.js CRM connected directly to the Sanureva n8n automation gateway",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="appShell" suppressHydrationWarning><Sidebar/><main className="main" suppressHydrationWarning>{children}</main></div>
      </body>
    </html>
  );
}
