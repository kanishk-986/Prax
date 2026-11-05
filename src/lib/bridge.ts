"use client";
import { useCallback, useEffect, useState } from "react";

// Talks to the Prax extension through its bridge script on this page. Settings sent here go
// straight into the extension's storage in this browser; the AI key never reaches the server.
export type ExtStatus = { installed: boolean; version?: string; connected?: boolean; provider?: string; model?: string; hasKey?: boolean; quiet?: boolean; searchKeys?: Record<string, boolean>; extraKeys?: string[] };
export const LATEST_EXT = "0.7.0";

export function useExtension() {
  const [status, setStatus] = useState<ExtStatus | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === window && e.data?.praxExt && !e.data.result && e.data.data) setStatus(e.data.data); };
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

/** AI work and local draft history from the extension. The AI key stays in the extension. */
export function askExtension<T = unknown>(type: "ai" | "history" | "clearHistory" | "search" | "image", data: Record<string, unknown> = {}, ms = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const on = (e: MessageEvent) => {
      if (e.source !== window || !e.data?.praxExt || !e.data.result || e.data.id !== id) return;
      window.removeEventListener("message", on); clearTimeout(t);
      if (e.data.ok) resolve(e.data.data as T); else reject(new Error(e.data.error || "The extension could not do that."));
    };
    const t = setTimeout(() => { window.removeEventListener("message", on); reject(new Error("The extension did not answer. Install Prax for Chrome 0.6.0 and connect it on the Extension page.")); }, ms);
    window.addEventListener("message", on);
    window.postMessage({ praxWeb: true, id, type, data }, location.origin);
  });
}

/** First JSON object in a model reply. */
export function parseJSON<T = Record<string, unknown>>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text) as T; } catch { return null; }
}
