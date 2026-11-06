"use client";
import { useEffect, useRef, useState } from "react";
import { Video, Upload, Download, Captions, Square, RotateCcw, Pause, Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useToast, haptic } from "@/components/toaster";
import { VIDEO_BUCKET, MAX_RECORD_SECONDS, videoPath, videoTypeOf, uploadProblem, baseType, pickRecorderType, mediaErrorText, clampTrim, timeAt, pct, isWhole, nudge,
  fmtClock, prompterOffset, spokenSeconds, WORDS_PER_SECOND, spokenParts, scriptSrt, fileStem, type Trim, type ScriptLike } from "@/lib/video";

// I6: a video recorded or uploaded inside Prax lives in the private "post-videos" bucket (db/029), under
// <workspace>/<post>/. The page only ever holds a short-lived signed link. Prax never posts it: the person downloads it.

/** A signed link to a stored video, renewed when the path changes; null while loading or when there is none. */
export function usePostVideo(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path) return;
    supabase().storage.from(VIDEO_BUCKET).createSignedUrl(path, 3600).then(({ data }: { data: { signedUrl: string } | null }) => { if (live) setUrl(data?.signedUrl ?? null); });
    return () => { live = false; };
  }, [path]);
  return url;
}

/** Uploads with a progress callback (supabase-js has none), through the Storage REST endpoint and the user's own session. */
function uploadWithProgress(path: string, body: Blob, type: string, onProgress: (share: number) => void): Promise<string | null> {
  return supabase().auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => new Promise<string | null>((done) => {
    const token = data.session?.access_token;
    if (!token) { done("You are signed out. Sign in again, then save the video."); return; }
    const x = new XMLHttpRequest();
    x.open("POST", `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}/${path}`);
    x.setRequestHeader("authorization", `Bearer ${token}`);
    x.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
    x.setRequestHeader("content-type", type);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("cache-control", "3600");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      if (x.status < 300) { onProgress(1); done(null); return; }
      let msg = "";
      try { const j = JSON.parse(x.responseText); msg = j.message || j.error || ""; } catch {}
      done(x.status === 413 || /too large|exceeded/i.test(msg) ? "The video is larger than the storage limit allows." : `The video was not saved: ${msg || `error ${x.status}`}`);
    };
    x.onerror = () => done("The upload stopped. Check the connection and try again.");
    x.send(body);
  }));
}

/** Uploads the video for the post, points the post at it and removes the video it replaces. */
async function storePostVideo(wsId: string, postId: string, body: Blob, type: string, oldPath: string, onProgress: (s: number) => void): Promise<{ path: string } | { error: string }> {
  const path = videoPath(wsId, postId, type);
  const upErr = await uploadWithProgress(path, body, baseType(type), onProgress);
  if (upErr) return { error: upErr };
  const { error } = await supabase().from("posts").update({ video_path: path }).eq("id", postId);
  if (error) { await supabase().storage.from(VIDEO_BUCKET).remove([path]); return { error: error.message }; }
  if (oldPath && oldPath !== path) await supabase().storage.from(VIDEO_BUCKET).remove([oldPath]);
  return { path };
}

/** Takes the video off the post with an Undo: the stored file is deleted only once the Undo window has passed. */
async function removePostVideo(postId: string, path: string): Promise<{ error: string } | { undo: () => Promise<void> }> {
  const { error } = await supabase().from("posts").update({ video_path: "" }).eq("id", postId);
  if (error) return { error: error.message };
  let undone = false;
  const t = setTimeout(() => { if (!undone && path) supabase().storage.from(VIDEO_BUCKET).remove([path]); }, 6000);
  return { undo: async () => { undone = true; clearTimeout(t); await supabase().from("posts").update({ video_path: path }).eq("id", postId); } };
}

