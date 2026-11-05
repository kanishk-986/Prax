// Section shell rules: when the entry moment plays, when the guided tour starts by itself, and how tour steps move.
// Pure functions over a storage-like object, so scripts/test-shell.ts can check them without a browser.

export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export const introKey = (section: string) => `prax:intro:${section}`;
export const tourKey = (section: string, userId: string) => `prax:tour:${section}:${userId}`;

/** The entry moment plays once per section per browser session, never for people who ask for less motion. */
export function shouldPlayIntro(session: Store | null, section: string, reducedMotion: boolean): boolean {
  if (reducedMotion || !session) return false;
  try { return session.getItem(introKey(section)) !== "1"; } catch { return false; }
}
export function markIntro(session: Store | null, section: string) {
  try { session?.setItem(introKey(section), "1"); } catch {}
}

/** The tour starts by itself once per person per section; after that only the Guide button opens it. */
export function shouldAutoTour(local: Store | null, section: string, userId: string): boolean {
  if (!local) return false;
  try { return local.getItem(tourKey(section, userId)) !== "1"; } catch { return false; }
}
export function markTourSeen(local: Store | null, section: string, userId: string) {
  try { local?.setItem(tourKey(section, userId), "1"); } catch {}
}

export type TourState = { index: number | null; done: number[] };
export type TourAction = "next" | "skip" | "back" | "end";

/** Next marks the step done; Skip moves on without marking it; Back never unmarks; past the last step the tour closes. */
export function moveTour(s: TourState, action: TourAction, total: number): TourState {
  if (s.index == null || action === "end") return { index: null, done: s.done };
  const i = s.index;
  if (action === "back") return { index: Math.max(0, i - 1), done: s.done };
  const done = action === "next" && !s.done.includes(i) ? [...s.done, i] : s.done;
  return { index: i + 1 >= total ? null : i + 1, done };
}

export const tourLabel = (s: TourState, total: number) => (s.index == null ? "" : `Step ${s.index + 1} of ${total} · ${s.done.length} completed`);
export const tourPercent = (s: TourState, total: number) => (total ? Math.round((s.done.length / total) * 100) : 0);
