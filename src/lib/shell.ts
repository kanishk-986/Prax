// Section shell rules: when the entry moment plays, when the guided tour starts by itself, and how tour steps move.
// Pure functions over a storage-like object, so scripts/test-shell.ts can check them without a browser.

export type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export const introKey = (section: string) => `prax:intro:${section}`;
/** Q119: the entry moment belongs to the Dashboard only; every other section opens with a 150 ms content fade. */
export const INTRO_SECTION = "dashboard";
export const tourKey = (section: string, userId: string) => `prax:tour:${section}:${userId}`;

/** The entry moment plays once a day (the day is kept in local storage), on the Dashboard only, never for people
 *  who ask for less motion. day is the local calendar day, YYYY-MM-DD. */
export function shouldPlayIntro(local: Store | null, section: string, reducedMotion: boolean, day: string): boolean {
  if (reducedMotion || !local || section !== INTRO_SECTION) return false;
  try { return local.getItem(introKey(section)) !== day; } catch { return false; }
}
export function markIntro(local: Store | null, section: string, day: string) {
  try { local?.setItem(introKey(section), day); } catch {}
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

export const tourLabel = (s: TourState, total: number) => (s.index == null ? "" : `Step ${s.index + 1} of ${total}`);

export type Box = { top: number; left: number; width: number; height: number };
/** Where the tour card goes: below the part it explains, else above it, else beside it, else at the bottom of the
 *  screen; always inside the viewport with a 16 px margin, and aligned to the part's left edge. */
export function tourPlace(target: Box | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 12, margin = 16): { top: number; left: number } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - card.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - card.height - margin));
  if (!target) return { top: clampY(view.height - card.height - margin), left: margin };
  const below = target.top + target.height + gap, above = target.top - gap - card.height;
  if (below + card.height <= view.height - margin) return { top: below, left: clampX(target.left) };
  if (above >= margin) return { top: above, left: clampX(target.left) };
  const right = target.left + target.width + gap, left = target.left - gap - card.width;
  if (right + card.width <= view.width - margin) return { top: clampY(target.top), left: right };
  if (left >= margin) return { top: clampY(target.top), left };
  return { top: clampY(view.height - card.height - margin), left: clampX(target.left) };
}
export const tourPercent = (s: TourState, total: number) => (total ? Math.round((s.done.length / total) * 100) : 0);

/** A sidebar link is the current page when the path is its own address or sits below it. The Dashboard ("") only
 *  matches the workspace root, and "/studio" never matches "/studio-content". */
export function navActive(path: string, base: string, href: string): boolean {
  if (href === "") return path === base || path === base + "/";
  const full = base + href;
  return path === full || path.startsWith(full + "/");
}
