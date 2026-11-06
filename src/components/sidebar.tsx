"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, UserRound, Radar, LayoutDashboard, CheckSquare, Kanban, FileText, MessageSquare, LayoutTemplate, Sparkles, BookOpen, Settings, Network, PenLine, ChevronsUpDown, Menu, X, Search, Inbox, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { Logo } from "./logo";
import { navActive } from "@/lib/shell";

/** The four sidebar groups, in order. Labels are quiet and in sentence case. */
export const NAV_GROUPS = [
  { key: "do", label: "Do" },
  { key: "create", label: "Create" },
  { key: "grow", label: "Grow" },
  { key: "setup", label: "Set up" },
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number]["key"];
/** words: other names Command K also finds the page by (the Playbook holds what used to be Strategy and Notes). */
export type NavItem = { href: string; label: string; icon: LucideIcon; group: NavGroup; words?: string };

/** Every page, in sidebar order. The sidebar, the phone menu and the Command K list all read this one list. */
export const NAV: NavItem[] = [
  { href: "", label: "Dashboard", icon: LayoutDashboard, group: "do" },
  { href: "/today", label: "Today", icon: CheckSquare, group: "do" },
  { href: "/inbox", label: "Inbox", icon: Inbox, group: "do" },
  { href: "/pipeline", label: "Pipeline", icon: Kanban, group: "do" },
  { href: "/studio-content", label: "Content Studio", icon: FileText, group: "create" },
  { href: "/studio", label: "Comment Studio", icon: PenLine, group: "create" },
  { href: "/profile", label: "Profile Studio", icon: UserRound, group: "grow" },
  { href: "/discovery", label: "Discovery Studio", icon: Radar, group: "grow" },
  { href: "/citations", label: "AI citations", icon: Sparkles, group: "grow" },
  { href: "/network", label: "Network", icon: Network, group: "grow" },
  { href: "/comments", label: "Engagement", icon: MessageSquare, group: "grow" },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, group: "setup" },
  { href: "/extension", label: "Extension", icon: Star, group: "setup" },
  { href: "/playbook", label: "Playbook", icon: BookOpen, group: "setup", words: "strategy notes plan canvas" },
  { href: "/settings", label: "Settings", icon: Settings, group: "setup" },
];

/** A quiet marker for the sample demo profile (db/019_demo_profile.sql). */
export function DemoTag() {
  return <span title="Sample profile with invented data" className="shrink-0 rounded border border-line px-1 text-[10.5px] font-medium leading-[16px] text-muted">Demo</span>;
}

export function Sidebar() {
  const { ws, role, email } = useWorkspace();
  const path = usePathname();
  const base = `/w/${ws.slug}`;
  const [open, setOpen] = useState(false);
  const item = (href: string, label: string, Icon: React.ElementType) => {
    const full = base + href;
    const active = navActive(path, base, href);
    return (
      <Link key={href} href={full} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body font-medium transition-colors ${active ? "bg-surface text-ink shadow-[var(--shadow)] ring-1 ring-line" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>
        <Icon size={15} strokeWidth={1.8} />{label}
      </Link>
    );
  };
  const body = (drawer = false) => (
    <div className="flex min-h-full flex-col gap-5 px-3 py-4">
      <Link href="/" className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-surface-2 ${drawer ? "mr-8" : ""}`}>
        <Logo />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5"><span className="truncate text-body font-semibold leading-tight text-ink">{ws.name}</span>{ws.is_demo && <DemoTag />}</div>
          <div className="mt-0.5 text-meta capitalize leading-tight text-muted">{role}</div>
        </div>
        <ChevronsUpDown size={14} className="text-faint" />
      </Link>
      <button onClick={() => { setOpen(false); window.dispatchEvent(new Event("prax:cmdk")); }}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-body text-muted shadow-[var(--shadow)] transition-colors hover:border-line-strong hover:text-ink">
        <Search size={14} /> Search <span className="ml-auto flex items-center gap-1"><span className="kbd">⌘</span><span className="kbd">K</span></span>
      </button>
      <nav className="flex flex-col gap-4" aria-label="Sections">
        {NAV_GROUPS.map((g) => (
          <div key={g.key} role="group" aria-labelledby={`nav-${g.key}`} className="flex flex-col gap-0.5">
            <span id={`nav-${g.key}`} className="px-2.5 pb-1 text-meta font-medium leading-none text-faint">{g.label}</span>
            {NAV.filter((n) => n.group === g.key).map((n) => item(n.href, n.label, n.icon))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <form action="/auth/signout" method="post" className="flex items-center gap-2 pl-2.5 pt-2">
          <span className="min-w-0 flex-1 truncate text-meta text-faint">{email}</span>
          <button className="rounded px-1.5 py-0.5 text-meta font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink">Sign out</button>
        </form>
      </div>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 overflow-y-auto border-r border-line bg-canvas md:block side-red">{body()}</aside>
      {/* The wrapper carries the position: .btn sets its own position and display, which would override fixed and md:hidden. */}
      <div className="fixed left-3 top-3 z-30 md:hidden"><button className="btn btn-ghost" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={16} /></button></div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <aside className="relative h-full w-[260px] overflow-y-auto border-r border-line bg-canvas side-red" onClick={(e) => e.stopPropagation()}>
            <div className="absolute right-2 top-2 z-10"><button className="btn btn-ghost" aria-label="Close menu" onClick={() => setOpen(false)}><X size={16} /></button></div>
            {body(true)}
          </aside>
        </div>
      )}
    </>
  );
}
