// Video recorded or uploaded inside Prax (I6). Pure logic only, so scripts/test-video.ts can check it:
// storage paths, accepted types, the recorder format, the trim maths, the teleprompter and the .srt captions file.

export const VIDEO_BUCKET = "post-videos";
/** Matches the bucket limit in db/029. */
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** Recording stops by itself after 10 minutes, the LinkedIn limit for a video from a profile. */
export const MAX_RECORD_SECONDS = 600;
/** Speaking pace used everywhere in the script step (about 2.5 words a second). */
export const WORDS_PER_SECOND = 2.5;

const EXT: Record<string, string> = { "video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov" };
const BY_EXT: Record<string, string> = { webm: "video/webm", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime" };

/** "video/webm;codecs=vp9,opus" becomes "video/webm"; the bucket checks the plain type. */
export const baseType = (mime: string) => String(mime || "").split(";")[0].trim().toLowerCase();

/** Storage path for a post's video: the workspace first, so the bucket policies in db/029 can check membership. */
export function videoPath(wsId: string, postId: string, mime: string, stamp = Date.now()) {
  return `${wsId}/${postId}/${stamp}.${EXT[baseType(mime)] ?? "mp4"}`;
}

/** The type a chosen file is stored as, from its type or, when the browser gives none, its extension; null when it is not MP4, MOV or WebM. */
export function videoTypeOf(name: string, type: string): string | null {
  const t = baseType(type);
  if (EXT[t]) return t;
  if (t && t !== "application/octet-stream") return null;
  return BY_EXT[String(name).split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

/** Why a chosen file cannot be uploaded, or null when it can. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  if (!videoTypeOf(file.name, file.type)) return "Only MP4, MOV and WebM videos can be uploaded.";
  if (file.size > VIDEO_MAX_BYTES) return `That video is ${fmtBytes(file.size)}. The limit is 200 MB.`;
  if (file.size === 0) return "That file is empty.";
  return null;
}

export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The recorder format: MP4 first (LinkedIn takes it as it is; Safari and recent Chrome record it), then WebM. */
export const RECORDER_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
export function pickRecorderType(isSupported: (t: string) => boolean): string {
  return RECORDER_TYPES.find((t) => { try { return isSupported(t); } catch { return false; } }) ?? "";
}

/** Plain words for a failed camera and microphone request, by the error's name. */
export function mediaErrorText(name: string): string {
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera and microphone access is blocked for Prax. Allow both in the site settings (the icon left of the address), then press Record again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found. Connect one, or upload a video instead.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is in use by another app. Close it, then press Record again.";
  return "The camera could not be started. Try again, or upload a video instead.";
}

// ---------- trim ----------
export type Trim = { start: number; end: number };
/** Shortest clip the trim handles allow, in seconds. */
export const MIN_CLIP = 1;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Keeps the in and out points inside the video, in order and at least MIN_CLIP apart (the whole video when it is shorter). */
export function clampTrim(t: Trim, duration: number, moved: "start" | "end" = "end"): Trim {
  const d = Math.max(0, duration);
  if (d <= MIN_CLIP) return { start: 0, end: r1(d) };
  let start = Math.min(Math.max(0, t.start), d - MIN_CLIP), end = Math.max(Math.min(d, t.end), MIN_CLIP);
  if (end - start < MIN_CLIP) { if (moved === "start") start = end - MIN_CLIP; else end = start + MIN_CLIP; }
  return { start: r1(start), end: r1(end) };
}
/** The time under a pointer on the trim bar, to a tenth of a second. */
export function timeAt(x: number, width: number, duration: number) {
  if (width <= 0) return 0;
  return r1(Math.min(1, Math.max(0, x / width)) * duration);
}
/** Share of the bar, 0 to 100, for a time. */
export const pct = (t: number, duration: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
/** True when the handles still cover the whole video, so nothing needs cutting. */
export const isWhole = (t: Trim, duration: number) => t.start <= 0.05 && t.end >= duration - 0.05;
/** A keyboard step on a handle: arrows move a tenth of a second, with Shift a whole second. */
export function nudge(t: Trim, which: "start" | "end", key: string, shift: boolean, duration: number): Trim | null {
  const step = shift ? 1 : 0.1;
  const by = key === "ArrowLeft" || key === "ArrowDown" ? -step : key === "ArrowRight" || key === "ArrowUp" ? step : null;
  if (key === "Home") return clampTrim({ ...t, [which]: which === "start" ? 0 : t.start + MIN_CLIP }, duration, which);
  if (key === "End") return clampTrim({ ...t, [which]: which === "end" ? duration : t.end - MIN_CLIP }, duration, which);
  if (by === null) return null;
  return clampTrim({ ...t, [which]: t[which] + by }, duration, which);
}
/** 0:07.4 for the handles; 1:05 for the timer. */
export const fmtClock = (s: number, tenths = false) => {
  const v = Math.max(0, s), m = Math.floor(v / 60), sec = v - m * 60;
  return `${m}:${tenths ? sec.toFixed(1).padStart(4, "0") : String(Math.floor(sec)).padStart(2, "0")}`;
};

// ---------- teleprompter ----------
/** Speed 1 to 10 on the slider; 5 scrolls the whole script in the time it takes to say it, 10 twice as fast. */
export const prompterRate = (speed: number) => Math.min(10, Math.max(1, speed)) / 5;
/** Seconds the script takes to say at the usual pace (never under 5, so a short script does not race). */
export const spokenSeconds = (s: ScriptLike) => Math.max(5, spokenParts(s).join(" ").split(" ").filter(Boolean).length / WORDS_PER_SECOND);
/** How far the prompter has scrolled after some seconds, never past the end of the text. */
export const prompterOffset = (seconds: number, speed: number, maxScroll: number, spoken: number) => {
  const max = Math.max(0, maxScroll);
  return Math.min(max, (Math.max(0, seconds) / Math.max(5, spoken)) * prompterRate(speed) * max);
};

// ---------- captions ----------
export type ScriptLike = { hook?: string; beats?: { say: string }[]; close?: string };
/** What is said, in order: the hook, each beat, the closing line. */
export const spokenParts = (s: ScriptLike) => [s.hook ?? "", ...(s.beats ?? []).map((b) => b.say), s.close ?? ""].map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const srtTime = (s: number) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
/** An .srt captions file from the script timing: each part in cues of at most 8 words, each cue on screen as long
 *  as its words take to say (at least a second), one after the other from 0. Empty when nothing is said. */
export function scriptSrt(s: ScriptLike, maxWords = 8): string {
  const cues: string[] = [];
  let t = 0;
  for (const part of spokenParts(s)) {
    const words = part.split(" ");
    const n = Math.ceil(words.length / maxWords), per = Math.ceil(words.length / n);
    for (let i = 0; i < words.length; i += per) {
      const line = words.slice(i, i + per);
      const d = Math.max(1, line.length / WORDS_PER_SECOND);
      cues.push(`${cues.length + 1}\n${srtTime(t)} --> ${srtTime(t + d)}\n${line.join(" ")}\n`);
      t += d;
    }
  }
  return cues.join("\n");
}
/** A file name from the post title: "settlement-in-38-seconds". */
export const fileStem = (title: string) => (title || "post-video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "post-video";
