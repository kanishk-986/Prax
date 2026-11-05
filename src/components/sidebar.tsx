"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, UserRound, LayoutDashboard, CheckSquare, Kanban, FileText, MessageSquare, LayoutTemplate, Sparkles, Compass, StickyNote, Settings, ChevronsUpDown, Menu, X, Search } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { Logo } from "./logo";

const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: CheckSquare },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/profile", label: "Profile Studio", icon: UserRound },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/comments", label: "Engagement", icon: MessageSquare },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/citations", label: "AI citations", icon: Sparkles },
  { href: "/strategy", label: "Strategy", icon: Compass },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/extension", label: "Extension", icon: Flame },
];

export function Sidebar() {
  const { ws, role, email } = useWorkspace();
  const path = usePathname();
  const base = `/w/${ws.slug}`;
  const [open, setOpen] = useState(false);
  const item = (href: string, label: string, Icon: React.ElementType) => {
    const full = base + href;
    const active = href === "" ? path === base : path.startsWith(full);
    return (
      <Link key={href} href={full} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors ${active ? "bg-surface text-ink shadow-[var(--shadow)] ring-1 ring-line" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>
        <Icon size={15} strokeWidth={1.8} />{label}
      </Link>
    );
  };
  const body = (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <Link href="/" className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-surface-2">
        <Logo />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">{ws.name}</div>
          <div className="text-[11px] text-muted capitalize leading-tight">{role}</div>
        </div>
        <ChevronsUpDown size={14} className="text-faint" />
      </Link>
      <button onClick={() => { setOpen(false); window.dispatchEvent(new Event("prax:cmdk")); }}
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-muted shadow-[var(--shadow)] transition-colors hover:border-line-strong hover:text-ink">
        <Search size={14} /> Search <span className="ml-auto flex gap-0.5"><span className="kbd">⌘</span><span className="kbd">K</span></span>
      </button>
      <nav className="flex flex-col gap-0.5">{NAV.map((n) => item(n.href, n.label, n.icon))}</nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {item("/settings", "Settings", Settings)}
        <div className="truncate px-2.5 pt-2 text-[11px] text-faint">{email}</div>
      </div>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-line bg-canvas md:block side-red">{body}</aside>
      <button className="btn btn-ghost fixed left-3 top-3 z-30 md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={16} /></button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-[260px] border-r border-line bg-canvas side-red" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost absolute right-2 top-2" aria-label="Close menu" onClick={() => setOpen(false)}><X size={16} /></button>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
