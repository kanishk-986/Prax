"use client";
import { AccountMenu } from "@/components/account-menu";
/** Plain header for pages without an entry moment (Settings, Extension). Same type as the shell's Section header. */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3.5 pl-10 md:pl-0">
      <div className="min-w-0">
        <h1 className="text-page font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-body text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}<AccountMenu /></div>
    </div>
  );
}