/** Re-records the part between the trim handles: the take plays once, drawn to a canvas, with its sound routed to the recorder. */
async function cutClip(src: string, mime: string, t: Trim, onProgress: (s: number) => void): Promise<Blob> {
  const v = document.createElement("video");
  v.src = src; v.playsInline = true; v.preload = "auto";
  await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error("load")); });
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth || 1280; canvas.height = v.videoHeight || 720;
  const g = canvas.getContext("2d")!;
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  ac.createMediaElementSource(v).connect(dest);
  const rec = new MediaRecorder(new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((ok) => { rec.onstop = () => ok(new Blob(chunks, { type: baseType(mime) })); });
  v.currentTime = t.start;
  await new Promise<void>((ok) => { v.onseeked = () => ok(); });
  await ac.resume();
  rec.start(1000);
  await v.play();
  await new Promise<void>((ok) => {
    const draw = () => {
      g.drawImage(v, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(1, (v.currentTime - t.start) / Math.max(0.1, t.end - t.start)));
      if (v.currentTime >= t.end || v.ended) { v.pause(); ok(); } else requestAnimationFrame(draw);
    };
    draw();
  });
  rec.stop();
  const out = await done;
  ac.close(); v.removeAttribute("src"); v.load();
  return out;
}

const download = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); };

type Mode = "idle" | "asking" | "live" | "countdown" | "recording" | "review" | "trimming" | "uploading";
type Take = { url: string; blob: Blob; mime: string; duration: number };

