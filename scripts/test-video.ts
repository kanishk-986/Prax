// Checks the video logic (I6): storage paths, accepted uploads, the recorder format, camera errors, the trim maths,
// the teleprompter and the .srt captions built from the script timing.
// Run: node scripts/test-video.ts
import { readFileSync } from "node:fs";
import { videoPath, baseType, videoTypeOf, uploadProblem, pickRecorderType, mediaErrorText, clampTrim, timeAt, pct, isWhole, nudge, fmtClock,
  prompterRate, prompterOffset, spokenSeconds, spokenParts, scriptSrt, fileStem, VIDEO_MAX_BYTES, VIDEO_BUCKET } from "../src/lib/video.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// Paths: workspace first, then the post, then a stamped file with the right extension.
eq("webm path", videoPath("ws-1", "post-2", "video/webm;codecs=vp9,opus", 123), "ws-1/post-2/123.webm");
eq("mp4 path", videoPath("ws-1", "post-2", "video/mp4", 5), "ws-1/post-2/5.mp4");
eq("mov path", videoPath("w", "p", "video/quicktime", 7), "w/p/7.mov");
eq("unknown type stored as mp4", videoPath("w", "p", "video/ogg", 1), "w/p/1.mp4");
eq("base type drops codecs", baseType("Video/MP4; codecs=avc1"), "video/mp4");

// Uploads: MP4, MOV and WebM only, under 200 MB.
eq("types from the browser", [videoTypeOf("a.mp4", "video/mp4"), videoTypeOf("a.mov", "video/quicktime"), videoTypeOf("a.webm", "video/webm")], ["video/mp4", "video/quicktime", "video/webm"]);
eq("no type falls back to the extension", [videoTypeOf("clip.MOV", ""), videoTypeOf("clip.m4v", "application/octet-stream")], ["video/quicktime", "video/mp4"]);
eq("other types refused", [videoTypeOf("a.avi", "video/x-msvideo"), videoTypeOf("a.mp4", "image/png"), videoTypeOf("notes.txt", "")], [null, null, null]);
eq("a good file passes", uploadProblem({ name: "a.mp4", type: "video/mp4", size: 1024 }), null);
eq("too big", uploadProblem({ name: "a.mp4", type: "video/mp4", size: VIDEO_MAX_BYTES + 1 }), "That video is 200 MB. The limit is 200 MB.");
eq("wrong type", uploadProblem({ name: "a.gif", type: "image/gif", size: 10 }), "Only MP4, MOV and WebM videos can be uploaded.");
eq("empty file", uploadProblem({ name: "a.mp4", type: "video/mp4", size: 0 }), "That file is empty.");

// Recorder format: MP4 when the browser can, else WebM; nothing when it can record neither.
eq("Safari records MP4", pickRecorderType((t) => t.startsWith("video/mp4")), "video/mp4;codecs=avc1,mp4a.40.2");
eq("older Chrome records VP9 WebM", pickRecorderType((t) => t.startsWith("video/webm")), "video/webm;codecs=vp9,opus");
eq("a throwing check is skipped", pickRecorderType((t) => { if (t.includes("mp4")) throw new Error("x"); return t === "video/webm"; }), "video/webm");
eq("nothing supported", pickRecorderType(() => false), "");

// Camera errors in plain words.
eq("denied says where to allow it", mediaErrorText("NotAllowedError").startsWith("Camera and microphone access is blocked"), true);
eq("no device offers upload", mediaErrorText("NotFoundError").includes("upload a video instead"), true);
eq("busy camera", mediaErrorText("NotReadableError").startsWith("The camera is in use"), true);
eq("anything else", mediaErrorText("TypeError").startsWith("The camera could not be started"), true);

