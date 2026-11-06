"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";

const initialsOf = (name: string, email: string) => {
  const parts = (name || email.split("@")[0]).replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};

/** Top right of every section header: who is signed in, Settings and Sign out. */
export function AccountMenu() {
  const { ws, email, name, role } = useWorkspace();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-surface text-meta font-semibold tracking-[.02em] text-ink transition-colors hover:border-ink">
        {initialsOf(name, email)}
      </button>
      {open && (
        <div role="menu" className="anim-rise absolute right-0 top-12 z-50 w-[260px] overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-lg)]">
          <div className="border-b border-line px-4 py-3">
            {name && <div className="truncate text-body font-semibold">{name}</div>}
            <div className="truncate text-meta text-muted">{email}</div>
            <div className="mt-1 text-meta capitalize text-muted">{role} · {ws.name}</div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href={`/w/${ws.slug}/settings`} onClick={() => setOpen(false)} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-body hover:bg-surface-2">
              <Settings size={15} className="text-muted" aria-hidden="true" /> Settings
            </Link>
            <form action="/auth/signout" method="post">
              <button role="menuitem" className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-body text-ink hover:bg-surface-2">
                <LogOut size={15} aria-hidden="true" /> Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
