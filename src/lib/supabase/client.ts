"use client";
import { createBrowserClient } from "@supabase/ssr";
import { WROTE, writtenTable } from "../writes";

let client: ReturnType<typeof createBrowserClient> | null = null;

// Every successful write tells the live lists of that table to reload (useLive), so the screen shows it at once.
const tracked: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const table = res.ok ? writtenTable(url, init?.method ?? (input instanceof Request ? input.method : "GET")) : "";
  if (table) window.dispatchEvent(new CustomEvent(WROTE, { detail: table }));
  return res;
};

export function supabase() {
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { fetch: tracked } });
  }
  return client;
}
