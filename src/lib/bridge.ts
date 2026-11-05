"use client";
import { useCallback, useEffect, useState } from "react";

// Talks to the Prax extension through its bridge script on this page. Settings sent here go
// straight into the extension's storage in this browser; the AI key never reaches the server.
export type ExtStatus = { installed: boolean; version?: string; connected?: boolean; provider?: string; model?: string; hasKey?: boolean; quiet?: boolean };
export const LATEST_EXT = "0.3.0";

export function useExtension() {
  const [status, setStatus] = useState<ExtStatus | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === window && e.data?.praxExt && e.data.data) setStatus(e.data.data); };
    window.addEventListener("message", on);
    window.postMessage({ praxWeb: true, id: "init", type: "status" }, location.origin);
    const t = setTimeout(() => setStatus((s) => s ?? { installed: false }), 1500);
    return () => { window.removeEventListener("message", on); clearTimeout(t); };
  }, []);
  const send = useCallback((type: string, data: Record<string, unknown> = {}) => new Promise<ExtStatus>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const on = (e: MessageEvent) => {
      if (e.source !== window || !e.data?.praxExt || e.data.id !== id) return;
      window.removeEventListener("message", on); clearTimeout(t); setStatus(e.data.data); resolve(e.data.data);
    };
    const t = setTimeout(() => { window.removeEventListener("message", on); reject(new Error("The extension did not answer. Reload this page after installing it.")); }, 2000);
    window.addEventListener("message", on);
    window.postMessage({ praxWeb: true, id, type, data }, location.origin);
  }), []);
  return { status, send };
}
