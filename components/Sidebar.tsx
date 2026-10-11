"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, GitBranch, FilePenLine, Inbox, LayoutDashboard, ListChecks, MessageSquareText, Send, ShoppingBag, ShieldCheck } from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "WhatsApp Inbox", icon: Inbox },
  ...(process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" ? [{ href: "/media-review", label: "Media Playback QA", icon: ShieldCheck }] : []),
  ...(process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" ? [{ href: "/acceptance-review", label: "Inbox & Orders QA", icon: ListChecks }] : []),
  ...(process.env.NEXT_PUBLIC_ENABLE_INBOX_REVIEW === "1" ? [{ href: "/inbox-review", label: "Inbox Review", icon: ListChecks }] : []),
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/journeys", label: "Customer Journeys", icon: GitBranch },
  { href: "/templates", label: "Message Templates", icon: FilePenLine },
  ...(process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1"
    ? []
    : [
        { href: "/campaigns", label: "Campaign Analytics", icon: BarChart3 },
        { href: "/outbox", label: "Outbox", icon: Send },
        { href: "/events", label: "Events & Health", icon: Activity },
      ]),
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark"><MessageSquareText size={22} /></div>
        <div><strong>Sanureva CRM</strong><span>WhatsApp Operations</span></div>
      </div>
      <nav className="nav">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? "navItem active" : "navItem"}><Icon size={18}/><span>{label}</span></Link>;
        })}
      </nav>
      <div className="sidebarFoot">
        <ListChecks size={16}/>
        <div><strong>{process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" ? "Neon Preview (read-only)" : "Direct n8n backend"}</strong><span>Existing automations preserved</span></div>
      </div>
    </aside>
  );
}
