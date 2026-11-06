"use client";
// Saving, testing and removing a tool's key, through the extension bridge only. The key goes into chrome.storage in
// this browser and is never read back, stored by Prax or sent to Prax. Delete waits out the toast's Undo window
// before it tells the extension, because a removed key cannot be read back to restore it.
import { useCallback, useSyncExternalStore } from "react";
import { askExtension, type ExtStatus } from "@/lib/bridge";
import { saveCheckerKey, removeCheckerKey } from "@/lib/providers";
import { toolName } from "@/lib/connections";

type Send = (type: string, data?: Record<string, unknown>) => Promise<ExtStatus>;
const UNDO_MS = 5200;

// Keys waiting to be removed (the Undo window), shared by every screen on the page.
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>();
const subs = new Set<() => void>();
let snapshot: string[] = [];
const emit = () => { snapshot = [...pending.keys()]; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { for (const [, p] of pending) { clearTimeout(p.timer); p.run(); } pending.clear(); });

/** The settings message that saves a key: Pangram and Walter through the humanize module's own helpers. */
// The older key slots (0.9.6 and before) are written too, so a key saved here also works before the update lands.
const LEGACY_SLOT: Record<string, string> = { claude: "claude", openai: "openai", gemini: "gemini", perplexity: "perplexity", serpapi: "serpapi", openai_images: "openai", gemini_images: "gemini" };
export function keyMessage(tool: string, key: string): Record<string, unknown> {
  const k = key.trim();
  if (tool === "pangram" || tool === "walter") return { ...saveCheckerKey(tool, k), toolKey: { tool, key: k } };
  return { toolKey: { tool, key: k }, ...(LEGACY_SLOT[tool] ? { searchKey: { provider: LEGACY_SLOT[tool], key: k } } : {}) };
}
export function removeMessage(tool: string): Record<string, unknown> {
  if (tool === "pangram" || tool === "walter") return { ...removeCheckerKey(tool), clearTool: tool };
  return { clearTool: tool, ...(LEGACY_SLOT[tool] ? { clearSearchKey: LEGACY_SLOT[tool] } : {}) };
}
/** True when this browser's extension predates Connections (0.9.7): it cannot test or hold the new tools' keys. */
export function oldExtension(s: ExtStatus | null): boolean {
  if (!s?.installed || !s.version) return false;
  const [a, b, c] = s.version.split(".").map(Number);
  return a * 10000 + b * 100 + c < 907;
}

export type TestResult = { ok: boolean; line: string };
export async function testTool(tool: string, key = ""): Promise<TestResult> {
  try {
    const r = await askExtension<{ ok: boolean; line: string }>("tool", { op: "test", tool, key }, 30000);
    return { ok: true, line: r.line };
  } catch (e) { return { ok: false, line: (e as Error).message }; }
}

export function useKeyActions(send: Send, toast: (t: string, undo?: () => void) => void) {
  const removing = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const save = useCallback(async (tool: string, key: string, replaced: boolean) => {
    await send("settings", keyMessage(tool, key));
    toast(`${toolName(tool)} key ${replaced ? "replaced" : "saved"} in this browser`);
  }, [send, toast]);
  const remove = useCallback((tool: string) => {
    const run = async () => { try { await send("settings", removeMessage(tool)); } catch (e) { toast((e as Error).message); } };
    const timer = setTimeout(() => { pending.delete(tool); emit(); run(); }, UNDO_MS);
    pending.set(tool, { timer, run }); emit();
    toast(`${toolName(tool)} key deleted from this browser`, () => { const p = pending.get(tool); if (p) clearTimeout(p.timer); pending.delete(tool); emit(); });
  }, [send, toast]);
  const saveJobKey = useCallback(async (job: string, tool: string, key: string) => { await send("settings", { jobKey: { job, tool, key: key.trim() } }); toast("Separate key saved in this browser"); }, [send, toast]);
  const clearJobKey = useCallback(async (job: string) => { await send("settings", { clearJobKey: job }); toast("Separate key removed; the job uses the tool's key"); }, [send, toast]);
  const setModel = useCallback(async (tool: string, model: string) => { await send("settings", { toolModel: { tool, model } }); toast(model ? `${toolName(tool)} now uses ${model}` : `${toolName(tool)} uses its default model`); }, [send, toast]);
  return { save, remove, removing, saveJobKey, clearJobKey, setModel };
}