/** Record (camera and microphone, with a teleprompter) or upload the post's video, then keep it with the post. */
export function VideoPanel({ wsId, postId, ensurePost, path, setPath, script, title, editable }: {
  wsId: string; postId: string | null; ensurePost: () => Promise<string | null>; path: string; setPath: (p: string) => void;
  script: ScriptLike; title: string; editable: boolean;
}) {
  const toast = useToast();
  const signed = usePostVideo(path);
  const [canRecord, setCanRecord] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [err, setErr] = useState("");
  const [take, setTake] = useState<Take | null>(null);
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 });
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(4);
  const [paused, setPaused] = useState(false);
  const [head, setHead] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const review = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const prompterBox = useRef<HTMLDivElement>(null);
  const prompterText = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pausedRef = useRef(paused), speedRef = useRef(speed);
  const spokenRef = useRef(5);
  pausedRef.current = paused; speedRef.current = speed; spokenRef.current = spokenSeconds(script);
  const lines = spokenParts(script);
  const srt = scriptSrt(script);

  // Record only where MediaRecorder exists and can record a format we keep; elsewhere only Upload shows.
  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickRecorderType((t) => MediaRecorder.isTypeSupported(t)));
  }, []);
  const stopStream = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopStream(); if (rec.current?.state === "recording") rec.current.stop(); }, []);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);
  // The live preview shows the camera while the person gets ready, counts down and records.
  useEffect(() => {
    if ((mode === "live" || mode === "countdown" || mode === "recording") && live.current && stream.current && live.current.srcObject !== stream.current) {
      live.current.srcObject = stream.current; live.current.play().catch(() => {});
    }
  }, [mode]);
  // Countdown 3, 2, 1, then the recorder starts.
  useEffect(() => {
    if (mode !== "countdown") return;
    if (count === 0) { begin(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- begin reads refs only
  }, [mode, count]);
  // While recording: the timer, the automatic stop at 10 minutes and the teleprompter scroll (paused time does not count).
  useEffect(() => {
    if (mode !== "recording") return;
    const t0 = performance.now();
    let last = t0, scrolled = 0, raf = 0;
    const tick = (now: number) => {
      if (!pausedRef.current) scrolled += (now - last) / 1000;
      last = now;
      const box = prompterBox.current, txt = prompterText.current;
      if (box && txt) txt.style.transform = `translateY(${-prompterOffset(scrolled, speedRef.current, txt.scrollHeight - box.clientHeight / 2, spokenRef.current)}px)`;
      const s = (now - t0) / 1000;
      setElapsed(s);
      if (s >= MAX_RECORD_SECONDS) stop(); else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  async function record() {
    setErr(""); setMode("asking");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      if (prompterText.current) prompterText.current.style.transform = "";
      setPaused(false); setMode("live");
    } catch (e) { stopStream(); setErr(mediaErrorText((e as Error).name)); setMode("idle"); }
  }
  function begin() {
    const s = stream.current;
    const mime = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
    if (!s || !mime) { setErr("This browser cannot record here. Upload a video instead."); setMode("idle"); stopStream(); return; }
    const r = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    const t0 = performance.now();
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      const duration = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
      const blob = new Blob(chunks, { type: baseType(mime) });
      stopStream();
      setTake({ url: URL.createObjectURL(blob), blob, mime, duration });
      setTrim(clampTrim({ start: 0, end: duration }, duration)); setHead(0);
      setMode("review");
    };
    rec.current = r;
    r.start(1000);
    setElapsed(0); setMode("recording");
  }
  function stop() { if (rec.current?.state === "recording") rec.current.stop(); }
  function cancel() { stopStream(); setMode(take ? "review" : "idle"); }
  function retake() { setTake(null); record(); }
  function discard() { setTake(null); setMode("idle"); }

  async function keep(body: Blob, type: string) {
    const id = postId ?? (await ensurePost());
    if (!id) { setMode(take ? "review" : "idle"); return; }
    setProgress(0); setMode("uploading");
    const out = await storePostVideo(wsId, id, body, type, path, setProgress);
    if ("error" in out) { setErr(out.error); setMode(take ? "review" : "idle"); return; }
    setPath(out.path); setTake(null); setMode("idle"); haptic();
    toast("Video saved with the post");
  }
  async function saveTake() {
    if (!take) return;
    setErr("");
    if (isWhole(trim, take.duration)) { await keep(take.blob, take.mime); return; }
    setProgress(0); setMode("trimming");
    try { await keep(await cutClip(take.url, take.mime, trim, setProgress), take.mime); }
    catch { setErr("The trim did not work in this browser. Move the handles back to the ends to save the whole take."); setMode("review"); }
  }
  async function pickFile(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    const problem = uploadProblem(f);
    if (problem) { setErr(problem); return; }
    setErr("");
    await keep(f, videoTypeOf(f.name, f.type)!);
  }
  async function remove() {
    const was = path;
    setPath("");
    if (!postId || !was) return;
    const out = await removePostVideo(postId, was);
    if ("error" in out) { toast(out.error); setPath(was); return; }
    toast("Video removed", async () => { await out.undo(); setPath(was); });
  }
  async function downloadVideo() {
    const ext = path.split(".").pop() || "mp4";
    const { data } = await supabase().storage.from(VIDEO_BUCKET).createSignedUrl(path, 600, { download: `${fileStem(title)}.${ext}` });
    if (data?.signedUrl) window.location.assign(data.signedUrl); else toast("The video could not be fetched. Try again.");
  }
  function downloadSrt() {
    const u = URL.createObjectURL(new Blob([srt], { type: "application/x-subrip" }));
    download(u, `${fileStem(title)}.srt`);
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  // Trim handles: drag with a pointer, or arrows (Shift for a second), Home and End.
  const seek = (s: number) => { if (review.current) review.current.currentTime = s; setHead(s); };
  const drag = (which: "start" | "end") => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!take || !bar.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = bar.current.getBoundingClientRect();
    const move = (ev: PointerEvent) => { const next = clampTrim({ ...trim, [which]: timeAt(ev.clientX - rect.left, rect.width, take.duration) }, take.duration, which); setTrim(next); seek(next[which]); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const keys = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    if (!take) return;
    const next = nudge(trim, which, e.key, e.shiftKey, take.duration);
    if (!next) return;
    e.preventDefault(); setTrim(next); seek(next[which]);
  };
  const playClip = () => { const v = review.current; if (!v) return; v.currentTime = trim.start; v.play().catch(() => {}); };

  const busy = mode === "asking" || mode === "trimming" || mode === "uploading";
  const camera = mode === "live" || mode === "countdown" || mode === "recording";
  return (
    <div className="card flex flex-col gap-3.5 p-4" data-tour="video">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-[200px] flex-1"><b className="block text-title font-semibold">The video</b><span className="text-meta text-muted">{!editable ? "" : canRecord !== false ? "Record it here with the script on screen, or upload one. " : "Upload the recorded video. "}Prax keeps it with the post and never posts it.</span></span>
        {editable && canRecord !== null && (mode === "idle" || mode === "asking" || (mode === "uploading" && !take)) && <span className="flex flex-wrap gap-2">
          {canRecord && <button className="btn btn-primary" disabled={busy} onClick={record}><Video size={15} /> {mode === "asking" ? "Waiting for the camera" : path ? "Record again" : "Record"}</button>}
          <button className={canRecord ? "btn" : "btn btn-primary"} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} /> {path ? "Upload another" : "Upload"}</button>
          <input ref={fileRef} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(e) => pickFile(e.target.files?.[0])} />
        </span>}
      </div>

      {err && <p role="alert" className="m-0 rounded-xl border border-[#d64545] bg-white px-3.5 py-2.5 text-body text-ink">{err}</p>}
      {mode === "asking" && <p className="m-0 text-body text-muted">Your browser asks to use the camera and microphone. Choose Allow to continue.</p>}

      {camera && <>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#141414]">
          <video ref={live} muted playsInline aria-label="Camera preview" className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
          {lines.length > 0 && <div ref={prompterBox} className="absolute inset-x-0 top-0 h-[42%] overflow-hidden bg-[rgba(20,20,20,.72)] px-5 py-3" aria-label="Teleprompter">
            <div ref={prompterText} className="flex flex-col gap-3 text-title font-semibold leading-snug text-white will-change-transform">{lines.map((l, i) => <p key={i} className="m-0">{l}</p>)}</div>
          </div>}
          {mode === "countdown" && <div className="absolute inset-0 grid place-items-center bg-[rgba(20,20,20,.45)]" aria-live="assertive"><span className="num grid h-24 w-24 place-items-center rounded-full bg-white text-[48px] font-semibold text-[#141414]">{count}</span></div>}
          {mode === "recording" && <span className="num absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-lg bg-[#141414] px-2.5 py-1 text-meta font-semibold text-white" aria-live="polite"><span className="h-2 w-2 rounded-full bg-[#d64545]" />Recording {fmtClock(elapsed)}</span>}
        </div>
        {!lines.length && <p className="m-0 text-meta text-muted">The teleprompter shows the script once the Script step has lines to say.</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {mode === "recording" ? <button className="btn btn-primary" onClick={stop}><Square size={13} fill="currentColor" /> Stop</button>
            : <button className="btn btn-primary" disabled={mode === "countdown"} onClick={() => { setCount(3); setMode("countdown"); }}>{mode === "countdown" ? `Starting in ${count}` : "Start recording"}</button>}
          {mode !== "recording" && <button className="btn btn-ghost" onClick={cancel}>Cancel</button>}
          {lines.length > 0 && <label className="flex min-w-[220px] flex-1 items-center gap-2.5 text-meta text-muted"><span className="shrink-0 font-semibold text-ink">Prompter speed</span>
            <input type="range" min={1} max={10} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="min-w-0 flex-1 accent-[#d64545]" aria-valuetext={`${speed} of 10`} /><span className="num w-8 shrink-0 text-right">{speed}/10</span></label>}
          {mode === "recording" && lines.length > 0 && <button className="btn btn-ghost" onClick={() => setPaused((p) => !p)}>{paused ? <><Play size={14} /> Resume prompter</> : <><Pause size={14} /> Pause prompter</>}</button>}
        </div>
      </>}

      {(mode === "review" || mode === "trimming" || (mode === "uploading" && take)) && take && <>
        <video ref={review} src={take.url} controls playsInline className="aspect-video w-full rounded-xl bg-[#141414]" aria-label="The take"
          onTimeUpdate={(e) => { const v = e.currentTarget; setHead(v.currentTime); if (!v.paused && v.currentTime >= trim.end) v.pause(); }} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="label">Trim the start and end</span><span className="num text-meta text-muted">Clip {fmtClock(trim.end - trim.start, true)} of {fmtClock(take.duration, true)}</span></div>
          <div ref={bar} className="relative mx-3 h-11 touch-none select-none">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#e8e8e8]" />
            <div className="absolute top-1/2 h-2 -translate-y-1/2 bg-[#141414]" style={{ left: `${pct(trim.start, take.duration)}%`, right: `${100 - pct(trim.end, take.duration)}%` }} />
            <div className="pointer-events-none absolute inset-y-1 w-px bg-[#d64545]" style={{ left: `${pct(head, take.duration)}%` }} aria-hidden="true" />
            {(["start", "end"] as const).map((w) => (
              <button key={w} role="slider" aria-label={w === "start" ? "Start of the clip" : "End of the clip"} aria-valuemin={0} aria-valuemax={take.duration} aria-valuenow={trim[w]} aria-valuetext={fmtClock(trim[w], true)}
                disabled={mode !== "review"} onPointerDown={drag(w)} onKeyDown={keys(w)}
                className="group absolute top-0 grid h-11 w-8 -translate-x-1/2 cursor-ew-resize place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#d64545]" style={{ left: `${pct(trim[w], take.duration)}%` }}>
                <span className="h-7 w-2.5 rounded-[3px] bg-[#d64545] group-active:bg-[#9e1c1c]" /></button>))}
          </div>
          <div className="num flex justify-between text-meta text-muted"><span>In {fmtClock(trim.start, true)}</span><span>Out {fmtClock(trim.end, true)}</span></div>
        </div>
        {mode === "review" && <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={saveTake}>Save the video</button>
          <button className="btn" onClick={playClip}><Play size={14} /> Play the clip</button>
          <button className="btn" onClick={retake}><RotateCcw size={14} /> Retake</button>
          <button className="btn btn-ghost" onClick={discard}>Discard</button>
        </div>}
      </>}

      {(mode === "trimming" || mode === "uploading") && <div className="flex flex-col gap-1.5" aria-live="polite">
        <div className="flex justify-between text-meta"><span className="font-semibold">{mode === "trimming" ? "Cutting the clip" : "Saving the video"}</span><span className="num text-muted">{Math.round(progress * 100)}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e8e8e8]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={mode === "trimming" ? "Cutting the clip" : "Saving the video"}>
          <div className="h-full rounded-full bg-[#141414]" style={{ width: `${progress * 100}%` }} /></div>
        {mode === "trimming" && <span className="text-meta text-muted">The clip plays through once to cut it. Keep this tab open.</span>}
      </div>}

      {path && !camera && mode !== "review" && mode !== "trimming" && <>
        {signed ? <video src={signed} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-[#141414]" aria-label="Saved video" />
          : <div className="aspect-video w-full animate-pulse rounded-xl bg-surface-2" aria-label="Loading the video" />}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={downloadVideo}><Download size={14} /> Download video</button>
          {srt && <button className="btn" onClick={downloadSrt}><Captions size={14} /> Download captions (.srt)</button>}
          {editable && <button className="btn btn-ghost" disabled={busy} onClick={remove}>Remove</button>}
          <span className="basis-full text-meta text-muted">Saved with the post. Upload it on LinkedIn yourself{srt ? ", with the captions file if you want them as subtitles" : ""}.</span>
        </div>
      </>}

      {!path && !take && !camera && mode === "idle" && srt && <div className="flex flex-wrap items-center gap-2"><button className="btn" onClick={downloadSrt}><Captions size={14} /> Download captions (.srt)</button><span className="text-meta text-muted">Timed from the script, about {fmtClock(lines.join(" ").split(" ").length / WORDS_PER_SECOND)} long.</span></div>}
      {!editable && !path && <p className="m-0 text-body text-muted">No video yet. An editor records or uploads it.</p>}
    </div>
  );
}
