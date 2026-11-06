"use client";
import { createContext, useContext } from "react";
import { SEGMENT_BASE, segmentsOf, firstNameOf, fullNameOf, companyOf, roleOf } from "./persona";

export type Role = "owner" | "editor" | "commenter" | "viewer";
// company, pillars, regions, segments and archived_at arrive with db/016; until it runs they are undefined and src/lib/persona.ts falls back.
export type Workspace = {
  id: string; slug: string; name: string; headline: string; linkedin_url: string; start_date: string; quotas: Quotas; topics?: string[]; voice?: string;
  company?: string; pillars?: string[]; regions?: string[]; segments?: Record<string, string>; archived_at?: string | null;
  /** db/021: Audience weights per segment letter, written by the Strategy canvas. */
  segment_weights?: Record<string, number>;
  /** db/019: the sample demo profile, shown with a quiet Demo tag. */
  is_demo?: boolean;
};
export type Quotas = { comment: number; request: number; dm: number; inmail: number; reply: number };

const rank: Record<Role, number> = { owner: 4, editor: 3, commenter: 2, viewer: 1 };
type Ctx = { ws: Workspace; role: Role; userId: string; email: string; name: string; can: (min: Role) => boolean };
const C = createContext<Ctx | null>(null);

export function WorkspaceProvider({ ws, role, userId, email, name = "", children }: { ws: Workspace; role: Role; userId: string; email: string; name?: string; children: React.ReactNode }) {
  return <C.Provider value={{ ws, role, userId, email, name, can: (min) => rank[role] >= rank[min] }}>{children}</C.Provider>;
}
export function useWorkspace() {
  const v = useContext(C);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}
/** This profile's five segments: fixed letters and colours, names from Settings. */
export const useSegments = () => segmentsOf(useWorkspace().ws);
/** Who this profile is, for copy: first and full name, company and role, with neutral fallbacks (src/lib/persona.ts). */
export function useWho() {
  const { ws } = useWorkspace();
  return { first: firstNameOf(ws), name: fullNameOf(ws), company: companyOf(ws), role: roleOf(ws) };
}

// ---- dates (local calendar days) ----
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
export const weekStart = (s: string) => { const d = new Date(s + "T12:00:00"); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); };
export const fmtDay = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(s + "T12:00:00").toLocaleDateString("en-GB", opts);
export const isWeekday = (s: string) => { const g = new Date(s + "T12:00:00").getDay(); return g > 0 && g < 6; };

export const KINDS = [
  { key: "comment", label: "Comments", unit: "comment", hint: "Paste the post link once the comment is live" },
  { key: "request", label: "Connection requests", unit: "request", hint: "Name of the person, after two comments on their posts" },
  { key: "dm", label: "Messages", unit: "message", hint: "First message after acceptance, or a reply in a running thread" },
  { key: "inmail", label: "InMail", unit: "InMail", hint: "Top-tier only, weekdays" },
  { key: "reply", label: "Replies on own posts", unit: "reply round", hint: "Reply to every comment within 90 minutes" },
] as const;

export const STAGES = ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"] as const;
/** Segment letters and colours. Names differ per profile: use segmentsOf(ws) from src/lib/persona.ts for labels. */
export const SEGMENTS = SEGMENT_BASE;