// Trim maths.
eq("inside the video stays", clampTrim({ start: 2, end: 8 }, 10), { start: 2, end: 8 });
eq("out of range is pulled in", clampTrim({ start: -3, end: 14 }, 10), { start: 0, end: 10 });
eq("moving the end onto the start keeps one second", clampTrim({ start: 5, end: 5.2 }, 10, "end"), { start: 5, end: 6 });
eq("moving the start onto the end keeps one second", clampTrim({ start: 7.8, end: 8 }, 10, "start"), { start: 7, end: 8 });
eq("start cannot pass the last second", clampTrim({ start: 9.9, end: 10 }, 10, "start"), { start: 9, end: 10 });
eq("a clip under a second is kept whole", clampTrim({ start: 0.2, end: 0.4 }, 0.8), { start: 0, end: 0.8 });
eq("rounded to a tenth", clampTrim({ start: 1.234, end: 6.789 }, 10), { start: 1.2, end: 6.8 });
eq("pointer to time", [timeAt(150, 300, 20), timeAt(-10, 300, 20), timeAt(400, 300, 20), timeAt(10, 0, 20)], [10, 0, 20, 0]);
eq("time to bar share", [pct(5, 20), pct(30, 20), pct(1, 0)], [25, 100, 0]);
eq("whole video needs no cut", [isWhole({ start: 0, end: 12 }, 12), isWhole({ start: 0.5, end: 12 }, 12)], [true, false]);
eq("arrow moves a tenth", nudge({ start: 2, end: 8 }, "start", "ArrowRight", false, 10), { start: 2.1, end: 8 });
eq("shift arrow moves a second", nudge({ start: 2, end: 8 }, "end", "ArrowLeft", true, 10), { start: 2, end: 7 });
eq("Home and End", [nudge({ start: 2, end: 8 }, "start", "Home", false, 10), nudge({ start: 2, end: 8 }, "end", "End", false, 10)], [{ start: 0, end: 8 }, { start: 2, end: 10 }]);
eq("other keys do nothing", nudge({ start: 2, end: 8 }, "start", "a", false, 10), null);
eq("clock", [fmtClock(65), fmtClock(7.44, true), fmtClock(0, true), fmtClock(-2)], ["1:05", "0:07.4", "0:00.0", "0:00"]);

// Teleprompter.
eq("speed as a share of speaking pace", [prompterRate(1), prompterRate(5), prompterRate(10), prompterRate(40)], [0.2, 1, 2, 2]);
eq("at 5 the script is halfway at half the spoken time", prompterOffset(10, 5, 600, 20), 300);
eq("at 10 it scrolls twice as fast", prompterOffset(5, 10, 600, 20), 300);
eq("offset stops at the end", prompterOffset(100, 5, 300, 20), 300);
eq("offset never negative", [prompterOffset(-1, 5, 300, 20), prompterOffset(3, 5, -40, 20)], [0, 0]);
eq("spoken seconds at 2.5 words a second, at least 5", [spokenSeconds({ hook: "a ".repeat(50) }), spokenSeconds({ hook: "Hi." })], [20, 5]);

// Captions from the script timing.
const script = { hook: "Settlement takes 38 seconds now.", beats: [{ say: "Banks in the Gulf moved first because the regulator set a clear date for every bank." }, { say: "  " }], close: "Ask your team which date is yours." };
eq("spoken parts skip blanks", spokenParts(script).length, 3);
const srt = scriptSrt(script);
eq("srt first cue", srt.split("\n").slice(0, 3), ["1", "00:00:00,000 --> 00:00:02,000", "Settlement takes 38 seconds now."]);
eq("long beat split evenly into cues of 8 words or fewer", srt.split("\n\n").map((c) => c.split("\n")[2]).slice(1, 3), ["Banks in the Gulf moved first because the", "regulator set a clear date for every bank."]);
eq("cues follow on without gaps", srt.split("\n\n")[1].split("\n")[1], "00:00:02,000 --> 00:00:05,200");
eq("cue count", (srt.match(/ --> /g) ?? []).length, 4);
eq("last cue ends at the spoken length", srt.trim().split("\n").slice(-2)[0], "00:00:08,400 --> 00:00:11,200");
eq("short line still shows for a second", scriptSrt({ hook: "Hi." }), "1\n00:00:00,000 --> 00:00:01,000\nHi.\n");
eq("nothing said, no file", scriptSrt({ hook: "", beats: [{ say: "" }], close: "" }), "");
eq("hours in the time", scriptSrt({ hook: "a ".repeat(9001) }).includes("01:00:00,"), true);
eq("file stem", [fileStem("Settlement in 38 seconds!"), fileStem("")], ["settlement-in-38-seconds", "post-video"]);

// The migration matches the code.
const sql = readFileSync(new URL("../db/029_post_video.sql", import.meta.url), "utf8");
eq("bucket name in 029", sql.includes(`'${VIDEO_BUCKET}', '${VIDEO_BUCKET}', false, ${VIDEO_MAX_BYTES}`), true);
eq("029 allows the three types", ["video/webm", "video/mp4", "video/quicktime"].every((t) => sql.includes(`'${t}'`)), true);
eq("029 has four policies", (sql.match(/create policy post_videos_[ridu] /g) ?? []).length, 4);
eq("029 is re-runnable", sql.includes("add column if not exists video_path") && sql.includes("on conflict (id) do update") && (sql.match(/drop policy if exists/g) ?? []).length === 4, true);

console.log(fails ? `\n${fails} failed` : "\nAll video checks passed");
process.exit(fails ? 1 : 0);
