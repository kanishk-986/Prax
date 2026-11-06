"use client";
// Connections (C1, Q135 to Q141): every tool, key, route and usage in one place. Overview (routes, spend, warnings),
// Tools (the catalog) and Prax for Chrome (install, version, connect). Replaces the Extension section; old links redirect.
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Section, type TourStep } from "@/components/shell";
import { LATEST_EXT } from "@/lib/bridge";
import { TOOLS } from "@/lib/connections";
import { useConnections } from "@/components/connections/use-connections";
import { Catalog, filterFrom, filterQuery } from "@/components/connections/catalog";
import { Overview } from "@/components/connections/overview";
import { ChromeTab } from "@/components/connections/chrome-tab";
import { type CatalogFilter } from "@/lib/connections";
import { useWorkspace } from "@/lib/workspace";

type Tab = "overview" | "tools" | "chrome";
const STEPS: TourStep[] = [
  { target: "header", title: "Connections", body: "Every tool Prax can use, its key, the jobs it does and what it costs, in one place. Keys stay in this browser." },
  { target: "spend", title: "This month", body: "Spend and calls across every tool, job and section, from list prices or the cost each provider reports.", tab: "overview" },
  { target: "routes", title: "Routes", body: "Each job has a primary tool and a fallback. A job falls back when the primary has no key, reaches its cap, or fails.", tab: "overview" },
  { target: "filters", title: "The catalog", body: "Search, or filter by section, status and job. Open a tool for its full page: connect, test, usage by section, cap and the call log.", tab: "tools" },
  { target: "steps", title: "Prax for Chrome", body: "Install the extension, connect this browser, and switch Quiet mode. Keys are kept inside it.", tab: "chrome" },
];

export default function ConnectionsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const { ws } = useWorkspace();
  const conn = useConnections();
  const initial = (sp.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(["overview", "tools", "chrome"].includes(initial) ? initial : "overview");
  const [filter, setFilterState] = useState<CatalogFilter>(() => filterFrom(sp));
  const [intro, setIntro] = useState(true);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 1200); return () => clearTimeout(t); }, []);
  // An old "Extension#search-keys" link lands here with its hash: open Tools.
  useEffect(() => { if (window.location.hash === "#search-keys") setTab("tools"); }, []);
  const go = useCallback((t: string) => {
    setTab(t as Tab);
    const q = new URLSearchParams(window.location.search); q.set("tab", t); q.delete("welcome");
    router.replace(`/w/${ws.slug}/connections?${q.toString()}`, { scroll: false });
  }, [router, ws.slug]);
  const setFilter = useCallback((f: CatalogFilter) => {
    setFilterState(f);
    const q = filterQuery(f);
    router.replace(`/w/${ws.slug}/connections${q ? `${q}&tab=tools` : "?tab=tools"}`, { scroll: false });
  }, [router, ws.slug]);

  const connected = TOOLS.filter((t) => !t.coming && conn.connected(t.id)).length;
  const tabs = [
    { id: "overview", label: "Overview", count: conn.warnings.length || undefined, red: conn.warnings.some((w) => w.level !== "info") },
    { id: "tools", label: "Tools", count: TOOLS.length },
    { id: "chrome", label: "Prax for Chrome" },
  ];
  const status = conn.status === null ? "Checking this browser" : !conn.status.installed ? "Prax for Chrome is not installed in this browser, so no keys can be connected yet."
    : `${connected} of ${TOOLS.filter((t) => !t.coming).length} tools connected in this browser. Keys stay in the extension and go only to each provider.`;

  return (
    <Section id="connections" title="Connections" status={status} tabs={tabs} tab={tab} onTab={go} steps={STEPS}
      actions={<a className="btn h-10 px-3.5" href="/prax-extension.zip" download><Download size={14} /> Prax for Chrome {LATEST_EXT}</a>}>
      {tab === "overview" && <Overview conn={conn} onTools={() => go("tools")} />}
      {tab === "tools" && <Catalog conn={conn} filter={filter} setFilter={setFilter} intro={intro} />}
      {tab === "chrome" && <ChromeTab conn={conn} onTools={() => go("tools")} />}
    </Section>
  );
}
