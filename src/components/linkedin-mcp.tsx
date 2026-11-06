"use client";
import { useEffect, useRef, useState } from "react";

// LinkedIn "in" mark, simple-icons (CC0), unaltered path.
const LI = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

/** Dashboard header: the LinkedIn MCP entry. Nothing connects yet, so a click explains what is coming instead of pretending. */
export function LinkedInMcp() {
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
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn h-10 gap-2 px-3.5">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d={LI} fill="#0A66C2" /></svg>
        LinkedIn MCP
      </button>
      {open && (
        <div role="dialog" aria-label="LinkedIn MCP" className="anim-rise absolute right-0 top-12 z-50 w-[300px] rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-2 text-body font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d={LI} fill="#0A66C2" /></svg>
            LinkedIn MCP
          </div>
          <p className="mt-2 text-meta leading-relaxed text-muted">On the way: ask Prax about your LinkedIn from any AI tool. Nothing is connected yet, and Prax will never post or send for you.</p>
        </div>
      )}
    </div>
  );
}
